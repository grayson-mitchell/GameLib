---
phase: quick-261026-ku9
plan: 01
tags: [bridge, path-containment]
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/bridgeScan.ts
    - src/backend/storeManagers/steam/bridge/__tests__/bridgeScan.test.ts
requirements: [53-REVIEW-IN-03]
completed: 2026-10-26
---

# Quick 261026-ku9: isContainedWithin accepts ..-prefixed child names

`isContainedWithin` in bridgeScan.ts now rejects only `''`, `'..'`, `'..'+sep`-prefixed or absolute relative paths, so `..foo` children count as contained.

## Commits
- `8a155aabd` fix: the function, doc comment, `sep` import, new test
- `2f8753bdc` docs: todo moved to completed/ with Resolution

## Verification
- jest bridgeScan.test.ts: 17/17 pass (RED confirmed first: the `..foo` case failed)
- tsc --noEmit: clean
- prettier --check on both files and the moved todo: clean
- pnpm planning-gates: 12/12 pass

## Deviations
None.

## Follow-up: other copies of the `startsWith('..')` idiom (not touched)
Same `rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)` shape:
- src/backend/storeManagers/steam/library.ts:167
- src/backend/storeManagers/steam/bridge/importScan.ts:76
- src/backend/storeManagers/steam/bridge/bridgeConfig.ts:79
- src/backend/storeManagers/steam/bridge/steamClientSetup.ts:41

Other production hits: knownFixes.ts:105, knownFixesFetcher.ts:81, store_backend.ts:84, sidecar/fileStore.ts:132, sidecar/rendererPathGuard.ts:87, sidecar/settingsFlowRegistration.ts:111, steam/games.ts:1929,3837, steam/installLocation.ts:218, steam/bridgeKnownFixes.ts:151, steam/depot.ts:1310,1753,2286, steam/bottleProcessMonitor.ts:151, steam/library.ts:1682,2281, jest.setupContainment.ts:336,533, testUtils/fakeHomeProfile.ts:170 (plus test files).

## Self-Check: PASSED
