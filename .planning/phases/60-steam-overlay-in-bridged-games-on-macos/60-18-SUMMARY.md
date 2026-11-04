# Phase 60 Plan 18: G1 release experiment (in progress)

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

(pending: Task 2 checkpoint)
