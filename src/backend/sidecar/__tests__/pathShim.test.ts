/**
 * First dedicated test of `getPath()`'s own switch behaviour (Phase 34.5
 * Plan 01 — Task 2, REQ-34.5-01).
 *
 * No prior suite exercises this: `electronUntouched.test.ts` and
 * `skeletonFlows.test.ts` both import `getPath` incidentally, only to build
 * a real config path for their OWN test's setup, never to assert on the
 * switch itself. This suite closes that gap, and is the one place that
 * pins the two loud-throw paths this plan's `exe` case introduces (T-34.5-01):
 * an unset OR empty `GAMELIB_SHELL_EXE` must throw, never silently return
 * an empty string that could be interpolated into a Steam shortcut VDF or a
 * macOS `.app` `run.sh`.
 *
 * Containment: `src/backend/jest.setupContainment.ts` runs via `setupFiles`
 * for every backend test file, BEFORE this file's own imports — it mocks
 * `os`/`node:os`'s `homedir()` to a disposable per-worker `mkdtemp` root and
 * redirects HOME/APPDATA/XDG_* env vars. `pathShim.ts`'s `desktop`/
 * `documents`/`home`/`appData`/`userData` cases all resolve through that
 * redirected `homedir()`, so every path this suite asserts on is already
 * contained by construction; this file adds no `jest.mock('os', ...)` of
 * its own (that would be redundant with, and could disagree with, the
 * structural mock already installed).
 */

import { homedir } from 'os'
import { realHomeAtSetup } from 'backend/jest.setupContainment'
import { getPath } from '../pathShim'

function overrideProcessPlatform(os: string): string {
  const original_os = process.platform

  Object.defineProperty(process, 'platform', {
    value: os,
    configurable: true
  })

  return original_os
}

describe('sidecar/pathShim getPath()', () => {
  let savedShellExe: string | undefined

  beforeEach(() => {
    savedShellExe = process.env.GAMELIB_SHELL_EXE
    delete process.env.GAMELIB_SHELL_EXE
  })

  afterEach(() => {
    // Restore exactly, including "was absent" — a leaked value here would
    // make a later run's "throws when unset" case pass for the wrong
    // reason, and plans 34.5-08/34.5-11 both add suites asserting on the
    // same env var.
    if (savedShellExe === undefined) {
      delete process.env.GAMELIB_SHELL_EXE
    } else {
      process.env.GAMELIB_SHELL_EXE = savedShellExe
    }
  })

  describe('pre-existing names — regression pins, this plan must not move them', () => {
    it('appData resolves to a non-empty string', () => {
      expect(getPath('appData')).toEqual(expect.any(String))
      expect(getPath('appData').length).toBeGreaterThan(0)
    })

    it('userData resolves to a non-empty string ending with the GameLib segment', () => {
      const userData = getPath('userData')
      expect(userData).toEqual(expect.any(String))
      expect(userData.length).toBeGreaterThan(0)
      expect(userData.endsWith('GameLib')).toBe(true)
    })

    it('temp resolves to a non-empty string', () => {
      expect(getPath('temp')).toEqual(expect.any(String))
      expect(getPath('temp').length).toBeGreaterThan(0)
    })

    it('home resolves to a non-empty string', () => {
      expect(getPath('home')).toEqual(expect.any(String))
      expect(getPath('home').length).toBeGreaterThan(0)
    })
  })

  describe("exe — GAMELIB_SHELL_EXE contract (D-10, T-34.5-01/02)", () => {
    it('returns exactly the value of GAMELIB_SHELL_EXE when set to a non-empty string', () => {
      process.env.GAMELIB_SHELL_EXE = '/Applications/GameLib.app/Contents/MacOS/GameLib'
      expect(getPath('exe')).toBe(
        '/Applications/GameLib.app/Contents/MacOS/GameLib'
      )
    })

    it('throws a named error when GAMELIB_SHELL_EXE is unset (undefined)', () => {
      delete process.env.GAMELIB_SHELL_EXE
      expect(() => getPath('exe')).toThrow(/GAMELIB_SHELL_EXE was not set/)
    })

    it('throws a named error when GAMELIB_SHELL_EXE is the empty string', () => {
      process.env.GAMELIB_SHELL_EXE = ''
      expect(() => getPath('exe')).toThrow(/GAMELIB_SHELL_EXE was not set/)
    })

    it('never returns an empty string — unset and empty both throw, not one of them', () => {
      delete process.env.GAMELIB_SHELL_EXE
      expect(() => getPath('exe')).toThrow()

      process.env.GAMELIB_SHELL_EXE = ''
      expect(() => getPath('exe')).toThrow()
    })
  })

  describe('desktop and documents — redirected-home resolution (D-09)', () => {
    it('desktop resolves to an absolute path ending in Desktop, under the redirected home', () => {
      const desktop = getPath('desktop')
      expect(desktop.endsWith('Desktop')).toBe(true)
      expect(desktop.startsWith(homedir())).toBe(true)
      expect(desktop).not.toBe(realHomeAtSetup)
      expect(desktop.startsWith(realHomeAtSetup)).toBe(false)
    })

    it('documents resolves to an absolute path ending in Documents, under the redirected home', () => {
      const documents = getPath('documents')
      expect(documents.endsWith('Documents')).toBe(true)
      expect(documents.startsWith(homedir())).toBe(true)
      expect(documents).not.toBe(realHomeAtSetup)
      expect(documents.startsWith(realHomeAtSetup)).toBe(false)
    })

    it('desktop resolves under Desktop on win32 too', () => {
      const originalPlatform = overrideProcessPlatform('win32')
      try {
        const desktop = getPath('desktop')
        expect(desktop.endsWith('Desktop')).toBe(true)
        expect(desktop.startsWith(homedir())).toBe(true)
      } finally {
        overrideProcessPlatform(originalPlatform)
      }
    })

    it('documents resolves under Documents on win32 too', () => {
      const originalPlatform = overrideProcessPlatform('win32')
      try {
        const documents = getPath('documents')
        expect(documents.endsWith('Documents')).toBe(true)
        expect(documents.startsWith(homedir())).toBe(true)
      } finally {
        overrideProcessPlatform(originalPlatform)
      }
    })

    it('desktop falls back to homedir()/Desktop on linux when XDG_DESKTOP_DIR is unset', () => {
      const originalPlatform = overrideProcessPlatform('linux')
      const savedXdgDesktop = process.env.XDG_DESKTOP_DIR
      delete process.env.XDG_DESKTOP_DIR
      try {
        const desktop = getPath('desktop')
        expect(desktop).toBe(`${homedir()}/Desktop`)
      } finally {
        overrideProcessPlatform(originalPlatform)
        if (savedXdgDesktop === undefined) {
          delete process.env.XDG_DESKTOP_DIR
        } else {
          process.env.XDG_DESKTOP_DIR = savedXdgDesktop
        }
      }
    })
  })

  describe('unimplemented names — unchanged throw-loudly contract', () => {
    it("getPath('shrubbery') still throws the unchanged 'is not shimmed' message", () => {
      expect(() => getPath('shrubbery')).toThrow(
        "[sidecar/pathShim] getPath('shrubbery') is not shimmed for the headless sidecar"
      )
    })
  })
})
