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

## Resolution (2026-10-05)

**The suggested fix would not have worked, so it was not used.** `blocking_show_with_result()` cannot
tell a dismissal from buttons[1]. tauri-plugin-dialog 2.7.2's `desktop::show_message_dialog`
(`src/desktop.rs`, the "on Linux rfd does not return Custom" block) is **not** `cfg`-gated. It
rewrites rfd's `(Cancel, OkCancelCustom(_, cancel))` to `Custom(cancel)` on every desktop OS before
any plugin API returns. So a dismissal reaches `show`, `show_with_result` and both blocking forms as
`Custom(<second label>)`. Underneath that, rfd 0.16.0 does report the difference:
`Custom(label)` for a click and `Cancel` for Esc/close. That holds for gtk3
(`GTK_RESPONSE_DELETE_EVENT` → `_ => Cancel`), win_cid (`IDCANCEL` → `Cancel`, with
`TDF_ALLOW_DIALOG_CANCELLATION`) and macOS.

What changed:
- `src-tauri/Cargo.toml`: `rfd = { version = "0.16", default-features = false }`. It is the
  plugin's own backend and was already in `Cargo.lock`. Backend features come in by unification, so
  the only lockfile change is one line adding `rfd` to `gamelib-shell`'s own dependency list.
- `src-tauri/src/main.rs` `dialog_message`: the two-button case builds an `rfd::AsyncMessageDialog`
  the same way the plugin does: `show()` runs on the main thread, the result is awaited on a spawned
  thread, and the title defaults to the package name. It returns `0` / `1` / `null` through a new
  pure `two_button_choice()`. In that helper `Custom(label0)` and `Ok` map to 0, `Custom(label1)`
  maps to 1, and anything else (`Cancel`, i.e. a dismissal) maps to `None`. Single-button and
  no-button calls keep the plugin's OK-only `blocking_show()`, now returning `0` or `null` instead of
  a bool. The now-unused `MessageDialogButtons` import was dropped.
- `src/backend/platform/index.ts` `showMessageBox`: `typeof result === 'number' ? result : safeIndex`.
  A dismissal therefore resolves the caller's `cancelId`, and the transport-error `catch` fallback
  is unchanged.
- `src/backend/utils.ts` `handleExit`: the cancelId comment no longer says dismissal was already
  correct on both paths.

RED (`dialogStub.test.ts`, before the TS fix): `dismissed (null) resolves the caller-declared
cancelId 1 (promptI386Recovery shape)` failed (got 0, the destructive Confirm), and `resolves 1
(buttons[1] clicked)` failed. The `[No, Yes]` / cancelId 0 dismissal case passed by coincidence on
the old mapping, which is why both orders are tested. RED for Rust came from the cargo test
`two_button_dialog_dismissal_is_not_a_button`, run against a stub of `two_button_choice` that
reproduced the old end-to-end mapping (label0 → 0, everything else → 1, i.e. the plugin remap plus
`blocking_show`). It failed with `left: Some(1) right: None` for `Cancel`.

GREEN: dialogStub 24/24 (including both dismissal orders and a single-/no-button case for 0 and
null). `cargo test --bin gamelib-shell` 307 passed / 2 ignored. `cargo fmt --check` clean. `cargo
clippy --all-targets` exit 0 with no warning on the touched lines. `pnpm codecheck` 0. eslint 0
errors. Prettier `--check` passed on the touched TS.

NOT verified: no live run on any OS. Nobody has watched the rfd-direct dialog render, take Esc or
the window X, or keep its button order and default button on Windows, Linux (GTK) or macOS. The
mapping rests on reading rfd 0.16.0 / plugin 2.7.2 sources. The stale Phase-31 header comment above
`export const dialog` in `platform/index.ts` ("showMessageBox is DELIBERATELY NOT wired…") predates
this todo and was left alone.
