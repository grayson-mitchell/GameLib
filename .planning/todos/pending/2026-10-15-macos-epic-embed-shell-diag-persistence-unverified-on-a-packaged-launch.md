---
created: 2026-10-15T00:00:00.000Z
title: "macos_epic_embed.rs's new shell_diag persistence is unverified on a packaged launch — proven only in source text and cargo"
area: tauri-shell
severity: minor
platform: macos
ready: live-gate
found_by: "Quick task 261015-lz5, closing out its own fix: the 30-site shell_diag swap was proven mechanically (text comparison) and via cargo check/test, but this machine's live-gate rig was not re-run, so the packaged-build behaviour the fix exists for is desk-asserted, not measured"
files:
  - src-tauri/src/macos_epic_embed.rs
---

## What is unverified

Quick task `261015-lz5` routed all 30 of `macos_epic_embed.rs`'s diagnostics through
`crate::shell_diag(...)` so they persist to `~/Library/Logs/GameLib/gamelib-shell.log` on a
**packaged** launch, where `eprintln!` alone is silently discarded by LaunchServices. That claim
was verified at desk — source text, `cargo check`, `cargo test`, and a jest gate reading the Rust
file as text — but desk work cannot observe LaunchServices' own stderr-discard behaviour, because
`pnpm tauri:dev*` never exercises it: under `tauri dev` the embed's stderr always reaches a
terminal regardless of which emitter wrote it. Only an actual packaged `--debug` bundle run (NOT
`pnpm tauri:dev*`) exercises the failure mode this fix closes.

## What to run

Launch a packaged `--debug` bundle (the same configuration the original todo's `found_by` field
used: Launch 1, pid 70842, 2026-10-13) and induce at least one of these two literals:

- **The launcher-scheme block (D-14), around the former `:1816` call site.** Triggered by a
  gesture that navigates the Epic surface to the `com.epicgames.launcher` scheme.
- **The `didFinishNavigation` success line, around the former `:1459` call site.** Cheaper to
  induce — any successful navigation on the Epic surface fires it, no specific gesture needed.

Grep target: `~/Library/Logs/GameLib/gamelib-shell.log` (NOT `gamelib.log` — that is the Node
sidecar's file, via `log_writer.ts`, and no Rust line can reach it). Expect the literal prefixed
with `{epoch} pid={pid} ` rather than the stderr-side `[shell] ` prefix.

## Why desk work cannot settle this

Desk verification proves the source routes every call through `shell_diag` and that `shell_diag`
itself, as written, appends to the log file. It cannot prove LaunchServices actually discards
this process's stderr in a packaged build (that is an OS-level behaviour, not something `cargo
test` or jest can observe), nor that the file write survives whatever process-exit path a
packaged app takes. Both of those require an actual packaged launch.

## Open observation, not acted on here

`gamelib-shell.log` has no rotation or bound anywhere in the codebase. It was measured at 324 KB
on 2026-10-13 (the original todo's filing date), and nothing in `shell_diag` truncates or rotates
it. The 30 additional call sites this fix added to the file's writers will grow it faster than
before — more lines per packaged session than previously possible, since previously none of
`macos_epic_embed.rs`'s lines reached this file at all. Recorded here because the fix that closes
one gap on this file also measurably increases its growth rate; not fixed in this todo.
