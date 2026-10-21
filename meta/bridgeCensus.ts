/**
 * Phase 51 Plan 18 (D-51-15): the closing measurement -- re-runs the
 * research session's one-shot owned-Windows-library import census against
 * whatever coverage the build actually SHIPS, on demand, forever. No
 * threshold is pre-set: the tool reports N of M titles routed to the
 * bridge, with every miss classified.
 *
 * Two halves, same split as `captureShellScrollback.ts`/
 * `extractProtonInventory.ts`:
 *
 *  - The CLASSIFIER (`classifyCensusTitle`, `summarizeCensus`) is pure and
 *    unit-tested against fixture inputs -- no filesystem, no objdump spawn.
 *    It composes the SAME pure modules the live bridge uses
 *    (`importParse.ts`, `interfaceVersions.ts`, `shimCoverage.ts`), per the
 *    plan's `evaluateShimCoverage with the shipped sets` key link, so a
 *    census result can never silently diverge from what install/launch
 *    would actually decide.
 *  - The CLI DRIVER (`findBridgeBottles` down to `main`) is operator-run,
 *    read-only, and NEVER unit-tested with a real filesystem/objdump --
 *    exercised live via `pnpm bridge-census` (this plan's second
 *    `<verify>` line). It enumerates `appmanifest_*.acf` across the
 *    shared and per-game bridge bottles, finds each title's own exe,
 *    objdumps it, and classifies.
 *
 * T-51-39 (mitigate, low): a row ever printed or returned contains ONLY
 * appid/name/installdir/arch/class/detail -- never a full filesystem path
 * under the user's HOME, and never any other ACF field (no account data).
 * `CensusTitleInput.installdir` is always the bare ACF `installdir` value
 * (a folder NAME, e.g. "Avernum 6"), never the resolved absolute install
 * path -- the absolute path is used internally to find/objdump the exe and
 * is never threaded into a `CensusRow`.
 *
 * Declared real-profile arm (CLAUDE.md two-profile rule, gamelib-conventions
 * SKILL.md "Fake-HOME isolation"): this tool's entire purpose is reading
 * the OPERATOR'S REAL, populated CrossOver bottles -- an isolated fake HOME
 * would have nothing to census. The two `spawnSync('/usr/bin/objdump', ...)`
 * calls below are argv-form only (T-24-06/ASVS V5 convention, mirrored from
 * `importScan.ts`) and never pass an `env` option at all, so this file
 * cannot trip `fakeHomeIsolation.test.ts` (which only flags a spawn site
 * that hand-rolls one of the eight home/config/state env keys) -- it is
 * declared here anyway because the convention asks every real-profile arm
 * to name itself in its own docblock, not just the ones the gate happens to
 * reach.
 *
 * Zero backend imports by design, same discipline `importParse.ts`/
 * `interfaceVersions.ts`/`shimCoverage.ts` already established (D-51-15's
 * own doc comment on `importParse.ts`): only `node:*` builtins, the three
 * pure bridge modules (by relative path, not a `backend/...` alias), and
 * `@node-steam/vdf` (a plain npm dependency, not a backend module). This
 * keeps `pnpm bridge-census` (`node meta/runTs.cjs --bundle --platform=node
 * --target=node21 meta/bridgeCensus.ts`) bundleable standalone.
 *
 * Repo-relative reads use `process.cwd()`, NOT `__dirname` -- `runTs.cjs`
 * bundles this file into a private `mkdtempSync` tmpdir and runs it from
 * there, so `__dirname` resolves outside the repo (the same `captureShell
 * Scrollback.ts`/`checkBuildBinMirror.ts`/`genI18nGateScope.ts` convention).
 * `pnpm` runs package scripts with the repo root as cwd.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { parse as parseVdf } from '@node-steam/vdf'

import {
  parseSteamApiImportTable,
  type ImportTableResult
} from '../src/backend/storeManagers/steam/bridge/importParse'
import {
  readInterfaceVersionStrings,
  resolveRequiredInterfaceVersions,
  usesRuntimeInterfaceLookup
} from '../src/backend/storeManagers/steam/bridge/interfaceVersions'
import {
  evaluateShimCoverage,
  SHIM64_EXPORTED_SYMBOLS
} from '../src/backend/storeManagers/steam/bridge/shimCoverage'

// ---------------------------------------------------------------------------
// Pure classifier
// ---------------------------------------------------------------------------

export type CensusClass =
  | 'bridge'
  | 'win64-no-shim'
  | 'missing-symbols'
  | 'unknown-version'
  | 'known-bad'
  | 'no-binary'

/** T-51-39: the ONLY fields a row may ever carry -- never a path, never an
 * account field. */
