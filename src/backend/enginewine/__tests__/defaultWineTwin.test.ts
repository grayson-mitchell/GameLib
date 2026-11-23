/**
 * The default-wine twin's vector test (Phase 87, 87-26, D-22 and D-24).
 *
 * `getDefaultWineBinary` (`utils/compatibility_layers.ts`) is read synchronously by `getFactoryDefaults` in
 * `config.ts`, before any rustInvoke transport exists, so it cannot become an async shim over the Rust
 * `default_wine_from_path`. It stays as a scheduled twin (`engineWineShimSchedule.test.ts`, `deletedBy` 98)
 * and this test is what pins it to Rust: it replays the same `default_wine.json` vectors that
 * `gamelib-wine`'s `golden_discovery.rs` replays against the Rust function, over a scripted `PATH` in a
 * temporary tree, and the answers must be the recorded installations. If either side drifts, one of the two
 * replays fails.
 *
 * `<HOME>` in a vector is the temporary tree's root; `path: null` is an unset `PATH`. The twin reads the
 * process `PATH`, so each case sets it and the suite restores it.
 */
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import { REPO_ROOT } from 'backend/testUtils/infoPortGate'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import { getDefaultWineBinary } from 'backend/utils/compatibility_layers'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { delimiter, dirname, join } from 'path'

const VECTORS = join(
  REPO_ROOT,
  'src-tauri',
  'crates',
  'gamelib-wine',
  'tests',
  'fixtures',
  'vectors',
  'default_wine.json'
)
// `default_wine.json` holds 8 vectors when recorded (87-08); never lower this to turn a red run green.
const VECTORS_FLOOR = 8

type Seed =
  | { path: string; dir: true }
  | { path: string; symlink: string }
  | { path: string; text: string; mode?: string }

interface Vector {
  id: string
  path: string[] | null
  seed: Seed[]
  expected: Record<string, string>
}

const vectors = JSON.parse(readFileSync(VECTORS, 'utf8')) as Vector[]

/** `<HOME>` replaced by `home` in a vector's string. */
const at = (home: string, text: string): string =>
  text.replaceAll('<HOME>', home)

/** Lays out a vector's seeded tree under `home`. */
function seedTree(home: string, seed: readonly Seed[]): void {
  for (const entry of seed) {
    const target = at(home, entry.path)
    if ('dir' in entry) {
      mkdirSync(target, { recursive: true })
    } else if ('symlink' in entry) {
      mkdirSync(dirname(target), { recursive: true })
      symlinkSync(at(home, entry.symlink), target)
    } else {
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, entry.text)
      chmodSync(target, parseInt(entry.mode ?? '0644', 8))
    }
  }
}

describeSkipOnWindows('getDefaultWineBinary twin (87-26)', () => {
  const realPath = process.env['PATH']
  const roots: string[] = []

  afterEach(() => {
    if (realPath === undefined) delete process.env['PATH']
    else process.env['PATH'] = realPath
    while (roots.length > 0) {
      const root = roots.pop()
      if (root) rmSync(root, { recursive: true, force: true })
    }
  })

  it('anti-vacuity: the shared vectors were read and cover found and not found', () => {
    assertAtOrAboveFloor(
      'default_wine.json vectors',
      vectors.length,
      VECTORS_FLOOR
    )
    expect(vectors.some((v) => v.expected['bin'] === '')).toBe(true)
    expect(vectors.some((v) => v.expected['bin'] !== '')).toBe(true)
    expect(vectors.some((v) => v.path === null)).toBe(true)
  })

  it.each(vectors.map((v) => [v.id, v] as const))(
    'replays %s as the recorded installation',
    (_id, vector) => {
      const home = mkdtempSync(join(tmpdir(), 'default-wine-twin-'))
      roots.push(home)
      seedTree(home, vector.seed)
      if (vector.path === null) delete process.env['PATH']
      else
        process.env['PATH'] = vector.path
          .map((p) => at(home, p))
          .join(delimiter)
      const expected = Object.fromEntries(
        Object.entries(vector.expected).map(([key, value]) => [
          key,
          at(home, value)
        ])
      )
      expect(getDefaultWineBinary()).toEqual(expected)
    }
  )
})
