---
created: 2026-11-13T00:00:00.000Z
title: 'Reword the pre-launch update prompt when an update is paused part-way'
area: steam
severity: minor
platform: any
ready: code
source: '.planning/phases/74-steam-game-updates/74-UAT.md item 6c (deferred by the 74 gap-closure scope, 2026-11-13)'
files:
  - src/backend/storeManagers/steam/updateLaunchPrompt.ts
---

## Problem

UAT 6c: the pre-launch update prompt reads the same whether the update has not started or is
paused part-way, so the user cannot tell that progress exists and that "Update now" resumes it.

## Fix direction

Detect the part-downloaded state and word the prompt to say the update is partly done and will
resume. Plan 74-14 changed the gate's order and messages, so build the wording fix on those
keys.

## Done when

Launching a game whose update is paused part-way shows a prompt that says so, and a game with
an untouched pending update shows the original wording.
