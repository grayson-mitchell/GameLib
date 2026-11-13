---
created: 2026-11-13T00:00:00.000Z
title: 'raiseWineGameWindow finds no matching process for a running bridged Core Keeper'
area: steam
severity: minor
platform: macos
ready: live-gate
source: 'side finding from the live re-verify of the closed SteamInventory_v003 todo (2026-11-13 21:33 NZDT, gamelib.log line 223)'
files:
  - src/backend/utils/wineWindowRaise.ts:149
---

At 21:33:28 the log showed
`raiseWineGameWindow [bridge:1621690]: no matching process after 12 attempts (pids=14888,14897 names=CoreKeeper.exe,UnityCrashHandler64.exe)`.
Pid 14888 was the live `CoreKeeper.exe` (confirmed with `pgrep` at 21:34). So the raiser had the
right pid and name, but the osascript raise script still answered `none` on all 12 attempts.

Hypothesis, not yet checked: the AppleScript cannot match the CrossOver/Wine process in
System Events by unix id or by `.exe` name. That could happen if the window is owned by a
different process, such as a wineloader or a CrossOver-named app. It could also happen if the
window did not exist yet when the attempts ran out.

Impact: the game window may not come to the front at launch. It is not known whether the
operator saw that happen on this run.

Check: while Core Keeper is running, run the `RAISE_SCRIPT` logic by hand and list the System
Events processes with their unix ids. Then compare the result with another bridged title where
the raise succeeds.
