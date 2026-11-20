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
