---
spike: 028
idea: idea-c-tauri-rearchitecture
name: linux-add-child-gtkbox-packing-lever
type: standard
validates: "Given spike 026's confirmed shared-GtkBox packing and no-op set_bounds on Linux, when application code reaches the real GTK objects through stock Tauri API (Window::default_vbox(), Webview::with_webview -> PlatformWebview::inner()) and applies raw gtk-rs packing/positioning calls, then can a non-50/50 layout be achieved without forking wry or tauri-runtime-wry"
verdict: PARTIAL
related: [016, 017, 025, 026, 027]
tags: [tauri, webview, multiwebview, unstable, embed, linux, webkit2gtk, gtk, gtkbox, gtkfixed, default_vbox, with_webview, phase-38, reliability]
---

# Spike 028: GTK box-packing levers — a real lever exists, but a bigger, unexplained reliability gap does too

## What This Validates

The positioning todo's own `## Decision (2026-09-28)` section (option (a), GTK-box-native
layout, `260928-upj`) named one explicit unresolved question: *"Can anything other than [GTK's]
default even split be reached through the platform widget handle... without changing
`tauri-runtime-wry`? ... If no usable layout turns out to be reachable within box packing, bring
that back to the operator as a finding."* The operator chose to spike this directly
(2026-09-29, this session) rather than accept it as design work for an undefined future phase.

This spike is scoped to answering that ONE question — read-only validation, no shipped feature
code, no touch to `src-tauri/Cargo.toml`'s macOS-only `unstable` gate. It reuses spike
025/026's harness unchanged in shape, adding new probes only.

## Research — reading the actual Tauri/wry/gtk-rs source on disk before writing any code

Same discipline as 026/027: read the dependency, don't just re-run the harness and guess.

- **`tauri::Window::default_vbox()` and `tauri::WebviewWindow::default_vbox()` are PUBLIC,
  application-facing methods** (`tauri-2.12.0/src/window/mod.rs:1809`,
  `src/webview/webview_window.rs:1999`) — gated only on the Linux target family
  (`target_os` in `linux, dragonfly, freebsd, netbsd, openbsd`), **not** behind `unstable`. They
  return the real `gtk::Box` wry packs every webview into
  (`tauri-runtime-wry-2.12.0/src/lib.rs:1999-2001`, via the same `window_getter!`
  blocking-dispatch macro `gtk_window()` uses). No fork of tauri-runtime-wry or wry is needed to
  reach it.
- **`tauri::Webview::with_webview` -> `PlatformWebview::inner()`** (`tauri-2.12.0/src/webview/
  mod.rs:1862`, `:177`) hands back the exact `webkit2gtk::WebView` for ONE SPECIFIC webview by
  label — no need to guess which `GtkBox` child belongs to which webview by pack order.
  `webkit2gtk-2.0.2/src/auto/web_view.rs:56`'s `glib::wrapper!` confirms
  `WebView` `@extends WebViewBase, gtk::Container, gtk::Widget` — so every `gtk::prelude::WidgetExt`/
  `ContainerExt` method is callable on it directly via gtk-rs's blanket trait impls, with no
  upcast needed.
- **A dead end ruled out by source alone, never run**: wry's own `WebView::reparent`
  (`wry-0.57.0/src/webkitgtk/mod.rs:1218-1244`) can move a webview into a `GtkFixed` and correctly
  calls `.put(webview, x, y)` — but it never touches the `is_in_fixed_parent` field `set_bounds`
  gates on (set once at construction, `:341`, read at `:978`, never revisited). Reparenting via
  wry's OWN method could not have unlocked wry's OWN `set_bounds`. This spike's `reparent_fixed`
  lever therefore does the container surgery directly with stock `gtk-rs` calls on the widget
  handle obtained above, and positions it with raw `gtk::Fixed::move_` — it never calls wry's
  `reparent` or `set_bounds` at all.
