/**
 * Structural home/config/state directory containment for the `Backend` jest
 * project (Phase 34.2, gap cycle 3, plan 34.2-19 — REQ-34.2-07/-14).
 *
 * Defect this closes: `src/backend/sidecar/__tests__/bootstrap.test.ts`
 * drives the real, unmocked `bootstrap.init()` three times, and each call's
 * `initHeadless()` → `new LogWriter(getLogFilePath({}))` →
 * `archiveOldLogFile()` `renameSync`s the developer's real
 * `~/Library/Logs/GameLib/gamelib.log` over the prior `.old`. This was
 * independently reproduced live three times during the 2026-07-26
 * verification (log timestamps 10:49 → 10:56 → 10:57) by running this
 * project's own designated test commands. The same unmocked code path also
 * constructs real `electron-store` instances under
 * `~/Library/Application Support/GameLib`, so the token-wipe variant this
 * repo already recorded (`tests-clobbering-real-steam-store`, commit
 * `92c29a5e`) is structurally reachable too.
 *
 * Why structural rather than per-suite: plan 34.2-18 closed the equivalent
 * gap for four suites via a hand-maintained per-suite mock kit, and declared
 * the remaining eleven as `KNOWN_UNCOVERED_BOOTSTRAP_DRIVING_SUITES` —
 * accepted debt in `testContainment.test.ts`. That list rotted within one
 * gap cycle: `bootstrap.test.ts`, one of the eleven, went on to destroy real
 * developer data. A hand-maintained enumeration can only ever cover suites
 * someone remembered to add to it. This module is registered once, in
 * `jest.config.js`'s `setupFiles`, for the *entire* backend project — a
 * twelfth suite added tomorrow with zero containment mocks of its own is
 * contained by construction, because containment no longer depends on any
 * suite author opting in.
 *
 * Mechanism, REVISED 2026-07-26 (originally attempted, then disproven, a
 * pure `process.env`-redirection approach with NO `jest.mock` at all — see
 * "Corrected premise" below for why): `setupFiles` entries run once per test
 * file, before the test framework and before that file's own imports are
 * evaluated. This module does TWO things, in this order:
 *
 * 1. `jest.mock('os', factory)` — spreads `jest.requireActual('os')` (every
 *    real export stays real: `tmpdir()`, `platform()`, `type()`, etc.) and
 *    overrides ONLY `homedir()` to return the disposable per-process root
 *    below. This is the SAME factory shape gap-cycle-2's per-suite kits
 *    already use (`testContainment.test.ts`'s Block A, `loggerFlows.test.ts`,
 *    etc.) — the only difference is registration point: once, here, for the
 *    whole backend project, instead of copy-pasted into every suite that
 *    needs it. Because `setupFiles` runs before the test file's own imports,
 *    this mock is already registered by the time ANY backend module first
 *    `require`s `'os'` — so a twelfth suite added tomorrow with zero
 *    containment code of its own still gets a redirected `homedir()`,
 *    exactly like every suite that already remembered to add the kit by
 *    hand. This is what redirects `backend/logger/paths.ts`'s
 *    `getBaseLogPath()` macOS branch — the branch empirically proven to
 *    destroy real data on this host (see "Corrected premise" below) — and
 *    `sidecar/pathShim.ts`'s `resolveAppDataDir()` darwin branch.
 * 2. `process.env.HOME`/`USERPROFILE`/`APPDATA`/`LOCALAPPDATA`/
 *    `XDG_CONFIG_HOME`/`XDG_STATE_HOME`/`XDG_DATA_HOME`/`XDG_CACHE_HOME` are
 *    still set, as defense-in-depth for the Windows/Linux branches of both
 *    resolvers, which prefer these env vars over `homedir()` and DO
 *    correctly observe Jest's per-test-file `process.env` (see "Corrected
 *    premise" below for why this half of the original approach was never
 *    the problem).
 *
 * Corrected premise (why `os.homedir()` needed `jest.mock`, not just env
 * vars): the original version of this module set ONLY the env vars above,
 * reasoning that `os.homedir()` "honours `process.env.HOME` verbatim on
 * POSIX" — true in *plain* Node (verified via `node -e "process.env.HOME=
 * '/tmp/fake-home-probe'; console.log(require('os').homedir())"`, which
 * prints `/tmp/fake-home-probe`), but FALSE inside a Jest test. Jest's
 * `jest-environment-node` + `jest-util`'s `installCommonGlobals` (see
 * `node_modules/jest-util/build/createProcessObject.js`) replace
 * `global.process` PER TEST FILE with a deep-cloned synthetic process
 * object whose `.env` is a pure-JS `Proxy` — a one-time snapshot of the real
 * environment at construction. Writes to `process.env.HOME` inside a Jest
 * test only mutate this JS-only clone; they never call the real `setenv()`.
 * `os.homedir()` is a NATIVE binding (libuv `uv_os_homedir()`) that reads
 * the actual OS environ directly, completely bypassing Jest's fake
 * `process.env` — so the env-only version of this module left `homedir()`
 * (and therefore `getBaseLogPath()`'s isMac branch, which has NO env-var
 * fallback at all) resolving to the developer's REAL home, unchanged, the
 * entire time. Proven with a live `stat` before/after on the real
 * `~/Library/Logs/GameLib/gamelib.log`/`.log.old`: both mtimes changed
 * across a full `sidecar/__tests__` run even with the env-only fix
 * installed. Two non-`jest.mock` alternatives were also tried and ruled
 * out: direct `Object.defineProperty(os, 'homedir', ...)` throws
 * `TypeError: Cannot redefine property: homedir` (Node's core-module
 * exports are non-configurable getters under CJS `require()` in this Node
 * version — same reason `jest.spyOn` would fail identically); and a
 * `Module._load` hook (the technique `installElectronHook.ts` uses
 * successfully for `require('electron')`) does NOT intercept `require('os')`
 * under Jest, because Jest's Runtime resolves Node builtins through its own
 * captured `require()`, bypassing `Module._load` entirely — verified
 * empirically, a test-local `Module._load` override left a downstream
 * `require('backend/logger/paths')` call still resolving the real,
 * unpatched `os.homedir()`. `jest.mock('os', factory)` — a module-registry
 * substitution, not a property mutation — was the only mechanism found that
 * actually works.
 *
 * `os.tmpdir()` is captured FIRST, before `jest.mock` and before the env
 * redirection below, via `jest.requireActual('os').tmpdir()` — `tmpdir()`
 * reads `TMPDIR` (unaffected either way) and using the REAL module here
 * avoids taking a dependency on the mock this same module is about to
 * install.
 *
 * Scope of the `jest.mock('os', ...)` call is intentionally narrow: only
 * `homedir` is overridden; every other `os` export (`tmpdir`, `platform`,
 * `type`, `release`, `cpus`, `EOL`, ...) is the real implementation via
 * `...jest.requireActual('os')`, so no suite that legitimately uses another
 * `os` export observes any behavior change. This is the one property this
 * module's original "no jest.mock" design intent was actually protecting —
 * it still holds, even though the *mechanism* changed.
 *
 * Deliberately NO teardown hook of any kind restores the mutated environment
 * variables. Registering one would resurrect the exact "a post-test restore
 * hook is not a safety net under jest worker force-exit" pattern this repo
 * already recorded (`tests-clobbering-real-steam-store`, commit `92c29a5e`)
 * — a force-exited jest worker (`--forceExit`, a killed `--runInBand`
 * process, a crashed suite) skips such hooks entirely, so a restore cannot
 * be relied on to run. Leaving the per-pid directory in place for the OS's
 * normal temp-directory cleanup is the safe choice; nothing in this module
 * ever mutates the developer's real environment back.
 *
 * Note on wording: writes still happen under this redirection — LogWriter
 * still creates/renames files, electron-store still persists JSON — they are
 * merely redirected into a disposable per-process root, never suppressed.
 *
 * GAP CYCLE 4 REVISION (2026-07-26, plan 34.2-25 — CR-02, WR-07, WR-09,
 * WR-10, WR-11, WR-12): the mechanism above closed containment for the
 * bare `'os'` specifier only. Measured in the gap-cycle-3 review:
 * `os.homedir()` returned the containment root while `require('node:os')
 * .homedir()` returned the developer's REAL home in the same test file --
 * Jest keys the `node:`-prefixed builtin separately in its module registry,
 * so `jest.mock('os', ...)` never touched it. `os.userInfo().homedir` was
 * not redirected by either specifier. Five changes close this:
 *
 * 1. (CR-02) The factory is now a hoisted FUNCTION DECLARATION,
 *    `mockOsFactory`, registered once against the bare specifier and once
 *    against the `node:`-prefixed one (see the two `jest.mock` calls
 *    below). It also overrides `userInfo()` (spreading the real result,
 *    replacing only `homedir`), with a synthetic fallback if the real call
 *    throws `uv_os_get_passwd` (routine under containerised CI with no
 *    `/etc/passwd` entry for the running uid).
 * 2. (WR-07) `containmentRoot` is now `mkdtempSync(join(realTmpRoot,
 *    'gamelib-jest-home-'))` + `chmodSync(root, 0o700)` instead of a
 *    predictable path derived from the OS temp root plus this worker's
 *    process id, built with a check-then-act `existsSync`-then-`mkdirSync`
 *    pair. `mkdtemp` is
 *    atomic (no TOCTOU), mode 0700, and its suffix is unpredictable --
 *    closing the world-writable-`/tmp` symlink-capture vector on Linux
 *    CI, where this root receives real `electron-store` JSON
 *    (`fileStore.ts`) and the full contents of `gamelib.log`. The
 *    deliberate no-teardown-hook decision from the original mechanism is
 *    UNCHANGED and for the same reason: a force-exited jest worker skips
 *    teardown hooks (`tests-clobbering-real-steam-store`, commit
 *    `92c29a5e`); mode 0700 is the control here, not deletion.
 * 3. Both `containmentRoot` and the pre-mock real home
 *    (`realHomeAtSetup`, WR-09) are memoized on `globalThis` under
 *    `__GAMELIB_JEST_CONTAINMENT_ROOT__` / `__GAMELIB_JEST_REAL_HOME__` so
 *    a second evaluation of this module reuses the same values instead of
 *    minting a second, disagreeing root.
 * 4. (WR-09/WR-10, extended by WR-07 in gap cycle 4) `realHomeAtSetup` is
 *    exported alongside `containmentRoot`, and a precondition block runs
 *    after both `jest.mock` registrations and the env assignments: it
 *    re-resolves `require('os').homedir()` and `require('node:os')
 *    .homedir()`, checks `containmentRoot` resolves inside `realTmpRoot`,
 *    and — since 2026-08-23 — checks that ALL EIGHT env variables from
 *    step 2 hold their expected values, naming the offending keys in the
 *    throw. That last part is what makes this block cover the mechanism
 *    this docstring actually describes. Until it was added the block
 *    validated only step 1: any single env assignment could be deleted and
 *    every backend suite still ran green, with the sole remaining
 *    enforcement being `testContainment.test.ts`'s Block D text gate,
 *    which CR-01 proved a block comment can satisfy. It throws a loud
 *    `[jest.setupContainment] REFUSING TO RUN` `Error` if any check fails.
 *    Because `setupFiles` entries run once per test
 *    file strictly BEFORE that file's own imports, this precondition
 *    precedes `constants/paths.ts`'s module-scope `mkdirSync` and every
 *    other import-time filesystem touch -- which is exactly what the
 *    per-suite tripwires in `bootstrap.test.ts` and `loggerFlows.test.ts`
 *    cannot do (they run as the first *test*, after all module-scope
 *    imports already executed). `getLogFilePath({})` is deliberately NOT
 *    required here -- requiring `backend/logger/paths` from `setupFiles`
 *    would pull a module into the graph of all 111 backend suites before
 *    their own `jest.mock` calls register; that assertion lives in
 *    `structuralContainment.test.ts` Test 2/Test 6 instead.
 * 5. (WR-12) The comment above the `XDG_DATA_HOME`/`XDG_CACHE_HOME`
 *    assignments below is corrected: `src/backend/constants/paths.ts:21`
 *    is FIRST-PARTY code that reads `XDG_DATA_HOME` for `flatpakHome`, not
 *    merely "a transitively-imported library" as the prior wording
 *    claimed.
 */

