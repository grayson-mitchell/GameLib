---
created: 2026-09-26
title: 'A stale installed GameLib shell on the Windows machine shadowed the dev build for Phase 38 sitting 5 (and possibly sitting 4), which filed a false regression and mislabels the sittings as a debug build of HEAD'
found_during: /gsd-debug mouse-dead-dropdown-disclosure
severity: major
platform: windows
ready: human
area: dev-tooling
files:
  - src-tauri/src/main.rs
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
---

## What was measured (2026-09-26, operator's Windows 11 machine)

- An installed shell at `C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe` (v0.7.0, mtime
  **2026-09-24 07:34**) was running as pid 12812. It was started 2026-09-26 05:43:39 from a VS Code
  PowerShell terminal. Its frontend is **embedded at build time**, and the bundle it served had the
  pre-`3a0e62918` `Dropdown.toggle()` (`s(l=>!l)`).
- Its sidecar is `node <repo>/src-tauri/../build/main/sidecar.js`, a compile-time path
  (`resolve_sidecar_entry()`, `main.rs:7823`). It also writes the shared
  `%LOCALAPPDATA%\GameLib\logs\gamelib.log`. So the **backend and log evidence look current while
  the shell and frontend are stale**, and nothing in the log says otherwise except the
  `GAMELIB_SHELL_EXE received=` bootstrap line.
- `pnpm tauri:dev` started while it runs builds, prints `[shell] another GameLib instance is
  already running -- sending focus sentinel to it and exiting`, and **exits**. The dev build never
  shows a window. The only notice is that one line in cargo's scrollback.
- Sitting 5's own work (38-S02 at 06:47, the 38-W06 cookie censuses at 07:10) is in that process's
  log. So sitting 5 ran this build, not "tauri dev (debug build) `59df4c1b6`" as
  `38-HUMAN-UAT.md` records. The "regression" filed from it
  (`2026-09-26-mouse-click-no-longer-opens-dropdown-disclosures.md`) was the already-fixed defect
  running from the stale bundle. On HEAD under `pnpm tauri:dev`, both surfaces open on one click.
- `gamelib.log.old` (21:01 → 05:42) also names the installed exe. Sitting 4 (2026-09-26) may fall
  inside that window. **Not established**: check the sitting-4 timings before re-labelling it.
- Side observation: when pid 12812 was stopped, its node sidecar did not drain-exit within ~25s
  and had to be stopped by hand. Cause not investigated. It may be the open `260913-m9c`
  in-flight-at-boot class.

## Decisions needed (why `ready: human`)

1. **Re-label or re-run.** Decide whether sitting 5's results (38-S02, 38-S14(a), 38-W06) and
   possibly sitting 4's stand. Backend-side behaviour came from the repo's `build/main`, but its
   exact build time at the sitting is unknown, and the shell (cookie deletion for 38-W06, window
   ops for 38-W01) was the 2026-09-24 07:34 binary. At minimum, correct the "Conditions" lines.
2. **Guard the trap.** Options: (a) uninstall the stale build; (b) make a debug-build secondary
   instance refuse to hand off to a primary running from a different executable, and say so
   loudly; (c) a `tauri:dev` pre-flight that fails when a non-`target\debug` `gamelib-shell.exe`
   is running. (b) touches the Phase 46 single-instance design, so it is a deliberate decision,
   not a drive-by.
