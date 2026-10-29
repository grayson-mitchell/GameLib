---
created: 2026-10-29
title: "Raft does not exit after quitting from its menu in DRM mode and needs a force-quit"
area: steam-bridge
severity: medium
platform: macos
ready: live-gate
source: "phase 56 live gate (56-34), launch 3, 2026-10-29"
---

## Problem

In 56-34 launch 3 (Raft 648800, steamclient-layer DRM mode) the game reached its menu and verified. After the operator quit from the game menu, `Raft.exe` stayed alive (state S, about 1.5% CPU, about 3 minutes), together with the helper `steam.exe` and `UnityCrashHandler64.exe --attach`. No crash dump was found. Raft's `Player.log` (bottle `drive_c/users/crossover/AppData/LocalLow/Redbeet Interactive/Raft/Player.log`) ends with `Steam auth ticket validated, logging into PlayFab...`, a successful API call, then `Saving settings ...`. The operator force-quit it with Activity Monitor, so the `game stopped after 254s` line reflects the force-quit. Ranch (launch 4 and 5) and Grim Dawn exited normally.

## Next

Reproduce: quit Raft from its menu in DRM mode and watch whether it exits. Compare against a Raft run through the ordinary bridge path (non-DRM) to tell the DRM layer from Raft's own exit path. Look in the trace for an unanswered shutdown call (ISteamUser/ISteamClient release) after the last call, and in the wine log for the last output.

## Resolution

2026-10-29, closed as not reproducible. The operator quit Raft from its menu in DRM mode several more times during DRM testing, and it exited normally every time. The hang happened once, in 56-34 launch 3. The likeliest cause is the extra trace and logging that run had switched on, not the DRM layer or Raft's own exit path. If it comes back with tracing off, reopen this todo and follow the Next steps above.
