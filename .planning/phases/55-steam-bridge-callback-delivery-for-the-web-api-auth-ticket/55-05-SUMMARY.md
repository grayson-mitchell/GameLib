---
phase: 55-steam-bridge-callback-delivery-for-the-web-api-auth-ticket
plan: 05
subsystem: steam-bridge
tags: [steam, shim, callbacks, codegen, drain-slot]
requires: [55-04]
provides:
  - "Win32 shim records callback registrations and dispatches 168 from CONTROL slot 6 drain"
key-files:
  modified:
    - meta/gen_vtables.ts
    - meta/__tests__/gen_vtables.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts
    - native/steam-bridge/generated/steam_api_shim.c
key-decisions:
  - "Separate g_cb_registry_lock SRWLOCK; Shutdown clears the registry only after releasing g_bridge_lock"
  - "gl_cb_now_ms is GetTickCount (wrap-safe unsigned subtraction in the core)"
requirements-completed: [P55-3, P55-4, P55-6, P55-7, P55-8]
completed: 2026-10-26
---

# Phase 55 Plan 05: Shim Callback Wiring Summary

generateCallbackRegistryC() is embedded once in generateShimC after bridge_transact and the D-53-15 helpers; SteamAPI_RegisterCallback/UnregisterCallback/RunCallbacks/Shutdown now drive the registry, and slot 6 is triple-pinned (helper, shim, protocol.ts).

## Commits
- a39ac63ac test: wiring describe and drainCallbacks triple pin (RED, 6 + 1 failing)
- 62d86ac0c feat: embedder block, DRAIN_CALLBACKS define, flat export bodies, regenerated shim

## Verification
- Bridge dir, callbackRegistryHost, gen_vtables, buildSteamBridgeShims: 991 tests pass.
- `pnpm build-steam-bridge` exit 0: x86 steam_api.dll, x64 steam_api64.dll, steamclient64.dll and helper compile and link.
- Artifacts (gitignored, public/bin/arm64/darwin/, built 2026-10-26 12:03): steam_api.dll 285696 bytes, steam_api64.dll 500736 bytes, steam-bridge-helper 156368 bytes.
- Regeneration idempotent: `git diff --exit-code` over generated outputs clean after fresh `pnpm gen-vtables`.
- prettier clean on the .ts files and shimExports.generated.ts.
- `pnpm test:ci`: 595/599 suites pass. Failures: findDeadcode, genI18nGateScope, machineFillGamelib (known pre-existing) and sidecar testContainment.test.ts (steamNativeInstallDefault.test.ts unclassified; unrelated, logged in deferred-items.md).
- graphify update run.

## Deviations from Plan
- Plan said the out-of-scope UnregisterCallResult literal is a one-arg no-op; actual literal takes `(void *pCallback, uint64_t hAPICall)`. The pin uses the real literal (still unchanged by this plan).
- No older pins asserted the empty Register/RunCallbacks bodies; none needed updating.

## Scope notes
x86 `__thiscall` dispatch through the game vtable is not executed anywhere in this phase (no Wine PE harness, P55-9 deferred); RegisterCallResult, ManualDispatch_*, Steam_RunCallbacks, SteamGameServer_RunCallbacks and non-168 relays remain deferred as planned.

## Known Stubs
None.

## Self-Check: PASSED
