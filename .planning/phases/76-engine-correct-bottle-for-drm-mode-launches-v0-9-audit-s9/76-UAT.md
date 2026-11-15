---
status: testing
phase: 76-engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9
source: [76-01-SUMMARY.md]
started: 2026-11-15T10:10:00Z
updated: 2026-11-15T10:10:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing not started]

## Tests

Operator note: build first with `pnpm build:sidecar`, start with `pnpm tauri:dev`, and read logs via Settings > Logs. Never reroute a failed DRM launch to bottled Steam; record it as an issue. Report any refusal dialog text verbatim. The engine marker lives at `GameLibSteamBridge-219990/.gamelib-engine.json` in the bridge bottles directory. Engine dialog tags appear in the launch log as `[engine-notice] appId=219990 tag=...`.

### 1. Install with CrossOver hidden takes the fallback engine
expected: Precondition: Grim Dawn (219990) is not installed (uninstall it first if it is), /Applications/CrossOver.app is hidden by renaming it (e.g. to CrossOver-hidden.app), and GameLib has been restarted. Installing Grim Dawn completes, and `GameLibSteamBridge-219990/.gamelib-engine.json` in the bridge bottles directory names a non-CrossOver (pinned Wine-Staging) engine.
result: pending

### 2. Play with CrossOver still hidden refuses clearly
expected: With CrossOver still hidden, pressing Play shows the existing dialog saying the game uses Steam DRM support that needs CrossOver (launch log `tag=crossover-required-drm`); the card returns to Play (not stuck on Setting up); the `.gamelib-engine.json` marker is unchanged; no Windows Steam or bottled Steam prompt appears.
result: pending

### 3. Restored CrossOver: Play switches the bottle back and launches in DRM mode
expected: Precondition: rename CrossOver back to /Applications/CrossOver.app and run only Mac Steam. Pressing Play briefly shows a setting-up status on the card, then DRM setup, then the game opens; no confirm dialog or toast about the switch appears; `.gamelib-engine.json` now names crossover; the log shows GameLib's lsteamclient trace of the Grim Dawn game process's first CreateInterface (appId 219990 with the game pid) plus a game-originated call beyond init (strict criterion D-56-15/16; reaching the menu or Mac Steam In-Game alone does not count).
result: pending

### 4. Second Play is a no-op switch
expected: After quitting, pressing Play again launches through DRM mode with no engine setting-up step (the marker is already crossover) and the card returns to Play after exit.
result: pending

### 5. No regression for a TCP bridge title
expected: A DRM-free bridge title (e.g. Avernum 6, 206060) still launches as before, with no DRM setup step and no new engine dialog.
result: pending

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

[none yet]
