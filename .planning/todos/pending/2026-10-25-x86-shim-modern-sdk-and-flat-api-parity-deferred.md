---
created: 2026-10-25
title: "x86 flat API (SteamAPI_ISteam*) parity for Steamworks.NET titles, which Cat Quest 593280 needs (D-53-09 remainder)"
area: steam-bridge
files:
  - meta/gen_vtables.ts
  - meta/bridgeCensus.ts
  - native/steam-bridge/generated/steam_api.def
  - native/steam-bridge/generated/steam_api_shim.c
  - src/backend/storeManagers/steam/bridge/shimCoverage.ts
severity: medium
platform: any
ready: blocked
audit_acknowledged:
  milestone: v0.10
  at: 2026-11-20
---

## PARKED 2026-11-27: requires Phase 999.2

Operator decision: this todo is parked on backlog **Phase 999.2** (x86 shim coverage, flat C API
and current interface versions). It is not worked on its own. The flat tier is all-or-nothing, and
999.2 holds its full scope. `ready:` moves from `code` to `blocked`.

**Unpark:** when 999.2 is promoted and executed. Close this todo once 999.2 is done.

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

- [done, quick 261120-rdo] an x86 `CreateInterface` export
- [done, quick 261120-rdo] a fallback object for unserved interfaces: per-version,
  manifest-backed `X86Null_<interface>` objects whose every slot pops exactly its
  manifest `stackBytes` (`__thiscall` is callee-cleans); a version with no manifest
  answers NULL because there is no i386 arity data for it
- [done, quick 261120-rdo] the `SteamInternal_*` exports the x64 shim carries
  (`SteamInternal_SteamAPI_Init`, `SteamInternal_ContextInit`,
  `SteamInternal_FindOrCreateUserInterface`, `SteamInternal_FindOrCreateGameServerInterface`,
  `SteamInternal_GameServer_Init`, `SteamInternal_GameServer_Init_V2`,
  `SteamInternal_CreateInterface`, plus `SteamAPI_GetHSteamUser` / `SteamAPI_GetHSteamPipe`)
- [open] the flat exports, dispatching via `__thiscall` into the proxy vtable (see
  "Remainder (flat tier)" below)

## 2026-11-20 measurement

`pnpm bridge-census` (2026-11-20, HEAD after the tier-1 commits) printed:

```
x86 titles needing modern SteamInternal_* or flat API: 3 (57300, 576770, 593280)
x86 titles whose modern SteamInternal_* or flat API need the x86 shim does not export: 1 (593280)
```

On 2026-10-25 the need line printed 0, so the unblock trigger fired. Three installed x86
titles:

| AppID  | Title                    | x86 evidence                                                                 | SDK vintage                                  |
| ------ | ------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------- |
| 57300  | Amnesia: The Dark Descent | static imports `SteamInternal_ContextInit`, `SteamInternal_FindOrCreateUserInterface`, `SteamAPI_GetHSteamUser`, callbacks | modern lookup (exe: UGC017, UserStats012, Friends017, User023, Utils010) |
| 576770 | Low Magic Age            | static imports `SteamInternal_ContextInit`, `SteamInternal_FindOrCreateUserInterface`, `SteamAPI_GetHSteamUser`, `SteamAPI_RestartAppIfNecessary` | modern lookup (exe: UGC013, UserStats011, User020) |
| 593280 | Cat Quest                | Unity/Mono, no static steam imports; `Assembly-CSharp-firstpass.dll` carries 902 `SteamAPI_*` / `SteamInternal*` names | Steamworks.NET (SteamClient020 / SteamUser020 / ManualDispatch vintage) |

Tier 1 landed in quick 261120-rdo: commit `d475531e7` (the x86 `SteamInternal_*` family,
the manifest-backed x86 null object and a CrossOver Wine harness) and `a94108e3e` (serves
the 57300 / 576770 versions on x86, teaches `shimCoverage.ts` the x86 fallback and adds the
coverage-aware census line). 57300 and 576770 are now covered on x86: their measured static
imports are all exported and every interface version they resolve is served or
null-object answered, so the not-exported count dropped from 3 to 1.

Census rows after the run, verbatim:

