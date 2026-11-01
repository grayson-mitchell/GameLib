---
created: 2026-11-02
title: "D-UAT-17: Windows guided Steam install never opens SteamSetup.exe (spawn EACCES) while GameLib reports it started"
source: Phase 21 UAT 4a, Windows client-setup pass 2026-11-02 (21-UAT.md)
area: steam
files:
  - src/backend/storeManagers/steam/clientSetup.ts
  - src/frontend/screens/Game/GamePage/components/SteamClientSetup.tsx
  - .planning/milestones/v0.7-phases/21-steam-native-install/21-UAT.md
severity: major
platform: windows
ready: code
---

On consent, `startGuidedClientInstall()` downloads `SteamSetup.exe` and runs `spawnAsync(destPath, [])`.
The installer asks for elevation; a plain CreateProcess spawn fails with `EACCES` instead of raising
UAC, so nothing opens (`gamelib.log` 00:18:58, appId 333300). The spawn is fire-and-forget, so
`{ status: 'started' }` and the "launched" log line come back first and the banner says "Installing
the Steam client" with nothing behind it.

Fix both halves: launch through a ShellExecute-style path that raises UAC (e.g. the existing
`openUrlOrFile` / shell open seam, or `cmd /c start ""`), and wait for the launch outcome (not the
installer's exit) before returning `started`, so a failed launch reaches the error phase. Re-verify 4a
live with the 261101-whs recipe (empty Default Steam path).
