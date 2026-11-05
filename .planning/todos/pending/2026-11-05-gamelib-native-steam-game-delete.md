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
ready: human
---

## Problem

GameLib can download Steam games itself ("Download Steam games directly in
GameLib"), but uninstalling still goes through Steam (`steam://uninstall/<appId>`).
That makes uninstall depend on Steam's state:

- A signed-out Steam silently drops the request, and GameLib sits on
  Uninstalling (261105-ord gate, 2026-11-05 22:18:13; see
  `.planning/todos/pending/2026-11-05-steam-uninstall-silently-dropped-when-signed-out.md`).
- It raises Steam's window and confirmation dialog.

GameLib already deletes a game itself in one narrow case.
`uninstallUnadoptedMacNativeDirectly()` (games.ts ~6581) removes a GameLib
install that the running Steam never adopted (log, 22:16:08: `removing it
directly instead of steam://uninstall`). There is no general GameLib delete.

## Solution (to discuss)

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
