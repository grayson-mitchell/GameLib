---
phase: quick-261121-pwt
plan: 01
subsystem: sidecar-store-layer
tags: [tests, store_backend, conf, fileStore-deletion, phase-82-criterion-5]
requires:
  - Phase 84 plans 84-06 and 84-07 committed
provides:
  - sidecar suites run the production conf-backed store (src/backend/store_backend.ts)
  - root-sharing behaviour pinned on GameLibStore in storeRoot.test.ts
affects:
  - Phase 85 (store host): need not repeat the file-store migration
tech-stack:
  added: []
  patterns: [production store under test via createTestStoreRoot, no store mock]
key-files:
  created: []
  modified:
    - src/backend/stores/__tests__/storeRoot.test.ts
    - src/backend/stores/storeRoot.ts
    - src/backend/store_backend.ts
    - src/backend/sidecar/__tests__/gameDetailsImportGate.test.ts
    - meta/backendDiCeilings/sidecar.json
  deleted:
    - src/backend/sidecar/fileStore.ts
    - src/backend/sidecar/__tests__/fileStore.test.ts
decisions:
  - No test-only store root was written; the production store plus createTestStoreRoot already provides the behaviour the suites relied on.
status: complete
metrics:
  completed: 2026-11-21
actuals:
  tokens: 31000
  tasks: 3
  commits: 4
plan_head_before: 412f8fbc5b91c250a5026ec36b53056e65ea5c8d
plan_head_after: 752a2e614c6c9061cc0617d1cb1f1aad7a5fc4d3
---

# Quick 261121-pwt: Migrate the sidecar test mocks off fileStore, then delete it

The Phase 27 sidecar file store is deleted. 28 sidecar suites now run the production conf-backed `store_backend.ts` instead of a `jest.mock('backend/store_backend')` redirect, with no change to any assertion or fixture. `StoreRoot`'s cell registry went with it. This closes the file-store half of Phase 82 criterion 5.

## Baseline and result

- Baseline (before the first edit): 32 suites, 878 tests, 0 failing. `before-failing.txt` is empty.
- After each task, and after the deletion: the same 32 suites, the failing set empty (diff against baseline prints nothing). After Task 3 the run is 877 tests rather than 878: the `diPhaseGates` `it.each(OWNED_66_4)` lost the one case for the deleted file, and its floor case needed the move described under Deviations (it passes: 159/159 in that suite).
- Wider sweep (sidecar, `src/backend/__tests__`, stores, storeVersioning, common, testUtils; 615 suites): 3 failures under 12-way parallel load (`appShellFlows` CR-02 queue-once case, `migrationsWiring` Legendary adoption case, `rustInvokeChannel`). All three pass when run alone, twice. `rustInvokeChannel` does not touch the store. Treated as load flakiness, not caused by this change.

## Migrated suite count, reconciled against the planning list

The planning list had 29 mock-site suites (28 plus `loggerFlows.test.ts`). 84-07 deleted `loggerFlows.test.ts`, so the live grep returned 28: `storeLayer.test.ts` in Task 1 and 27 in Task 2. No new file with the same mock appeared and no other planned file was missing. Every migrated suite's jestMock ceiling dropped by exactly one (28 lowered in total, plus the deleted `fileStore.test.ts` line removed); no ceiling was raised.

## Comments whose claim changed in meaning