export interface CensusRow {
  appid: string
  name: string
  installdir: string
  arch: 'x86' | 'x64' | 'none'
  class: CensusClass
  detail: string
}

export interface CensusTitleInput {
  appid: string
  name: string
  installdir: string
  /** The closed-taxonomy known-bad reason string, or null/undefined when
   * `appid` is not on the bundled known-bad list. */
  knownBadReason?: string | null
  /** `null` when no scannable PE exe (with or without a steam_api import)
   * was found anywhere under the title's installdir at all. */
  exe: {
    arch: 'x86' | 'x64' | 'none'
    symbols: string[]
    dllVersions: string[]
    exeVersions: string[]
  } | null
}

/** Injectable coverage dependencies -- defaults to the REAL, shipped
 * modules the live bridge uses. Tests override `x64ExportedSymbols` with an
 * empty set to exercise the 'win64-no-shim' structural case, since the
 * real set has been non-empty since 51-15's D-51-13 GO. */
export interface CensusCoverageDeps {
  resolveRequiredInterfaceVersions: typeof resolveRequiredInterfaceVersions
  evaluateShimCoverage: typeof evaluateShimCoverage
  x64ExportedSymbols: ReadonlySet<string>
}

export const DEFAULT_COVERAGE_DEPS: CensusCoverageDeps = {
  resolveRequiredInterfaceVersions,
  evaluateShimCoverage,
  x64ExportedSymbols: SHIM64_EXPORTED_SYMBOLS
}

/**
 * Pure classifier. Composes `resolveRequiredInterfaceVersions` +
 * `evaluateShimCoverage` -- the exact pipeline `shimGenerate.ts`'s real
 * install-time placement check runs -- so a census verdict can never
 * silently diverge from what a real install/launch would decide.
 *
 * Precedence (each branch is mutually exclusive with the ones below it):
 *  1. `knownBadReason` present -> 'known-bad' (checked first: a known-bad
 *     title is never attempted regardless of what its exe looks like,
 *     mirroring the live route resolver's own precedence, D-51-08).
 *  2. `exe === null` -> 'no-binary' (nothing objdump-able was found at all).
 *  3. `exe.arch === 'none'` (an exe WAS found, but imports nothing from
 *     `steam_api(64)?.dll`) -> 'bridge', flagged `no-steam-api` -- trivially
 *     bridge-eligible since there is nothing to serve, but flagged so the
 *     operator does not mistake it for a real coverage proof.
 *  4. `arch === 'x64'` and the x64 export set is structurally empty ->
 *     'win64-no-shim', without ever calling into coverage resolution --
 *     there is nothing to evaluate against.
 *  5. Any unresolved interface-version family (`resolveRequiredInterface
 *     Versions`'s `problems`, e.g. `"SteamUser@unknown-version"` or
 *     `"SteamUser@ambiguous(...)"`) -> 'unknown-version', carrying every
 *     problem string verbatim.
 *  6. Any symbol/version `evaluateShimCoverage` reports missing ->
 *     'missing-symbols', carrying the list verbatim.
 *  7. Otherwise -> 'bridge'.
 */