```
| 57300 | Amnesia: The Dark Descent | Amnesia The Dark Descent | x86 | unknown-version | no | unverified (no HELLO) | SteamClient@ambiguous(SteamClient017,SteamClient020) |
| 576770 | Low Magic Age | LowMagicAge | x86 | unknown-version | no | unverified (no HELLO) | SteamClient@ambiguous(SteamClient017,SteamClient019) |
| 593280 | Cat Quest | Cat Quest | x86 | unknown-version | no | unverified (no HELLO) | SteamController@ambiguous(SteamController006,SteamController007); +351 unserved-family imports (lazy) |
```

The 57300 and 576770 rows still read `unknown-version`. That is version resolution, not
coverage: the shipped `steam_api.dll` carries two `SteamClient` version strings, which puts
the SteamClient family in the runtime-lookup version pool as `@ambiguous`
(`interfaceVersions.ts`). A unit test in `shimCoverage.test.ts` proves that with that one
ambiguity set aside coverage is complete (no missing symbol, no blocking gap). Neither
title has been launched yet; the strict bridge-verified criterion is untouched.

## Remainder (flat tier)

Cat Quest's Steamworks.NET runs `CSteamAPIContext.Init`, which fails if any one of its
roughly 25 flat `SteamAPI_ISteamClient_GetISteam*` lookups answers NULL (the D-53-07
flat-lookup contract; 53-12 had to serve the whole Init set on x64 for exactly this
reason). Initializing only a "core" subset would still fail Init at the first unserved
lookup (`SteamMatchGameSearch001`), so a partial flat tier changes nothing for it. Needed:

- (a) `emitFlatExports` per arch, with `THISCALL` in the slot casts, under an
  `#if defined(__i386__)` block, keeping the D-53-07 NULL flat-lookup contract.
- (b) serve on x86 every `CSteamAPIContext.Init` version Cat Quest requests. Already x86
  after quick 261120-rdo: SteamUser020, SteamFriends017, SteamUtils009,
  STEAMUSERSTATS011, STEAMAPPS008, SteamMatchMaking009, SteamMatchMakingServers002,
  SteamController007, SteamInput001. To widen to x86: SteamClient020,
  SteamMatchGameSearch001, SteamNetworking006, STEAMSCREENSHOTS003, STEAMHTTP003,
  STEAMAPPLIST001, STEAMMUSIC001, STEAMMUSICREMOTE001, STEAMHTMLSURFACE005,
  STEAMINVENTORY_V003, STEAMVIDEO_V002, STEAMPARENTALSETTINGS001, STEAMREMOTEPLAY001,
  SteamParties002. To extract: STEAMREMOTESTORAGE014, STEAMUGC014, and check
  SteamNetworkingSockets008 / SteamNetworkingUtils003 / SteamGameServer013.
- (c) turn the x86 export list into a generated list like `SHIM64_GENERATED_EXPORTS`
  (about 900 names) instead of the hand-pinned `SHIM_EXPORTED_SYMBOLS`.
- (d) audit which x64-only subsystems Steamworks.NET touches on x86 (ManualDispatch
  `gl_md_*`, `GL_NET`, the `gl_mms` relay) and port or stub them.
- (e) the 53-12 precedent: Init fails on any NULL lookup, so (b) must be complete, not
  partial.

Cat Quest's census row also reads `SteamController@ambiguous(SteamController006,SteamController007)`,
a second version-resolution ambiguity independent of this remainder.

## 53-15 evidence: Avernum 6 206060 (2026-10-25)

