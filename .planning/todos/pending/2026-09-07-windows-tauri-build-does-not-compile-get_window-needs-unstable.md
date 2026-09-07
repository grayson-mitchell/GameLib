---
created: 2026-09-07T06:00:00.000Z
title: "Windows Tauri build does not compile: main.rs:6783 calls AppHandle::get_window(), which requires the `unstable` cargo feature that Phase 40 Plan 02 (D-03) scoped to macOS only"
area: build
severity: blocking
needs: source-fix
status: pending
found_by: "Phase 38 Plan 03 preflight (38-03), first-ever cargo build of this exact commit+Cargo.lock combination on a Windows host"
source: ".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-03-PLAN.md"
files:
  - src-tauri/src/main.rs
  - src-tauri/Cargo.toml
---

## Claim

`pnpm tauri:dev` **cannot compile at all on Windows** at commit
`c5f280032fba1dbca3c236fcc8e7421a1aefbd2c` (the `fix/steam-native-install-stability` tip
after merging the 4 outstanding `260906-hq8` commits). This is a genuine, pre-existing
source defect, not a Windows-environment/toolchain issue -- discovered only because this
was the **first time `cargo build` has ever run against this exact `Cargo.lock` on any
platform** (Cargo.lock is unchanged by the merge; nothing in the 4 pulled commits touches
`src-tauri/`).

## Root cause (measured, not inferred)

`src-tauri/src/main.rs:6783`, inside `dispatch_rust_channel`'s `"humble_login_close"` match
arm, has **no `#[cfg(target_os = "macos")]` gate**:

```rust
None => match app.get_window(label) {
    Some(window) => { window.close().map_err(|e| e.to_string())?; true }
    None => false,
},
```

`AppHandle::get_window` is declared behind `#[cfg(feature = "unstable")]` in the `tauri`
crate itself (verified by reading
`~/.cargo/registry/src/.../tauri-2.11.5/src/lib.rs:540-543`). `src-tauri/Cargo.toml`'s
unconditional `[dependencies]` block does **not** request `unstable` -- that feature was
deliberately moved into `[target.'cfg(target_os = "macos")'.dependencies]` by **Phase 40
Plan 02 (D-03)**, on the stated assumption (its own comment, `Cargo.toml:25-36`) that "the
Windows/Linux legs [never compile] against ... `open_pristine_epic_login_window`'s
webview-less `WindowBuilder`" -- i.e. that no Windows-reachable code path uses an
`unstable`-gated API. `main.rs:6783` is exactly such a path, and it is NOT
platform-gated, so it is compiled (and fails to compile) on every target, including
`x86_64-pc-windows-msvc`.

Phase 40 Plan 02's own verification method (`cargo tree -e features`, cited in its
Cargo.toml comment and `40-02-SUMMARY.md`) checks which Cargo **features get resolved**
per target -- it does not check whether the **codebase's own call sites** that need those
features are actually gated to match. That is the proof gap: the feature-tree diff was
correct (Windows genuinely resolves `tauri` without `unstable`), but the assumption "so no
Windows code needs it" was never verified by an actual Windows `cargo build`, and was
false.

## Verbatim compiler error

```
error[E0599]: no method named `get_window` found for reference `&AppHandle` in the current scope
   --> src\main.rs:6783:35
    |
6783 |                 None => match app.get_window(label) {
    |                                   ^^^^^^^^^^
    |
help: there is a method `get_webview_window` with a similar name
    |
6783 |                 None => match app.get_webview_window(label) {
    |                                    ++++++++
```

## Why this is not a mechanical rename

The code comment directly above this call site (`main.rs:6770-6775`) explains **why**
`get_window` was used instead of `get_webview_window`: the "pristine" Epic/Humble login
window is a plain `tauri::Window` with a raw `WKWebView` attached, never a Tauri-managed
`WebviewWindow` -- so `get_webview_window(label)` can never find it, for any label.
Mechanically substituting `get_webview_window` here would silently reintroduce the exact
bug this fallback branch was written to fix (the pristine window never closing after a
successful login). A correct fix needs either (a) the `unstable` feature available on
Windows too (widens Phase 40 Plan 02's scoping, a decision that phase owns), or (b) a
different non-`unstable` way to look up a plain `Window` by label on Windows, if one
exists in `tauri` 2.11.5's stable API surface -- not verified here.

## Blast radius (not fully explored -- STOPPED at the first error)

This is the **first** compile error `cargo` reports; `cargo` stops enumerating further
errors mid-crate in some configurations. There may be additional Windows-unreachable
`unstable`-gated call sites elsewhere in `main.rs` that will surface only after this one
is fixed. Whoever picks this up should re-run `cargo build`/`pnpm tauri:dev` after fixing
this site to check for a second wave.

## Consequence for other phases/decisions

- **`38-W04`** (CI-produced NSIS installer smoke-launch) has almost certainly never
  succeeded either -- `release-tauri.yml`'s Windows leg runs the same `cargo build`
  against the same `Cargo.lock`. This todo should be cross-checked before that item is
  attempted.
- **Phase 43** (off-macOS embed backend) assumed the Windows/Linux legs were merely
  *missing* a feature for future work (`Window::add_child`); this finding shows the
  Windows leg is currently **not buildable at all**, which is a precondition Phase 43's
  own planning should account for.
- Phase 38 (`38-03`) cannot proceed past its preflight while this blocks `pnpm tauri:dev`
  from producing a running window -- every downstream Task 1/2/3 deliverable in that plan
  depends on a running app.

## Out of scope for Phase 38

Phase 38 ships no code (`38-CONTEXT.md`: "Phase 38 delivers observations, not code").
This todo records the observation; the fix itself belongs to whichever phase owns
`src-tauri/Cargo.toml`'s feature scoping (Phase 40's D-03 origin, or a new phase).