import { chmodSync, lstatSync, mkdtempSync } from 'fs'
import { isAbsolute, join, relative, resolve } from 'path'

declare global {
  // eslint-disable-next-line no-var -- globalThis memoization requires `var`
  var __GAMELIB_JEST_CONTAINMENT_ROOT__: string | undefined
  // eslint-disable-next-line no-var -- globalThis memoization requires `var`
  var __GAMELIB_JEST_REAL_HOME__: string | undefined
}

// Real, unmocked 'os' -- used only to compute the containment root itself,
// BEFORE the jest.mock('os'/'node:os', ...) calls below install the
// homedir()/userInfo() overrides. jest.requireActual is deliberate here:
// this module is about to mock both specifiers for every OTHER consumer in
// this test file's module graph, and must not accidentally consume its own
// not-yet-installed mock.
const realOs: typeof import('os') = jest.requireActual('os')

// Capture the REAL OS temp root before any redirection below. `tmpdir()`
// reads `TMPDIR` (or platform equivalents), never `HOME`/`USERPROFILE`, so
// this call is unaffected by the `process.env` mutation performed later in
// this module, and gives every containment proof suite a stable "outside"
// reference to assert against.
const realTmpRoot = realOs.tmpdir()

// WR-09: capture the pre-mock real home BEFORE the mocks are installed, via
// the `jest.requireActual` handle above (which bypasses the mock). Memoized
// on `globalThis` (re-execution safety, see docstring point 3) so a second
// evaluation of this module reuses the same value rather than recomputing
// it -- harmless here since `homedir()` is deterministic, but keeps this
// value and `containmentRoot` symmetric.
const realHomeAtSetup: string =
  globalThis.__GAMELIB_JEST_REAL_HOME__ ?? realOs.homedir()
