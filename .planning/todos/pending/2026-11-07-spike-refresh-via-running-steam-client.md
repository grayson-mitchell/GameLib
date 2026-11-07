---
created: 2026-11-07T22:25:57.707Z
title: "Spike: Refresh the Steam library through the running Mac Steam client (no GameLib CM logon, so no Friends drop)"
area: steam
files:
  - src/backend/storeManagers/steam/user.ts (ensureAuthenticatedSession('user-refresh') ~237)
  - src/backend/storeManagers/steam/macSteamOffline.ts (go-offline wrap)
  - src/backend/storeManagers/steam/licensedDemos.ts (spike 052: demos come from licenses, not getUserOwnedApps)
  - src/backend/storeManagers/steam/steamInstallApp.ts (backend caller pattern for the bridge helper)
  - native/steam-bridge/helper/gamelib_installapp.h (InstallApp/UninstallApp in the helper)
severity: minor
platform: macos
ready: live-gate
---

## Problem

Clicking Refresh on the Steam library opens a signed-in steam-user connection (`user-refresh`)
to call `getUserOwnedApps()` and read licenses. On macOS that connection would sign Mac Steam's
Friends out until Mac Steam restarts (`.planning/debug/friends-signout-steam-user.md`), so it
runs inside the go-offline wrap. Friends drops for a few seconds on every cold Refresh, and if
Mac Steam doesn't go offline within 5 s, the user gets the guided "Go Offline" step.

Refresh is the most common of the six actions that need this wrap (sign-in, Refresh, install
with GameLib's downloader, shared redists, redeem, repair). InstallApp/UninstallApp
(spikes 065/067) showed the bridge helper can drive the running Mac Steam's internal app
manager with no window and no sign-in of GameLib's own. Running Steam already knows the
account's licenses, so it may be able to answer "what do I own" the same way. Raised by the
operator 2026-11-08.

## Solution (spike: next free spike number)

Question: can the bridge helper get the signed-in account's owned apps (and licenses, for the
demos case from spike 052) from the running Mac Steam, with no CM logon by GameLib?

- **Candidates to probe, through the same steamclient load and interface-lookup path as
  `gamelib_installapp.h`:** a license list (license count + per-license package ids, then
  package → app ids), or a per-app ownership check run over the app ids GameLib already knows.
  All of these are unverified; pick from what the client interfaces actually export, the way
  065/067 found InstallApp/UninstallApp.
- **Must check:**
  1. the result matches `getUserOwnedApps()` plus the licensed-demos set for the same account
     (diff the app id sets);
  2. the running Steam's signed-in SteamID matches GameLib's account; on a mismatch, don't use
     the result;
  3. behaviour when Steam is signed out (expect a definite failure, as UninstallApp returns 18);
  4. Friends stays signed in throughout (watch `connection_log.txt`: no LogOff);
  5. time per call.
- **If it works:** Refresh tries the helper first when Mac Steam is running and signed in as
  the same account, and falls back to today's wrapped logon otherwise (Steam closed, signed
  out, account mismatch, helper failure). Store metadata and artwork still come from the
  anonymous client and axios, which need no sign-in. Key redemption (`redeem`) is a candidate
  for the same approach and could share the spike.
- **Boundary:** read-only queries of the user's own account in the running client, the same
  footing as InstallApp. No token extraction from Steam's files or memory.

Done when: the spike README records which call (if any) returns the owned set, the set-diff
against `getUserOwnedApps()`, the signed-out and mismatched-account results, and a Friends-intact
observation, with a VALIDATED / PARTIAL / INVALIDATED verdict.
