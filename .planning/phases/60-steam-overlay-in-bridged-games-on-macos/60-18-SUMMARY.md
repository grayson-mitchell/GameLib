---
phase: 60-steam-overlay-in-bridged-games-on-macos
plan: 18
subsystem: steam-overlay
tags: [overlay, macos, g1, experiment, wine, crossover]
requires: [60-15, 60-17]
provides:
  - "G1 experiment verdict X-RELEASE+BLOCK (signal cb) with fix inputs for 60-19/60-20"
affects: [60-19, 60-20, 60-16]
tech-stack:
  added: []
  patterns: ["release winemac capture on overlay open via callback 331 signal, set_active to block input, replay on close"]
key-files:
  created: [.planning/phases/60-steam-overlay-in-bridged-games-on-macos/60-18-SUMMARY.md]
  modified: []
key-decisions:
  - "G1 fix = cb signal, release on open, set_active(1) on open, replay on close (X-RELEASE+BLOCK)"
  - "Production module must scope to the game process, not wine explorer.exe"
requirements-completed: [G1, D-15]
duration: operator-gated
completed: 2026-11-04
---

# Phase 60 Plan 18: G1 release experiment Summary

**Live runs on both CrossOver renderer paths and Wine-Staging show callback-331 open/close signal plus release-on-open plus set_active(1) gives a cursor, overlay clicks, a fixed camera and restored mouse-look: verdict X-RELEASE+BLOCK.**

## Static evidence

Build HEAD: 6c185e059. `git status --short -- src native`: clean.

- `lipo -info public/bin/arm64/darwin/overlay_input_probe.dylib`: Architectures in the fat file: public/bin/arm64/darwin/overlay_input_probe.dylib are: x86_64 arm64
- helper `public/bin/arm64/darwin/steam-bridge-helper` mtime Nov 4 19:33 (bridge_helper.c Nov 4 19:22, so helper is newer)
- sidecar `build/main/sidecar.js` mtime Nov 4 19:33 (overlayLaunch.ts Nov 4 19:25, so sidecar is newer). tauri dev does not rebuild the sidecar: restart dev after this.

renderer interposes: CGLChoosePixelFormat, CGLFlushDrawable, glSwapAPPLE, HideCursor, InitCursor, ShowCursor, CFRunLoopRun, CFRunLoopRunInMode, CGAssociateMouseAndMouseCursorPosition, CGCursorIsVisible, CGDisplayHideCursor, CGDisplayMoveCursorToPoint, CGDisplayShowCursor, CGGetLastMouseDelta, CGWarpMouseCursorPosition

renderer calls CGAssociateMouseAndMouseCursorPosition: 2
renderer calls CGWarpMouseCursorPosition: 1
renderer calls CGDisplayHideCursor: 3
renderer calls CGDisplayShowCursor: 4
renderer calls CGSForceShowCursor: 2
renderer calls HideCursor: 0
renderer calls ShowCursor: 0
renderer calls CGEventPost: 1

