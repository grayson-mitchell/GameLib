---
phase: 58-steam-bridge-multiplayer
plan: 14
subsystem: steam-bridge
tags: [steam, networking, utils, shimLocal, helperCustom, config-store, message-pool]
requires: [58-03, 58-06, 58-10, 58-13]
provides:
  - "NETWORKING_LOCAL_C: shim-local identity/IPAddr helpers, Windows-side message pool, function-pointer config store"
  - "SteamNetworkingUtils004 served as wire on x64 (25 of 26 virtuals)"
  - "shimLocal + helperCustom combination in the generator"
  - "SDK flat-only utils exports: InitRelayNetworkAccess, IsFakeIPv4, SetGlobal*/SetConnection*/SetConfigValueStruct, six SetGlobalCallback_*"
affects: [58-15, 58-16, shimCoverage served tables, steam_api64.def]
key-files:
  created:
    - meta/__tests__/networkingLocalHost.test.ts
    - meta/__tests__/fixtures/networking_local_harness.c
  modified:
    - meta/gen_vtables.ts
    - meta/extractProtonInventory.ts
    - meta/sdk/wire-policy.json
    - meta/sdk/isteamnetworkingutils004.manifest.json
    - native/steam-bridge/helper/bridge_helper.c
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/bridge_dispatch.h
    - native/steam-bridge/generated/steam_api64.def
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bridge/shimExports.generated.ts
decisions:
  - "The two flat-only names the Proton vtable lacks (InitRelayNetworkAccess, IsFakeIPv4) are EXPORTED, as shim-side flat exports routed through the game's utils vtable (slot 7 with 1e10f, slot 14 > NotFake), so a Steamworks.NET title importing them is no longer missing-symbols"
  - "Float params and returns are modelled in the generator as float (Win64 XMM); the float-touching Utils methods (GetLocalPingLocation, CheckPingDataUpToDate) and the void+out-buffer ConvertPingLocationToString are shimLocal+helperCustom"
  - "Helper handlers resolve their Mac symbol with dlsym on the one dylib handle at first use (as the plan says) because bridge_dispatch.h does not yet declare the flat vars when the handlers compile"
  - "IPAddr fake-IP range is 169.254.0.0/16 reported as Global (2), everything else NotFake (1); the real range split is not public"
metrics:
  tasks: 3
  completed: 2026-10-31
---

# Phase 58 Plan 14: SteamNetworkingUtils004 and networking value types Summary

ISteamNetworkingUtils 004 is served as wire on x64, with real shim-local `SteamNetworkingIdentity`/`SteamNetworkingIPAddr` helpers, a Windows-side `SteamNetworkingMessage_t` pool, and a function-pointer config store that keeps Windows pointers out of the Mac helper.

## Commits
- 857d5187a: shim-local networking block, registry hook, flat-only exports, float/struct generator fixes, host harness tests
- db81a6b5b: helper handlers (`gl_net_set_config_value`, `gl_net_get_config_value`, `gl_net_get_pop_list` plus ping and info handlers) with source pins
- 0f1a04f9c: wire policy, manifest, overlay extension, served flip to `wire`

## What was built
- `NETWORKING_LOCAL_C` (x64 only): identity and address functions at the measured offsets (136/18 bytes, static-asserted) with ToString/ParseString (IPv4, RFC 5952 IPv6, `steamid:`, `ip:`, `str:`, `gen:`, unknown-type forward compatibility), `gl_msg_alloc`/`gl_msg_release` (one block, m_pfnRelease at 184, frees exactly once, 1 MiB cap), a bounded 256-entry config store, `gl_bridge_call_raw`, `gl_net_cb_fn_for`, `gl_net_cb_intercept`.
- Real bodies for 27 Identity, 13 IPAddr and `SteamNetworkingMessage_t_Release` exports (names unchanged; the no-op spec entries are gone).
- Registry: `GL_NET_CB_INTERCEPT`/`GL_NET_CB_ANY` hooks (inert by default). `gl_cb_deliver`, the RunCallbacks drain gate and the manual-dispatch push consult them; a stored function pointer is called with no lock held and `(id, 1, 0)` is reported. A game with only function pointers and no CCallback still drains.
- Config rules: Ptr values and ids 201..207 are stored shim-side only and never sent; typed values forward `[i32 e][i32 scope][i64 obj][i32 type][u32 len][bytes]`; a helper reply of type Ptr is refused; per-connection then listen-socket then global lookup for 1221.
- Helper: handlers refuse type 5 and ids 201..207 before reading, check exact lengths per type, cap lists at 256, never log a string.
- Generator: `shimLocal` with `helperCustom` allowed (shim body forwards via `gl_bridge_call_raw`, helper keeps the case); versioned Proton struct names (`SteamNetworkingIdentity_144`) resolve to the measured layout; stub-local name clashes now fail validation; overlay can override a return type and a param type/name.
- Flat exports added: InitRelayNetworkAccess, IsFakeIPv4, SetGlobalConfigValueInt32/Float/String/Ptr, SetConnectionConfigValueInt32/Float/String, SetConfigValueStruct, six SetGlobalCallback_* (16 total, `steam_api64.def` only).