export function classifyCensusTitle(
  input: CensusTitleInput,
  deps: CensusCoverageDeps = DEFAULT_COVERAGE_DEPS
): CensusRow {
  const base = {
    appid: input.appid,
    name: input.name,
    installdir: input.installdir
  }

  if (input.knownBadReason) {
    return {
      ...base,
      arch: input.exe?.arch ?? 'none',
      class: 'known-bad',
      detail: input.knownBadReason
    }
  }

  if (input.exe === null) {
    return {
      ...base,
      arch: 'none',
      class: 'no-binary',
      detail: 'no scannable PE executable found under installdir'
    }
  }

  const { arch, symbols, dllVersions, exeVersions } = input.exe

  if (arch === 'none') {
    return {
      ...base,
      arch: 'none',
      class: 'bridge',
      detail: 'no-steam-api, flagged'
    }
  }

  if (arch === 'x64' && deps.x64ExportedSymbols.size === 0) {
    return {
      ...base,
      arch: 'x64',
      class: 'win64-no-shim',
      detail: 'no Win64 shim capability built (SHIM64 export set empty)'
    }
  }

  const { required, problems } = deps.resolveRequiredInterfaceVersions({
    importedSymbols: symbols,
    dllVersions,
    exeVersions
  })

  if (problems.length > 0) {
    return {
      ...base,
      arch,
      class: 'unknown-version',
      detail: problems.join(', ')
    }
  }

  const coverage = deps.evaluateShimCoverage({
    arch,
    symbols,
    requiredInterfaceVersions: required,
    versionProblems: []
  })

  if (coverage.missingSymbols.length > 0) {
    return {
      ...base,
      arch,
      class: 'missing-symbols',
      detail: coverage.missingSymbols.join(', ')
    }
  }

  return { ...base, arch, class: 'bridge', detail: '' }
}

/**
 * Routed = class 'bridge' count. A 'no-binary' row can never contribute to
 * `routed` (its class is never 'bridge'), but it DOES count toward `total`
 * -- the census reports what fraction of the whole owned set routes to the
 * bridge, not just the subset that had a scannable exe at all.
 */
export function summarizeCensus(rows: CensusRow[]): {
  routed: number
  total: number
  byClass: Record<string, number>
} {
  const byClass: Record<string, number> = {}
  let routed = 0

  for (const row of rows) {
    byClass[row.class] = (byClass[row.class] ?? 0) + 1
    if (row.class === 'bridge') {
      routed++
    }
  }

  return { routed, total: rows.length, byClass }
}

/** Markdown table + the "N of M routed to the bridge" summary line the
 * plan's `<verify>` greps for (`pnpm bridge-census | tail -3`). */
