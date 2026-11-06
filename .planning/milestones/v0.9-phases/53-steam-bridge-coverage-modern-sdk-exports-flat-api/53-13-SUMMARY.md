---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
plan: 13
subsystem: steam-bridge
tags: [bridge-helper, census-trace, stderr-relay, managed-scan]
requires: []
provides:
  - "helper CALL trace emitted only after bridge_dispatch STATUS_OK"
  - "helper-side NOVER cap of 16 per process"
  - "per-line appid-prefixed stderr/stdout relay"
  - "ILONLY-aware effectiveLaunchArch"
  - "managedScan verdict from a single dll key"
affects: [53-16]
key-files:
  modified:
    - native/steam-bridge/helper/bridge_helper.c
    - src/backend/storeManagers/steam/bridge/helperProcess.ts
    - src/backend/storeManagers/steam/bridge/managedImports.ts
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/managedImports.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
decisions:
  - "COMIMAGE_FLAGS_ILONLY stays module-private (dead-code gate)"
metrics:
  tasks: 3
  completed: 2026-10-25
---

# Phase 53 Plan 13: Trace producer and scan correctness Summary

The helper now logs `CALL` only for successful dispatches and caps `NOVER` at 16 lines. The relay prefixes every stderr line with its appid. AnyCPU-as-x64 now requires ILONLY, and the managed verdict reads one dll key.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 | db507407f | WR-04 CALL after `status == STATUS_OK`; WR-06 `g_nover_logged` cap 16; IN-01 latch declaration moved above the T-52-09 comment. Real-clang integration test (20 frames -> 16 NOVER, 20 STATUS_OK) and a source-pin test. |
| 2 | 4b80a1ec9 | WR-03 per-line relay for stderr (logWarning) and stdout (logInfo), empty lines skipped, `handleStderrLine` still sees every line. |
| 3 | 54e7b6284 | WR-02 `effectiveLaunchArch` needs ILONLY; WR-05 `managedKey` feeds both assemblies and unservedFamilyImports. |

## Findings

- The logger (`src/backend/logger`) does not split multi-line messages, so the old whole-chunk log carried the appid prefix on the first line only. That confirmed WR-03.
- No existing fixture relied on `clrFlags` 0x0 meaning x64.

## Deviations from Plan

**[Rule 3 - test construction] WR-05 test uses a stubbed per-arch scan.** With real files both arches see the same Managed dir, so the "entry only under the non-primary dll" state cannot be built. The test spies on `bridgeScan.scanManagedSteamApi` (x64 returns none, x86 returns mono) and uses an unparseable launch exe so both dlls are considered. In production the fix is defensive.

RED-first was not run separately for the TDD tasks; tests and implementation were committed together per task.

## Verification

- helperIntegration + fakeHomeIsolation: 14 passed.
- helperProcess: 20 passed.
- managedImports + shimGenerate + bridgeScan: 136 passed.
- `pnpm codecheck` exits 0; prettier --check passes over the TS paths. bridge_helper.c is not prettier-parseable by design.
- The helper was not run through `pnpm build-steam-bridge`; plan 53-16 rebuilds everything.

## Known Stubs

None.

## Self-Check: PASSED
