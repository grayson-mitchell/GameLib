---
created: 2026-09-28
title: 'On Linux an add_child store embed cannot be positioned — set_bounds is a silent no-op because Tauri packs WindowChild webviews into the window''s shared GtkBox. The Linux layout strategy must be decided before the embed is un-gated there.'
found_during: spikes 025/026 (2026-09-28; commits c54e047ca, 369f482a4), filed by quick 260928-raq
severity: minor
platform: linux
ready: human
area: store-embed
files:
  - src-tauri/Cargo.toml
  - .planning/spikes/026-linux-add-child-runtime/README.md
  - .planning/spikes/025-linux-add-child-compile/app/src/main.rs
---

## Mechanism

- `tauri-runtime-wry-2.12.0/src/lib.rs:5185-5192`: for `WebviewKind::WindowChild` (the kind
  `add_child` uses), on any non-Windows/macOS/iOS/Android target, Tauri calls
  `window.default_vbox()` and packs the child into it — always a `GtkBox`. `WebviewKind::WindowContent`
  (the main webview) uses the same `default_vbox()` on Linux (`:5210-5215`), so the main webview
  and any `add_child` child share ONE `GtkBox`, whose default `pack_start(expand=true, fill=true)`
  splits its allocation evenly among however many children it holds.
- `wry-0.57.0/src/webkitgtk/mod.rs:687-717` (`add_to_container`): a `GtkBox` parent gets
  `pack_start` (`is_in_fixed_parent = false`); only a `GtkFixed` parent gets absolute placement
  (`is_in_fixed_parent = true`).
- `wry-0.57.0/src/webkitgtk/mod.rs:963-983` (`set_bounds`): writes geometry only when
  `is_in_fixed_parent`. Otherwise it returns `Ok(())` and writes nothing — a silent no-op, not an
  error.

## Measured (spike 026, steps 1-3)

- The bounds readback immediately after `add_child` was `{x:0,y:0,w:0,h:0}`.
- Both webviews (main + child) were pinned at `{x:0,y:0,w:1280,h:450}` — an even split of the
  window's configured 900px height.
- Three different requested rects (`290,96,900,700` / `10,400,400,300` /
  `290.5,96.5,760.25,560.75`) all returned `Ok` with an identical readback. Cite
  `run-clean-probe-b-skipped.log` (spike 025) by path only — do not quote its contents.

## Why minor

The SHIPPED embed is macOS-only: `src-tauri/Cargo.toml:114-128` gates the `unstable` feature to
`[target.'cfg(target_os = "macos")'.dependencies]` (Phase 40 D-01/D-03), so nothing live is
affected today. This is a design wall for any FUTURE Linux store tab, not a regression in a
shipped feature.

## The decision (options, not a recommendation)

- (a) A layout strategy that works WITH GTK box packing instead of fighting it (spike 026's
  option a).
- (b) A `tauri-runtime-wry` change, upstream or forked, that puts Linux `WindowChild` webviews in
  a `GtkFixed`. wry's `add_to_container` already supports a `GtkFixed` parent — the gap is in
  `tauri-runtime-wry`'s choice of container for this webview kind, not in wry itself.
- (c) A separate top-level `Window` per store. CONSTRAINED: a second `Window` holding two child
  webviews segfaulted natively in `libwebkit2gtk-4.1.so.0.19.7`, in 2 of 2 runs, at the identical
  instruction offset. See spike 026 step 4 and
  `.planning/spikes/025-linux-add-child-compile/crash-segfault-journalctl.txt`. The crash is NOT
  root-caused. The single-embed-on-the-main-window shape was clean with that phase skipped. Do
  not choose (c) until the crash is understood.
- (d) Status quo: Linux keeps the Phase 40 non-macOS panel (plan 40-10) and gets no embed.

The segfault is recorded HERE, not as its own todo: it is reachable only through option (c), and
a standalone todo for it would have no trigger of its own.

## What this gates

- The LINUX branches of Phase 38 ledger items `38-E03` and `38-E04`. Their `blocked_by` names
  this exact filename.
- When the decision above lands, re-scope those two branches in `38-VERIFICATION.md` in the same
  change.

## Falsifiable re-open

If a future `tauri-runtime-wry` stops packing `WindowChild` into `default_vbox()` on Linux, or
wry's `set_bounds` drops the `is_in_fixed_parent` gate, re-run spike 025's bounds round-trip
before assuming anything has changed.
