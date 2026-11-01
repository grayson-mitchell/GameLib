---
created: 2026-11-01T00:00:00.000Z
title: "Schedule I (bridge bottle) exits ~6 s after launch when saved prefs request 3440x1440 fullscreen; DX11 mode switch fails under CrossOver"
area: steam-bridge
severity: medium
platform: macos
ready: live-gate
source: phase 58-37 live check (2026-11-01); incidental finding
files:
  - .planning/phases/58-steam-bridge-multiplayer/58-37-SUMMARY.md
---

## Problem

Launches at 11:07 and 11:09 on 2026-11-01 failed: the Unity Player.log in the
GameLibSteamBridge-3205720 bottle showed `Switching to resolution 3440x1440 failed` and
`Screen: DX11 could not switch resolution (3440x1440 fs=1 hz=0/1)`, then the game exited after
about 6 s. The saved prefs (`Software\TVGS\Schedule I Free Sample` in the bottle user.reg) held
3440x1440 FullScreenWindow, written by the 58-32 scored launch.

Workaround applied for the 58-37 run only: Screenmanager Fullscreen mode 1 to 3 (Windowed), width
1920, height 1080, Use Native 0 (backup `user.reg.bak-58-37` in the bottle). The 58-37 invite leg
therefore ran windowed.

## Follow-up

- Understand why the CrossOver DX11 path cannot switch to the ultrawide native mode.
- 58-34 should re-check the invite raise over a FULLSCREEN game once that is understood.

## Findings (2026-11-01, debug session `fullscreen-3440-dx11-crossover`)

- The mode-switch error is specific to CrossOver's D3DMetal backend. A direct CrossOver run with
  `CX_GRAPHICS_BACKEND=d3dmetal` reproduces it. With `CX_GRAPHICS_BACKEND=dxvk`, the same prefs
  produce no error, and the pinned Wine-Staging + DXVK engine runs them fullscreen at 3440x1440.
- The 58-37 windowed run was confounded: a demo-status probe timeout had also moved the bottle
  to the pinned engine. Filed as
  `2026-11-01-demo-status-probe-timeout-flips-bottle-to-cx-broken.md`.
- The error alone does not end the game. Both direct arms were still running at 60 s, so the
  21 s and 6 s stops of the bridge launches remain unexplained.
- Fix in place: `public/fixes/3205720-steam.json` sets `CX_GRAPHICS_BACKEND=dxvk`.
- Still open: verify a GameLib CrossOver-engine fullscreen launch once the probe todo is fixed,
  and the 58-34 fullscreen raise check.

## Result

Fixed by the tier-1 known fix `public/fixes/3205720-steam.json` (`CX_GRAPHICS_BACKEND=dxvk`, commit
32d203a8b). Live-verified on 2026-11-01 at 14:04 after the demo-status probe fix (d3f83e677). The
saved 3440x1440 FullScreenWindow prefs were restored. The probe returned licensed, the bottle went
back to the CrossOver engine, and the known-fix env was applied. Unity ran on DXVK ("Apple M5
Ultra") with no mode-switch error. The game ran fullscreen on the ultrawide for over 2 minutes
with no exit, confirmed by the operator.

Not done: the 21 s and 6 s stops of the 11:07 and 11:09 D3DMetal launches were never root-caused.
They do not recur on the DXVK path. The 58-34 invite-raise re-check over a fullscreen game belongs
to 58-34. Debug session: `.planning/debug/resolved/fullscreen-3440-dx11-crossover.md`.
