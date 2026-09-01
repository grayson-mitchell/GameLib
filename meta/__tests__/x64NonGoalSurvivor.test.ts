/**
 * D-07 / D-08 (phase 34.18): `x64` is overloaded four ways in this repo and
 * only ONE of them -- the macOS build/packaging arch -- retires in this
 * phase. This file asserts NON-goals: it pins that the other categories
 * still exist after every later sweep in this phase (and, per
 * quick-260901-i8i, after the Intel-Mac-drop sweep too).
 *
 *   1'. Tauri-era win32 helper resource keys -- `../build/bin/x64/win32/*.exe`
 *                                     in `src-tauri/tauri.macos.conf.json`'s
 *                                     `bundle.resources` (the macOS package
 *                                     legitimately bundles win32 x64 GOG
 *                                     Galaxy / Epic helpers). Replaces the
 *                                     original category 1, which pinned the
 *                                     same non-goal in the now-deleted
 *                                     `electron-builder.yml` (see the note
 *                                     below category 1's old home).
 *   2.  linux/windows download keys -- six exact literals in
 *                                     `meta/downloadHelperBinaries.ts`.
 *   2'. surviving comet/helper literals -- relocated here (quick-260901-i8i)
 *                                     so this pin lives in a file the
 *                                     Intel-Mac-drop sweep does not edit:
 *                                     the seven comet/helper literals that
 *                                     survive after `comet-x86_64-apple-darwin`
 *                                     is removed from
 *                                     `meta/downloadHelperBinaries.ts`.
 *   3.  runtime x64 fallback       -- the `x64Path` box64 affordance for
 *                                     Linux ARM at `src/backend/utils.ts`.
 *
 * This project's record is that a sweep audited only for *under*-reach
 * misses *over*-reach entirely (D-08). A bare `x64` grep hit during a later
 * plan's sweep is NOT evidence of an incomplete sweep -- it may be one of
 * these categories, which must survive untouched. If this file goes red,
 * the correct response is to REVERT the over-reaching edit that caused it,
 * never to relax an assertion here.
 *
 * Unlike every other gate in this phase, this file's known-bad input is not
 * HEAD -- HEAD already has the right counts. It was proven load-bearing by
 * mutation at plan time (copy the target file to a scratch path outside the
 * repo, delete one reference, confirm the assertion fails, discard the
 * copy) rather than committing a second permanent test, following the
 * "vacuity guard" idiom at `meta/__tests__/buildRunnersOnedir.test.ts:765`
 * and the "vacuity control" idiom at
 * `meta/__tests__/verifyRunnerBundle.test.ts:373`. Both mutation
 * observations are quoted verbatim in this plan's SUMMARY.md.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')

const TAURI_MACOS_CONF = JSON.parse(
  readFileSync(join(ROOT, 'src-tauri', 'tauri.macos.conf.json'), 'utf-8')
) as { bundle: { resources: Record<string, string> } }

// CATEGORY 1 (win32 helper path keys in `electron-builder.yml`) WAS RETIRED by Phase 35
// Plan 14, the Electron cutover, which DELETED `electron-builder.yml` itself.
//
// This file's header says that if it goes red the correct response is to REVERT the
// over-reaching edit, never to relax an assertion here. That instruction is right and is
// deliberately NOT being relaxed: it guards against a SWEEP over-reaching. This is the
// documented exception -- the subject file was removed wholesale by a planned, decided
// cutover (35-14 commit C), not clipped by a sweep that was aiming at something else.
// There is no edit to revert, and no `x64` reference survives in a file that no longer
// exists. Categories 2 and 3 are untouched and still assert exactly what they did.
//
// This mattered more than the one lost assertion: the module-scope readFileSync below
// used to include `electron-builder.yml`, so once that file was deleted the ENOENT took
// the WHOLE suite down with it -- categories 2 and 3 stopped running at all rather than
// failing visibly. Removing the dead read is what puts those two live guards back in
// service.
//
// CATEGORY 1' (quick-260901-i8i) is the Tauri-era replacement: the same non-goal --
// win32 x64 GOG Galaxy / Epic helpers legitimately bundled inside the macOS package --
// now lives in `src-tauri/tauri.macos.conf.json`'s `bundle.resources`. It is asserted
// below via the module-scope `TAURI_MACOS_CONF` JSON parse, on the parsed key set rather
// than a substring match, so a key rename (not just a deletion) cannot pass silently.
const DOWNLOAD_HELPER_BINARIES_SOURCE = readFileSync(
  join(ROOT, 'meta', 'downloadHelperBinaries.ts'),
  'utf-8'
)

const BACKEND_UTILS_SOURCE = readFileSync(
  join(ROOT, 'src', 'backend', 'utils.ts'),
  'utf-8'
)

describe('D-07/D-08: x64 non-goal survivor gate', () => {
  it("category 1' -- Tauri-era win32 helper resource keys: src-tauri/tauri.macos.conf.json's bundle.resources keeps both x64/win32 helper keys (parsed key set, not a substring, so a key rename cannot pass)", () => {
    const resourceKeys = Object.keys(TAURI_MACOS_CONF.bundle.resources)
    expect(resourceKeys).toContain(
      '../build/bin/x64/win32/EpicGamesLauncher.exe'
    )
    expect(resourceKeys).toContain(
      '../build/bin/x64/win32/GalaxyCommunication.exe'
    )
  })

  it('category 2 -- linux/windows download keys: meta/downloadHelperBinaries.ts keeps all six literals individually (not a regex count, which would also match the darwin keys this phase removes and the unrelated comet-* keys)', () => {
    expect(DOWNLOAD_HELPER_BINARIES_SOURCE).toContain('legendary_linux_x64')
    expect(DOWNLOAD_HELPER_BINARIES_SOURCE).toContain(
      'legendary_windows_x64.exe'
    )
    expect(DOWNLOAD_HELPER_BINARIES_SOURCE).toContain('gogdl_linux_x86_64')
    expect(DOWNLOAD_HELPER_BINARIES_SOURCE).toContain(
      'gogdl_windows_x86_64.exe'
    )
    expect(DOWNLOAD_HELPER_BINARIES_SOURCE).toContain('nile_linux_x86_64')
    expect(DOWNLOAD_HELPER_BINARIES_SOURCE).toContain('nile_windows_x86_64.exe')
  })

  it('category 3 -- runtime x64 fallback: src/backend/utils.ts keeps the x64Path box64 affordance for Linux ARM (Deferred Ideas: removing its darwin arm was offered and declined -- the branch is inert, not harmful)', () => {
    expect(BACKEND_UTILS_SOURCE).toContain('x64Path')
    expect(BACKEND_UTILS_SOURCE).toContain(
      "join(publicDir, 'bin', 'x64', process.platform"
    )
  })

  it("category 2' -- surviving comet/helper literals (relocated here, quick-260901-i8i, so this pin lives in a file the Intel-Mac-drop sweep does not edit): all seven survivors present individually", () => {
    expect(DOWNLOAD_HELPER_BINARIES_SOURCE).toContain(
      'comet-aarch64-apple-darwin'
    )
    expect(DOWNLOAD_HELPER_BINARIES_SOURCE).toContain(
      'comet-x86_64-unknown-linux-gnu'
    )
    expect(DOWNLOAD_HELPER_BINARIES_SOURCE).toContain(
      'comet-aarch64-unknown-linux-gnu'
    )
    expect(DOWNLOAD_HELPER_BINARIES_SOURCE).toContain(
      'comet-x86_64-pc-windows-msvc.exe'
    )
    expect(DOWNLOAD_HELPER_BINARIES_SOURCE).toContain(
      'comet-aarch64-pc-windows-msvc.exe'
    )
    expect(DOWNLOAD_HELPER_BINARIES_SOURCE).toContain(
      'GalaxyCommunication-dummy.exe'
    )
    expect(DOWNLOAD_HELPER_BINARIES_SOURCE).toContain('EpicGamesLauncher.exe')
    expect(DOWNLOAD_HELPER_BINARIES_SOURCE).not.toContain(
      'comet-x86_64-apple-darwin'
    )
  })
})
