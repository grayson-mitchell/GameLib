---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 11
subsystem: steam-polling
tags: [typescript, sidecar, ipc, state-events]
requires: [80-01]
provides:
  - steamPollStateEvent shell-only invoke channel (zod discriminated union over all 8 StateEvent kinds)
  - registerSteamPollEventFlows(deps) in src/backend/sidecar/steamPollEventRegistration.ts (the only poll code left in TS)
  - applyMacArchVerdict and macArchCheckNeeded exports in library/macArch.ts
affects: [80-14, 80-19, 80-30, 80-31]
key-files:
  created:
    - src/backend/sidecar/steamPollEventRegistration.ts
    - src/backend/sidecar/__tests__/steamPollEventRegistration.test.ts
  modified:
    - src/common/types/ipc/sidecarInternal.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/storeManagers/steam/library/macArch.ts
    - src/backend/sidecar/__tests__/ipcSchemas/sidecarInternal.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
decisions:
  - "Handler takes manager: () => ManagerDeps and refreshInstallState, built from managerDepsFromServices in handlers.ts"
  - "bridgeAuthoritative is replied on uninstalled and forcedWindowsViaBottleCleared acks (the latter is the tick's preceding event)"
  - "applyInstalled/applyUninstalled reproduce the inline poll mutations; poll files untouched"
metrics:
  tasks: 2
  files: 7
  completed: 2026-11-16
---

# Phase 80 Plan 11: TS state-event handler Summary

The sidecar now answers the shell-originated `steamPollStateEvent` invoke (caller `shell`, strict zod per kind, numeric appId regex) by calling the existing TS functions and replying `{applied, title, macArchCheck?, bridgeAuthoritative?}`. `pushGameToLibrary` is sent inside the apply, before the handler returns, so it precedes the ack on stdout. Events are full-state, so replay is idempotent. A throwing apply replies `{applied:false}` and logs channel/appId/kind/error name only. No timers, watchers or handles.

## Commits

- 85563f38e: macArch.ts split (`applyMacArchVerdict`, `macArchCheckNeeded`); `verifyMacArchGroundTruth` unchanged in behaviour (library.macArch.test.ts, 39 tests, green and unedited)
- 58faede90: schema, handler, registration, 14 Jest tests

## Verification

diPhaseGates, the handler test (14, one per behaviour bullet plus ordering and idempotence), library.macArch, ipcSchemas (1417) green; `pnpm codecheck` green; prettier clean (all files `ignored:false`). No `jest.mock` ratchet change needed (new file mocks only `backend/logger`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated sidecarInternal.test.ts fixture table and channel count (13 -> 14)**: the typed `FixtureTable` and shell-caller list require an entry for every new channel.

**2. [Rule 3 - Blocking] testContainment.test.ts**: classified the new test file as structurally contained (T-34.2-83 tripwire).

**3. [Rule 3 - Blocking] handlers.ts call-site comment** reworded to avoid the IN-01 "channel count" census regex.

## Deferred Issues (pre-existing, not caused by this plan)

`flowRegistrationCensus` (appShell/shellFiles count rows and docstring) and `ipcDomainCensus` (total 291 vs 297) fail on files this plan does not touch; they reflect other uncommitted work in the tree.

## Known Stubs

None. Threat flags: none (T-80-33..36 mitigated: shell-only caller, strict schemas, minimal logging, no handles).

## Self-Check: PASSED
