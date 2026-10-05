---
created: 2026-10-05T00:00:00.000Z
title: "runWineCommand, callTool, installWineVersion, downloadRuntime, syncSaves, syncGOGSaves and addToSteam are missing from LONG_RUNNING_CHANNELS — they reject at 60s while still running"
area: tauri-shell
severity: major
platform: any
ready: code
found_by: "Code review of phase 34.5 (non-Steam runners, Wine and shortcuts), 2026-10-05"
files:
  - src-tauri/src/main.rs:1155-1202
  - src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx:250-264
  - src/frontend/components/UI/Winetricks/index.tsx:172-178
  - src/frontend/screens/Game/GamePage/components/CloudSavesSync.tsx:95-131
  - src/frontend/screens/Settings/components/EacRuntime.tsx:45-49
  - src/frontend/screens/Game/GameSubMenu/index.tsx:326-338
---

## Problem

None of these channels is in the Rust `LONG_RUNNING_CHANNELS` list (`main.rs:1155+`), so each is
bounded by the 60s invoke timeout although the work routinely takes longer.

Same root, separate symptom: `handleAddToSteam` (`GameSubMenu/index.tsx:326-338`) has no try/finally,
so any rejection (timeout, `GAMELIB_SHELL_EXE` unset, corrupt `shortcuts.vdf`) leaves `steamRefresh`
true and the button replaced by a spinner until remount.

## Failure scenario

- Sideload "Run Installer First" (`wait: true`): an installer running past 60s rejects,
  `runningSetup` goes false and the button re-enables mid-install — a second installer can start
  into the same prefix.
- The winetricks GUI (`callTool`) clears `guiOpen` at 60s while the GUI is still open.
- `CloudSavesSync.tsx` and `EacRuntime.tsx` lack try/finally, so `isSyncing` / `installing` stay
  true forever.
- `WineItem.install()` produces an unhandled rejection on every Proton/Wine download over 60s.

## Suggested fix

Add the channels to the Rust list and to `longRunningChannels.test.ts`; add try/finally (and an
error surface) at the listed frontend call sites.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). The orchestrating session re-checked the cited lines itself and the mechanism holds. Line numbers are as of `5927806` on `main`.
