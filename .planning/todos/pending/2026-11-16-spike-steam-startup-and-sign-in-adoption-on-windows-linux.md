---
created: 2026-11-16T06:39:55.709Z
title: "Spike: does Steam adopt a GameLib-written ACF at startup and at sign-in on Windows and Linux?"
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

The "unify the restart hold into restart-on-Play" phase (ROADMAP, after Phase 80)
needs to know whether restart-on-Play can be extended from macOS to Windows and Linux.
Every adoption spike so far ran on macOS only: 001/003 (Steam adopts a GameLib ACF when
it starts), 047/048 (`steam://install` — needs a click in Steam's install dialog, so
it is not an option), and 083 (sign-in reloads every `appmanifest_*.acf`; 083 lists
Windows/Linux as "Not tested").

## Questions (each on Windows, then Linux)

1. Steam not running; GameLib writes a StateFlags 4 ACF + files; Steam starts. Is the
   game Installed with no dialog, no verify, no download? (macOS: yes, 001/003)
2. Steam running and signed in; GameLib writes the ACF. Does Steam stay unaware until it
   restarts? (macOS: yes, 047a passive control)
3. Steam running but signed out; GameLib writes the ACF; operator signs in. Does sign-in
   reload manifests and adopt it? (macOS: yes, 083)
4. What evidence can GameLib read without the bridge helper (there is none off macOS)?
   Candidates: content_log `Loaded N apps from install folder <path>` after the write
   time; Steam rewriting the ACF; `registry.vdf` (Linux) or HKCU
   `Software\Valve\Steam\Apps\<id>\Installed` (Windows).
5. Does `steam://exit` then `steam://rungameid/<id>` behave as on macOS (graceful quit,
   relaunch with the game)?

## Solution

Reuse the 083/047 probe shape (content_log + ACF mtime/StateFlags + Steam PID oracles) on
a small game. Platform is `windows` because that machine is to hand; repeat on Linux
(Steam Deck/desktop) before the phase plans the Linux arm. A NO on question 1 or 5
means restart-on-Play stays Mac-only and Windows/Linux keep a (simplified) hold.