export function formatCensusMarkdown(rows: CensusRow[]): string {
  const summary = summarizeCensus(rows)
  const header =
    '| AppID | Name | Installdir | Arch | Class | Detail |\n' +
    '|---|---|---|---|---|---|'
  const body = rows
    .map(
      (r) =>
        `| ${r.appid} | ${r.name} | ${r.installdir} | ${r.arch} | ${r.class} | ${r.detail} |`
    )
    .join('\n')
  const byClassSummary = Object.entries(summary.byClass)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cls, count]) => `${cls}=${count}`)
    .join(', ')

  return [
    header,
    body,
    '',
    `${summary.routed} of ${summary.total} routed to the bridge (${byClassSummary})`
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Impure I/O driver (operator-run, never unit-tested with a real filesystem)
// ---------------------------------------------------------------------------

const BOTTLES_DIR = join(
  homedir(),
  'Library/Application Support/CrossOver/Bottles'
)
const STEAMAPPS_SUBPATH = join(
  'drive_c',
  'Program Files (x86)',
  'Steam',
  'steamapps'
)
const OBJDUMP_BIN = '/usr/bin/objdump'
const MAX_EXE_DEPTH = 4

// Mirrors `shimGenerate.ts`'s `isGameLibShimBytes` marker check verbatim
// (not imported: that module pulls `backend/constants/paths` and other
// backend imports this zero-backend-import tool must not carry). Either
// signal alone is sufficient -- a genuine game dll has no reason to
// contain either string.
const GAMELIB_SHIM_MARKER = 'GameLibSteamBridgeShim'
const GAMELIB_SHIM_LOOPBACK_MARKER = '127.0.0.1'

function isGameLibShimBytes(buf: Buffer): boolean {
  const text = buf.toString('latin1')
  return (
    text.includes(GAMELIB_SHIM_MARKER) ||
    text.includes(GAMELIB_SHIM_LOOPBACK_MARKER)
  )
}

const REDIST_EXE_NAME = /^(vcredist|dxsetup|unitycrashhandler).*\.exe$/i
const UNINSTALLER_EXE_NAME = /unins.*\.exe$/i

function isExcludedExeName(name: string): boolean {
  return REDIST_EXE_NAME.test(name) || UNINSTALLER_EXE_NAME.test(name)
}

/** The three bottle-name shapes D-51-15/D-51-12 route bridge installs
 * through: the legacy shared bottle, the Phase 24 shared bridge bottle, and
 * any per-game `GameLibSteamBridge-<appId>` bottle (D-51-12). */
function isBridgeBottleName(name: string): boolean {
  return (
    name === 'GameLibSteam' ||
    name === 'GameLibSteamBridge' ||
    name.startsWith('GameLibSteamBridge-')
  )
}

function findBridgeBottles(): string[] {
  if (!existsSync(BOTTLES_DIR)) {
    return []
  }
  return readdirSync(BOTTLES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isBridgeBottleName(entry.name))
    .map((entry) => join(BOTTLES_DIR, entry.name))
}

interface ManifestEntry {
  appid: string
  name: string
  installdir: string
  installPath: string
}

interface AcfAppState {
  AppState?: { appid?: string; name?: string; installdir?: string }
}

/** Reads every `appmanifest_<appId>.acf` in a bottle's steamapps dir. Never
 * throws -- a missing dir, unreadable file, or corrupt/incomplete ACF is a
 * normal "nothing to report for this entry" outcome, the same discipline
 * `acfInstalldir.ts`'s `readAcfInstalldir` already follows. */
function readManifests(steamappsDir: string): ManifestEntry[] {
  if (!existsSync(steamappsDir)) {
    return []
  }

  const out: ManifestEntry[] = []
  for (const fileName of readdirSync(steamappsDir)) {
    const match = fileName.match(/^appmanifest_(\d+)\.acf$/)
    if (!match) {
      continue
    }
    try {
      const content = readFileSync(join(steamappsDir, fileName), 'utf-8')
      const parsed = parseVdf(content) as AcfAppState
      const name = parsed?.AppState?.name
      const installdir = parsed?.AppState?.installdir
      if (!name || !installdir) {
        continue
      }
      out.push({
        appid: match[1],
        name,
        installdir,
        installPath: join(steamappsDir, 'common', installdir)
      })
    } catch {
      continue // corrupt ACF -- same discipline as acfInstalldir.ts
    }
  }
  return out
}

/** Collects every `*.exe` under `dir`, depth-bounded, excluding known
 * redistributable/uninstaller names. */
function walkExes(dir: string, depth: number, out: string[]): void {
  if (depth > MAX_EXE_DEPTH || !existsSync(dir)) {
    return
  }
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkExes(full, depth + 1, out)
    } else if (
      entry.isFile() &&
      entry.name.toLowerCase().endsWith('.exe') &&
      !isExcludedExeName(entry.name)
    ) {
      out.push(full)
    }
  }
}

/** Argv-form `objdump --private-headers <exePath>` (T-24-06/ASVS V5, same
 * convention as `importScan.ts`'s `scanSteamApiImports` -- NEVER a shell
 * string). No `env` option is ever passed, so this spawn site cannot trip
 * `fakeHomeIsolation.test.ts` (which only flags a hand-rolled home/config/
 * state env block). Never throws -- a spawn failure, non-zero exit, or
 * missing binary returns `null`. */
function runObjdump(exePath: string): string | null {
  let result
  try {
    result = spawnSync(OBJDUMP_BIN, ['--private-headers', exePath], {
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024
    })
  } catch {
    return null
  }
  if (result.error || result.status !== 0) {
    return null
  }
  return result.stdout
}

function loadKnownBad(): Map<string, string> {
  const allowlistPath = join(
    process.cwd(),
    'src/backend/storeManagers/steam/bridge/bridge-allowlist.json'
  )
  if (!existsSync(allowlistPath)) {
    return new Map()
  }
  try {
    const parsed = JSON.parse(readFileSync(allowlistPath, 'utf-8')) as {
      knownBad?: Array<{ appId: string; reason: string }>
    }
    return new Map((parsed.knownBad ?? []).map((e) => [e.appId, e.reason]))
  } catch {
    return new Map()
  }
}

interface ChosenExe {
  path: string
  table: ImportTableResult
}

/**
 * Picks the exe that imports `steam_api(64)?.dll` (per the action text:
 * "pick the exe with a steam_api import"), running objdump on each
 * candidate until one is found. A binary reporting BOTH a `steam_api.dll`
 * and a `steam_api64.dll` heading (`table.conflict`) is skipped rather than
 * guessed, mirroring `scanSteamApiImports`'s fail-closed T-51-06 posture.
 * Falls back to the largest exe (by file size) when none import
 * `steam_api(64)?.dll` at all -- its import table is then `arch: 'none'`,
 * `symbols: []`, classified `bridge` + `no-steam-api, flagged`.
 */
