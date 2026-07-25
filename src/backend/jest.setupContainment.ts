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
 * Mechanism: `setupFiles` entries run once per test file, before the test
 * framework and before that file's own imports are evaluated — so every
 * module-scope `homedir()` / `process.env` read anywhere in the backend
 * import graph already observes the redirected values below. `os.homedir()`
 * honours `process.env.HOME` verbatim on POSIX and `process.env.USERPROFILE`
 * on win32 (probed on this host, 2026-07-26: `node -e "process.env.HOME=
 * '/tmp/fake-home-probe'; console.log(require('os').homedir())"` prints
 * `/tmp/fake-home-probe`). That single mechanism redirects
 * `backend/logger/paths.ts`'s `getBaseLogPath()` macOS branch — the branch
 * empirically proven to destroy real data on this host — with no
 * `jest.mock` and no module-registry surgery. The four APPDATA/
 * LOCALAPPDATA/XDG_CONFIG_HOME/XDG_STATE_HOME variables are set alongside it
 * so the Windows and Linux branches of both `getBaseLogPath()` and
 * `sidecar/pathShim.ts`'s `resolveAppDataDir()` are covered too, even when a
 * suite pins `backend/constants/environment` to a non-macOS platform or
 * forces `process.platform` directly. `XDG_DATA_HOME`/`XDG_CACHE_HOME` are
 * covered defensively for the same reason, though neither resolver above
 * reads them today.
 *
 * `os.tmpdir()` is captured FIRST, before any of the redirection below, via
 * `require('os').tmpdir()` — `tmpdir()` reads `TMPDIR`, never `HOME`, so it
 * is unaffected by the environment mutation this module performs.
 *
 * Deliberately NO jest.mock: mocking `os` project-wide would change module
 * resolution for all ~111 backend suites and could silently break any suite
 * that legitimately uses another `os` export. Env-var redirection changes no
 * module graph at all — every consumer still gets the real `os`/`path`
 * modules, just with different environment inputs, exactly as it would in a
 * real containerized/CI environment with a different `$HOME`.
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
import { tmpdir } from 'os'
import { join } from 'path'

// Capture the REAL OS temp root before any redirection below. `tmpdir()`
// reads `TMPDIR` (or platform equivalents), never `HOME`/`USERPROFILE`, so
// this call is unaffected by the `process.env` mutation performed in this
// same module, and gives every containment proof suite a stable "outside"
// reference to assert against.
const realTmpRoot = tmpdir()

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
