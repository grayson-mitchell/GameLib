---
created: 2026-10-16
title: "D-UAT-10: bottle-installed Steam game (Portal 2) fix #2 - launch/uninstall - deferred, unverified"
source: v0.7 close - Phase 21 (21-UAT.md D-UAT-10; debug/resolved/steam-bottle-game-no-launch.md)
area: steam
files:
  - .planning/milestones/v0.7-phases/21-steam-native-install/21-UAT.md
severity: major
platform: macos
ready: live-gate
resolves_phase: null
parked: 2026-10-16
parked_by: operator
revisit_trigger: "next macOS bottled-Steam live gate, or a user report of a dead Play button on a bottle-installed Steam game"
---

Install and adoption of Portal 2 into the GameLibSteam bottle PASS. The debug session fixed two defects:
fix #1 (bottle tool shown as Game Porting Toolkit) is HW-verified; fix #2 (launch / uninstall reverting to
Play) was DEFERRED 2026-07-20 as tracked debt and was never re-run on hardware. 21-UAT.md still calls it an
"OPEN macOS bug". Not a Windows item. I have NOT checked whether Phase 24's bridge work since changed this;
read `.planning/debug/resolved/steam-bottle-game-no-launch.md` and re-run before assuming it is still broken.

## Resolved 2026-10-16

Real-HW live gate (macOS, CrossOver 26.2, GameLibSteam bottle): Play on Fallout 2 launched through the
bottled Steam client; uninstall of Child of Light stayed uninstalled (gamelib.log 20:15:16). Fix #2 holds.
Play was blocked ~6 min by Steam's one-session-per-account rule (game open on another computer), not by
GameLib. Recorded in 21-UAT.md D-UAT-10 and summary row 3.
