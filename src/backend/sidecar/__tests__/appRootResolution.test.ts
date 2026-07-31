/**
 * Phase 34.5 Plan 16, Task 3 (G-1, REQ-34.5-12/REQ-34.5-13).
 *
 * Proves both arms of `electronStub.app.getAppPath()`'s `GAMELIB_APP_ROOT` handoff and, from
 * the JS side, the Rust half of that handoff (mirroring
 * `src/backend/__tests__/tauriShellSource.test.ts`'s existing approach for asserting against
 * real `main.rs` source text rather than reimplementing the Rust logic here).
 *
 * Root cause this closes: under the sidecar, `getAppPath()` previously returned
 * `process.cwd()` unconditionally, which is `src-tauri/` — so `publicDir`
 * (`backend/constants/paths.ts:73`) resolved to a directory that does not exist and every
 * bundled runner binary (`legendary`/`gogdl`/`nile`/`comet`) ENOENT'd on spawn. See
 * `.planning/phases/34.5-.../34.5-APP-ROOT-SWEEP.md` for the full consumer sweep this one
 * seam repairs.
 *
 * Containment: this suite declares no `jest.mock('../pathShim', ...)`, so it belongs in
 * `testContainment.test.ts`'s `STRUCTURALLY_CONTAINED_SUITES`, not `IN_SCOPE_SUITES` — see
 * that file's own classification comment for this suite.
 *
 * EXTENDED Phase 34.5 Plan 17 (G-1, REQ-34.5-12/REQ-34.5-13) — Task 2, see the
 * "real-filesystem sidecar-conditions" describe block below. The suite above proves both JS-side
 * arms of `getAppPath()` in isolation; it does NOT prove that a correctly-resolved app root
 * actually reaches a real bundled asset on disk. `34.5-16-SUMMARY.md` records the full suite green
 * at 3447/3447 while the underlying app-root defect was live in production, because jest runs
 * with `process.cwd()` already at the repository root, where `publicDir` (`paths.ts:73`) resolves
 * correctly BY ACCIDENT. A test that recomputes the source's own `join(...)` arithmetic and
 * compares two strings proves nothing about that failure mode (the standing
 * `live-gate-beats-green-suite-three-times` lesson) — the block below instead forces
 * `process.cwd()` to `<repo>/src-tauri`, the REAL sidecar condition, and asserts against the REAL
 * filesystem, resolving `publicDir` through the actual production code path
 * (`backend/constants/paths.ts`) rather than restating it.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  stripSourceComments,
  stripTrailingLineComment
} from '../../testUtils/stripSourceComments'
import { app } from '../electronStub'

const MAIN_RS_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'src-tauri',
  'src',
  'main.rs'
)

/** Mirrors tauriShellSource.test.ts's loadMainRsCode — comment-stripped source only. */
function loadMainRsCode(): string {
  const raw = readFileSync(MAIN_RS_PATH, 'utf-8')
  return stripSourceComments(raw)
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .map(stripTrailingLineComment)
    .join('\n')
}

/**
 * Slices `code` from `startMarker` (inclusive) up to (but not including) `endMarker` — the
 * same "function body" extraction shape `tauriShellSource.test.ts`'s `extractArmBody` already
 * uses. Throws loudly via the `toBeGreaterThan(-1)` assertions rather than silently slicing an
 * empty or wrong range if either marker has drifted.
 */
function extractFnBody(
  code: string,
  startMarker: string,
  endMarker: string
): string {
  const start = code.indexOf(startMarker)
  expect(start).toBeGreaterThan(-1)
  const end = code.indexOf(endMarker, start)
  expect(end).toBeGreaterThan(start)
  return code.slice(start, end)
}

