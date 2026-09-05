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
 * `XDG_STATE_HOME`/`XDG_DATA_HOME`/`XDG_CACHE_HOME` (all eight — the list
 * here named six until 2026-08-23) before this file's own imports ever run.
 * A suite that needed its own mocks to stay contained would prove only that
 * suite is safe; this one proves the mechanism itself is safe by
 * construction.
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
 * BROKEN, THEN RESTORED (WR-05, gap cycle 4). Between 2026-07-26 and
 * 2026-08-23 the claim in the first paragraph was FALSE. Plan 34.2-25 added a
 * top-level `import { containmentRoot, realHomeAtSetup } from
 * 'backend/jest.setupContainment'` to consume WR-09's export, and evaluating
 * that module runs its `jest.mock('os'/'node:os', ...)` registrations inside
 * THIS file's own module graph. The file therefore re-established its own
 * containment by accident, and the RED proof collapsed from 5-of-6 to
 * 1-of-12: with `setupFiles` commented out, only Test 1 failed, because every
 * other test re-`require()`s its subject AFTER that import has already
 * installed both mocks. The correction was recorded here at the time, thirty
 * lines below the claim it falsified, and the claim was left standing.
 *
 * The import is gone. `realHomeAtSetup` and `containmentRoot` now arrive
 * through `process.env` (see the constants below), which pulls in nothing at
 * all, so the module graph is mock-free again — and that is no longer a
 * matter of anyone reading this docstring: the "import graph" describe block
 * at the foot of this file walks this file's own imports transitively and
 * fails if any of them registers a mock. A prose claim that had already
 * rotted once is now an executable one.
 *
 * RED PROOF, RE-MEASURED BY HAND 2026-08-23 — the actual observed numbers,
 * not the historical 5-of-6 restated. With the `setupFiles` entry in
 * `src/backend/jest.config.js` commented out and the whole suite run,
 * **11 of 22 tests FAIL**: Tests 1, 2, 3, 4, 5, 6, the `assertNotContained`
 * self-test, Test 7, Test 8b, and both env-redirection tests. The eleven that
 * survive are the ones that SHOULD: Test 9's source gate and its two
 * self-tests, the allowlist check and self-test C, and the five WR-05 gate
 * tests — every one of them asserts on source TEXT or on pure logic, so no
 * containment mechanism could affect them. Test 4 now fails where it stayed
 * green in 2026-07-26's original run, because WR-12 later added `flatpakHome`
 * to it, and that value falls back to `homedir()`.
 *
 * One survivor is NOT in that category and is recorded here rather than
 * quietly left: **Test 8 passes with the mechanism disabled.** It asserts
 * `userInfo().homedir === homedir()`, and with no mock installed both sides
 * are the real home, so the identity holds trivially. It is not vacuous —
 * it would catch a mock that redirected one and not the other, which is the
 * CR-02 shape it was written for — but it cannot detect the mechanism being
 * absent altogether. Test 8b does carry that weight. Noted for whoever
 * revisits this block; not changed here, since it is outside WR-05's scope.
 *
 * Config restored immediately afterwards; `git diff --exit-code
 * src/backend/jest.config.js` confirmed clean, no residue.
 */

import { homedir, tmpdir, userInfo } from 'os'
import { isAbsolute, join, relative, resolve } from 'path'

import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

// ── WR-05: the two values this file needs, obtained WITHOUT an import ───────
// Importing `backend/jest.setupContainment` to read these is what falsified
// this file's central claim for four weeks. Reading them from the environment
// costs nothing and drags nothing into the module graph.
//
// `GAMELIB_JEST_REAL_HOME` is written by `jest.globalSetup.js` in the PARENT
// process, before any worker forks and before jest's mocking machinery exists
// at all — better provenance than any in-sandbox capture. `HOME` is written by
// `jest.setupContainment.ts` from `setupFiles`. They come from two different
// processes by two different mechanisms, which is what makes Test 1's
// `expect(homedir()).toBe(containmentRoot)` a real cross-check of the
// mechanism's two independent halves rather than a comparison of a value with
// itself: drop the `os` mock and `homedir()` returns the real home while
// `HOME` still points at the root; drop the `HOME` assignment and the reverse.
// Previously both sides of that assertion traced back to the same import.
const REAL_HOME_ENV_KEY = 'GAMELIB_JEST_REAL_HOME'

/**
 * Fails LOUDLY rather than skipping. A missing value here would silently
 * hollow out Test 6's anti-vacuity check (a comparison against `undefined`
 * proves nothing), and a suite that quietly stops proving its subject is the
 * failure mode this whole gap cycle is about.
 */
