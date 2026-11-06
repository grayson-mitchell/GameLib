---
status: complete
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
source: [56-01-SUMMARY.md .. 56-34-SUMMARY.md (34 files)]
started: 2026-10-29T03:06:43Z
updated: 2026-10-29T03:13:48Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Grim Dawn reaches its menu in DRM mode with only Mac Steam
expected: With only Mac Steam running, clicking Play on Grim Dawn (219990) shows DRM setup progress on the card, then the game opens and reaches its interactive main menu; no "route not supported" or Windows-Steam prompt appears.
result: pass

### 2. A second Play does not hang at the bottle stage
expected: After quitting Grim Dawn, clicking Play again launches it to the menu without a long pause on the setup step (the already-staged bottle is skipped, no hung stage).
result: pass

### 3. Card status ends after a DRM launch
expected: After Grim Dawn exits, its card goes back to a normal Play state; it is not stuck on a "Setting up" / DRM-setup / redistributables status.
result: pass

### 4. Raft reaches its menu in DRM mode
expected: Clicking Play on Raft (648800) launches it through DRM mode to its main menu with only Mac Steam running. (Known, tracked separately: quitting may hang and need a force-quit.)
result: pass

### 5. Ranch Simulator routes to DRM mode
expected: Clicking Play on Ranch Simulator (1119730), whose DRM wrapper sits on its UE Shipping exe, takes the DRM path and reaches its main menu, rather than failing the launch check or using the plain TCP bridge.
result: pass

### 6. DRM-free titles still use the default bridge
expected: A DRM-free bridge title you have installed (e.g. Avernum 6) still launches and plays as before, with no DRM setup step shown on its card.
result: pass

### 7. Fresh install finishes cleanly
expected: Installing a SteamStub title (e.g. reinstalling Grim Dawn) through the bridge ends with the card on Play; it does not stay on a redistributables status after the install completes.
result: pass

### 8. A DRM setup failure shows one readable notice
expected: If DRM setup fails (e.g. Mac Steam not running when you click Play on Grim Dawn), one notice dialog appears in front of the window naming the step that failed, and the card returns to Play instead of keeping a stale status.
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
