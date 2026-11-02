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
ready: live-gate
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

## Fix (quick 261102-dkw, 2026-11-02) — awaiting the Windows live gate

- `1e6e50894` `games.ts`: the delegated branch calls `ensureSteamClientReady` before building the
  hand-off. `needs-install` / `needs-launch` (no `error`) → `{ status: 'done', deferredToSetup: true }`,
  so the D-10/D-11 guided setup owns what happens next and no poller or finished entry is created;
  a reported `error` → install error. Covers defects 1 and 3 for the no-client case.
- `89f257ede` `src-tauri/src/main.rs`: the sidecar's fire-and-forget `openExternal` frame is opened
  on a worker thread. It used to run inline in the only loop that reads sidecar stdout, so a
  blocking OS dialog parked every invoke response (defect 2).
- `40a465f50` `EnableSteamNativeInstall.tsx` + `translation.json`: macOS keeps
  `help.steam_native_install`; Windows/Linux show `help.steam_native_install_other` ("When off,
  GameLib hands installs to the Steam client.").

Not changed: a failed `openExternal` with a client present is still not reported back (the frame
is fire-and-forget); with the client gate this needs a broken `steam://` registration to arm.

Tests: games.test.ts + library.test.ts + macArchKnownFixRouting.test.ts — 5 new D-UAT-19 cases pass;
the 19 failures are the identical pre-existing Windows path-separator set at HEAD. hardcodedStringGate
176/176; tsc clean; cargo check clean.

Live gate (Windows): Settings → turn OFF "Download Steam games directly in GameLib"; Default Steam
path = an empty folder; Install a Steam game → the D-10 consent dialog appears, with no Windows
"application not found" error, no `sidecar invoke timed out`, and the game not left "installing".

## Resolution (live gate passed 2026-11-02, real Windows)

Native install OFF, Default Steam path an empty folder, Install on appId 332380: the D-10
install-Steam dialog appeared (operator: pass). `gamelib.log` 18:01:55 shows
`ensureSteamClientReady: Steam client not installed` followed by `SteamGame: appId 332380 Steam client
not ready (needs-install) — guided setup requested, deferring steam://install hand-off`. No
`delegating install` line followed, so no `steam://` link was opened, and no invoke timed out.
Recorded on the D-UAT-19 finding in 21-UAT.md.
