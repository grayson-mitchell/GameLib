---
created: 2026-11-07T22:07:24.534Z
title: "Launch without Steam: run Steam games that don't use the Steam API directly, like Epic's offline launch"
area: launch
files:
  - src/backend/storeManagers/steam/bridge/importScan.ts (scanSteamApiImports ~59)
  - src/backend/storeManagers/steam/bridge/shimDrmWrapper.ts (detectDrmWrapper ~24, detectExeSteamDrm ~99)
  - src/backend/storeManagers/steam/drmKnownFix.ts (curated CEG list)
  - src/backend/storeManagers/steam/launchDispatch.ts (single Steam launch dispatch)
severity: minor
platform: macos
ready: live-gate
---

## Problem

Every Steam launch in GameLib needs the Steam app. Mac-native and Linux titles go through
`steam://rungameid`. Bridge games run in GameLib's bottle but forward Steam calls to the running
Mac Steam. Epic (legendary) can launch a game offline without its client. Steam has no such
option: Steam's own "offline mode" still needs the client running.

Raised by the operator 2026-11-08 while building the "Steam Lib Actions" table. Launch is the
row with no option to remove the Steam dependency.

What can work depends on whether the game uses the Steam API, not only on whether it has DRM:

| Kind of game | Launch without Steam? |
| --- | --- |
| Doesn't use the Steam API (no `steam_api` / `libsteam_api`, no Steam DRM wrapper) | Yes: run the program directly |
| No DRM, but uses the Steam API | Depends on the game. `SteamAPI_Init` fails without Steam: some games keep running without Steam features, many quit, many relaunch through Steam (`SteamAPI_RestartAppIfNecessary`) |
| Steam DRM (SteamStub, CEG) | No |

## Solution

A "Launch without Steam" option, shown only when GameLib can tell the game qualifies.

- **Detection (reuse what exists):** the bridge already scans programs for `steam_api` imports
  (`importScan.ts`), detects SteamStub (`shimDrmWrapper.ts`), and keeps a curated CEG list
  (`drmKnownFix.ts`). Today that only runs for bridge (Windows PE) games. Mac-native games need a
  Mach-O version: `libsteam_api.dylib` in the bundle, or a link to it (`otool -L`). Cache the
  verdict per install, and redo it when the install changes (buildid/manifest GID).
- **Eligible:** no Steam API and no DRM wrapper → offer it. Optionally add a curated allowlist of
  Steam-API games confirmed (live) to keep running when `SteamAPI_Init` fails, recorded the same
  way as the known-fixes data.
- **Launch:** run the game's program directly: Mac-native natively, Windows games in their bridge
  bottle without the bridge forwarding. Use the ACF/appinfo launch config for the executable and
  arguments. GameLib owns the process, so Stop works (see
  `2026-11-07-stop-steam-launched-games-by-pid.md`).
- **What you lose, said in the UI:** no Steam Cloud sync, playtime, achievements or overlay for
  that session.
- **Boundary (do not cross):** never replace `steam_api` with an emulator (Goldberg-style) to get
  Steam-API games running without Steam. That bypasses Steam's ownership check and is outside the
  DRM boundary already set (genuine Valve DLLs plus the export trampoline only). Games that need
  Steam stay on the Steam launch.

Live gate: pick at least one game from each row of the table above. Check the option appears
only for eligible games and that an eligible game launches with Steam fully quit. For a Steam-API
game, record whether it keeps running, quits, or relaunches through Steam.

## Resolution (quick 261117-p38) — superseded by q1t below

Shipped (macOS only; Mac-native and bridge installs):

- Detection reuses the bridge's PE import scan, SteamStub / CEG detection, the runtime
  `steam_api(64).dll` walk and the curated `drm: "ceg"` known fix. Mac-native games get a new
  in-process Mach-O reader (`directLaunch/machoSteamApi.ts`: thin 32/64-bit, fat, fat64 load
  commands) plus a bounded walk for `libsteam_api.dylib` / `steam_api.bundle`. Unreadable fails
  closed ("unknown").
- The verdict is cached per appId and keyed on buildid + install path + install kind.
- Two launch paths: Mac-native runs its own Mach-O binary with the PICS arguments, tracked so Stop
  ends it; bridge games run in their own bottle with no shim, no helper, no overlay and no
  steamclient-layer DRM mode. The sidecar re-derives the verdict at launch.
- Two sidecar channels (`steamDirectLaunchVerdict`, `steamLaunchWithoutSteam`) and a verdict-gated
  "Launch without Steam" sub-menu entry whose confirm names what is lost for the session (Steam
  Cloud, playtime, achievements, overlay).
- Not built: the optional curated allowlist of Steam-API games confirmed to keep running. No
  live-confirmed entry exists to put in it, so Steam-API games stay on the Steam launch.