## Decision recorded (open item from 58-03)
`InitRelayNetworkAccess` and `IsFakeIPv4` are exported, not left as a `missing-symbols` finding. They are shim-side flat exports (`NETWORKING_UTILS_FLAT_INLINE`), routed exactly as the SDK inlines define: `InitRelayNetworkAccess` calls the wired CheckPingDataUpToDate slot with 1e10f; `IsFakeIPv4` is GetIPv4FakeIPType greater than NotFake. They were not routed to the helper (the Mac symbols exist, but a vtable call keeps one code path). The bridgeCensus and shimCoverage tests no longer carry the absent-names exemption.

## Deviations from Plan

**1. [Rule 1 - Bug] `cType('float')` fell through to `uint32_t`** (generator)
Found while wiring CheckPingDataUpToDate/GetLocalPingLocation. A float param or return must be `float` on Win64 (XMM). Fixing it also corrected the existing UserStats `SetStat(float)`/`UpdateAvgRateStat` and Music `GetVolume` shim stubs and helper typedefs on x64 (they previously read a GPR). x86 stack layout is unchanged. Commit 857d5187a.

**2. [Rule 3 - Blocking] Methods the generic wire path cannot carry**
Float return/param (GetLocalPingLocation, CheckPingDataUpToDate), `void` return with an out-buffer (ConvertPingLocationToString) and a string return with out-values (GetConfigValueInfo) are rejected or mis-marshalled by the generic path, so each became `shimLocal` + `helperCustom` (`gl_net_get_local_ping_location`, `gl_net_check_ping_data`, `gl_net_convert_ping_location`, `gl_net_get_config_value_info`). The plan listed three custom functions; there are seven. AllocateMessage and SetDebugOutputFunction have no helper case, as required.

**3. [Rule 3 - Blocking] Manifest could not express AllocateMessage's pointer return or a `result` param**
Proton's thunk text parsed AllocateMessage as `void`/`uint32`, and a wire param named `result` shadows a generated stub local. The overlay gained `returns` and param `type`/`name`; `result` became `pLocation`; the validator now rejects reserved stub-local names.

**4. [Interpretation] Helper symbols via dlsym, not generated flat vars**
Per the plan, Task 2 handlers resolve their own symbols at first use so the helper compiles before the manifest is wired.

**5. Existing tests updated** for the new reality: bridgeCensus (full measured names resolve), shimCoverage (absent-names set removed, Utils004 is wire), gen_vtables (base-text-only and custom-prototype pins).

## Verification
- `pnpm gen-vtables && pnpm build-steam-bridge`: exit 0 (x86 and x64 compile gates PASSED)
- jest: networkingLocalHost (15 behaviour cases + wiring), callbackRegistryHost (incl. 2 new intercept cases), gen_vtables, shimAbiGate, wireExtendedCompile, bridgeCensus, shimCoverage, helperIntegration, extractProtonInventory green; `pnpm codecheck`, `pnpm find-deadcode`, prettier clean.
- Full `meta` + bridge run: only the known failures remain (live tree, i18n churn, steamclientLayerNotice pins).

## Known gaps / notes
- Not verified against a live Steam or a Steamworks.NET/UE title: the harness proves the shim C and the registry hook on the host; the helper handlers are compile- and source-pin-checked only.
- `psn:`/`stadia:`/`xboxpairwiseid:`/`invalid` identity text forms follow recollection of the SDK format, not a measurement.
- The fake-IP range (169.254.0.0/16 = Global) is a conservative guess; Local (3) is never reported.
- The Sockets/Messages wiring plans must call `gl_net_cb_intercept` for ids they post and allocate messages with `gl_msg_alloc`.

## Threat model
T-58-44 mitigated (Ptr/Callback ids stored shim-side; helper refuses both; Ptr reply refused). T-58-45 mitigated (exact per-type length, strings 1..4096 NUL-checked). T-58-46 mitigated (256-entry store, message cap 1 MiB, single release). T-58-47 mitigated (ParseString bounded: generic string < 32, bytes <= 32, text <= 127, ports <= 65535).

## Self-Check: PASSED
Commits 857d5187a, db81a6b5b, 0f1a04f9c exist; networkingLocalHost.test.ts and networking_local_harness.c exist.
