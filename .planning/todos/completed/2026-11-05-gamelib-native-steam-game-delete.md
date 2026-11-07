---
created: 2026-11-05T22:45:00.000Z
title: "Add GameLib-side delete for Steam games (uninstall without handing off to Steam)"
area: steam-install
files:
  - src/backend/storeManagers/steam/games.ts (uninstall; uninstallUnadoptedMacNativeDirectly ~6581)
  - src/backend/storeManagers/steam/library.ts (startUninstallPolling ~3957)
  - src/frontend/screens/Settings/components/EnableSteamNativeInstall.tsx
severity: minor
platform: macos
ready: live-gate
---

## Problem

GameLib can download Steam games itself ("Download Steam games directly in
GameLib"), but uninstalling still goes through Steam (`steam://uninstall/<appId>`).
That makes uninstall depend on Steam's state:

- A signed-out Steam silently drops the request, and GameLib sits on
  Uninstalling (261105-ord gate, 2026-11-05 22:18:13; see
  `.planning/todos/completed/2026-11-05-steam-uninstall-silently-dropped-when-signed-out.md`).
- It raises Steam's window and confirmation dialog.

GameLib already deletes a game itself in one narrow case.
`uninstallUnadoptedMacNativeDirectly()` (games.ts ~6581) removes a GameLib
install that the running Steam never adopted (log, 22:16:08: `removing it
directly instead of steam://uninstall`). There is no general GameLib delete.

## Solution (original options — superseded by "Decided" below)

Add a GameLib delete path for Steam games. It removes the install folder and
`appmanifest_<appId>.acf` (and any workshop/shadercache leftovers decided on)
without going through Steam. Points to settle:

- **Trigger:** always when the downloader setting is on, a separate setting,
  or a "Delete files in GameLib" choice in the uninstall dialog next to
  "Uninstall with Steam".
- **Running Steam:** a running Steam that has loaded the manifest keeps the
  app in memory. Decide whether to ask Steam to rescan, or accept that Steam
  shows the game as not installed / Files Missing until its next scan. The
  InstallApp `UninstallApp` neighbour (slot after InstallApp in the helper's
  method map) is a candidate for a headless Steam-side uninstall.
- **Safety:** only delete paths inside a registered Steam library, resolved
  from the ACF `installdir`. Never follow an installdir that escapes the
  library. Refuse while the game is running.
- **Cloud saves:** deleting locally does not touch Steam Cloud. Confirm that
  is acceptable.

## Spike 067 result (2026-11-06): `UninstallApp` is a silent Steam-side uninstall

`.planning/spikes/067-steamclient-uninstallapp/README.md`. Tested on macOS with WazHack 264160,
same steamclient build as the InstallApp helper (slot 1, function-ID high half `0x4505`):

- **Signed in:** returns 0. Within 1 s Steam deletes `common/WazHack`, the ACF and the Workshop
  content, and reports state 1 and `finished uninstall (No Error)`. No window, no confirmation
  dialog, no toast seen. Steam updates its own state, so the "Running Steam" point above is
  moot on this route.
- **Signed out (login screen):** returns **18 `k_EAppErrorNotInstalled` synchronously** and
  deletes nothing. GameLib gets a definite failure instead of sticking on Uninstalling. 18 also
  means "not installed", so check `GetNumInstalledApps` (0 when signed out) to tell the two
  apart.

This suggests a route for the Trigger decision: with the InstallApp setting on, uninstall
through `UninstallApp` first. On 18 while signed out, or on helper verification failure, fall
back to GameLib's own file delete (this todo) or `steam://uninstall`. GameLib's uninstall dialog
becomes the only confirmation, so it must refuse while the game is running.

## Decided (operator, 2026-11-06): a "Delete Steam games directly in GameLib" setting

This settles the Trigger, Running Steam and Cloud saves points above. Safety stands as written.

**Setting:** "Delete Steam games directly in GameLib". It is a separate GlobalConfig key, not a
side effect of the InstallApp setting, because delete is the riskier action and a user may want
silent installs with Steam-confirmed deletes. It sits beside `EnableSteamNativeInstall.tsx`, with
an (i) help icon on the label line, and is read through one backend accessor beside
`isSteamNativeInstallEnabled()`.

- **Default:** follows "Download Steam games directly in GameLib". It is ON when that setting is
  ON (GameLib owns those installs) and OFF otherwise. An explicit user choice is persisted and
  respected.
- **Not labelled experimental.** Step 2 below is GameLib's own code. `UninstallApp` is the
  preferred path, not a requirement.

**OFF:** today's behaviour, `steam://uninstall/<appId>` (Steam window and confirm dialog).

**ON:** GameLib performs the uninstall with no Steam UI and GameLib's own confirmation:

1. **Steam running and signed in:** `UninstallApp(appId)` through the bridge helper's
   runtime-verified method map (spike 067). Steam deletes the install dir, the ACF and the
   Workshop content and updates its own state.
2. **Fallback:** used when Steam is signed out (`GetNumInstalledApps` 0, `UninstallApp` → 18),
   not running, or the helper's slot verification fails. GameLib deletes the install folder and
   `appmanifest_<appId>.acf` itself, only inside a registered Steam library, resolved from the
   ACF `installdir` and never following one that escapes it. Steam picks up the change at its
   next start. This generalises `uninstallUnadoptedMacNativeDirectly()`.
3. **Always:** refuse while the game is running. The confirm dialog names the game and the space
   freed, and states that Steam Cloud saves are not touched.

**Cloud saves:** local delete only; Steam Cloud is untouched. Accepted.

**Live gate:**

- ON, signed in → `UninstallApp` path, no Steam UI, Steam shows not installed.
- ON, signed out → fallback deletes the files and the tile clears. After sign-in, Steam shows not
  installed.
- ON, Steam not running → fallback. On Steam start, no "Files Missing" ghost entry.
- ON, game running → refused with a message.
- ON, a GameLib download Steam never adopted → fallback (expect `UninstallApp` 18).
- Non-default library folder, both paths.
- OFF → byte-identical to today.

## Resolution

Closed 2026-11-08. Built in quick 261106-s3n; live-gate check D defects fixed in quick 261107-td5.
Live gate run by the operator on macOS arm64 with WazHack 264160 (log `~/Library/Logs/GameLib/gamelib.log`):

- ON, signed in: pass. `Steam UninstallApp accepted` (11-07 20:48:50), no Steam UI, Steam shows not installed.
  The first attempt fell back (`helper-failed`) because `public/bin` held a helper built before the
  subcommand existed; `pnpm build-steam-bridge` fixed it.
- ON, signed out: pass. The helper reports `not-signed-in` before calling UninstallApp (no error-18
  line), then GameLib deletes the files.
- ON, Steam not running: pass. `steam-not-running` fallback; no Files Missing entry on Steam start.
- ON, game running: pass after 261107-td5. The first run showed `registry.vdf` has no `RunningAppID`
  on this Mac, Steam's error 16 was the only guard, the refusal deleted the game's GameLib
  settings/logs, and its OS notification went unseen. Re-run (11-08 06:10:29): folder process check
  refuses, settings kept, in-app toast.
- ON, unadopted GameLib download: not reachable through the UI. With experimental InstallApp off,
  the install waits at the restart-Steam blocker with no uninstall; with it on, Steam adopts the
  install and UninstallApp succeeds (11-08 07:18:26). The fallback stays covered by unit tests and
  the signed-out / not-running checks.
- Non-default library (`/Volumes/Untitled/SteamLibrary`): pass on both routes (07:31:06 UninstallApp,
  07:34:33 fallback deleting only `common/WazHack`).
- OFF: pass. `delegating uninstall … via steam://uninstall/264160` (07:37:38), Steam's dialog.

Left open: the `Failed to remove …` returns (caught rm error, possible partial delete) still run the
uninstaller's settings cleanup (261107-td5 SUMMARY).