function requiredEnv(key: string): string {
  const value = process.env[key]
  if (value === undefined || value.length === 0) {
    throw new Error(
      `[structuralContainment] ${key} is not set. It is written by ` +
        'jest.globalSetup.js (GAMELIB_JEST_REAL_HOME) and ' +
        'jest.setupContainment.ts (HOME); if either is missing this suite ' +
        'cannot prove anything and must not pretend otherwise.'
    )
  }
  return value
}

const containmentRoot = requiredEnv('HOME')
const realHomeAtSetup = requiredEnv(REAL_HOME_ENV_KEY)

/** Tripwire idiom shared with `testContainment.test.ts`: a path is
 * "contained" inside `root` when its path relative to `root` neither starts
 * with `..` nor is itself absolute. */
function assertContained(root: string, candidate: string): void {
  const rel = relative(resolve(root), resolve(candidate))
  expect(rel.startsWith('..')).toBe(false)
  expect(isAbsolute(rel)).toBe(false)
}

/** The inverse tripwire. `candidate` must land OUTSIDE `root`.
 *
 * IN-01 (gap cycle 4): this existed only as a name inside a comment until
 * 2026-08-23. It is the assertion the "anti-vacuity" check below actually
 * wanted -- unlike comparing an `mkdtemp` path to `homedir()`, this one CAN
 * fail, because it is exactly what breaks when containment stops working. */
