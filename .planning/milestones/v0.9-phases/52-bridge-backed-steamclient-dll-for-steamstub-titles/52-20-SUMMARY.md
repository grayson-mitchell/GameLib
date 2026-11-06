---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 20
subsystem: steam-bridge
tags: [gap-closure, WR-09, gen_vtables, steamclient]
requires: []
provides:
  - off-SteamStub-path local answers for the eight non-lookup SteamClient017/014 wire methods
affects: [native/steam-bridge/generated/steam_api_shim.c]
key-files:
  modified:
    - meta/gen_vtables.ts
    - meta/__tests__/gen_vtables.test.ts
    - native/steam-bridge/generated/steam_api_shim.c
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/deferred-items.md
key-decisions:
  - "Off-path values are the 7ed535984 pre-phase answers (CreateSteamPipe/ConnectToGlobalUser 1, others 0 or void), not 0 for all"
  - "CreateLocalUser out-value is left untouched off-path, as the pre-phase stub did"
metrics:
  completed: 2026-10-24
  tasks: 2
  files: 4
---

# Phase 52 Plan 20: WR-09 SteamClient off-path gate Summary

Ordinary x64 bridge titles now get the pre-phase local answer from the eight non-lookup SteamClient017/014 wire methods, ahead of `bridge_transact`. The SteamStub path, where `g_bridge_steamstub_path_active` is set, still forwards unchanged.

## Commits
- 753f7a2cc: generator `STEAM_CLIENT_OFF_PATH_VALUES`, `steamClientOffPathGate`, tests
- ad0e60406: regenerated `steam_api_shim.c` (16 functions x 3 lines), widened WR-07 revisit condition

## Verification
- gen_vtables, shimAbiGate, shimCoverage, helperIntegration: 4 suites, 210 tests pass
- `pnpm codecheck` and scoped `prettier --check` clean
- `bridge_dispatch.h` and the .def files are unchanged
- `pnpm build-steam-bridge` passes. New SHIM64 (`public/bin/arm64/darwin/steam_api64.dll`) is **251904 bytes**; 52-23 compares against this.

## Deviations from Plan

**1. [Rule 1 - Bug] CreateLocalUser has an out-value param**
- **Issue:** The plan said none of the eight methods has out-params, but `CreateLocalUser(int32* phSteamPipe, ...)` has an `out-value` param. The first generator pass threw on it.
- **Fix:** The refusal covers only `out-buffer` params, since the pre-phase stub left the out pointer untouched. The gate is also emitted in the out-value branch of `emitVtableStub`.
- **Commit:** 753f7a2cc

**2. TDD commits combined.** Tests and generator went in one commit. RED was observed in-session: the committed-source pin failed until regeneration.

## Known Stubs
None.

## Self-Check: PASSED
