/**
 * The shared harness for the Phase 87 engine, wine and tools oracles (87-05, D-08).
 *
 * An oracle test drives the real TS module on an isolated fake HOME, then records what it
 * returned, the HTTP it made, the processes it spawned and the tree it left behind. The result is
 * a golden under `src-tauri/crates/<crate>/tests/fixtures/golden/<slice>/` that the Rust slice
 * later has to reproduce. No expected byte is typed by hand: `GAMELIB_WRITE_ENGINE_GOLDEN=1`
 * writes the goldens from the TS and the default mode compares against them.
 * `GAMELIB_EW_ORACLE=record` is the one mode that touches the network, and only to record the
 * exchanges a case replays (see `recorder.ts`). `cases.json` and `deltas.json` are hand-authored
 * and are never written by the harness.
 *
 * Fixture layout, per slice:
 *   golden/<slice>/cases.json                      the cases (hand-authored)
 *   golden/<slice>/deltas.json                     case id -> a documented Rust-side difference (D-19)
 *   golden/<slice>/MANIFEST.json                   { count, floor }
 *   golden/<slice>/expected/<case>/result.json     what the TS returned
 *   golden/<slice>/expected/<case>/events.json     what it emitted
 *   golden/<slice>/expected/<case>/requests.json   the requests it made (secrets redacted)
 *   golden/<slice>/expected/<case>/spawns.json     the spawn trace (see spawnTrace.ts)
 *   golden/<slice>/expected/<case>/tree.json       the profile tree afterwards (see treeSnapshot.ts)
 *   recorded/<slice>/<case>/exchanges.json         (network slices) see recorder.ts
 *
 * Every recorded path is normalised to a placeholder, so the Rust replay on any OS substitutes its
 * own FakeHome: `<TOOLS>` (the tools folder), `<APPFOLDER>`, `<USERDATA>`, `<TMP>` and `<HOME>`
 * (the fake HOME itself). The profile's layout is the same on every OS, on purpose:
 *
 *   <HOME>                                      the fake HOME (`createFakeHomeProfile().root`)
 *   <USERDATA> = <HOME>/Library/Application Support/GameLib
 *   <APPFOLDER> = <HOME>/.config/GameLib
 *   <TOOLS> = <APPFOLDER>/tools                 `<TOOLS>/runtimes` is `runtimePath`
 *   <TMP> = <HOME>/tmp
 *
 * `<USERDATA>` and `<APPFOLDER>` are deliberately different directories (they coincide on a real
 * Mac), so a port that reads the wrong root fails a golden rather than passing by coincidence.
 *
 * 87-57 trimmed this file to what `wine/__tests__/oracle/wineCore.oracle.test.ts` imports, the one oracle left: it is the
 * vector test of the D-22 twins (`setupEnvVars`, `setupWineEnvVars`, `createCommandRunner`, `getDefaultWineBinary`) and is
 * deleted with them in Phase 88, and this harness with it. `pinClock`, `loadDeltas` and `assertLiveRecorded` served the oracles
 * 87-37 and 87-56c deleted. The Rust replay reads `deltas.json` and the recordings itself.
 *
 * Two-profile rule: every case runs on a fresh `createFakeHomeProfile()` and never reads the real
 * HOME. The harness spawns nothing itself; a case that must run a real binary takes its runner from
 * `createRealRunner()`, which is isolated by default.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  chmodSync
} from 'fs'
import { dirname, join } from 'path'
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import * as environment from 'backend/constants/environment'
import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from 'backend/testUtils/fakeHomeProfile'
import { derivePaths } from 'backend/process/appPaths'
import type { AppPaths } from 'backend/process/context'
import { fixturesRoot, engineWineOracleMode, type OracleMode } from './recorder'

export type OraclePlatform = 'mac' | 'linux' | 'windows'

export const goldenDir = (crate: string, slice: string): string =>
  join(fixturesRoot(crate), 'golden', slice)

/** The repo root, so `publicDir` points at the real `public/` tree. */
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

export interface EngineOracleProfile {
  /** The isolated fake HOME and its disposer (the eight home variables all point inside it). */
  readonly fake: FakeHomeProfile
  readonly home: string
  readonly userData: string
  readonly appFolder: string
  readonly toolsPath: string
  readonly runtimePath: string
  readonly tmp: string
  /** A full AppPaths over the layout above. */
  readonly paths: AppPaths
}

/** One file, directory or link a case starts from. Paths may begin with a placeholder. */
export interface SeedEntry {
  path: string
  text?: string
  /** Binary content, base64. Wins over `text`. */
  base64?: string
  /** Octal string such as `"0755"`. */
  mode?: string
  /** Makes the entry a symlink to this target (placeholders expanded). */
  symlink?: string
  /** `true` makes the entry an empty directory. */
  dir?: true
}

