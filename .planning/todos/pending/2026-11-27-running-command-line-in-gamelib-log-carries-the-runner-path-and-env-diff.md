---
created: 2026-11-27T11:00:00.000Z
title: "The Running command line in gamelib.log names the runner path and the env the caller added"
area: launch
files:
  - src-tauri/crates/gamelib-launch/src/runner/call_runner.rs (the general line before the writers' headers)
  - src/backend/commandRunner.ts:470 (logger.logInfo([prefix, safeCommand], runnerProps.logPrefix))
severity: minor
platform: any
ready: code
---

## Problem

Recorded by the 88.2-07 port (D-20: kept as recorded, not fixed there). Every runner call writes one line to
`gamelib.log`: `<prefix>: <safe command>`. The safe command has its credentials redacted, but it still names
the runner's full path (which includes the user's profile directory) and every environment variable the caller
set that differs from GameLib's own, with its value. A user who uploads `gamelib.log` shares both. The
project rule for `gamelib.log` is that no line carries a URL, query, header, token, account name or profile
path, and this line does carry a profile path.

## Solution

Not part of the port: the Rust line is byte-equal to the TS one on purpose, so a golden diff never mixes port
and fix. After it, log the command with the runner reduced to its file name and the env reduced to the
variable names (the per-game log keeps the full line, where the user expects it), and re-record the goldens.
