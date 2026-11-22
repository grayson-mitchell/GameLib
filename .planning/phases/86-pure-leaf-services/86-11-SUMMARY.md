---
phase: 86-pure-leaf-services
plan: 11
subsystem: info-overrides-shims
tags: [overrides, shims, gamedetails, store-table, extra-rows, delete-gate, d-05, d-06, d-13, d-18, d-29]

requires:
  - phase: 86-pure-leaf-services
    provides: "86-10 info_overrides_* rustInvoke ops, 86-09 shim pattern and harness acks, 86-05 delete gate and shim schedule"
provides:
  - "src/backend/info/gameOverrides.ts: getGameOverrides, getAllGameOverrides, setGameOverrides, attachOverrides, four async one-call shims"
  - "gamedetails callers awaiting the shims (getGameInfo, setGameMetadataOverride) with the TS log lines written from the boolean the set op returns"
  - "store/game-overrides row in meta/genStoreTable.ts EXTRA_ROWS (tsNames kept), storeTable.json byte-identical"
  - "describe('gameOverridesPortComplete') and four infoShimSchedule rows (deletedBy 88)"
  - "sidecarHarness answers the info_* rustInvoke ops by default and takes per-case rustAnswers"
affects: [86-12, 86-17, 86-24]

actuals:
  tokens: 27500
  tasks: 2
  commits: 2

key-files:
  created:
    - src/backend/info/gameOverrides.ts
    - src/backend/info/__tests__/gameOverrides.test.ts
  modified:
    - src/backend/gamedetails/dispatch.ts
    - src/backend/gamedetails/overrides.ts
    - src/backend/gamedetails/__tests__/gameDetailsModules.test.ts
    - src/backend/sidecar/gameDetailsFlowRegistration.ts
    - src/backend/sidecar/__tests__/gameDetailsFlows.test.ts
    - src/backend/sidecar/__tests__/helpers/sidecarHarness.ts
    - src/backend/__tests__/infoShimSchedule.test.ts
    - src/backend/__tests__/infoPortComplete.test.ts
    - src/backend/stores/createStores.ts
    - src/backend/services/types.ts
    - src/backend/testUtils/testServices.ts
    - src/backend/stores/__tests__/fixtures/registeredStores.json
    - meta/genStoreTable.ts
    - src/backend/__tests__/storeKinds.test.ts
    - src/backend/__tests__/storeMirrorSchedule.test.ts
    - src/backend/__tests__/diPhaseGates.test.ts
    - src/backend/stores/__tests__/userStateFamily.test.ts
    - src/backend/testUtils/__tests__/testServices.test.ts
    - src/backend/sidecar/__tests__/storeLayer.test.ts
    - src/backend/sidecar/__tests__/bootSourceShape.test.ts
    - src/backend/stores/__tests__/createStores.test.ts
    - src/backend/store_backend.ts
  deleted:
    - src/backend/game_overrides/index.ts
    - src/backend/game_overrides/stores.ts
    - src/backend/info/__tests__/oracle/gameOverrides.oracle.test.ts

key-decisions:
  - "The log lines move to the caller: a D-06 shim may hold nothing but the typed call, so `setGameMetadataOverride` (gamedetails/overrides.ts) writes `Saved overrides for X` on a true result and `Failed to save overrides for X` otherwise, the lines the deleted TS `setGameOverrides` wrote."
  - "`info_overrides_get_all` is sent with an EMPTY argument list, not the plan's `[{}]`: the crate returns `info_overrides_get_all:bad-args` for any argument."
  - "The shims resolve `unknown` (the transport is untyped, as in recentGames.ts) and the two callers state the shape they read with a cast, rather than widening the shape gate to accept `as`."
  - "storeMirrorSchedule keeps CURRENT_PHASE at 85 and gains `DELETED_IN_PHASE_86` (gameOverridesStore): its cell stays 86, the mirror is gone. 86-17 and 86-24 add their stores to the set; it empties when phase 86 closes."
  - "storeKinds' renderer-mirror rule accepts a name from a storeTable.json row's tsNames, because `gameOverridesStore` still has a renderer mirror and now has no backend declaration."

patterns-established:
  - "A booted-sidecar test that needs a Rust op to behave passes `rustAnswers` to bootFresh (an in-memory double); without it the harness answers the info_* ops with nothing stored and every write accepted."
  - "A store whose TS registration is deleted keeps a row: EXTRA_ROWS entry with the current tsNames, regenerated storeTable.json byte-identical, and the `userStateFamily` suite lists it under NO_TS_STORE."

requirements-completed: []

plan_head_before: d63b8f8146cc30df79f9dcf854d8648ca0a3b4d4
plan_head_after: ccb1949d93083a6eca5195d8b8ce5e2eb220e5d6
commits: 2
status: complete
---

# Phase 86 Plan 11: Overrides Shims and the TS Delete Summary

**Per-game overrides have no TS left beyond four scheduled async shims: gamedetails awaits them, the TS slice and its store registration are gone, and `store/game-overrides` keeps its user-state table row through `EXTRA_ROWS` with `storeTable.json` unchanged to the byte.**

## Accomplishments

