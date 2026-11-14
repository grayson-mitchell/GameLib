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

## Resolution

Closed by quick 261114-twk.

- Signal: the gamelib-depot delta temps ledger `<steamappsDir>/gamelib-delta/<appId>.temps.json`, which exists only when a paused run kept SHA-verified temps. Checked with `existsSync` inside try/catch in `updateLaunchPrompt.ts`; any failure reads as "no ledger".
- Wording: new key `steam.update.prompt.messagePartial` replaces `.message` when the ledger is present; filled in all 49 gamelib catalogs (48 mt manifests updated insert-only).
- Buttons unchanged: "Update now" already resumes a paused queue element (addToQueue replaces the element and calls initQueue when idle).
- A paused update with no ledger restarts from 0 and keeps the original wording.
- Commits: 8b3d3e559 (prompt + tests), 79db99922 (catalogs).
