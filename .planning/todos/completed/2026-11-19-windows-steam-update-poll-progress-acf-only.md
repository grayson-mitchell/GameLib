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

## Resolution

Closed by quick task 261119-box (2026-11-19).

- **Fix:** an update arm in the install loop's Phase B (`install_loop.rs`, `windows_update_live_active`)
  reads `DownloadMonitor::read_windows` for a Win32 + delegated + Native + non-handoff update poll.
  The update step gates its live reading on `UpdateObservation.windows_live` (`update.rs`, set from
  `windows_live_applies` in `install_once.rs` `update_tick`). `AcfUpdateFields.bytes_to_stage` is new
  and `#[serde(skip)]`, so the `steampoll_acf_read_update` reply and the TS types are unchanged.
- **Denominator (the todo's question):** `BytesToStage` covers what the counter measures. An update
  stages only the changed content, and that size is what Steam writes as the update's BytesToStage
  (not `SizeOnDisk`). `BytesToDownload` is the fallback when BytesToStage is 0 (`reading_from_write_delta`
  is reused unchanged).
- **Baseline:** the first tick the update ACF carries UpdateRunning (0x100) or UpdateStarted (0x400),
  not the hand-off. A pending update (StateFlags 6) never reads the counter. A repeat start of the
  same update poll keeps its baseline; an install poll upgraded into an update re-baselines.
- **Tests** (`tests/install_loop.rs`): `a_windows_update_poll_climbs_with_the_write_counter_then_completes`,
  `the_windows_update_baseline_is_the_first_running_tick_not_the_hand_off`,
  `only_a_windows_delegated_native_update_poll_reads_the_counter`,
  `the_windows_update_baseline_survives_a_repeat_start_of_the_same_update_poll`,
  `an_install_poll_upgraded_to_an_update_takes_a_fresh_baseline`; plus step-level
  (`tests/update.rs`, `tests/install_once_complete.rs`) and reader-level (`tests/acf_update.rs`) tests.
  Mutants killed: dropping `was_update &&` in `upgrade()` (the install-to-update test fails) and
  replacing the `is_update_running` guard with `true` (the first-running-tick test fails).
- **Live check (operator):** on Windows with a Steam game that has a pending update, start the
  update from GameLib and watch the Updating percent climb from 0 during Steam's download. The
  terminal shows `gamelib-steampoll: windows live progress started for appId <id> (steam.exe
  write counter)` once Steam starts the update. If it stays at 0, look for `windows live
  progress unavailable` first, then check what the update ACF carries in StateFlags and
  BytesToStage.
