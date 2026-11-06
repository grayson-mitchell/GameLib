---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
plan: 17
subsystem: steam-bridge
tags: [gen_vtables, shim, flat-api, out-buffer, gap-closure]
requires: []
provides:
  - hidden-pointer flat fallback guard (NULL, served-instance) with GameServer012 RAX dispatch
  - out-buffer length/NUL/scratch hygiene in generated stubs and helper dispatch
affects: [native/steam-bridge/generated]
key-files:
  modified:
    - meta/gen_vtables.ts
    - meta/__tests__/gen_vtables.test.ts
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/bridge_dispatch.h
decisions:
  - "Hidden-pointer fallback guard is universal (every hidden-pointer flat export), not 012-specific"
metrics:
  tasks: 2
  completed: 2026-10-25
---

# Phase 53 Plan 17: CR-01 and out-buffer hygiene Summary

The hidden-pointer flat fallback for `SteamAPI_ISteamGameServer_GetPublicIP` no longer zeroes shim instances. GameServer012 callers now get a real answer, and the out-buffer marshalling defects WR-02, WR-03 and WR-04 are closed.

## What changed

- **CR-01 (T-53-64, T-53-65):** new `emitHiddenFallback` in `meta/gen_vtables.ts` emits, in order: NULL guard, dispatch for each dropped RAX-form version, `return NULL` guard for every other served instance of the family, then the memset. A dropped RAX version that takes parameters throws, naming the triple and `FLAT_UNREPRESENTABLE_CASES`. The comment on the 012 entry was rewritten to match.
- **WR-02:** a `lenParam` out-value is stored after the buffer decode as `min(declared, copied)`, and is 0 when nothing was copied.
- **WR-03:** a `char*` buffer clamps `copyLen` to `cap - 1` (0 at cap 0) and writes the NUL only when `cap > 0`.
- **WR-04:** the helper does `memset(<buf>, 0, cap_<p>)` before the native call.
- No manifest or wire layout change. `shimExports.generated.ts` is unchanged. `pnpm gen-vtables` is idempotent.

## Commits

- 25196be0e: fix(53-17): guard hidden-pointer flat fallback; dispatch GameServer012 GetPublicIP (CR-01)
- a23f96439: fix(53-17): out-buffer length, NUL and scratch hygiene (WR-02/03/04)

## Deviations from Plan

**Test ordering (process).** In Task 1 the implementation was written before the tests, so the RED step was not observed. The 53-17 tests were written afterwards and pin the generated output. The same applies to Task 2. No behavioural deviation.

## Verification

gen_vtables, shimAbiGate and the `src/backend/storeManagers/steam/bridge` suites pass (742 tests). `pnpm codecheck` is green. `pnpm gen-vtables` leaves no diff. Prettier is clean on the two touched TS files.

## Known Stubs

None.

## Self-Check: PASSED