function chooseExe(exePaths: string[]): ChosenExe | null {
  let largest: { path: string; size: number } | null = null

  for (const exePath of exePaths) {
    try {
      const size = statSync(exePath).size
      if (!largest || size > largest.size) {
        largest = { path: exePath, size }
      }
    } catch {
      continue
    }

    const stdout = runObjdump(exePath)
    if (!stdout) {
      continue
    }
    const table = parseSteamApiImportTable(stdout)
    if (table.conflict) {
      continue
    }
    if (table.arch !== 'none') {
      return { path: exePath, table }
    }
  }

  if (!largest) {
    return null
  }
  return {
    path: largest.path,
    table: { dll: null, arch: 'none', symbols: [], conflict: false }
  }
}

async function classifyInstalledTitle(
  entry: ManifestEntry,
  knownBad: Map<string, string>
): Promise<CensusRow> {
  const knownBadReason = knownBad.get(entry.appid) ?? null

  const exePaths: string[] = []
  walkExes(entry.installPath, 0, exePaths)

  const chosen = chooseExe(exePaths)
  if (!chosen) {
    return classifyCensusTitle({
      appid: entry.appid,
      name: entry.name,
      installdir: entry.installdir,
      knownBadReason,
      exe: null
    })
  }

  const { arch, symbols } = chosen.table
  let dllVersions: string[] = []
  let exeVersions: string[] = []

  if (arch !== 'none') {
    const dllName = arch === 'x64' ? 'steam_api64.dll' : 'steam_api.dll'
    const dllPath = join(dirname(chosen.path), dllName)
    if (existsSync(dllPath)) {
      try {
        const buf = readFileSync(dllPath)
        if (!isGameLibShimBytes(buf)) {
          const versionResult = await readInterfaceVersionStrings(dllPath)
          if (versionResult.status === 'ok') {
            dllVersions = versionResult.versions
          }
        }
      } catch {
        // unreadable original dll -- leave dllVersions empty, same as "not found"
      }
    }

    if (usesRuntimeInterfaceLookup(symbols)) {
      const exeVersionResult = await readInterfaceVersionStrings(chosen.path)
      if (exeVersionResult.status === 'ok') {
        exeVersions = exeVersionResult.versions
      }
    }
  }

  return classifyCensusTitle({
    appid: entry.appid,
    name: entry.name,
    installdir: entry.installdir,
    knownBadReason,
    exe: { arch, symbols, dllVersions, exeVersions }
  })
}

/** Enumerates every bridge-routed bottle's `appmanifest_*.acf`, de-duped by
 * appid (first occurrence wins -- a title installed in more than one bottle
 * at once is an operator-side artifact, not two distinct owned titles), and
 * classifies each. Read-only throughout: never writes into a bottle, never
 * prints an ACF field beyond appid/name/installdir (T-51-39). */
export async function runCensus(): Promise<CensusRow[]> {
  const knownBad = loadKnownBad()
  const seen = new Map<string, ManifestEntry>()

  for (const bottleDir of findBridgeBottles()) {
    const steamappsDir = join(bottleDir, STEAMAPPS_SUBPATH)
    for (const entry of readManifests(steamappsDir)) {
      if (!seen.has(entry.appid)) {
        seen.set(entry.appid, entry)
      }
    }
  }

  const rows: CensusRow[] = []
  for (const entry of seen.values()) {
    rows.push(await classifyInstalledTitle(entry, knownBad))
  }
  return rows
}

async function main(): Promise<void> {
  const rows = await runCensus()
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2))
    return
  }
  console.log(formatCensusMarkdown(rows))
}

// `require.main === module` idiom doesn't survive `runTs.cjs` bundling into
// a private tmpdir (same reasoning as `extractProtonInventory.ts`'s own
// bottom guard) -- but this module is also imported directly by its jest
// suite, so `JEST_WORKER_ID` still reliably distinguishes "imported under
// test" from "run as the CLI entrypoint".
if (!process.env.JEST_WORKER_ID) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
