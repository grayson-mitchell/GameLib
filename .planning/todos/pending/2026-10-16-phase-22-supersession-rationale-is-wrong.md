---
created: 2026-10-16
title: "ROADMAP's Phase 22 supersession rationale overstates what Phase 24 covers"
source: operator design question 2026-10-16 (CrossOver tweaking under one shared bottle)
area: planning
files:
  - .planning/ROADMAP.md
severity: minor
platform: any
ready: code
---

`ROADMAP.md:143` says Phase 22 (multiple Steam bottles) was superseded because "there is no bottled
Windows Steam client to configure per family anymore". That holds only for the two allowlisted bridge
games (Avernum 5/6). Every other bottle-eligible macOS Steam game still runs through the bottled
Windows Steam client in the single shared `GameLibSteam` bottle, which is the problem Phase 22 was
written to solve.

Fix: rewrite the "Why" so it states the real coverage. The "do not resume these plans; salvage into a
new phase" instruction (`ROADMAP.md:160`) stays correct. Link the two follow-on todos:
[[2026-10-16-bridge-games-should-each-get-their-own-bottle]] and
[[2026-10-16-widen-the-native-steam-bridge-beyond-two-games]].
