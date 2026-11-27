---
created: 2026-11-27T09:30:00.000Z
title: "The Windows PowerShell argument wrapper builds an expandable string, so $ and backtick in a value are expanded"
area: launch
files:
  - src-tauri/crates/gamelib-launch/src/runner/call_runner.rs:267-286 (each part becomes "`"<part>`"", only backslashes doubled)
severity: medium
platform: windows
ready: code
---

## Problem

88.2 code review WR-06, deferred in 88.2 UAT test 2 (ported TS behaviour, D-20). Each argument is wrapped as a
PowerShell double-quoted (expandable) string. Inside one, `$name`, `$(...)` and backtick escapes are interpreted. A GOG
private-branch `--password` containing `$` or a backtick, or a path with `$`, reaches `gogdl` mangled, or runs a
subexpression. Windows-only path.

## Solution

Not part of the port. Build single-quoted (verbatim) PowerShell strings, doubling `'` inside the value, or pass the
argument list without PowerShell interpolation. Record it as a delta and re-record the Windows quoting goldens; check
it on windows-latest with `windows_quoting.rs`.
