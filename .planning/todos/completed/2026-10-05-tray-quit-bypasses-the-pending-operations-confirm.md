---
created: 2026-10-05T00:00:00.000Z
title: "Tray Quit calls app_handle.exit(0) directly and skips handleExit — no \"pending operations\" confirm, downloads are killed"
area: tauri-shell
severity: medium
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 33"
files:
  - src-tauri/src/main.rs:12380
---

## Problem

`"quit" => app_handle.exit(0)` never goes through the sidecar's `handleExit()`. In Electron, tray Quit
and `before-quit` both routed through `handleExit`. Existing comments justify the bypass only on
orphan-process grounds (covered by `shutdown_child`), not the lost confirm. Cmd+Q and the red X have
the same gap when exit-to-tray is off. Which phase built the tray menu couldn't be confirmed (shallow
clone) — possibly 34.1 or 35 rather than 33.

## Failure scenario

With an Epic/GOG/Steam download running, tray → Quit SIGTERMs then SIGKILLs the sidecar's process
group with no prompt. The download is lost.

## Suggested fix

Have the tray quit item send the sidecar `quit` IPC (which runs `handleExit`), keeping
`app_handle.exit(0)` as the fallback when the sidecar is dead. Note this interacts with the
Esc-confirms bug in `2026-10-05-dialog-dismiss-returns-destructive-button-on-windows-and-linux.md`;
fix that first or the routed confirm is Esc-to-quit on Windows/Linux.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.

## Resolution (2026-10-05)

**Mechanism confirmed.** The tray menu's `"quit"` arm was `app_handle.exit(0)`; the sidecar
exposes `handleExit()` as the `send` channel `quit` (`appShellFlowRegistration.ts`
`ipcMain.on('quit', ...)`), which nothing on the tray path used.

**Change (`src-tauri/src/main.rs`).** The arm now calls `quit_from_tray(app_handle)`, which on a
worker thread:

1. probes the sidecar with an `invoke` of the existing `health` channel, bounded by
   `TRAY_QUIT_PROBE_TIMEOUT` (3s, waited with `recv_timeout` on a separate probe thread, so a
   probe stuck behind the stdin mutex is bounded too);
2. if it answers, writes a `send` frame on `quit` -- `handleExit()` then shows the "pending
   operations" confirm when a download is running (cancelId 0 / Esc = "No", fixed earlier by the
   dialog-dismiss todo) and exits via `app_exit` otherwise;
3. if there is no sidecar state, the probe fails or times out, or the write fails, falls back to
   `app_handle.exit(0)` -- the old behaviour -- so tray Quit can never become a no-op.

The probe bounds only liveness. Once the frame is handed off, no clock runs: the confirm waits on
a human.

**RED.** New `tauriShellSource.test.ts` block `main.rs tray Quit routes through the sidecar
handleExit` failed on the pre-fix tree (2 failed: the arm contained `.exit(`;
`fn quit_from_tray(` absent).

**GREEN.** That suite 245/245. Rust: four `tray_quit_*` tests on the injected policy function
(`tray_quit_via_sidecar`) pass -- hand-off when the probe answers; fallback without sending when
the probe errors; fallback within the bound when the probe hangs (100ms bound, 2s probe, returns
in <1s); fallback when the quit frame cannot be written. `cargo fmt --check` clean; `cargo
clippy` reports nothing on the new lines (22 pre-existing warnings elsewhere).

**Not covered here -- Cmd+Q and the red X.** Not the same small change (window already gone
before exit is requested; needs `ExitRequested`/`CloseRequested` interception and a macOS live
run). Split out as
`.planning/todos/pending/2026-10-05-cmd-q-and-red-x-quit-bypass-the-pending-operations-confirm.md`.

**Not verified.** No live run on any OS -- the confirm appearing from tray Quit with a download
running is unobserved. If `handleExit()` itself stalls after the hand-off (e.g. on
`gogPresence.deletePresence()`), tray Quit appears to do nothing; a second click re-probes and
re-sends rather than force-exiting, which could in principle raise a second confirm.
