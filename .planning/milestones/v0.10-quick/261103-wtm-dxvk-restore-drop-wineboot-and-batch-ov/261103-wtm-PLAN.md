---
phase: quick-261103-wtm
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/tools/index.ts
  - src/backend/tools/__tests__/dxvkInstallRemove.test.ts
autonomous: true
requirements: [G30]
---

# Quick 261103-wtm: DXVK restore drops wineboot -u on an engine flip, batches the override deletes

Todo: `.planning/todos/pending/2026-11-03-dxvk-restore-drop-wineboot-and-batch-deletes.md`
(G30 follow-ups, deferred by 59-52 until shown on CrossOver).

## Gate (run first)

On a throwaway CrossOver bottle, after a Staging -> CrossOver flip with the DXVK DLLs removed,
show that stock d3d11 and d3d10core are back without `wineboot -u`. Scripts and logs are in `gate/`.

## Tasks

1. `restoreDxvkStrict` in `src/backend/tools/index.ts` (the source-pinned path only; the
   Heroic toggle keeps its old shape): remove the DLLs first, then one `reg import` of a
   generated `.reg` file deleting every override, then one `reg query` of DllOverrides to
   verify, then `wineboot -u` only if a stock DLL is still missing. All steps
   `wait:false, resolveOnExit:true`. Strict failure semantics are unchanged.
2. Tests in `dxvkInstallRemove.test.ts`: order (DLLs gone before the first wine call), the
   `.reg` file contents and cleanup, wineboot skipped/run, a surviving override fails, an
   empty query fails (non-vacuity), a missing key passes, import failure fails.

<verify>
npx jest src/backend/tools/__tests__/ src/backend/storeManagers/steam/engine
npx prettier --check src/backend/tools/index.ts src/backend/tools/__tests__/dxvkInstallRemove.test.ts
</verify>
