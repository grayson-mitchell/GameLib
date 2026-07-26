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

// ── CR-02 detection gates (gap cycle 4, plan 34.2-25, REQ-34.2-07/-14) ─────
//
// These three gates would have caught CR-02: `jest.mock('os')` alone leaves
// `require('node:os')` resolving to the developer's REAL home (measured in
// the gap-cycle-3 review: os.homedir() -> containment root, node:os.homedir()
// -> /Users/graysonmitchell, sameObject: false), and `os.userInfo().homedir`
// is not redirected by either specifier. Task 1 of 34.2-25 adds these gates
// FIRST, against the UNMODIFIED jest.setupContainment.ts, and Tests 7 and 8
// are observed failing before Task 2 touches that file -- an intrinsic RED,
// not a hand-revert or synthetic stub, because three straight gap cycles
// shipped a fix whose own tests were structurally incapable of detecting the
// shortfall it left behind.
//
// `readdirSync`/`readFileSync`/`basename` are pulled in via require() here,
// deliberately NOT added to this file's top-level import block, so this
// task's diff is purely additive below the pre-existing Tests 1-6.
/* eslint-disable @typescript-eslint/no-require-imports */
const { readdirSync, readFileSync } = require('fs') as typeof import('fs')
const { basename } = require('path') as typeof import('path')
/* eslint-enable @typescript-eslint/no-require-imports */

// Declared exclusion allowlist for the Test 9 source gate below. Every entry
// must name a file that legitimately references BOTH the 'node:os' specifier
// AND one of the forbidden identifiers (homedir/userInfo) -- proven by the
// anti-vacuity assertion inside Test 9's own describe block, not assumed.
const NODE_OS_GATE_EXEMPT_FILES = [
  // Legitimately names both identifiers because it IS the redirection: it
  // registers the homedir/userInfo overrides for both specifiers (Task 2 of
  // this plan adds the node:os registration here).
  'jest.setupContainment.ts',
  // This very file. Tests 7 and 8 above give it the identical legitimate
  // dual reference (Test 7 require()s 'node:os' and calls homedir() on it;
  // Test 8 calls userInfo()), stacked on the pre-existing
  // `import { homedir, tmpdir, userInfo } from 'os'` at the top of this
  // file. Without this entry the gate flags the file it lives in and
  // `toEqual([])` can never pass -- the exclusion is not a convenience, it
  // is what makes the gate satisfiable.
  'structuralContainment.test.ts',
  // FORWARD DECLARATION, deliberately added in this wave-1 plan (34.2-25).
  // Plan 34.2-29 (wave 2) adds a `hasContainmentOsMock` predicate to
  // testContainment.test.ts whose regexes necessarily name the 'node:os'
  // specifier alongside the homedir/userInfo overrides, so it will match
  // this gate the moment 34.2-29 lands. 34.2-29 cannot add the exclusion
  // itself: this allowlist lives in structuralContainment.test.ts, which
  // belongs to 34.2-25's files_modified, and editing it from 34.2-29 would
  // violate the wave's file-ownership rule. Declaring it here is the only
  // wave-legal placement -- do not delete this entry as seemingly unused;
  // it becomes load-bearing in wave 2.
  'testContainment.test.ts'
]

// Why an allowlist rather than exempting `__tests__` wholesale: the defect
// class CR-02 protects against is a *production* module reopening the hole,
// which might argue for exempting the test tree entirely -- but eight
// backend test files already import from 'node:os' today, and this phase's
// entire history is test files destroying real developer data
// (bootstrap.test.ts was reproduced LIVE three times clobbering the real
// ~/Library/Logs/GameLib/gamelib.log). Exempting the whole test tree would
// reintroduce containment-by-omission -- precisely the accepted-debt pattern
// plan 34.2-19 was written to eliminate, and which rotted within one gap
// cycle. A three-entry declared list keeps the gate's teeth over every
// backend file including tests, and a fourth file needing an entry must be a
// conscious, justified edit -- the same declared-list discipline this phase
// already uses for STRUCTURALLY_CONTAINED_SUITES and IN_SCOPE_SUITES.

/** Strips `//` line comments and block comments from `source`, local to this
 * gate (deliberately NOT importing testContainment.test.ts's comment-
 * stripping helper, which belongs to a different plan's file). */