globalThis.__GAMELIB_JEST_REAL_HOME__ = realHomeAtSetup

// WR-07: mkdtempSync is atomic (no TOCTOU), creates with mode 0700, and its
// suffix is unpredictable -- replacing the old join(realTmpRoot,
// `gamelib-jest-home-` + this worker's process id) + `existsSync`-then-
// `mkdirSync` check-then-act pair, which was a predictable path with a
// symlink-capture window on world-writable Linux `/tmp`. Memoized on
// `globalThis` under `__GAMELIB_JEST_CONTAINMENT_ROOT__`
// (re-execution safety, docstring point 3): a second evaluation of this
// module reuses the existing root instead of minting a second one that
// would disagree with the first, which is what makes it safe for
// `structuralContainment.test.ts` to import `containmentRoot` directly.
//
// WR-01 (gap cycle 4, fixed 2026-08-23): the `globalThis` memo below is
// necessary but NOT sufficient. Jest gives every test FILE a fresh sandbox
// global, so the memo only ever hit within a single file and a fresh root was
// minted per file -- 6,057 of them had accumulated on the author's machine,
// one per suite per run, none ever removed. The run-wide root now comes from
// `jest.globalSetup.js` via `process.env`, which is the only one of the three
// candidate seams that actually propagates (that file's docstring records the
// two that do not, both measured). `globalThis` is retained on top of it for
// the reason it was added: re-execution safety within one file, so
// `structuralContainment.test.ts` importing `containmentRoot` directly cannot
// mint a second, disagreeing root. (WR-05 has since removed that import, but
// the re-execution guarantee is worth keeping on its own terms.)
const RUN_ROOT_ENV_KEY = 'GAMELIB_JEST_RUN_ROOT'

