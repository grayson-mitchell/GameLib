---
created: 2026-11-22T06:30:00.000Z
title: The "Playing on another device" dialog has no "Play here" option, so taking over from the PC means walking over to it
area: steam-bridge
severity: minor
platform: macos
ready: code
files:
  - native/steam-bridge/helper/gamelib_playingsession.h
  - src/backend/storeManagers/steam/bridge/otherSessionPlaying.ts
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx
---

## Problem

Since fb7f9b243 (debug session bridged-launch-kicks-other-session), a bridged launch while another device of the
account is playing stops at a "Playing on another device" dialog with Cancel only. Mac Steam's own prompt also offers
"Play here", which stops the other device's game and launches locally. GameLib has no equivalent: the user must quit
the game on the other device, or set `GAMELIB_STEAM_OTHER_SESSION_CHECK=off` (which brings back the kick).

The operator chose to ship tell-and-cancel first (Option B) and file this (Option A), 2026-11-22.

## Solution

- New helper subcommand that calls `IClientUser::BKickOtherPlayingSession` the same way `--steam-playing-session` calls
  `BIsOtherSessionPlaying`: RTTI-checked IClientUser, function-ID-matched slot, never a hard-coded slot. Keep the
  cwd/env hardening (chdir "/", unset SteamAppId/SteamGameId/SteamOverlayGameId): an attach that Steam tracks as a game
  is itself a kick.
- A primary "Play here" button next to Cancel, a renderer-to-backend IPC, then poll `--steam-playing-session` until it
  reads clear (bounded), then launch.
- Live gate: with the PC playing, "Play here" stops the PC's game, both devices stay signed in (no
  "Logged In Elsewhere" in connection_log on either), and the Mac launches with friends.

## Notes

- The kick method's signature and side effects are inferred from client strings, not measured. Measure them on a
  throwaway run first, and do not test it from a cwd holding `steam_appid.txt`.
