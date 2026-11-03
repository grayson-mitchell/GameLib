---
created: 2026-11-02
title: 'Steam overlay is not injected on the Phase 59 fallback engine (D-07 gap)'
area: steam-bridge
severity: minor
platform: macos
ready: live-gate
files:
  - src/backend/storeManagers/steam/bridge/
  - .planning/phases/60-steam-overlay-in-bridged-games-on-macos/60-UAT.md
---

## Gap (D-07)

Phase 60 does not inject the Steam overlay on the Phase 59 Wine-Staging + DXVK fallback engine; bridge launches there log `overlay=skipped reason=fallback-engine`.

The mechanism is proven: plain `DYLD_INSERT_LIBRARIES` reaches the Staging loader, which is ad-hoc signed with no hardened runtime, so no re-sign or clone is needed.

## Open questions

- Plain env injection reaches every wine process, not just the game (multiple-attach risk, RESEARCH A1).
- Rendering on winemac + DXVK-macOS/MoltenVK is untested.

## Follow-up

Append the same four overlay values to the fallback engine's `enviromentOptions`, then add a fallback-engine title to a live gate (run under `no-crossover.sb`) and judge the overlay by operator observation.

## Resolution

Fixed in quick task 261103-wci (`a378feecb`, `d43f83c50`). On the fallback engine `prepareTcpOverlay` now
returns an `env` overlay payload: the same four values as the CrossOver CX_ENV tokens (shim-first
`DYLD_INSERT_LIBRARIES`, `SteamOverlayGameId`, `SteamGameId`, `SteamAppId`) as plain env entries, built by
one shared value builder so the two forms cannot drift. No clone, no re-sign, no runner change; setup
failures stay fail-open via `notifyOverlaySetupFailed`. The launch logs `overlay=env reason=fallback-engine (D-07)`.

Live gate (60-UAT item 9) passed on 2026-11-03 with The Planet Crafter (1284190) under `no-crossover.sb`:
the overlay draws correctly on winemac + DXVK-macOS/MoltenVK and takes clicks; no abnormal-exit dialog.
Open question A1 (plain env reaches every wine process) is observed, not a problem: the shim loaded in 14
processes including the wineserver and the Unity crash handler, but Steam attached gameoverlayui exactly
once, to the game process.
