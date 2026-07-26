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
 * RED PROOF, ORIGINAL (performed by hand 2026-07-26, recorded verbatim in
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
 * plan's fix.
 *
 * RE-DERIVED 2026-07-26 (34.2-25, Task 3, WR-09): this file now carries a
 * top-level `import { containmentRoot, realHomeAtSetup } from
 * 'backend/jest.setupContainment'` (added directly above, to consume WR-09's
 * export). That import alone triggers `jest.setupContainment.ts`'s module
 * body — including its `jest.mock('os'/'node:os', ...)` registrations —
 * regardless of whether `setupFiles` also loads it, so with the `setupFiles`
 * entry commented out this file now largely re-establishes its own
 * containment by accident. Re-run by hand with `setupFiles` commented out:
 * only **1 of 12** tests FAILS — Test 1 (`expect(homedir()).toBe
 * (containmentRoot)`, received the developer's real home). Every other test
 * (2, 3, 4, 5, 6, 7, 8, 9 + both self-tests + the allowlist check) stays
 * GREEN, because each of them re-`require()`s `'os'`/`'node:os'`/
 * `backend/logger/paths`/`../pathShim`/`../../constants/paths` (via
 * `jest.isolateModules` or a fresh test-body-time `require()`) AFTER the
 * `jest.setupContainment` import has already run and registered both mocks
 * — only Test 1's top-of-file `homedir` binding (from `import { homedir,
 * tmpdir, userInfo } from 'os'` at the TOP of this file, evaluated BEFORE
 * the `jest.setupContainment` import below it) was captured from the real,
 * still-unmocked `os` module. This does NOT mean `setupFiles` is
 * unnecessary: it means THIS FILE, uniquely among the ~111 backend suites,
 * now carries a redundant containment path of its own (the WR-09 import) in
 * addition to `setupFiles` — every OTHER suite in the project has no such
 * import and depends on `setupFiles` entirely, which is what the module's
 * own docstring and WR-10's precondition continue to guarantee. Restored
 * immediately afterwards; `git diff --exit-code src/backend/jest.config.js`
 * confirmed clean (no residue).
 */

import { homedir, tmpdir, userInfo } from 'os'
import { isAbsolute, join, relative, resolve } from 'path'

// Named import, not `jest.isolateModules` + `require` -- Task 2's
// globalThis memoization (`__GAMELIB_JEST_CONTAINMENT_ROOT__` /
// `__GAMELIB_JEST_REAL_HOME__`) is what makes this safe: even if Jest
// re-evaluates `jest.setupContainment` for this file's own module
// registry, it reuses the SAME root/real-home rather than minting a
// second, disagreeing pair.
import { containmentRoot, realHomeAtSetup } from 'backend/jest.setupContainment'

/** Tripwire idiom shared with `testContainment.test.ts`: a path is
 * "contained" inside `root` when its path relative to `root` neither starts
 * with `..` nor is itself absolute. */
function assertContained(root: string, candidate: string): void {
  const rel = relative(resolve(root), resolve(candidate))
  expect(rel.startsWith('..')).toBe(false)
  expect(isAbsolute(rel)).toBe(false)
}

describe('structural containment proof — zero per-suite mocks (34.2 gap cycle 3, plan 34.2-19, REQ-34.2-07/-14)', () => {
  it('Test 1: os.homedir() resolves inside os.tmpdir() with zero jest.mock calls in this file', () => {
    // Strengthened from "inside tmpdir()" to exact identity (34.2-25,
    // Task 3): homedir() must be THE containment root, not merely some
    // path under tmpdir().
    expect(homedir()).toBe(containmentRoot)
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

  it('Test 4: the REAL, unmocked appFolder / userDataPath / fixesPath / flatpakHome from backend/constants/paths resolve inside os.tmpdir()', () => {
    let appFolder!: string
    let userDataPath!: string
    let fixesPath!: string
    let flatpakHome!: string
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const paths = require('../../constants/paths')
      /* eslint-enable @typescript-eslint/no-require-imports */
      ;({ appFolder, userDataPath, fixesPath, flatpakHome } = paths)
    })

    // flatpakHome (WR-12): nothing previously pinned its value, so a future
    // change to the `env.XDG_DATA_HOME?.replace('/data','') || homedir()`
    // logic could silently alter behaviour under test with no signal.
    for (const candidate of [appFolder, userDataPath, fixesPath, flatpakHome]) {
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

  it('Test 6 (anti-vacuity, portable): the redirection target is genuinely different from the real home, and the resolved log path lands inside the per-run containment root', () => {
    // Rewritten 34.2-25 Task 3 (WR-11). The prior version used
    // `os.userInfo().homedir` as its "independent" real-home reference --
    // that stopped being independent the moment Task 2 redirected
    // `userInfo()` too (it now returns `containmentRoot`, same as
    // `homedir()`), so the old assertion would trivially pass for the WRONG
    // reason. `realHomeAtSetup` (captured in jest.setupContainment.ts
    // BEFORE any mock is installed) is the correct independent reference
    // now. The prior version also hardcoded the macOS
    // `Library/Logs/GameLib/gamelib.log` layout, making the check itself
    // vacuous on Linux/Windows (`assertNotContained(realHome, tmpdir())`
    // also fails spuriously wherever `TMPDIR` sits under `$HOME`), and
    // called `userInfo()` unguarded, which throws
    // (`uv_os_get_passwd`) in containerised CI with no `/etc/passwd` entry
    // for the running uid.
    expect(containmentRoot).not.toBe(realHomeAtSetup)

    let logPath!: string
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { getLogFilePath } = require('backend/logger/paths')
      /* eslint-enable @typescript-eslint/no-require-imports */
      logPath = getLogFilePath({})
    })

    // Strictly stronger than the old `assertContained(tmpdir(), ...)`: the
    // resolved log path must land inside THIS per-run mkdtemp root, which
    // cannot coincide with the real home on any platform, on any of
    // `getBaseLogPath()`'s three platform branches, regardless of where
    // `TMPDIR` happens to sit.
    assertContained(containmentRoot, logPath)
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
