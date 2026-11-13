/**
 * Phase 75 plan 24 (P75-E, D-10, D-12 Tier 2): the local-only parity sweep. For every real Steam
 * file on this machine it calls each wrapper twice, once with the `ts` flag (the @node-steam/vdf /
 * parseKv1 / steam-shortcut-editor oracle on the real fs) and once with the `rust` flag (the
 * wrapper's Rust branch, whose `requestRustInvoke` is adapted to `runSteamfilesCliSync`), and
 * deep-compares the two results.
 *
 * Inputs: every ACF in every Steam library and bridge/Steam bottle, libraryfolders.vdf (through
 * getSteamLibraries), registry.vdf, every userdata localconfig.vdf beta key, every installscript.vdf
 * under the libraries and bottles, any cached Valve manifest.vdf, and every userdata shortcuts.vdf
 * (round-tripped byte-identically through the Rust codec with the non-writing
 * `steamfiles_shortcuts_roundtrip` op, and its validity compared).
 *
 * Profile rule (gamelib-conventions two-profile rule): THIS process is a named real-profile tool.
 * Its whole purpose is the operator's real files, so it inherits the real HOME and reads them with
 * explicit paths. Every Rust child is spawned by `runSteamfilesCliSync`, which gives each spawn a
 * FRESH `createFakeHomeProfile()` and passes explicit paths only, so no child ever reads a profile.
 *
 * Read-only: no apply/finalize op is called, nothing is written outside the OS temp dirs. No
 * network. Output is redacted: the sha1 of the relative path plus the basename, JSON diffs with
 * every known root replaced by `<ROOT>`; never an absolute path, a user name or an account id.
 *
 * Exit: 0 no unexplained diff, 1 unexplained diff (or a shortcuts round-trip that is not
 * identical), 3 no inputs (zero inputs, or zero ACFs, or zero shortcuts files). A vacuous run fails.
 */
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync
} from 'node:fs'
import { homedir, tmpdir, userInfo } from 'node:os'
import { basename, join, relative } from 'node:path'

import { runSteamfilesCliSync } from './gamelibSteamfilesCli'

// ---------------------------------------------------------------------------
// Pure part (unit-tested)
// ---------------------------------------------------------------------------

/** The closed list of explained divergence classes (mirrors the golden overrides' notes). */
const DIFF_CLASSES = [
  'numeric-coercion',
  'decoded-backslash',
  'case-insensitive-key',
  'legacy-libraryfolders',
  'integer-key-order'
] as const
type DiffClass = (typeof DIFF_CLASSES)[number]

interface Leaf {
  path: string
  a: unknown
  b: unknown
}

/** Maps become sorted `{__map}` entry lists so InstalledMap results compare structurally. */
function normalise(v: unknown): unknown {
  if (v instanceof Map) {
    return {
      __map: [...v.entries()]
        .map(([k, val]) => [String(k), normalise(val)] as const)
        .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
    }
  }
  if (Array.isArray(v)) return v.map(normalise)
  if (v !== null && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const k of Object.keys(v).sort()) {
      const val = (v as Record<string, unknown>)[k]
      if (val !== undefined) o[k] = normalise(val)
    }
    return o
  }
  return v
}

/** Every differing leaf between two normalised values. */
function diffLeaves(a: unknown, b: unknown, path = ''): Leaf[] {
  if (a === b) return []
  const aObj = a !== null && typeof a === 'object'
  const bObj = b !== null && typeof b === 'object'
  if (aObj && bObj && Array.isArray(a) === Array.isArray(b)) {
    const out: Leaf[] = []
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of keys) {
      out.push(
        ...diffLeaves(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k],
          path === '' ? k : `${path}.${k}`
        )
      )
    }
    return out
  }
  return [{ path, a, b }]
}

