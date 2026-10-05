---
created: 2026-10-05T00:00:00.000Z
title: "Dismissing a two-button confirm dialog (Esc / window close) resolves as buttons[1] on Windows and Linux — Esc confirms force-uninstall and quit-with-pending-ops"
area: tauri-shell
severity: major
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 33"
files:
  - src-tauri/src/main.rs:6977-7015
  - src/backend/platform/index.ts:486-497
  - src/backend/utils.ts:277-300
  - src/backend/utils.ts:333-350
  - src/backend/sidecar/__tests__/dialogStub.test.ts:191-233
---

## Problem

The `dialog_message` arm builds an `OkCancelCustom(label0, label1)` dialog and returns
`Value::Bool(builder.blocking_show())`. `blocking_show()` is `true` only when the first button's
label comes back; every other outcome is `false`. The sidecar stub then maps
`result === false ? 1 : 0` (`platform/index.ts:497`), so `false` is read as "buttons[1] clicked".

A dismissal is also `false`. Per the review agent's reading of the pinned crate sources
(tauri-plugin-dialog 2.7.2, rfd 0.16.0): on Windows rfd sets `TDF_ALLOW_DIALOG_CANCELLATION`, so
Esc / the X yields `IDCANCEL` → `Cancel`; on GTK a window-close / Esc (`GTK_RESPONSE_DELETE_EVENT`)
maps to `Cancel`. macOS NSAlert with custom titles has no Esc equivalent, so macOS is unaffected.

`cancelId` is honoured only in the transport-error `catch`, never for a dismissal — the opposite of
Electron, where a dismissal returns `cancelId`. The comment at `utils.ts:288-290` still assumes the
Electron behaviour.

## Failure scenario

- `askForceUninstall` (`utils.ts:333+`): buttons `[No, Yes]`, `response === 1` → `forceUninstall()`.
  Esc removes the game from the installed list.
- `handleExit` (`utils.ts:277+`): "pending operations, are you sure?" `[No, Yes]`. Esc runs
  `killPattern` on legendary/gogdl/nile, aborts every controller and exits — in-flight downloads die.
- `dialogStub.test.ts:191-233` labels `false` as "buttons[1] clicked", so the suite stays green.

## Suggested fix

- Rust: use `blocking_show_with_result()` and return `0` for `Custom(label0)`, `1` for
  `Custom(label1)`, `null` for anything else.
- Stub: map `null` to `safeIndex` (the caller's `cancelId`).
- Tests: add "dismissed (null) resolves cancelId" for both button orders; correct the comment at
  `utils.ts:288-290`.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). The orchestrating session re-checked the cited lines itself and the mechanism holds. Line numbers are as of `5927806` on `main`.
