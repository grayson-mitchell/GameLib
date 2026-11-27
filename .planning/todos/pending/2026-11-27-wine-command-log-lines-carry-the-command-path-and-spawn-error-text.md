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