function buildProfile(fake: FakeHomeProfile): EngineOracleProfile {
  const home = fake.root
  const appData = join(home, 'Library', 'Application Support')
  const configRoot = join(home, '.config')
  const tmp = join(home, 'tmp')
  const derived = derivePaths({
    appData,
    configRoot,
    home,
    userHome: home,
    flatpakHome: home,
    appRoot: REPO_ROOT,
    assetDir: 'public',
    arch: process.arch,
    tempDir: tmp
  })
  const paths: AppPaths = {
    ...derived,
    appRoot: REPO_ROOT,
    appData,
    exe: join(home, 'shell-exe'),
    knownFolder: (name) => join(home, name)
  }
  return {
    fake,
    home,
    userData: derived.userData,
    appFolder: derived.appFolder,
    toolsPath: derived.toolsPath,
    runtimePath: derived.runtimePath,
    tmp,
    paths
  }
}

/** The placeholder table, longest (most specific) root first. */
function placeholders(
  profile: EngineOracleProfile
): readonly (readonly [string, string])[] {
  const table: [string, string][] = [
    ['<TOOLS>', profile.toolsPath],
    ['<APPFOLDER>', profile.appFolder],
    ['<USERDATA>', profile.userData],
    ['<TMP>', profile.tmp],
    ['<HOME>', profile.home]
  ]
  // macOS reports a temp directory through its real path (`/private/var/...`), so a path a child
  // process prints can name the realpath of the root rather than the one the profile was given.
  const real = realpathSync(profile.home)
  if (real !== profile.home) {
    table.push(
      ['<TOOLS>', join(real, '.config', 'GameLib', 'tools')],
      ['<APPFOLDER>', join(real, '.config', 'GameLib')],
      ['<USERDATA>', join(real, 'Library', 'Application Support', 'GameLib')],
      ['<TMP>', join(real, 'tmp')],
      ['<HOME>', real]
    )
  }
  return table
}

/**
 * Replaces every profile root in `value` (strings, array items, object values; not object keys)
 * with its placeholder and leaves every other string alone: an unrelated absolute path is not
 * the profile's to rewrite.
 */
export function normalisePaths<T>(value: T, profile: EngineOracleProfile): T {
  const table = placeholders(profile)
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') {
      let out = node
      for (const [token, root] of table) out = out.split(root).join(token)
      return out
    }
    if (Array.isArray(node)) return node.map(walk)
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>).map(([k, v]) => [
          k,
          walk(v)
        ])
      )
    }
    return node
  }
  return walk(value) as T
}

/** The inverse of `normalisePaths` for one string: a seed's `<TOOLS>/x` becomes a real path. */
export function expandPlaceholders(
  text: string,
  profile: EngineOracleProfile
): string {
  let out = text
  for (const [token, root] of [
    ['<TOOLS>', profile.toolsPath],
    ['<APPFOLDER>', profile.appFolder],
    ['<USERDATA>', profile.userData],
    ['<TMP>', profile.tmp],
    ['<HOME>', profile.home]
  ] as const) {
    out = out.split(token).join(root)
  }
  return out
}

/** Writes a case's starting state into the profile. */
function seedProfile(
  profile: EngineOracleProfile,
  seed: readonly SeedEntry[]
): void {
  for (const entry of seed) {
    const target = expandPlaceholders(entry.path, profile)
    if (!target.startsWith(profile.home)) {
      throw new Error(
        `seedProfile: ${entry.path} is outside the profile; a seed path must start with a placeholder`
      )
    }
    if (entry.dir) {
      mkdirSync(target, { recursive: true })
    } else if (entry.symlink !== undefined) {
      mkdirSync(dirname(target), { recursive: true })
      symlinkSync(expandPlaceholders(entry.symlink, profile), target)
    } else {
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(
        target,
        entry.base64 !== undefined
          ? Buffer.from(entry.base64, 'base64')
          : (entry.text ?? '')
      )
    }
    if (entry.mode !== undefined && entry.symlink === undefined) {
      chmodSync(target, parseInt(entry.mode, 8))
    }
  }
}

/**
 * Runs `fn` over a fresh fake HOME profile (one per case, never reused) and disposes it
 * afterwards, whatever `fn` did.
 */
export async function withEngineOracleProfile<T>(
  fn: (profile: EngineOracleProfile) => Promise<T> | T,
  options: { seed?: readonly SeedEntry[] } = {}
): Promise<T> {
  const fake = createFakeHomeProfile({ prefix: 'gamelib-engine-oracle-' })
  try {
    const profile = buildProfile(fake)
    if (options.seed) seedProfile(profile, options.seed)
    return await fn(profile)
  } finally {
    fake.dispose()
  }
}

/**
 * Makes `backend/constants/environment` say the host is `platform` (those constants are read at
 * call time by every slice). Returns the restore function. `jest.replaceProperty`, not a module
 * mock: the jestMock ratchet counts `jest.mock`, and the constants are plain properties.
 */
