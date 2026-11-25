---
created: 2026-11-25T15:00:00.000Z
title: "prepareLaunch writes an empty \"Anticheats:\" log line when the anti-cheat info has an empty anticheats list"
area: launch
files:
  - src/backend/launcher.ts:793 (the second anti-cheat log call tests `info?.anticheats` for truthiness)
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/prepare_launch/expected/named-anticheat-empty-list/log.json
severity: minor
platform: any
ready: code
---

## Problem

Recorded by the 88.1-02 `prepare_launch` golden (D-20: kept as recorded, not fixed there).
`prepareLaunch` logs `Anticheats: ${info.anticheats}` when `info?.anticheats` is truthy. An empty array is
truthy, so an info entry with `anticheats: []` (a game the AreWeAntiCheatYet data lists with a status and
no named anti-cheat) writes a game-log line that reads `Anticheats: ` with nothing after it, followed by the
blank lines. The status line and the missing-entry case are fine; only the empty list is noisy.

## Solution

Not part of the port. After the Rust prepare step replays the golden, decide whether an empty list should
write the line, in one deliberate change recorded in `deltas.json`.
