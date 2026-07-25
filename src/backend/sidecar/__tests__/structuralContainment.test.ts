/**
 * Unmocked proof that structural containment (Phase 34.2, gap cycle 3, plan
 * 34.2-19 — REQ-34.2-07/-14) holds with NO per-suite containment kit at
 * all. This file contains zero `jest.mock` calls of any kind — its
 * evidentiary value comes entirely from that fact: it carries none of
 * `testContainment.test.ts`'s (plan 34.2-18) per-suite `os`/`pathShim`/
 * `backend/logger/paths` mock blocks, and the real resolvers still land
 * inside `os.tmpdir()` anyway, because `src/backend/jest.setupContainment.ts`
 * (registered on the backend project's `setupFiles`) redirects
 * `HOME`/`USERPROFILE`/`APPDATA`/`LOCALAPPDATA`/`XDG_CONFIG_HOME`/
 * `XDG_STATE_HOME` before this file's own imports ever run. A suite that
 * needed its own mocks to stay contained would prove only that suite is
 * safe; this one proves the mechanism itself is safe by construction.
 *
 * RED PROOF (performed by hand 2026-07-26, recorded verbatim in
 * 34.2-19-SUMMARY.md): with the `setupFiles` entry in
 * `src/backend/jest.config.js` temporarily commented out, 5 of 6 tests FAIL
 * (Tests 1, 2, 3, 5, 6 — everything that depends on `jest.setupContainment
 * .ts`'s `jest.mock('os', ...)`/env redirection: `os.homedir()` itself,
 * `getLogFilePath({})`, `pathShim.getPath()`, the platform sweep, and the
 * anti-vacuity check, whose own assertion explicitly shows the resolved log
 * path IS this developer's real `~/Library/Logs/GameLib/gamelib.log`). Test
 * 4 (`constants/paths`'s `appFolder`/`userDataPath`/`fixesPath`) stays green
 * even without this mechanism — it transits `electron`'s pre-existing
 * DEFAULT jest automock (`src/backend/__mocks__/electron.ts`), whose
 * `app.getPath` is independently `tmpdir()`-based already, unrelated to this
 * plan's fix. Restored immediately afterwards; `git diff --exit-code
 * src/backend/jest.config.js` confirmed clean (no residue).
 */

import { homedir, tmpdir, userInfo } from 'os'
import { isAbsolute, join, relative, resolve } from 'path'

/** Tripwire idiom shared with `testContainment.test.ts`: a path is
 * "contained" inside `root` when its path relative to `root` neither starts
 * with `..` nor is itself absolute. */
function assertContained(root: string, candidate: string): void {
  const rel = relative(resolve(root), resolve(candidate))
  expect(rel.startsWith('..')).toBe(false)
  expect(isAbsolute(rel)).toBe(false)
}

/** Inverse of `assertContained` — asserts `candidate` is NOT inside `root`. */
function assertNotContained(root: string, candidate: string): void {
  const rel = relative(resolve(root), resolve(candidate))
  expect(rel.startsWith('..') || isAbsolute(rel)).toBe(true)
}

describe('structural containment proof — zero per-suite mocks (34.2 gap cycle 3, plan 34.2-19, REQ-34.2-07/-14)', () => {
  it('Test 1: os.homedir() resolves inside os.tmpdir() with zero jest.mock calls in this file', () => {
    assertContained(tmpdir(), homedir())
  })

  it('Test 2: the REAL, unmocked getLogFilePath({}) from backend/logger/paths resolves inside os.tmpdir()', () => {
    let logPath!: string
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { getLogFilePath } = require('backend/logger/paths')
      /* eslint-enable @typescript-eslint/no-require-imports */
      logPath = getLogFilePath({})
    })

    assertContained(tmpdir(), logPath)
  })

  it("Test 3: the REAL, unmocked getPath('userData') and getPath('appData') from ../pathShim resolve inside os.tmpdir()", () => {
    let userDataPath!: string
    let appDataPath!: string
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { getPath } = require('../pathShim')
      /* eslint-enable @typescript-eslint/no-require-imports */
      userDataPath = getPath('userData')
      appDataPath = getPath('appData')
    })

    assertContained(tmpdir(), userDataPath)
    assertContained(tmpdir(), appDataPath)
  })

  it('Test 4: the REAL, unmocked appFolder / userDataPath / fixesPath from backend/constants/paths resolve inside os.tmpdir()', () => {
    let appFolder!: string
    let userDataPath!: string
    let fixesPath!: string
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const paths = require('../../constants/paths')
      /* eslint-enable @typescript-eslint/no-require-imports */
      ;({ appFolder, userDataPath, fixesPath } = paths)
    })

    for (const candidate of [appFolder, userDataPath, fixesPath]) {
      assertContained(tmpdir(), candidate)
    }
  })

  it('Test 5 (platform sweep): a freshly-required pathShim still resolves appData inside os.tmpdir() when process.platform is forced to win32 then linux', () => {
    const originalPlatform = process.platform
    try {
      for (const forcedPlatform of ['win32', 'linux'] as const) {
        Object.defineProperty(process, 'platform', {
          value: forcedPlatform,
          configurable: true
        })

        let appDataPath!: string
        jest.isolateModules(() => {
          /* eslint-disable @typescript-eslint/no-require-imports */
          const { getPath } = require('../pathShim')
          /* eslint-enable @typescript-eslint/no-require-imports */
          appDataPath = getPath('appData')
        })

        assertContained(tmpdir(), appDataPath)
      }
    } finally {
      // WR-07 (gap-cycle-2 review): restored in a `finally` inside the test
      // body, never in `afterAll` — an `afterAll` restore leaks a fake
      // platform into subsequent files in the same worker on force exit.
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true
      })
    }
  })

  it('Test 6 (anti-vacuity): os.tmpdir() is NOT inside the developer real home, and the resolved log path is NOT the real gamelib.log', () => {
    // `os.userInfo().homedir` reads the OS passwd database directly, not
    // `process.env.HOME` -- genuinely independent of the redirection this
    // suite exists to prove, so this assertion cannot be trivially satisfied
    // by the same mechanism under test.
    const realHome = userInfo().homedir

    assertNotContained(realHome, tmpdir())

    let logPath!: string
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { getLogFilePath } = require('backend/logger/paths')
      /* eslint-enable @typescript-eslint/no-require-imports */
      logPath = getLogFilePath({})
    })

    const realGamelibLog = join(
      realHome,
      'Library',
      'Logs',
      'GameLib',
      'gamelib.log'
    )
    expect(logPath).not.toBe(realGamelibLog)
  })
})
