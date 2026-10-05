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
