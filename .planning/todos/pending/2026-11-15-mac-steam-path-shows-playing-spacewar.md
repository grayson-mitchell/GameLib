---
created: 2026-11-15T00:00:00Z
title: 'Mac Steam owned-apps helper makes Friends show "playing Spacewar" (AppID 480); Mac path is off until fixed'
area: steam-library
severity: medium
platform: macos
ready: blocked
needs: operator-permission-for-live-steamclient-probing
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

## Mitigation in place

The Mac path is now **off by default**: `macSteamPathEnabled()` in `macSteamPathFlag.ts`, where `GAMELIB_STEAM_MAC_PATH=on` opts in. Refresh on macOS takes the Rust CM path, which UAT-B item 13 showed keeps Friends signed in (unwrapped). Spacewar 480 is also filtered out of the Mac-path owned games (`SDK_TEST_APPS`, c8a33e304).

## Direction

1. **Bisect.** Probe `BLoggedOn`, `GetSteamID` and `GetSubscribedApps` one at a time against live Mac Steam, watching `gameprocess_log.txt` after each.
2. **Try clearing the app ID.** Before the first IPC call, try an IClientUtils `SetAppIDForCurrentPipe(0, false)`-style call (resolve the slot the way spike 084 resolved `GetSubscribedApps`).
3. **Fallback.** If 480 can't be avoided, the shortest tracked window, or get the owned list in a way that doesn't touch IClientUser.
4. **Then re-enable.** Flip the default on and re-run UAT-B item 14.

**Blocked:** live probing of the running Steam client was denied by the permission classifier. The operator has to allow it in the permission system (a Bash rule for building and running the scratchpad probes), or run the probes themselves.