- `src/backend/info/gameOverrides.ts` holds `getGameOverrides`, `getAllGameOverrides`, `setGameOverrides` and `attachOverrides`, each one typed `requestRustInvoke` call to `RUST_INFO_OVERRIDES_GET / _GET_ALL / _SET / _ATTACH`, deps typed `RustInvokeDeps`. The common `MetadataOverride` type matches the old `GameMetadataOverride` field for field, so it replaced it.
- The Pitfall 9 ripple is two call sites. `getGameInfo` returns `await attachOverrides(...)`. `setGameMetadataOverride` is async: it awaits the write, logs from the returned boolean, then notifies with `await getAllGameOverrides(deps)`. The `setGameMetadataOverride` send registration now `.catch`es into the same `logSendFailure` line a sync throw used (a Rust rejection or a throwing notifier both land there, zero unhandled rejections).
- Deleted `game_overrides/index.ts`, `stores.ts` and the TS oracle (the golden fixtures stay for the Rust golden). Removed `gameOverrides` from `createStores`, the `Stores` type, `testServices`, `EXPECTED_KINDS` and `registeredStores.json`.
- `store/game-overrides` moved to `EXTRA_ROWS` (kind user-state, dotPaths, `tsNames: ['gameOverridesStore']`). Regenerating gave `git diff --quiet src/common/types/ipc/storeTable.json` exit 0 and `--check` up to date (T-86-21).
- `describe('gameOverridesPortComplete')`: the three files deleted, the golden `overrides` dir kept, five forbidden identifiers (including `gameOverridesStore`, which the SC4 wording named), no TS registration of the two native channels, no `GAMELIB_GAME_OVERRIDES`, `store/game-overrides` still in `storeTable.json` with its kind and renderer name. Four `infoShimSchedule` rows, `deletedBy: 88`, `callers` both gamedetails files (the check is per file).

## Task Commits

1. Task 1 (tracer): `73e25675a` feat(86-11): four async override shims and the gamedetails await ripple
2. Task 2: `ccb1949d9` feat(86-11): delete the TS overrides slice and its store, keep the store-table row

The tracer gate: the shim forwarding tests, the gamedetails suites, `gameDetailsFlows` (37), `pnpm codecheck` and prettier were green before the expansion in Task 2. Auto mode was not needed; the gate ran inline as part of the Task 1 verify.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `info_overrides_get_all` takes an empty argument list**
- **Found during:** Task 1
- **Issue:** The plan's `[{}]` would be rejected by the crate (`info_overrides_get_all:bad-args`); the schema is `empty`.
- **Fix:** The shim sends `[]`; its test pins that.
- **Files modified:** src/backend/info/gameOverrides.ts, src/backend/info/__tests__/gameOverrides.test.ts
- **Commit:** 73e25675a

**2. [Rule 3 - Blocking] Log lines cannot live in a shim**
- **Found during:** Task 1
- **Issue:** The carry-forward asked the shim to log from the boolean, but the D-06 shape check allows no statement beyond the one call.
- **Fix:** The lines are written by `setGameMetadataOverride`, the shim's only caller.
- **Files modified:** src/backend/gamedetails/overrides.ts
- **Commit:** 73e25675a

**3. [Rule 3 - Blocking] The booted-sidecar harness had to answer the new frames**
- **Found during:** Task 1
- **Issue:** `getGameInfo` and `setGameMetadataOverride` now send `info_overrides_*` frames; the harness left them unanswered (a timeout). `gameDetailsFlows.test.ts` also built the deleted real store.
- **Fix:** `sidecarHarness.ts` answers the `info_*` ops by default and takes `rustAnswers`; `gameDetailsFlows.test.ts` drives an in-memory double and reads it back.
- **Files modified:** sidecarHarness.ts, gameDetailsFlows.test.ts
- **Commit:** 73e25675a

**4. [Rule 3 - Blocking] Pinned schedules and counts moved with the deletion (files outside the plan list)**
- **Found during:** Task 2
- **Issue:** `storeMirrorSchedule` (cell 86 but CURRENT_PHASE 85, so "due later must exist" failed), `storeKinds` (renderer mirror with no backend declaration), `diPhaseGates` (15 modules and a floor of 16), `testServices.test` (17 families), `userStateFamily` (probes a TS store for every user-state row), `storeLayer` (resolves every registered name), `bootSourceShape`, and `createStores`/`store_backend` comments.
- **Fix:** Each updated with a dated comment; the one floor moved is `66.1 stores modules` 16 -> 15, which equals index.ts plus the 14 remaining stores modules. No allow-list widened to hide a failure.
- **Files modified:** see key-files
- **Commit:** ccb1949d9

**5. [Rule 3 - Blocking] infoShimSchedule rows landed with Task 1**
- **Issue:** The plan lists the four rows under Task 2, but the schedule's discovery test would be red at the Task 1 commit with four unscheduled shims.
- **Fix:** Added in Task 1's commit; nothing else about the rows changed.

## Verification

- `pnpm codecheck` and `pnpm find-deadcode` pass (312 baselined). Full `jest` run: 1147 suites pass; `tauriShellSource.test.ts` failed once under whole-repo load and passes alone (298 tests), the foreign flake already recorded.
- `pnpm backend-di-ceilings` still fails on `steam/__tests__/optInDlc.test.ts` and `frontend/state/__tests__/libraryStoreFollowers.test.ts` (foreign, pre-existing).
- No Rust changed; `cargo` not re-run (the table is byte-identical, so the Rust table tests are unaffected).

## Known Stubs

None.

## Threat Flags

None. No new network, auth or file surface; the shims are the call shape 86-10 already exposed.

## Self-Check: PASSED

- FOUND: src/backend/info/gameOverrides.ts, src/backend/info/__tests__/gameOverrides.test.ts
- MISSING (as intended): src/backend/game_overrides/, gameOverrides.oracle.test.ts
- FOUND commits: 73e25675a, ccb1949d9
