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
