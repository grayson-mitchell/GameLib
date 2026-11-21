---
created: 2026-11-20T00:00:00.000Z
title: A bridged game can launch while Mac Steam is at its login screen, and then has no friends until restarted
area: steam-bridge
severity: medium
platform: macos
ready: live-gate
files:
  - src/backend/storeManagers/steam/bridge/helperSpawn.ts
  - native/steam-bridge/helper/bridge_helper.c
audit_acknowledged:
  milestone: v0.10
  at: 2026-11-20
---

## Problem

Seen on 2026-11-20 during the live invite-picker test (todo
`2026-11-19-test-steam-native-invite-picker-then-decommission-custom-picker`), on a CrossOver-engine
bridged game: when the game came up, Mac Steam was at its login screen, not signed in.

- The game ran anyway. Steam's own invite picker opened but showed no friends.
- Signing in to Steam while the game was running did not help. The friends list stayed empty.
- After restarting the game, with Steam signed in, everything worked: the invite was sent, and the
  other account accepted and joined.

So the game reads the Steam session once, at startup. A launch while Steam is signed out quietly
gives a game with no social features, and nothing tells the user why.

## Direction

1. Reproduce it: sign out of Mac Steam (or leave it at its login screen), then launch a bridged game
   from GameLib. Note what the helper logs (LISTEN/READY/INIT) and what the game shows.
2. Find out how Steam got to its login screen. Did GameLib start Steam, or was it already sitting
   there signed out?
3. Decide on a fix. Two options: before launching, check that Mac Steam is signed in, and if not,
   hold the launch or prompt the user to sign in first; or, at minimum, tell the user to sign in
   to Steam and restart the game.

## Resolved by debug bridged-launch-steam-signed-out (2026-11-21)

Steam was already at its sign-in screen (a "Logged In Elsewhere" kick at 06:03:50); GameLib did not start it. The gate trusted InitFlat + a bare WHOAMI OK, and both succeed at the sign-in screen. Fix: the helper's WHOAMI is OK only when Steam is logged on; "no account" and "account kept but not logged on" get their own reasons, and the second is told apart from offline mode by `loginusers.vdf` `WantsOfflineMode` (new Rust op `steamfiles_read_loginusers_offline_mode`). A signed-out Steam now holds the launch up to 60 s behind an in-app "Waiting for Steam" notice, then launches once you sign in, or shows the "Steam not signed in" dialog. Live-confirmed 2026-11-21: explicit sign-out (wait out and sign-in), and a "Logged In Elsewhere" kick (held, signed in, launched with friends). Session: `.planning/debug/resolved/bridged-launch-steam-signed-out.md`. Follow-up: `2026-11-21-bridged-launch-kicks-the-other-steam-session.md`.
