/**
 * D-07 / D-08 (phase 34.18): `x64` is overloaded four ways in this repo and
 * only ONE of them -- the macOS build/packaging arch -- retires in this
 * phase. This file asserts NON-goals: it pins that the other three
 * categories still exist after every later sweep in this phase.
 *
 *   1. win32 helper path key      -- `build/bin/x64/win32/*.exe` in
 *                                     `electron-builder.yml` (7 refs,
 *                                     including inside the `mac:` files
 *                                     block -- the macOS package legitimately
 *                                     bundles win32 x64 GOG Galaxy / Epic
 *                                     helpers).
 *   2. linux/windows download keys -- six exact literals in
 *                                     `meta/downloadHelperBinaries.ts`.
 *   3. runtime x64 fallback       -- the `x64Path` box64 affordance for
 *                                     Linux ARM at `src/backend/utils.ts`.
 *
 * This project's record is that a sweep audited only for *under*-reach
 * misses *over*-reach entirely (D-08). A bare `x64` grep hit during a later
 * plan's sweep is NOT evidence of an incomplete sweep -- it may be one of
 * these three, which must survive untouched. If this file goes red, the
 * correct response is to REVERT the over-reaching edit that caused it,
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

const ELECTRON_BUILDER_YML = readFileSync(
  join(ROOT, 'electron-builder.yml'),
  'utf-8'
)

const DOWNLOAD_HELPER_BINARIES_SOURCE = readFileSync(
  join(ROOT, 'meta', 'downloadHelperBinaries.ts'),
  'utf-8'
)

const BACKEND_UTILS_SOURCE = readFileSync(
  join(ROOT, 'src', 'backend', 'utils.ts'),
  'utf-8'
)

describe('D-07/D-08: x64 non-goal survivor gate', () => {
  it('category 1 -- win32 helper path key: electron-builder.yml keeps all 7 build/bin/x64/win32/ refs, including the two inside the mac: files block', () => {
    const occurrences = ELECTRON_BUILDER_YML.match(/build\/bin\/x64\/win32\//g)
    expect(occurrences).toHaveLength(7)

    // The mac: block runs from the `mac:` key to the `dmg:` key that
    // follows it -- slice on those literal keys rather than counting
    // indentation, matching the interfaces doc's own description.
    const macBlockStart = ELECTRON_BUILDER_YML.indexOf('\nmac:')
    const macBlockEnd = ELECTRON_BUILDER_YML.indexOf('\ndmg:', macBlockStart)
    expect(macBlockStart).toBeGreaterThan(-1)
    expect(macBlockEnd).toBeGreaterThan(macBlockStart)
    const macBlock = ELECTRON_BUILDER_YML.slice(macBlockStart, macBlockEnd)

    expect(macBlock).toContain('build/bin/x64/win32/GalaxyCommunication.exe')
    expect(macBlock).toContain('build/bin/x64/win32/EpicGamesLauncher.exe')
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
})