- **`wry::WebView::bounds()`'s GTK-widget branch is itself incomplete** (`webkitgtk/mod.rs:934-957`):
  off the `x11` cargo feature's separate `XGetWindowAttributes` branch, it reads ONLY
  `self.webview.allocated_size()` and **never sets `bounds.position`** — it stays at
  `Rect::default()`, i.e. `(0,0)`, unconditionally. This explains an unexplained oddity in spike
  026's own data (both webviews reported at `x:0,y:0`, which read as if neither had moved from the
  origin): that was never a real measurement of position, just this branch's own gap. Spike 028's
  `gtk_lever::widget_geometry()` uses `Widget::translate_coordinates` against the toplevel instead,
  which gives a real, correct, window-absolute position regardless of which `bounds()` branch wry
  took.
- **gtk-rs pinning**: the harness's Cargo.lock already resolves `gtk = "0.18.2"` and
  `webkit2gtk = "2.0.2"` transitively through `wry`. `Cargo.toml` pins the harness's own direct
  `gtk` dependency to the identical `"0.18.2"`, so there is exactly one `gtk::Box`/`gtk::Widget`
  type in the dependency graph — not two incompatible major-version copies.

## How to Run

```
cd .planning/spikes/025-linux-add-child-compile/app
CARGO_TARGET_DIR=<repo>/src-tauri/target cargo build
SPIKE_AUTORUN=1 SPIKE_AUTORUN_EXIT=1 SPIKE_SKIP_PROBE_B=1 \
  CARGO_TARGET_DIR=<repo>/src-tauri/target cargo run
```

Phase 9 (the new phase this spike adds, steps `9a`-`9o`) runs after spikes 016-018's original
Phases 0-8. `SPIKE_ONLY_028=1` skips straight to Phase 9 as the first-ever `add_child` in the
process (used for the diagnostic below). `SPIKE_PAUSE_028=<secs>` pauses after step `9k` for a
manual screenshot.

## What to Expect

Four levers tested in sequence, each with a before/after raw-GTK snapshot (`gtkbox_snapshot`,
walking `default_vbox()`'s real children) AND a cross-check against wry's own `list_webviews`
oracle:

1. `set_child_packing` — `BoxExt::set_child_packing(embed, expand=false, fill=false, padding=0)`
   on the shared vbox.
2. `size_request` — `WidgetExt::set_size_request(300, 200)` on the embed's own widget, layered on
   top of (1).
3. A real window resize (900px -> 1100px height), to test whether either lever's effect (if any)
   survives a genuine relayout trigger, or only appeared because nothing had recomputed yet.
4. `reparent_fixed` + `fixed_move` — remove the embed's widget from the shared vbox, wrap it in a
   freshly created `gtk::Fixed` packed into the vbox in its place, then `gtk::Fixed::move_` +
   `set_size_request` it to an arbitrary off-center rect (`x=150,y=250,w=700,h=400` against a
   1280x1100 window) — followed by a SECOND resize (1100px -> 900px) to test survival again.

## Investigation Trail

### Run 1 (the only clean run measured) — a real, working lever, but not the one expected

The very first execution (before any of the diagnostic instrumentation below existed) produced
clean, internally consistent data:

- **9b baseline**: both webviews correctly split 1280x450 / 1280x450, vertically stacked
  (`main` at `absoluteInWindow (0,0)`, `store-embed` at `(0,450)`) — confirms 026's 50/50 finding,
  now with CORRECT position data (026's own `bounds()`-derived `(0,0)` for both was the `bounds()`
  gap above, not a real measurement).
- **9c/9d (`set_child_packing`, expand=false/fill=false) and 9e/9f (`size_request` 300x200)**:
  **no visible change** at all from baseline, even after both calls succeeded without error. The
  immediate readback looked like the lever had no effect.
- **9g (resize to 1100px) then 9h**: revealed the TRUE effect, one relayout later — `main` grew to
  650px, `store-embed` stayed at its ORIGINAL 450px. Under the pre-existing `expand=true,fill=true`
  packing on both children, an even resize would have split the +200px extra evenly (650/650);
  getting 650/450 is only explainable if `expand=false` on the embed DID take effect at the time it
  was set, and simply hadn't been reflected in an allocation snapshot until GTK next actually ran a
  full box relayout. **Lesson: reading `default_vbox()`'s children right after a packing-property
  change is not sufficient evidence that the change had no effect — GTK defers the visible
  consequence to its next real relayout pass, which a plain `set_child_packing`/`set_size_request`
  call does not itself force.** `size_request`'s OWN effect stayed unproven either way: the embed
  never shrank toward its requested 300x200, staying at 450 — plausibly because a `WebKitWebView`
  reports its own, larger natural-size requisition regardless of a plain widget-level size-request
  hint, but this spike did not isolate that separately from the `expand=false` interaction.
- **9i/9j (`reparent_fixed` + `fixed_move`, x=150,y=250,w=700,h=400)**: the vbox's OWN two children
  became `main` (h=161) and the new `GtkFixed` (h=939) — a dramatically uneven split explained by
  GTK box allocation honouring each child's NATURAL size first (the `Fixed` naturally needs at
  least `250+400=650px` to contain its one placed child without clipping; `main`'s own natural
  size is small). Because the embed webview is now a grandchild of the vbox (inside the `Fixed`),
  `gtkbox_snapshot`'s direct-children walk can no longer see it directly — **`9n`'s cross-check
  against wry's OWN `list_webviews` oracle is what proved the lever worked**: `store-embed` read
  back `w=700,h=400` — an EXACT match to the requested rect, not merely "different from 450x450."
  Position read `(0,0)` in wry's own report, but that's the same known `bounds()` position-gap
  above, not evidence the position failed.
