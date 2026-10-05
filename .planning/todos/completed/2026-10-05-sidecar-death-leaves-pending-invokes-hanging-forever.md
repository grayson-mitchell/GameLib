---
created: 2026-10-05T00:00:00.000Z
title: "Sidecar death never drains SidecarState.pending — long-running invokes hang forever and bounded ones wait the full 60s"
area: tauri-shell
severity: major
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 27"
files:
  - src-tauri/src/main.rs:1412
  - src-tauri/src/main.rs:1540-1600
  - src-tauri/src/main.rs:1148-1149
  - src-tauri/src/main.rs:11228-11420
---

## Problem

`start_reader` simply returns when the sidecar's stdout hits EOF or a read error. Nothing ever
drains `SidecarState.pending` (`main.rs:1412`): the only accesses are the insert at `:1551` and the
per-id removes at `:1560/:1579/:1591` — there is no `clear()` / `drain()`. The `Sender`s therefore
stay alive in the map and `rx.recv()` never errors.

Two comments say the opposite and are wrong: `:1148-1149` ("The sidecar dying closes the channel,
which wakes `rx.recv()`") and `:1585-1587` ("cannot hang forever on a dead sidecar").

## Failure scenario

The sidecar crashes (OOM, native fault) during `install`, `uninstall`, `oauthCaptureLogin`,
`openDialog`, … Every in-flight channel in `LONG_RUNNING_CHANNELS` leaves a renderer promise that
never settles and a blocking thread parked for good; bounded in-flight channels wait the full 60s
instead of failing at once. New calls fail fast (stdin EPIPE), but the UI is never told the backend
is gone.

A non-UTF-8 line on stdout also ends the reader loop silently (`lines()` → `Err` → `break`,
`:11231-11235`) and lands in this same path; it can't fire today (JS output is UTF-8 and no child
inherits the sidecar's stdio), but it is a second way in.

## Suggested fix

- After the read loop exits, lock `pending`, `drain()` it, send `Err("sidecar exited")` to every
  entry and record each in `abandoned`.
- Emit a frontend event so the UI can show the backend has died.
- Correct the two comments.
- Optionally switch to `read_until(b'\n')` with lossy decoding plus a diagnostic so a bad byte can't
  end the reader.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). The orchestrating session re-checked the cited lines itself and the mechanism holds. Line numbers are as of `5927806` on `main`.

## Resolution (2026-10-05)

What changed (`src-tauri/src/main.rs`):
- New pure helper `drain_pending_invokes(&pending, &abandoned)` (plus a `type InvokeSender` alias,
  added to keep clippy's `type_complexity` quiet). It `drain()`s the map, **sends**
  `Err("sidecar closed before responding")` to every waiter, records each id in `abandoned` via
  `push_abandoned`, and returns the `(id, channel)` pairs. It sends an `Err` instead of dropping the
  sender because a dropped sender would wake a bounded `recv_timeout` as `Disconnected`, and that arm
  reports a *timeout*. The text is the same one the long-running arm already uses. Poisoned locks
  are recovered, not skipped.
- `start_reader` calls it once, after the `for line in reader.lines()` loop. That covers EOF and the
  non-UTF-8 `Err` → `break` path alike. Each drained id gets a
  `shell_diag(invoke_abandoned_message("sidecar exited", …))` line.
- The two wrong comments were corrected: the `LONG_RUNNING_CHANNELS` doc and the `None =>
  rx.recv()` arm.
- **No frontend event was emitted.** No renderer listener exists for a "backend died" channel. The
  only existing surface that would fit is the `showDialog` frontend message, and that would need
  user-facing strings composed in Rust with no i18n path. Doing that means making a new UI/i18n
  decision, so it was left out. Every in-flight renderer promise now rejects at once, which reaches
  each caller's existing error handling.
- The `read_until` / lossy-decode hardening was **not** done (optional; out of scope).

Tests: `abandonedInvokeAttribution.test.ts` gains a comment-stripped pin that `start_reader` calls
`drain_pending_invokes(&state.pending, &state.abandoned` exactly once, after the read loop.
`shellDiagPersistence.test.ts`'s count of `shell_diag(&invoke_abandoned_message(` was updated from
2 to 3, and a new pin was added for the "sidecar exited" call. That update is honest: there is a
third call site now. Cargo tests: `sidecar_exit_fails_every_pending_invoke_at_once` (each waiter
gets the `Err` immediately via `try_recv`, the map is empty, the ring names both channels) and
`draining_an_empty_pending_table_is_a_no_op`.

RED: the new jest pin failed on the unfixed code (`drainAt` -1). The cargo test failed against a
no-op stub of the helper, which matches the old behaviour where nothing drained:
`left: [] right: [("7","install"),("8","getCookies")]`.

GREEN: both jest suites pass. `cargo test --bin gamelib-shell` 307 passed / 2 ignored. `cargo fmt
--check` clean. `cargo clippy --all-targets` exit 0 with no warning on the touched lines. `pnpm
codecheck` 0.

NOT verified: no live run, meaning nobody killed a real sidecar mid-`install` and watched the
renderer. Still open: a small race. An `invoke()` that inserts into `pending` *after* the drain and
whose stdin write still succeeds (child exiting, pipe not yet closed) would not be drained; it falls
back to its 60s bound, or hangs if it is long-running. Closing it needs a "reader closed" flag that
`invoke()` checks after the insert.