function assertNotContained(root: string, candidate: string): void {
  const rel = relative(resolve(root), resolve(candidate))
  expect(rel.startsWith('..') || isAbsolute(rel)).toBe(true)
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
    // IN-01 (gap cycle 4, fixed 2026-08-23): this line used to be
    // `expect(containmentRoot).not.toBe(realHomeAtSetup)` under an
    // "anti-vacuity" label. That comparison pits an `mkdtempSync` path under
    // `os.tmpdir()` against `os.homedir()` -- structurally different on every
    // supported platform, so the assertion guarding against vacuity was
    // itself vacuous. Replaced below by the property actually wanted, asserted
    // against the RESOLVED LOG PATH rather than the root: the thing that must
    // never happen is a real log write landing under the developer's home.
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

    // The teeth IN-01 asked for: the resolved log path must be OUTSIDE the
    // pre-mock real home. This fails the moment containment breaks, which the
    // replaced identity comparison never could.
    assertNotContained(realHomeAtSetup, logPath)
  })

  it('self-test: assertNotContained actually rejects a contained path (IN-01 non-vacuity)', () => {
    // The replaced identity comparison could not fail on any platform. This
    // proves its replacement can: a path genuinely inside the root must be
    // rejected, and one outside accepted. Without this, swapping in a helper
    // that silently always passes would look like an improvement.
    expect(() =>
      assertNotContained(realHomeAtSetup, join(realHomeAtSetup, 'gamelib.log'))
    ).toThrow()
    expect(() =>
      assertNotContained(realHomeAtSetup, join(containmentRoot, 'gamelib.log'))
    ).not.toThrow()
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
const { basename, sep } = require('path') as typeof import('path')
/* eslint-enable @typescript-eslint/no-require-imports */

// Declared exclusion allowlist for the Test 9 source gate below. Every entry
// must name a file that legitimately references BOTH the 'node:os' specifier
// AND one of the forbidden identifiers (homedir/userInfo) -- proven by the
// anti-vacuity assertion inside Test 9's own describe block, not assumed.
//
// IN-02 (gap cycle 4, fixed 2026-08-23): these were BASENAMES, matched with
// `NODE_OS_GATE_EXEMPT_FILES.includes(basename(filePath))`, which exempted any
// file ANYWHERE under `src/backend` that happened to share one of the three
// names -- a new `src/backend/anything/testContainment.test.ts` would have been
// silently outside the gate. They are now paths relative to `backendRoot`,
// matched exactly. Separators are normalised to '/' at the comparison site so
// this does not become a gate that only works on POSIX.
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
  'sidecar/__tests__/structuralContainment.test.ts',
  // Added as a FORWARD DECLARATION by wave-1 plan 34.2-25, ahead of the code
  // that would need it: 34.2-29 (wave 2) could not add the exclusion itself,
  // because this allowlist lives in structuralContainment.test.ts, which
  // belonged to 34.2-25's files_modified, and editing it from 34.2-29 would
  // have violated the wave's file-ownership rule.
  //
  // IN-04 (gap cycle 4, corrected 2026-08-23): 34.2-29 HAS landed. Verified
  // against the live tree, not restated from the plan -- `hasContainmentOsMock`
  // exists at `testContainment.test.ts:1041` and its regexes name the 'node:os'
  // specifier alongside the homedir/userInfo overrides, which is what trips
  // this gate. The entry is load-bearing NOW, in the present tense; the comment
  // said "it becomes load-bearing in wave 2" for four weeks after that stopped
  // being a future event.
  //
  // The old text also asked the reader not to delete this entry as seemingly
  // unused. That plea is now ENFORCED rather than requested: gap cycle 4's
  // WR-04 fix added a test below asserting that EVERY entry in this list trips
  // the predicate, so a decorative entry fails the suite rather than relying on
  // someone reading a comment.
  'sidecar/__tests__/testContainment.test.ts'
]

/** `src/backend`, the root every allowlist entry above is relative to. */
const NODE_OS_GATE_BACKEND_ROOT = resolve(__dirname, '..', '..')

/**
 * A file's path relative to `src/backend`, with separators normalised to '/'
 * (IN-02). Windows produces backslashes from `relative()`, which would make
 * every allowlist comparison fail there and turn the exemption into a
 * platform-dependent accident -- the gate would report its own three
 * legitimate files as violations on Windows and pass everywhere else.
 */
function backendRelative(filePath: string): string {
  return relative(NODE_OS_GATE_BACKEND_ROOT, filePath).split(sep).join('/')
}

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

// Comment-stripping now delegates to the shared
// `backend/testUtils/stripSourceComments` util (strips block comments
// first, then the line-prefix filter), imported above. Migrated from this
// file's own former `stripCommentsForNodeOsGate` (quick task 260726-q8f) --
// see this gate's own verified-green run below for confirmation that the
// shared util's strictly-less-aggressive trailing-comment behaviour does
// not introduce a false positive here.

/** A file that touches the 'node:os' specifier at all may not mention either
 * forbidden identifier anywhere in its (comment-stripped) source. This is
 * deliberately conservative rather than import-clause-scoped: a namespace
 * import (`import * as os from 'node:os'`) makes an import-clause-only regex
 * unsound (`os.homedir()` would never appear inside the import clause
 * itself), so the rule has to be "the file may not mention the identifiers
 * at all" once it references the specifier anywhere. */
function usesForbiddenNodeOsBinding(source: string): boolean {
  const stripped = stripSourceComments(source)
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
    // WR-06 (gap cycle 4, fixed 2026-08-23): this call used to sit inside a
    // try/catch that re-threw with a `uv_os_get_passwd` explanation, presented
    // as the WR-11 remedy. It was UNREACHABLE. `userInfo` here resolves to the
    // mock, and the mock (jest.setupContainment.ts) already catches that exact
    // throw and returns a synthetic record -- so the mock's catch always fires
    // first and this one never could. The hardening was real but lived in the
    // mock, not here, and nothing tested it. Test 8b below now does.
    expect(userInfo().homedir).toBe(homedir())
  })

  it('Test 8b: the userInfo override falls back synthetically when the REAL userInfo throws', () => {
    // Drives the mock's own `catch` -- the code that actually carries the CI
    // robustness WR-06 found untested. Routine under containerised CI
    // (`docker --user $(id -u)`), where the running uid has no /etc/passwd
    // entry and the real `userInfo()` throws `uv_os_get_passwd`.
    const realOs = jest.requireActual<typeof import('os')>('os')
    const spy = jest.spyOn(realOs, 'userInfo').mockImplementation(() => {
      throw new Error('uv_os_get_passwd')
    })
    try {
      // Containment must survive the throw, not just the happy path.
      expect(userInfo().homedir).toBe(containmentRoot)
      expect(userInfo().username).toBe('gamelib-jest')
    } finally {
      spy.mockRestore()
    }
  })

  it('Test 8c (IN-07): the buffer-encoding overload gets a BUFFER homedir, not a string, on both paths', () => {
    // `os.userInfo({ encoding: 'buffer' })` contractually returns
    // `UserInfo<Buffer>`. The containment override used to substitute the
    // `containmentRoot` STRING for `homedir` regardless of encoding, handing a
    // buffer-encoding caller a shape that violates the type it was promised.
    // Latent rather than live -- no backend consumer passes an encoding today
    // -- but a mock installed for every backend suite should not change a
    // value's TYPE.
    const buffered = userInfo({ encoding: 'buffer' })
    expect(Buffer.isBuffer(buffered.homedir)).toBe(true)
    expect(buffered.homedir.toString()).toBe(containmentRoot)

    // Non-vacuity in the other direction: the default (string) encoding must
    // NOT have become a Buffer. A fix that returned Buffers unconditionally
    // would pass the assertions above and break every existing caller.
    const stringy = userInfo()
    expect(Buffer.isBuffer(stringy.homedir)).toBe(false)
    expect(stringy.homedir).toBe(containmentRoot)

    // And the synthetic fallback -- the branch Test 8b covers -- must agree.
    // Without this the fix would hold on the happy path only, which is the
    // half of the override that was already correct-ish.
    const realOs = jest.requireActual<typeof import('os')>('os')
    const spy = jest.spyOn(realOs, 'userInfo').mockImplementation(() => {
      throw new Error('uv_os_get_passwd')
    })
    try {
      const fallback = userInfo({ encoding: 'buffer' })
      expect(Buffer.isBuffer(fallback.homedir)).toBe(true)
      expect(fallback.homedir.toString()).toBe(containmentRoot)
      expect(Buffer.isBuffer(fallback.username)).toBe(true)
      expect(fallback.username.toString()).toBe('gamelib-jest')
    } finally {
      spy.mockRestore()
    }
  })

  describe('Test 9: no *.ts file under src/backend reaches homedir/userInfo through the node:os specifier', () => {
    const backendRoot = resolve(__dirname, '..', '..')

    it('the source gate finds zero violations outside the declared allowlist', () => {
      const violations: string[] = []
      for (const filePath of collectBackendTsFiles(backendRoot)) {
        if (NODE_OS_GATE_EXEMPT_FILES.includes(backendRelative(filePath)))
          continue
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
          'sidecar/__tests__/structuralContainment.test.ts',
          'sidecar/__tests__/testContainment.test.ts'
        ])
      )

      const allFiles = collectBackendTsFiles(backendRoot)

      // WR-04 (gap cycle 4, fixed 2026-08-23): this used to be an ||-fold
      // (`atLeastOneLoadBearing`) that passed if ANY ONE of the three entries
      // tripped the predicate, while its comment claimed to prove none were
      // decorative. Two of three could rot into blanket exemptions and it
      // stayed green -- materially likely, since the third entry was added as
      // a forward declaration whose load-bearing status depends on another
      // file's regexes continuing to name 'node:os'. An entry that no longer
      // trips the predicate is an unjustified blanket exemption over a whole
      // file: delete the entry rather than leave the gate weakened.
      const decorative = NODE_OS_GATE_EXEMPT_FILES.filter((exemptPath) => {
        // IN-02: matched on the backend-relative path, not the basename, for
        // the same reason the gate itself is.
        const match = allFiles.find((f) => backendRelative(f) === exemptPath)
        expect(match).toBeDefined()
        return !usesForbiddenNodeOsBinding(
          readFileSync(match as string, 'utf8')
        )
      })
      expect(decorative).toEqual([])
    })

    it('self-test D (IN-02): a same-BASENAME file at a DIFFERENT path is NOT exempt', () => {
      // The whole finding. The allowlist used to be matched with
      // `includes(basename(filePath))`, so a hypothetical
      // `src/backend/anything/testContainment.test.ts` -- or any other file
      // sharing one of the three names -- was silently outside the gate. No
      // such file exists today, which is exactly why this needs asserting
      // rather than observing: the hole is invisible until someone adds one.
      const impostor = join(
        NODE_OS_GATE_BACKEND_ROOT,
        'anything',
        'testContainment.test.ts'
      )
      expect(basename(impostor)).toBe('testContainment.test.ts')
      expect(NODE_OS_GATE_EXEMPT_FILES).not.toContain(backendRelative(impostor))

      // Non-vacuity: the REAL file at the declared path must still be exempt,
      // or this would pass for a gate that exempts nothing at all.
      const genuine = join(
        NODE_OS_GATE_BACKEND_ROOT,
        'sidecar',
        '__tests__',
        'testContainment.test.ts'
      )
      expect(NODE_OS_GATE_EXEMPT_FILES).toContain(backendRelative(genuine))

      // And the old basename form accepted BOTH -- which is what made it
      // wrong. Asserted rather than described, so the difference is visible at
      // the failure site if anyone reverts the matcher.
      expect(NODE_OS_GATE_EXEMPT_FILES.map((e) => basename(e))).toContain(
        basename(impostor)
      )
    })

    it('self-test E (IN-02): backendRelative normalises separators, so the gate is not POSIX-only', () => {
      const genuine = join(
        NODE_OS_GATE_BACKEND_ROOT,
        'sidecar',
        '__tests__',
        'structuralContainment.test.ts'
      )
      const rel = backendRelative(genuine)
      expect(rel).toBe('sidecar/__tests__/structuralContainment.test.ts')
      expect(rel).not.toContain('\\')
    })

    it('self-test C: the decorative filter REJECTS a list where any single entry does not trip the predicate', () => {
      // WR-04 non-vacuity, both directions. The replaced ||-fold passed as
      // long as ONE entry tripped; this proves the new form fails when one
      // does not, and passes only when all do.
      const tripping = `import { homedir } from 'node:os'\nexport const a = homedir()`
      const notTripping = `import { tmpdir } from 'node:os'\nexport const b = tmpdir()`

      const sources = [tripping, notTripping, tripping]
      const decorativeIdx = sources
        .map((src, i) => (usesForbiddenNodeOsBinding(src) ? -1 : i))
        .filter((i) => i !== -1)

      // New form: one decorative entry is enough to fail.
      expect(decorativeIdx).toEqual([1])
      // Old form (`atLeastOneLoadBearing`) would have been satisfied here --
      // which is exactly why it could not detect this.
      expect(sources.some((src) => usesForbiddenNodeOsBinding(src))).toBe(true)

      // And the all-tripping case must come back clean, or the assertion above
      // would be failing for an unrelated reason.
      expect(
        [tripping, tripping].filter((src) => !usesForbiddenNodeOsBinding(src))
      ).toEqual([])
    })
  })
})

