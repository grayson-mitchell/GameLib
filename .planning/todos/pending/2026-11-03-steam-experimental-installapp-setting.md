---
created: 2026-11-03T07:36:38.005Z
title: "Add setting to use Steam Experimental InstallApp Feature"
area: steam-install
files:
  - src/backend/storeManagers/steam/nativeInstallSetting.ts
  - src/backend/storeManagers/steam/games.ts:2035
  - src/backend/storeManagers/steam/macSteamAdoption.ts
  - native/steam-bridge/helper/bridge_helper.c
  - .planning/spikes/065-steamclient-installapp/README.md
  - .planning/spikes/066-steamclient-register-install/README.md
severity: medium
platform: macos
ready: live-gate
---

## Problem

Both native-Steam install routes on macOS have a visible-UI cost today:

- **GameLib-as-downloader OFF** (`enableSteamNativeInstall` false): `install()` hands off with
  `steam://install/<appId>` (`games.ts` ~2035), which always raises Steam's main window plus
  the install dialog. Every alternative was live-tested and ruled out on 2026-11-03: open `-g`,
  `steam://nav/games/details`, a `-silent` cold start, and Steam hidden in the menu bar.
  See `.planning/debug/resolved/steam-install-opens-main-window.md`.
- **GameLib-as-downloader ON**: a running Steam never notices a GameLib-written appmanifest.
  `macSteamAdoption.ts` therefore quits and relaunches Steam on Play (quick 261029-ji2).

Spikes 065 and 066 found one internal call that fixes both. From a separate native process,
`dlopen` the user's own `steamclient.dylib`, then `CreateInterface("CLIENTENGINE_INTERFACE_VERSION005")`
→ `CreateSteamPipe` → `ConnectToGlobalUser` → `GetIClientAppManager` → `InstallApp(appId, folderIndex, false)`:

- 065: app not on disk → Steam downloads it with **no window and no dialog** (TF2 440).
- 066: complete files plus an ACF Steam has not loaded → Steam validates, logs
  `Found 171 pre-existing matching files`, downloads nothing and is **Fully Installed in ~2 s,
  with no restart and no window** (just a toast). WazHack 264160.

This is undocumented Valve-internal API, so it ships behind an opt-in **"Steam Experimental
InstallApp Feature"** setting (default OFF), with today's behaviour as the fallback.

## Solution

1. **Setting:** a new GlobalConfig key (e.g. `steamExperimentalInstallApp`, default `false`)
   with a frontend toggle next to `EnableSteamNativeInstall.tsx` and an (i) help icon on the
   label line. Copy should say it uses an undocumented Steam interface and falls back
   automatically. Read it through one accessor beside `isSteamNativeInstallEnabled()`.
2. **Native caller:** host it in the bridge helper (or a small sibling native binary). Resolve at
   runtime and **never hard-code slots**: the engine getter by RTTI name
   (`IClientAppManagerMap`), `InstallApp` by its proxy's IPC function-ID high half (`0xdd9a`) and
   arg shape. OpenSteamClient's header indices were already wrong for the 2026-10-22 Steam build
   (engine slot 43 not 45; app-manager methods shifted from slot 8). If verification fails,
   report "unavailable" and the caller uses the existing path.
3. **OFF route:** setting ON → `InstallApp` instead of `steam://install`. Keep ACF polling for
   progress.
4. **ON route:** after GameLib's depot download completes, call `InstallApp` so Steam adopts it,
   instead of recording a restart-on-Play in `macSteamAdoption.ts`. Steam's validation also
   re-fetches any file GameLib wrote wrong (cf. the XCOM 1026 cross-depot session).
5. **Library folder:** map GameLib's chosen library to Steam's folder index
   (`GetNumLibraryFolders` / `GetLibraryFolderPath`, slots 75/76 in 066's `slotmap.txt`). Only
   index 0 has been tested.
6. **Lost confirmations:** with no Steam dialog, GameLib's install modal owns disk-space and
   folder checks.

## Live gate (the test the operator asked to run as part of this todo)

- Fresh install, setting ON + downloader OFF: no Steam window, game downloads, Downloads view
  tracks it.
- **066 re-run on a real GameLib-downloader install** (GameLib-written ACF, not Steam's).
  Include one multi-depot title (XCOM 200510) and one non-default library folder.
- Steam not running, and signed out → clean fallback, no crash.
- Unowned or bad appId → EAppUpdateError surfaced, not swallowed.
- Setting OFF → behaviour byte-identical to today.
- Windows/Linux are out of scope until verified the same way. Keep the setting macOS-only, or
  split them into their own todo.
