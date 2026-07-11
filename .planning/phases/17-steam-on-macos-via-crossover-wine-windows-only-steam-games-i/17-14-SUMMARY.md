---
phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
plan: 14
subsystem: ui
tags: [steam, crossover, bottle-install, acf, progress-bar, react-hooks, live-reconciliation]

# Dependency graph
requires:
  - phase: 17-11
    provides: bottle install button/status desync gap-closure (GAP 3), ACF poller lifecycle (D-07)
  - phase: 17-05
    provides: bottle ACF poller (startInstallPolling/pollInstallOnce/readAcfState)
provides:
  - ACF byte-derived install percent surfaced to the frontend progress store during a bottle Steam install
  - hasStatus derivation reads the LIVE gameInfo prop instead of a value frozen at mount, so the installing->installed transition resolves without re-navigation
  - a pure, exported deriveInstallStatusKind precedence function shared by hasStatus.ts and a no-jsdom CI test
affects: [steam-bottle-install, game-page-status, library-grid-tile]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-function extraction from a React hook (deriveInstallStatusKind) to make branch precedence CI-testable in a no-jsdom, node-env jest project — module-scope window usage in transitively-imported hooks (hasProgress/./constants) is neutralized in the test via jest.mock factories, not by adding jsdom"
    - "Backend progress emission for a non-DownloadManager install path (ACF poller) mirrors the existing native sendProgressUpdate contract exactly (GameStatus-shaped progressUpdate payload with status+progress), so the frontend progress store required zero changes"

key-files:
  created:
    - src/frontend/hooks/__tests__/hasStatus.reconcile.test.ts
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/frontend/hooks/hasStatus.ts

key-decisions:
  - "Trace confirmed GAP-17-BOTTLE-INSTALL-DONE-DESYNC root cause is case (b) (hasStatus's mount-frozen newGameInfo), not case (a) (no residual DownloadManager 'installing' entry exists for steam — installQueueElement only sends 'done' for non-steam runners or a deferred-to-setup bottle prompt); GlobalState.tsx and GamePage/index.tsx needed no changes"
  - "Divide-by-zero guard skips the progressUpdate emit entirely (rather than forcing percent:0) when both BytesToDownload and BytesToStage are 0/missing, preserving 'no message sent' as the safe default alongside the existing gameStatusUpdate{installing} emit"

patterns-established:
  - "ACF byte counts (BytesDownloaded/BytesToDownload/BytesStaged/BytesToStage) are now first-class optional fields on readAcfState's return type, gated behind the existing 'downloading' branch and never touching 'installed'/'absent'"

requirements-completed: [MACSTEAM-05, MACSTEAM-04]

# Metrics
duration: ~35min
completed: 2026-07-11
---

# Phase 17 Plan 14: Bottle-Install Live-UI Reconciliation Summary

**ACF byte counts now drive a live install-percent progressUpdate for bottle Steam installs, and hasStatus tracks the live gameInfo prop instead of a value frozen at mount, so the game-page button and library tile flip to Play/idle on completion without a nav round-trip.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-11T03:31:50Z
- **Tasks:** 2 completed
- **Files modified:** 4 (1 new test file, 3 modified)

## Accomplishments

- The bottle ACF poller (`pollInstallOnce`) now derives a clamped 0-100 percent from the ACF's own `BytesDownloaded/BytesToDownload` (falling back to `BytesStaged/BytesToStage`) and emits it via the existing `progressUpdate` IPC channel — the same channel the native DownloadManager path already feeds — so `hasProgress`/`GameStatus`'s `LinearProgress` bar advances during a bottle install with zero frontend changes required (GAP-17-BOTTLE-PROGRESS).
- Root-caused GAP-17-BOTTLE-INSTALL-DONE-DESYNC to `hasStatus.ts`'s `newGameInfo` state being captured once at mount (`React.useState(gameInfo)`) with a follow-up effect that only re-fetched when `newGameInfo` was falsy — which never happened, since `gameInfo` is always provided by every caller. `is_installed` therefore stayed pinned to whatever was true when the hook first mounted, even after `GamePage`'s own `useEffect(status)` re-fetched a fresh `gameInfo` and passed it down as a new prop. Fixed by adding a prop-sync effect (`setNewGameInfo(gameInfo)` on every `gameInfo` prop change).
- Extracted the four-branch precedence logic (`active statusEntry > notSupportedGame > installed > notInstalled`) into a pure, exported `deriveInstallStatusKind`, letting the done-transition be locked by a CI test that never mounts the hook or touches `window`/jsdom.

