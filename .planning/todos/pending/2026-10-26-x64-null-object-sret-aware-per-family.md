---
created: 2026-10-26
title: "x64 null object returns 0 in RAX for MSVC sret slots; make it per-family and sret-aware (51-REVIEW WR-03)"
source: 51-REVIEW.md WR-03, fixed doc-only in 51-REVIEW-FIX.md (006e5f8f1); behavioural fix deferred by user decision 2026-10-26
area: steam-bridge
files:
  - meta/gen_vtables.ts
  - native/steam-bridge/generated/steam_api_shim.c
  - meta/__tests__/gen_vtables.test.ts
  - meta/extractProtonInventory.ts
  - meta/sdk/x64-null-sret-inventory.json
severity: medium
platform: macos
ready: live-gate
---

## Problem

MSVC x64 returns user-defined types through a hidden pointer and expects RAX to hold it. `vt_x64_null_object` returns 0 for every slot, so a caller of an sret method on an unserved runtime-lookup family dereferences address 0. Examples: `ISteamController::GetDigitalActionData` and `GetAnalogActionData` in ELEX's unmanifested SteamController set. Only the doc comment was corrected, in 006e5f8f1. CR-03 (51-20) already narrowed the hazard to runtime-lookup families, hence medium.

## Options

Recorded without choosing:

- (a) Generate per-family, sret-aware x64 null objects from the Proton inventory in `meta/gen_vtables.ts`. Sret slots zero-fill and return their hidden-pointer argument.
- (b) Count sret-bearing unserved families as missing rather than stubbed. This re-routes titles like ELEX away from the bridge.
- (c) The still-unmade D-51-02 option: add the risk to the stubbed-interface notice copy.

The choice between these was a decision; the user chose (a) on 2026-10-26 (see Progress). `ready: live-gate` because only the live Wine gate remains.

## Progress

Option (a) was chosen by the user on 2026-10-26 and implemented PER EXACT INTERFACE VERSION, not per family, because sret slot positions move between versions (SteamController003 sret is at 9/12, SteamController006 at 13/16/25) and a family-wide table would memset through RDX on a slot where RDX is an ordinary argument. Done in quick task 261027-i4x (commits 056a07e17 and 651debb69).

- Inventory: `meta/sdk/x64-null-sret-inventory.json` (74 Proton versions, 189 sret slots, pinned SHA), regenerated with `pnpm extract-proton-inventory --null-sret-inventory`.
- Generator: `emitX64NullSretObjects` emits per-size `vt_x64_null_sret_<N>` functions, per-version vtables, and the exact-string lookup `x64_null_object_for_version`. All 5 x64 fallback sites use it (SteamInternal_CreateInterface, FindOrCreateUserInterface, FindOrCreateGameServerInterface, the ISteamClient GetISteamXxx local path, and the forwarded-lookup local path). The SteamStub forwarded path still answers NULL on a miss.
- ELEX: SteamController003 slots 9 (2 bytes) and 12 (16 bytes) are covered. Versions the bridge serves on x64 get no null object.
- Remaining gap: a version unknown to the pinned Proton inventory still gets the all-zero generic object.
- Still to do for "Done when": a live Wine gate on a title that actually calls an unserved sret slot (ELEX cannot serve, see below).
- 2026-10-27 (quick 261027-ijs, e2f073ba6): NULLSRET instrumentation landed. The helper logs NULLSRET <version> slot=<n> size=<bytes> on the first call of each per-version sret null slot. ELEX (411300) rerun pending: restart pnpm tauri dev, launch ELEX, grep the helper log for NULLSRET SteamController003.
- 2026-10-27 live ELEX (411300) runs, both inconclusive for this gate:
  - 13:18, i4x shim (placed steam_api64.dll byte-identical to the build): HELLO, GINIT SteamAPI_Init ok, one CALL BIsSubscribedApp, then a loading-screen hang. No crash, but null-object calls were not logged then, so it showed nothing about sret.
  - 13:34, ijs shim and helper (placed DLL byte-identical to the 13:29 build; helper started fresh at 13:34): the same HELLO, GINIT, BIsSubscribedApp, then the same loading-screen hang, watched for 5+ min. Zero NULLSRET lines, no further bridge calls, no crash. ELEX.exe still alive at 0% CPU (idle hang, not slow loading).
  - Conclusion: ELEX never calls a SteamController003 sret slot (9 or 12) before its pre-existing loading-screen hang (knownBad since 51-26). The hang is unrelated to WR-03, and ELEX cannot serve as the live gate for this fix. The gate needs another title whose x64 build looks up an unserved sret-bearing version (any of the 140 NULLSRET sites) and gets far enough to call it, or the user accepts the unit and disassembly evidence (gen_vtables, shimAbiGate RDX→RAX) instead.

## Done when

The chosen option is implemented, gen_vtables tests pin it, and a live Wine gate on an affected title records no sret crash. If option (b) is chosen, the gate records the re-route.
