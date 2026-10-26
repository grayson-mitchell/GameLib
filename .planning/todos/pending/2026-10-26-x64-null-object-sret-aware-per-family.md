---
created: 2026-10-26
title: "x64 null object returns 0 in RAX for MSVC sret slots; make it per-family and sret-aware (51-REVIEW WR-03)"
source: 51-REVIEW.md WR-03, fixed doc-only in 51-REVIEW-FIX.md (006e5f8f1); behavioural fix deferred by user decision 2026-10-26
area: steam-bridge
files:
  - meta/gen_vtables.ts
  - native/steam-bridge/generated/steam_api_shim.c
  - meta/__tests__/gen_vtables.test.ts
severity: medium
platform: macos
ready: human
---

## Problem

MSVC x64 returns user-defined types through a hidden pointer and expects RAX to hold it. `vt_x64_null_object` returns 0 for every slot, so a caller of an sret method on an unserved runtime-lookup family dereferences address 0. Examples: `ISteamController::GetDigitalActionData` and `GetAnalogActionData` in ELEX's unmanifested SteamController set. Only the doc comment was corrected, in 006e5f8f1. CR-03 (51-20) already narrowed the hazard to runtime-lookup families, hence medium.

## Options

Recorded without choosing:

- (a) Generate per-family, sret-aware x64 null objects from the Proton inventory in `meta/gen_vtables.ts`. Sret slots zero-fill and return their hidden-pointer argument.
- (b) Count sret-bearing unserved families as missing rather than stubbed. This re-routes titles like ELEX away from the bridge.
- (c) The still-unmade D-51-02 option: add the risk to the stubbed-interface notice copy.

`ready: human` because the choice between these, and the notice copy for (c), is a decision. A live Wine gate is also needed after the code.

## Done when

The chosen option is implemented, gen_vtables tests pin it, and a live Wine gate on an affected title records no sret crash. If option (b) is chosen, the gate records the re-route.
