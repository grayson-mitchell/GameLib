---
created: 2026-11-26T13:00:00.000Z
title: "The use-another-wine dialog holds the launch registrant through shutdown instead of cancelling"
area: launch
files:
  - src-tauri/src/launch_dispatch.rs:46-63 (ShellDialogs::ask blocks in rpc_dialog_message)
  - src-tauri/crates/gamelib-launch/src/prepare/dialogs.rs:23-29 (the synchronous LaunchDialogs::ask)
  - src-tauri/crates/gamelib-launch/src/lib.rs:316-332 (guarded, the select! against the shutdown token)
severity: medium
platform: any
ready: code
---

## Problem

`LaunchDialogs::ask` is a synchronous trait method called from inside `async fn check_wine_before_launch`.
`ShellDialogs::ask` blocks in `rpc_dialog_message` (`rx.recv()`) until the user answers. While the thread is parked, the
`tokio::select!` in `guarded` that races `token.cancelled()` is never polled, so the `launch` registrant stays held
until the user clicks, and a quit with the dialog open waits out the 3.5 s drain instead of cancelling the op. This is
the shape the Rust shutdown contract (D-21, the Rust shutdown contract in CLAUDE.md) forbids: a registrant held on
in-flight work that does not watch the token.

Found by 88.1-REVIEW.md WR-04, confirmed by 88.1-VERIFICATION.md (by reading the code; the source comment at
`launch_dispatch.rs:40-45` says as much; a warning).

## Solution

Make `ask` return a future, or run it through `tokio::task::spawn_blocking` and `select!` the join handle against the
shutdown token, treating cancellation as a dismissal (`None`). A dismissal already means "No", so a shutdown mid-dialog
degrades correctly.
