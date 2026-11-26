---
created: 2026-11-27T10:00:00.000Z
title: "runWineCommand shifts the first wrapper off the caller's options.wrappers array, so the caller's list is shorter after the call"
area: launch
files:
  - src/backend/commandRunner.ts:335 (wrappers.shift() on options.wrappers, then commandParts.unshift(...wrappers, runnerBin))
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/wine_launch/expected/wine-launch-pairwise-008/result.json
severity: minor
platform: any
ready: code
---

## Problem

Recorded by the 88.2-04 `wine_launch` golden (D-20: kept as recorded, not fixed there).
`runWineCommand` takes `options.wrappers` by reference and calls `wrappers.shift()` to make the first wrapper the
spawned binary. The caller's array is changed: `['gamemoderun', 'mangohud']` becomes `['mangohud']` after the
call (`wrappersBefore` and `wrappersAfter` in the golden's `result.json`, seven cases). The same function already
mutates the caller's `commandParts` (87's `command-parts-not-mutated` delta). A caller that reuses its wrappers
list for a second call, for instance a launch retried with the same prepared options, would run with the first
wrapper missing and no error.

## Solution

Not part of the port. The Rust `run_wine_command` takes its arguments by value and builds the argv on its own
copy, so it never changes a caller's list. Decide after the port whether to record this as a `deltas.json`
entry for the wine_launch slice, since a comparison on `wrappersAfter` cannot hold on the Rust side.
