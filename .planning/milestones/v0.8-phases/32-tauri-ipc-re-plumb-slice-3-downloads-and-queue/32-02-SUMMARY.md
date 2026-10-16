---
phase: 32-tauri-ipc-re-plumb-slice-3-downloads-and-queue
plan: 02
subsystem: ipc
tags: [tauri, sidecar, ipc, download-queue, electron-migration, jest, tdd]

# Dependency graph
requires:
  - phase: 32-01
    provides: "downloadQueueFlowRegistration.ts (the five queue-management channels) and the shared downloadQueueFlows.test.ts real-RPC-loop harness this plan extends"
provides:
  - "install/updateGame re-routed onto the real addToQueue() (downloadmanager/downloadqueue.ts), matching Electron's ipc_handler.ts shape exactly (D-01, full parity, no runner guard)"
  - "The Phase 30 D-05a direct SteamGame.install()/update() bypass fully deleted, not wrapped — installQueueElement/updateQueueElement (downloadmanager/utils.ts) now own every queued/installing/done status transition for both builds"
  - "install/updateGame resolve Promise<void> once the element is QUEUED, matching the real typed contract (common/types/ipc.ts:394/404) instead of a reconstructed {status} shape"
affects: [32-03 (docs/PORTED-CHANNELS.md)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Electron-parity re-route: a sidecar handler that used to hand-roll a runner-specific bypass now builds the SAME DMQueueElement Electron's ipc_handler.ts builds and calls the SAME real addToQueue() — zero divergent status-transition logic between builds"

key-files:
  created: []
  modified:
    - src/backend/sidecar/installFlowRegistration.ts
    - src/backend/sidecar/__tests__/downloadQueueFlows.test.ts
    - src/backend/sidecar/__tests__/installFlows.test.ts

key-decisions:
  - "D-01 read as full Electron parity, not a Steam-only re-route: dropped the Phase 30 CR-01 non-steam-runner guard entirely on both install and updateGame. RESEARCH.md's own D-01 wording ('exactly like Electron's ipc_handler.ts') and D-02 ('downloadqueue.ts unchanged/runner-generic — do not narrow to Steam') both point at the runner-generic Electron shape; storeManagers/index.ts already force-constructs all six library managers in the sidecar today (Phase 30 D-05b finding), so a Steam-only guard buys no import-graph savings and would diverge from Electron for nothing."
  - "Legendary DLC fan-out loop (ipc_handler.ts's install handler also runs one) intentionally omitted — plan's own interfaces block scopes it out as not Steam-relevant to this slice."

patterns-established:
  - "When a curated sidecar registration module's own hand-rolled status logic is retired in favor of routing through a shared backend module (addToQueue -> initQueue -> installQueueElement/updateQueueElement), the underlying status-transition edge cases (abort/error/deferredToSetup) no longer need sidecar-specific test coverage — the shared module's OWN existing Electron-side test suite (downloadmanager/__tests__/utils.test.ts) now covers both builds, since there is only one implementation left to diverge."

requirements-completed: [REQ-32-01]

# Metrics
duration: ~30min active
completed: 2026-07-24
---

# Phase 32 Plan 02: Install/UpdateGame Re-Route onto addToQueue() Summary

**Retires the Phase 30 direct-bypass: `install`/`updateGame` now enqueue via the real `addToQueue()` exactly like Electron's `ipc_handler.ts`, giving the Plan 32-01 queue channels a real running install to act on.**

## Performance

- **Duration:** ~30 min (RED test authoring, GREEN re-route implementation, regression fix to `installFlows.test.ts`, full-suite verification)
- **Tasks:** 2 (both TDD: RED then GREEN)
- **Files modified:** 3 (2 test files, 1 production file)

## Accomplishments

- `installFlowRegistration.ts`'s `install`/`updateGame` handlers now build a `DMQueueElement` (`type: 'install'`/`'update'`, `addToQueueTime: Date.now()`, `endTime: 0`, `startTime: 0`) and `await addToQueue(dmQueueElement)` — the exact shape `downloadmanager/ipc_handler.ts:13-22, 46-62` builds, character-for-character (minus the legendary DLC fan-out loop, out of scope for this Steam-focused slice).
- The Phase 30 D-05a bypass is fully **deleted**, not wrapped: the hand-rolled `sendGameStatusUpdate('queued'/'installing')` pushes and the `deferredToSetup`/`wasAborted`/`hadError` try/catch/finally status-suppression logic are gone. `installQueueElement`/`updateQueueElement` (`downloadmanager/utils.ts`), reached via `addToQueue()` → `initQueue()`, already reproduce every one of those transitions unmodified — there is no longer a second, sidecar-only implementation to diverge from Electron.
- Both handlers now resolve `Promise<void>` once the element is QUEUED (`addToQueue()` has no return value), matching the real typed contract (`common/types/ipc.ts:394`/`404`) instead of the bypass's reconstructed `{status: InstallResult['status']}` shape.
- Dropped the Phase 30 CR-01 non-steam-runner guard on both handlers — re-read `D-01`/`D-02` as calling for full Electron parity (`ipc_handler.ts` is runner-generic; `downloadqueue.ts` stays runner-generic per D-02), confirmed no frontend call site (`window.api.install`/`window.api.updateGame` across 6 call sites) branches on the resolved value, so widening scope is safe.
- Removed now-unused `SteamGame`, `showDialogBoxModalAuto`, `logError`/`LogPrefix`, `InstallResult`, and `UNPORTED_CHANNEL_MARKER` imports from `installFlowRegistration.ts`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add install/updateGame → addToQueue enqueue assertions (RED)** - `4dcb76f3` (test)
2. **Task 2: Re-route install/updateGame to addToQueue; delete the Phase 30 bypass (GREEN)** - `28289754` (feat)

_Both tasks are part of a single plan-level TDD gate (individual tasks carry `tdd="true"`) — RED then GREEN, no separate refactor commit needed._

## Files Created/Modified

- `src/backend/sidecar/installFlowRegistration.ts` - `install`/`updateGame` re-routed onto `addToQueue()`; Phase 30 bypass deleted; module docstring rewritten to describe the D-01 re-route
- `src/backend/sidecar/__tests__/downloadQueueFlows.test.ts` - New install/updateGame enqueue assertions (Promise<void> resolve, `installQueueElement`/`updateQueueElement` reached, single-push regression guard); extended the `backend/storeManagers` mock with `getGameInfo` (addToQueue()'s own enqueue-time lookup) and added `updateQueueElement` to the existing `downloadmanager/utils` mock
- `src/backend/sidecar/__tests__/installFlows.test.ts` - Removed 10 tests (Test 2/3, CR-01 ×2, CR-02/Gap-1 ×2, G-30-02, CR-02 ×3 incl. regression guard) that asserted the retired bypass's exact behavior; replaced with an explanatory comment pointing to where equivalent coverage now lives

## Decisions Made

- **D-01 interpreted as full Electron parity (no runner guard):** see key-decisions above. This is a deliberate scope widening beyond the plan text's literal "planner-discretion" framing (which allowed either Steam-only or runner-generic) — chosen because RESEARCH.md's own locked-decision wording for D-01 and D-02 both explicitly favor the runner-generic Electron shape, and the cost (other runners' installs now actually reach their real store managers under the sidecar) was already accepted by Phase 30's own D-05b finding that all six library managers are force-constructed regardless.
- **Legendary DLC fan-out omitted:** matches the plan's own interfaces block ("legendary DLC fan-out loop omitted — not Steam-relevant").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/regression caused by this task] `installFlows.test.ts`'s bypass-specific tests failed once the bypass was deleted**
- **Found during:** Task 2 (full-suite regression run)
- **Issue:** `installFlows.test.ts` contained 10 tests (Test 2/3, CR-01 install, CR-01 updateGame, CR-02/Gap-1 error-surfacing, Gap-1 dialog, Gap-1 client-not-ready, G-30-02 timeout, CR-02 abort, CR-02 deferredToSetup, CR-02 regression guard) that all asserted the exact behavior of the Phase 30 direct `SteamGame.install()`/`.update()` bypass — a hand-rolled `[queued, installing, done]` status sequence, direct `SteamGame` construction, and the non-steam-runner rejection. Deleting the bypass (this plan's own objective) made all 10 fail, since none of that logic exists in `installFlowRegistration.ts` anymore.
- **Fix:** Removed the 10 obsolete tests and replaced them with an explanatory comment. Confirmed no coverage was actually lost: (a) the addToQueue()-reached/Promise\<void\>/no-runner-guard behavior is now covered by this plan's own new tests in `downloadQueueFlows.test.ts` (Task 1); (b) the queued/installing/done status-transition edge cases (abort/error/deferredToSetup) live unmodified in `installQueueElement` (`downloadmanager/utils.ts`), and are already independently covered by the pre-existing `downloadmanager/__tests__/utils.test.ts` suite (e.g. "a CANCELLED native Steam install... force-clears the 'installing' badge", "a bottle guided-setup deferral... still force-clears the badge") — that coverage now applies to both builds since there is only one implementation left.
- **Files modified:** `src/backend/sidecar/__tests__/installFlows.test.ts`
- **Verification:** Full `src/backend/sidecar` + `src/backend/downloadmanager` suite green (14 suites, 180/180 tests, down from 190 as the 10 obsolete tests were removed with no coverage regression). Full backend suite also verified: 87/87 suites, 1812/1812 tests green. `npx tsc --noEmit` clean.
- **Committed in:** `28289754` (Task 2 commit, alongside the GREEN implementation)

---

**Total deviations:** 1 auto-fixed (Rule 1, test regression directly caused by this task's own intended behavior change)
**Impact on plan:** Necessary to keep the full backend suite green after retiring the bypass; does not change this plan's scope (`installFlowRegistration.ts` and `downloadQueueFlows.test.ts` remain the substantive files modified, matching the plan's own `files_modified` list — `installFlows.test.ts` was already touched by 32-01's own precedent deviation for the identical reason).

## Issues Encountered

- Pre-existing, out-of-scope: a leaked-timer crash trace from `storeManagers/steam/library.ts`'s `pollInstallOnce` appears in the console after the full backend suite completes (a worker force-exit warning). This is the same "library.ts leaked-timer jest exit-1" issue already documented from Phase 21 (see `.planning/phases/21-.../` history and project memory) — it does not fail any test (87/87 suites, 1812/1812 tests still pass) and is unrelated to this plan's files.

## Known Stubs

None — no hardcoded empty/placeholder values introduced. `SteamGame.update()`'s pre-existing Phase-2 stub behavior (unrelated to this plan, still calling the identical unmodified method) is untouched; it is no longer referenced directly by this file at all (dispatch now happens through `libraryManagerMap[runner].getGame(appName).update(...)` inside `updateQueueElement`, unchanged from Electron).

## Threat Flags

None beyond the plan's own `<threat_model>` (T-32-04/T-32-05/T-32-SC), which this implementation satisfies as specified: `DMQueueElement.params` flows unmodified into the existing `addToQueue()` → `installQueueElement` path (no new interpolation surface, T-32-04), the resolve-shape now matches the typed `Promise<void>` contract exactly with no synthetic `{status}` reconstruction (T-32-05), and no new package installs (T-32-SC).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 32-03 (docs/`32-PORTED-CHANNELS.md`) can now document `install`/`updateGame` as fully real (not a bypass), alongside the five queue-management channels from 32-01.
- **Deferred (Manual-Only per Phase 30/31/32-01 precedent):** the dual-build smoke check (`npm start` / `npm run tauri:dev` both boot unchanged) named in this plan's `<verification>` block was not run in this environment (no display / long-running dev server) — carries forward as open manual verification, consistent with the existing doubly-gated live-E2E blockers (G-30-01/G-30-02) noted in `.planning/STATE.md`.
- The re-route now means a real `install`/`updateGame` invoke under the Tauri sidecar reaches `downloadqueue.ts`'s full import-time side effects (the `downloadManager` store, the `onConnectivityChange` auto-pause/resume listener) — this was an anticipated, already-prepared-for cost (Phase 29 D-15), not a new one, but worth noting for anyone tracing sidecar boot behavior going forward.

---
*Phase: 32-tauri-ipc-re-plumb-slice-3-downloads-and-queue*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: src/backend/sidecar/installFlowRegistration.ts
- FOUND: src/backend/sidecar/__tests__/downloadQueueFlows.test.ts
- FOUND: src/backend/sidecar/__tests__/installFlows.test.ts
- FOUND commit: 4dcb76f3 (Task 1, RED)
- FOUND commit: 28289754 (Task 2, GREEN)
