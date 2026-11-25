/**
 * The harness for the Phase 94 Humble oracles (94-06, D-05, D-07, D-23).
 *
 * An oracle test drives the real TypeScript Humble code on an isolated fake HOME and records what
 * it did as a golden under `src-tauri/crates/gamelib-humble/tests/fixtures/golden/<slice>/<case>.json`
 * (pure logic and state) or as a recorded wire exchange under `recorded/<slice>/<case>/` (requests
 * as they appear on the socket, `wireRecorder.ts`). The Rust port is later held to those bytes. No
 * expected value is typed by hand: `GAMELIB_WRITE_HUMBLE_GOLDEN=1` writes the goldens from the
 * TypeScript, and the default mode compares against them (a hand edit therefore fails the compare
 * run). `deltas.json` is the one file the harness writes for a person: `recordDelta` notes a
 * deliberate Rust difference.
 *
 * Fixture layout, per slice:
 *   golden/<slice>/<case>.json     what the TypeScript produced for the case
 *   golden/<slice>/MANIFEST.json   { count, floor }
 *   golden/<slice>/deltas.json     case id -> a documented Rust-side difference (optional)
 *   recorded/<slice>/<case>/exchanges.json + body-<n>.<ext>   the wire recorder's output
 *
 * Nothing here is a module mock (the `jest.mock` family is counted by the jestMock ratchet in
 * `meta/backendDiCeilings.cjs`, and a stubbed module would hide the wire):
 *   - `pointHumbleAt` is a `jest.replaceProperty` on the constants module's `HUMBLE_BASE_URL`,
 *     which the adapter reads at call time (it is `constants_1.HUMBLE_BASE_URL` in the compiled
 *     code, not a copy taken at import);
 *   - `pointSteamStoreSearchAt` is an axios request interceptor on the default instance,
 *     rewriting the resolver's module-private storesearch origin (the resolver calls the default
 *     instance with that URL);
 *   - each returns its undo, and every case runs the undo in its `finally`.
 *
 * Two-profile rule: every case runs on a fresh `createFakeHomeProfile()` and never reads the real
 * HOME. The harness spawns nothing.
 */
import axios from 'axios'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { dirname, join } from 'path'
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import { createFakeClock, type FakeClock } from 'backend/testUtils/fakeClock'
import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from 'backend/testUtils/fakeHomeProfile'
import * as humbleConstants from 'backend/humble/constants'
import { derivePaths } from 'backend/process/appPaths'
import {
  STEAM_STORE_ORIGIN,
  fixturesRoot,
  startWireRecorder,
  type WireRecorder,
  type WireRecorderOptions
} from './wireRecorder'

export type HumbleGoldenMode = 'write' | 'compare'

/** The instant every Humble oracle case treats as "now": the clock and any `now` input. */
export const PINNED_NOW_MS = Date.UTC(2026, 10, 24, 12, 0, 0)

/** The repo root, so `publicDir` points at the real `public/` tree. */
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

const goldenDir = (slice: string): string =>
  join(fixturesRoot(), 'golden', slice)

/** `GAMELIB_WRITE_HUMBLE_GOLDEN=1` writes the goldens, anything else compares. */
function humbleGoldenMode(): HumbleGoldenMode {
  return process.env.GAMELIB_WRITE_HUMBLE_GOLDEN === '1' ? 'write' : 'compare'
}

/**
 * What a case runs over.
 *
 * @public consumed by the Humble flow oracles from 94-08 on (this plan's contract names it)
 */
export interface HumbleOracleProfile {
  /** The isolated fake HOME and its disposer (the eight home variables all point inside it). */
  readonly fake: FakeHomeProfile
  readonly home: string
  /** `<appData>/GameLib`: where the store files live (`store_cache/`, `humble_store/`). */
  readonly userData: string
  /** A clock pinned at `PINNED_NOW_MS`; time moves only when the case advances it. */
  readonly clock: FakeClock
  readonly nowMs: number
}

