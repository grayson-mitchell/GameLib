---
phase: quick-261101-whs
plan: 01
subsystem: steam
tags: [steam, windows, client-setup, uat]
requires: []
provides:
  - Windows isSteamClientInstalled() reads the Default Steam path (same root as the D-11 gate)
  - Phase 21 UAT todo with a no-uninstall test recipe, ready live-gate
affects:
  - src/backend/storeManagers/steam/clientSetup.ts (behaviour of the D-10 gate on Windows)
  - src/backend/sidecar/steamAuthFlowRegistration.ts (checkSteamInstalled IPC follows the setting)
tech-stack:
  added: []
  patterns: [lazy require('backend/config') to keep user.ts off the config graph]
key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/user.ts
    - src/backend/storeManagers/steam/constants.ts
    - src/backend/storeManagers/steam/__tests__/user.test.ts
    - src/backend/storeManagers/steam/__tests__/clientSetup.test.ts
    - .planning/todos/pending/2026-10-16-phase-21-native-install-uat-deferred-to-windows.md
decisions:
  - No fallback to the old Program Files path: the configured path is the single root both gates read.
status: complete
commits: 2
plan_head_before: 2dbba3cfffd1ed2961ab6ab0e3ef5bac662c858a
plan_head_after: 2c1e6d2a69f4da44d90bead81ab4bcf64d7e170e
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
metrics:
  completed: 2026-11-01
---

# Phase quick-261101-whs Plan 01: Windows Steam-client install check honors the Default Steam path Summary

On Windows, `SteamUser.isSteamClientInstalled()` now probes `<defaultSteamPath>\steam.exe` (quotes stripped, blank returns false), the same root the D-11 launch gate reads. The Phase 21 UAT todo carries a no-uninstall recipe and is now `ready: live-gate`.

## What changed

- `user.ts`: win32 branch uses a lazy `require('backend/config')` (same form as `macSteamOffline.ts`), no static import. Root derivation is character-for-character the one in `hasLibraryFoldersVdf()`. Blank root returns false with no probe. darwin/linux path is byte-identical.
- `constants.ts`: win32 entry removed from `STEAM_INSTALL_PATHS`, with a comment saying why.
- Tests: 8 `isSteamClientInstalled()` cases in `user.test.ts` (4 new win32, new darwin/linux "never reads GlobalConfig" cases, existing host-following cases pinned to linux, platform restored in `afterEach`). 3 cross-gate cases in `clientSetup.test.ts`, which delegate the automocked method to `jest.requireActual('../user')` (loaded fine) to drive needs-launch, needs-install and ready through the real probe.
- Todo: recipe section (steps 1-12, caveats, results), `blocked_by` replaced with `unblocked_by`, triage `severity: medium / platform: windows / ready: live-gate`.

## RED evidence

Before the production change: `user.test.ts` had 4 failures (win32 true under configured root; win32 ignores Program Files; win32 strips single quotes; win32 blank path probes nothing). `clientSetup.test.ts` had 3 failures (all three win32 cross-gate cases). After the change: 3 suites, 158 tests passing (150 baseline + 8 new).

## Verification

- jest (user, clientSetup, steamAuthFlows): 158/158.
- `tsc --noEmit` exit 0; eslint 0 errors / 43 warnings (ceiling 43); `findDeadcode` OK; prettier --check clean on the four code files.
- Todo gate passes (17 pending todos); triage order checked; `runPlanningGates.py` shows only the pre-existing `state-sdk-field-anchor-gate.py` FAIL; `prettier --file-info` on the todo reports ignored, so no `--check` was run (it would be vacuous).
- Manual 4a/4b/4c on the operator's Windows box are NOT run and not claimed.

## Deviations from Plan

**1. [Rule 3 - Blocking] Todo verify grep used a basic-regex pattern with `\S`**
- **Issue:** the plan's `grep -q 'Test-Path C:\\SteamUAT\\steamapps...'` is read by GNU grep with `\S` as "non-whitespace", so it cannot match the literal text.
- **Fix:** verified the same string with `grep -cF` (1 match). The recipe text is as specified.
- **Files modified:** none.

**2. Backslash handling in shell heredocs** halved backslashes in a first test pass; corrected before the RED run was relied on and before any commit. No residual effect.

No other deviations. Commits were made on `main` per the orchestrator's instruction (main tree, no worktree).

## Known Stubs

None.

## Threat Flags

None. The probe stays `existsSync` only (T-whs-02) and a blank path never probes (T-whs-03).

## Commits

- 8b305b0f9: fix(quick-261101-whs): Windows Steam-client install check reads the Default Steam path
- 2c1e6d2a6: docs(quick-261101-whs): Phase 21 UAT todo gets a no-uninstall test recipe and unblocks to live-gate

## Self-Check: PASSED

All five modified files exist; both commits are in `git log`.
