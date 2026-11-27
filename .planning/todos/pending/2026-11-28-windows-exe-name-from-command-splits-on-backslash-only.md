---
created: 2026-11-28T00:00:00.000Z
title: 'windowsExeNameFromCommand splits on a backslash only and cuts at the first .exe'
area: launch
severity: minor
platform: any
ready: code
found_by: 'Phase 88.3 (recorded as D-20 candidate 8 by 88.3-02, copied as recorded by plan 88.3-13; case: wineWindowRaise--winewindowraise-windowsexenamefromcommand (golden window_raise)).'
files:
  - src/backend/utils/wineWindowRaise.ts
  - src/backend/storeManagers/steam/bottleProcessMonitor.ts
  - src-tauri/crates/gamelib-launch/src/raise.rs
---

## Problem

`windowsExeNameFromCommand` takes the text after the last backslash, so `D:/Games/Forward/Slash.exe` answers the whole path; it cuts at the first `.exe`, so `C:\a\b.exe.bak` answers `b.exe` and `run.exe other.exe` answers `run.exe`. The bottle monitor uses the answer as a process name for the raise fallback, so a forward-slash command falls back to a name that matches no process. Copied as recorded in `raise::windows_exe_name_from_command`.

## Fix

Split on both separators, and cut at the `.exe` that ends the program path (the one followed by a space or the end) rather than the first.
