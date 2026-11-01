---
created: 2026-11-02
title: "D-UAT-17: Windows guided Steam install never opens SteamSetup.exe (spawn EACCES) while GameLib reports it started"
source: Phase 21 UAT 4a, Windows client-setup pass 2026-11-02 (21-UAT.md)
area: steam
files:
  - src/backend/storeManagers/steam/clientSetup.ts
  - src/backend/storeManagers/steam/__tests__/clientSetup.test.ts
  - src/frontend/screens/Game/GamePage/components/SteamClientSetup.tsx
  - .planning/milestones/v0.7-phases/21-steam-native-install/21-UAT.md
severity: major
platform: windows
ready: live-gate
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

## Code landed (quick 261102-0yc)

Commit: 3f0df053c.

On Windows, `SteamSetup.exe` now launches through powershell `Start-Process -FilePath '<path>' -Verb
RunAs -ErrorAction Stop`: no wait switch, no installer arguments and no silent flag, so T-21-20
holds and Valve's installer window stays visible. GameLib awaits that launcher, not the installer.
Exit 0 logs "launched" and returns `started`. A declined UAC prompt or a failed spawn logs an error
and returns status `error`, so the banner shows "Steam setup could not start: The Steam installer did
not open (...)" with Try again. macOS awaits `open` the same way. Linux is unchanged. The frontend did
not change.

Why PowerShell RunAs and not the `openUrlOrFile` or `cmd /c start ""` routes suggested above: it is
the repo's existing elevation path (`gog/setup.ts` `runSetupCommand` and the gog uninstall), and it
exits non-zero when UAC is declined, which is the launch outcome the fix needs.

Two known edges, recorded and not handled:

- The Rust shell's 60s sidecar invoke bound (`INVOKE_TIMEOUT`) now covers the download plus the UAC
  answer. A UAC prompt left open past that shows the error phase while the prompt is still up, and
  Try again recovers.
- A launch failure keeps the cached `steam_store\redist\SteamSetup.exe` under GameLib's user-data
  folder. A corrupt cached copy would fail each retry until it is deleted by hand.

Operator live gate (NOT yet run; this todo stays pending until it passes). Use a GameLib build that
contains the commit and the Test recipe in
`.planning/todos/completed/2026-10-16-phase-21-native-install-uat-deferred-to-windows.md` (empty
Default Steam path) to re-run UAT 4a on the Windows box. Check:

- After consent, a UAC prompt appears for SteamSetup.exe, with no PowerShell console window behind it.
- Answering Yes opens Valve's installer window visibly. The banner reads "Installing the Steam
  client", and gamelib.log has the "launched" line.
- Answering No moves the banner to the error message with Try again, and gamelib.log has the
  startGuidedClientInstall error with exit code 1. Try again prompts again.
- Record the result on item 4a in `.planning/milestones/v0.7-phases/21-steam-native-install/21-UAT.md`,
  then move this todo to completed.
