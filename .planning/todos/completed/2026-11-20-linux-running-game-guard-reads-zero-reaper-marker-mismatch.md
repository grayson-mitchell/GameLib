---
created: 2026-11-20T00:00:00.000Z
title: 'Linux running-game guard always reads 0: the reaper marker does not match this Steam build, so Play quits Steam under a running game'
area: steam-adoption
severity: major
platform: linux
ready: code
files:
  - src-tauri/crates/gamelib-steampoll/src/running.rs
  - src-tauri/crates/gamelib-steampoll/tests/running.rs
  - src/backend/storeManagers/steam/macSteamAdoption.ts
---

## Problem

Found during the Phase 81 live gate, item 11(b) on Linux (`81-HUMAN-UAT.md`, 2026-11-20);
the item failed. Native Debian Steam install (`~/.steam/debian-installation`).

With Amnesia (57300) running in Steam, Play on a second pending game (203830) quit Steam
instead of refusing: `gamelib.log` shows `[steampoll] rust steampoll_read_running_app_id`
followed at once by `[Steam] fired steam://exit to adopt 203830 on restart`, with no
`not restarting Steam for ...` line and no refusal notice (D-05, 81-07).

The guard (`restartSteamForAdoption`, `macSteamAdoption.ts`) refuses when the running app id
is non-zero. On Linux that id comes from two sources (`running.rs`, `read_running_app_id`):

1. `RunningAppID` in `~/.steam/registry.vdf`. This Steam's file has no such key at all.
2. `linux_fallback`: a `ps -eo args` scan for the literal `REAPER_MARKER`, defined at
   `running.rs:29` as `"reaper SteamLaunch --AppId "`.

The running game's real process lines (operator-pasted, 2026-11-20) read
`.../steamrt64/reaper SteamLaunch AppId=57300 -- /mnt/.../_v2-entry-point --verb=waitforexitand...`
and `/bin/sh -c .../steam-launch-wrapper -- .../reaper SteamLaunch AppId=57300 -- ...`:
`AppId=` with an equals sign and no `--`. The marker never matches, so the scan reads 0 for
every running game on this Steam build and the guard never refuses.

The unit tests do not catch it: `tests/running.rs:163,176,177` feed the same `--AppId 431960`
and `--AppId 5` strings back to the scan, so they pin the wrong form. Where the original
`--AppId ` form came from (an older Steam build, or a spike) is not verified.

User-visible harm: pressing Play on a pending game while another game runs quits Steam and
ends the running game.

## Direction

Match the form this build emits: `reaper SteamLaunch` followed by `AppId=` (digits), and keep
accepting `--AppId ` and `--AppId=` if an older build used them (decide from what Steam
versions are in use). Parse the digits that follow the first match, as today. Replace the
test fixtures with the real captured line above (appId only; no account data), keep one
fixture per accepted form, and add a negative test for a `reaper` line with no `SteamLaunch`.
Confirm live on Linux: with a game running, Play on a pending second game shows the
refused-restart notice, `gamelib.log` shows `not restarting Steam for <appId>: game <id> is
running`, and the Steam pids are unchanged (`81-HUMAN-UAT.md` item 11(b)).
