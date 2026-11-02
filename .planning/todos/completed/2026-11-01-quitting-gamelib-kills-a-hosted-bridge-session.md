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

## Resolution

2026-11-01 (quick 261101-okd, `18e855237`): Option 1, a confirm-quit. `hasLiveBridgeHelper()` in `helperProcess.ts` is true while any bridge helper is alive, and a helper lives exactly as long as its game. `handleExit()` in `src/backend/utils.ts` now shows its existing quit prompt in that case too. Window close, Cmd+Q and Dock Quit all route through `handleExit()`. When the bridge is the only reason for the prompt, it uses the bridge-specific message `box.quit.bridgeHosting`. `cancelId: 0` is unchanged, so Esc or dismissing still means No.

Live verified by the operator 2026-11-01, after a dev restart with the sidecar rebuilt: closing the GameLib window while a bridged game was hosting showed the prompt.