## Task Commits

1. **Task 1: Bottle poller derives install percent from ACF bytes and feeds the progress bar (GAP-17-BOTTLE-PROGRESS)** - `31e8e071` (feat)
2. **Task 2: Game page flips to Play live on bottle-install completion — no nav round-trip (GAP-17-BOTTLE-INSTALL-DONE-DESYNC)** - `527960ab` (fix)

## Files Created/Modified

- `src/backend/storeManagers/steam/library.ts` - `readAcfState`'s `'downloading'` return now also carries `bytesDownloaded/bytesToDownload/bytesStaged/bytesToStage` (parsed via `Number(...)`, defaulting missing/NaN to 0); `pollInstallOnce`'s `'downloading'` branch computes a clamped percent (download-bytes primary, staged-bytes fallback, divide-by-zero guarded — skips the emit entirely rather than sending a non-finite percent) and sends `sendFrontendMessage('progressUpdate', { appName, runner:'steam', status:'installing', progress:{percent, bytes, eta:''} })`. The existing `gameStatusUpdate{installing}` emit, the `'installed'`/`'absent'` branches, and the native path are byte-for-byte unchanged.
- `src/backend/storeManagers/steam/__tests__/library.test.ts` - Added: `readAcfState` byte-parsing case + missing-fields-default-to-0 case; `pollInstallOnce` percent=50 case (BytesDownloaded=5/BytesToDownload=10), staged-fallback percent=50 case (BytesToDownload=0, BytesStaged=3/BytesToStage=6), and a both-totals-zero case asserting zero `progressUpdate` calls plus a blanket `Number.isFinite` guard over every emitted `progress.percent` in the test.
- `src/frontend/hooks/hasStatus.ts` - Added exported pure `deriveInstallStatusKind` (documented with its exact branch order) and a new `React.useEffect(() => setNewGameInfo(gameInfo), [gameInfo])` prop-sync effect; `checkGameStatus` now calls `deriveInstallStatusKind` instead of inlining the precedence checks, with identical output/labels for every branch.
- `src/frontend/hooks/__tests__/hasStatus.reconcile.test.ts` (new) - No-jsdom, node-env pure-function test (mirrors `SteamBottleSetup.test.ts`'s pattern). Mocks `../hasProgress` and `../constants` (both touch `window` at module load time via `InstallProgress.ts`/`window.localStorage`) so `deriveInstallStatusKind` can be imported without mounting the hook. Cases: cleared `statusEntry` + `is_installed:true` -> `'installed'`; same + `is_installed:false` -> `'notInstalled'` (proves why the live value matters); active `'installing'` entry -> `'active'`; a `'done'` entry treated the same as no entry; third-party-managed precedence (including the EA-managed exception, which still falls to `'notInstalled'` for `is_installed` per the pre-existing `!thirdPartyManagedApp` guard — unchanged by this fix).

## Decisions Made

- **Root-cause trace (required by the plan before fixing):** Confirmed case (b) — `hasStatus`'s mount-frozen `newGameInfo` — is the actual cause, not case (a). Verified by reading `installQueueElement` (`src/backend/downloadmanager/utils.ts`): its `finally` block only sends `sendGameStatusUpdate({status:'done'})` `if (runner !== 'steam' || deferredToSetup)` — for a normal (non-deferred) steam bottle install, the DownloadManager sends exactly one `'installing'` at enqueue time and **never** sends its own `'done'`; the ACF poller is the sole `'done'` emitter. `GlobalState.tsx`'s `handleGameStatus` `'done'` branch already correctly filters the matched `appName` out of `libraryStatus` on that signal. No residual DownloadManager entry exists to reconcile — `GlobalState.tsx` needed no change.
- **`GamePage/index.tsx` needed no change either.** Its `useEffect(() => {...}, [status, ...])` at lines 207-218 already re-fetches `gameInfo` (and calls `setGameInfo`) whenever `hasStatus`'s returned `status` changes. Once the fix above lets `deriveInstallStatusKind` react to `libraryStatus` losing the entry (poller's `'done'`), `status` does change (transiently to `'notInstalled'` if `is_installed` hasn't refreshed yet, or directly to `'installed'` if it has), which fires that existing effect, refetches the now-`is_installed:true` `gameInfo` from the backend (already updated by the poller's `library.set()` prior to sending `'done'`), and the prop-sync effect propagates it back into `hasStatus`, converging to `'installed'`/Play — all live, no navigation.
- Divide-by-zero guard: chose to **skip the `progressUpdate` emit entirely** (not emit `percent:0`) when both the download and staged totals are 0/missing, since a truly-zero payload while `is.installing` is showing a bar would misleadingly render 0% rather than simply not yet showing a bar — matches the plan's "either omit the progressUpdate or emit percent:0" allowance, chose omission as the more conservative option.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `deriveInstallStatusKind`'s `thirdPartyManagedApp` parameter typed as `boolean` instead of the actual `GameInfo['thirdPartyManagedApp']` type (`string | undefined`)**
- **Found during:** Task 2 (`npm run codecheck` after the initial extraction)
- **Issue:** `GameInfo.thirdPartyManagedApp` is `string | undefined` (e.g. an EA/Ubisoft label), not a boolean flag; the initial pure-function signature declared it as `boolean`, which `tsc --noEmit` rejected when `hasStatus.ts` passed the real destructured value through.
- **Fix:** Corrected the parameter type to `string | undefined` to match `common/types.ts`; adjusted the corresponding test fixtures from `thirdPartyManagedApp: true` to a representative string value (`'EA'`).
- **Files modified:** `src/frontend/hooks/hasStatus.ts`, `src/frontend/hooks/__tests__/hasStatus.reconcile.test.ts`
- **Verification:** `npm run codecheck` exits 0; `npm test -- --testPathPattern=hasStatus` green (6/6).
- **Committed in:** `527960ab` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — type-correctness bug caught by the codecheck gate before commit)
**Impact on plan:** Purely a type-signature correction surfaced by `tsc`; no behavioral change to the shipped derivation. No scope creep.

