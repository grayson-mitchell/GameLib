/**
 * Phase 94 per-sub-slice delete gate for the non-Steam shortcuts port (94-03, D-15). Each sub-slice gets its own
 * `describe('<name>PortComplete')`, runnable alone with `-t '<name>PortComplete'`, built on `runSlice`
 * from `backend/testUtils/portSliceGate` (the helper the 86 info gate and the 87 engine and wine gate
 * use). A slice's describe fails if a TS file the port deleted comes back, a deleted identifier is named
 * in non-test code, a TS `ipc.handle` or `ipc.on` registers one of the slice's native channels, or a
 * rollback flag string appears under src/ or src-tauri/src.
 *
 * The one sub-slice, `shortcuts`, is added red by 94-24. A sub-slice with no describe yet has none because a `SliceSpec` with nothing deleted would pass
 * vacuously, so the plan that deletes it adds its `describe('<name>PortComplete', () => runSlice(SPEC))`
 * here RED first (the files and identifiers still exist), then deletes the TS and watches it go green.
 * Never lower a floor or widen an allow-list to turn a red run green.
 *
 * D-15 no rollback: `GAMELIB_SHORTCUTS` may not appear anywhere under src/ or src-tauri/src, from the first commit.
 * There is no flag, no dual path and no fallback window; the `noRollbackFlag` describe holds that for the
 * whole phase, independent of any sub-slice. This file names the flag to forbid it and lives under
 * `__tests__`, which the walk skips.
 *
 * Modelled on engineWinePortComplete (87-03) and loggerPortComplete (82 D-05): every scan runs over
 * comment-stripped text (the flag scan reads raw text, so a flag named in a comment is still caught),
 * every walk has a floor on the files it read, and the self-tests at the bottom plant a violation and
 * watch each scan fail.
 */
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import { findRollbackFlag, walkStripped } from 'backend/testUtils/infoPortGate'
import {
  BACKEND_FILES_FLOOR,
  flagWalk,
  rustWalk,
  RUST_FILES_FLOOR,
  SCANNED_FILES_FLOOR,
  tsWalk
} from 'backend/testUtils/portSliceGate'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/** The rollback flag D-15 forbids; named here once so the scan and its self-tests agree. */
const FORBIDDEN_FLAG = 'GAMELIB_SHORTCUTS'

describe('noRollbackFlag', () => {
  it('anti-vacuity: the walks read real trees', () => {
    assertAtOrAboveFloor(
      'shortcutsPortComplete src and meta files',
      tsWalk.count,
      SCANNED_FILES_FLOOR
    )
    assertAtOrAboveFloor(
      'shortcutsPortComplete src-tauri/src files',
      rustWalk.count,
      RUST_FILES_FLOOR
    )
    assertAtOrAboveFloor(
      'shortcutsPortComplete src/backend files',
      tsWalk.files.filter((f) => f.path.startsWith('src/backend/')).length,
      BACKEND_FILES_FLOOR
    )
    assertAtOrAboveFloor(
      'shortcutsPortComplete flag walk files',
      flagWalk.count,
      SCANNED_FILES_FLOOR
    )
  })

  it('no rollback flag text exists in src/ or src-tauri/src', () => {
    expect(findRollbackFlag(flagWalk.files, FORBIDDEN_FLAG)).toEqual([])
  })

  describe('planted violations', () => {
    const planted = (path: string, raw: string) => ({
      path,
      raw,
      code: raw
    })

    it('self-test: a planted flag is caught in code, in a comment and as a longer name, a different flag is not', () => {
      const files = [
        planted('flag.ts', "const on = process.env['GAMELIB_SHORTCUTS']"),
        planted('doc.rs', '// GAMELIB_SHORTCUTS=0 falls back'),
        planted('longer.ts', "process.env['GAMELIB_SHORTCUTS_SWITCH']"),
        planted('other.ts', "process.env['GAMELIB_INFO_SLICE']")
      ]
      expect(findRollbackFlag(files, FORBIDDEN_FLAG)).toEqual([
        'flag.ts',
        'doc.rs',
        'longer.ts'
      ])
    })

    it('self-test: a planted tree holding the flag string is walked and the scan returns it', () => {
      const dir = mkdtempSync(join(tmpdir(), 'shortcuts-port-complete-'))
      try {
        mkdirSync(join(dir, 'src', 'backend', '__tests__'), { recursive: true })
        mkdirSync(join(dir, 'src-tauri', 'src'), { recursive: true })
        writeFileSync(
          join(dir, 'src', 'backend', 'a.ts'),
          "export const a = process.env['GAMELIB_SHORTCUTS']\n"
        )
        writeFileSync(
          join(dir, 'src-tauri', 'src', 'b.rs'),
          '// GAMELIB_SHORTCUTS is the old switch\nfn b() {}\n'
        )
        writeFileSync(
          join(dir, 'src', 'backend', 'clean.ts'),
          'export const clean = 1\n'
        )
        writeFileSync(
          join(dir, 'src', 'backend', '__tests__', 'gate.ts'),
          "process.env['GAMELIB_SHORTCUTS']\n"
        )
        const walk = walkStripped(['src', 'src-tauri/src'], { base: dir })
        expect(walk.count).toBe(3)
        expect(findRollbackFlag(walk.files, FORBIDDEN_FLAG)).toEqual([
          'src/backend/a.ts',
          'src-tauri/src/b.rs'
        ])
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('self-test: an empty directory walks no files and fails the flag-walk floor', () => {
      const dir = mkdtempSync(join(tmpdir(), 'shortcuts-port-complete-'))
      try {
        const walk = walkStripped(['src', 'src-tauri/src'], { base: dir })
        expect(walk.count).toBe(0)
        expect(findRollbackFlag(walk.files, FORBIDDEN_FLAG)).toEqual([])
        expect(() =>
          assertAtOrAboveFloor(
            'shortcutsPortComplete flag walk files',
            walk.count,
            SCANNED_FILES_FLOOR
          )
        ).toThrow(/shortcutsPortComplete flag walk files/)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })
})