// WR-05: the pre-mock real home, published to the sandbox so a suite proving
// mock-freedom can read it WITHOUT importing this module -- an import would
// install two `jest.mock` registrations into that suite's own module graph,
// which is exactly the defect WR-05 records. Written by `jest.globalSetup.js`
// in the parent process; cross-checked, and filled in as a fallback, by the
// precondition block at the foot of this file.
const REAL_HOME_ENV_KEY = 'GAMELIB_JEST_REAL_HOME'

/**
 * Accept the inherited root only if it still has every property `mkdtempSync`
 * + `chmodSync(0o700)` gave it. This value arrives through the environment,
 * so it is validated rather than trusted: a run whose env was tampered with
 * (or simply a stale value inherited from an unrelated parent process) must
 * fall back to minting a fresh root, never silently redirect every test
 * write to an attacker-chosen directory. Failing CLOSED here would be wrong
 * -- the fallback is the pre-WR-01 behaviour, which is contained, just
 * untidy.
 */
function inheritedRootIsUsable(candidate: string): boolean {
  if (candidate.length === 0 || !isAbsolute(candidate)) return false

  // Must live directly under the real temp root, by path arithmetic rather
  // than string prefix -- `relative` + `isAbsolute` is the same containment
  // idiom the precondition block below uses.
  const rel = relative(realTmpRoot, resolve(candidate))
  if (rel.length === 0 || rel.startsWith('..') || isAbsolute(rel)) return false
  if (rel.includes('/') || rel.includes('\\')) return false
  if (!rel.startsWith('gamelib-jest-run-')) return false

  try {
    // `lstat`, not `stat`: a symlink planted at this path must be rejected,
    // not followed. That is the WR-07 vector, and it is the whole reason the
    // predictable-marker-file design the review prescribed was not used.
    const stat = lstatSync(candidate)
    if (!stat.isDirectory() || stat.isSymbolicLink()) return false
    // Mode 0700 is the security control WR-07 established; if something
    // widened it, do not adopt this root.
    if ((stat.mode & 0o077) !== 0) return false
    return true
  } catch {
    return false
  }
}