## Issues Encountered

- Confirmed via a throwaway probe test that `hasStatus.ts` cannot be imported directly in this project's no-jsdom, node-env jest config: it transitively imports `hasProgress.ts` -> `InstallProgress.ts`, which calls `window.api.onProgressUpdate(...)` at module load time (not inside a hook body), and separately `./constants.ts` reads `window.localStorage` at module scope. Both throw `ReferenceError: window is not defined` on plain `require`/`import`. Resolved by `jest.mock`-ing `../hasProgress` and `../constants` with lightweight factory replacements in `hasStatus.reconcile.test.ts` before importing `../hasStatus` — this is the same "mock the window-touching module, test the pure logic" pattern already established by `HumbleOriginInfo.test.tsx` in this codebase, just applied one layer earlier (module-scope side effects rather than in-component ones).
- `npm test` (full suite) occasionally prints a post-summary `TypeError: Cannot read properties of undefined (reading 'map')` from `readAcfState`/`getSteamLibraries` inside a `Timeout._onTimeout` callback, after Jest already reports `Test Suites: 49 passed / Tests: 955 passed` and exits with code 0. This is a pre-existing leaked-timer artifact from a `startInstallPolling` test elsewhere in `library.test.ts` firing after mocks reset between test files (`resetMocks: true`) — not introduced by this plan's changes (this plan's new tests never call `startInstallPolling`, only `readAcfState`/`pollInstallOnce` directly), and does not affect the pass/fail exit code. Left as-is; out of this plan's scope per the deviation-rules scope boundary (pre-existing, unrelated-file flake).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both gaps (GAP-17-BOTTLE-PROGRESS, GAP-17-BOTTLE-INSTALL-DONE-DESYNC) are closed with automated coverage; the remaining verification is the manual HUMAN-OBSERVABLE step from 17-07's session-3 UAT (resume step 3->4 on real macOS + CrossOver): confirm the progress bar visibly advances during a bottle download and the button/tile flip live on completion.
- No backend routing, DownloadManager, MainButton, or GameStatus changes were needed — the fix surface stayed exactly where the plan's threat model scoped it (ACF byte parsing + frontend live-reconciliation), so no new threat-surface flags to report.

---
*Phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i*
*Completed: 2026-07-11*
