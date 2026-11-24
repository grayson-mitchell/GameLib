/**
 * Phase 88 per-sub-slice delete gate (88-02, D-18, D-25 and D-30). Launch moves into Rust across four
 * sub-phases (88, 88.1, 88.2, 88.3), and each sub-slice gets its own `describe('<name>PortComplete')`
 * built on `runSlice` from `backend/testUtils/portSliceGate`, runnable alone with
 * `-t '<name>PortComplete'`. The plan that deletes a slice adds its describe here RED first (the files
 * and identifiers still exist), then deletes the TS and watches it go green: sub-phase 88 adds
 * `knownFixPortComplete`, and 88.1, 88.2 and 88.3 add theirs. A `SliceSpec` with nothing deleted would
 * pass vacuously, so no describe exists for a slice before its plan. Never lower a floor or widen an
 * allow-list to turn a red run green.
 *
 * D-18 no rollback: neither `GAMELIB_LAUNCH` nor `GAMELIB_KNOWNFIX` may appear anywhere under src/,
 * src-tauri/src or src-tauri/crates, from the first commit. There is no flag, no dual path and no
 * sidecar fallback; the `noRollbackFlag` describe holds that for the whole phase, independent of any
 * sub-slice. The scan reads raw text, so a flag named in a comment is still caught. This file names the
 * two flags to forbid them and lives under `__tests__`, which the walks skip.
 *
 * Every walk has a floor on the files it read, and the self-tests at the bottom plant each flag and watch
 * the scan fail. The crate walk reads non-test `.rs` files under `src-tauri/crates` (a crate's own
 * `tests/` directory is read too, so a flag named in an integration test is caught): 410 files when
 * measured on 2026-11-25 (88-02). `CRATE_FILES_FLOOR` sits under that so later deletions cannot trip it;
 * never lower it.
 *
 * Modelled on `engineWinePortComplete` (87-03) and loggerPortComplete (82 D-05).
 */
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import { findRollbackFlag, walkStripped } from 'backend/testUtils/infoPortGate'
import {
  BACKEND_FILES_FLOOR,
  flagWalk,
  RUST_FILES_FLOOR,
  rustWalk,
  SCANNED_FILES_FLOOR,
  tsWalk
} from 'backend/testUtils/portSliceGate'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/** The two rollback flags D-18 forbids; named here once so the scan and its self-tests agree. */
const FORBIDDEN_FLAGS = ['GAMELIB_LAUNCH', 'GAMELIB_KNOWNFIX'] as const

/** Floor for the crate walk: 410 non-test `.rs` files measured on 2026-11-25; the floor sits under that. */
const CRATE_FILES_FLOOR = 300

/** The crate walk the flag scan adds to `flagWalk` (src and src-tauri/src). */
const crateWalk = walkStripped(['src-tauri/crates'], { ext: /\.rs$/ })

/** Every file the flag scan reads: `flagWalk` plus the crates. */
const scanned = [...flagWalk.files, ...crateWalk.files]

