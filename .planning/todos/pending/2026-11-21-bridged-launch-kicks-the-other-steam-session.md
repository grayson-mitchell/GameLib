---
created: 2026-11-21T07:10:00.000Z
title: A bridged launch while another device is playing gets one Steam session kicked ("Logged In Elsewhere") without Steam's own prompt
area: steam-bridge
severity: medium
platform: macos
ready: live-gate
files:
  - native/steam-bridge/helper/bridge_helper.c
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - src/backend/storeManagers/steam/gameBridgeLaunch.ts
---

## Problem

Found while live-testing debug `bridged-launch-steam-signed-out` (2026-11-21). With the same Steam account signed in on a PC that is playing a game, pressing Play on a bridged game in GameLib makes the bridge helper's InitFlat register "playing <appId>" with Mac Steam. In the same second Steam's servers log one session off with `RecvMsgClientLoggedOff('Logged In Elsewhere')`:

- 19:16 run: Mac Steam (signed in since the morning, the older session) was kicked to its sign-in screen.
- 19:50 run: Mac Steam had just signed in (newer); the PC was kicked instead.
- 19:57 run: PC re-signed-in (newer) and playing; Mac Steam was kicked.

So, from three runs (not proven), Steam drops the OLDER session. Launching a game from Mac Steam itself would show Steam's "playing on another computer" prompt first. The bridge goes around it, so the user loses a session with no warning. The Nov 20 06:03:50 kick, during a bridged Avernum 6 run, is plausibly the same thing.

The launch gate now holds when the Mac is the one kicked (debug `bridged-launch-steam-signed-out`, round 3). That has a known race: a WHOAMI that answers before the kick lands still passes.

## Direction

1. Confirm the rule: a bridged launch vs. a native Mac Steam launch of the same game, with the PC playing. Does Mac Steam's own launch prompt, and does Steam's CM tell the client beforehand (a playing-session-state callback, e.g. `ClientPlayingSessionState` / `playing_blocked`) that the helper or GameLib could read before InitFlat?
2. If a pre-launch signal exists, show GameLib's own "playing on another device" choice before spawning the helper.
3. Close the race at minimum: re-check WHOAMI once just before the game is spawned, or watch for a SteamServersDisconnected callback in the helper during the first seconds.
