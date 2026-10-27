---
created: 2026-10-26
title: "Spike: can GameLib put Mac Steam offline and back online itself, around its authenticated logon (go-offline trick)"
source: debug friends-signout-steam-user, Follow-up 2026-10-26
area: steam-auth
files:
  - src/backend/storeManagers/steam/user.ts
  - .planning/debug/friends-signout-steam-user.md
severity: medium
platform: macos
ready: live-gate
---
## Problem

Any authenticated steam-user logon that lands while Mac Steam's Friends is connected signs Friends
out or locks it Offline, and only a Mac Steam restart recovers it. The operator found one clean
sequence (n=2, 2026-10-26): Mac Steam Go Offline -> GameLib logs on -> Mac Steam Go Online. Mac
Steam may rejoin while GameLib's session stays open, and Go Offline/Online is a CM logoff/logon on
the same `steam_osx` process, not a restart. Today the operator has to click both steps by hand.

Phase 54 removes the logon from launch, browse and Play. Explicit Refresh, sign-in and native depot
installs still log on, and this spike decides how they are protected.

## Questions

1. Is there a `steam://` URL, CLI flag or IPC that switches Mac Steam into and out of offline mode?
   No documented one is known. Probe the client's URL handlers first, since that is the cheapest.
2. Failing that: macOS Accessibility (System Events clicking Steam > Go Offline / Go Online). What
   permission prompt does it cost, and how robust is it across Steam menu changes?
3. Failing that: the Mac Steam bridge's steamclient (internal IClientUser offline-mode calls).
   Undocumented and fragile; record what was found, do not ship on it lightly.
4. What does the brief offline window cost: a Friends chat disconnect, and do running online
   games through Mac Steam notice?
5. Does a GameLib re-logon (reconnect after a dropped CM connection) while Mac Steam is online flip
   Friends again? If so, the wrap must cover reconnects too.

## Done when

A written verdict in the debug session: automatable (with the mechanism, its cost and a wrap shape
around `connectSteamUserClient`'s single `logOn`), or not (fall back to a guided step in the
Refresh/install UI). Live evidence comes from Mac Steam `connection_log.txt` plus
`~/Library/Logs/GameLib/gamelib.log`, the same pair used on 2026-10-26.

## Resolution

Answered 2026-10-27 by spikes 046a-c. The verdict is in `.planning/debug/friends-signout-steam-user.md`
under "## Verdict 2026-10-27: go-offline wrap is automatable".

1. Yes: `steam://open/gooffline` and `steam://open/goonline`. They are undocumented verbs in
   steamui.dylib's native verb table (Valve's own UI uses `goonline`). LogOff takes ≤0.25 s,
   logon ≈1.3-1.5 s, on the same process with no dialog or permission prompt, and both verbs are
   idempotent (046a, n=4).
2. and 3. Not needed (Accessibility, steamclient internals).
4. Cost: an automated wrap drops Mac Steam's CM session and Friends chat for ≈3-4 s. The bare
   toggle leaves Friends intact. Not covered: a running Mac Steam game during `gooffline` (the
   Settings path refuses then).
5. Expected yes, by mechanism, not observed live (046c): steam-user `autoRelogin` (default on)
   and the canary `relog()` both send a full logon. The wrap must own every logon:
   `autoRelogin: false`, with reconnects routed through the wrapped connect.

The live wrap (046b) kept Friends signed in and changeable, and GameLib's session stayed alive
across Mac Steam rejoining.
