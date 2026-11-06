---
phase: 60-steam-overlay-in-bridged-games-on-macos
plan: 12
subsystem: steam-overlay
tags: [overlay, input-probe, g1, diagnosis, macos, winemac]
requires: [60-11]
provides:
  - "G1 verdict V-NONE with evidence: identical winemac capture on CrossOver and Staging, no gameoverlayrenderer-attributed probe lines"
affects: [60-15, 60-16]
key-files:
  created: []
  modified: [.planning/phases/60-steam-overlay-in-bridged-games-on-macos/60-12-SUMMARY.md]
decisions:
  - "G1 verdict is V-NONE: the evidence refutes the CrossOver-vs-Staging difference the verdict codes presuppose, and the probe captured no overlay open/close marker"
metrics:
  tasks: 3
  completed: 2026-11-04
---

# Phase 60 Plan 12: G1 live probe diagnosis Summary

Three live probe traces (Planet Crafter on CrossOver and on Wine-Staging, Schedule I on CrossOver) show the same winemac capture on all three and zero gameoverlayrenderer-attributed calls, so the verdict is V-NONE and the earlier Staging pass (60-10 / UAT item 9) is contradicted.

## Static evidence

- `pnpm build-steam-bridge` ran 2026-11-04 17:0x NZDT; both dylibs rebuilt.
- `lipo -info public/bin/arm64/darwin/overlay_shim.dylib`: x86_64 arm64
- `lipo -info public/bin/arm64/darwin/overlay_input_probe.dylib`: x86_64 arm64
- `pnpm build:sidecar-sea` ran 17:08 NZDT. `build/main/sidecar.js` mtime Nov 4 17:08, size 2371362.
- Sidecar built from HEAD 572bf5f4c (includes 60-13 commits 47c192b0e, 5d24cb8ae). `git status --short -- src`: clean. `git merge-base --is-ancestor a4f4696e2 HEAD` (60-11 probe wiring): succeeds.
- `otool -l gameoverlayrenderer.dylib | grep -A4 __interpose`: TWO `__interpose` sections (size 0xf0 each, 15 pairs). The dylib does interpose.
- `nm -m gameoverlayrenderer.dylib` imports (all undefined externals): CGAssociateMouseAndMouseCursorPosition, CGDisplayHideCursor, CGDisplayShowCursor, CGSForceShowCursor, CGWarpMouseCursorPosition, HideCursor, ShowCursor, OBJC_CLASS_$_NSCursor. No EventTap or sendEvent imports. (Which of these are interposed versus merely called is for the probe trace to show.)
- `user.reg` `[Software\\Wine\\Mac Driver]` in GameLibSteamBridge-1284190: only `"AllowSetGamma"=dword:00000000`. Same in GameLibSteamBridge-3205720. Neither bottle sets UseConfinementCursorClipping or CursorClippingLocksWindows.
- Current engine of the 1284190 bottle: `~/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-1284190/.gamelib-engine.json` = `{"kind":"crossover",...}`. Run A needs CrossOver (already set); Run B flips to Staging under the sandbox profile.
- Bottle sharing: `getBridgeBottleSettings` -> `fallbackBridgeBottleSettings` (bottle.ts L1761-1772) calls the same `resolveBridgeBottleName(appId)` as the CrossOver path, and `buildFallbackGameSettings(resolved, sel)` takes that bottle. engineSwitch.ts L511-529 also uses the same `bottleDir`. So the Staging launch runs in the same bottle directory.

staging-shares-bottle: yes

## Operator runs

Times are operator-reported, local NZDT, 2026-11-04 PM. Probe-log wall clock is derived from the epoch field.

| Run | Title / engine | Operator report | Probe log |
| --- | --- | --- | --- |
| A | The Planet Crafter 1284190, CrossOver overlay runner | 5:57 main menu: overlay opened (control). 5:57 gameplay: "could not click, mouse captured in game". 5:59 main menu: overlay opened, clicked successfully | `input-probe-1284190-1793768169863.log`, 66 lines, mode 0600 |
| B | The Planet Crafter 1284190, under no-crossover.sb (Wine-Staging fallback) | 6:03 main menu (step 3). 6:04 gameplay: "mouse captured in game, can't click" | `input-probe-1284190-1793768590185.log`, 61 lines, mode 0600 |
| C | Schedule I Free Sample 3205720, CrossOver overlay runner | 6:14 main menu (step 3). 6:15 gameplay: "mouse captured in game, can't click" | `input-probe-3205720-1793769255716.log`, 54 lines, mode 0600 |

Launch-log verification, done by this executor from `~/Library/Logs/GameLib/gamelib.log` and `gamelib.log.old` (the operator did not confirm these):

