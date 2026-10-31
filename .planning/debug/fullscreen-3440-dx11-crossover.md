---
status: awaiting-verification
trigger: "Schedule I (bridge bottle) exits ~6 s after launch when saved prefs request 3440x1440 fullscreen"
created: 2026-11-01
updated: 2026-11-01
source_todo: .planning/todos/pending/2026-11-01-fullscreen-3440x1440-mode-switch-fails-under-crossover-dx11.md
---

## Symptoms

- **Expected:** Schedule I (appid 3205720) launched through the Steam bridge bottle
  `GameLibSteamBridge-3205720` (CrossOver, DX11) honours its saved fullscreen prefs at the
  display's native 3440x1440 and keeps running.
- **Actual:** Launches at 11:07 and 11:09 on 2026-11-01 exited after about 6 s.
- **Errors (Unity Player.log in the bottle):**
  `Switching to resolution 3440x1440 failed` and
  `Screen: DX11 could not switch resolution (3440x1440 fs=1 hz=0/1)`.
- **Timeline:** The prefs (`Software\TVGS\Schedule I Free Sample` in the bottle `user.reg`) were
  written as 3440x1440 FullScreenWindow by the 58-32 scored launch. The 58-32 launch itself ran;
  later launches fail.
- **Reproduction:** Restore the bottle's `user.reg` from `user.reg.bak-58-37` (holds the
  fullscreen prefs) and launch Schedule I through GameLib's bridge path.
- **Workaround in place:** for 58-37 the prefs were set to Fullscreen mode 3 (Windowed),
  1920x1080, Use Native 0. The current `user.reg` is the windowed one; the backup is the failing
  one. Restore the operator's working state when done.

## Current Focus

hypothesis: (confirmed for the error, open for the exit) the 3440x1440 mode switch fails only on CrossOver's D3DMetal DX11 path (adapter
  "AMD Compatibility Mode"); the pinned Wine-Staging+DXVK path (adapter "NVIDIA GeForce 6800")
  was never tried with the fullscreen prefs, so the windowed workaround was confounded.
test: needs a live launch (not permitted without operator confirmation)
expecting: CrossOver + CX_GRAPHICS_BACKEND=dxvk (or -window-mode borderless arg) keeps the game running at 3440x1440
next_action: once the probe-timeout todo is fixed, launch Schedule I from GameLib on the CrossOver
  engine in fullscreen and confirm it stays up (and 58-34 re-checks the invite raise over it)

## Evidence

- checked: Player-prev.log (11:09 failed run) vs Player.log (11:22-11:28 windowed run)
  found: failed run renders on "AMD Compatibility Mode (ID=0x66af)", VRAM 79626 MB (D3DMetal);
  windowed run renders on "NVIDIA GeForce 6800 (ID=0x41)", VRAM 49152 MB (DXVK)
  implication: the two runs used different graphics backends
- checked: ~/Library/Logs/GameLib/gamelib.log
  found: 11:07 and 11:09 launches engine=crossover; 11:22 launch engine=pinned Wine-Staging 11.20 +
  DXVK 1.10.3 (reason=cx-broken, demo-status probe 15 s timeout, bottle switched crossover -> pinned)
  implication: the "windowed workaround" run was on a different engine, so windowed-vs-fullscreen
  and CrossOver-vs-DXVK are confounded; the fullscreen prefs have never been run on DXVK
- checked: user.reg vs user.reg.bak-58-37 Screenmanager keys
  found: failing = mode 1 (FullScreenWindow), 0xd70x0x5a0 (3440x1440), UseNative 1; only other diffs
  are window size keys, session ids, Marlett/Symbol font paths (engine switch)
  implication: prefs are the sole trigger input; no GameLib code sanitises Unity Screenmanager prefs
- checked: src for Screenmanager/launchArgs
  found: no Screenmanager handling; bridgeKnownFixes supports per-app env (CX_GRAPHICS_BACKEND),
  launchArgs, registry profile (public/fixes/<appId>-steam.json / .profile.json)
  implication: a per-game known-fix is the right plumbing; no code edit needed to try it

- checked: GameLib launch 12:04 (operator Play click), saved prefs 3440x1440 FullScreenWindow
  found: probe timed out again -> engine=pinned (cx-broken); known-fix env CX_GRAPHICS_BACKEND=dxvk
  applied (tier-1) but irrelevant on pinned; renderer "NVIDIA GeForce 6800"; no mode-switch error;
  operator confirmed fullscreen 3440x1440 on the ultrawide
  implication: pinned DXVK handles the fullscreen prefs (test B passes)
- checked: direct CrossOver wine runs on the bottle (bypassing GameLib and the bridge), same prefs
  restored from user.reg.bak-debug-pinned-fs before each run; logs in the session scratchpad
  found: no CX_GRAPHICS_BACKEND -> DXVK anyway (bottle carries d3d11=native,builtin from the pinned
  engine's dxvk-macOS install); CX_GRAPHICS_BACKEND=d3dmetal -> "AMD Compatibility Mode", logs
  "Switching to resolution 3440x1440 failed" (reproduced); CX_GRAPHICS_BACKEND=dxvk -> "Apple M5
  Ultra", no error. Both arms still running at 20 s and at 60 s
  implication: the mode-switch failure is D3DMetal-specific and DXVK removes it (test A passes).
  The error alone does not end the process within 60 s outside the bridge; the 21 s / 6 s stops of
  the 11:07 / 11:09 bridge launches are not explained by it
- checked: gamelib.log 11:07 and 11:09
  found: 11:07 crossover run "gone after 21s of play"; 11:09 "gone after 6s of play"; both after
  raiseWineGameWindow raised the window
  implication: cause of those stops is unconfirmed (crash vs operator quit vs bridge-path effect)

## Eliminated

- hypothesis: the saved prefs themselves are corrupt or unsupported
  evidence: identical prefs run fullscreen on pinned DXVK and error-free on CrossOver DXVK

## Resolution

root_cause: CrossOver's D3DMetal DX11 backend rejects Unity's 3440x1440 exclusive/fullscreen mode
  switch ("DX11 could not switch resolution"). DXVK (CrossOver's or the pinned engine's) accepts it.
  Why D3DMetal rejects the mode is not investigated (inside CrossOver). The 6 s exit seen through the
  bridge is not reproduced by the error alone.
fix: public/fixes/3205720-steam.json sets CX_GRAPHICS_BACKEND=dxvk (tier-1 known fix), so a
  CrossOver bridge launch of Schedule I uses DXVK instead of D3DMetal.
verification: fix file loaded and logged ("known-fix env applied: CX_GRAPHICS_BACKEND=dxvk
  (tier-1)") on the 12:04 GameLib launch; direct CrossOver runs show DXVK clean vs D3DMetal error;
  known-fixes jest suites 315/315; prettier clean. NOT yet verified: a GameLib bridge launch on the
  CrossOver engine with the fix, blocked because the demo-status probe keeps timing out
  (.planning/todos/pending/2026-11-01-demo-status-probe-timeout-flips-bottle-to-cx-broken.md).
files_changed: public/fixes/3205720-steam.json
