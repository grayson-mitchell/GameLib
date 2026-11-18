---
created: 2026-11-19T00:00:00.000Z
title: 'Windows: Steam-client update progress still reads the ACF alone (stays at 0)'
area: steam
severity: medium
platform: windows
ready: code
files:
  - src-tauri/crates/gamelib-steampoll/src/update.rs
  - src-tauri/crates/gamelib-steampoll/src/win_live.rs
---

## Problem

Debug `win-steam-handoff-progress-zero` (resolved 2026-11-19) gave Windows delegated install polls a
live source: steam.exe's cumulative `WriteTransferCount` delta over `BytesToStage`
(`win_live.rs`). Update polls (`awaiting_update`) were left out of scope: `update.rs` gates its live
reading on `is_mac`, and `install_loop.rs` `windows_live_active` excludes update polls. Windows
Steam writes the ACF byte fields only at setup and commit (measured, 237990), so an update the Steam
client performs on Windows will show 0 until it finishes.

## Direction

Feed `DownloadMonitor::read_windows` into the update step the way the install step takes it, gated on
Win32 + the same delegated/native conditions. For an update, check whether `BytesToStage` covers the
whole delta, since an update stages only changed chunks. Unit-test it like `tests/win_live.rs`, then
live-check one real Windows update.
