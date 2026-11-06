---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 01
subsystem: steam-bridge
tags: [steam-bridge, gen-vtables, steamclient, shim, helper-dispatch]
requires: []
provides:
  - "SteamClient017/014 shim vtables forward over bridge_transact to flat SteamAPI_ISteamClient_* on the helper's SteamClient()"
  - "FWD helper-stderr logging for every forwarded ISteamClient call"
affects: [52-02, 52-11]
tech-stack:
  added: []
  patterns:
    - "pointer returns on SteamClient GetISteam* lookups travel as a 4-byte presence int; shim resolves its own proxy by exact version"
key-files:
  created:
    - meta/sdk/isteamclient014.manifest.json
  modified:
    - meta/sdk/wire-policy.json
    - meta/sdk/isteamclient017.manifest.json
    - meta/sdk/ordinals.json
    - meta/sdk/acceptance-interface-versions.json
    - meta/gen_vtables.ts
    - meta/__tests__/gen_vtables.test.ts
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/steam_api64.def
    - native/steam-bridge/generated/bridge_dispatch.h
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
key-decisions:
  - "Forwarded GetISteam* returns NULL (never the x64 null object) unless native answered non-NULL"
  - "FWD version strings pass through a 128-byte, printable-only sanitizer"
requirements-completed: [P52-SCOPE-1]
duration: 40min
completed: 2026-10-24
---

# Phase 52 Plan 01: Forwarding ISteamClient017/014 Summary

ISteamClient017 and a new SteamClient014 now forward every non-callback method through the helper to the native Mac client, with a FWD log line per call and no local null-object answer.

## Tasks

1. `da0103f58` manifests and wire policy (017 forwarded, 014 extracted from the pinned Proton source, ordinal 22).
2. `6566abd10` generator: forwarded lookup emitter, pointer-presence dispatch, FWD logging with sanitizer, identity-only gate (T-52-03).
3. `ffa72c0b3` regenerated shim/dispatch/steam_api64.def, shimCoverage pins (017 and 014 wire), x86 `steam_api.def` untouched, gen-vtables idempotent.

## Local-only (stub) ISteamClient methods

| Method | Reason |
| --- | --- |
| SetWarningMessageHook | Windows function pointer; native cannot call it |
| DEPRECATED_Set_SteamAPI_CPostAPIResultInProcess | Windows callback pointer |
| DEPRECATED_Remove_SteamAPI_CPostAPIResultInProcess | Windows callback pointer |
| Set_SteamAPI_CCheckCallbackRegisteredInProcess | Windows callback pointer |
| SetLocalIPBinding | manifest `(uint32,uint32)` shape does not match modern flat `const SteamIPAddress_t &`; forwarding would pass an integer as a pointer |

014 has only SetWarningMessageHook and SetLocalIPBinding among these. RunFrame, GetISteamUnifiedMessages, GetISteamAppList and GetISteamMusicRemote are wired under their conventional flat names although the installed dylib lacks them; NULL-tolerant dispatch logs `unresolved` and answers STATUS_ERR (T-52-06).

## Deviations from Plan

- **[Rule 3 - Blocking]** Added `SteamClient014` to `meta/sdk/acceptance-interface-versions.json` (not in the plan's file list) because the extractor needs a registry entry; the fetch worked, so 014 was extracted from Proton rather than hand-authored.
- **[Rule 1 - Bug]** `isSteamClientVersionLookupMethod` did not recognise `DEPRECATED_GetISteamUnifiedMessages`; it now strips the `DEPRECATED_` prefix.
- Task 1's describe block cannot run until Task 2 lands, because the test module generates the real dispatch header at load; it was committed with Task 1 and verified green after Task 2.
- Verification of the "no null object" criterion: Task 2 text-pin tests run against the real 017/014 manifests (every wire GetISteam* function), plus an awk spot check of `vt_SteamClient014_GetISteamUser`.

## Verification

gen_vtables.test.ts (138), `src/backend/storeManagers/steam/bridge` (382, includes shimAbiGate-equivalent helperIntegration on darwin), meta/shimAbiGate.test.ts all pass; `FWD` count in bridge_dispatch.h is 163. Prettier clean on all .ts/.json paths.

## Known Stubs

None beyond the intentional local-only list above.

## Self-Check: PASSED