// ── The env half of the mechanism, asserted at OUTCOME (WR-07 backstop) ─────
//
// `jest.setupContainment.ts`'s precondition block now refuses to run if any of
// these eight is wrong, so on a healthy tree this block cannot fail: the whole
// suite would have died at import time. Stating that plainly rather than
// labelling it "defence in depth" and moving on — a gate that something else
// always fires before is the WR-06 defect class, and it is only worth keeping
// here because it fails under a real, plausible edit the precondition does not
// survive: someone weakening or deleting the precondition's env check itself.
// It is a backstop for the guard, not a second guard.
describe('env redirection (the second half of the containment mechanism)', () => {
  const expectedEnv: ReadonlyArray<readonly [string, string]> = [
    ['HOME', containmentRoot],
    ['USERPROFILE', containmentRoot],
    ['APPDATA', join(containmentRoot, 'AppData', 'Roaming')],
    ['LOCALAPPDATA', join(containmentRoot, 'AppData', 'Local')],
    ['XDG_CONFIG_HOME', join(containmentRoot, '.config')],
    ['XDG_STATE_HOME', join(containmentRoot, '.local', 'state')],
    ['XDG_DATA_HOME', join(containmentRoot, '.local', 'share')],
    ['XDG_CACHE_HOME', join(containmentRoot, '.cache')]
  ]

  it('all eight home/config/state variables hold their expected containment values', () => {
    for (const [key, expected] of expectedEnv) {
      expect([key, process.env[key]]).toEqual([key, expected])
    }
  })

  it('all eight resolve INSIDE the containment root and OUTSIDE the real home', () => {
    for (const [key, expected] of expectedEnv) {
      expect(key).toBeTruthy()
      assertContained(containmentRoot, expected)
      assertNotContained(realHomeAtSetup, expected)
    }
  })
})