Reading: the renderer interposes the cursor APIs (so the game's calls are redirected to it) and itself calls Associate, Warp, Hide/ShowCursor, CGSForceShowCursor and CGEventPost, so absence of renderer-attributed lines in 60-12 is not explained by the renderer never calling them.

Notification contract literal `com.gamelib.steambridge.overlay.` counts: gamelib_overlay_signal.h = 2, overlay_input_probe.m = 1.

Prior callback 331 evidence (current log files): `~/Library/Logs/GameLib/gamelib.log.old:214: (18:14:32) bridge helper [3205720]: CBQ unlisted iCallback=331 action=drop callresult=0` (the 18:03:29 line has rotated out of the retained logs).

interpose-visibility: seen (from 60-17: a later-loaded image with its own `__interpose` section is logged by the probe with `caller=gameoverlayrenderer.dylib`)

## Operator runs

All runs 2026-11-04, local times from the probe t= field. Each run's launch log showed the intended engine and `experiment=` value.

### Run 1
The Planet Crafter (1284190), CrossOver 26.3.0.39832 overlay runner, `cb:release`.
- Launch 19:37:03: `engine=crossover ... reason=cx-healthy`, `overlay input probe=on log=.../input-probe-1284190-1793774223119.log experiment=cb:release`; overlay attach gameoverlayui pid=46939, game pid 46876, after 3012ms. Helper `CBQ unlisted iCallback=331 action=drop` at 19:37:17.
- Main menu (control) 19:37:17.531 `CGSForceShowCursor caller=gameoverlayrenderer.dylib` (first renderer-attributed line ever); 19:37:17.544 `signal cb active=1`, `experiment open source=cb action=release`, `experiment release assoc=1 windows=4 unhide=0`; close 19:37:27.414 `signal cb active=0`, `experiment close ... replay assoc=-1 rect=none hide=0`.
- Gameplay capture 19:37:37.72 (winemac warp, associate arg=1, NSCursor hide, setMouseConfinementRect 1720,719 1x1).
- Gameplay open 19:38:26.181 `CGSForceShowCursor caller=gameoverlayrenderer.dylib`; 19:38:26.230 `signal cb active=1`, experiment open, `release assoc=1 windows=4 unhide=1`. Close 19:38:47.657 `signal cb active=0`, `experiment close reason=signal replay assoc=1 rect=1720.0,719.0,1.0,1.0 hide=1`. No `deferred` lines. 19:38:49 winemac unhide + rect 0 (quit).
- Operator: cursor YES, overlay clicks YES, camera turned YES ("a little movement in game with mouse movement"), mouse-look back after close YES.
- Decision: cursor and clicks but camera turned, so Run 2 = cb:release+block. Run 1k not needed (cb fired).

### Run 2
The Planet Crafter, CrossOver, `cb:release+block`.
- Launch 19:47:28 `engine=crossover reason=cx-healthy`, `experiment=cb:release+block`, log input-probe-1284190-1793774848707.log. Game pid 49311.
- Capture 19:47:45. Open 19:47:57.371 `CGSForceShowCursor caller=gameoverlayrenderer.dylib`; 19:47:57.387 `signal cb active=1`, `experiment open action=release+block`, `release assoc=1 windows=4 unhide=1`, `experiment set_active 1`. Close 19:48:10.796 `replay assoc=1 rect=1720,719,1,1 hide=1`. Second open 19:48:15.009 (same lines incl. set_active 1), close 19:48:19.687 replay. 19:48:20.960 winemac unhide + rect 0 (quit).
- set_active(0) on close is silent by design (probe .m L456-457), so no `set_active 0` line.
- Operator: cursor YES, clicks YES, camera turned NO, mouse-look back YES.

### Run 3
Schedule I (3205720, exe "Schedule I Free Sample.exe"), CrossOver, `cb:release+block`.
- Launch 19:49:54 `engine=crossover reason=cx-healthy`, `experiment=cb:release+block`, log input-probe-3205720-1793774994078.log. Game pid 50153.
- Capture 19:50:20.48. Open 19:50:29.691 pid 50153 `experiment open action=release+block`, `release assoc=1 windows=4 unhide=1`, `set_active 1`. Close 19:50:44.735 `replay assoc=1 rect=1720,719,1,1 hide=1`. 19:50:46.303 winemac unhide + rect 0 (quit).
- FINDING for 60-19: Wine explorer.exe (pid 50141) also has WineApplication and ALSO ran the experiment: `experiment open`, `release assoc=1 windows=8 unhide=0`, `set_active 1`, close `replay assoc=-1 rect=none hide=0`. Other wine processes logged `experiment inactive reason=no-wineapp`. Same pattern in Run 4 (a windows=9 process).
- Operator: cursor YES, clicks YES, camera turned NO, mouse-look back YES.

### Run 4
The Planet Crafter on Wine-Staging, `cb:release+block`, sandbox no-crossover.sb.
- Launch 19:53:20 (gamelib.log.old): `engine=pinned name="Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)" version=11.20 reason=cx-missing`, `experiment=cb:release+block`, `overlay=env reason=fallback-engine (D-07)`, log input-probe-1284190-1793775200997.log.
- Capture 19:53:40. Gameplay open 19:53:46.268 `signal cb active=1`, `experiment open release+block`, `release assoc=1 windows=4 unhide=1`, `set_active 1` (plus a windows=9 non-game process also acting). Close 19:53:53.480 `replay assoc=1 rect=1720,719,1,1 hide=1`. 19:53:55.068 winemac unhide + rect 0 (operator Esc, pause menu).
- Pause-menu open 19:53:56.578 `release unhide=0`, `set_active 1`; close 19:54:02.062 `replay rect=0,0,0,0 hide=0`. 19:54:04.53 winemac re-captures (gameplay resumed); 19:54:05.259 release (quit).
- Operator: gameplay cursor YES, clicks YES, camera stayed fixed (turned NO), mouse-look back YES; pause menu: overlay took clicks YES.
- Operator then restarted plain `pnpm tauri:dev`.

runs stopped: none (all planned runs completed; Run 1k not needed)

## G1 experiment verdict

verdict: X-RELEASE+BLOCK
signal: cb
input-leak: no
close-restore: ok
key-desync: n/a
fix routes: tcp-clone,env
renderer coverage: Holds on The Planet Crafter (D3DMetal, Runs 2 and 4) and Schedule I (DXVK, Run 3); both CrossOver titles agree and Staging also passes.

Supporting evidence:
- Signal: `signal cb active=1/0` fired at every gameplay open and close on all runs, within about 15 ms of `CGSForceShowCursor caller=gameoverlayrenderer.dylib` at the open (Run 1 19:38:26.181 then 19:38:26.230; Run 2 19:47:57.371 then .387). The helper sees callback 331 (`CBQ unlisted iCallback=331`). No key fallback needed, so key-desync is n/a.
- Release: `experiment release assoc=1 windows=4 unhide=1` at gameplay opens, where winemac's capture (warp, associate arg=1, NSCursor hide, confinement rect 1720,719 1x1) was in place just before. Menu opens release with unhide=0.
- Deferred: no `deferred` lines in any run.
- Close: `experiment close reason=signal replay assoc=1 rect=1720,719,1,1 hide=1` in gameplay; no `reason=timeout` close seen.
- Renderer visibility: the renderer interposes the cursor APIs and itself calls Associate (2), Warp (1), Hide (3), Show (4), CGSForceShowCursor (2) and CGEventPost (1); with interpose-visibility seen, the earlier absence of renderer-attributed lines was the probe not hooking CGSForceShowCursor, and it now logs it.

Why other codes are ruled out:
- X-RELEASE: Run 1 (`cb:release` alone) turned the camera, so block is required.
- X-NOSIGNAL: cb fired reliably at every open and close.
- X-NONE: release ran and clicks worked on all runs, and mouse-look returned after every close.

Fix inputs for 60-19:
- On `signal cb active=1`: release winemac capture (associate=1, unhide cursor with depth matching hide state, clear confinement rect; windows=4 for the game process), defer game cursor/capture calls while open, and call np_overlay_shim_set_active(1).
- On `signal cb active=0`: replay the saved capture state (assoc, rect, hide), and set_active(0).
- Deferred APIs seen: none.
- MUST scope to the game process only. Wine explorer.exe (and one windows=9 process on Staging) also has WineApplication and ran the experiment; other processes log `experiment inactive reason=no-wineapp`. The production module must not act in explorer.exe.
- Staging passes, so routes are the tcp-clone and the env (plain env fallback) paths.

## UAT item 9

Run 4 on Wine-Staging: in gameplay the overlay with release+block gives a cursor and clicks with a fixed camera. In the game's own pause menu (Esc) the overlay took clicks and the release showed unhide=0 (winemac had already released capture), which is the state UAT item 9 most plausibly tested and matches 60-12 Run B: the pause menu is not a gameplay capture state, so item 9 passing there did not show gameplay works on Staging. Gameplay on Staging needs the same release+block as CrossOver. 60-16 should re-gate item 9 in gameplay once 60-19 ships.
