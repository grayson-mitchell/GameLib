---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 28
subsystem: steam-bridge
tags: [uat, allowlist, d-51-14, xcom, age-of-decadence]
requires: [51-27]
provides:
  - D-51-14 anchor re-baselined to The Age of Decadence (230070) by operator decision
  - XCOM CEG diagnosis confirmed (51-UAT item 17)
affects: [51-29, 51-30]
key-files:
  modified:
    - .planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-UAT.md
    - .planning/STATE.md
    - src/backend/storeManagers/steam/bridge/bridge-allowlist.json
    - src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts
key-decisions:
  - "D-51-14 anchor re-baselined 2026-10-23: Hoard (63000) retired, The Age of Decadence (230070, x64 runtime-lookup path) is the anchor, evidence 51-UAT item 18"
metrics:
  completed: 2026-10-23
  tasks: 3
requirements-completed: [D-51-14, D-51-08, D-51-11]
---

# Phase 51 Plan 28: Re-baseline the D-51-14 anchor Summary

Hoard is retired as the D-51-14 anchor and The Age of Decadence (230070) replaces it. AoD played through the bridge on its x64 runtime-lookup path with SteamApps, SteamUserStats and SteamRemoteStorage required. XCOM's CEG diagnosis is confirmed under bottled Steam.

## Operator decisions (verbatim, 2026-10-23)

- Anchor question: answered "Name another title", then "ok lets do age of decadence", so the anchor is named-title 230070.
- XCOM bottled-Steam confirmation: "Yes, run it now".
- CEG prescreen detection: "Yes, keep deferred".
- Follow-up during Task 2: the condition was "gate 230070 only if x86 with bare-accessor imports, else fall back to Legends of Eisenwald 246760". The scan found AoD ships both AoD.exe (x86) and AoD64.exe (x64). The operator chose "Play AoD now, decide after (Recommended)": "If it plays, AoD becomes the anchor on its 64-bit build. If it fails, fall back to Eisenwald." It played, so the anchor is AoD 230070 on its **x64 runtime-lookup path** (SteamInternal_CreateInterface, like ELEX), not the bare-accessor x86 shape originally preferred. Eisenwald was not run.

## Results

- **Item 17 (XCOM via bottled Steam): pass.** Enemy Within reaches its main menu under the bottled Windows Steam client, which confirms CEG needs a Windows Steam client. Base Enemy Unknown crashes after its shell starts loading, a Wine-level crash (CrossOver rates it 3 stars). The knownBad entry stays `drm-wrapped` and its note now cites item 17.
- **Item 18 (AoD via the bridge): pass.** Main menu, play and Mac Steam In-Game all confirmed. 452s of play, `HELLO shim attached appid=230070`, `steam_api64.dll` placed at 848896 bytes (the shim), x86 `steam_api.dll` untouched. 230070 is added to the allowlist seed with `playVerified` citing item 18.

## Findings (filed as pending todos)

1. Bottled route "Restart Steam to finish" is a dead end: `2026-10-23-bottled-route-restart-steam-to-finish-is-a-dead-end.md`.
2. XCOM Enemy Within cross-depot collisions (depots 200522 vs 225341) fail 11 files closed to 1026 on the native download into the bottle. Same defect as an existing todo, so a recurrence section was appended to `2026-10-22-unresolved-cross-depot-file-collisions-leave-install-stuck-at-1026.md` instead of a duplicate. It notes that bottled Steam's repair makes the real winner rule observable.
3. Bottled launch gives up at ~20s (`cause=none`) while Steam is still starting the game, and repeated clicks queue extra `-applaunch`: `2026-10-23-bottled-launch-gives-up-after-20s-while-steam-is-still-starting-the-game.md`. Distinct from the existing stuck-on-Launching todo, which is about the page after the game exits, so not merged.
4. Census scans the x86 binary of a dual-arch title: `2026-10-23-bridge-census-scans-x86-binary-of-dual-arch-titles.md`.

## Deferral

CEG detection in the bridge prescreen (`2026-10-22-detect-steam-ceg-drm-in-bridge-prescreen.md`) stays deferred by explicit operator choice and remains in pending, untouched. The `confirm-xcom-ceg` todo was moved to completed with a `## Closed` section.

## For 51-29/51-30

`pnpm bridge-census` reports 230070 as `x86 | missing-symbols` (summary line "6 of 7 routed to the bridge; 1 of 7 verified running through the bridge; 2 of 7 fully covered by the shim"). The census scanned the x86 AoD.exe and steam_api.dll, while install-time scan, shim placement and launch all used x64. For a dual-arch title the census disagrees with what actually runs. 51-30's closing census must not be trusted for 230070 until finding 4 is fixed or explicitly handled and called out there.

Also open: AoD proves the x64 runtime-lookup path, not the bare-accessor x86 coverage Hoard was chosen for. No live play-through evidence exists for bare accessors.

## Deviations from Plan

None. Task 3's file list was extended as the operator's instructions directed (allowlist seed entry and test additions for 230070, plus the new and updated todos).

## Verification

- allowlist jest suite green (32 tests); prettier clean on the JSON and test file.
- `pnpm planning-gates`: 11/12 pass. The only failure is the pre-existing `preload-surface-gate.py` (getSteamBridgeRoute and setSteamBridgeUserRoute missing from IPC-PORT-INVENTORY.md), not caused by this plan.
- No `result: pending` remains in 51-UAT.md.

## Self-Check: PASSED
