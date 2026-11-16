---
created: 2026-11-15T00:00:00Z
title: 'Mac Steam owned-apps helper makes Friends show "playing Spacewar" (AppID 480); Mac path is off until fixed'
area: steam-library
severity: medium
platform: macos
ready: human
resolved: 2026-11-17 (537df457d; operator UAT passed)
source: Phase 79 plan 79-38 (UAT part B item 14)
files: [native/steam-bridge/helper/gamelib_ownedapps.h, native/steam-bridge/helper/gamelib_installapp.h, src/backend/storeManagers/steam/library/macSteamPathFlag.ts, src/backend/storeManagers/steam/library/refresh.ts]
---

## Problem

During a Mac Steam path Refresh (plan 79-36, D-14), the operator's Mac Steam Friends list showed them
as **playing Spacewar** within 1-2 s of the Refresh. Their friends see this.

`~/Library/Application Support/Steam/logs/gameprocess_log.txt` shows the cause. Every
`steam-bridge-helper --steam-owned-apps` run logs `AppID 480 adding PID <helper pid> as a tracked
process`, and about 1-2 s after the helper exits it logs `Remove 480 from running list`.

## What is known (probe runs, 2026-11-15)

- **Ruled out: cwd and env.** A clean cwd still registers 480. `SteamAppId`/`SteamGameId` set to 0 or 1 still register 480. `SteamAppId=7` makes `ConnectToGlobalUser` fail.
- **The attach is not the trigger.** `CreateSteamPipe` -> `ConnectToGlobalUser` -> engine slot 8 (`GetIClientUser`) registers nothing, with or without `BReleaseSteamPipe`.
- **The first IPC calls likely are.** The full helper registers 480, and so does the guard-failure run (wrong `--expect-steamid`), which stops after `BLoggedOn` + `GetSteamID`. So the trigger is the first real IPC call on the IClientUser proxy, most likely `BLoggedOn` or `GetSteamID`. This is inferred from two runs; no bisect was measured.
- **Likely mechanism:** Steam defaults an unidentified pipe to AppID 480 on its first IPC call.
- `--steam-installapp` and `--steam-uninstallapp` share `gl_ia_attach` and show the same presence. **Confirmed live 2026-11-16 (79-44 UAT item 23):** an UninstallApp at 06:36:31 and an InstallApp adoption at 06:38:04 each logged two `AppID 480 adding PID` lines, removed ~2 s later. These paths are not behind `macSteamPathEnabled()`, so every native install/uninstall with Mac Steam running flashes Spacewar briefly. The fix direction below covers both.

## Root cause (confirmed live 2026-11-16, debug session mac-helper-spacewar-480)

`meta/buildSteamBridgeShims.ts` staged `steam_appid.txt`=480 beside the built helper (finding #4,
Phase 24). steamclient reads `steam_appid.txt` from the helper EXECUTABLE's directory, so every
steamclient-only mode registered with Mac Steam as AppID 480. A/B with an identical binary and
cwd: file present gave 1 `AppID 480 adding PID` line; file absent gave 0, for the guard path and for
a full owned-apps run (1140 apps, exit 0). The inference above (first IClientUser IPC call) and the
cwd/env theories were wrong; the file was the trigger.

## Fix

- The build no longer stages `steam_appid.txt` next to the helper, and removes a stale copy
  (`removeStaleSteamAppId`). Bridge mode never needed it: since Phase 51 the helper writes its own
  per-appId `steam_appid.txt` into its cwd (`ensure_steam_appid_file`), and `helperSpawn.ts` gives
  identity-only mode its own cwd file. The beside-binary 480 could only shadow a real game AppID.
- `macSteamPathEnabled()` is now on by default; `GAMELIB_STEAM_MAC_PATH=off` opts out. CLAUDE.md updated.

## UAT (2026-11-17, passed)

Rebuilt helper (07:24, no `steam_appid.txt` beside it), Mac Steam running (pid 70071). `gamelib.log`:
Refresh 07:25:46 `Steam Refresh: Mac Steam path ok games=398 demos=11 (no CM logon)`; UninstallApp
07:26:14 and 07:29:28 (`Steam UninstallApp accepted appId 264160`, WazHack); InstallApp adoption
07:29:46 `Steam adopted appId 264160 via InstallApp without a restart` (experimental InstallApp
setting on; the 07:26 install ran with it off and only recorded a pending adoption).
`gameprocess_log.txt`: 0 `AppID 480` lines after the deliberate control probe at 2026-11-16 12:37:39.
Friends: not separately reported by the operator; it is driven by the same tracked-process entries,
none of which were added.

## History: mitigation (superseded)

The Mac path was set **off by default** (`3b7417c05`) while this was open. Spacewar 480 is also
filtered out of the Mac-path owned games (`SDK_TEST_APPS`, c8a33e304).
