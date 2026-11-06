---
phase: 60-steam-overlay-in-bridged-games-on-macos
plan: 16
subsystem: steam-overlay
tags: [uat, live-gate, overlay, crossover, wine-staging, gap-closure]
requires: [60-13, 60-14, 60-19, 60-20]
provides:
  - "Live re-run of the Phase 60 gate: items 10-17 all pass, G1-G4 resolved, UAT status complete"
affects: [60-UAT.md]
key-files:
  modified:
    - .planning/phases/60-steam-overlay-in-bridged-games-on-macos/60-UAT.md
decisions:
  - "Gate ran in fix mode (X-RELEASE+BLOCK, fix routes tcp-clone,env)"
  - "Item 9's Staging pass is explained as a menu-state pass (item 17)"
metrics:
  completed: 2026-11-04
requirements-completed: [G1, G2, G3, G4, D-15, D-02, D-07, D-08, D-09, D-11]
---

# Phase 60 Plan 16: Gap-closure live re-run Summary

The live re-run passed items 10-17 in fix mode (`overlay input fix=X-RELEASE+BLOCK`). That closes G1-G4, D-15 now passes on all four titles, and 60-UAT.md is `status: complete`.

## Results

| Item | Subject | Result |
| ---- | ------- | ------ |
| 10 | Schedule I, CrossOver, fix applied | pass (20:17) |
| 11 | The Planet Crafter, CrossOver, fix applied | pass (20:21) |
| 12 | Manor Lords, UE stub regression | pass (20:24) |
| 13 | Grim Dawn, DRM clone, attach window (G2) | pass (20:27) |
| 14 | Planet Crafter on Wine-Staging with fix | pass (20:44) |
| 15 | Settings persistence (G3) | pass |
| 16 | In-app overlay-unavailable notice (G4) | pass |
| 17 | Item 9 re-examined, Staging without fix | pass (record only, 20:46) |

- G1: fix works on CrossOver (items 10, 11) and on Staging (item 14). overlay_input open/close was balanced and `inactive 9`. No non-game process acted, so the 60-19 caveat is cleared. No G5.
- Item 9 explained: item 17 (fix off) has cursor and clicks in the main menu and pause menu, but not in gameplay. Item 9's original Staging pass was a menu-state pass, which matches 60-12 Run B.
- G2: Grim Dawn attached in 10018 ms with no `not attached within` line.
- G3: Off and Automatic both survive reopening settings.
- G4: the notice appeared in-app on three shim-missing launches, non-modal and visible about 8 s after refocus.
- Shim restored: `lipo -info` lists x86_64 arm64 and no `.off` file remains.

## Task commits

1. Task 1, preconditions and items 10-17 scaffold: 7d49ad1d6
2. Task 2, operator runs (checkpoint, no commit)
3. Task 3, results, gap resolutions and status in 60-UAT.md: committed with this SUMMARY

## Deviations from Plan

None. The plan ran as written in fix mode.

## Observations

- The G4 launch also logged `notify(): "Steam overlay unavailable" handed to tauri-plugin-notification (delivery not confirmable)` and the operator saw no macOS banner. This is not a failure: the in-app notice is the surface that counts.
- `applied=true` was logged on the shim-missing launch.
- Toast look polish is tracked in `.planning/todos/pending/2026-11-04-polish-steam-launch-notice-toast.md` (740e1c1de).

## Deferred Issues

- `meta/__tests__/hardcodedStringGate.test.ts` fails on 8 string literals in `src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx` lines 41-62. They came from 60-14 and are out of scope here. The orchestrator owns this fix.

## Known Stubs

None.

## Self-Check: PASSED

60-UAT.md has no pending results, no home paths, one resolution line per G1-G4 and the `Item 9 re-examined:` bullet. The shim is a fat binary.
