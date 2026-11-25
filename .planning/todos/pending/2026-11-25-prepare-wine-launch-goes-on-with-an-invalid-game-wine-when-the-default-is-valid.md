---
created: 2026-11-25T14:00:00.000Z
title: "prepareWineLaunch goes on with the game's invalid wine when only the default wine is valid"
area: launch
files:
  - src/backend/launcher.ts:933-940 (prepareWineLaunch: validWine(game wine), then validWine(default wine), then carries on with the game's settings)
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/prepare_wine/expected/named-game-wine-invalid-default-valid/result.json
severity: medium
platform: any
ready: human
---

## Problem

Recorded by the 88.1-03 prepare_wine golden (`named-game-wine-invalid-default-valid`, D-20: kept as recorded,
not fixed there). When the game's own wine is invalid and the default wine is valid, `prepareWineLaunch` does not
switch to the default wine: the check only decides whether to give up. It carries on with the game's settings, so
the prefix check does nothing (no wine to run), `installed_games` is still written, the tier-1 fixes still go to
Rust against the invalid wine, and the step answers `{ success: true }` with the invalid wine's environment. The
launch then fails later, further from the cause. The golden pins this: no spawn is recorded and the result is a
success.

## Solution

Not part of the port. A decision is needed first: use the default wine for the launch (and say so in the game's
log), or fail early with a reason as the both-invalid case does. Make the change in the Rust prepare_wine begin op
and the golden together, as one deliberate change recorded in `deltas.json`.
