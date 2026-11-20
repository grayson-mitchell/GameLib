---
phase: 72-renderer-trust-boundary-and-process-hardening
plan: 06
subsystem: sidecar
tags: [trust-boundary, shell-open, parity-test]
requires: [72-04]
provides:
  - src/backend/sidecar/openPolicy.ts (assertOpenableExternalUrl, classifyFolderTarget, isLaunchableBundle, OpenPolicyError, mirrored consts)
affects: []
key-files:
  created:
    - src/backend/sidecar/openPolicy.ts
    - src/backend/sidecar/__tests__/openPolicy.test.ts
  modified:
    - src/backend/sidecar/shellFilesFlowRegistration.ts
    - src/backend/sidecar/appShellFlowRegistration.ts
    - src/backend/storeManagers/steam/clientSetup.ts
    - src/backend/utils.ts
    - src/backend/sidecar/__tests__/shellFilesFlows.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - src/backend/storeManagers/steam/__tests__/clientSetup.test.ts
requirements-completed: [D-06, D-07, D-08]
completed: 2026-11-08
---

# Phase 72 Plan 06: Sidecar open policy and channel split Summary

`openExternalUrl` is now URL-only, `openFolder` opens only existing non-bundle directories and reveals everything else, and `openUrlOrFile` (the http-else-openPath fallthrough) is deleted. A parity test binds the TS constants to the Rust ones.

## Commits
- d539ebdb4 (Task 1): `feat(72-06): add sidecar open policy with Rust parity tests`
- 1f0ed3378 (Task 2): split URL and folder channels, delete openUrlOrFile

## Renderer-visible behaviour changes
1. `GameSubMenu:433` passes `install_path || folder_name`; a relative `folder_name` is now rejected (logged, category only).
2. A not-yet-existing `savesPath` (CloudSavesSync) is now rejected and logged instead of resolved against the sidecar cwd.
3. `showConfigFileInFolder` reveals the config file (contained under gamesConfigPath for an appName; `../evil` rejected) instead of opening it with its default app.
4. `.app`/bundle install paths passed to `openFolder` are revealed, not launched; files and executables likewise.

## Deviations from Plan
- **[Rule 3]** `steam/clientSetup.ts` imports `shell` from `backend/platform` (its test now mocks `backend/platform`).
- **[Rule 3]** `testContainment.test.ts` requires every sidecar test to be classified; added `openPolicy.test.ts` to the structurally-contained list.
- `openFolder` tests wait 150ms (`flushFs`) because the async realpath/stat outlasts three setImmediate turns.
- `isLaunchableBundle` stays exported (used by the test) so knip passes; baseline untouched.

## Verification
jest sidecar suites + clientSetup: 2960 passed; codecheck, boundaries, find-deadcode, scoped prettier green.

## Known Stubs
None.

## Self-Check: PASSED
