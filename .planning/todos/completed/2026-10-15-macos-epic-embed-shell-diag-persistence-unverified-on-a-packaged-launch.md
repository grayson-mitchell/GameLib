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

## Resolution (2026-10-15, quick task `261015-oc8`)

**PASS, observed on a packaged launch.** A `pnpm tauri:dev:packaged` (`tauri build --debug`)
bundle of HEAD `beca31cbf` was recovered from the DMG, tied to `target/debug/gamelib-shell` by
sha256, and launched with `open -n` on this Mac. The failure mode this fix closes was measured
first, not assumed: `lsof -p 60602 -a -d 1,2` showed both stdout and stderr on `/dev/null`, with
the stderr offset advancing (2538 → 2918) as the app ran — LaunchServices was discarding every
`eprintln!` byte.

Of the two literals named above, the cheaper one was induced: clicking the real STORES tab
loaded `store.epicgames.com` in the native Epic subview, and `gamelib-shell.log` line 3937 reads

```
1792038877 pid=60602 macos_epic_embed: didFinishNavigation succeeded -- host: store.epicgames.com
```

— the `{epoch} pid={pid} ` prefix, no `[shell] ` prefix in the file (0 such lines for the pid),
under the pid `open` produced. The second doubt in "Why desk work cannot settle this" is also
answered: after a Cmd+Q quit (routed through the sidecar `handleExit`, pid gone in 2 s) the line
was still at 3937 and the pid's own `quit (Cmd+Q)` and `exit requested (code=Some(0))` lines
follow it. Teardown census (shell, sidecar, vite, :5173) empty. No code change.

Not exercised: the D-14 launcher-scheme literal. A chrome-side
`window.api.storeEmbedNavigate('com.epicgames.launcher://…')` from the console produced no embed
line at all; that hook needs a page-initiated navigation. The todo asked for at least one of the
two and the other passed.

The open observation below (unrotated `gamelib-shell.log`) stands: 334 960 bytes / 3939 lines
after this run, 15 of them from this session. Still not acted on.

Evidence, rig and the pid-scoped log extract:
`../../quick/261015-oc8-live-gate-261015-lz5-shell-diag-persiste/evidence/`.
