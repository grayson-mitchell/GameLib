---
created: 2026-11-25T14:00:00.000Z
title: "prepareWineLaunch logs the stored winePrefix as the Wineprefix it created when the folder was a CrossOver bottle"
area: launch
files:
  - src/backend/launcher.ts:1034-1038 (the "Created/Updated Wineprefix at" line logs gameSettings.winePrefix)
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/prepare_wine/expected/named-gog-dummy-on-crossover/begin.json
severity: minor
platform: macos
ready: code
---

## Problem

Recorded by the 88.1-03 prepare_wine golden (`named-gog-dummy-on-crossover` and every `mac-crossover-*` case that
updates installed_games, D-20: kept as recorded, not fixed there). On a CrossOver launch the folder that gets
`installed_games` is the bottle folder `whoami --verbose` reports, but the log line that follows names
`gameSettings.winePrefix`, which CrossOver never uses. The line reads "Created/Updated Wineprefix at
<HOME>/Games/Prefix" while the file went to `<HOME>/bottles/Bottle1`.

## Solution

Not part of the port. Log the folder that was written, in the Rust begin op and the golden together, as one
deliberate change recorded in `deltas.json`.
