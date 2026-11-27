---
created: 2026-11-28T00:00:00.000Z
title: "Resume log capture for a re-adopted game from its capture file"
area: launch
files:
  - src-tauri/crates/gamelib-launch/src/game/readopt.rs
  - src-tauri/crates/gamelib-launch/src/game/capture.rs
  - src-tauri/crates/gamelib-launch/src/game/record.rs
severity: minor
platform: any
ready: code
found_by: "Phase 88.3 plan 88.3-09 (D-09 and D-29 of 88-CONTEXT.md): capture is not resumed for a re-adopted game in 88."
---

## Problem

When GameLib crashes or is Force Quit while a game runs, the next start re-adopts the game (`game/readopt.rs`).
D-09 keeps log capture off for that session: the per-game log gains one fixed line saying the session was re-adopted
and that no further output is captured, and nothing tails the game's output any more. The game goes on writing,
though. A Rust-launched game's stdout and stderr go to the private capture file
`<appFolder>/launches/<runner>-<app>.out` (D-29, 88-RESEARCH.md Pattern 4), and that file still grows for as long as
the game lives. From the re-adoption on, the player's per-game log has a hole and the game's output is only on disk.

## Idea

Resume the tail from where the crashed GameLib stopped. The launch record would carry a new `captureOffset` field
(the byte offset the tailer had reached), written with the member snapshot that `record::refresh_members` already
keeps current. A re-adopted game's exit watch would start `game::capture`'s tailer at that offset on the capture
file and send what it reads to the per-game log, through `funnel::log` as an append with no rotation (the same
writer the re-adopted line uses). The line that says no output is captured would then become one that says capture
resumed.

## Files a later phase would change

- `src-tauri/crates/gamelib-launch/src/game/readopt.rs`: start the tailer next to the exit watch, and stop it when
  the watch ends.
- `src-tauri/crates/gamelib-launch/src/game/capture.rs`: a tailer that can start at an offset, and an offset the
  running tailer reports.
- `src-tauri/crates/gamelib-launch/src/game/record.rs`: `captureOffset` on `LaunchRecord` (a `serde(default)` field,
  so a record written before the change still reads, and a `version` bump decision since the reader is strict).

## Constraints to keep

- The capture file is read only through the checks its writer already applies (a regular file, the current user's,
  mode 0600); a record that points at a swapped file must not tail it.
- A tailer is bounded work that holds a shutdown registrant only while it runs, like the exit watch.
- No line written to `gamelib.log` may carry a path, a pid or the captured text.
