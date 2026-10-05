---
created: 2026-10-05T00:00:00.000Z
title: "Cmd+Q and the red X (exitToTray off) still quit without the sidecar's \"pending operations\" confirm"
area: tauri-shell
severity: medium
platform: macos
ready: live-gate
found_by: "Split out of 2026-10-05-tray-quit-bypasses-the-pending-operations-confirm.md when tray Quit was fixed, 2026-10-05"
files:
  - src-tauri/src/main.rs
---

## Problem

Tray Quit now routes through `quit_from_tray` -> the sidecar's `quit` listener -> `handleExit()`.
Cmd+Q and the red X with `exitToTray` off do not: the run closure handles only `RunEvent::Exit`
(no `ExitRequested`), and the `CloseRequested` handler falls through to a normal close when
`should_hide_on_close` is false. A running download is killed by `shutdown_child` with no prompt.

## Why it was not folded into the tray fix

It is not the same small change. The red X closes the window BEFORE any exit request, so
`handleExit()`'s confirm would have no parent window and an answer of "No" would leave a running
app with no window. Doing it properly means `prevent_close()` in `CloseRequested` and/or
`api.prevent_exit()` on `ExitRequested { code: None, .. }` (distinguishing the shell's own
`exit(0)` calls, which carry `Some(0)`), then routing through `quit_from_tray`. The Cmd+Q path is
macOS-specific and needs a live run to confirm `ExitRequested` fires with `code: None` there.

## Suggested fix

Reuse `quit_from_tray` (probe + send, `exit(0)` fallback). Intercept `CloseRequested` when it
would close (not hide) and `ExitRequested { code: None }`; verify live on macOS (Cmd+Q, red X)
with a download running and with none.
