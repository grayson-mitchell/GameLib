---
created: 2026-09-17T00:00:00.000Z
title: 'Linux release leg fails to COMPILE: E0599 get_window missing on &AppHandle, but the same commit compiled fine on macOS'
area: build
severity: major
platform: linux
ready: live-gate
needs: verify-fix-on-live-linux-leg
status: OPEN
found_by: 'GitHub Actions run 35223308954 on grayson-mitchell/GameLib, triggered by the throwaway annotated tag v0.7.0-notarize-test1 at commit cc2d66248. The tag was deleted from origin and locally after the run.'
source: '.planning/todos/pending/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md'
files:
  - src-tauri/src/main.rs
  - src-tauri/Cargo.toml
---

## Problem

Verbatim:

```
error[E0599]: no method named `get_window` found for reference `&AppHandle` in the current scope
For more information about this error, try `rustc --explain E0599`.
error: could not compile `gamelib-shell` (bin "gamelib-shell") due to 1 previous error
failed to build app: failed to build app
##[error]Command "pnpm ["tauri","build"]" failed with exit code 1
```

Call sites in `src-tauri/src/main.rs`:

```
:5203   let window = app.get_window(MAIN_WINDOW_LABEL).ok_or_else(|| {
:6915   None => match app.get_window(label) {
```

Note: `:3534` is a doc-comment mention and `:6908` is a comment — NOT code. A later session
counting call sites by grep will otherwise find four; there are two actual call sites.

## The observation that makes this interesting

The SAME commit compiled fine on macOS — that leg reached notarization. So this is NOT simply
"the code is wrong", and anyone who reads it that way will fix the wrong thing.

## Hypothesis — CONFIRMED (debug session `linux-get-window-e0599`, 2026-09-21)

Confirmed against the vendored `tauri-2.11.5` crate source (`src/lib.rs:540-543`):
`Manager::get_window` carries `#[cfg(feature = "unstable")]`. D-03 scopes `unstable` to
`[target.'cfg(target_os = "macos")'.dependencies]` only (`Cargo.toml:113`) — this is a
deliberate, measured decision, not drift; do not reverse it.

**Revision to this todo's own census:** of the two call sites, only ONE is actually broken on
Linux. `main.rs:5203` (inside `store_embed_open`) is already `#[cfg(target_os = "macos")]`-gated
at the function level and is correctly absent from the Linux compile unit — it needed no fix.
`main.rs:6915` (the `get_window` fallback in the `"humble_login_close"` arm of
`dispatch_rust_channel`, itself uncfg'd) was the sole real E0599 source. This matches the
verbatim symptom log precisely: "due to **1** previous error", not 2.

`get_webview_window` (`tauri-2.11.5/src/lib.rs:576`, no cfg gate — stable) IS the correct
replacement, confirmed by reading the vendored source, not asserted. It was already tried first
at the surviving call site; only its `None`-fallback (the actual `get_window` call) needed
gating.

## Fix applied

`main.rs:6910-6934`: wrapped the `get_window` fallback in
`#[cfg(target_os = "macos")] { ... } #[cfg(not(target_os = "macos"))] { false }`, matching the
convention already established elsewhere in this file for `unstable`-gated calls (e.g. the
`"store_embed_open"` dispatch arm, `main.rs:7663-7676`). The window this fallback exists to find
(`open_pristine_epic_login_window`'s raw-WKWebView `Window`) is itself macOS-only
(`main.rs:3157`), so resolving `false` on non-macOS changes no real behavior.

## Verification — INCOMPLETE, needs a live Linux leg

`cargo check --bin gamelib-shell` passes on the macOS host (sanity only — proves nothing about
Linux). A real `cargo check --target x86_64-unknown-linux-gnu` was attempted from this Mac and
failed, but for an unrelated reason: `gobject-sys`/`gio-sys`/`gdk-sys` build scripts fail because
`pkg-config` has no Linux GTK/WebKit2GTK cross-compilation sysroot on this machine — the failure
occurs before `gamelib-shell`'s own source is reached. **No sound local check exists on this
host.** This todo stays OPEN, `ready: live-gate`, until a tag push reaches `release-tauri.yml`'s
`ubuntu-24.04` leg (or an equivalent check runs on a real Linux machine/CI runner with
GTK/WebKit2GTK dev packages) and comes back green.

Full evidence trail: `.planning/debug/linux-get-window-e0599.md` (session not yet archived —
awaiting this live verification).

## Related

- `2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md` — sibling
  failure from the same run, unrelated cause.
- `2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md` — sibling
  failure from the same run, unrelated cause.

Shared provenance: this was the FIRST tag push `release-tauri.yml` has ever completed — its
header comment says "UNPROVEN LIVE: this pipeline has never completed a real tag-push run" — all
three matrix legs failed, for three UNRELATED reasons, and all three defects are pre-existing.