- Boundary held: nothing writes, copies, replaces or emulates `steam_api`.

## Resolution (quick 261117-q1t)

Reworked into an Epic-style per-game setting (macOS only; Mac-native and bridge installs):

- Game Settings > run tab has a "Launch without Steam" toggle beside the Steam overlay control
  (the Epic offline-mode pattern; setting key `launchWithoutSteam`). Play honours it for every
  Mac-native and bridge game.
- Steam DRM titles (SteamStub, CEG markers, curated `drm: "ceg"`) show the toggle disabled with a
  badge. If the setting was already on and the game is now DRM, Play falls back to the normal
  Steam launch and logs why; the launch never fails because of the setting.
- Steam-API and unchecked ("unknown") games are allowed, with a warning that names what is lost
  (Cloud sync, playtime, achievements, overlay) and that the game may quit, run without Steam
  features, or reopen Steam.
- The sub-menu button, its confirm dialog and the `steamLaunchWithoutSteam` channel are removed;
  `steamDirectLaunchVerdict` stays.
- Boundary held: nothing writes, copies, replaces or emulates `steam_api`.

## Live gate — OWED, not run

Operator, this Mac. Restart `pnpm tauri:dev` first (it does not rebuild the sidecar; check the
`sidecar.js` mtime). Fully quit Steam (confirm no `steam_osx` process) before each launch step.

1. Pick one game per todo table row: (a) no Steam API, no DRM, Mac-native and, if owned, bridge;
   (b) uses the Steam API, no DRM; (c) Steam DRM.
2. Open each game's Settings > run tab: (a) and (b) show an enabled toggle beside the Steam
   overlay control; (c) shows it disabled with the DRM badge. Turning it on for (b) shows the
   yellow warning naming Cloud sync, playtime, achievements and the overlay. The sub-menu no
   longer has "Launch without Steam".
3. Toggle on for (a), press Play: the game runs with Steam quit; Stop ends it.
4. Toggle on for (b), press Play: record whether it keeps running, quits or reopens Steam
   (record only).
5. For (c), if a stored `launchWithoutSteam: true` can be set (for example from before a DRM
   detection), Play launches through Steam and the log has the fallback line.
6. Toggle off: Play uses the normal Steam launch.
7. Update a game (or change its buildid) and reopen its settings: the verdict recompute log line
   appears.

### Live results (2026-11-17, operator)

- Grim Dawn (219990, bridge): toggle disabled for Steam DRM, as expected. The badge row read as
  clutter, so the reason moved behind the label-line (i) (089db50fb).
- WazHack (264160) and Avernum 6 (206060): the toggle was missing at first. The running sidecar
  predated q1t and returned the old `eligible` shape; the toggle showed after a restart.
- WazHack (264160, Mac-native, Unity): row (b), not (a). It ships
  `PlugIns/libsteam_api.bundle` (Facepunch.Steamworks), which the exact-name walk missed, so the
  verdict said `warning none`. Play with the toggle on started the game directly. It reopened
  Steam (steam_osx started 19:15:08 by launchd), and the game then ran under Steam. Outcome:
  **relaunches through Steam**. The walk now matches `(lib)steam_api(64).{dylib,bundle,framework}`
  and the cache is at v3, so WazHack now gets the Steam-API warning.
- Avernum 6 (206060, bridge, row b): toggle on, but Play did the normal bridge launch (shim,
  helper, "Waiting for Steam") and GameLib itself opened Steam. Cause: bridge games read
  per-game settings through `TITLE_AUTHORITATIVE_KEYS`, which lacked `launchWithoutSteam`, so
  Play saw it as off for every bridge game. Key added. The game's own outcome is not yet
  recorded.
- Avernum 6 (206060, bridge, row b), after bbcfb66aa: the direct path ran ("direct launch of
  bridge ... no shim, no helper, no overlay"; Avernum 6.exe started in its bottle). The game
  showed "Steam must be running to play this game (SteamAPI_Init() failed)" and quit. Outcome:
  **quits**.
- Row (a) candidates on this Mac (no steam_api file, no Steam link per otool): Legends of
  Aethereus (248410) and Dead Age 2 (951430). Every other installed Mac-native game ships a
  Steam API.
- Legends of Aethereus (248410): Play did nothing visible. Its Mac binary is i386-only, so every
  spawn failed with EBADARCH (-86); the "could not launch" notification was sent but not seen.
  The verdict now reads each slice's CPU type and does not apply when no slice can run here
  (`mac-arch-unsupported`, toggle hidden); cache v4. Not a row-(a) candidate after all.
- Still to run: Dead Age 2 (951430, universal x86_64+arm64, no Steam API) with Steam quit;
  steps 5-7.