// ── WR-05: the mock-freedom claim, made executable ──────────────────────────
//
// This file's opening paragraph has always asserted that its module graph
// contains no `jest.mock` call. From 2026-07-26 to 2026-08-23 that assertion
// was false and nothing detected it — a single added import falsified the
// file's entire evidentiary basis, and the correction was filed as prose
// thirty lines beneath the claim rather than as a test.
//
// So: walk this file's own STATIC imports transitively and fail if any file in
// that graph registers a mock. Static imports specifically, because that is
// the property at issue — what gets evaluated before any test runs. The
// test-body `require()`s under `jest.isolateModules` are the SUBJECTS of this
// suite, not part of its containment kit, and gating them would flag the
// file's whole reason for existing.
describe('WR-05: this file registers no mocks, transitively', () => {
  // Assembled at runtime so this gate does not match its own source text. A
  // literal here would make the gate detect itself and fail on a clean tree.
  const MOCK_CALL_NEEDLE = 'jest' + '.mock('

  const SRC_ROOT = resolve(__dirname, '..', '..', '..') // tsconfig baseUrl: ./src
  const CANDIDATE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']

  // Same convention as the require() block above Test 9: pulled in here rather
  // than added to the top-level import block, so this addition stays purely
  // additive. Both are node builtins and neither can carry a mock, so they are
  // irrelevant to the graph this block walks either way.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { existsSync, statSync } = require('fs') as typeof import('fs')
  const { dirname } = require('path') as typeof import('path')
  /* eslint-enable @typescript-eslint/no-require-imports */

  /**
   * Resolves an import specifier the way this project's jest config does
   * (`moduleDirectories: ['node_modules', '<rootDir>']` +
   * `modulePaths: [baseUrl]`), returning `null` for anything that cannot
   * contain a `jest.mock` call: node builtins and third-party packages, which
   * have no `jest` global in scope.
   *
   * Throws on anything it cannot classify. A silent skip is how a newly-added
   * path alias would create a blind spot in exactly this gate — the same shape
   * as the defect being closed.
   */
  function resolveFirstParty(
    specifier: string,
    fromFile: string
  ): string | null {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const nodeModule = require('module') as typeof import('module')
    /* eslint-enable @typescript-eslint/no-require-imports */
    if (nodeModule.isBuiltin(specifier)) {
      return null
    }

    const bases = specifier.startsWith('.')
      ? [resolve(dirname(fromFile), specifier)]
      : [resolve(SRC_ROOT, specifier)]

    for (const base of bases) {
      for (const ext of CANDIDATE_EXTENSIONS) {
        if (existsSync(base + ext)) return base + ext
        if (existsSync(join(base, 'index' + ext)))
          return join(base, 'index' + ext)
      }
      if (existsSync(base) && statSync(base).isFile()) return base
    }

    // Not first-party. It must at least be a resolvable package, or the
    // specifier is broken and this gate is walking a fiction.
    try {
      const resolved = require.resolve(specifier, {
        paths: [dirname(fromFile)]
      })
      if (resolved.includes('node_modules')) return null
      // Resolvable, not a builtin, not under node_modules, not found above:
      // an unclassified shape. Refuse rather than skip.
      return resolved
    } catch {
      throw new Error(
        `[structuralContainment WR-05 gate] cannot resolve import '${specifier}' ` +
          `from ${fromFile}. This gate must not silently skip a specifier it does ` +
          'not understand -- that is precisely how a blind spot appears. Teach ' +
          'resolveFirstParty about it instead.'
      )
    }
  }

  /** Static `import ... from '<spec>'` / `import '<spec>'` specifiers only. */
  function staticImportSpecifiers(source: string): string[] {
    const code = stripSourceComments(source)
    return Array.from(
      code.matchAll(/^\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/gm)
    ).map((m) => m[1])
  }

  function collectGraph(entry: string): string[] {
    const seen = new Set<string>()
    const queue = [entry]
    while (queue.length > 0) {
      const file = queue.shift() as string
      if (seen.has(file)) continue
      seen.add(file)
      for (const specifier of staticImportSpecifiers(
        readFileSync(file, 'utf8')
      )) {
        const resolved = resolveFirstParty(specifier, file)
        if (resolved !== null && !seen.has(resolved)) queue.push(resolved)
      }
    }
    return Array.from(seen)
  }

  const thisFile = __filename.replace(/\.js$/, '.ts')
  const graph = collectGraph(thisFile)

  it('the walk reaches more than this file alone, and includes its known first-party import', () => {
    // Without this the gate below could pass by walking nothing.
    expect(graph.length).toBeGreaterThan(1)
    expect(
      graph.some((f) => f.endsWith(join('testUtils', 'stripSourceComments.ts')))
    ).toBe(true)
  })

  /**
   * Comment-stripped, because a `jest.mock(` mention in PROSE is not a
   * registration — and both files in this graph discuss it at length, this one
   * in its own opening docstring. Measured: without stripping, the gate below
   * reports both of them and is unpassable, which would have pressured someone
   * into bending the check rather than fixing the property.
   */
  function registersAMock(file: string): boolean {
    return stripSourceComments(readFileSync(file, 'utf8')).includes(
      MOCK_CALL_NEEDLE
    )
  }

  it("no file in this suite's static import graph registers a mock", () => {
    expect(graph.filter(registersAMock)).toEqual([])
  })

  it('self-test: the needle DOES match a file that genuinely registers mocks', () => {
    // Positive control. `jest.setupContainment.ts` is the very module whose
    // import caused WR-05; if the needle failed to match it, the gate above
    // would be green for the wrong reason.
    const setupContainment = join(
      SRC_ROOT,
      'backend',
      'jest.setupContainment.ts'
    )
    expect(existsSync(setupContainment)).toBe(true)

    // Through the SAME comment-stripping path the gate uses, so this also
    // proves the stripper does not swallow a real registration on its way to
    // discarding the prose ones.
    expect(registersAMock(setupContainment)).toBe(true)

    // And were it in the graph, the gate's own filter would return it — so
    // the gate detects this file rather than merely tolerating it.
    //
    // Deliberately NOT `expect(graph).not.toContain(setupContainment)`. That
    // assertion belongs to the gate above, and duplicating it here made this
    // positive control fail alongside the gate during the RED proof, which
    // muddies which test is measuring what. A control must stay green while
    // the thing it controls for goes red.
    expect([setupContainment].filter(registersAMock)).toEqual([
      setupContainment
    ])
  })

  it('self-test: prose alone does NOT trip the gate, but a real call does', () => {
    // Non-vacuity in both directions for the stripping decision itself. The
    // first shape is what both files in this graph legitimately contain.
    const proseOnly = join(SRC_ROOT, 'backend', 'testUtils')
    expect(existsSync(proseOnly)).toBe(true)
    expect(
      readFileSync(join(proseOnly, 'stripSourceComments.ts'), 'utf8').includes(
        MOCK_CALL_NEEDLE
      )
    ).toBe(true)
    expect(registersAMock(join(proseOnly, 'stripSourceComments.ts'))).toBe(
      false
    )
  })

  it('self-test: an unresolvable specifier makes the walk THROW rather than skip', () => {
    expect(() =>
      resolveFirstParty('definitely-not-a-real-package-xyzzy', thisFile)
    ).toThrow(/cannot resolve import/)
  })
})

