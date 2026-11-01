---
created: 2026-11-01
title: "Closing GameLib silently ends a hosted bridge session"
area: steam-bridge
files:
  - src-tauri/src/main.rs
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - src/backend/storeManagers/steam/games.ts
severity: major
platform: macos
ready: code
---

## Trigger

At 15:25:33 on 2026-11-01 the main window was closed (`[shell] quit (window close): handed to the sidecar handleExit`). The sidecar ran `stopBridgeHelper`, and the PC saw "game no longer being hosted". GameLib gave no warning.

## Likely cause

The window-close path hands the quit to the sidecar's `handleExit()` (see `src-tauri/src/main.rs`), which tears down the bridge helper along with everything else. Nothing checks whether a bridged game is currently hosting.

## What done looks like

Closing GameLib while a bridged game hosts does not silently end the session.

Options (this todo does not decide between them):

1. Show a confirm-quit while a bridged game is running.
2. Keep the helper alive until the game exits.

## Verify

Live: host a bridged game with a peer connected, close the GameLib window, and confirm either a confirm prompt appears or the session survives until the game exits.

## Related

`2026-11-01-invite-picker-raises-whole-main-window.md`. The whole-window raise puts the main window in front of the game, which makes an accidental close likely.