- Run B, confirmed (18:03:10): `SteamEngine: appId 1284190 uses engine=pinned name="Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)" version=11.20 reason=cx-missing`; `overlay=on source=default`; `overlay input probe=on log=~/Library/Application Support/GameLib/steam-bridge/overlay/trace/input-probe-1284190-1793768590185.log`; `overlay=env reason=fallback-engine (D-07)`; `overlay attach: attached gameoverlayui pid=22859 game pid=22622 after 7010ms`. The sandbox took: Run B really ran on Wine-Staging with overlay=env. It did not fall back to CrossOver. `.gamelib-engine.json` of the bottle now reads `kind: pinned` (the next normal CrossOver launch flips it back).
- Run C, confirmed (18:14:15): `uses engine=crossover build=26.3.0.39832 reason=cx-healthy`; `overlay=on source=user`; `overlay input probe=on log=.../input-probe-3205720-1793769255716.log`; `overlay attach: attached gameoverlayui pid=26478 game pid=26411 after 3009ms`.
- Run A, UNCONFIRMED from the launch log: Run A's launch (about 17:56) is gone from `gamelib.log.old`, which was overwritten by the later Run B launch, and the shell log has no match. Indirect evidence only: its probe log exists (so the probe flag was on), and its loaded exe is `wineloader` (same as Run C on CrossOver, versus `wine` in Run B on Staging); its wine log has `overlay_shim_load ... overlay=present` and AGX hooks. The `engine=crossover` / `overlay=on` / `probe=on` lines themselves could not be read.

## Probe analysis

Probe time windows (hide to unhide, derived from the epoch field; gameplay-capture windows):

- Run A: 17:57:27 to 17:57:54, then 17:59:13 to 17:59:21.
- Run B: 18:04:22 to 18:04:32, then 18:04:35 to 18:04:45.
- Run C: 18:14:55 to 18:15:13 (plus an earlier plain NSCursor hide/unhide 18:14:21 to 18:14:24, no clip).

Operator minute marks are coarse (minute precision), so the pairing of the operator's gameplay Shift+Tab to a specific window is approximate. Every operator "gameplay" mark falls inside or next to one of these windows.

## G1 verdict

verdict: V-NONE

renderer coverage: Planet Crafter (D3DMetal, CrossOver, Run A) and Schedule I (DXVK, CrossOver, Run C) show the same winemac-attributed capture, and Planet Crafter on Staging (DXVK-macOS, Run B) shows it too. The verdict is V-NONE for all three: the engine and renderer paths do not differ, and none shows an overlay open or close marker.

(a) Clipping mechanism before the open, by engine. All three runs use the same mechanism: confinement, not an event tap. No `CGEventTapCreate` / `CGEventTapEnable` line appears in any run (both are hooked by the probe).

Run A (CrossOver, D3DMetal):
```
t=1793768247922 CGWarpMouseCursorPosition caller=winemac.so x=1720.0 y=720.0
t=1793768247922 CGAssociateMouseAndMouseCursorPosition caller=winemac.so arg=1
t=1793768247928 NSCursor-hide caller=winemac.so
t=1793768247930 setMouseConfinementRect caller=winemac.so x=1720.0 y=719.0 w=1.0 h=1.0
t=1793768274347 NSCursor-unhide caller=winemac.so
```
Run B (Wine-Staging, DXVK-macOS), same calls, same 1x1 rect:
```
t=1793768662257 CGWarpMouseCursorPosition caller=winemac.so x=1720.0 y=720.0
t=1793768662264 CGAssociateMouseAndMouseCursorPosition caller=winemac.so arg=1
t=1793768662264 NSCursor-hide caller=winemac.so
t=1793768662265 setMouseConfinementRect caller=winemac.so x=1720.0 y=719.0 w=1.0 h=1.0
t=1793768672449 setMouseConfinementRect caller=winemac.so x=0.0 y=0.0 w=0.0 h=0.0
t=1793768672450 NSCursor-unhide caller=winemac.so
```
Run C (CrossOver, DXVK):
```
t=1793769295380 NSCursor-hide caller=winemac.so
t=1793769296156 CGWarpMouseCursorPosition caller=winemac.so x=1720.0 y=720.0
t=1793769296157 setMouseConfinementRect caller=winemac.so x=1720.0 y=719.0 w=1.0 h=1.0
t=1793769313524 NSCursor-unhide caller=winemac.so
t=1793769313524 setMouseConfinementRect caller=winemac.so x=0.0 y=0.0 w=0.0 h=0.0
```
No per-frame warp is visible: each capture window is entered once (hide, warp, associate arg=1, 1x1 confine) and released once (rect 0x0, unhide).

(b) gameoverlayrenderer calls at open and close: NONE. No line in any of the three logs has `caller=gameoverlayrenderer.dylib` or `caller=overlay_shim.dylib`; every `caller=` is `winemac.so` or `probe`. That includes the Run A main-menu control, where the overlay opened and took a click (operator 5:57 and 5:59). The probe therefore saw no overlay-open event even in the case where the overlay demonstrably opened. Either gameoverlayrenderer never calls the six hooked APIs (CGAssociateMouseAndMouseCursorPosition, CGWarpMouseCursorPosition, CGDisplayHideCursor, CGDisplayShowCursor, CGEventTapCreate, CGEventTapEnable), or the probe's `__interpose` tuples do not see its calls (it carries its own `__interpose` section, see Static evidence). The traces cannot tell which.

