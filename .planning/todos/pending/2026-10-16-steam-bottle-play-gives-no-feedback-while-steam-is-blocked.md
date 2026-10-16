---
created: 2026-10-16
title: "Play on a bottled Steam game gives no feedback while the bottled Steam client is blocked"
source: D-UAT-10 live gate 2026-10-16 (Fallout 2, macOS)
area: steam
files:
  - src/backend/storeManagers/steam/games.ts
severity: medium
platform: macos
ready: code
---

Pressing Play on a bottle-installed Steam game hands `steam.exe -applaunch <appId>` to the bottled Steam
client and then waits. If that client cannot start the game, the UI shows nothing: Play just looks dead and
the only trace is `raiseFrontmostBottledProcess [launch]: no matching process within ~18s — falling back
to app.hide()` in `gamelib.log`, followed by `sidecar invoke timed out: launch` about 60 s later.

Measured blockers on 2026-10-16, all silent in GameLib:
- bottled Steam self-updating and relaunching (drops `-applaunch`, so Play must be pressed again);
- a Steam login window hidden behind other windows;
- Steam's one-playing-session-per-account rule (a game open on another computer) — ~6 min of waiting.

Extra Play presses while blocked were just re-handed to the running Steam, so they did nothing either.

Wanted: surface a state to the user when the launch has not produced a game process within the grace
window (e.g. "Waiting for Steam…" with the likely causes), instead of a dead button. Which of the three
causes can be detected from the bottle's `logs/` (`bootstrap_log.txt`, `console_log.txt`) is unmeasured;
start there before designing the message.

This is the symptom D-UAT-10 originally reported as a "dead Play button"; the dispatch itself is fixed
(see the resolved bottled-Steam todo and 21-UAT.md D-UAT-10).