function classifyLeaf(category: string, leaf: Leaf): DiffClass | null {
  const { a, b } = leaf
  if (
    (typeof a === 'number' && typeof b === 'string' && String(a) === b) ||
    (typeof a === 'string' && typeof b === 'number' && a === String(b))
  ) {
    return 'numeric-coercion'
  }
  if (
    typeof a === 'string' &&
    typeof b === 'string' &&
    a.includes('\\\\') &&
    a.replaceAll('\\\\', '\\') === b
  ) {
    return 'decoded-backslash'
  }
  if (category === 'registry' && typeof a === 'number' && a === 0 && b) {
    return 'case-insensitive-key'
  }
  if (category === 'libraries' && a === undefined)
    return 'legacy-libraryfolders'
  void leaf.path
  return null
}

/**
 * The named class of the whole diff, or null when ANY leaf is unexplained. Equal values return
 * `equal`. Classes of a mixed diff join with `+` in sorted order.
 */
export function classifyDiff(
  category: string,
  tsValue: unknown,
  rustValue: unknown
): string | null {
  const leaves = diffLeaves(normalise(tsValue), normalise(rustValue))
  if (leaves.length === 0) return 'equal'
  // JS objects enumerate integer-like keys ascending, so the oracle lists InstalledDepots by
  // numeric depot id; Rust keeps the file's own order. Same set of depots, different order.
  if (
    category === 'readAcfInstalledDepots' &&
    canonical(normalise(tsValue)) === canonical(normalise(rustValue))
  ) {
    return 'integer-key-order'
  }
  const classes = new Set<string>()
  for (const leaf of leaves) {
    const c = classifyLeaf(category, leaf)
    if (c === null) return null
    classes.add(c)
  }
  return [...classes].sort().join('+')
}

/** Order-insensitive form: every array sorted by its elements' JSON. */
function canonical(v: unknown): string {
  const c = (x: unknown): unknown => {
    if (Array.isArray(x)) {
      return x.map(c).sort((p, q) => {
        const a = JSON.stringify(p)
        const b = JSON.stringify(q)
        return a < b ? -1 : a > b ? 1 : 0
      })
    }
    if (x !== null && typeof x === 'object') {
      return Object.fromEntries(
        Object.entries(x as Record<string, unknown>).map(([k, val]) => [
          k,
          c(val)
        ])
      )
    }
    return x
  }
  return JSON.stringify(c(v))
}

/** sha1 of a relative path, first 12 hex chars. */
export function hashRel(rel: string): string {
  return createHash('sha1').update(rel).digest('hex').slice(0, 12)
}