export function mockPlatform(platform: OraclePlatform): () => void {
  const replaced = [
    jest.replaceProperty(environment, 'isMac', platform === 'mac'),
    jest.replaceProperty(environment, 'isLinux', platform === 'linux'),
    jest.replaceProperty(environment, 'isWindows', platform === 'windows')
  ]
  return () => {
    for (const r of replaced) r.restore()
  }
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

/** What one case records. Every field is already normalised and redacted by the caller. */
export interface GoldenCapture {
  result: unknown
  events?: readonly unknown[]
  /** The profile tree afterwards (`snapshotTree`). */
  after?: readonly unknown[]
  /** The spawn trace (`createSpawnTracer().records`). */
  spawns?: readonly unknown[]
  /** `METHOD url` of every request the TS made, in order. */
  requests?: readonly string[]
}

function listFiles(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(full, base))
    else
      out.push(
        full
          .slice(base.length + 1)
          .split('\\')
          .join('/')
      )
  }
  return out.sort()
}

/**
 * Write mode: rewrites `expected/<case>/` from `capture`. Compare mode: asserts the same file set
 * and the same bytes. Record mode (live recording of the exchanges): does nothing.
 */
export function writeOrCompareGolden(
  crate: string,
  slice: string,
  caseId: string,
  capture: GoldenCapture,
  mode: OracleMode = engineWineOracleMode()
): void {
  if (mode === 'record') return
  const produced = new Map<string, string>([
    ['result.json', json(capture.result)],
    ['events.json', json(capture.events ?? [])],
    ['requests.json', json(capture.requests ?? [])],
    ['spawns.json', json(capture.spawns ?? [])],
    ['tree.json', json(capture.after ?? [])]
  ])
  const dir = join(goldenDir(crate, slice), 'expected', caseId)
  if (mode === 'write') {
    rmSync(dir, { recursive: true, force: true })
    for (const [rel, text] of produced) {
      const target = join(dir, rel)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, text)
    }
    return
  }
  const committed = listFiles(dir)
  expect([...produced.keys()].sort()).toEqual(committed)
  for (const [rel, text] of produced) {
    expect(text).toBe(readFileSync(join(dir, rel), 'utf8'))
  }
}

/** The hand-authored cases of a slice. Throws when the file is missing or not a list. */
export function loadCases<T extends { id: string }>(
  crate: string,
  slice: string
): T[] {
  const parsed: unknown = JSON.parse(
    readFileSync(join(goldenDir(crate, slice), 'cases.json'), 'utf8')
  )
  if (!Array.isArray(parsed)) {
    throw new Error(`${slice}: cases.json must be a list`)
  }
  return parsed as T[]
}

interface Manifest {
  count: number
  floor: number
}

function readManifest(crate: string, slice: string): Manifest | null {
  const file = join(goldenDir(crate, slice), 'MANIFEST.json')
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8')) as Manifest
}

/**
 * Write mode: records `{ count, floor }` for the slice. The floor is the one already committed
 * (never lowered by a rewrite) or, for a new slice, `defaultFloor`. Other modes do nothing.
 */
export function syncManifest(
  crate: string,
  slice: string,
  cases: readonly { id: string }[],
  defaultFloor: number,
  mode: OracleMode = engineWineOracleMode()
): void {
  if (mode !== 'write') return
  const existing = readManifest(crate, slice)
  const manifest: Manifest = {
    count: cases.length,
    floor: Math.max(existing?.floor ?? 0, defaultFloor)
  }
  mkdirSync(goldenDir(crate, slice), { recursive: true })
  writeFileSync(join(goldenDir(crate, slice), 'MANIFEST.json'), json(manifest))
}

/**
 * The vacuous-pass guard (82 D-05): the case list is at or above the pinned floor, the committed
 * MANIFEST agrees with it, and `expected/` holds exactly one folder per case. `minFloor` is the
 * floor the oracle test itself carries, so lowering the JSON alone cannot weaken the guard.
 */
export function assertManifest(
  crate: string,
  slice: string,
  cases: readonly { id: string }[],
  minFloor: number,
  mode: OracleMode = engineWineOracleMode()
): void {
  assertAtOrAboveFloor(`${slice} oracle cases`, cases.length, minFloor)
  if (mode !== 'compare') return
  const manifest = readManifest(crate, slice)
  if (!manifest) throw new Error(`${slice}: MANIFEST.json is missing`)
  assertAtOrAboveFloor(
    `${slice} oracle manifest floor`,
    manifest.floor,
    minFloor
  )
  expect(manifest.count).toBe(cases.length)
  assertAtOrAboveFloor(`${slice} oracle cases`, cases.length, manifest.floor)
  const ids = new Set(cases.map((c) => c.id))
  expect(ids.size).toBe(cases.length)
  const expectedRoot = join(goldenDir(crate, slice), 'expected')
  const folders = existsSync(expectedRoot)
    ? readdirSync(expectedRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    : []
  expect(folders).toEqual([...ids].sort())
}

/** Test-only: an empty case list must fail the manifest guard. Each oracle test calls it. */
export function expectEmptyCasesToFail(
  crate: string,
  slice: string,
  minFloor: number
): void {
  expect(() => assertManifest(crate, slice, [], minFloor, 'compare')).toThrow(
    /below the floor/
  )
}