describe('noRollbackFlag', () => {
  it('anti-vacuity: the walks read real trees', () => {
    assertAtOrAboveFloor(
      'launchPortComplete src and meta files',
      tsWalk.count,
      SCANNED_FILES_FLOOR
    )
    assertAtOrAboveFloor(
      'launchPortComplete src-tauri/src files',
      rustWalk.count,
      RUST_FILES_FLOOR
    )
    assertAtOrAboveFloor(
      'launchPortComplete src/backend files',
      tsWalk.files.filter((f) => f.path.startsWith('src/backend/')).length,
      BACKEND_FILES_FLOOR
    )
    assertAtOrAboveFloor(
      'launchPortComplete flag walk files',
      flagWalk.count,
      SCANNED_FILES_FLOOR
    )
    assertAtOrAboveFloor(
      'launchPortComplete src-tauri/crates files',
      crateWalk.count,
      CRATE_FILES_FLOOR
    )
  })

  it.each(FORBIDDEN_FLAGS)(
    'no %s rollback flag text exists in src/, src-tauri/src or src-tauri/crates',
    (flag) => {
      expect(findRollbackFlag(flagWalk.files, flag)).toEqual([])
      expect(findRollbackFlag(crateWalk.files, flag)).toEqual([])
      expect(findRollbackFlag(scanned, flag)).toEqual([])
    }
  )

  describe('planted violations', () => {
    const planted = (path: string, raw: string) => ({
      path,
      raw,
      code: raw
    })

    it('self-test: each planted flag is caught in code, in a comment and as a longer name, a different flag is not', () => {
      const [launch, knownfix] = FORBIDDEN_FLAGS
      const files = [
        planted('flag.ts', `const on = process.env['${launch}']`),
        planted('doc.rs', `// ${knownfix}=0 falls back`),
        planted('longer.ts', `process.env['${launch}_SWITCH']`),
        planted('other.ts', "process.env['GAMELIB_INFO_SLICE']")
      ]
      expect(findRollbackFlag(files, launch)).toEqual(['flag.ts', 'longer.ts'])
      expect(findRollbackFlag(files, knownfix)).toEqual(['doc.rs'])
    })

    it('self-test: a planted tree holding each flag is walked, crates included, and the scan returns it', () => {
      const [launch, knownfix] = FORBIDDEN_FLAGS
      const dir = mkdtempSync(join(tmpdir(), 'launch-port-complete-'))
      try {
        mkdirSync(join(dir, 'src', 'backend', '__tests__'), { recursive: true })
        mkdirSync(join(dir, 'src-tauri', 'src'), { recursive: true })
        mkdirSync(join(dir, 'src-tauri', 'crates', 'gamelib-x', 'src'), {
          recursive: true
        })
        writeFileSync(
          join(dir, 'src', 'backend', 'a.ts'),
          `export const a = process.env['${launch}']\n`
        )
        writeFileSync(
          join(dir, 'src-tauri', 'src', 'b.rs'),
          `// ${knownfix} is the old switch\nfn b() {}\n`
        )
        writeFileSync(
          join(dir, 'src-tauri', 'crates', 'gamelib-x', 'src', 'c.rs'),
          `fn c() { let _ = std::env::var("${launch}"); }\n`
        )
        writeFileSync(
          join(dir, 'src', 'backend', 'clean.ts'),
          'export const clean = 1\n'
        )
        writeFileSync(
          join(dir, 'src', 'backend', '__tests__', 'gate.ts'),
          `process.env['${launch}']\n`
        )
        const walk = walkStripped(['src', 'src-tauri/src'], { base: dir })
        const crates = walkStripped(['src-tauri/crates'], {
          ext: /\.rs$/,
          base: dir
        })
        expect(walk.count).toBe(3)
        expect(crates.count).toBe(1)
        expect(findRollbackFlag(walk.files, launch)).toEqual([
          'src/backend/a.ts'
        ])
        expect(findRollbackFlag(walk.files, knownfix)).toEqual([
          'src-tauri/src/b.rs'
        ])
        expect(findRollbackFlag(crates.files, launch)).toEqual([
          'src-tauri/crates/gamelib-x/src/c.rs'
        ])
        expect(
          findRollbackFlag([...walk.files, ...crates.files], launch)
        ).toEqual(['src/backend/a.ts', 'src-tauri/crates/gamelib-x/src/c.rs'])
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('self-test: an empty directory walks no files and fails the flag-walk and crate-walk floors', () => {
      const dir = mkdtempSync(join(tmpdir(), 'launch-port-complete-'))
      try {
        const walk = walkStripped(['src', 'src-tauri/src'], { base: dir })
        const crates = walkStripped(['src-tauri/crates'], {
          ext: /\.rs$/,
          base: dir
        })
        expect(walk.count).toBe(0)
        expect(crates.count).toBe(0)
        expect(findRollbackFlag(walk.files, FORBIDDEN_FLAGS[0])).toEqual([])
        expect(() =>
          assertAtOrAboveFloor(
            'launchPortComplete flag walk files',
            walk.count,
            SCANNED_FILES_FLOOR
          )
        ).toThrow(/launchPortComplete flag walk files/)
        expect(() =>
          assertAtOrAboveFloor(
            'launchPortComplete src-tauri/crates files',
            crates.count,
            CRATE_FILES_FLOOR
          )
        ).toThrow(/launchPortComplete src-tauri\/crates files/)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })
})
