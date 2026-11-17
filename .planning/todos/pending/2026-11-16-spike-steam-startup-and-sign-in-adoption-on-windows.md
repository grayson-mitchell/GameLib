---
created: 2026-11-16T06:39:55.709Z
title: "Spike (Windows): does Steam adopt a GameLib-written ACF at startup and at sign-in?"
area: steam-install
files:
  - src/backend/storeManagers/steam/macSteamAdoption.ts (restart-on-Play, macOS only)
  - src-tauri/crates/gamelib-steampoll/src/hold.rs (D-UAT-13 hold, all OSes)
  - .planning/spikes/083-adoption-signal-without-restart/README.md (macOS sign-in rescan)
  - .planning/spikes/001-acf-adoption/README.md
  - .planning/spikes/003-stateflags4-full-ownership/README.md
  - .planning/spikes/047-running-steam-adoption/README.md (steam://install needs a click)
severity: medium
platform: windows
ready: human
---

## Problem

Phase 81 (unify the restart hold into restart-on-Play) must run this before
`/gsd-plan-phase 81` (81-CONTEXT D-14). It decides whether Windows gets restart-on-Play or
the simplified in-memory hold (D-15). Every adoption spike so far ran on macOS only:

- 001/003: Steam adopts a GameLib ACF when it starts.
- 047/048: `steam://install` needs a click, so it is out. Do not re-spike it.
- 083: sign-in reloads every `appmanifest_*.acf`.

Split from the combined Windows/Linux todo on 2026-11-17. Linux is
`2026-11-17-spike-steam-startup-and-sign-in-adoption-on-linux.md`. An optional early signal
from the Mac's bottled Windows Steam is
`2026-11-17-spike-bottled-windows-steam-adoption-rehearsal.md`; it does not replace this run.

## Questions (real Windows, native Steam)

1. **Startup.** Steam is not running. GameLib writes a StateFlags 4 ACF plus the files, then
   Steam starts. Is the game Installed with no dialog, no verify and no download? (macOS: yes,
   001/003)
2. **Running.** Steam is running and signed in when GameLib writes the ACF. Does Steam stay
   unaware until it restarts? (macOS: yes, 047a passive control)
3. **Sign-in.** Steam is running but signed out when GameLib writes the ACF, and the operator
   then signs in. Does sign-in reload the manifests and adopt the game? (macOS: yes, 083)
4. **Evidence.** What can GameLib read without the bridge helper? Candidates:
   - a content_log `Loaded N apps from install folder <path>` line after the write time;
   - Steam rewriting the ACF;
   - HKCU `Software\Valve\Steam\Apps\<id>\Installed`.
5. **Restart.** Does `steam://exit` then `steam://rungameid/<id>` behave as on macOS: Steam
   quits gracefully, then relaunches with the game? And what relaunches Steam alone, with no
   game and no dialog, for "Restart Steam now"?

## Solution

Reuse the 083/047 probe shape on a small game. The oracles are content_log, the ACF's mtime
and StateFlags, the HKCU Apps key and the Steam PID. No GPU is needed, because the spike
only watches Steam's library state.

A NO on question 1 or 5 means Windows keeps the simplified hold. Record the result in a
spike README and in 81-CONTEXT D-14.