- **9l/9m (second resize, 1100px -> 900px) then 9n**: `store-embed` STILL read back `w=700,h=400`
  after the round-trip resize — the Fixed-based rect survived. Explainable and consistent with GTK:
  a `GtkFixed`'s own children do not participate in the Fixed's own re-flow by definition (`put()`
  positions are fixed relative to the Fixed's own origin); only the Fixed CONTAINER's position
  within the outer vbox moves on an outer resize, which this spike did not separately re-measure in
  absolute window coordinates after the second resize.

**Conclusion from run 1 alone: `reparent_fixed` + `fixed_move` is a definitively working lever —
proven by an exact size match on TWO independent oracles (raw GTK allocation before the
grandchild-visibility gap, and wry's own `list_webviews` after) — surviving two window resizes.
`set_child_packing`/`size_request` showed a plausible but NOT independently isolated effect.**

### Runs 2-11 (ten further attempts, across three separate diagnostic passes) — the SAME code, reliably degenerate

Re-running the identical harness — first as a plain re-run, then with the post-create sleep raised
500ms -> 2000ms (three attempts), then with an explicit `gtk_lever::pump()` (50 rounds of
`while gtk::events_pending() { gtk::main_iteration() }`) inserted after creation, after the first
resize, and after the `fixed_move` lever (three more attempts) — **every single one** showed the
embed's widget stuck at `{x:-1,y:-1,w:1,h:1}`, GTK's own "never been through a size-allocate pass"
sentinel, for the ENTIRE run: baseline, after both packing levers, after the FIRST resize (which
itself silently stayed at 900px instead of becoming 1100px — confirmed independently via `xwininfo`
against the live window during a 35s pause), after `reparent_fixed`+`fixed_move`, and after the
SECOND resize. Killing lingering `WebKitNetworkProcess`/`WebKitWebProcess` helper processes from
prior runs first made no difference. A THIRD diagnostic pass, gated by a new `SPIKE_ONLY_028` env
var that skips spikes 016-018's original Phases 0-8 entirely (so Phase 9's embed is the
first-ever `add_child` in a brand-new process, ruling out any destroy-then-recreate-under-the-
same-label state), **still showed the identical degenerate allocation, 3 for 3.**

**A visual screenshot during one of these degenerate runs (region-captured from the live window's
own resolved geometry, per this project's established per-window capture discipline — never a
full-desktop grab) confirms the API-level reading is real, not a snapshot artifact: the window
shows only the harness's own blank gradient background, no embed content visible anywhere.**

**This rules out every mechanism this spike could cheaply test**: not a startup race (longer sleep
didn't help), not GTK's idle-priority resize queue being starved by rapid IPC dispatch (an explicit
main-loop pump didn't help), not a destroy-then-recreate artifact (a first-ever create failed
identically), and not a stray-process resource conflict (killing lingering WebKit helpers didn't
help). **The root cause is NOT identified within this spike's scope.** One plausible, UNVERIFIED
hypothesis, based on the one variable that differed between the single clean run and every
degenerate one: the clean run was the very first GUI window this X session had ever shown, and
every later run was launched while this automated tool session already held X11 input focus
elsewhere, so the new window may never have been given focus/properly mapped by the window
manager in the way GTK's layout engine expects. This was NOT tested directly (would need
`xdotool windowfocus`-ing the new window at the exact right moment before any snapshot, timed
against an inherently racy window-manager map event) and is recorded as a hypothesis for a future
session to test, not a finding.

## Results

**PARTIAL**, and the two halves point in different directions:

- **The original question — can a non-50/50 layout be reached via stock Tauri API, without
  patching wry/tauri-runtime-wry — is answered YES, with real evidence.** `Window::default_vbox()`
  and `Webview::with_webview` -> `PlatformWebview::inner()` are both public, unforked, Linux-only
  Tauri API. Reparenting the real widget into an application-created `gtk::Fixed` and positioning
  it with raw `gtk::Fixed::move_` + `WidgetExt::set_size_request` achieved an EXACT, arbitrary,
  off-center rect (`700x400` against a requested `700x400`), confirmed by wry's own `bounds()`
  oracle, surviving two window resizes. `set_child_packing`/`size_request` alone showed a plausible
  but not cleanly isolated effect, and never in isolation from the Fixed-based lever's own success.
- **A second, more severe, and UNRESOLVED finding supersedes the first in practical importance:**
  in 10 of 11 total runs across four different code variants (plain, longer sleep, explicit main-
  loop pump, first-ever create with no prior Phase 0-8 history), the `add_child`ed webview never
  received ANY GTK allocation at all — not 50/50, not custom, nothing, GTK's own "never laid out"
  sentinel, persisting through pumps, sleeps, and even a real window resize that itself silently
  failed to take visible effect. **Whichever layout strategy the eventual Linux store-tab phase
  picks, it inherits this reliability question as a live, unexplained risk — independent of the
  packing-lever question this spike was scoped to answer.**

**Impact on the positioning todo's decision.** The `## Decision (2026-09-28)` section's
"UNVERIFIED question to record" is answered — a usable layout lever exists (`reparent_fixed` +
`fixed_move`) and should NOT be treated as unreachable. But this spike also surfaces a NEW,
higher-severity open question this decision did not anticipate: reliable webview allocation at
all, which a future phase must resolve (very likely via a dedicated follow-up spike scoped to the
focus/mapping hypothesis above, run BEFORE committing implementation effort to any specific layout
lever) before the GTK-box-native strategy can be considered buildable, not merely reachable in
principle.

**Evidence on disk**: `run.log` from run 1 (the clean pass) was not preserved separately from
later overwrites — every number cited above from run 1 is transcribed verbatim from the tool
output captured during this session, not re-derived. `/tmp/spike028-*.out` files and screenshots
were captured to `/tmp`, outside the repo, per this project's scratch-file convention; none are
committed. A future session reproducing this spike should redirect `run.log` to a
per-attempt path (this spike's own harness reuses spike 025's single hardcoded `run.log` path,
appending across runs within one process but truncated by each fresh `cargo run`'s own log
lifecycle) to avoid the same loss.
