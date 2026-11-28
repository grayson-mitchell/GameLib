---
created: 2026-11-28T05:00:00.000Z
title: "The launches folder is created 0755 by the capture file, not 0700"
area: launch
files:
  - src-tauri/crates/gamelib-launch/src/game/capture.rs
  - src-tauri/crates/gamelib-launch/src/game/record.rs
severity: minor
platform: macos
ready: code
found_by: "Live check of 88-HUMAN-UAT item 3 on the dev build, 2026-11-28: `ls -la` of <appFolder>/launches"
---

## Problem

`<appFolder>/launches/` (`~/Library/Application Support/gamelib/launches` on macOS) was `drwxr-xr-x` after a
launch. `record.rs`'s `ensure_dir` means to make the folder 0700 on unix and to refuse a symlink. But
`capture.rs`'s `create_capture` (about line 68) runs first in a launch and makes the folder with a plain
`std::fs::create_dir_all(parent)`, so it gets the default mode. When `ensure_dir` runs later, the folder already
exists and is left as it is.

The files inside are 0600 (`legendary-Emu.json`, `legendary-Emu.out`), so their contents are not exposed. Other
local users can still list the folder and see which game names have launched.

## Idea

Make one function create the folder, for example `record.rs`'s `ensure_dir` made `pub(crate)`, and call it from
`create_capture` too, so the folder is 0700 and refused as a symlink whichever file comes first. An existing 0755
folder could be tightened when it is seen. A test should make a capture file first and assert the folder's mode.

## Constraints to keep

- On Windows this is a no-op, as now (mode bits are unix only).
- No new crate; `std::os::unix::fs::DirBuilderExt` is enough.