/** Replaces every known root with `<ROOT>` (longest first) and account-id path segments. */
export function redact(text: string, roots: readonly string[]): string {
  let out = text
  const sorted = [...new Set(roots)]
    .filter((r) => r.length > 1)
    .sort((x, y) => y.length - x.length)
  for (const r of sorted) out = out.split(r).join('<ROOT>')
  // JSON-escaped backslashes (Windows-style roots) are not a concern on this host.
  return out
    .replace(/userdata[\\/]+\d+/g, 'userdata/<ACCT>')
    .replace(/\/(Users|home)\/[^/\s"']+/g, '/<HOME>')
}

export interface CategoryReport {
  inputs: number
  equal: number
  explained: Record<string, number>
  unexplained: number
}

export interface SweepReport {
  categories: Record<string, CategoryReport>
  roundtripNotIdentical: number
}

export function emptyCategory(): CategoryReport {
  return { inputs: 0, equal: 0, explained: {}, unexplained: 0 }
}

export function recordOutcome(
  rep: CategoryReport,
  cls: string | null
): CategoryReport {
  rep.inputs += 1
  if (cls === null) rep.unexplained += 1
  else if (cls === 'equal') rep.equal += 1
  else rep.explained[cls] = (rep.explained[cls] ?? 0) + 1
  return rep
}

/** 3 = no inputs (vacuous); 1 = unexplained diff; 0 clean. */
export function decideExit(report: SweepReport): 0 | 1 | 3 {
  const cats = Object.entries(report.categories)
  const total = cats.reduce((n, [, c]) => n + c.inputs, 0)
  const acfs = report.categories.acfInstalldir?.inputs ?? 0
  const shortcuts = report.categories.shortcutsRoundtrip?.inputs ?? 0
  if (total === 0 || acfs === 0 || shortcuts === 0) return 3
  if (
    report.roundtripNotIdentical > 0 ||
    cats.some(([, c]) => c.unexplained > 0)
  ) {
    return 1
  }
  return 0
}

// ---------------------------------------------------------------------------
// Impure driver
// ---------------------------------------------------------------------------

interface SteamDir {
  label: string
  kind: 'native' | 'bottle' | 'bridge'
  root: string
  steamappsDir: string
}

const STEAMAPPS_IN_BOTTLE = join(
  'drive_c',
  'Program Files (x86)',
  'Steam',
  'steamapps'
)

function listDir(p: string): string[] {
  try {
    return readdirSync(p)
  } catch {
    return []
  }
}

function findFiles(
  root: string,
  match: (name: string) => boolean,
  maxDepth: number
): string[] {
  const out: string[] = []
  const walk = (dir: string, depth: number): void => {
    for (const name of listDir(dir)) {
      const p = join(dir, name)
      let st
      try {
        st = statSync(p)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        if (depth < maxDepth) walk(p, depth + 1)
      } else if (match(name)) {
        out.push(p)
      }
    }
  }
  walk(root, 0)
  return out
}

type Run = () => unknown

async function viaFlag(
  flag: 'ts' | 'rust',
  run: Run
): Promise<{ value: unknown } | { threw: string }> {
  const prevT = process.env.GAMELIB_STEAMFILES_TEXT
  const prevS = process.env.GAMELIB_STEAMFILES_SHORTCUTS
  process.env.GAMELIB_STEAMFILES_TEXT = flag
  process.env.GAMELIB_STEAMFILES_SHORTCUTS = flag
  try {
    return { value: await run() }
  } catch (e) {
    return { threw: e instanceof Error ? e.constructor.name : 'throw' }
  } finally {
    if (prevT === undefined) delete process.env.GAMELIB_STEAMFILES_TEXT
    else process.env.GAMELIB_STEAMFILES_TEXT = prevT
    if (prevS === undefined) delete process.env.GAMELIB_STEAMFILES_SHORTCUTS
    else process.env.GAMELIB_STEAMFILES_SHORTCUTS = prevS
  }
}

async function runSweep(): Promise<{ report: SweepReport; lines: string[] }> {
  // Lazy: keep the pure half importable under Jest without loading the backend.
  const [
    { getSteamLibraries },
    installedMap,
    { readAcfState },
    { readAppManifestFlags },
    { readAcfInstalldir },
    { readAcfInstalledDepots },
    { readAcfUpdateFieldsFromDir },
    betaBranch,
    { readMacRunningAppId },
    { readInstallScript },
    valve,
    { shortcutsValidityFromSummary },
    { parseBuffer }
  ] = await Promise.all([
    import('../src/backend/utils'),
    import('../src/backend/storeManagers/steam/library/installedMap'),
    import('../src/backend/storeManagers/steam/library/acfState'),
    import('../src/backend/storeManagers/steam/library/manifestFlags'),
    import('../src/backend/storeManagers/steam/acfInstalldir'),
    import('../src/backend/storeManagers/steam/acfInstalledDepots'),
    import('../src/backend/storeManagers/steam/library/acfUpdateState'),
    import('../src/backend/storeManagers/steam/depot/betaBranch'),
    import('../src/backend/storeManagers/steam/library/runningPoll'),
    import('../src/backend/storeManagers/steam/bridge/sharedRedists'),
    import('../src/backend/storeManagers/steam/bridge/drm/valveClient'),
    import('../src/backend/shortcuts/nonesteamgame/nonesteamgame'),
    import('steam-shortcut-editor')
  ])

  const home = homedir()
  // The backend logger needs a writer (`invokeSteamFiles` logs each call). Its log path derives
  // from HOME at construction, so build it under a throwaway HOME: the real app log is untouched.
  const logHome = mkdtempSync(join(tmpdir(), 'steamfiles-sweep-log-'))
  const realHome = process.env.HOME
  process.env.HOME = logHome
  try {
    ;(await import('../src/backend/logger')).initHeadless()
  } finally {
    if (realHome === undefined) delete process.env.HOME
    else process.env.HOME = realHome
  }
  const steamRoot = join(home, 'Library', 'Application Support', 'Steam')
  const bottlesRoot = join(
    home,
    'Library',
    'Application Support',
    'CrossOver',
    'Bottles'
  )
  const roots: string[] = [home, steamRoot, bottlesRoot, userInfo().username]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rust: any = {
    requestRustInvoke: (channel: string, args: unknown[]) => {
      try {
        return Promise.resolve(
          runSteamfilesCliSync(
            channel as 'steamfiles_read_acf',
            args[0] as { path: string }
          )
        )
      } catch (e) {
        if (process.env.STEAMFILES_SWEEP_DEBUG) console.error(String(e))
        throw e
      }
    }
  }
  const paths = { userHome: home }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseDeps: any = {
    ...rust,
    paths,
    config: { getSettings: () => ({ defaultSteamPath: steamRoot }) }
  }

  const report: SweepReport = { categories: {}, roundtripNotIdentical: 0 }
  const lines: string[] = []
  const cat = (name: string): CategoryReport =>
    (report.categories[name] ??= emptyCategory())
  const unexplainedLines: string[] = []

  const compare = async (
    category: string,
    rel: string,
    tsRun: Run,
    rustRun: Run
  ): Promise<void> => {
    const t = await viaFlag('ts', tsRun)
    const r = await viaFlag('rust', rustRun)
    const tsV = 'threw' in t ? { threw: t.threw } : t.value
    const rsV = 'threw' in r ? { threw: r.threw } : r.value
    const cls = classifyDiff(category, tsV, rsV)
    recordOutcome(cat(category), cls)
    if (cls === null) {
      unexplainedLines.push(
        `UNEXPLAINED ${category} ${hashRel(rel)} ${basename(rel)}\n  ${redact(
          JSON.stringify({ ts: normalise(tsV), rust: normalise(rsV) }),
          roots
        )}`
      )
    }
  }
  const both = (run: Run): [Run, Run] => [run, run]
  const cmp = (category: string, rel: string, run: Run) =>
    compare(category, rel, ...both(run))

  // Native libraries (through the TS oracle's own libraryfolders reader) and bottles.
  const libs = (await viaFlag('ts', () => getSteamLibraries(baseDeps))) as {
    value: string[]
  }
  const dirs: SteamDir[] = []
  libs.value.forEach((lib, i) => {
    roots.push(lib)
    const sd = join(lib, 'steamapps')
    if (existsSync(sd)) {
      dirs.push({
        label: `lib${i}`,
        kind: 'native',
        root: lib,
        steamappsDir: sd
      })
    }
  })
  const bottleNames = listDir(bottlesRoot).filter((n) =>
    n.startsWith('GameLib')
  )
  const bridgeNames: string[] = []
  for (const name of bottleNames) {
    const sd = join(bottlesRoot, name, STEAMAPPS_IN_BOTTLE)
    if (!existsSync(sd)) continue
    const isBridge = name.startsWith('GameLibSteamBridge')
    if (isBridge) bridgeNames.push(name)
    dirs.push({
      label: name,
      kind: isBridge ? 'bridge' : 'bottle',
      root: join(bottlesRoot, name),
      steamappsDir: sd
    })
  }
  const dirLabelRel = (d: SteamDir, file: string): string =>
    `${d.label}/${relative(d.steamappsDir, file)}`

  // libraryfolders.vdf + library-level maps.
  await cmp('libraries', 'steamapps/libraryfolders.vdf', () =>
    getSteamLibraries(baseDeps)
  )
  await cmp('buildInstalledMap', 'native', () =>
    installedMap.buildInstalledMap(baseDeps)
  )
  await cmp('buildBridgeInstalledMap', 'bridge', () =>
    installedMap.buildBridgeInstalledMap(paths, rust)
  )
  for (const d of dirs.filter((x) => x.kind !== 'native')) {
    if (d.kind === 'bridge') continue
    await cmp('buildBottleInstalledMap', d.label, () =>
      installedMap.buildBottleInstalledMap({
        ...baseDeps,
        steamBottle: {
          getSteamBottleSettings: () => ({ wineCrossoverBottle: d.label })
        }
      })
    )
  }

  // registry.vdf
  const registry = join(steamRoot, 'registry.vdf')
  if (existsSync(registry)) {
    await cmp('registry', 'registry.vdf', () => readMacRunningAppId(baseDeps))
  }

  // Per-ACF wrappers.
  const seenAppIds = new Set<string>()
  for (const d of dirs) {
    for (const name of listDir(d.steamappsDir)) {
      const m = /^appmanifest_(\d+)\.acf$/.exec(name)
      if (!m) continue
      const appId = m[1] ?? ''
      seenAppIds.add(appId)
      const rel = dirLabelRel(d, join(d.steamappsDir, name))
      await cmp('acfInstalldir', rel, () =>
        readAcfInstalldir(rust, d.steamappsDir, appId)
      )
      await cmp('readAppManifestFlags', rel, () =>
        readAppManifestFlags(rust, d.steamappsDir, appId)
      )
      await cmp('readAcfInstalledDepots', rel, () =>
        readAcfInstalledDepots(rust, d.steamappsDir, appId)
      )
      await cmp('readAcfUpdateFieldsFromDir', rel, () =>
        readAcfUpdateFieldsFromDir(rust, d.steamappsDir, appId)
      )
      await cmp('readAcfBetaKey', rel, () =>
        betaBranch.readAcfBetaKey(rust, d.steamappsDir, appId)
      )
      if (d.kind === 'native') {
        await cmp('readAcfState', rel, () =>
          readAcfState(baseDeps, appId, 'native')
        )
      } else if (d.kind === 'bridge') {
        await cmp('readAcfState', rel, () =>
          readAcfState(baseDeps, appId, 'bridge')
        )
      }
    }
  }

  // localconfig.vdf beta keys.
  const userdata = join(steamRoot, 'userdata')
  let accounts = 0
  for (const acct of listDir(userdata)) {
    const lc = join(userdata, acct, 'config', 'localconfig.vdf')
    if (!existsSync(lc)) continue
    accounts += 1
    const text = readFileSync(lc, 'utf8')
    const ids = new Set(seenAppIds)
    for (const m of text.matchAll(/^\s*"(\d+)"\s+"[0-9a-fA-F]*"\s*$/gm)) {
      ids.add(m[1] ?? '')
    }
    for (const id of ids) {
      await cmp(
        'readLocalConfigBetaKey',
        `userdata/<ACCT>/config/localconfig.vdf#${id}`,
        () => betaBranch.readLocalConfigBetaKey(rust, lc, id)
      )
    }
  }

  // installscript.vdf under the libraries and bottles.
  let installScripts = 0
  for (const d of dirs) {
    const common = join(d.steamappsDir, 'common')
    for (const f of findFiles(
      common,
      (n) => /^installscript\.vdf$/i.test(n),
      5
    )) {
      installScripts += 1
      await cmp('readInstallScript', dirLabelRel(d, f), () =>
        readInstallScript(rust, f)
      )
    }
  }

  // Cached Valve manifests (the downloaded manifest.vdf is a run temp file; 0 is normal).
  const drmCache = join(
    home,
    'Library',
    'Application Support',
    'gamelib',
    'steam-bridge',
    'drm'
  )
  let valveManifests = 0
  for (const f of findFiles(drmCache, (n) => /manifest.*\.vdf$/i.test(n), 4)) {
    valveManifests += 1
    await compare(
      'parseValveClientManifest',
      `drm/${basename(f)}`,
      () => valve.parseValveClientManifest(readFileSync(f, 'utf8')),
      () => valve.parseValveClientManifestFile(rust, f)
    )
  }

  // shortcuts.vdf: byte round trip + validity.
  for (const acct of listDir(userdata)) {
    const sc = join(userdata, acct, 'config', 'shortcuts.vdf')
    if (!existsSync(sc)) continue
    const rel = 'userdata/<ACCT>/config/shortcuts.vdf'
    const rt = runSteamfilesCliSync(
      'steamfiles_shortcuts_roundtrip' as never,
      {
        path: sc
      } as never
    ) as unknown as {
      exists: boolean
      parsed: boolean
      identical: boolean
      len: number
    }
    recordOutcome(cat('shortcutsRoundtrip'), rt.identical ? 'equal' : null)
    if (!rt.identical) {
      report.roundtripNotIdentical += 1
      unexplainedLines.push(
        `UNEXPLAINED shortcutsRoundtrip ${hashRel(rel)} ${basename(rel)}\n  ${JSON.stringify(rt)}`
      )
    }
    lines.push(
      `shortcuts round-trip: exists=${rt.exists} parsed=${rt.parsed} identical=${rt.identical} len=${rt.len}`
    )
    await compare(
      'shortcutsValidity',
      rel,
      () => {
        const content = parseBuffer(readFileSync(sc), {
          autoConvertArrays: true,
          autoConvertBooleans: true,
          dateProperties: ['LastPlayTime']
        }) as { shortcuts?: unknown }
        // Mirror of nonesteamgame.checkIfShortcutObjectIsValid (module-private).
        const res = { success: false, errors: [] as string[] }
        if (!('shortcuts' in content)) {
          res.errors.push('Could not find entry "shortcuts"!')
        } else if (!Array.isArray(content.shortcuts)) {
          res.errors.push('Entry "shortcuts" is not an array!')
        } else {
          res.success = true
          for (const entry of content.shortcuts as Record<string, unknown>[]) {
            for (const key of ['AppName', 'Exe', 'LaunchOptions']) {
              if (
                !Object.keys(entry).some(
                  (k) => k.toLowerCase() === key.toLowerCase()
                )
              ) {
                res.errors.push(
                  `One of the game entries is missing the ${key} parameter!`
                )
                res.success = false
              }
            }
          }
        }
        return res
      },
      () =>
        shortcutsValidityFromSummary(
          runSteamfilesCliSync('steamfiles_shortcuts_read', { path: sc })
        )
    )
  }

  lines.unshift(
    `corpus: libraries=${libs.value.length} steamappsDirs=${dirs.length} bridgeBottles=${bridgeNames.length} acfIds=${seenAppIds.size} localconfigAccounts=${accounts} installscripts=${installScripts} valveManifests=${valveManifests}`
  )
  for (const [name, c] of Object.entries(report.categories)) {
    const ex = Object.entries(c.explained)
      .map(([k, n]) => `${k}=${n}`)
      .join(',')
    lines.push(
      `${name}: inputs=${c.inputs} equal=${c.equal} explained=${ex === '' ? '0' : ex} unexplained=${c.unexplained}`
    )
  }
  lines.push(...unexplainedLines)
  try {
    rmSync(logHome, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
  return { report, lines: lines.map((l) => redact(l, roots)) }
}

async function main(): Promise<void> {
  const { report, lines } = await runSweep()
  const code = decideExit(report)
  console.log(lines.join('\n'))
  console.log(`exit ${code}`)
  if (code === 3) {
    process.exitCode = 3
  } else {
    process.exitCode = code
  }
}

// JEST_WORKER_ID tells "imported under test" from "run as the entrypoint" (bridgeCensus idiom).
if (!process.env.JEST_WORKER_ID) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'sweep failed')
    process.exit(1)
  })
}
