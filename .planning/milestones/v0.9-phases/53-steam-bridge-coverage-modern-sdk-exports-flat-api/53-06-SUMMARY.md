---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
plan: 06
subsystem: steam-bridge
tags: [helper, call-trace, control-slot, gen-vtables, census-evidence]
requires:
  - phase: 53-04
    provides: "shim side of CONTROL slot 4 (REPORT_VERSION)"
provides:
  - "bd_call_index / bd_call_name generated tables (268 wire methods)"
  - "helper CALL <Interface>.<Method> trace, once per method per process"
  - "helper CONTROL_SLOT_REPORT_VERSION handler logging NOVER"
  - "protocol.ts CONTROL_SLOT.reportVersion = 4"
affects: [53-07]
key-files:
  modified:
    - meta/gen_vtables.ts
    - meta/__tests__/gen_vtables.test.ts
    - native/steam-bridge/generated/bridge_dispatch.h
    - native/steam-bridge/helper/bridge_helper.c
    - src/backend/storeManagers/steam/bridge/protocol.ts
    - src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
key-decisions:
  - "Call-name tables are not wire tuples, so BRIDGE_DISPATCH_TABLE_HASH is unchanged (4e3c190aafca)"
  - "CALL logs name only; CONTROL requests never log CALL, so a CALL line is game-originated"
requirements-completed: [D-53-13, D-53-07]
duration: 20min
completed: 2026-10-25
---

# Phase 53 Plan 06: Helper CALL trace and REPORT_VERSION Summary

The helper now logs which wire methods a game really called (once each, no arguments) and logs `NOVER  flat lookup ver=<v> served=no` for flat versions the shim could not serve.

## What was built

- `generateDispatchHeader` emits `BD_CALL_COUNT` (268), `bd_call_index` and `bd_call_name`, validated against `/^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/` at generation time. Only `bridge_dispatch.h` changed; the wire hash is untouched.
- `bridge_helper.c`: `g_call_seen[]` plus a `logts("CALL", ...)` immediately before `bridge_dispatch` (after the `!g_inited` check). New `CONTROL_SLOT_REPORT_VERSION 4` handler: bounds 0 < len <= 128 and 4 + len <= argLen, copy into char[129], `sanitize_ver`, log, STATUS_OK. Answered pre-init.
- `protocol.ts` `CONTROL_SLOT.reportVersion = 4`; protocol test pins it against the shim and helper `#define`s.
- helperIntegration: live helper round trips (OK, four reject shapes log nothing, control characters sanitised, no CALL).

## Verification

gen_vtables 169 pass; steam bridge suites plus fakeHomeIsolation 531 pass (helperIntegration ran on darwin, not skipped); `pnpm gen-vtables` idempotent; `pnpm build-steam-bridge` passes; prettier clean on the touched `.ts` files.

## Commits

- 7b1050c30: call-name tables and CALL trace
- 4c83f8532: REPORT_VERSION handler, protocol constant, tests

## Deviations from Plan

None - plan executed exactly as written. (53-RESEARCH.md L181 sret note left stale, out of scope; correct rule is in 53-04-SUMMARY.md.)

## Known Stubs

None.

## Self-Check: PASSED

Commits 7b1050c30 and 4c83f8532 exist; all listed files exist.
