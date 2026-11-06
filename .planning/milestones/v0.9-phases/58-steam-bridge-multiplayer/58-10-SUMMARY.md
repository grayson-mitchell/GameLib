---
phase: 58-steam-bridge-multiplayer
plan: 10
subsystem: steam-bridge
tags: [shim, callbacks, call-results, ccallresult, net-evidence, generator]
requires: [58-02, 58-06, 58-07]
provides:
  - "13 broadcast relay rows in the generated callback registry"
  - "CCallResult registry (64), held early arrivals (16, 10 s, zeroed), CONTROL slot 11 drain"
  - "callResult and evidence wire-policy fields driving gl_helper_cr_track / gl_net_evidence"
affects: [58-11]
tech-stack:
  added: []
  patterns: ["embedder hook gl_cb_transport_drain_cr beside gl_cb_transport_drain", "per-row arches field for x64-only relay rows"]
key-files:
  modified:
    - meta/gen_vtables.ts
    - meta/extractProtonInventory.ts
    - meta/buildSteamBridgeShims.ts
    - meta/__tests__/gen_vtables.test.ts
    - meta/__tests__/callbackRegistryHost.test.ts
    - meta/__tests__/fixtures/callback_registry_harness.c
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/bridge_dispatch.h
key-decisions:
  - "Call-result Run uses vtable slot 0 with an int bIOFailure, outside the registry lock; the pair is removed by exact (object, handle) so a handler re-arming its CCallResult survives"
  - "Slot-11 failures back off on their own counter so an old helper cannot throttle broadcast delivery"
  - "RunCallbacks now also runs when only call results (or held ones) exist; the broadcast drain is skipped when no relay listener is registered"
requirements-completed: [M-03]
duration: ~70min
completed: 2026-10-31
---

# Phase 58 Plan 10: Shim call-result registry, broadcast relay rows and policy hooks Summary

C++ `CCallback`/`CCallResult` games now receive the 13 relayed broadcasts and completed call results through the generated shim registry, and wire-policy `callResult` / `evidence` fields make the helper dispatch track handles and log NET evidence.

## Commits
- 2071e4873 feat(58-10): relay rows and call-result registry in the generated callback registry
- eeab79568 feat(58-10): callResult and evidence policy fields drive helper hooks

## What was built
- `CALLBACK_RELAY_TABLE` gained 503, 504, 505, 506, 507, 512, 1202, 1203, 1221, 1222, 1251, 1252, 1281 (sizes from `CALLBACK_LAYOUTS` x64, `hold: false`). Each row carries the x64/x86 equality guard via an optional `arches: 'x64'` field that wraps the row in `#if !defined(__i386__)`. All 13 measured sizes agree across arches today, so no row is actually x64-only.
- `CALL_RESULT_TABLE` (513, 510, 504), `SteamAPI_RegisterCallResult` / `UnregisterCallResult` now fill a 64-entry pair table. `RunCallbacks` retries/expires held results, then pulls up to `GL_CB_DRAIN_MAX_PER_RUN` replies from CONTROL slot 11 under the shared 30 ms floor, validates count, id, cub, failed and `len == 24 + cub`, and calls `Run(pvParam, bIOFailure, hCall)` with no lock held. Unmatched results go to a 16-slot held table (10 s expiry by `gl_cb_now_ms`, secure-zeroed on delivery and expiry; only ids in the table are accepted so 168 can never be held). Cross-thread `UnregisterCallResult` waits for an in-flight Run (55 WR-01 rule).
- `MethodSignature.callResult` and `.evidence` (validated, copied by the extractProtonInventory overlay). Helper cases emit `if (__ret != 0) gl_helper_cr_track(...)` and `gl_net_evidence(1, ...)` after the native call; an in-buffer oversize refusal on a networking family emits an OVERSIZE evidence call first.
- `bridge_dispatch.h` now includes `gamelib_callresult.h`; the helper compile adds `-I native/steam-bridge/helper`. With no manifest using the fields, the regenerated header differs by that single include line.
- Harness: 21 original cases plus 14 new (relay_504, relay_1221, cr_register_complete, cr_failed_passed, cr_late_register_hold, cr_expiry_zeroed, cr_unregister_race, cr_no_lock_held, cr_capacity, cr_report_hook, cr_rejects_malformed_and_168, cr_held_capacity, cr_max_per_run_and_backoff, cr_buffer_zeroed), all under ERRORCHECK mutexes.

## Deviations from Plan

1. **[Rule 1 - naming] Hook is `gl_helper_cr_track`, not `gl_cr_track`.** The plan text says `gl_cr_track(ret, id)`, but 58-07's header already defines a static `gl_cr_track(gl_cr_state *, ...)`; the exported helper entry point is `gl_helper_cr_track(uint64_t, int32_t)` (per the 58-07 SUMMARY contract). The generated dispatch calls that.
2. **[Rule 1 - stale test] Fixed a pre-existing 58-07 test break.** `gen_vtables.test.ts` "mirrors the helper queue sizes and allowlist rows" still expected the old `{id, size}` allowlist row format; 58-07 changed rows to `GL_CBQ_ROW(...)`. The pin now matches the new rows and also checks every broadcast row's size against the helper's WIN sizes.
3. **[Rule 3 - guard] The generator source may not contain a literal `#include "x.h"`** (D-09 test); the include name is interpolated from a constant instead.
4. **[Rule 2 - robustness] `RunCallbacks` gate widened.** It returned early whenever no broadcast listener was registered, which would have starved call-result-only games; it now proceeds on any broadcast listener, call-result pair or held result, and skips the broadcast drain when no relay listener exists. The existing `gate_no_relay_ids` case still holds.
5. Slot-11 backoff uses its own fail counter (an old helper answering STATUS_ERR must not throttle slot-6 delivery).

## Verification
- `callbackRegistryHost` 35 cases + exit check, `gen_vtables` (306 tests), `shimAbiGate` green (349 tests across the three suites); `pnpm codecheck` clean; prettier clean on touched TS (the harness `.c` is not prettier-checked).
- `pnpm gen-vtables && pnpm build-steam-bridge` exit 0: helper compiled with the new include, compile gates passed for steam_api.dll (x86) and steam_api64.dll (x64).
- Not run: the full `meta` + `steam/bridge` jest sweep exceeded the foreground timeout; the plan's named suites were run instead.

## D-11 / x86 status
The registry code is generated for both DLLs and the x86 shim compiles. x86 call-result dispatch (THISCALL with a uint64 argument on i686) is not live-verified; the D-53-09 deferral stands.

## Known Stubs
None. Nothing in the committed manifests uses `callResult` / `evidence` yet; wiring plans (58-11 and later) add the policy entries.

## Threat Flags
None beyond the plan's threat model (T-58-31..34 mitigated: slot-11 reply validated before any copy, bounded tables, secure zero, Run outside the lock proven by ERRORCHECK harness).

## Self-Check: PASSED
- 2071e4873 and eeab79568 in git log; generated files rebuilt and committed.
