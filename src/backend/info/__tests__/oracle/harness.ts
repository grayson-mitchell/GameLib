/**
 * The shared harness for the 86 TS oracles (86-04, SC3 and D-11).
 *
 * An oracle test drives the real TS module with inputs plus store state before, then records what
 * it returned, the bytes it left on disk and the events it sent. The result is a golden under
 * `src-tauri/crates/gamelib-info/tests/fixtures/golden/<slice>/` that the Rust slice later has to
 * reproduce. No expected byte is typed by hand: `GAMELIB_WRITE_INFO_GOLDEN=1` writes the goldens
 * from the TS and the default mode compares against them. `cases.json` is the one hand-authored
 * input and is never rewritten.
 *
 * Fixture layout, per slice:
 *   golden/<slice>/cases.json                    the cases (hand-authored)
 *   golden/<slice>/MANIFEST.json                 { count, floor }
 *   golden/<slice>/expected/<case>/result.json   what the TS returned
 *   golden/<slice>/expected/<case>/events.json   what it sent
 *   golden/<slice>/expected/<case>/after/...     every file the case left under its profile
 *   state/<slice>/<case>/...                     the profile the case starts from (synthetic)
 *   recorded/<slice>/<case>/exchanges.json       (network slices) see recorder.ts
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join, relative } from 'path'
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import { createTestStoreRoot } from 'backend/testUtils/testStoreRoot'
import type { StoreRoot } from 'backend/stores/storeRoot'
import * as environment from 'backend/constants/environment'
import {
  FIXTURES_ROOT,
  oracleMode,
  recordedCaseDir,
  type OracleMode
} from './recorder'

export type OraclePlatform = 'mac' | 'linux' | 'windows'

export const goldenDir = (slice: string): string =>
  join(FIXTURES_ROOT, 'golden', slice)
export const stateDir = (slice: string, caseId: string): string =>
  join(FIXTURES_ROOT, 'state', slice, caseId)

export interface OracleProfile {
  /** The temp userData the case runs in, seeded from its state directory. */
  readonly userData: string
  /** A StoreRoot over `userData`, writing through the jest disk sink. */
  readonly root: StoreRoot
}

/**
 * Runs `fn` over a temp userData, seeded from `seed` (a `state/<slice>/<case>` directory) when
 * given, wired through the jest store sink (`createDiskStoreSink`, the in-process stand-in for the
 * Rust store owner), and removes it afterwards.
 */
