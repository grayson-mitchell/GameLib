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
 */

import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'

// Real, unmocked 'os' -- used only to compute the containment root itself,
// BEFORE the jest.mock('os', ...) call below installs the homedir()
// override. jest.requireActual is deliberate here: this module is about to
// mock 'os' for every OTHER consumer in this test file's module graph, and
// must not accidentally consume its own not-yet-installed mock.
/* eslint-disable @typescript-eslint/no-var-requires */
const realOs: typeof import('os') = jest.requireActual('os')
/* eslint-enable @typescript-eslint/no-var-requires */

// Capture the REAL OS temp root before any redirection below. `tmpdir()`
// reads `TMPDIR` (or platform equivalents), never `HOME`/`USERPROFILE`, so
// this call is unaffected by the `process.env` mutation performed later in
// this module, and gives every containment proof suite a stable "outside"
// reference to assert against.
const realTmpRoot = realOs.tmpdir()

// One root per process (`process.pid`), so parallel jest workers never
// collide over the same directory and a force-exited worker leaves no
// shared, in-use state behind for a sibling worker to trip over. Prefixed
// `gamelib-jest-home-` so a stray directory left behind by a killed worker
// is attributable to this mechanism at a glance.
const containmentRoot = join(
  realTmpRoot,
  `gamelib-jest-home-${process.pid}`
)

// `mkdirSync` with `{ recursive: true }` so any consumer that assumes an
// already-existing home directory (rather than creating it lazily on first
// write) does not fail on a missing parent. Idempotent and safe to call
// again if a prior test file in the same worker already created it.
if (!existsSync(containmentRoot)) {
  mkdirSync(containmentRoot, { recursive: true })
}

// ── THE load-bearing fix (2026-07-26): jest.mock('os', ...) ────────────────
// Registered here, in setupFiles, BEFORE this test file's own imports run --
// so every module in the backend graph that does `require('os')` /
// `import { homedir } from 'os'` for the rest of this test file's lifetime
// gets THIS factory's object instead of the real module. Only `homedir` is
// overridden; every other export is `jest.requireActual('os')`'s real
// implementation, so no suite that legitimately uses another `os` export
// (tmpdir, platform, type, release, cpus, EOL, ...) observes any behavior
// change. This is a module-registry substitution (a NEW object), not a
// property mutation on the real 'os' module -- Node's core-module exports
// are non-configurable getters under CJS require() in this Node version, so
// a direct `Object.defineProperty(os, 'homedir', ...)` or `jest.spyOn`
// throws `TypeError: Cannot redefine property: homedir`; only jest.mock's
// registry-level substitution works.
jest.mock('os', () => ({
  ...jest.requireActual('os'),
  homedir: () => containmentRoot
}))

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

// Not read by either of the two resolvers this module exists to contain,
// but the remaining XDG base-directory variables a transitively-imported
// library could consult — covering them costs one line each and closes the
// same defect class pre-emptively.
process.env.XDG_DATA_HOME = join(containmentRoot, '.local', 'share')
process.env.XDG_CACHE_HOME = join(containmentRoot, '.cache')

export { containmentRoot }