// ── SHADOWING gate (quick task 260905-jg4, 2026-09-05) ──────────────────────

/**
 * The rule this gate holds: `src/backend/jest.setupContainment.ts` SHADOWS
 * every per-suite `jest.mock('os', ...)` in the Backend project. Suite-level
 * `os` mocks are inert-but-retained defence in depth, and no suite may
 * describe its own as the thing that redirects `homedir()`.
 *
 * Why the rule needs a gate rather than only a docstring. The shadowing was
 * measured on 2026-08-23 and the finding sat in a todo for a fortnight while
 * two suites went on claiming, in prose, that their own `os` mock was
 * "containment kit element 1". Prose that nothing executes is exactly how this
 * repo's containment documentation rotted the first time (the hand-maintained
 * per-suite list this whole module replaced). So the three legs of the rule
 * are asserted here instead: the shadowed population is real and large, the
 * canonical statement of the rule still exists where readers land, and the
 * BEHAVIOURAL pin that measures inertness still exists in the one place it can
 * live -- a suite that actually declares an `os` mock, which by construction
 * this file never will.
 *
 * This block deliberately adds NO `jest.mock` and NO top-level import: the
 * WR-05 gate above walks this file's static import graph and fails if any of
 * it registers a mock, and that property is this whole file's evidentiary
 * value.
 */
