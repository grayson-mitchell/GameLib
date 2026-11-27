---
created: 2026-11-27T09:30:00.000Z
title: "Game output capture files under launches/ are never removed, and two names can share one file"
area: launch
files:
  - src-tauri/crates/gamelib-launch/src/game/capture.rs:66-86 (launches/<runner>-<name>.out, 0600, truncated only by the next launch)
severity: minor
platform: any
ready: code
---

## Problem

88.2 code review IN-02, deferred in 88.2 UAT test 2. The capture file holds the game's raw stdout and stderr; only the
copy written to the log goes through the sanitizer. The file is never removed when the run ends, so raw output stays on
disk across sessions until the same game is launched again. `safe_name` also maps distinct names (`a b`, `a_b`) to one
file, so two games can overwrite each other's capture.

## Solution

Remove the capture file once the tail has drained at run end (keep it only while the game runs or is re-adoptable;
check what 88.3's re-adoption needs from it first), and make the file name collision-free (append a short hash of the
unsanitized name).
