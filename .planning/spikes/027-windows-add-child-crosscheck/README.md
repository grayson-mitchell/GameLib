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

## Live Windows run — sitting 13 (2026-09-30)

**PASS on a real Windows host.** This answers the runtime question the Results section above left
open, and `38-E01` was discharged on it (Phase 38 sitting 13, quick `260930-o75`). The frontmatter
`verdict: PARTIAL` is left as written because it scores this spike's own cross-check question, which
this Linux session could only half answer. The live run below is a separate measurement on a
different host.

**Host and build.** Windows 11 Home 10.0.26200, one display at DPI 120 (scale factor 1.25). A native
`cargo build` on `x86_64-pc-windows-msvc` (rustc 1.98.1) of the UNMODIFIED `app/` source finished
clean in 1m17s, which answers the MSVC type-check this spike could not reach (the `llvm-rc` gap was a
Linux-host tooling gap, as recorded). `Cargo.lock` resolves tauri 2.12.0, tao 0.37.1, wry 0.57.0 and
webview2-com 0.39.1. The harness's `[env]` log line (`main.rs:188-189`) and the header comment
(`main.rs:3`) still say "tauri 2.11.5 / wry 0.55.1": that is a stale hard-coded label, not a
measurement.

**Instruments.** The harness's own API log, and an independent OS instrument (`hwnd_sampler.ps1`, a
separate process sampling every descendant HWND's class, visibility and physical client rect at
50 ms; 35 distinct states). Criteria P1–P5 were written before the run.

**Geometry at ×1.25, 0 px error** (API readback and OS rect identical, physical px):

| step | requested (logical) | OS container rect |
|---|---|---|
| 1a | 290,96 760×560 | 363,120 950×700 |
| 4a | 290,96 900×700 | 363,120 1125×875 |
| 4b | 10,400 400×300 | 13,500 500×375 |
| 4c (fractional, not scored) | — | 363,121 950×701 |

`add_child` returned `OK` in 95 ms and attached a real `WS_CHILD` `WRY_WEBVIEW` container to the
main window. It hid and showed with its rect unchanged, and its subtree was gone after destroy. The
slot's ResizeObserver drove the container, with the cross-process `Chrome_RenderWidgetHostHWND`
inside it, within about 100 ms per step (renderer within 1 px of the container). Probe B (a bare
Window with two children) placed them side by side as requested. An unscored anomaly, in which the
main embed moved to a narrow slot-edge rect while probe B's window was created, is most likely the
panel's slot sync reading a momentary layout. That is probable, not proven. It reproduced at scale
2.0.

**`data_store_identifier` is a silent no-op on WebView2 too.** The "isolated" child's jar reported
all 15 cookies, including the Steam and GOG cookies from the shared jar. wry 0.57.0 defines
`with_data_store_identifier` and its field only under
`#[cfg(any(target_os = "macos", target_os = "ios"))]` (`src/lib.rs:1579`, `:1612`). Recorded in
`.planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md`.

**Two harness changes, made AFTER `38-E01` was scored on the unmodified source** (for `38-E03`(b)
and `38-E04`(b)):

1. `app/dist/index.html`: the slot sync was ported from a pure trailing debounce (`clearTimeout` +
   restart, 40 ms) to the shipped app's `useStoreEmbedHost.ts` `scheduleFlush`, a leading-edge
   throttle with a trailing flush. The debounce is the defect plan 40-11's live gate found, and
   drag-latency numbers taken against it would measure the harness.
2. `app/src/main.rs`: `create_embed` and `create_multi_window` are now `async` commands wrapping
   `create_embed_impl`/`create_multi_window_impl`. **Finding:** as SYNC `#[tauri::command]`s they
   run on the main thread, and from the panel `create_embed` hung on Windows. The log showed
   `[embed] add_child` with no `OK`/`FAILED` while the window kept pumping messages
   (`Responding=True`). Tauri documents creating webviews from sync commands as a Windows
   deadlock. The autorun still calls the `_impl` bodies through `run_on_main_thread`, so the E01
   path is unchanged. GameLib's shipped `store_embed_open` is reached through the sidecar RPC
   dispatch, not a Tauri command. A Windows un-gating must keep it that way.

With those changes, `38-E03`(b) at scale 2.0 and `38-E04`(b) drag-resize both PASSED; see the
evidence below. Both items stay open for their other branches.

**Claim limit.** One host, one monitor, and this harness's lockfile, NOT the shipped app:
`src-tauri/Cargo.toml` still target-gates `unstable` away from Windows.

**Evidence:** `.planning/quick/260930-o75-phase-38-sitting-13-windows-38-e01-38-w0/evidence/`
(`e01-prediction.md`, `e01-verdict.md`, `e03b-prediction.md`, `e04b-prediction.md`,
`e03b-e04b-verdict.md`, run logs, event exports and `*-hwnd/` sampler captures), and
`38-VERIFICATION.md`'s `38-E01` `result:` plus the `sitting_13_2026_09_30` keys on `38-E03` and
`38-E04`.

**Side effect worth knowing:** building this spike with
`CARGO_TARGET_DIR=.planning/spikes/027-windows-add-child-crosscheck/target-cache` while
`pnpm tauri:dev` is running crashed the Vite dev server. chokidar hit `EBUSY` on the fresh `.exe`
under `target-cache`. See
`.planning/todos/completed/2026-09-30-vite-dev-watcher-crashes-on-spike-target-cache-ebusy.md`.
