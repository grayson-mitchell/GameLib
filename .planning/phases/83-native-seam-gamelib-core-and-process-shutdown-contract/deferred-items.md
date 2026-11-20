# Phase 83 deferred items

## 83-02 (found on the operator's Windows box, identical at baseline b69d43018)

Out of scope for 83-02 (verified failing with the same set before any 83-02 change):

- `gamelib-steampoll` `tests/adoption.rs`: `on_windows_a_changed_steam_pid_is_never_adopted` fails when the real Steam client is running locally (the Windows live path observes the real process; expected `None`, got `Some(true)`).
- `gamelib-steampoll-cli`: `every_shipped_timeline_replays`, `replay_of_grace_expiry_is_non_empty_and_deterministic`, `replay_strips_temp_paths_and_seq`, `replay_renders_notifications_through_the_catalog`, `rust_replay_equals_frozen_ts_streams_except_ledgered_records` fail with `tempdir: Access is denied (os error 5) at C:\Windows\.tmpXXXX` (the replay runner resolves a temp dir under `C:\Windows`).

Both look like local-environment issues (CI legs are clean runners). Worth a todo if they recur on a clean Windows box.

## 83-06 (found on the operator's Windows box; none touch code this plan changed)

- `src/backend/sidecar/__tests__/shellFilesFlows.test.ts`: `checkDiskSpace (invoke) resolves real disk info for a valid path` fails (its fake runner answers a POSIX `df -P -k` with `/dev/disk1`, the Windows path never matches) and `resetHeroic deletes configPath and gamesConfigPath, then requests a relaunch after 1s` fails with `EPERM` renaming `gamelib.log` to `gamelib.log.old` (Windows file lock on the log). Neither test is in the set 83-06 edited; the `openExternalUrl` cases it removed are the only change to that file besides the channel-count assertions.
- `src/backend/__tests__/tauriShellSource.test.ts` (3 tests) and the Rust twins `tests::shell_production_source_main_part_equals_pre_test_slice` / `tests::cut_test_modules_cuts_cfg_all_and_stacked_test_mods`: the CRLF working-tree `main.rs` (same set as 83-03).
- `src-tauri/src/main.rs` and `src-tauri/src/relay_commands.rs` are still CRLF in this working tree although `.gitattributes` pins `eol=lf`; git normalises them on add (the `CRLF will be replaced by LF` warning). A fresh checkout would clear it and probably the three tauriShellSource failures with it.
