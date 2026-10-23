---
created: 2026-10-22
title: "Wine/CrossOver-launched game windows open behind GameLib — the user has to click the Dock icon to see them"
source: phase 51-19 live gate item 1 (Avernum 6, 206060, bridge route), packaged debug bundle
area: launch
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/launcher.ts
severity: medium
platform: macos
ready: live-gate
---

Observed 2026-10-22 on Avernum 6 launched through the native Steam bridge
(`GameLibSteamBridge-206060`, CrossOver `winewrapper.exe`):

- Avernum 6 first shows a pre-game settings window. That window does not come to the front. It
  stays behind GameLib, and the operator had to click the game's Dock icon to see it.
- After ticking the launcher's "always open in this mode (and bypass this window)" option, the
  game window itself also opens behind GameLib.

From the user's side, pressing Play appears to do nothing. The game is running (bottleProcessMonitor
matched `Avernum 6.exe`), but it is not visible.

Not yet established: whether this affects only the bridge route or every Wine/CrossOver launch
(the bottled-Steam `GameLibSteam` path, and sideloaded Wine games), and whether it is GameLib
keeping focus or wine not activating its app.

Fix directions to try:
- After the game process is matched, activate the wine app, for example with
  `osascript -e 'tell application "System Events" to set frontmost of (first process whose unix id is <pid>) to true'`
  or `NSRunningApplication.activate` on the wine pid.
- Or have GameLib give up focus, or minimise / hide itself, on launch. Heroic's "minimise on
  launch" setting is a precedent; check whether GameLib's copy works under Tauri.

## Closed 2026-10-24

Fixed by quick task 261024-g3m (`9dfa1631d`, `7ada31352`): `raiseWineGameWindow` runs on the
monitor's first match. Live-checked on the packaged debug bundle: Play on Avernum 6 (206060), bridge
route, brought the window to the front without a Dock click. The sidecar logged
`raiseWineGameWindow [bridge:206060]: raised (Avernum 6.exe pid=40916)`. An earlier failed check
ran a sidecar bundle built before the fix (`build/main/sidecar.js` at 11:19, fix committed at 11:41).

Not live-checked: the bottled-Steam route (same hook) and the sideloaded Wine name-based raise.