function stripCommentsForNodeOsGate(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

/** A file that touches the 'node:os' specifier at all may not mention either
 * forbidden identifier anywhere in its (comment-stripped) source. This is
 * deliberately conservative rather than import-clause-scoped: a namespace
 * import (`import * as os from 'node:os'`) makes an import-clause-only regex
 * unsound (`os.homedir()` would never appear inside the import clause
 * itself), so the rule has to be "the file may not mention the identifiers
 * at all" once it references the specifier anywhere. */
function usesForbiddenNodeOsBinding(source: string): boolean {
  const stripped = stripCommentsForNodeOsGate(source)
  if (!stripped.includes('node:os')) return false
  return /\bhomedir\b/.test(stripped) || /\buserInfo\b/.test(stripped)
}

/** Recursively collects every `*.ts` file under `dir`, skipping
 * `node_modules`. */
function collectBackendTsFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectBackendTsFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath)
    }
  }
  return files
}

describe('CR-02 detection gates (gap cycle 4, plan 34.2-25, REQ-34.2-07/-14)', () => {
  it("Test 7: require('node:os').homedir() resolves identically to require('os').homedir()", () => {
    // A runtime require() of the literal specifier, not a top-level import --
    // the gate must observe what 'node:os' actually resolves to under Jest's
    // module registry, which keys the node:-prefixed builtin separately from
    // the bare one (the entire CR-02 defect).
    /* eslint-disable @typescript-eslint/no-require-imports */
    const bare = require('os') as typeof import('os')
    const prefixed = require('node:os') as typeof import('os')
    /* eslint-enable @typescript-eslint/no-require-imports */
    expect(prefixed.homedir()).toBe(bare.homedir())
    assertContained(tmpdir(), prefixed.homedir())
  })

  it('Test 8: os.userInfo().homedir is redirected identically to os.homedir()', () => {
    let redirectedUserInfo: ReturnType<typeof userInfo>
    try {
      redirectedUserInfo = userInfo()
    } catch (error) {
      // uv_os_get_passwd: userInfo() reads the OS passwd database directly
      // and throws when the running uid has no /etc/passwd entry -- routine
      // under containerised CI (`docker --user $(id -u)`). Re-thrown with an
      // explanatory message so that failure mode is legible at the failure
      // site rather than surfacing as an unrelated SystemError (WR-11).
      throw new Error(
        `os.userInfo() threw -- likely uv_os_get_passwd (no /etc/passwd entry for this uid, routine under containerised CI with --user $(id -u)): ${String(error)}`
      )
    }
    expect(redirectedUserInfo.homedir).toBe(homedir())
  })

  describe('Test 9: no *.ts file under src/backend reaches homedir/userInfo through the node:os specifier', () => {
    const backendRoot = resolve(__dirname, '..', '..')

    it('the source gate finds zero violations outside the declared allowlist', () => {
      const violations: string[] = []
      for (const filePath of collectBackendTsFiles(backendRoot)) {
        if (NODE_OS_GATE_EXEMPT_FILES.includes(basename(filePath))) continue
        const source = readFileSync(filePath, 'utf8')
        if (usesForbiddenNodeOsBinding(source)) {
          violations.push(relative(backendRoot, filePath))
        }
      }
      expect(violations).toEqual([])
    })

    it('self-test A: a synthetic node:os homedir import is REJECTED', () => {
      const synthetic = `import { homedir } from 'node:os'\nexport const x = homedir()`
      expect(usesForbiddenNodeOsBinding(synthetic)).toBe(true)
    })

    it('self-test B: a synthetic node:os tmpdir import is ACCEPTED (legitimate existing usage)', () => {
      const synthetic = `import { tmpdir } from 'node:os'\nexport const x = tmpdir()`
      expect(usesForbiddenNodeOsBinding(synthetic)).toBe(false)
    })

    it('the exclusion allowlist is exactly the 3 declared entries, each naming a file that exists on disk, and is load-bearing (not decorative)', () => {
      expect(NODE_OS_GATE_EXEMPT_FILES).toHaveLength(3)
      expect(new Set(NODE_OS_GATE_EXEMPT_FILES)).toEqual(
        new Set([
          'jest.setupContainment.ts',
          'structuralContainment.test.ts',
          'testContainment.test.ts'
        ])
      )

      const allFiles = collectBackendTsFiles(backendRoot)
      let atLeastOneLoadBearing = false
      for (const exemptName of NODE_OS_GATE_EXEMPT_FILES) {
        const match = allFiles.find((f) => basename(f) === exemptName)
        expect(match).toBeDefined()
        if (match && usesForbiddenNodeOsBinding(readFileSync(match, 'utf8'))) {
          atLeastOneLoadBearing = true
        }
      }
      // Proves the exclusions are load-bearing, not a set of decorative
      // names that quietly disable the gate -- at least one exempted file
      // (this file, as of this task) genuinely trips the predicate.
      expect(atLeastOneLoadBearing).toBe(true)
    })
  })
})
