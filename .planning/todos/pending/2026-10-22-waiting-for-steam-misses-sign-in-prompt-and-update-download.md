---
created: 2026-10-22
title: "\"Waiting for Steam\" names no cause for a plain sign-in prompt or a self-update download"
source: phase 51-19 live gate item 11 (Avernum 4, 206020, bottled Steam)
area: steam-bottle
files:
  - src/backend/storeManagers/steam/bottleLaunchSignals.ts
severity: minor
platform: macos
ready: live-gate
---

D-51-16's waiting state works: it appears 20s after Play and clears when the game starts. Its
cause classifier (`classifyBottledSteamBlock`, `bottleLaunchSignals.ts`) misses the two most common
first-run blocks:

1. **Signed-out bottled Steam.** The login cause only matches `LogonFailure <reason>` in
   `logs/console_log.txt`. A bottled Steam simply sitting at its sign-in screen produces no
   LogonFailure. Observed 2026-10-22 22:21:23 to 22:22:05: `[bottle-waiting] appId=206020
   cause=none` for the whole wait, with the operator at the sign-in prompt.
2. **Self-update download phase.** The self-update cause only matches bootstrap `Installing
   update...`. The first ~25s of a fresh bottle's update are `Downloading update (n of m KB)...`
   lines, logged as `cause=none` (22:13:59). It only became `cause=self-update` at 22:14:30, after
   the download finished.

Fix direction:
- Treat bootstrap `Downloading update` / `Verifying installation` lines after the launch cutoff as
  self-update.
- For login: detect the sign-in UI. Candidates are `steamui_login.txt` activity after the cutoff,
  or the absence of a logged-on line in `connection_log.txt` / `console_log.txt` while
  `GameAction … LaunchApp` is waiting. Measure on a signed-out bottle before choosing.
- Add fixtures built from the real log lines above.
