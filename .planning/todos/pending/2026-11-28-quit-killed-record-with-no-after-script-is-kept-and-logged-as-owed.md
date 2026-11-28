---
created: 2026-11-28T05:00:00.000Z
title: "A quit-killed launch with no after script keeps its record and logs a script as owed"
area: launch
files:
  - src-tauri/crates/gamelib-launch/src/game/readopt.rs
  - src-tauri/crates/gamelib-launch/src/funnel/run.rs
  - src-tauri/crates/gamelib-launch/src/game/record.rs
severity: minor
platform: any
ready: code
found_by: "Live check of 88-HUMAN-UAT item 3 on the dev build, 2026-11-28 (SOMA, legendary, no after-launch script)"
---

## Problem

A re-adopted game was ended by GameLib's Quit (Yes in the running-game dialog). `gamelib.log` said:

    Emu was ended by the quit; its after script is owed to the next start

SOMA has no after-launch script (`afterLaunchScriptPath` is `""` in `GamesConfig/Emu.json`). The record left in
`launches/legendary-Emu.json` was `"state":"quitKilled"` with `"afterScript":null`. So the line names a script that
does not exist. The record also stays on disk until the next start, which removes it as having nothing to do.

The line comes from `game/readopt.rs` (the `session.quit_killed()` branch, about line 463). The record is kept
because only an explicit `finish()` after the after script removes it (88.3-07). The funnel's own quit-kill tail in
`funnel/run.rs` (about line 668) is worth checking for the same wording.

## Idea

When the record's `afterScript` is `None`, a quit-kill owes nothing. Remove the record at the kill, as `finish()`
would, and log a line without the "owed" claim, such as `{app_name} was ended by the quit`. Keep the record and the
present wording only when a script is really owed.

## Constraints to keep

- Play time is already recorded at the kill, so removing the record must not re-record it at the next start.
- The kill happens inside the 5 s exit budget, so removal is one bounded file operation.
- Lines in `gamelib.log` carry no path, pid or captured text.
