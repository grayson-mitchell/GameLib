---
status: complete
phase: 76-engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9
source: [76-01-SUMMARY.md]
started: 2026-11-15T10:10:00Z
updated: 2026-11-16T07:30:00Z
---

## Current Test

[testing complete]

## Tests

Operator note: build first with `pnpm build:sidecar`, start with `pnpm tauri:dev`, and read logs via Settings > Logs. Never reroute a failed DRM launch to bottled Steam; record it as an issue. Report any refusal dialog text verbatim. Engine dialog tags appear in the launch log as `[engine-notice] appId=219990 tag=...`.

Hiding CrossOver: renaming /Applications/CrossOver.app does NOT hide it, because GameLib finds CrossOver through Spotlight by bundle ID (`mdfind kMDItemCFBundleIdentifier = com.codeweavers.CrossOver`), which also matches a renamed bundle. Use `mkdir -p ~/cx-hidden.noindex && mv /Applications/CrossOver.app ~/cx-hidden.noindex/` (Spotlight skips `*.noindex`), confirm `mdfind "kMDItemCFBundleIdentifier = com.codeweavers.CrossOver"` prints nothing, then restart GameLib. Restore with `mv ~/cx-hidden.noindex/CrossOver.app /Applications/`. A correct hide shows `bottle creation engine pinned (cx-missing)` in the log; `bottle creation engine crossover` means the precondition is not met.

Engine marker note: no `.gamelib-engine.json` is written at bottle creation. The engine of a marker-less bottle is inferred from `cxbottle.conf` (no `Timestamp` means pinned).

### 1. Install with CrossOver hidden takes the fallback engine
expected: Precondition: Grim Dawn (219990) is not installed (uninstall it first if it is), CrossOver is hidden with the `.noindex` method above (mdfind returns nothing), and GameLib has been restarted. Installing Grim Dawn completes, and the log shows `bottle creation engine pinned (cx-missing)` and `provisionBridgeBottle: ... created by Wine-Staging ... + DXVK-macOS ...` (a non-CrossOver, pinned Wine-Staging engine).
result: pass. Third attempt, after the procedure fix. 07:14:36 `bottle creation engine pinned (cx-missing)`; 07:14:59 `created by Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)`. The first two attempts (06:53:40, 07:09:07) logged `bottle creation engine crossover` because renaming did not hide CrossOver. No marker file is written at creation. The card showed a "best effort" badge after install.

### 2. Play with CrossOver still hidden refuses clearly
expected: With CrossOver still hidden, pressing Play shows the existing dialog saying the game uses Steam DRM support that needs CrossOver (launch log `tag=crossover-required-drm`); the card returns to Play (not stuck on Setting up); the bottle's engine is unchanged; no Windows Steam or bottled Steam prompt appears.
result: pass. 07:19:28 `drm launch needs CrossOver but pre-flight is missing; not launching (no built-in engine, no fallback)`; `[engine-notice] appId=219990 tag=crossover-required-drm display=confirmed`. Dialog text verbatim: "This game uses Steam DRM support that needs CrossOver (CrossOver isn't working). Install or renew CrossOver, then try again." No engine switch attempted. Observation, outside this phase: the dialog has no button, only the window X closes it (filed as a pending todo).

### 3. Restored CrossOver: Play switches the bottle back and launches in DRM mode
expected: Precondition: restore CrossOver to /Applications/CrossOver.app and run only Mac Steam. Pressing Play briefly shows a setting-up status on the card, then DRM setup, then the game opens; no confirm dialog or toast about the switch appears; the log shows `engine switch for "GameLibSteamBridge-219990": ... -> crossover` and the bottle's engine is now crossover (pinned wineserver stopped, Staging DXVK-macOS removed); the log shows GameLib's lsteamclient trace of the Grim Dawn game process's first CreateInterface (appId 219990 with the game pid) plus a game-originated call beyond init (strict criterion D-56-15/16; reaching the menu or Mac Steam In-Game alone does not count).
result: issue. The game launched and the strict DRM criterion is met (trace 219990-1794766955347.log: pid=416 role=game create-interface SteamClient017, 35 game calls including RequestLANServerList, BIsSubscribedApp, GetFileSize; no confirm dialog or toast). But the engine switch did not run: no `engine switch for "GameLibSteamBridge-219990": ... -> crossover` log line exists. At 07:22:23 preflightCrossover's demo-status probe ran against the bottle and CrossOver rewrote cxbottle.conf adding `"Timestamp" = "20260715T103801Z"`. At 07:22:32 prepareBottleForEngine found no marker, inferMarker (src/backend/engine/engineSwitch.ts:422) read the Timestamp and inferred 'crossover', the identity matched, and it wrote the marker silently (engineSwitch.ts:693) and returned {ok:true, changed:false}. The pinned wineserver was never killed and the Staging DXVK-macOS was never removed (current_dxvk-macOS still dated 07:14:59). The bottle is now mislabeled crossover.
reported: Item 3 engine switch did not occur; bottle left mislabeled crossover while still holding Staging DXVK-macOS.
severity: major

### 4. Second Play is a no-op switch
expected: After quitting, pressing Play again launches through DRM mode with no engine setting-up step and the card returns to Play after exit.
result: pass. 07:24:04 second `[bridge-drm] appId=219990 mode=steamclient-layer`, no engine switch, card back to Play after exit. (It passed trivially, because the bottle was already mislabeled crossover after item 3.)

### 5. No regression for a TCP bridge title
expected: A DRM-free bridge title (e.g. Avernum 6, 206060) still launches as before, with no DRM setup step and no new engine dialog.
result: pass. 07:24:54 Avernum 6 (206060) launched via the Steam bridge, no DRM setup step, no engine dialog.

## Summary

total: 5
passed: 4
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "A DRM-mode launch on a bottle that was created by the pinned (Staging) engine switches it to CrossOver (kills the pinned wineserver, removes Staging DXVK-macOS) before launching"
  status: failed
  reason: "Item 3: bottle creation by the pinned engine writes no .gamelib-engine.json. preflightCrossover's demo-status probe runs before prepareBottleForEngine and makes CrossOver add a Timestamp to cxbottle.conf, so inferMarker (engineSwitch.ts:422) reads the bottle as crossover, the identity matches, and prepareBottleForEngine writes the marker silently and returns changed:false. No switch runs; Staging DXVK-macOS stays in the bottle. 76-01's unit tests seeded markers and never exercised inferMarker."
  severity: major
  test: 3
  artifacts: [src/backend/engine/engineSwitch.ts, src/backend/storeManagers/steam/gameLaunch.ts]
  missing: ["Write the engine marker at pinned-engine bottle creation, and/or run prepareBottleForEngine before preflightCrossover touches the bottle", "A test that exercises inferMarker on a marker-less pinned bottle before and after CrossOver adds Timestamp"]