export async function withOracleProfile<T>(
  fn: (profile: OracleProfile) => Promise<T> | T,
  seed?: string
): Promise<T> {
  const userData = mkdtempSync(join(tmpdir(), 'gamelib-info-oracle-'))
  try {
    if (seed !== undefined && existsSync(seed)) {
      cpSync(seed, userData, { recursive: true })
    }
    const root = createTestStoreRoot(userData)
    return await fn({ userData, root })
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
}

/**
 * Pins `Date` to `ms` and makes sure the process asks for UTC. Only `Date` is faked: a slice's
 * timers, `setImmediate` and streams keep working. Under jest `process.env` is a copy, so a TZ set
 * here does not reach the native date code: run the oracle with `TZ=UTC` for a slice that formats
 * dates.
 */
export function pinClock(ms: number): () => void {
  process.env.TZ = 'UTC'
  jest.useFakeTimers({
    now: ms,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout'
    ]
  })
  return () => {
    jest.useRealTimers()
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

/** The bytes the oracle records, keyed by path relative to the case's `expected/<case>/` folder. */
export interface GoldenCapture {
  result: unknown
  events?: readonly unknown[]
  /** Files the case left under its profile, by path relative to the profile. */
  files?: Readonly<Record<string, Buffer | string>>
}

export const json = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`

function listFiles(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(full, base))
    else out.push(relative(base, full).split('\\').join('/'))
  }
  return out.sort()
}

/** Every file a profile holds, relative and slash-separated, as `files` for `GoldenCapture`. */
export function snapshotFiles(root: string): Record<string, Buffer> {
  const out: Record<string, Buffer> = {}
  for (const rel of listFiles(root)) out[rel] = readFileSync(join(root, rel))
  return out
}

function toBytes(value: Buffer | string): Buffer {
  return typeof value === 'string' ? Buffer.from(value, 'utf8') : value
}

function view(bytes: Buffer): string {
  const text = bytes.toString('utf8')
  return Buffer.from(text, 'utf8').equals(bytes)
    ? text
    : `base64:${bytes.toString('base64')}`
}

/**
 * Write mode: rewrites `expected/<case>/` from `capture`. Compare mode: asserts the same file set
 * and the same bytes. Record mode (live recording for the network slices): does nothing.
 */
export function writeOrCompareGolden(
  slice: string,
  caseId: string,
  capture: GoldenCapture
): void {
  const mode = oracleMode()
  if (mode === 'record') return
  const produced = new Map<string, Buffer>()
  produced.set('result.json', Buffer.from(json(capture.result), 'utf8'))
  produced.set('events.json', Buffer.from(json(capture.events ?? []), 'utf8'))
  for (const [rel, value] of Object.entries(capture.files ?? {})) {
    produced.set(`after/${rel}`, toBytes(value))
  }
  const dir = join(goldenDir(slice), 'expected', caseId)
  if (mode === 'write') {
    rmSync(dir, { recursive: true, force: true })
    for (const [rel, bytes] of produced) {
      const target = join(dir, rel)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, bytes)
    }
    return
  }
  const committed = new Map<string, Buffer>()
  for (const rel of listFiles(dir))
    committed.set(rel, readFileSync(join(dir, rel)))
  expect([...produced.keys()].sort()).toEqual([...committed.keys()].sort())
  for (const [rel, bytes] of produced) {
    expect(view(bytes)).toBe(view(committed.get(rel) as Buffer))
  }
}

/** The hand-authored cases of a slice. Throws when the file is missing or not a list. */
export function loadCases<T extends { id: string }>(slice: string): T[] {
  const parsed: unknown = JSON.parse(
    readFileSync(join(goldenDir(slice), 'cases.json'), 'utf8')
  )
  if (!Array.isArray(parsed)) {
    throw new Error(`${slice}: cases.json must be a list`)
  }
  return parsed as T[]
}

export interface Manifest {
  count: number
  floor: number
}

function readManifest(slice: string): Manifest | null {
  const file = join(goldenDir(slice), 'MANIFEST.json')
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8')) as Manifest
}

/**
 * Write mode: records `{ count, floor }` for the slice. The floor is the one already committed
 * (never lowered by a rewrite) or, for a new slice, `defaultFloor`. Other modes do nothing.
 */
export function syncManifest(
  slice: string,
  cases: readonly { id: string }[],
  defaultFloor: number
): void {
  if (oracleMode() !== 'write') return
  const existing = readManifest(slice)
  const manifest: Manifest = {
    count: cases.length,
    floor: Math.max(existing?.floor ?? 0, defaultFloor)
  }
  mkdirSync(goldenDir(slice), { recursive: true })
  writeFileSync(join(goldenDir(slice), 'MANIFEST.json'), json(manifest))
}

/**
 * The vacuous-pass guard (82 D-05): the case list is at or above the pinned floor, the committed
 * MANIFEST agrees with it, and `expected/` holds exactly one folder per case. `minFloor` is the
 * floor the oracle test itself carries, so lowering the JSON alone cannot weaken the guard.
 */
export function assertManifest(
  slice: string,
  cases: readonly { id: string }[],
  minFloor: number
): void {
  assertAtOrAboveFloor(`${slice} oracle cases`, cases.length, minFloor)
  if (oracleMode() !== 'compare') return
  const manifest = readManifest(slice)
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
  const expectedRoot = join(goldenDir(slice), 'expected')
  const folders = existsSync(expectedRoot)
    ? readdirSync(expectedRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    : []
  expect(folders).toEqual([...ids].sort())
}

/** Test-only: an empty case list must fail the manifest guard. Each oracle test calls it. */
export function expectEmptyCasesToFail(slice: string, minFloor: number): void {
  expect(() => assertManifest(slice, [], minFloor)).toThrow(/below the floor/)
}

/**
 * A case flagged `"live": true` is recorded once by the operator from the real keyed service
 * (86-07, D-09). In compare and write modes a live case with no recording is a failure, never a
 * skip: a silent skip would let the golden suite go green over cases that were never recorded
 * (T-86-14). Record mode needs no recording (it is making one).
 */
export function assertLiveRecorded(
  slice: string,
  c: { id: string; live?: boolean },
  mode: OracleMode = oracleMode()
): void {
  if (!c.live || mode === 'record') return
  if (!existsSync(join(recordedCaseDir(slice, c.id), 'exchanges.json'))) {
    throw new Error(`live case not recorded: ${c.id}`)
  }
}
