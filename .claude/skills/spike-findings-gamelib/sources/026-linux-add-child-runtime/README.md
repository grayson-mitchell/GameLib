---
spike: 026
idea: idea-c-tauri-rearchitecture
name: linux-add-child-runtime
type: standard
validates: "Given spike 025's compiling Linux `add_child` embed, when its geometry, cookie-jar isolation, and a second multiwebview window are exercised the same way spikes 017/018 exercised them on macOS, then do those same behaviours carry over to Linux"
verdict: PARTIAL
related: [016, 017, 018, 025, 027]
tags: [tauri, webview, multiwebview, unstable, embed, linux, webkit2gtk, gtk, gtkbox, gtkfixed, data-store-identifier, segfault, phase-38, 38-E01, 38-E02]
---

# Spike 026: Linux `add_child` runtime behaviour — two silent no-ops and one segfault

## What This Validates

Spike 025 established that `add_child` compiles and succeeds on Linux. This spike asks the
harder question spike 025 deliberately deferred: do spikes 017 (bounds sync) and 018 (cookie
coexistence/isolation) — both **VALIDATED on macOS** and load-bearing for the real in-app store
browser design (`MANIFEST.md`'s "Requirements (Idea C — in-app store browser...)" section) —
actually hold on Linux, using the identical API calls. It reuses spike 025's harness unchanged
(`.planning/spikes/025-linux-add-child-compile/app/`); no new code was written for this spike,
only new runs of the same binary plus one temporary instrumentation flag added to isolate a crash
(see Investigation Trail step 4).

## Research — reading wry's own source, not just re-running the harness

Once the runtime numbers looked wrong (see below), the CONVENTIONS.md rule "ground verdicts in
observed evidence" pointed at one more level of evidence than a log: the actual backend source
that decides what a "bounds" write means on each OS. Read directly, not inferred:

- **`wry-0.57.0/src/webkitgtk/mod.rs:687-717` (`add_to_container`)** — a webview is packed into
  whatever GTK container it's handed: a `GtkBox` gets `pack_start(webview, true, true, 0)`
  (equal-share flex packing, `is_in_fixed_parent = false`); only a `GtkFixed` gets absolute
  placement (`fixed.put(webview, x, y)`, `is_in_fixed_parent = true`).
- **`wry-0.57.0/src/webkitgtk/mod.rs:963-983` (`set_bounds`)** — the X11-specific branch aside
  (a genuinely separate child *window*, not this shape), the GTK-widget branch is gated:
  `if self.is_in_fixed_parent { self.webview.size_allocate(...) }`. If the parent was a `GtkBox`,
  this method still returns `Ok(())` but **writes nothing**.
- **`tauri-runtime-wry-2.12.0/src/lib.rs:5185-5192`** — for `WebviewKind::WindowChild` (the kind
  `add_child` uses) on any non-Windows/macOS/iOS/Android target, Tauri calls
  `window.default_vbox()` and packs into it — **always a `GtkBox`**, with the comment
  `// only way to account for menu bar height, and also works for multiwebviews :)` confirming
  this was a deliberate choice, not an oversight. `WebviewKind::WindowContent` (the **main**
  webview) uses the exact same `default_vbox()` on Linux (`:5210-5215`) — so the main webview and
  any `add_child` child share **one** `GtkBox`, and GTK's default `pack_start(expand=true,
  fill=true)` splits its allocation evenly among however many children it holds.
- **`wry-0.57.0/src/lib.rs:2479-2481` (`fetch_data_store_identifiers`)** — hardcoded to
  `wkwebview::InnerWebView::fetch_data_store_identifiers`, the **macOS-only** backend module.
  `data_store_identifier` is declared as a generic cross-platform builder field
  (`lib.rs:1581/1620/1639`) but grep confirms `webkitgtk/mod.rs` never reads it at all — the GTK
  backend accepts the call, does nothing with it, and every webview shares the one default
  `WebKitWebContext`.
- **Windows contrast, checked to bound how much of this generalises**: `wry-0.57.0/src/webview2/mod.rs`
  uses `WS_CHILD` + unconditional `SetWindowPos` in both webview creation (`:230-274`) and
  `set_bounds` (`:1526-1553`) — the same "real absolutely-positioned child window" family macOS's
  NSView subview belongs to, not Linux's box-packing family. This narrows (does not resolve)
  `38-E01`: Windows is architecturally the *other* case, so a Linux failure here is not by itself
  evidence against Windows too. See spike 027 for what could be checked from this Linux host.

## Investigation Trail

1. **`add_child` bounds readback is `{0,0,0,0}` immediately.** First anomaly, noted but not
   pursued alone — a single zero-reading is exactly the kind of result CONVENTIONS.md says not to
   trust without a positive control, so the investigation continued rather than stopping here.
2. **`list_webviews` right after creation: both `main` and `store-embed` report
   `{x:0,y:0,w:1280,h:450}`.** 450 is exactly half of the window's configured 900px height — a
   positive, structured pattern, not noise. This is what triggered reading wry's source rather
   than re-running with different parameters.
3. **`set_embed_bounds` round-trip, three different requested rects
   (`290,96,900,700` / `10,400,400,300` / `290.5,96.5,760.25,560.75`)** — every one of the three
   calls returned `Ok` with **identical** `readbackLogical: {h:450,w:1280,x:0,y:0}`, byte-identical
   to the pre-call state. The call is not erroring; it is a **silent no-op**, confirmed structural
   by the source read above (`is_in_fixed_parent` is always `false` for this code path on Linux).
4. **The Probe B segfault, isolated.** First two runs (`cargo run` then the raw binary,
   `SPIKE_AUTORUN_EXIT=1` both times) each reached Phase 6 (`create_multi_window`: a second bare
   `Window` with a local `WebviewUrl::App` panel child plus an external GOG-store child) and then
   silently died mid-navigation with **no** Rust panic in stdout. `journalctl` resolved it:
   ```
   spike-025-linux[38847]: segfault at 48 ip 000076415b4b8102 ... in libwebkit2gtk-4.1.so.0.19.7[...]
   spike-025-linux[42491]: segfault at 48 ip 0000727184cb8102 ... in libwebkit2gtk-4.1.so.0.19.7[...]
   ```
   Same library, same offset (`eb8102`), two independent processes — a real, reproducible native
   crash, not a fluke. To isolate whether it was the *second window* shape or something specific
   to GOG's page, a one-line env-gate (`SPIKE_SKIP_PROBE_B`) was added to `main.rs`'s `autorun()`
   to skip Phase 6 only, keeping every other phase (1–5, 7, 8 — the *actual* candidate shape for
   GameLib's in-app store tab) identical. Rebuilt (1.95s, incremental), reran: **`=== COMPLETE
   ===`, clean exit, zero segfaults in `journalctl`.** The crash is isolated to Probe B's
   second-`Window`-plus-two-children shape; the primary single-embed-on-the-existing-window shape
   this project actually needs is unaffected by it.
5. **`data_store_identifier` isolation, re-checked against the clean (Probe-B-skipped) run.**
   Phase 8 creates a *second*, `isolatedStore: true` embed and reads its cookies expecting only
   `spike_plain`/`spike_httponly` (per macOS spike 018's result: a fresh isolated jar saw none of
   the shared jar's Steam cookies). The Linux result: **all 10 cookies from the shared jar came
   back, including every `store.steampowered.com` and `gog.com` cookie from earlier phases** —
   the "isolated" child saw an **identical** cookie set to the main/shared handle. This is not an
   ambiguous empty-result case (CONVENTIONS.md's "never trust a bare empty list" rule) — it is a
   non-empty, wrong-but-confident result, and the source read above (step "fetch_data_store_identifiers")
   root-causes exactly why: the GTK backend never reads the identifier at all.

## Results

**PARTIAL.** Three concrete, source-confirmed findings, none of them "it doesn't work at all,"
all of them "the exact API contract spikes 017/018 established on macOS does not hold on Linux
the same way":

- **Geometry (`set_position`/`set_size`) is a silent structural no-op on Linux**, because
  `add_child`'s `WebviewKind::WindowChild` always packs into the window's shared `GtkBox`
  (`default_vbox()`), never a `GtkFixed`, and wry's `set_bounds` only writes when the parent is a
  `GtkFixed`. **This is not a retina/drag-resize-latency refinement gap (which is what `38-E03`/
  `38-E04` already asked) — it is a layer below that: the entire "renderer measures a DOM rect,
  backend places the child there" design 017 validated has no floor to stand on here.** A Linux
  in-app store tab needs either (a) a genuinely different layout strategy that works *with*
  GTK box-packing instead of fighting it, or (b) a Tauri/wry patch that exposes a `GtkFixed`
  option for `WindowChild` webviews, which does not exist in tauri-runtime-wry 2.12.0 today.
- **`data_store_identifier` per-store cookie isolation is a silent no-op on Linux** — the GTK
  backend accepts the builder call and ignores it; every webview shares one `WebKitWebContext`.
  This resolves spike 015/018's own stated "Windows/Linux parity unverified" caveat, for Linux,
  in the negative.
- **A reproducible native segfault (2-for-2) in `libwebkit2gtk-4.1.so.0.19.7`** when a second
  `Window` is created with two child webviews and one navigates externally — isolated away from,
  and not present in, the single-embed-on-the-main-window shape GameLib actually needs.

**What still works, unchanged from macOS:** `add_child` itself succeeds (faster, even — 2ms vs
42–51ms); a real external store page loads, navigates, and sets/reads real cookies through the
same `cookies()`/`on_page_load`/`on_navigation` surface; `hide()`/`show()` toggle correctly;
a destroyed child's handle errors loudly on next use, matching spike 015's handle-lifetime rule
exactly.

**Impact on Phase 38.** `38-E01`/`38-E02`'s recorded premise — "no implementation exists yet" —
is superseded for Linux: an implementation exists, compiles, and partially works, with two
specific, source-grounded gaps and one specific, reproducible crash, none of which were known
before this session. `38-E03`/`38-E04` (retina/drag-resize latency) remain genuinely open and
orthogonal — this spike's `DISPLAY=:1` is not documented as a HiDPI output, so scale-factor
behaviour was not (and could not usefully be) exercised here.