function ensureContainmentRoot(): string {
  if (globalThis.__GAMELIB_JEST_CONTAINMENT_ROOT__ !== undefined) {
    return globalThis.__GAMELIB_JEST_CONTAINMENT_ROOT__
  }

  // Nest this file's root inside the run root when one was inherited, so the
  // whole run can be reaped as a unit. Each test FILE still gets its own
  // freshly-minted directory either way -- collapsing that was measured to
  // break suite isolation, not just tidiness.
  const inherited = process.env[RUN_ROOT_ENV_KEY]
  const parent =
    inherited !== undefined && inheritedRootIsUsable(inherited)
      ? inherited
      : realTmpRoot

  const root = mkdtempSync(join(parent, 'gamelib-jest-home-'))
  chmodSync(root, 0o700)
  globalThis.__GAMELIB_JEST_CONTAINMENT_ROOT__ = root
  return root
}

const containmentRoot = ensureContainmentRoot()

// ── CR-02 dual-specifier factory ────────────────────────────────────────
// A hoisted FUNCTION DECLARATION, not a `const` -- a `const` would be in
// the temporal dead zone when ts-jest hoists the `jest.mock` calls below
// above it; the `mock` name prefix additionally keeps this factory
// reference legal under `babel-plugin-jest-hoist`'s out-of-scope-variable
// rule, matching the `mockTmpRootName` convention already recorded in
// deferred-items.md. Only `homedir` and `userInfo` are overridden; every
// other export (`tmpdir`, `platform`, `type`, `release`, `cpus`, `EOL`,
// ...) is `jest.requireActual('os')`'s real implementation, so no suite
// that legitimately uses another `os` export observes any behavior change.
function mockOsFactory() {
  const actual = jest.requireActual<typeof import('os')>('os')
  return {
    ...actual,
    homedir: () => containmentRoot,
    userInfo: (...args: Parameters<typeof actual.userInfo>) => {
      try {
        return { ...actual.userInfo(...args), homedir: containmentRoot }
      } catch {
        // uv_os_get_passwd: userInfo() reads the OS passwd database
        // directly and throws when the running uid has no /etc/passwd
        // entry -- routine under containerised CI (`docker --user
        // $(id -u)`, WR-11 problem 3). The two real backend consumers
        // (utils/filesystem/windows.ts:82, storeManagers/legendary/
        // user.ts:6) only read `username`, never `homedir`, so this
        // synthetic fallback has no behavioral blast radius beyond
        // containment.
        return {
          username: 'gamelib-jest',
          uid: -1,
          gid: -1,
          shell: null,
          homedir: containmentRoot
        }
      }
    }
  }
}

// Registered here, in setupFiles, BEFORE this test file's own imports run --
// TWICE, once per specifier, because Jest keys the `node:`-prefixed builtin
// separately in its module registry from the bare one (the entire CR-02
// defect: `jest.mock('os', ...)` alone left `require('node:os')` resolving
// to the developer's real `$HOME`). This is a module-registry substitution
// (a NEW object per specifier), not a property mutation on the real 'os'
// module -- Node's core-module exports are non-configurable getters under
// CJS require() in this Node version, so a direct
// `Object.defineProperty(os, 'homedir', ...)` or `jest.spyOn` throws
// `TypeError: Cannot redefine property: homedir`; only jest.mock's
// registry-level substitution works.
jest.mock('os', mockOsFactory)
jest.mock('node:os', mockOsFactory)

// ── POSIX / Windows home directory redirection ─────────────────────────────
// `os.homedir()` reads these verbatim; this is what redirects
// `getBaseLogPath()`'s macOS branch (`join(homedir(), 'Library', 'Logs',
// 'GameLib')`) and `resolveAppDataDir()`'s darwin branch
// (`join(homedir(), 'Library', 'Application Support')`) — the exact pair of
// resolvers the interface notes above name, and the exact branch that
// destroyed real data on this host.
process.env.HOME = containmentRoot
process.env.USERPROFILE = containmentRoot