/**
 * Runs `fn` over a fresh fake HOME profile (one per case, never reused) and disposes it afterwards,
 * whatever `fn` did. The layout is the macOS one on every host, on purpose, so a recorded path is
 * the same wherever the golden is compared.
 *
 * @public consumed by the Humble flow oracles from 94-08 on (this plan's contract names it)
 */
export async function withHumbleOracleProfile<T>(
  fn: (profile: HumbleOracleProfile) => Promise<T> | T
): Promise<T> {
  const fake = createFakeHomeProfile({ prefix: 'gamelib-humble-oracle-' })
  try {
    const home = fake.root
    const appData = join(home, 'Library', 'Application Support')
    const derived = derivePaths({
      appData,
      configRoot: join(home, '.config'),
      home,
      userHome: home,
      flatpakHome: home,
      appRoot: REPO_ROOT,
      assetDir: 'public',
      arch: process.arch,
      tempDir: join(home, 'tmp')
    })
    mkdirSync(derived.userData, { recursive: true })
    return await fn({
      fake,
      home,
      userData: derived.userData,
      clock: createFakeClock(PINNED_NOW_MS),
      nowMs: PINNED_NOW_MS
    })
  } finally {
    fake.dispose()
  }
}

/**
 * Points the Humble adapter at the recorder: `HUMBLE_BASE_URL` read at call time (adapter.ts builds
 * every Humble URL as `${HUMBLE_BASE_URL}...`). Returns the restore. Test-only, no production
 * change, and not a module mock.
 */
export function pointHumbleAt(baseUrl: string): () => void {
  const replaced = jest.replaceProperty(
    humbleConstants,
    'HUMBLE_BASE_URL',
    // The constant is typed as its literal; the recorder's origin is a different string on purpose.
    baseUrl as typeof humbleConstants.HUMBLE_BASE_URL
  )
  return () => replaced.restore()
}

/**
 * Points the Steam app-id resolver at the recorder. `searchSteamStoreApps` calls the default axios
 * instance with the module-private `https://store.steampowered.com/api/storesearch/`, so a request
 * interceptor rewrites that origin to the recorder and names the real one in `x-oracle-upstream`
 * (the recorder drops that header from the recording). Returns the eject.
 */
export function pointSteamStoreSearchAt(baseUrl: string): () => void {
  const id = axios.interceptors.request.use((config) => {
    const url = typeof config.url === 'string' ? config.url : ''
    if (url.startsWith(STEAM_STORE_ORIGIN)) {
      config.url = `${baseUrl}${url.slice(STEAM_STORE_ORIGIN.length)}`
      config.headers.set('x-oracle-upstream', STEAM_STORE_ORIGIN)
    }
    return config
  })
  return () => axios.interceptors.request.eject(id)
}

/**
 * Runs `fn` with the wire recorder up and both the Humble adapter and the Steam app-id resolver
 * pointed at it. The undo runs in a `finally`, then the recorder is closed (which writes the
 * recording in write and forward mode and throws on an unmatched or differing request). When `fn`
 * itself throws, that error wins.
 */
export async function withWireRecorder<T>(
  options: WireRecorderOptions,
  fn: (recorder: WireRecorder) => Promise<T>
): Promise<T> {
  const recorder = await startWireRecorder(options)
  const undo = [
    pointHumbleAt(recorder.baseUrl),
    pointSteamStoreSearchAt(recorder.baseUrl)
  ]
  let result: T
  try {
    result = await fn(recorder)
  } catch (error) {
    for (const restore of undo) restore()
    await recorder.close().catch(() => undefined)
    throw error
  }
  for (const restore of undo) restore()
  await recorder.close()
  return result
}

/** The files `snapshotHumbleState` and `seedHumbleState` cover, relative to `userData`. */
const STATE_FILE =
  /^(?:store_cache\/humble_[A-Za-z0-9_]+\.json|humble_store\/config\.json)$/

