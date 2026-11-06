---
phase: 55-steam-bridge-callback-delivery-for-the-web-api-auth-ticket
plan: 04
subsystem: steam-bridge
tags: [steam, shim, callbacks, codegen, msvc-abi]
requires: [55-01, 55-02, 55-03]
provides:
  - "generateCallbackRegistryC() and CALLBACK_* constants in meta/gen_vtables.ts (not yet wired into generateShimC; 55-05 does that)"
affects: [55-05]
key-files:
  created:
    - meta/__tests__/fixtures/callback_registry_harness.c
    - meta/__tests__/callbackRegistryHost.test.ts
  modified:
    - meta/gen_vtables.ts
    - meta/__tests__/gen_vtables.test.ts
key-decisions:
  - "Registry is transport- and lock-agnostic; embedder supplies GL_CB_LOCK/UNLOCK, THISCALL, gl_cb_now_ms, gl_cb_transport_drain"
  - "Register ORs the registered bit (never assigns) to preserve the gameserver bit"
requirements-completed: [P55-3]
completed: 2026-10-26
---

# Phase 55 Plan 04: Generated Callback Registry Summary

Portable generated C registry and out-of-lock dispatcher, driven by the measured MSVC slot/offsets, proven on the host with ERRORCHECK mutexes.

## Commits
- 5221f59a9 test: harness, host test and source pins (RED: generateCallbackRegistryC missing, 14 tests failed)
- b0e83126d feat: generateCallbackRegistryC and constants (GREEN)

## Verification
- callbackRegistryHost, gen_vtables, buildSteamBridgeShims, msvcCallbackBaseLayout: 284 tests pass; host harness ran on clang (not skipped), all 13 cases PASS including no_lock_held, reentrant_handler, malformed, capacity, buffer_zeroed.
- `pnpm gen-vtables` produces no diff in native/steam-bridge/generated.
- prettier clean on the .ts files (harness .c has no parser).

## Deviations from Plan
None. Minor design notes: clear_all leaves throttle state alone (harness resets it directly); a transport success with count 0 resets the failure counter.

## Known Stubs
None (registry intentionally not yet embedded in the shim; 55-05).

## Self-Check: PASSED