describe('electronStub.app.getAppPath() — GAMELIB_APP_ROOT env-set arm', () => {
  let saved: string | undefined

  beforeEach(() => {
    saved = process.env.GAMELIB_APP_ROOT
  })

  afterEach(() => {
    // Restore exactly, including "was absent" -- a leaked value here would make a later run's
    // unset-arm assertions pass for the wrong reason (pathShim.test.ts's own precedent for
    // GAMELIB_SHELL_EXE).
    if (saved === undefined) {
      delete process.env.GAMELIB_APP_ROOT
    } else {
      process.env.GAMELIB_APP_ROOT = saved
    }
  })

  it('returns process.env.GAMELIB_APP_ROOT verbatim when set and non-empty', () => {
    process.env.GAMELIB_APP_ROOT = '/Users/dev/GameLib'
    expect(app.getAppPath()).toBe('/Users/dev/GameLib')
  })

  it('returns the value verbatim even when it contains a space, no trimming or quoting', () => {
    process.env.GAMELIB_APP_ROOT = '/Users/dev/Game Lib'
    expect(app.getAppPath()).toBe('/Users/dev/Game Lib')
  })
})

describe('electronStub.app.getAppPath() — unset/empty arms fall back to process.cwd()', () => {
  let saved: string | undefined
  let cwdSpy: jest.SpyInstance<string, []>

  beforeEach(() => {
    saved = process.env.GAMELIB_APP_ROOT
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue('/fake/cwd')
  })

  afterEach(() => {
    cwdSpy.mockRestore()
    if (saved === undefined) {
      delete process.env.GAMELIB_APP_ROOT
    } else {
      process.env.GAMELIB_APP_ROOT = saved
    }
  })

  it('returns process.cwd() when GAMELIB_APP_ROOT is unset', () => {
    delete process.env.GAMELIB_APP_ROOT
    expect(app.getAppPath()).toBe('/fake/cwd')
  })

  it('returns process.cwd() when GAMELIB_APP_ROOT is the empty string — REQ-34.5-13: the Electron build and the jest suite observe no behaviour change', () => {
    process.env.GAMELIB_APP_ROOT = ''
    expect(app.getAppPath()).toBe('/fake/cwd')
  })
})

