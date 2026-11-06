---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 02
subsystem: steam-bridge
tags: [steam-bridge, helper, control-slot, createinterface]
requires: [52-01]
provides:
  - "CONTROL slot 3 CREATE_INTERFACE in bridge helper (native-backed)"
  - "CONTROL_SLOT.createInterface = 3 in protocol.ts"
affects: [52-03, 52-07, 52-11]
tech-stack:
  added: []
  patterns: ["NULL-tolerant dlsym", "bounds-checked control decode", "sanitized FWD log line"]
key-files:
  modified:
    - native/steam-bridge/helper/bridge_helper.c
    - src/backend/storeManagers/steam/bridge/protocol.ts
    - src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
key-decisions:
  - "Helper never decides acceptance: every request calls SteamInternal_CreateInterface; no cache or table"
  - "Not-inited or missing symbol answers STATUS_ERR (honest no-client)"
requirements-completed: [P52-SCOPE-1, P52-SCOPE-2]
duration: 15min
completed: 2026-10-24
---

# Phase 52 Plan 02: CREATE_INTERFACE control slot Summary

Bridge helper CONTROL slot 3 asks the genuine native client (`SteamInternal_CreateInterface`) whether it accepts an interface version, replying with a 4-byte present flag, and logs a sanitized `FWD CreateInterface` line per request.

## Tasks

1. Helper slot + protocol constant (commit 4f4d40472): dlsym NULL-tolerant (WARN, never FATAL); decode bounds argLen>=4, 0<len<=4096, 4+len<=argLen; STATUS_ERR pre-init; sanitized (128 chars, non-printable to `?`) FWD log; unknown slot still last-statement STATUS_ERR. protocol.test pins value 3 and slot distinctness.
2. Integration tests (commit 4241fcc81): no-client STATUS_ERR, malformed frames (short, len 0, len>4096), unknown slot 9, helper survives (fresh-connection HEALTH), stderr matches `FWD CreateInterface ver=SteamClient017 native=no-client`. Spawn uses `profile.childEnv()`; real-profile `native=present` arm is left to the live gate 52-11 (noted in the test).

## Verification

protocol.test (26 pass), helperIntegration + fakeHomeIsolation (11 pass), `clang -fsyntax-only` clean, prettier clean on the .ts paths (bridge_helper.c is not prettier-handled).

## Deviations from Plan

None - plan executed as written.

## Known Stubs

None.

## Self-Check: PASSED