- `bootstrapWirings.test.ts`: the old reason for pre-creating the userData directory ("the store only mkdirs on its first write") is false now; `prepareStore` creates the store directory at construction. The step stays, justified as mirroring an app start so the anticheat write does not depend on which store made the folder first.
- `skeletonFlows.test.ts` CR-01: the second guard is now dot-prop's `disallowedKeys` inside conf 10.2.0, alongside `applyStoreWrite`'s guard (c'). The old store is named only as history.
- `electronUntouched.test.ts`: `REAL_STORE_PATH` mirrors `translateStoreOptions` (no name gives configName `config`). The stale electron/electron-store banner above the removed mock became a statement that the production store runs unmocked.
- `storeLayer.test.ts` CacheStore comment: same-path sharing is conf re-reading the file on every access, not a shared in-memory cell. The header's "TOKEN-WIPE SAFETY", electron-shim and mock-count claims were corrected to what the file actually does.
- `handlers.ts` `resolveRawStore` docstring: same-path sharing is conf re-reading, not a D-14 cell.
- `testContainment.test.ts`: classification comments for bootstrapUserReconcile, playtimeQueueBootDrain, gogPresenceBootWire, signInProbeBootWire and engineTempSweepBootWire no longer claim a `backend/store_backend` mock in the "approved preamble"; containment is still structural.
- `migrationsWiring`, `onlineMonitorWiring`, `shellFilesFlows`, `playtimeLockBootClear`, and the shared flow-suite headers: no longer say `backend/store_backend` is mocked or routed at a shim; they say it is unmocked since this task.
- `store_backend.ts`, `__mocks__/store_backend.ts`, `knownFixes.ts`, `storeWriteHandlers.ts`, `storePolicy.ts`, `settingsFlowRegistration.ts`, `jest.setupContainment.ts`, `tauriTransport.ts`: references to the file store now describe store_backend's own containment or conf/dot-prop behaviour, or name the file store only as deleted history.
- `82-STATE-OWNERSHIP.md` legend `SC`: the persistence layer is store_backend (conf); the file store never ran in production and was deleted by this task.

## Fixture changes in Task 2 Step 4

None. No suite newly failed, so no fixture or setup moved.

## Metafile results (dev sidecar entry `src/sidecar/index.ts`, scratch outfile)

- Before the deletion: 589 inputs, `fileStore.ts` absent, `store_backend.ts` present. (Planning recorded 591; other work changed the count.)
- After the deletion: 589 inputs, `fileStore.ts` absent, `store_backend.ts` present.

## Knip

`pnpm find-deadcode`: PASS, 312 baselined findings, no vanished line. `meta/knip-baseline.txt` is unchanged.

## Deviations from Plan

**1. [Rule 3 - Blocking] gameDetailsImportGate sha256 pins re-pinned.** `gameDetailsImportGate.test.ts` pins `electronUntouched.test.ts` (Gate 8) and `settingsFlowRegistration.ts` (Gate 7) by sha256. Task 2 removed the mock from electronUntouched and Task 3 reworded one comment in settingsFlowRegistration, so each digest moved. Re-pinned both per each gate's documented procedure, with dated history entries and the prior digests kept. Neither change touches a registration, guard, assertion or fixture (the settingsFlowRegistration change is comment-only). Files: `gameDetailsImportGate.test.ts`. Commits: ccf09a995, 06a741eb1.

**2. [Rule 1 - Bug] diPhaseGates owned-list floor.** Deleting the OWNED_66_4 entry for `fileStore.ts` left the list at 76 entries against a floor of 77, so "the owned list is a full scan (floor)" failed. Moved the floor 77 to 76 with a dated comment, following that test's own convention (the floor equals the list length). Commit: 06a741eb1.

**3. Pre-existing `pnpm backend-di-ceilings` failures, not mine.** The ratchet still reports `steam/__tests__/games.test.ts` grew 47 > 45 (another session's uncommitted edit), and `otherSessionPlaying.test.ts` and `steamOfflineMode.test.ts` as new violations with no baseline. None of these are in this task's files, and every entry this task owns is clean. Left alone per the scope boundary.

**4. Leftover references outside the plan's scope.** `src-tauri/crates/gamelib-core/src/paths.rs`, `store.rs` and `gamelib-steampoll/src/profile.rs` still mention `fileStore.ts` / `FileStore` in comments as the TS shape the Rust code matches. The plan's grep covered `src/` and `meta/` only, so they were not touched. A follow-up could reword them.

## Gates

- `pnpm codecheck`: clean. `pnpm lint`: production PASS, tests PASS. `pnpm find-deadcode`: PASS. `pnpm planning-gates`: 12/12 (run again after the todo moved).
- `git grep -inw filestore -- src meta`: 0 lines. `git grep -l "requireActual('../fileStore')" -- src`: 0.
- `npx prettier --check` over every non-ignored written path: clean.

## Known Stubs

None.

## Threat Flags

None. No new endpoints, auth paths or schema changes. The WR-11 containment describe in `storeRoot.test.ts` is unchanged, and the CR-01 regression test in `skeletonFlows.test.ts` passes against the production store (T-pwt-01, T-pwt-02 mitigations held).

## Commits

- 7fc103955 `test(quick-261121-pwt): pin store-root sharing on the production store; storeLayer off the file-store mock`
- ccf09a995 `test(quick-261121-pwt): sidecar suites run the production store instead of the file-store mock`
- 06a741eb1 `refactor(quick-261121-pwt): delete the sidecar file store and its cell registry (Phase 82 criterion 5)`
- 752a2e614 `docs(quick-261121-pwt): close the fileStore migration todo`

Nothing pushed. Other sessions' uncommitted files were left unstaged throughout.

## Self-Check: PASSED

- `src/backend/sidecar/fileStore.ts` and its test: absent. All four commits are ancestors of HEAD. The todo is in `.planning/todos/completed/` with a Resolution section.