// ── Windows-specific overrides ──────────────────────────────────────────────
// `getBaseLogPath()`'s isWindows branch prefers `LOCALAPPDATA` over
// `homedir()`; `resolveAppDataDir()`'s win32 branch prefers `APPDATA` over
// `homedir()`. Both must be redirected independently of HOME/USERPROFILE
// above, or a suite that pins itself to Windows (via
// `backend/constants/environment` or a forced `process.platform`) would
// still resolve against the developer's real profile if either variable was
// already set in the host environment.
process.env.APPDATA = join(containmentRoot, 'AppData', 'Roaming')
process.env.LOCALAPPDATA = join(containmentRoot, 'AppData', 'Local')

// ── Linux/XDG overrides ──────────────────────────────────────────────────
// `getBaseLogPath()`'s otherwise (Linux) branch prefers `XDG_STATE_HOME`;
// `resolveAppDataDir()`'s default branch prefers `XDG_CONFIG_HOME`. Same
// reasoning as the Windows overrides above.
process.env.XDG_CONFIG_HOME = join(containmentRoot, '.config')
process.env.XDG_STATE_HOME = join(containmentRoot, '.local', 'state')

// WR-12 correction: `src/backend/constants/paths.ts:21` is FIRST-PARTY code
// that reads `XDG_DATA_HOME` --
// `export const flatpakHome = env.XDG_DATA_HOME?.replace('/data', '') ||
// homedir()` -- so setting it changes `flatpakHome` for every backend test
// from the `|| homedir()` branch to the `?.replace('/data', '')` branch.
// (The prior wording here claimed these two variables were "not read by
// either of the two resolvers this module exists to contain, but the
// remaining XDG base-directory variables a transitively-imported library
// could consult" -- true of `XDG_CACHE_HOME`, but factually wrong for
// `XDG_DATA_HOME`.) The value stays contained either way, but a future
// change to the `?.replace('/data', '')` logic would silently alter
// `flatpakHome` under test with no signal without a pinning assertion --
// see `structuralContainment.test.ts` Test 4, which asserts `flatpakHome`
// also resolves inside `os.tmpdir()`.
process.env.XDG_DATA_HOME = join(containmentRoot, '.local', 'share')
process.env.XDG_CACHE_HOME = join(containmentRoot, '.cache')