function assertStatePath(rel: string): void {
  if (!STATE_FILE.test(rel)) {
    throw new Error(
      `humble oracle state file ${JSON.stringify(rel)} is not one of ours`
    )
  }
}

/**
 * `{ "<rel path>": "<base64 bytes>" }`, sorted by path.
 *
 * @public consumed by the Humble flow oracles from 94-08 on (this plan's contract names it)
 */
export type HumbleStateSnapshot = Record<string, string>

/**
 * The bytes of every Humble state file under `userData`: `store_cache/humble_*.json` and
 * `humble_store/config.json` (D-07), keyed by their `/`-separated path, base64, sorted. A file that
 * does not exist is absent from the result.
 *
 * @public consumed by the Humble flow oracles from 94-08 on (this plan's contract names it)
 */
export function snapshotHumbleState(userData: string): HumbleStateSnapshot {
  const rels: string[] = []
  const cacheDir = join(userData, 'store_cache')
  if (existsSync(cacheDir)) {
    for (const name of readdirSync(cacheDir)) {
      const rel = `store_cache/${name}`
      if (STATE_FILE.test(rel)) rels.push(rel)
    }
  }
  if (existsSync(join(userData, 'humble_store', 'config.json'))) {
    rels.push('humble_store/config.json')
  }
  rels.sort()
  const out: HumbleStateSnapshot = {}
  for (const rel of rels) {
    out[rel] = readFileSync(join(userData, ...rel.split('/'))).toString(
      'base64'
    )
  }
  return out
}

/**
 * A seed file: base64 bytes (as a snapshot holds them) or UTF-8 text.
 *
 * @public consumed by the Humble flow oracles from 94-08 on (this plan's contract names it)
 */
export type HumbleSeedFile = string | { utf8: string }

/**
 * Writes a case's starting Humble state into `userData`, byte for byte.
 *
 * @public consumed by the Humble flow oracles from 94-08 on (this plan's contract names it)
 */
export function seedHumbleState(
  userData: string,
  files: Readonly<Record<string, HumbleSeedFile>>
): void {
  for (const [rel, file] of Object.entries(files)) {
    assertStatePath(rel)
    const target = join(userData, ...rel.split('/'))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(
      target,
      typeof file === 'string' ? Buffer.from(file, 'base64') : file.utf8
    )
  }
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

/** A golden file name must be one plain segment; a case id is built from ASCII ids and `-`. */
function assertCaseId(caseId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(caseId)) {
    throw new Error(
      `golden case id ${JSON.stringify(caseId)} is not a plain name`
    )
  }
}

/**
 * Write mode: writes `<slice>/<caseId>.json` from `value`. Compare mode: asserts the committed file
 * holds exactly the same text, so a hand edit of a golden (or a change in the TypeScript) fails.
 */
export function writeOrCompareGolden(
  slice: string,
  caseId: string,
  value: unknown,
  mode: HumbleGoldenMode = humbleGoldenMode()
): void {
  assertCaseId(caseId)
  const file = join(goldenDir(slice), `${caseId}.json`)
  const text = json(value)
  if (mode === 'write') {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text)
    return
  }
  if (!existsSync(file)) {
    throw new Error(
      `${slice}/${caseId}: golden is missing, record it with GAMELIB_WRITE_HUMBLE_GOLDEN=1`
    )
  }
  expect(text).toBe(readFileSync(file, 'utf8'))
}

interface Manifest {
  count: number
  floor: number
  [extra: string]: unknown
}

function readManifest(slice: string): Manifest | null {
  const file = join(goldenDir(slice), 'MANIFEST.json')
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8')) as Manifest
}

/** The golden case ids on disk for `slice`, sorted (MANIFEST and deltas excluded). */
function committedCaseIds(slice: string): string[] {
  const dir = goldenDir(slice)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(
      (name) =>
        name.endsWith('.json') &&
        name !== 'MANIFEST.json' &&
        name !== 'deltas.json'
    )
    .map((name) => name.slice(0, -'.json'.length))
    .sort()
}

