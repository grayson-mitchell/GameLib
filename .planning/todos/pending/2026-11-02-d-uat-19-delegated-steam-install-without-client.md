---
created: 2026-11-02
title: "D-UAT-19: with native Steam install OFF and no Steam client, Install hands off to steam://, shows a bare Windows error, stalls the shell and leaves a phantom install"
source: Phase 21 UAT, D-UAT-18 Windows re-run 2026-11-02 (21-UAT.md)
area: steam
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/library.ts
  - src/frontend/screens/Settings/components/EnableSteamNativeInstall.tsx
severity: minor
platform: windows
ready: code
---

With `enableSteamNativeInstall: false` and `C:\SteamUAT` (the Default Steam path) empty, Install on
appId 233310 took the delegated branch in `SteamGame.install()` (`games.ts` ~L1945:
`delegating install for appId 233310 via steam://install/233310`, 05:39:02). Three defects followed:

1. No Steam client handles `steam://`, so Windows showed a bare "application not found" error. The
   delegated branch never consults `ensureSteamClientReady`, so the D-10 consent prompt the native
   path shows never appears.
2. While that OS dialog was open, the shell's `openExternal` blocked other invokes: `getGameInfo`,
   `requestGameSettings`, `getPlaytimeFromRunner` and `wake_lock_start` were abandoned after 60 s,
   and the game page showed "sidecar invoke timed out: requestGameSettings". Dismissing the dialog
   logged `openExternal failed: The operation was canceled by the user. (os error 1223)`; that
   failure is not surfaced to the user.
3. The DownloadManager logged `Finished Installation of 233310` for a hand-off that never ran, and
   the delegated ACF poll kept the game "installing" for `DELEGATED_NO_MANIFEST_TICKS` (600 ticks,
   about 30 min) with no cancel control. Only a GameLib restart cleared it.

Also: the setting's help text (`help.steam_native_install`) describes OFF in Mac-only terms ("When
off, Steam installs games that have a Mac version"), which does not fit Windows or Linux.

Likely shape: gate the delegated branch on the client being installed (reuse the D-10 prompt, or a
clear "Steam isn't installed" error); keep `openExternal` from blocking the shell's invoke handling;
treat a failed `openExternal` as an install error (no poll, no finished entry); reword the help text
per platform. Verify on Windows: native install OFF, empty Default Steam path, Install.
