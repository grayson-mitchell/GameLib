---
created: 2026-11-27T09:00:00.000Z
title: "callRunner trims every output chunk before joining, so a space at a chunk boundary inside a token is lost"
area: launch
files:
  - src/backend/commandRunner.ts:513 (onChunk pushes data.trim(); stdout joins with "", stderr with a newline)
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/runner/expected/runner-transcript-nile-json-split/result.json
severity: minor
platform: any
ready: code
---

## Problem

Recorded by the 88.2-01 `runner` golden (D-20: kept as recorded, not fixed there).
`callRunner` keeps each stdout and stderr chunk through `data.trim()` and joins the stdout chunks with `''`.
A store CLI reply that a pipe splits inside a string, at a space, loses that space: the
`runner-transcript-nile-json-split` case feeds `"Alpha ` and `Game"` as two chunks and the result holds
`"AlphaGame"`. The chunk text handed to `onOutput` and written to the log is untouched, so only the
`ExecResult` that callers parse is altered. A line-oriented reply is unaffected, and a chunk usually ends at
a newline, which is why it has not shown.

## Solution

Not part of the port. The Rust runner replays the golden as it is. After that, decide whether the result
should join the raw chunks and trim once, in one deliberate change recorded in `deltas.json`.
