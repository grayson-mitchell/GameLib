---
created: 2026-11-01
title: "Bridge invite picker raises the whole GameLib window behind it on Mac-hosted games"
area: steam-bridge
files:
  - src/frontend/components/UI/SteamBridgeInviteDialog/index.tsx
  - src/frontend/state/SteamBridgeInvite.ts
  - src-tauri/src/main.rs
  - .planning/phases/58-steam-bridge-multiplayer/58-36-PLAN.md
severity: medium
platform: macos
ready: live-gate
---

## Trigger

Phase 58 multiplayer, operator report 2026-11-01: hosting a bridged game on the Mac and choosing to add/invite a player opens GameLib's friend picker (`SteamBridgeInviteDialog`, 58-32, which replaces Steam's overlay invite dialog). The picker shows up, but the entire GameLib main window comes forward with it, behind the picker and over the game. The player only wanted the picker.

## Likely cause

The picker is a dialog rendered inside the main window. To get it on screen over the game, 58-36 routes it through `main_window_raise` (`src-tauri/src/main.rs:8166`: unminimize/show/set_focus, the same raise the bridge-notice dialogs use). So surfacing the picker means surfacing the whole app.

## What done looks like

When the game asks for an invite, only the friend picker appears over the game. The GameLib library window stays where it was (hidden, minimized or behind the game). Closing the picker puts focus back on the game. The 58-36 "picker is on screen" ack (`ackWhenVisible`) still fires.

One direction worth checking: host the picker in its own small, focused Tauri window instead of raising the main one. Bridge-notice dialogs share the same raise path, so decide whether they move too or keep the current behaviour.

## Verify

Live on this Mac with a bridged game hosting: open invite from inside the game. Only the picker window comes forward, the game stays visible around it, and an invite still sends. Check with the main window minimized and with it open behind the game. Check with frameless both OFF and ON.

## Code landed (quick 261101-llf)

Commits: 9331c186f (Rust `bridge_invite_picker_open` arm, `bridge-invite-picker.json` capability, shell gates), 7cebc8c99 (backend switch, picker-only renderer root, main window stops hosting the picker).

Bridge-notice decision: the bridge-notice dialogs (route notice, setup, Go Offline) keep `main_window_raise` and stay in the main window. They are shown before or around launch rather than mid-game, they are tied to main-window state and flows, and nobody has reported them as a problem. Only the invite picker, which opens mid-game, moved.

Operator live gate (NOT yet run; this todo stays pending until it passes). Run on this Mac with a bridged game hosting, opening the invite from inside the game, after a dev restart (the sidecar is not rebuilt by `tauri dev`):
1. With the main window open behind the game: only the picker comes forward, the game stays visible around it, and the main window does not appear.
2. With the main window minimized: the same, and the main window stays minimized.
3. With GameLib Cmd+H-hidden: the picker shows; after close, GameLib is hidden again and the main window is not left on screen.
4. Invite a friend: the row shows "Invite sent", and the log has `bridge invite [<appId>]: display=confirmed`.
5. Close via the Close button, via Esc, and via the red X: focus returns to the game each time, and the main window does not come forward.
6. Repeat 1 and 5 with frameless OFF and with frameless ON.
7. If the picker shows a bootstrap error naming an ACL-denied command, add exactly that one permission to bridge-invite-picker.json and its pin.
Not covered: a game in a native macOS fullscreen Space. Record what happens there as an observation, not a pass or fail.

## Related

`2026-11-01-quitting-gamelib-kills-a-hosted-bridge-session.md`. The raised main window is how the accidental close in that todo happens.