(c) winemac re-assert while the overlay is open: not observed on any engine. Inside each capture window there is no repeated hide, clip or warp: the clip set at window start is held to the window end. The pattern (one capture, no release while the operator pressed Shift+Tab) is the same on CrossOver and Staging.

(d) sendEvent-owner and set_active:
```
t=1793768175131 pid=19562 sendEvent-owner caller=probe class=WineApplication image=winemac.so   (Run A)
t=1793768595135 pid=22622 sendEvent-owner caller=probe class=WineApplication image=winemac.so   (Run B)
t=1793769260044 pid=26411 sendEvent-owner caller=probe class=WineApplication image=winemac.so   (Run C)
set_active-symbol caller=probe present   (all runs, all processes)
```
-[WineApplication sendEvent:] is owned by winemac.so on every engine; it is not hooked. `np_overlay_shim_set_active` is present, and the overlay wine logs (`1284190-1793768171041`, `1284190-1793768590686`, `3205720-1793769256423`) contain no `np_overlay_shim_set_active` line, while overlay_shim.m logs one on every call (L1022 and L1027).

(e) Run C against Run A: same winemac mechanism (1x1 confinement, associate arg=1, hide, then rect 0 and unhide), same absence of gameoverlayrenderer lines, same operator symptom. Difference: Run C's gameplay window has an NSCursor hide/unhide pair 18:14:21 to 18:14:24 before it without any clip, and the first Run A window releases with unhide only (no rect reset line at 17:57:54). Neither changes the result.

(f) Not applicable: V-CLIP is ruled out, so no Mac Driver value is proposed. For the record, `staging-shares-bottle: yes` (Static evidence).

Why each code is ruled out:
- V-CLIP: requires the two engines to clip by different mechanisms. Run A and Run B are line-for-line the same mechanism, and Run B (Staging) failed. There is no working engine to copy.
- V-REASSERT: requires gameoverlayrenderer show/associate calls followed by winemac re-hide, re-clip or warp while open, absent on Staging. No gameoverlayrenderer calls were recorded, no winemac re-assert while open, and Staging behaves the same.
- V-INPUT: requires the cursor to be freed and stay freed while the game still turns. The cursor was not freed: the operator saw a captured mouse, and the log shows one capture held to the window end with no release. There is no evidence of a freed-cursor state.
- V-REASSERT+V-INPUT: needs both halves; neither is evidenced.

UAT lead (nothing calls `np_overlay_shim_set_active`): CONFIRMED as a fact (symbol present, never called, sendEvent: still owned by winemac). NOT supported as the cause: the plan's lead predicted a CrossOver-only failure, and Staging fails the same way. The lead says nothing about the capture that winemac itself establishes.

Contradiction of 60-10 / UAT item 9: Run B ran on Wine-Staging 11.20 with overlay=env (confirmed from the launch log), and in gameplay the operator reported "mouse captured in game, can't click". UAT item 9 recorded the same title passing on Staging. The two observations conflict; the cause of the difference between that earlier pass and Run B is not established by these logs. The working hypothesis that an engine difference explains G1 is refuted.

What the data does support, as an observation not a verdict: in the main menu the cursor is free (no capture window) and the overlay takes clicks (Run A control); in gameplay winemac holds a one-shot 1x1 confinement plus hidden cursor on every engine, and overlay open does not release it. A fix would have to release or defer that capture while the overlay is open on all engines, which needs an overlay open/close signal the probe did not provide.

Fix inputs 60-15 needs and does not have (what is missing for a code to be chosen):
1. An overlay open/close marker. The probe saw no gameoverlayrenderer-attributed call. Candidates not yet observed: the `gameoverlayui` helper process start/exit or its window state, the Shift+Tab key event as seen by -[WineApplication sendEvent:] / winemac, a hook of more of the renderer's imports (it also imports `ShowCursor`, `HideCursor`, `CGSForceShowCursor`, `NSCursor`, none of which the probe hooks except via NSCursor hide/unhide), or `CGEventPost`-style injection from the UI process.
2. A check that the probe can see gameoverlayrenderer calls at all (the Run A menu control produced none).
3. An engine-independent test that a release of the winemac capture (rect 0, unhide, associate) at open lets clicks through, before any dylib is built.

## 60-15 fit

60-15 as planned does not fit this verdict. It implements only the V-CLIP, V-REASSERT, V-INPUT or combined branch, and on V-NONE it must stop, write `status: blocked` and return a blocker. It also names "make CrossOver match Staging" (V-CLIP) as its first example, which the data refutes. The next step is a new diagnosis plan (a probe that observes the overlay open/close signal, or a release-on-open experiment), not 60-15.

## Deviations from Plan

None. The plan's verdict codes presuppose a CrossOver-versus-Staging difference that Run B refutes, so V-NONE (the plan's "none fits the evidence" code) was chosen rather than the closest code.

## Known Stubs

None.

## Self-Check

- 60-12-SUMMARY.md exists with `## Static evidence`, `## Operator runs`, `## G1 verdict`.
- Task 1 commit 0aa95985b present in history.
- Run A launch-log lines unconfirmed, stated above.
