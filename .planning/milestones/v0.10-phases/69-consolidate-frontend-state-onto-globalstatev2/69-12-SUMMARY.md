---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 12
subsystem: frontend-state
tags: [zustand, downloadsState, D-15, downloads]
requires: [69-10]
provides: [downloadsState store (finished list + refresh/clear actions), registerDownloadsListeners boot wiring, backend finishedList pure helpers]
key-files:
  created: [src/frontend/state/downloadsState.ts, src/frontend/state/__tests__/downloadsState.test.ts, src/backend/downloadmanager/finishedList.ts, src/backend/downloadmanager/__tests__/downloadqueueFinished.test.ts]
  modified: [src/frontend/state/initStateSubscriptions.ts + test, src/frontend/screens/DownloadManager/index.tsx, src/backend/downloadmanager/downloadqueue.ts]
decisions:
  - "No backend candidate holds, so no backend behaviour fix; the finished list is store-owned and refreshed on the old effect's trigger"
  - "Pure extraction keepKnownRunnerElements/upsertFinished (behaviour-identical) so the backend finished logic is testable without jest.mock"
metrics:
  completed: 2026-11-10
---

# Phase 69 Plan 12: downloadsState Summary

The completed-downloads list now lives in `downloadsState` and is no longer refilled from the backend on component mount. It is pulled once at boot and re-pulled when a pushed queue's length or head appName changes. Clear and clear-item write `downloadManagerStore.set('finished', ...)` with the same key and values as before. `doneElements` sorts a copy, so the store array is never mutated.

## Commits
- 3d6c79792: D-15 diagnosis tests and pure finished-list extraction
- 3e1b8cb73: downloadsState store, boot wiring, DownloadManager reads the store

## D-15 diagnosis

| Candidate | Verdict | Evidence |
|-----------|---------|----------|
| C1 store divergence | Does not hold | `downloadManagerStore` is `TypeCheckedStoreFrontend('downloadManager')`; `storeSet` goes through `applyStoreWrite`, which resolves the registered backend instance via `getRegisteredStore` (the same object downloadqueue reads). `downloadManager.finished` and `.queue` are in the storePolicy allow-list (test asserts `isWritableStoreField`). |
| C2 pruning/reset | Does not hold | `pruneUnknownRunnerElements` runs only at startup and drops only unknown runners; tests show epic/gog/amazon/steam/sideload entries all survive and nothing but the renderer Clear paths writes `[]`. Read-only inspection of the operator's persisted store: queue 0 entries, finished 2 entries (runners: steam, steam; status done), so steam entries persist. |
| C3 Steam-managed bypass | Holds only by design | Installs that run through `initQueue` go through `addToFinished` (steam entries are present in the persisted store). Externally-managed Steam rows ("Managed by Steam" section) come from the non-persisted libraryStatus and are never queue elements, so they cannot persist; a dropped already-installed head is deliberately not recorded as finished. Not changed (R1). |

Frontend cause recorded: the component replaced its local list with whatever the backend held on every mount and every queue change, and held it only in component state. The history is now store-owned, so a tab switch no longer loses or re-fetches it. Since no backend defect was found, the old failure could not be reproduced from code; whether the operator's report is fully resolved is the live gate (D-16 item in 69-26). No red-then-green was possible because there is no backend fix: the new backend tests were green from the start by design (they prove the candidates do not hold).

## Deviations
- [Note] `refreshFinished` tolerates an undefined pull result (`info?.finished`) so the boot test's default fake api does not reject.
- [Note] No `meta/knip-baseline.txt` change was needed.

## Gates
- Frontend jest: 313 suites, 5338 tests pass. lint 0 errors. frontend-context-ceiling and backend-di-ceilings PASS. prettier clean. downloadsState and backend tests contain no `jest.mock(`. `PERF_ERA=check pnpm perf:rerender` runs; check.json deleted, baseline untouched.
- `pnpm codecheck` and `pnpm find-deadcode` currently FAIL, but only from another session's uncommitted phase 66.1 edits (src/backend/process/runner.ts, types.ts, testUtils/scriptedRunner.ts: a `ChildHandle` type error and a new `DRAIN_GRACE_MS` export finding). Neither is in a file this plan touched; the knip finding for my own new `DownloadsState` export was fixed by un-exporting it.

## Self-Check: PASSED
