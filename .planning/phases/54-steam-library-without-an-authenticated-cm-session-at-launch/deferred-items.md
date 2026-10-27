# Phase 54 deferred items

## Pre-existing backend jest failures (found in 54-03, out of scope)

Three sidecar suites fail identically with the pre-phase `user.ts` (verified by running them against the version at 3e8823f00), so they are not caused by Phase 54:

- `src/backend/sidecar/__tests__/installFlows.test.ts` (Test 1b: `listSteamLibraryTargets` ... "Cannot read properties of undefined (reading 'map')")
- `src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts` (channel-count completeness)
- `src/backend/sidecar/__tests__/testContainment.test.ts` (channel-set containment, `addTestOnlyListener is not a function`)

Also pre-existing: `macSteamOffline.ts` line ~91 has a `prefer-promise-reject-errors` eslint error from plan 54-01.
