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

## Resolution (2026-11-27)

Fixed with the Wine command todo, in two commits. The runner's three general lines now carry the general-log form,
built by `general_log_command` in `call_runner.rs` from the reductions in `redact.rs`: the runner is named by its
file name, every argument that is an absolute path of two or more segments is reduced to its file name, credentials
are still `<redacted>` (redacted by exact element on the unwrapped arguments before any reduction), and the env the
caller added is shown last as ` (env: NAME, NAME)`, only for variables whose value differs from GameLib's own. On the
PowerShell branch the `powershell -NoProfile Start-Process ... -ArgumentList ...` shape is kept, with the runner's file
name inside Start-Process and the reduced arguments in the list.

The `Abort command` and `Error running command` lines were in scope too. They print the same credential-free command
into the same file, and the 88.2 sweep missed them; reducing only `Running command` would have left the harm the todo
names (an uploaded `gamelib.log` shares the profile path) in place. The Error line also names a failed spawn's program
by its file name, and keeps the OS error text after it.

The per-game log writers' header and the result's `fullCommand`, `error` and `stderr` keep the full text, where the user
expects it. Only absolute paths of two or more segments are reduced: Windows switches (`/S`, `/VERYSILENT`, `/v`) share
the one-segment shape and must stay readable, and one segment cannot hold a profile directory.

`src/backend/commandRunner.ts:470`, named in the todo's files, was already deleted by 88.2-24 (`686537757`), so the TS
side needed no change.

The goldens were not re-recorded, because the TS recorders went with 88.2-24. The replays instead compare under the
named delta `general-log-paths-and-env-reduced` (in `golden/runner/deltas.json` and `golden/wine_launch/deltas.json`),
with a test-side oracle (`tests/log_oracle/mod.rs`) that derives the expected line from the TS-recorded text without
calling the production reduction: 54 runner lines (32 cases) and 21 wine lines (21 cases) change, each count pinned,
and every general line either replay sees is checked to carry no rig placeholder and no deep absolute path. No
recorded golden file was edited.

Fix commits, by subject because this branch may be rebased on merge: "fix(quick-261127-u6h): the runner's gamelib.log
lines name no profile path or env value" and "fix(quick-261127-u6h): the Wine command's gamelib.log lines name no
profile path".

Not done, as follow-ups: an argument that embeds a path after something other than `=` (a `-Dname:/path` form, a
`PATH`-like list) is not reduced. The result's `fullCommand` and `error` still reach the TS with the full text; nothing
found logs `fullCommand`, but TS callers that log a result's `error` (a spawn failure's names the program path) were not
audited. The IN-04 redaction gap (`--flag=value`) is unchanged. Nothing was verified in a live app run.