/**
 * Write mode: records `{ count, floor, ...extra }` for the slice and removes goldens no case
 * produces any more. The floor is the one already committed (never lowered by a rewrite) or, for a
 * new slice, `defaultFloor`. `extra` carries slice facts the manifest pins (the classifier version).
 * Compare mode does nothing.
 */
export function syncManifest(
  slice: string,
  caseIds: readonly string[],
  defaultFloor: number,
  extra: Record<string, unknown> = {},
  mode: HumbleGoldenMode = humbleGoldenMode()
): void {
  if (mode !== 'write') return
  const existing = readManifest(slice)
  const manifest: Manifest = {
    count: caseIds.length,
    floor: Math.max(existing?.floor ?? 0, defaultFloor),
    ...extra
  }
  mkdirSync(goldenDir(slice), { recursive: true })
  writeFileSync(join(goldenDir(slice), 'MANIFEST.json'), json(manifest))
  const keep = new Set(caseIds)
  for (const id of committedCaseIds(slice)) {
    if (!keep.has(id)) rmSync(join(goldenDir(slice), `${id}.json`))
  }
}

/**
 * The vacuous-pass guard (82 D-05): the case list is at or above the floor the test itself carries
 * (`minFloor`, so lowering the JSON alone cannot weaken it), the committed MANIFEST agrees with it
 * (`count` equals the cases, `floor` is not below `minFloor`), and the slice folder holds exactly one
 * golden per case. Compare mode only for the on-disk checks. Returns the manifest read in compare
 * mode, so a test can pin an `extra` fact.
 */
export function assertManifest(
  slice: string,
  caseIds: readonly string[],
  minFloor: number,
  mode: HumbleGoldenMode = humbleGoldenMode()
): Manifest | null {
  assertAtOrAboveFloor(`${slice} oracle cases`, caseIds.length, minFloor)
  if (mode !== 'compare') return null
  const manifest = readManifest(slice)
  if (!manifest) throw new Error(`${slice}: MANIFEST.json is missing`)
  assertAtOrAboveFloor(
    `${slice} oracle manifest floor`,
    manifest.floor,
    minFloor
  )
  expect(manifest.count).toBe(caseIds.length)
  assertAtOrAboveFloor(`${slice} oracle cases`, caseIds.length, manifest.floor)
  expect(new Set(caseIds).size).toBe(caseIds.length)
  // A case-insensitive disk (Windows, default macOS) would fold two such goldens into one file.
  expect(new Set(caseIds.map((id) => id.toLowerCase())).size).toBe(
    caseIds.length
  )
  expect(committedCaseIds(slice)).toEqual([...caseIds].sort())
  return manifest
}

/** Test-only: an empty case list must fail the floor guard. Each oracle test calls it. */
export function expectEmptyCasesToFail(slice: string, minFloor: number): void {
  expect(() => assertManifest(slice, [], minFloor, 'compare')).toThrow(
    /below the floor/
  )
}

/**
 * Notes a deliberate difference the Rust port will have from the TypeScript for one case (D-20) in
 * `<slice>/deltas.json`, keeping the file sorted. The only golden file written by hand-driven code;
 * the reason is mandatory.
 *
 * @public consumed by the Humble flow oracles from 94-08 on (this plan's contract names it)
 */
export function recordDelta(
  slice: string,
  caseId: string,
  reason: string
): void {
  assertCaseId(caseId)
  if (reason.trim().length === 0) {
    throw new Error(`recordDelta ${slice}/${caseId}: a delta needs a reason`)
  }
  const file = join(goldenDir(slice), 'deltas.json')
  const current: Record<string, string> = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>)
    : {}
  current[caseId] = reason
  const sorted = Object.fromEntries(
    Object.entries(current).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  )
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, json(sorted))
}
