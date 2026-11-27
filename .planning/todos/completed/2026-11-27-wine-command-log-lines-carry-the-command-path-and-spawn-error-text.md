---
created: 2026-11-27T09:30:00.000Z
title: "Three wine_command gamelib.log lines carry the command's paths or the spawn error text"
area: launch
files:
  - src-tauri/crates/gamelib-launch/src/runner/wine_command.rs:279 (Running Wine command: <debug_parts>)
  - src-tauri/crates/gamelib-launch/src/runner/wine_command.rs:319 (Wine command failed to run: <reason>)
  - src-tauri/crates/gamelib-launch/src/runner/wine_command.rs:354 (wineserver --wait for prefix <prefix> did not finish within 30 minutes)
severity: minor
platform: any
ready: code
---

## Problem

Found by the 88.2 log sweep and recorded as prohibition 1 PARTIAL in `88.2-VERIFICATION.md`; accepted in 88.2 UAT
test 2 on the condition that it gets this todo. The project rule for `gamelib.log` is that no line carries a URL,
query, header, token, account name or profile path. Three lines ported verbatim from the TS runner (D-20) break it:
`Running Wine command:` logs the full command parts (game and prefix paths under the user's profile),
`Wine command failed to run:` logs the spawn error text, which names the binary path, and the `wineserver --wait`
timeout warning names the prefix path. The sibling `Running command` line has its own todo
(`2026-11-27-running-command-line-in-gamelib-log-carries-the-runner-path-and-env-diff.md`).

## Solution

Not part of the port: the lines are byte-equal to the TS on purpose so a golden diff never mixes port and fix. Do it
with the `Running command` todo in one change: in `gamelib.log` reduce paths to the file name (or the prefix's
folder name) and keep the full text in the per-game log, then re-record the affected goldens.

## Resolution (2026-11-27)

Fixed with the `Running command` todo (`2026-11-27-running-command-line-in-gamelib-log-carries-the-runner-path-and-env-diff.md`),
in two commits. The three `wine_command.rs` lines now carry no path in `gamelib.log`. `Running Wine command:` reduces
each absolute part of two or more segments to its file name (`PreparedWine::debug_parts` is now the unjoined parts, so
the launch variant reduces each before joining them with a space). `Wine command failed to run:` names the spawned
program by its file name and keeps the OS error text after it. The `wineserver --wait` timeout warning names the
prefix's folder name instead of the prefix path.

The per-game `Wine Command: <bin> <parts>` header keeps the full command and is still compared byte for byte against the
TS recordings. Only absolute paths of two or more segments are reduced: Windows switches (`/S`, `/v`) share the
one-segment shape and one segment cannot hold a profile directory.

The goldens were not re-recorded, because the TS recorders (`runnerWine.oracle.test.ts` and its helpers) went with
88.2-24. The `wine_launch` replay instead compares under the named delta `general-log-paths-and-env-reduced`, with the
test-side oracle in `tests/log_oracle/mod.rs` deriving the expected text from the TS-recorded line without calling the
production reduction: 21 recorded lines change (pinned), and every general line is checked to carry no rig placeholder
and no deep absolute path. The six `Wine command failed to run:` lines were already compared by prefix only, and now
also have that guard, which is not vacuous on them because their programs are `<TOOLS>/...` paths. No recorded golden
file was edited.

Fix commits, by subject because this branch may be rebased on merge: "fix(quick-261127-u6h): the Wine command's
gamelib.log lines name no profile path" and "fix(quick-261127-u6h): the runner's gamelib.log lines name no profile path
or env value".

Not done, as follow-ups: an argument that embeds a path after something other than `=` (a `-Dname:/path` form, a
`PATH`-like list) is not reduced. The result's `fullCommand` and `error` still reach the TS with the full text, and TS
callers that log a result's `error` were not audited. The IN-04 redaction gap (`--flag=value`) is unchanged. Nothing was
verified in a live app run.