Avernum 6 (x86) connects (HELLO y) but no game-originated wire CALL is traced (CALL 0; none in this session's gamelib.log), census `unverified (no game-originated call)`, operator "full pass". Its Steam calls therefore land on x86 stubs or non-wire paths. Verifying it needs x86 wire coverage of an identity call (SteamUser.GetSteamID or BLoggedOn) plus one more call. The strict verified criterion is not loosened for this title; In-Game never counts.

## 53-20 evidence (2026-10-25)

Avernum 6 (206060) reached HELLO and the operator saw the menu, but it made no game-originated call. `objdump -p "Avernum 6.exe"` imports only:

```
    DLL Name: steam_api.dll
    Hint/Ord  Name
          15  SteamAPI_Shutdown
           5  SteamAPI_Init
```

It writes no game log, so it cannot produce a call beyond init; Avernum 4 is the same class. The census still reports 0 x86 titles needing the modern or flat API, so the deferral stands. `ready:` unchanged.

## Live baseline after tier 1 (2026-11-20 20:37)

Cat Quest launched, with no HELLO. Its `error.log` (`AppData/LocalLow/The Gentlebros Pte_ Ltd_/Cat Quest/error.log`) reads `[Steamworks.NET] SteamAPI_Init() failed`, then `InvalidOperationException: Steamworks is not initialized` from `SteamUser.GetSteamID`, identical to the 2026-11-07 run. It exited after 20s (`overlay-exit-abnormal`). This is the baseline the flat tier must move. Tier-1 titles: 57300 is verified; 576770 reaches GINIT ok=1 but shows no window (a separate issue).

## Why the baseline showed no HELLO (quick 261121-ley, 2026-11-21)

Desk diagnosis of the 2026-11-20 20:37 baseline. GameLib **withheld** the shim on
purpose, so Cat Quest ran Valve's own `steam_api.dll` with no helper. Valve's
`SteamAPI_Init` then failed because the bottle has no Steam client. That is why no
HELLO arrived: the game never loaded the shim.

Evidence:

- `Cat Quest_Data/Plugins/steam_api.dll` in the bottle is Valve's original: 237856 bytes,
  sha1 `23ba5c92…`, dated 2026-11-07 (the install date), with no `.gamelib-orig` next to
  it. Amnesia's bottle, by contrast, holds the current x86 shim (sha1 `107cda0b…`, same
  as `public/bin/arm64/darwin/steam_api.dll`) plus a `.gamelib-orig` backup. It is the only
  `steam_api*.dll` in the Cat Quest bottle.
- The persisted verdict (`steam_metadata.json` → `593280.bridge.scan`, scannedAt
  `2026-11-20T07:37:53Z` = the baseline launch) is `status: miss`, x86, with no
  `managedScan` key. That is the shape `withhold()` in `bridge/shimPlacement.ts` returns;
  the placed-miss path always records `managedScan` for a Mono title. Its missing list
  ends with the unservable interface versions that `withhold()` appends.
- Re-running `classifyUnservableInterfaceVersions` (current tree) on the stored inputs
  gives 26 **blocking**, 0 non-core x86 versions. `SteamClient020` alone blocks
  (`SteamClient` is in `CORE_STARTUP_FAMILIES`), and so does every other version an
  x86 flat lookup would need. In `placeShimForGame`, blocking > 0 means
  `withholdIfRestorable`, and no shim was present yet, so the restore set is empty and the
  result is `withheld`.

Other hypotheses:

- The shim loaded but its `SteamAPI_Init` failed: ruled out, because it was never placed.
- A missing export broke init: ruled out as the cause of *this* failure, but it is exactly
  what would come next. `Assembly-CSharp-firstpass.dll` names `SteamAPI_Init`,
  `SteamAPI_ISteamClient_GetISteam*`, `SteamAPI_ManualDispatch_Init/RunFrame/GetNextCallback/FreeLastCallback`,
  `SteamClient` and `SteamInternal_CreateInterface`. The x86 export set has `SteamAPI_Init`,
  `SteamInternal_CreateInterface` and `SteamAPI_GetHSteam*`, but **not** the flat
  `SteamAPI_ISteamClient_*`, the `SteamAPI_ManualDispatch_*` family, or the bare `SteamClient`.

What this means:

- There is no cheaper fix. Forcing placement today would get a HELLO from
  `SteamAPI_Init` and then fail at `CSteamAPIContext.Init` on the first flat lookup
  (`EntryPointNotFoundException`), and next at `CallbackDispatcher`'s
  `SteamAPI_ManualDispatch_Init`.
- The flat tier (items a–e above) is confirmed as the blocker. Two exports join its scope:
  - the x86 `SteamAPI_ManualDispatch_*` family (item d's `gl_md_*`, now a hard
    requirement, not an audit);
  - the bare `SteamClient` export.
- No placement-guard change is needed. Once the x86 shim serves those versions, the
  classifier stops reporting them as blocking and the next launch places the shim with
  a `.gamelib-orig` backup on its own.

Diagnostics gap: the launch's `placeShimForGame ... withheld the shim` warning was
in a `gamelib.log` that has since rotated, and nothing in the UI says "withheld". So this
had to be reconstructed from the verdict's shape.

## Tracked as backlog Phase 999.2 (2026-11-21)

The flat tier is scoped as ROADMAP backlog **Phase 999.2**. That entry was refreshed on
2026-11-21 with tier 1's landing, the four-part remainder, the research step and the
promotion trigger. Close this todo when 999.2 is promoted and executed.
