---
created: 2026-10-24
title: "x64 shim lacks the Steam interface versions UE5 titles request, so their Steam calls hit the null object"
source: 261024-ir1 live test, Manor Lords (1363080)
area: steam-bridge
files:
  - meta/gen_vtables.ts
  - native/steam-bridge/generated/steam_api_shim.c
  - native/steam-bridge/generated/steam_api64.def
  - src/backend/storeManagers/steam/bridge/interfaceVersions.ts
severity: major
platform: any
ready: code
---

Once quick 261024-ir1 found the UE stub-plus-Shipping layout, Manor Lords (1363080, UE 5.5.4) got
the shim placed over `Engine/Binaries/ThirdParty/Steamworks/Steamv157/Win64/steam_api64.dll`.
Log, 2026-10-24 13:42: the helper spawned and the shim sent `HELLO` at 13:42:16. The game then
crashed 8 s in with `EXCEPTION_ACCESS_VIOLATION reading address 0x0000000000000000` inside
`ManorLords-Win64-Shipping.exe` (UE crash dir `UECC-Windows-56C0663248FCCEA235B4B5BF36C6521A_0000`,
call stack hash `EF5701BA3567059B2E619329B30A9D350B7B9719`). Before ir1 it played offline,
because Valve's DLL failed init and UE fell back to the null online subsystem.

The interface versions the Shipping exe names, from `strings`, compared with what the **x64**
shim serves (`SHIM64_SERVED_INTERFACE_VERSIONS` in `shimCoverage.ts`). The x86 build serves more,
for example SteamUser023 and SteamFriends018, but none of that reaches a Win64 title:

| Requested                                 | x64 shim serves |
| ----------------------------------------- | --------------- |
| `STEAMAPPS_INTERFACE_VERSION008`          | yes             |
| `SteamMatchMaking009`                     | yes             |
| `SteamMatchMakingServers002`              | yes             |
| `SteamUser023`                            | 019 only        |
| `SteamFriends017`                         | 015 only        |
| `SteamUtils010`                           | 008 only        |
| `STEAMUSERSTATS_INTERFACE_VERSION012`     | 011 only        |
| `STEAMREMOTESTORAGE_INTERFACE_VERSION016` | 013 only        |
| `SteamNetworking006`                      | 005 only        |
| `SteamInput006`                           | none            |
| `SteamGameServer015`                      | none            |
| `SteamGameServerStats001`                 | none            |

An unimplemented version gets the x64 null-object fallback (`vt_x64_null_object`, every slot
returns 0). A null return such as `ISteamFriends::GetPersonaName` would explain a read at 0x0.
**That attribution is a hypothesis.** The crash address has not been matched to a call.

The exe also delay-imports `SteamInternal_GameServer_Init`, the pre-`_V2` name. The shim exports
only `SteamInternal_GameServer_Init_V2`.

**Fix.**
1. Add the missing x64 versions to `meta/gen_vtables.ts` from the Steamworks SDK 1.57+ headers:
   User023, Friends017, Utils010, UserStats012, RemoteStorage016, Networking006, Input006,
   GameServer015 and GameServerStats001. Where the x86 build already carries a version (User023)
   or a neighbour (Friends018 for 017), check the Win64 vtable layout against the header slot by
   slot rather than aliasing it.
2. Export `SteamInternal_GameServer_Init` on x64, failing the same way `_V2` does.
3. Lift the 261024-j4l guard for 1363080, 427410 and 1119730 only once the coverage scan reports
   them clean. That guard keeps the shim off titles whose versions it cannot serve.
4. Live-verify on the Mac under the strict criterion: `HELLO` plus a clean game Steam-init log.
   In-Game never counts.

Same UE class: Abiotic Factor (427410, Steamv157) and Ranch Simulator (1119730, Steamv161). Their
version lists have not been read yet.

## Note (2026-10-24, 52-18)

52-13 now serves SteamUser023, SteamNetworking006 and STEAMREMOTESTORAGE_INTERFACE_VERSION016 on
x64. In the requested-versions table above, the `SteamUser023`, `STEAMREMOTESTORAGE_INTERFACE_VERSION016`
and `SteamNetworking006` rows are therefore no longer missing. The other rows are unchanged by 52-13.

## Evidence (2026-10-25, phase 53 live run, 53-UAT items 7-9)

Left open: Manor Lords 1363080 passes (HELLO, 7 CALLs, no 0x0 crash). Abiotic Factor 427410 has HELLO and 5 CALLs and a clean Saved log but hung at the loading screen (`Failed to acquire Steam auth session ticket for 0`). Ranch Simulator 1119730 never reaches HELLO: the Shipping exe exits in under 1 s with code 0x35. Closes only when items 7-9 pass.

## 53-16 evidence (2026-10-25)

Manor Lords (1363080) and Abiotic Factor (427410) now verify live (53-UAT.md items 25, 26: HELLO, game-originated CALLs, no NOVER). Ranch Simulator (1119730, item 24) still never sends HELLO (game exits 3 s after launch; pre-HELLO fault, see 53-15-DIAGNOSIS.md), so this todo stays open.

## 53-20 evidence (2026-10-25)

Not closed. 1363080 and 427410 scored pass (UE init marker, identity CALLs), but 1119730 Ranch Simulator had no HELLO (process gone after 3s, SteamStub class), so the all-three condition is not met (53-UAT items 42-44). No NOVER or flat-lookup line appeared in the session.

## Resolution (2026-10-26, quick 261026-dv2)

Closed. The interface-version scope is done:

- **Fix 1.** The x64 served set (`SHIM64_SERVED_INTERFACE_VERSIONS` in `shimCoverage.ts`) now
  covers every row in the table above. 52-13 added SteamUser023, SteamNetworking006 and
  RemoteStorage016. 53-01 added Friends017, Utils010, UserStats012, Input006, GameServer015 and
  GameServerStats001. Each was taken from its own VTABLE block, never aliased from a neighbour.
- **Fix 2.** `steam_api64.def` exports `SteamInternal_GameServer_Init`.
- **Fix 3.** No per-appid guard is left for these three titles. Coverage gating decides placement.
- **Fix 4.** Manor Lords 1363080 and Abiotic Factor 427410 pass live under the strict criterion
  (53-UAT items 25/26 and 43/44: HELLO, game-originated CALLs, no NOVER, census `verified`).
  Abiotic's load-screen hang comes after a clean bridge run. It is tracked in
  `2026-10-25-abiotic-factor-loading-hang-after-auth-ticket.md`.

The "closes only when all three pass" condition is superseded for Ranch Simulator 1119730, at the
operator's call. The title fails before `steam_api64.dll` loads (exit 0x35, no HELLO), so the
shim's interface versions never come into play. Its cause is SteamStub. Spike 040 decoded the
title's `.bind` header (flags `0x06`: ownership and debugger checks on, module verification
off). Spikes 040 and 041 found the launch check cannot be satisfied inside the bridge boundary.
Ranch Simulator now sits under that won't-do
(`completed/2026-10-24-steamstub-launch-check-static-re-decision.md`). The revisit trigger
recorded there also covers it.
