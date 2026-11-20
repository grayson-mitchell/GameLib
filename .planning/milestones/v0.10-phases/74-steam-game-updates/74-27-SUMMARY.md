---
phase: 74-steam-game-updates
plan: 27
subsystem: steam-update-queue
tags: [gap-closure, uat-17, uat-18, ipc-schema, download-queue]
requires: [74-23, 74-25]
provides:
  - "depotJobEvent zod union admits kind 'stage' (delta_planning | delta_committing)"
  - "InstallResult.handedOffToSteam; updateQueueElement holds Updating through a Steam hand-off"
  - "update-aware poll MAX_TICKS cap sends a terminal 'done'"
key-files:
  modified:
    - src/common/types/ipc/sidecarInternal.ts
    - src/backend/sidecar/__tests__/ipcSchemas/sidecarInternal.test.ts
    - src/common/types/game_manager.ts
    - src/backend/storeManagers/steam/updateNative.ts
    - src/backend/storeManagers/steam/__tests__/updateNative.test.ts
    - src/backend/downloadmanager/utils.ts
    - src/backend/downloadmanager/__tests__/utils.test.ts
    - src/frontend/state/__tests__/libraryState.test.ts
    - src/backend/storeManagers/steam/library/installPolling.ts
    - src/backend/storeManagers/steam/__tests__/library.installPolling.test.ts
    - .planning/todos/completed/2026-11-13-depot-job-event-ipc-invalid-union.md
    - .planning/todos/completed/2026-11-13-update-button-flash-before-badge-clears.md
key-decisions:
  - "Hand-off flag is set only when an update-aware poll (awaitingUpdate) is registered after startInstallPolling; a no-op against a non-update poll leaves it false so the queue sends 'done' as before"
requirements-completed: [STEAM-01, STEAM-02]
completed: 2026-11-13
---

# Phase 74 Plan 27: Stage event schema and held Updating state Summary

The `stage` job event now passes the depotJobEvent IPC schema (UAT 18), and a Steam-registered update stays in Updating until the update poll ends, so the Update button no longer flashes (UAT 17).

## Commits
- 2a8179c9f (todo move only), 378aa80b1: depotJobEvent `stage` member (strictObject, two-literal enum), tests, todo closed. The first commit carried only the staged `git mv` because the combined `git add` failed on a path; 378aa80b1 holds the real change.
- 2703d006d: `handedOffToSteam` flag, `pollOwnsUpdate` helper in updateNative.ts, updateQueueElement finally, tests (updateNative, utils, libraryState sequence), flash todo closed.
- 08bec1a23: update-aware cap stop sends 'done', tests.

## UAT 17: queue finally (src/backend/downloadmanager/utils.ts)
The finally in `updateQueueElement` sends `{status:'updating', managedBySteam:true}` only when update() resolved `{status:'done', handedOffToSteam:true}`. Every other path (unflagged done, error, abort, throw) sends 'done'. Tests cover each. No timers added.

## Stop-path audit (T-74-92)
| Site | Reachable for awaitingUpdate? | Terminal 'done' before | After |
|------|------|------|------|
| updatePollOnce complete() | yes | updating then done | unchanged |
| updatePollOnce quiet end | yes | done | unchanged |
| installPolling.ts MAX_TICKS cap (~277) | yes | none (silent) | done (fixed, tested) |
| installPolling.ts ~358/~377/~393 (delegated/grace stops) | no: `if (entry.awaitingUpdate) return` precedes them | n/a | n/a |
| installPollOnce.ts stops | no: pollInstallOnce dispatches to pollUpdateOnce and returns | n/a | n/a |
| installPolling.ts cancelDelegatedInstall (~490) | yes (update polls are delegated) | done | unchanged |
| installStop.ts stopInstallPolling | helper, sends nothing itself; callers above | n/a | n/a |
| gameInstallBridge.ts ~551/~615 | no: bridge install of a not-yet-installed game, no update poll | n/a | n/a |

setTimeout/setInterval count in installPolling.ts diff: 0 added.

## Notes
- UAT 18's missing `stage` kind is a likely cause of the out-of-scope todo `2026-11-13-bridge-update-hero-planning-label.md` (no "Planning update..." hero text); that todo was not touched.
- `pnpm check:ipc-contract` reports up to date; no regenerated files.

## Deviations from Plan
None in scope. Pre-existing, not touched: `pnpm lint` reports one `no-useless-catch` error in src/backend/storeManagers/steam/depotRust/install.ts (not in this plan's files); `pnpm codecheck` step 2 (meta/gen_vtables.ts) known failure.

## Verification
jest: sidecarInternal, depotHostChannels, depotChannelParity, updateNative, downloadmanager, libraryState, whole steam dir (4435 passed) all pass; tsc --noEmit, check:ipc-contract, find-deadcode, steam-line-ceiling, planning-gates (12/12), scoped prettier pass. `graphify update .` run.

## Deferred to 74-29 live UAT
No-flash behavior of the Update button after an InstallApp update, and stage text ("Planning update...") reaching the Downloads hero during a bridge delta.

## Self-Check: PASSED