// ── WR-10: a PRECONDITION, not a post-hoc detector ─────────────────────────
// `setupFiles` entries run once per test file, strictly BEFORE that file's
// own imports -- so this check runs before `constants/paths.ts`'s
// module-scope `mkdirSync` and every other import-time filesystem touch,
// which is exactly what the per-suite tripwires in `bootstrap.test.ts` and
// `loggerFlows.test.ts` cannot do (they run as the first *test*, after all
// module-scope imports in that file have already executed). `getLogFilePath
// ({})` is deliberately NOT required here: requiring `backend/logger/paths`
// from `setupFiles` would pull a module into the graph of all 111 backend
// suites before their own `jest.mock` calls register; that assertion lives
// in `structuralContainment.test.ts` Test 2/Test 6 instead.
{
  /* eslint-disable @typescript-eslint/no-require-imports */
  const bareHomeAtPrecondition = (
    require('os') as typeof import('os')
  ).homedir()
  const prefixedHomeAtPrecondition = (
    require('node:os') as typeof import('os')
  ).homedir()
  /* eslint-enable @typescript-eslint/no-require-imports */

  // "resolves inside realTmpRoot" via relative()+resolve() -- never a raw
  // `.startsWith(realTmpRoot)` string-prefix check, which is unsound for
  // sibling directories sharing a prefix (e.g. `/tmp/foo` vs `/tmp/foobar`).
  const rootRelativeToTmp = relative(
    resolve(realTmpRoot),
    resolve(containmentRoot)
  )
  const rootIsInsideRealTmp =
    !rootRelativeToTmp.startsWith('..') && !isAbsolute(rootRelativeToTmp)

  // ── WR-05: publish the real home WITHOUT requiring an import ─────────────
  // `structuralContainment.test.ts` exists to prove `setupFiles` alone
  // contains a mock-free suite, and the top-level import it previously used
  // to read `realHomeAtSetup` dragged this module's two `jest.mock`
  // registrations into its own module graph -- falsifying the very claim the
  // file was written to demonstrate. Reading an env var costs nothing and
  // pulls in nothing.
  //
  // `jest.globalSetup.js` captures the same value in the PARENT process,
  // before any worker forks and before jest's mocking machinery exists at
  // all, and exports it under this key. That is strictly better provenance
  // than anything obtainable from inside a sandbox, so when it is present it
  // wins -- and the two independently-captured values must AGREE, which is
  // asserted below rather than assumed. When it is absent (someone running
  // the backend project without `globalSetup`), this module publishes its own
  // capture so the variable is never merely missing, which would silently
  // hollow out the consuming suite's anti-vacuity check.
  const inheritedRealHome = process.env[REAL_HOME_ENV_KEY]
  if (inheritedRealHome === undefined) {
    process.env[REAL_HOME_ENV_KEY] = realHomeAtSetup
  }
  const realHomeDisagrees =
    inheritedRealHome !== undefined && inheritedRealHome !== realHomeAtSetup

  // ── WR-07: the SECOND half of the mechanism, asserted ────────────────────
  // Everything above this comment checks half of what this module's docstring
  // describes: the `jest.mock('os'/'node:os')` registrations. The other half
  // is the eight env assignments directly above -- and until 2026-08-23
  // nothing here checked them at all. Deleting any single assignment left
  // this block passing happily for all ~113 backend suites, with the only
  // remaining enforcement being `testContainment.test.ts`'s Block D text
  // gate, which CR-01 proved a block comment can satisfy. A gate that checks
  // one of the two things its own docstring names is measuring the wrong
  // property.
  //
  // These are recomputed from `containmentRoot`, deliberately NOT captured
  // into shared constants at assignment time: a shared constant would make
  // the check tautological (it would compare each variable against the same
  // expression that set it, and would still pass if the assignment line were
  // deleted entirely, since `process.env[k]` would then be `undefined` on
  // both sides only if the constant were also removed). Spelling the
  // expected values out a second time is what gives this teeth.
  const envExpectations: ReadonlyArray<readonly [string, string]> = [
    ['HOME', containmentRoot],
    ['USERPROFILE', containmentRoot],
    ['APPDATA', join(containmentRoot, 'AppData', 'Roaming')],
    ['LOCALAPPDATA', join(containmentRoot, 'AppData', 'Local')],
    ['XDG_CONFIG_HOME', join(containmentRoot, '.config')],
    ['XDG_STATE_HOME', join(containmentRoot, '.local', 'state')],
    ['XDG_DATA_HOME', join(containmentRoot, '.local', 'share')],
    ['XDG_CACHE_HOME', join(containmentRoot, '.cache')]
  ]
  const badEnvKeys = envExpectations
    .filter(([key, expected]) => process.env[key] !== expected)
    .map(([key]) => key)

  if (
    bareHomeAtPrecondition !== containmentRoot ||
    prefixedHomeAtPrecondition !== containmentRoot ||
    !rootIsInsideRealTmp ||
    badEnvKeys.length > 0 ||
    realHomeDisagrees
  ) {
    throw new Error(
      '[jest.setupContainment] REFUSING TO RUN: containment precondition ' +
        'failed -- ' +
        `require('os').homedir()=${bareHomeAtPrecondition}, ` +
        `require('node:os').homedir()=${prefixedHomeAtPrecondition}, ` +
        `expected both to equal containmentRoot=${containmentRoot}, and ` +
        `containmentRoot must resolve inside realTmpRoot=${realTmpRoot}, and ` +
        'every home/config/state env variable must point inside the ' +
        'containment root. Env redirection incomplete for: ' +
        `${badEnvKeys.length > 0 ? badEnvKeys.join(', ') : '(none)'}. ` +
        `${REAL_HOME_ENV_KEY} inherited from globalSetup=` +
        `${inheritedRealHome ?? '(absent)'}, this sandbox captured ` +
        `${realHomeAtSetup}; the two must agree. ` +
        'Refusing to let any backend test file import run against a ' +
        'broken containment boundary (see jest.setupContainment.ts ' +
        'docstring, gap cycle 4 / CR-02 / WR-10 / WR-07).'
    )
  }
}

export { containmentRoot, realHomeAtSetup }
