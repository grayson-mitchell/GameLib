---
created: 2026-11-17T00:00:00.000Z
title: "Spike (Linux): does Steam adopt a GameLib-written ACF at startup and at sign-in?"
area: steam-install
files:
  - src-tauri/crates/gamelib-steampoll/src/hold.rs (D-UAT-13 hold, all OSes)
  - .planning/spikes/083-adoption-signal-without-restart/README.md (macOS sign-in rescan)
  - .planning/spikes/001-acf-adoption/README.md
  - .planning/todos/pending/2026-11-16-spike-steam-startup-and-sign-in-adoption-on-windows.md (same questions)
severity: medium
platform: linux
ready: human
---

## Problem

This is the Linux half of the Phase 81 adoption spike (81-CONTEXT D-14), split from the
combined todo on 2026-11-17. It must run before `/gsd-plan-phase 81`. It decides whether Linux
gets restart-on-Play or the simplified in-memory hold (D-15).

## Machine

Any of these works:
- a Steam Deck in desktop mode;
- an x86 Linux PC;
- an x86 Linux VM, for example on the Windows PC under Hyper-V or VirtualBox.

Linux Steam is x86-only, so the Apple Silicon Mac cannot run it in a VM in any useful way.
No GPU is needed, because the spike only watches Steam's library state. Use a small game.

## Questions (native Linux Steam, not Flatpak, unless you note which)

1. **Startup.** Steam is not running. GameLib writes a StateFlags 4 ACF plus the files, then
   Steam starts. Is the game Installed with no dialog, verify or download?
2. **Running.** Steam is running and signed in when GameLib writes the ACF. Does Steam stay
   unaware until it restarts?
3. **Sign-in.** Steam is running but signed out when GameLib writes the ACF, and the operator
   then signs in. Does sign-in adopt the game?
4. **Evidence.** What can GameLib read without the bridge helper? Candidates:
   - content_log `Loaded N apps from install folder`;
   - Steam rewriting the ACF;
   - `~/.steam/registry.vdf` `Apps/<id>/Installed`.
5. **Restart.** Does `steam://exit` then `steam://rungameid/<id>` quit Steam gracefully and
   relaunch it with the game? What relaunches Steam alone, with no dialog?

## Solution

Use the same probe shape as the Windows todo. A NO on question 1 or 5 means Linux keeps the
simplified hold. Record the result in a spike README and in 81-CONTEXT D-14.
