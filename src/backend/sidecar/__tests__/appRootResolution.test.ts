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
 */

import { readFileSync } from 'node:fs'
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
