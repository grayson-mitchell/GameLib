---
created: 2026-11-21
title: "Migrate the sidecar test mocks off fileStore, then delete fileStore.ts (Phase 82 criterion 5 left open by 82-04)"
source: phase 82 plan 82-04 (halted Task 1)
area: sidecar-store-layer
files:
  - src/backend/sidecar/fileStore.ts
  - src/backend/sidecar/__tests__/fileStore.test.ts
  - src/backend/stores/storeRoot.ts
  - src/backend/__mocks__/store_backend.ts
  - src/backend/jest.setupContainment.ts
  - src/backend/__tests__/diPhaseGates.test.ts
  - meta/backendDiCeilings/sidecar.json
  - meta/knip-baseline.txt
severity: minor
platform: any
ready: code
---

## Problem

Plan 82-04 was meant to delete `src/backend/sidecar/fileStore.ts`. The deletion was halted under
the plan's own "a live importer reaches it" stop clause, and nothing was removed.

The file is dead **at runtime**: the esbuild metafile of the dev sidecar bundle (584 inputs) has
no `fileStore.ts`. It is still live **in tests**. About 30 files under `src/` mock the store
backend as

```ts
jest.mock('backend/store_backend', () => ({
  default: jest.requireActual('../fileStore').default
}))
```

Examples are skeletonFlows, loggerFlows, storeLayer, steamFlows, installFlows, settingsFlows and
testContainment. Deleting the file breaks every one of them. `82-RESEARCH.md`'s "fileStore live
or dead (settled)" section says the only importers are one test file and fileStore's own test.
That is wrong.

## Why it is not mechanical

Those suites rely on fileStore's path-keyed cell and containment semantics. The conf-backed shim
behaves differently, so each suite has to move to a test store root deliberately. Swapping the
import path is not enough. Expect about 29 files of churn.

## Solution

1. Give `src/backend/stores/storeRoot.ts`, or a testUtils helper, a test store root that keeps the
   path-keyed, contained behaviour these suites depend on.
2. Move each `requireActual('../fileStore')` mock onto it, one suite at a time, keeping every
   suite green.
3. Then do 82-04 Task 1 as written:
   - delete `fileStore.ts` and its test;
   - remove the storeRoot cells and test cases that existed only for it;
   - remove its diPhaseGates ledger line and the `meta/backendDiCeilings/sidecar.json` jestMock
     line;
   - update the stale comments;
   - update `meta/knip-baseline.txt`.
4. Re-run the dev-bundle metafile check to confirm the file is still absent from the runtime
   graph.

This may fold into Phase 85 (the StoreHost flip, see `82-STATE-OWNERSHIP.md`), which reworks the
TS store layer anyway. If so, close this todo there rather than doing the migration twice.

## Resolution

Resolved 2026-11-21 by quick task 261121-pwt (commits 7fc103955, ccf09a995, 06a741eb1).

- No separate test store root was needed. The production conf-backed `store_backend.ts`, built through the
  existing `createTestStoreRoot`, already provides what the suites relied on: two instances on one path see each
  other's writes (conf re-reads the file on every access), `translateStoreOptions` carries the WR-11 containment
  check, and dot-prop's `disallowedKeys` rejects prototype key segments. `storeRoot.test.ts` now pins the
  root-sharing behaviour on `GameLibStore` (two roots never share a file for one name; one root and one path see
  each other's writes and deletes), and its WR-11 containment cases are unchanged.
- 28 mock-site suites (planning list 29, minus `loggerFlows.test.ts` that 84-07 deleted) dropped their
  `backend/store_backend` redirect. Failing-test set across those suites plus `storeRoot`, `diPhaseGates`,
  `bootstrap` and `gameDetailsImportGate` (32 suites, 878 tests): empty before the first edit, empty after.
  No test fixture needed changing.
- `fileStore.ts`, its test and `StoreRoot`'s cell registry are deleted. Dev-sidecar esbuild metafile: 589 inputs
  before the deletion and 589 after, `fileStore.ts` absent from both, `store_backend.ts` present in both.
- Phase 85 need not repeat this work.
