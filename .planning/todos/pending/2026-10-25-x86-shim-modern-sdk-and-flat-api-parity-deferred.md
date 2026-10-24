---
created: 2026-10-25
title: "x86 shim parity for the modern SteamInternal_* family and the flat API is deferred until a title needs it (D-53-09)"
area: steam-bridge
files:
  - meta/bridgeCensus.ts
  - native/steam-bridge/generated/steam_api.def
  - native/steam-bridge/generated/steam_api_shim.c
  - src/backend/storeManagers/steam/bridge/shimCoverage.ts
severity: minor
platform: any
ready: blocked
---

## Decision (D-53-09)

Phase 53 gave the x64 shim the modern `SteamInternal_*` family and the flat
`SteamAPI_ISteam*_*` API. The x86 shim was deliberately left without them,
because no measured title needs them on x86.

## Measurement

`pnpm bridge-census` (2026-10-25) prints
`x86 titles needing modern SteamInternal_* or flat API: 0 (none)`.

Count: 0 of 18 installed bridge titles. The x86 launch titles measured:

| AppID  | Title                | x86 evidence                         | SDK vintage            |
| ------ | -------------------- | ------------------------------------ | ---------------------- |
| 206020 | Avernum 4            | static steam_api.dll import          | legacy SDK (bare names) |
| 206060 | Avernum 6            | static steam_api.dll import          | legacy SDK (bare names) |
| 200510 | XCOM: Enemy Unknown  | static steam_api.dll import          | legacy SDK (DRM-wrapped) |

Grim Dawn's x86 tool exes are legacy SDK too (the game itself launches x64).

## Caveat (A7)

Uninstalled owned titles cannot be measured locally: the census only sees
installed bridge bottles. A newly installed x86 title that imports
`SteamInternal_*` or `SteamAPI_ISteam*` names will show up in the census footer
line; this todo is unblocked the first time that count is above 0.

## Scope to build if a title appears

- an x86 `CreateInterface` export
- a fallback object for unserved interfaces
- the `SteamInternal_*` exports the x64 shim carries (`SteamInternal_SteamAPI_Init`,
  `SteamInternal_ContextInit`, `SteamInternal_FindOrCreateUserInterface`,
  `SteamInternal_FindOrCreateGameServerInterface`, `SteamInternal_GameServer_Init`,
  `SteamInternal_GameServer_Init_V2`, `SteamInternal_CreateInterface`)
- the flat exports, dispatching via `__thiscall` into the proxy vtable

## 53-15 evidence: Avernum 6 206060 (2026-10-25)

Avernum 6 (x86) connects (HELLO y) but no game-originated wire CALL is traced (CALL 0; none in this session's gamelib.log), census `unverified (no game-originated call)`, operator "full pass". Its Steam calls therefore land on x86 stubs or non-wire paths. Verifying it needs x86 wire coverage of an identity call (SteamUser.GetSteamID or BLoggedOn) plus one more call. The strict verified criterion is not loosened for this title; In-Game never counts.
