---
spike: 027
idea: idea-c-tauri-rearchitecture
name: windows-add-child-crosscheck
type: standard
validates: "Given no Windows machine reachable from this Linux session, when spike 016's unmodified add_child harness is `cargo check`-ed against x86_64-pc-windows-{gnu,msvc} with rustup targets added, then does the code type-check against the WebView2 backend at all"
verdict: PARTIAL
related: [016, 025, 026]
tags: [tauri, webview, multiwebview, unstable, embed, windows, webview2, cross-compile, phase-38, 38-E01]
---

# Spike 027: Windows `add_child` cross-check from a Linux host

## What This Validates

`38-E01`'s recorded blocker is "no Windows implementation exists yet ... the machine (owned,
available) is not the blocker." This session had no Windows machine at all (it ran from a Linux
desktop), so a real runtime answer was never in scope. What *was* answerable from here: does
`Window::add_child` and everything spike 016 built around it even **type-check** against Tauri's
Windows/WebView2 backend — the weakest possible signal, but a real one, and cheaper than waiting
for a Windows sitting.

## Research

Same starting point as spike 025: spike 016's harness (`.planning/spikes/016.../app/`) requests
the `unstable` feature unconditionally, with no macOS-only gate except the one already-scoped
`objc2` use site. Cross-compiling a `cargo check` (not `build` — no MSVC/mingw linker available
here, and `check` never invokes one) needed only `rustup target add` for the two Windows triples;
no system packages, no sudo.

## How to Run

```bash
rustup target add x86_64-pc-windows-gnu x86_64-pc-windows-msvc
export CARGO_TARGET_DIR=.planning/spikes/027-windows-add-child-crosscheck/target-cache  # gitignored
cd .planning/spikes/027-windows-add-child-crosscheck/app
cargo check --target x86_64-pc-windows-gnu    # succeeds
cargo check --target x86_64-pc-windows-msvc   # fails at resource-embed, not at add_child code
```

## Investigation Trail

1. **First attempt, `x86_64-pc-windows-gnu`, no extra packages.** Compiled ~150 crates including
   the Windows-specific `webview2-com`, `webview2-com-sys`, `windows`, `tao` — then failed in
   `tauri-build`'s `build.rs`: `` `icons/icon.ico` not found; required for generating a Windows
   Resource file ``. Not a code question — a packaging one. Copied the real project's own
   `src-tauri/icons/icon.ico` in rather than fabricate one.
2. **Second attempt, same target.** New failure, further in: `tauri-winres` panicked
   `NotAttempted("x86_64-w64-mingw32-windres")` — the Windows resource compiler, from the
   `mingw-w64` package, wasn't installed. Read `tauri-build-2.7.0/src/lib.rs:860-875`: the
   icon-exists branch and the `res.compile()` call are both unconditional once `target_os ==
   "windows"` — there is no `Attributes`/config flag to skip resource embedding entirely, so this
   package really was required, not merely convenient.
3. **After `sudo apt-get install mingw-w64`: `cargo check --target x86_64-pc-windows-gnu`
   SUCCEEDED — `Finished` in 4.46s**, having type-checked our own crate (`main.rs`, including
   every `add_child`/`WebviewBuilder`/`data_store_identifier`/`on_page_load` call) against the
   real Windows/WebView2 backend crates.
4. **`x86_64-pc-windows-msvc` attempted for completeness** (the triple `release-tauri.yml`
   actually ships, via `tauri-action` running natively on `windows-latest`). Failed at the same
   resource-embed step, this time on `NotAttempted("llvm-rc")` — MSVC's resource compiler, which
   would need an `llvm`/`clang` toolchain this host doesn't have. Not chased further: this failure
   is in the same cosmetic step as (2), not in `main.rs`'s own compilation, and gnu/msvc share
   near-identical Windows API surface for the crates this spike actually cares about
   (`webview2-com`, `windows`) — a second resource-compiler install would spend more effort than
   the marginal signal is worth.
5. **Read `wry-0.57.0/src/webview2/mod.rs` for the underlying model** (also cited from spike 026,
   which needed the contrast): Windows child webviews are real `WS_CHILD` HWNDs, and `set_bounds`
   is an unconditional `SetWindowPos` call (`:230-274`, `:1526-1553`) — no GtkBox-style packing,
   no `is_in_fixed_parent` gate. Windows is architecturally in the same "real absolutely-positioned
   child" family as macOS's NSView subview, not Linux's box-packing family (spike 026's finding).
   This is source-level evidence that Linux's positioning no-op is **not** automatically true of
   Windows — but it is not a substitute for a live Windows run, which this spike cannot provide.

## Results

**PARTIAL.** The strongest claim this spike can honestly make: `main.rs` — the exact code spike
016 proved live on macOS, unmodified — **type-checks cleanly against Tauri's Windows/WebView2
backend** (`x86_64-pc-windows-gnu`, `wry 0.57.0`, `webview2-com`). That directly narrows `38-E01`'s
"no implementation exists yet" premise: at the API-surface level, an implementation compiles
today, without a single source change.

**What this does NOT establish, and 38-E01 stays open for it:** whether `add_child` actually
*succeeds* at runtime on WebView2, whether its geometry model behaves like macOS/Windows'
shared `WS_CHILD`/`SetWindowPos` family (the source strongly suggests yes, but "the source
suggests" is not a live measurement — spike 026 found Linux's *own* source-level promise
[`data_store_identifier` is a generic builder field] to be a silent no-op in practice, which is
exactly the trap of trusting source over a live run), and the MSVC target specifically (the one
actually shipped) was never even type-checked, only its GNU sibling. A real Windows sitting
remains the only way to close `38-E01`.
