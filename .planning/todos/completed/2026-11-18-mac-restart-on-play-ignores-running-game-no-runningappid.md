---
created: 2026-11-18T00:00:00.000Z
title: 'Mac restart-on-Play restarts Steam under a running game: registry.vdf has no RunningAppID'
area: steam
severity: major
platform: macos
ready: live-gate
files:
  - src/backend/storeManagers/steam/macSteamAdoption.ts
  - src/backend/storeManagers/steam/library/runningPoll.ts
  - src/backend/storeManagers/steam/steamLaunchWatch.ts
---

## Problem

Phase 81 live gate, item 5 (`81-HUMAN-UAT.md`, launch L1, 2026-11-18): with Avadon
(112100) running in Steam, Play on the pending Avernum: Escape from the Pit (208400)
restarted Steam anyway. gamelib.log shows `[Steam] fired steam://exit to adopt 208400 on
restart` and `[Steam] Steam exited after 12956 ms; relaunching 208400` (Steam waited for
the running game, then quit). There was no `[Steam] not restarting Steam for 208400: game
<id> is running` line, so the refusal notice and its "Launch without Steam" action
(81-07, D-05) are unreachable on Mac.

Cause: `restartSteamForAdoption` (`macSteamAdoption.ts`) refuses only when
`deps.readRunningAppId()` is non-zero, and on Mac that is `readMacRunningAppId`
(`library/runningPoll.ts`), the Rust `registry.vdf` probe. Mac Steam's `registry.vdf`
carries no RunningAppID: the file was 615 bytes with both games running at the gate, and
the same was measured on 2026-11-11 (WazHack 264160; see the header comment of
`steamLaunchWatch.ts`). So the probe answers 0 on Mac every time. Unit tests passed
because they stub `readRunningAppId`.

The same reader also guards "Restart Steam now" (item 4) and the uninstall path
(`gameUninstall.ts`, `readRunningAppIdOrThrow`), so those guards are blind on Mac too.

Evidence: `/tmp/gamelib-gate-20261118T063108Z/gamelib-launch-1.log` (21:05:23 and
21:05:36 local) on the operator's Mac; not committed.

## Direction

Give Mac another "a game is running in Steam" signal for the restart refusal. Candidate:
a process scan for any process whose executable lives under a `steamapps/common/` folder
of any Steam library, the same `ps`-based matching `SteamGame.watch`
(`steamLaunchWatch.ts`) already uses for a single install folder. The helper
(`steam-bridge-helper`) may also be able to read the running app from the live client;
check before adding a scan. Keep the Windows/Linux path on RunningAppID, which works there.

Verify live on the Mac: re-run item 5 of `81-HUMAN-UAT.md` (refusal notice, "Launch
without Steam", Steam not quit) and confirm item 4's refusal while a game runs.

## Resolution

Fixed by quick 261118-uma (`41f68fc03`, `e70d022f3`): on macOS the running game is read from the process table instead of registry.vdf. Live re-run 2026-11-18 passed: with Avadon 112100 running, Play and "Restart Steam now" on 211820 were refused (`[Steam] not restarting Steam for 211820: game 112100 is running`), Steam's pid was unchanged, and "Launch without Steam" started the game once and kept the record pending.
