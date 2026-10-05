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