// The title below says "os mock" rather than spelling the call out, and that
// is load-bearing, not stylistic: a describe title IS code, so it survives
// comment-stripping, and the literal form of the call is this gate's own
// census needle. Spelling it here made this file match its own census and
// simultaneously tripped the WR-05 import-graph gate above. Self-test C is
// what caught it -- twice, since the first fix missed this second occurrence.
// Do not "improve" this title by writing the call out.
describe('shadowing: a per-suite os mock is INERT (quick task 260905-jg4)', () => {
  // Needles assembled at runtime, for the same reason WR-05's MOCK_CALL_NEEDLE
  // is: a literal would make this file match its own census, which would both
  // inflate the count and imply this file registers a mock when it does not.
  const OS_SPECIFIERS = ['os', 'node:os']
  const OS_MOCK_NEEDLES = OS_SPECIFIERS.flatMap((specifier) => [
    `jest` + `.mock('${specifier}'`,
    `jest` + `.mock("${specifier}"`
  ])

  const backendRoot = resolve(__dirname, '..', '..')
  const setupContainmentPath = join(backendRoot, 'jest.setupContainment.ts')
  const loggerFlowsPath = join(__dirname, 'loggerFlows.test.ts')

  /** True when `source` declares an `os` mock in CODE, not merely in prose.
   * Comment-stripped for the same reason `testContainment.test.ts`'s Block B
   * is: every file in this population necessarily names the pattern in its own
   * explanatory prose, so a raw match counts documentation as code. That is
   * precisely the error the todo behind this gate recorded -- a raw `grep`
   * reported ~31 files where the real figure was 24. */
  function declaresOsMockInCode(source: string): boolean {
    const stripped = stripSourceComments(source)
    return OS_MOCK_NEEDLES.some((needle) => stripped.includes(needle))
  }

  function shadowedDeclarers(): string[] {
    return collectBackendTsFiles(backendRoot)
      .filter((filePath) => filePath.endsWith('.test.ts'))
      .filter((filePath) =>
        declaresOsMockInCode(readFileSync(filePath, 'utf8'))
      )
      .map(backendRelative)
  }

  it('leg 1: the shadowed population is real and large — at least 20 backend suites declare an os mock in code', () => {
    // A FLOOR, not an exact pin. An exact count would go red every time a
    // suite is added or removed, which is how a pin gets "fixed" by being
    // loosened rather than read (this repo has that lesson recorded twice).
    // The floor is what the claim actually needs: that this is a population,
    // not a one-off, so deleting the rule's documentation would mislead many
    // readers rather than one.
    const declarers = shadowedDeclarers()
    expect(declarers.length).toBeGreaterThanOrEqual(20)

    // ...and every one of them is genuinely shadowed, because none of them IS
    // the effective registration. The effective one is not a `*.test.ts` file
    // at all, so it cannot appear in this list -- asserted rather than assumed.
    expect(declarers).not.toContain('jest.setupContainment.ts')
  })

  it('leg 2: the canonical statement of the rule still exists in jest.setupContainment.ts', () => {
    // Matched on RAW source: the rule lives in a docblock, which
    // stripSourceComments would remove entirely. (Same reasoning as Block B's
    // WR-01 anti-claim gate in testContainment.test.ts -- do not "restore
    // consistency" by moving this onto stripped source, which would make it
    // permanently vacuous.)
    const raw = readFileSync(setupContainmentPath, 'utf8')
    expect(raw).toContain('SHADOWING')
    expect(raw).toContain('DOES NOT GET THAT FACTORY')
    expect(raw).toContain('CONTAINMENT IS NOT WEAKENED')
  })

  it('leg 3: the behavioural pin that MEASURES inertness still exists, in a suite that actually declares an os mock', () => {
    // This file cannot host that measurement: proving a per-suite factory is
    // ignored requires declaring one, and this file's mock-free import graph
    // is load-bearing for the WR-05 gate above. The pin therefore lives in
    // loggerFlows.test.ts and this leg holds it in place.
    //
    // The pin's title is assembled at runtime rather than written as a
    // literal, for a reason this gate's own self-test C caught on its first
    // run: the title CONTAINS the census needle, so spelling it out here made
    // this file match its own census AND tripped the WR-05 import-graph gate
    // above, which greps for the same `jest` + `.mock(` fragment. Two red
    // tests, one cause. Left as a runtime concatenation deliberately.
    const pinTitle = `jest` + `.mock('os') is INERT`
    const raw = readFileSync(loggerFlowsPath, 'utf8')

    // Matched on COMMENT-STRIPPED source, and this is the whole point of the
    // leg. The first version matched RAW source and its RED-PROOF stayed
    // GREEN: renaming the actual `it(...)` did not fail the gate, because
    // loggerFlows.test.ts ALSO names the pin in its docstring, and prose was
    // enough to satisfy a raw match. That is this repo's recorded "a gate a
    // comment can satisfy" failure -- the gate would have gone on passing
    // after the test it exists to hold in place had been deleted. A test
    // title is code and survives stripping; the docstring mention does not.
    const stripped = stripSourceComments(raw)
    expect(stripped).toContain(pinTitle)
    expect(declaresOsMockInCode(raw)).toBe(true)
  })

  it('self-test A: prose alone does NOT count — the census matches code, not documentation', () => {
    const proseOnly = [
      '/**',
      ` * This suite used to declare its own ${OS_MOCK_NEEDLES[0]} ...) block.`,
      ' */',
      'export const x = 1'
    ].join('\n')
    expect(proseOnly).toContain(OS_MOCK_NEEDLES[0])
    expect(declaresOsMockInCode(proseOnly)).toBe(false)
  })

  it('self-test B: a real declaration DOES count, on both the os and node:os specifiers', () => {
    for (const needle of OS_MOCK_NEEDLES) {
      const synthetic = `${needle} () => ({}))\nexport const x = 1`
      expect(declaresOsMockInCode(synthetic)).toBe(true)
    }
  })

  it('self-test C: this file is NOT in the census, so the gate never counts itself', () => {
    expect(shadowedDeclarers()).not.toContain(
      'sidecar/__tests__/structuralContainment.test.ts'
    )
  })
})