describe('main.rs sets GAMELIB_APP_ROOT on BOTH sidecar spawn paths (Rust half of the handoff)', () => {
  it('spawn_sidecar_dev sets GAMELIB_APP_ROOT on the child environment', () => {
    const code = loadMainRsCode()
    const body = extractFnBody(
      code,
      'fn spawn_sidecar_dev(',
      'fn spawn_sidecar_packaged('
    )
    expect(body).toContain('.env("GAMELIB_APP_ROOT"')
  })

  it('spawn_sidecar_packaged sets GAMELIB_APP_ROOT on the child environment', () => {
    const code = loadMainRsCode()
    const body = extractFnBody(
      code,
      'fn spawn_sidecar_packaged(',
      'fn spawn_sidecar('
    )
    expect(body).toContain('.env("GAMELIB_APP_ROOT"')
  })

  it('the resolver helper is AppHandle-free and never panics on failure', () => {
    const code = loadMainRsCode()
    expect(code).toContain('fn app_root_env_value(')
    // Same non-panicking contract as shell_exe_env_value -- unwrap_or_else on the Err arm,
    // never .unwrap()/.expect() on the Result itself.
    const body = extractFnBody(
      code,
      'fn app_root_env_value(',
      'fn resolve_dev_app_root('
    )
    expect(body).not.toMatch(/\.unwrap\(\)|\.expect\(/)
  })
})

// Phase 34.5 Plan 17, Task 2 (G-1, REQ-34.5-12/REQ-34.5-13).
//
// THE ARITHMETIC TRAP (read this before touching anything below): the full suite ran green at
// 3447/3447 (`34.5-16-SUMMARY.md`) while the app-root defect was live in production. That
// happened because jest's own `process.cwd()` is already the repository root, where `publicDir`
// (`backend/constants/paths.ts:73`) resolves correctly BY ACCIDENT — no test in that 3447 ever
// forced `cwd` to the real sidecar condition (`src-tauri/`). A test that recomputes the same
// `join(...)` the source computes and compares two strings would repeat exactly that mistake and
// prove nothing (the standing `live-gate-beats-green-suite-three-times` lesson). Every assertion
// below therefore does two things together: (1) forces `process.cwd()` to `<repo>/src-tauri`, the
// literal sidecar condition, and (2) calls the REAL, unmocked `node:fs` `existsSync` against
// paths resolved by the actual production code path (`backend/constants/paths.ts`, required fresh
// with `electron` swapped for the real, non-mocked `electronStub` — never restated by hand).
describe('real-filesystem sidecar-conditions: publicDir resolution under cwd=src-tauri (Phase 34.5 G-1, plan 34.5-17)', () => {
  // Derived from THIS file's own __dirname (src/backend/sidecar/__tests__), never from
  // process.cwd() -- this block mocks process.cwd() for the very things under test, so anything
  // derived from it here would be testing its own mock.
  const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
  const SRC_TAURI_DIR = join(REPO_ROOT, 'src-tauri')

  let cwdSpy: jest.SpyInstance<string, []>
  let savedAppRoot: string | undefined

  beforeEach(() => {
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(SRC_TAURI_DIR)
    savedAppRoot = process.env.GAMELIB_APP_ROOT
  })

  afterEach(() => {
    cwdSpy.mockRestore()
    // Restore exactly, including "was absent" -- see this file's own established precedent above.
    if (savedAppRoot === undefined) {
      delete process.env.GAMELIB_APP_ROOT
    } else {
      process.env.GAMELIB_APP_ROOT = savedAppRoot
    }
  })

  /**
   * Requires `backend/constants/paths` fresh inside a `jest.isolateModules` sandbox, with
   * `electron` resolved to the REAL, unmocked `electronStub` module (not the project-wide
   * `jest.mock('electron')` automock — this suite never calls that). This means `publicDir` is
   * computed by `paths.ts:73` itself, against this test's mocked `process.cwd()` and whatever
   * `GAMELIB_APP_ROOT` the calling test set, exactly the way the real sidecar computes it --
   * never recomputed by this test file.
   */
  function requirePathsUnderSidecarConditions(): typeof import('../../constants/paths') {
    let isolatedPaths!: typeof import('../../constants/paths')
    jest.isolateModules(() => {
      jest.doMock('electron', () => jest.requireActual('../electronStub'))
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      isolatedPaths = require('../../constants/paths')
    })
    return isolatedPaths
  }

  it('negative arm: with GAMELIB_APP_ROOT unset, the app-root fallback resolves a public directory that does NOT exist on disk -- this is the exact defect shape that cost live-gate items 1/2/3', () => {
    delete process.env.GAMELIB_APP_ROOT

    const paths = requirePathsUnderSidecarConditions()

    expect(paths.publicDir).toBe(join(SRC_TAURI_DIR, 'public'))
    expect(existsSync(paths.publicDir)).toBe(false)
  })

  it('positive arm: with GAMELIB_APP_ROOT set to the dev value the Rust shell actually hands down, every sidecar-reachable asset resolves to a path that EXISTS on the real filesystem', () => {
    process.env.GAMELIB_APP_ROOT = REPO_ROOT

    const paths = requirePathsUnderSidecarConditions()

    expect(paths.publicDir).toBe(join(REPO_ROOT, 'public'))

    // All four bundled runner binaries for the CURRENT host arch/platform -- the exact family
    // that ENOENT'd six layers away at launcher.ts's callRunner (34.5-LIVE-GATE.md root cause).
    for (const binaryName of ['legendary', 'gogdl', 'nile', 'comet']) {
      const binaryPath = join(
        paths.publicDir,
        'bin',
        process.arch,
        process.platform,
        binaryName
      )
      expect(existsSync(binaryPath)).toBe(true)
    }

    expect(existsSync(join(paths.publicDir, 'locales'))).toBe(true)
    expect(existsSync(join(paths.publicDir, 'changelog.json'))).toBe(true)
    expect(existsSync(join(paths.publicDir, 'icon.png'))).toBe(true)
    expect(existsSync(join(paths.publicDir, 'webviewPreload.js'))).toBe(true)
  })
})
