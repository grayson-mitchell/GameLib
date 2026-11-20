# Phase 83 deferred items

## 83-02 (found on the operator's Windows box, identical at baseline b69d43018)

Out of scope for 83-02 (verified failing with the same set before any 83-02 change):

- `gamelib-steampoll` `tests/adoption.rs`: `on_windows_a_changed_steam_pid_is_never_adopted` fails when the real Steam client is running locally (the Windows live path observes the real process; expected `None`, got `Some(true)`).
- `gamelib-steampoll-cli`: `every_shipped_timeline_replays`, `replay_of_grace_expiry_is_non_empty_and_deterministic`, `replay_strips_temp_paths_and_seq`, `replay_renders_notifications_through_the_catalog`, `rust_replay_equals_frozen_ts_streams_except_ledgered_records` fail with `tempdir: Access is denied (os error 5) at C:\Windows\.tmpXXXX` (the replay runner resolves a temp dir under `C:\Windows`).

Both look like local-environment issues (CI legs are clean runners). Worth a todo if they recur on a clean Windows box.
