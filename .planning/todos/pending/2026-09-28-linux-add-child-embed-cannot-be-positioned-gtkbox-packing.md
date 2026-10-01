---
created: 2026-09-28
title: 'Linux add_child store embed: the GTK-box-native layout is built and desk-gated; only the operator live gate on the packaged build remains (set_bounds is a silent no-op on Linux because Tauri packs WindowChild webviews into the shared GtkBox)'
found_during: spikes 025/026 (2026-09-28; commits c54e047ca, 369f482a4), filed by quick 260928-raq
severity: minor
platform: linux
ready: live-gate
area: store-embed
files:
  - src-tauri/Cargo.toml
  - .planning/spikes/026-linux-add-child-runtime/README.md
  - .planning/spikes/025-linux-add-child-compile/app/src/main.rs
  - src-tauri/src/main.rs
  - src/frontend/screens/WebView/index.tsx
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

## Decision (2026-09-28): option (a), a GTK-box-native layout

- **Who decided.** The operator decided this directly on 2026-09-28, and quick `260928-upj`
  recorded it. It is final. Do not re-litigate it, and do not present option (a) as still open
  anywhere.
- **Why (a).** It is the lowest-risk option. It carries no upstream fork or patch. It has no
  exposure to the unexplained native crash recorded above under option (c). It ships a real, if
  less flexible, Linux embed instead of none.
- **Why not (b).** A `tauri-runtime-wry` change, upstream or forked, would have to be carried
  through every Tauri upgrade, with no guarantee upstream accepts it.
- **Why not (c).** The second-`Window` shape segfaulted natively in 2 of 2 runs and has no root
  cause. The standing "do not choose (c) until the crash is understood" constraint above still
  applies.
- **Why not (d).** It leaves Linux with no store embed at all. That runs against the project's
  one-launcher core value.
- **What this decides.** Only the strategy.
- **What it does not decide.** The concrete layout shape: orientation, how the main webview and
  the embed divide the shared `GtkBox`, and what share of the window each gets. That is design
  work for whichever phase builds the Linux store tab.
- **An UNVERIFIED question to record.** Spike 026 measured GTK's default even split (both
  webviews at 1280x450). Can anything other than that split be reached through the platform
  widget handle, for example GTK packing properties or size requests, without changing
  `tauri-runtime-wry`? That question belongs to the implementing phase. If no usable layout turns
  out to be reachable within box packing, bring that back to the operator as a finding rather
  than switching to (b).
- **What does not change.** `set_bounds` stays a no-op on Linux under this strategy, by design.
  The renderer-measured slot-rect design that spike 017 validated on macOS does not apply on
  Linux. The shipped app is unchanged, because `src-tauri/Cargo.toml:114-128` still gates
  `unstable` to macOS. The `## Falsifiable re-open` section above still stands.
- **The sibling isolation todo is NOT decided here.** That is
  `.planning/todos/completed/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md`,
  still `ready: human`. By its own title it still gates whether a Linux embed ships at all. Its
  third option, keeping Linux off the embed, is now in tension with this decision. That call is
  the operator's, in that todo.
- **Why `ready: code`.** The human-decision gate is satisfied. What remains is buildable: design
  and build the GTK-box-native layout in `src-tauri`, and un-gate `unstable` for Linux.
  No code was written by quick 260928-upj. `ready:` follows the next action, as in commit
  `00bc6fa1f`. Once the layout is built, this todo's remaining work becomes a live Linux run and
  `ready:` should move to `live-gate`.
- **Why it stays in `pending/`.** The layout it tracks is not built. The `blocked_by` fields of
  ledger items `38-E03`/`38-E04` cite this file by its `pending/` path. The two `completed/`
  precedents with a recorded decision closed only once the chosen option had shipped.
- **Same-change note.** The Linux branches of `38-E03`/`38-E04` in `38-VERIFICATION.md` were
  re-scoped in the same commit, in fields named `linux_rescoped_2026_09_28`, together with a dated
  `deferral_note` amendment.

## Addendum (2026-09-29): the isolation todo is decided, one shared cookie jar

- **Decided.** The sibling isolation todo
  (`.planning/todos/completed/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md`)
  is now DECIDED. The operator accepted one shared cookie jar on Linux on 2026-09-29, and quick
  `260929-9qr` recorded it in that todo's `## Decision (2026-09-29)` section.
  - The "sibling isolation todo is NOT decided here" bullet above stays as written, as history.
    This addendum supersedes it.
- **The tension is resolved.** The tension that bullet recorded is resolved in favour of
  shipping, because keeping Linux off the embed was not chosen. The isolation todo no longer
  gates whether a Linux embed ships. Option (a) above is unaffected.
- **A constraint on whoever builds the GTK-box-native layout: build against one shared cookie
  jar.**
  - On Linux every webview in the process shares one `WebKitWebContext`, so a Linux store embed
    can read every other store's cookies, and the login windows' cookies, in-process.
  - `data_store_identifier` is a silent no-op on the GTK backend, so do not rely on it for
    isolation there. Do not describe the Linux embed as per-store isolated.
  - This matches the shipped macOS embed, which never sets an identifier and runs on the default
    jar.
- **Nothing else changes.** This todo stays `ready: code` in `pending/`, and its remaining work
  is unchanged. No code was written by quick 260929-9qr.

## Addendum (2026-09-29, spike 028): the UNVERIFIED layout question has a real answer — and a bigger, unresolved one behind it

The operator asked directly to spike the `## Decision (2026-09-28)` section's own "An UNVERIFIED
question to record" bullet: can anything other than GTK's default even split be reached through
the platform widget handle, without changing `tauri-runtime-wry`? Full evidence and Investigation
Trail: `.planning/spikes/028-linux-add-child-gtkbox-packing-lever/README.md`. Verdict: **⚠ PARTIAL.**

- **YES, a real lever exists, and it does not need `tauri-runtime-wry`/wry patched.**
  `tauri::Window::default_vbox()` and `Webview::with_webview` -> `PlatformWebview::inner()` are
  both PUBLIC, non-`unstable`-gated Tauri API (Linux-family only) that hand application code the
  real GTK objects. Removing the embed's widget from the shared vbox, wrapping it in an
  application-created `gtk::Fixed`, and positioning it with stock `gtk-rs` calls
  (`gtk::Fixed::move_` + `WidgetExt::set_size_request`) achieved an EXACT, arbitrary, off-center
  rect (`700x400`), confirmed on two independent oracles, surviving two window resizes — in the one
  run it succeeded. This settles the "UNVERIFIED question" bullet: option (a)'s layout is not
  limited to the forced 50/50 split spike 026 found; a real positioning escape hatch exists.
- **A second, more severe, and genuinely UNRESOLVED finding was surfaced by the SAME spike, not
  asked for, and it now matters more than the lever question:** in 10 of 11 total runs — across
  four different variants (plain, a longer post-create sleep, an explicit GTK main-loop pump, and
  a first-ever-create variant with no prior destroy/recreate history) — the embed webview received
  NO GTK allocation at all, stuck at GTK's own "never laid out" sentinel, surviving pumps, sleeps,
  and even a real window resize that itself silently failed to take visible effect. Visually
  confirmed absent via a region-captured screenshot (no embed content rendered anywhere). Root
  cause was NOT identified within the spike's scope — a window-focus/mapping hypothesis is
  recorded as untested, not confirmed.
- **What this changes for whoever builds the GTK-box-native layout.** The layout STRATEGY question
  (option (a) vs (b)/(c)/(d)) is unaffected — still locked, per the 2026-09-28 decision above. But
  the phase that builds it inherits a live reliability question this todo did not previously carry:
  reliable webview allocation on Linux at all, independent of which packing/positioning approach is
  used. Recommend a dedicated follow-up investigation (very likely another spike, scoped to the
  focus/mapping hypothesis) BEFORE committing implementation effort to the `reparent_fixed` lever
  or any other layout code — building against a mechanism that fails 10 of 11 times on this same
  machine, for an unknown reason, is not yet a buildable foundation even though it worked once.
- **Nothing else changes.** `ready: code` stands — the human-decision gate for the STRATEGY was
  already satisfied by the 2026-09-28 decision, and this reliability question is new information
  for the implementing phase, not a reopened decision. `severity: minor` stands too: the shipped
  app is still macOS-gated (`src-tauri/Cargo.toml:114-128`), unaffected either way.

## Addendum (2026-09-29, spike 029): the reliability question does NOT reproduce — one confound left, and it needs the operator

Full evidence: `.planning/spikes/029-linux-embed-allocation-reliability/README.md`. Verdict: **⚠ PARTIAL.**

- **The focus/mapping hypothesis is refuted.** 10 attempts with the window explicitly UNFOCUSED
  (`hasToplevelFocus:false`, `isActive:false` recorded) allocated 10 of 10. `present()`, wait-for-map,
  `show_all()`, a nudge resize, `queue_resize()` and `add_child` from a non-main thread each went
  10 of 10 too. 100 of 100 one-shot attempts allocated, fresh fake profile each.
- **The `reparent_fixed` + `fixed_move` lever is reliable here:** 30 of 30 EXACT 700x400 (plain,
  unfocused, and 028's own long sequence with two resizes).
- **028's own code path no longer degenerates** (6 of 6 baseline allocated). Why 028 saw 10 of 11 is
  still unidentified. The one changed variable is the GPU path: today's runs were forced onto
  `WEBKIT_DISABLE_DMABUF_RENDERER=1` because the NVIDIA stack is broken
  (`nvidia-smi`: `Driver/library version mismatch`, kernel module 580.159.03 vs library 580.173).
  That is a candidate, not a finding.
- **What this changes.** `ready:` moves `code` -> `human`. The next action is the operator's: fix the
  NVIDIA mismatch, then run
  `.planning/spikes/029-linux-embed-allocation-reliability/run-variants.sh 10 plain reparent`
  with `WEBKIT_DISABLE_DMABUF_RENDERER` UNSET (delete that `export` line for the run). 100% allocated
  = 028 was an environment artefact and the layout is buildable; any DEGENERATE = the fix is in the
  renderer path and layout code waits on it. Then `ready:` returns to `code`. The strategy decision
  (option (a)) is untouched.
- **A design constraint that holds regardless:** do not pack the application's `gtk::Fixed` as a
  vbox SIBLING of the main webview. Measured: main is squeezed to 61-125px. Overlay it
  (`gtk::Overlay`) or set explicit expand on main, and assert the main webview's height in the live
  gate, not only the embed's.

## Addendum (2026-09-30, quick 260930-aof): the NVIDIA mismatch prerequisite is measured cleared

The kernel module and userspace driver versions now match (580.173.02 = 580.173.02, `nvidia-smi` runs,
kernel 7.1.1-76070101-generic, booted 2026-09-30 07:38:36), so the operator prerequisite named in the
spike-029 addendum above ("fix the NVIDIA mismatch") is met. The spike-029
`run-variants.sh 10 plain reparent` re-run with `WEBKIT_DISABLE_DMABUF_RENDERER` unset was NOT performed
here and is still the next action; `ready:` is left for triage. What sitting 12 observed of the packaged
app's GPU path: the CI AppImage launched without the workaround, showed a window and reached an
interactive Library UI with 0 EGL lines, so the packaged app's EGL/GBM path is healthy on the matched
driver. That says nothing about the embed's GTK-box allocation, which the packaged Library screen does not
exercise.

## Addendum (2026-09-30): the spike-029 re-run with DMABUF UNSET — 20 of 20, the layout is buildable

The re-run the previous addendum named as the next action was performed, on the matched NVIDIA driver
(580.173.02 both sides), with `WEBKIT_DISABLE_DMABUF_RENDERER` UNSET (a scratchpad copy of
`run-variants.sh` with the `export` line removed; the repo script is unchanged). Fresh fake profile per
attempt. Raw results: `.planning/spikes/029-linux-embed-allocation-reliability/results-unset-dmabuf/`.

- `plain` x10: 10 of 10 ALLOCATED. `reparent` x10: 10 of 10 EXACT. Zero DEGENERATE.
- Reading: spike 028's 10-of-11 no-allocation result was an environment artefact of the broken NVIDIA
  stack, not a property of the GTK-box mechanism. The `reparent_fixed` + `fixed_move` lever is a
  buildable foundation. Caveat: this is the debug spike binary on one machine, not the packaged app.
- `ready:` returns `human` -> `code`. Strategy (a) and the one-shared-cookie-jar constraint are unchanged;
  the Overlay / main-height design constraint from the spike-029 addendum still applies.

## Addendum (2026-09-30, quick 260930-blh): the GTK-box-native layout is built — what remains is a live gate

Strategy (a) was built (quick `260930-blh`, commits `e4d25138a` and `0e46c4372`) and proven live on this
machine. This file stays in `pending/`; nothing is closed.

- **What was built.** `linux_store_embed_layout` in `src-tauri/src/main.rs`. On the FIRST `store_embed_open`,
  the main webview moves out of `default_vbox()` into an application-created `gtk::Overlay` packed at its old
  position; a `gtk::Fixed` is the Overlay's only overlay child (`set_overlay_pass_through(true)`); the embed
  Tauri packed into the vbox is moved into that Fixed and positioned with `Fixed::move_` + `set_size_request`.
  The Fixed is never a vbox sibling of main. Public Tauri Linux API plus gtk-rs only: no `tauri-runtime-wry` /
  wry patch. `unstable` and `gtk = "0.18.2"` come in through a Linux-only Cargo target table; `Cargo.lock`
  gained one `"gtk",` line and no crate name. The renderer gate now admits `linux`; Windows keeps the panel and
  all ten `:unsupported-platform` arms. wry's `set_bounds` stays a silent no-op on Linux and is never called.
- **The 2026-09-28 bullet is superseded (kept as history).** "set_bounds stays a no-op ... the renderer-measured
  slot-rect design does not apply on Linux" no longer holds: the slot rect maps 1:1 into the Fixed, because the
  Overlay's main child is the main webview, so the Fixed's coordinate space is the main viewport. The only
  Linux-specific step is rounding to `i32` (GTK's integer API); D-18's no-rounding rule is a macOS statement.
- **One shared cookie jar.** No per-store data-store identifier is set anywhere (non-comment count 0), and the
  Linux embed is not isolated. That matches the 2026-09-29 decision.
- **Measured live** (dev binary, fresh `createFakeHomeProfile()` per launch, X11, 1280x800, one machine;
  `.planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/evidence/`):
  - tracer: `/store/gog` puts GOG inside the slot below the controls with the NavShell tabs above it;
    `requested=204,82,1076x418 embed=204,82,1076x418 main=0,0,1280x800 vbox=1280x800`.
  - final run, `check_settled.py --min-lines 2 --expect-vbox-change`: 4 settled lines, 4 pass, vbox 1280x800 ->
    1100x700 -> 1280x800, main always the full vbox, embed always the requested rect.
  - wheel input inside the embed changed 50.2% of the slot's pixels and 0.0% of the chrome band, left nav and
    inspector strip; a click on the LIBRARY tab outside the embed reached main through the pass-through Fixed and
    left no GOG pixels; returning to GOG showed it in the slot; GOG -> Epic -> GOG returned it to 204,82.
  - two live-found defects were fixed inside the design (stop rule allows two): the renderer remount left the
    embed hidden, and a zero-area rect from a slot unmount parked it at (0,0) over the chrome.
  - E5 (recorded, not gating): a link click inside the embed navigated it; whether Back moved the history is
    UNCONFIRMED, consistent with Phase 40 Observable Truth 6 being FAILED on macOS itself.
- **DEVIATION from the plan: `WEBKIT_DISABLE_DMABUF_RENDERER` was NOT unset for the scored runs.** With it
  unset the dev app's renderer never painted on this host: 0 of 6 launches rendered, against 6 of 8 with
  `WEBKIT_DISABLE_DMABUF_RENDERER=1` (`evidence/unset-dmabuf-attempt.txt`; NVIDIA 580.173.02, no mismatch). The
  spike-029 20/20 "unset" result measured GTK allocation and did not need a painting renderer. The layout is
  therefore proven on the DMABUF-DISABLED path only. Whether a packaged app or another GPU stack paints with it
  unset is unknown, and is a separate defect from this layout.
- **NOT verified:** the packaged AppImage/release build; a real-profile run with logged-in stores; Wayland;
  HiDPI scale != 1; the macOS build leg (not compiled here, protected only by leaving its statements inside their
  `#[cfg(target_os = "macos")]` blocks); the Windows compile (best effort: `cargo check` for
  `x86_64-pc-windows-msvc` failed on a missing `lib.exe` and for `-gnu` on a missing sidecar resource, both
  environment limits, so it is neither a pass nor a fail); a first-open split frame and keyboard focus were not
  measured.
- **Open observations for the operator, NOT decided here.** (1) The embed's Chrome UA keeps its `Macintosh`
  platform token on Linux. (2) The `platform` panel copy still names only macOS (true on Windows; no l10n churn
  was taken). (3) The first open may show one frame of GTK's even split before `mount` runs (unobserved).
  (4) The macOS path has the same shape as the two defects fixed here (the existing-embed open only navigates;
  a zero rect is applied verbatim on unmount) and is UNMEASURED there. (5) The dev build's auto-docked WebKit
  inspector takes the bottom of the main webview, so the renderer viewport was 1280x500 in every run.
- **What remains:** an operator live gate. The Linux branches of `38-E03`/`38-E04` still route to this file's
  `pending/` path. `38-VERIFICATION.md` is not edited.

## Addendum (2026-09-30, quick 260930-ea0): DMABUF-unset boot-render clause met

- Quick 260930-ea0 stopped the Linux debug build auto-opening the Web Inspector (commit `142cde2a5`). The
  earlier "unset never paints" (0 of 6) was that inspector racing page boot and aborting the page's
  WebKitWebProcess, not DMABUF/EGL. See `.planning/debug/resolved/linux-dev-app-blank-without-dmabuf-workaround.md`.
- With `WEBKIT_DISABLE_DMABUF_RENDERER` genuinely absent (shell and page process), 6 of 6 fresh-profile dev
  launches mounted at 1280x800 with 1 WebKitWebProcess. The 1280x500 viewport (old observation 5) is gone;
  the slot is now 204,82 1076x718.
- E1-E4 re-run with DMABUF unset (bonus): all PASS. E4b and E5 were NOT RUN.
- The two `=1` stalls attributed to the 2026-09-17 blank-launch todo are probably the same inspector
  abort. Not re-proven.
- Still open: the operator live gate, Wayland, HiDPI, the packaged build. This is one host.
- Frontmatter is unchanged on purpose: `ready: live-gate` stays because the operator gate is what remains.

## Addendum (2026-09-30, quick 260930-feh): desk live gate — E4b, E5, HiDPI (GDK_SCALE=2), drag-resize

- **Conditions.** Dev binary at base `a8ec1e5eb` (branch `quick-260930-feh`), X11, one host (NVIDIA 580.173.02,
  WebKitGTK 2.50.4, primary 3440x1440), four launches, each under a fresh `createFakeHomeProfile()`. In every launch
  `WEBKIT_DISABLE_DMABUF_RENDERER` was absent from the shell's environ and from the WebKitWebProcess (identity
  files: `DMABUF_VAR_PRESENT=no`, `dmabuf=absent`), `LD_PRELOAD` absent, `GDK_SCALE` absent except the HiDPI run.
  Evidence: `.planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/evidence/`. No blank launch. The
  first captures of the first launch were black because GNOME had blanked the display after idle (a mouse move
  woke it); that was the screen, not the app.
- **Tracer: PASS.** `/store/gog` puts GOG in the slot, `requested=204,82,1076x718 embed=204,82,1076x718
  main=0,0,1280x800 vbox=1280x800`, NavShell tabs above, effective scale 1.000.
- **E4b: PASS.** After GOG -> Epic -> GOG the embed is back in the slot and not over the chrome: chrome band 0.0000
  changed, left nav 0.0000, slot 0.1403 (the GOG carousel moved on). Epic has no in-app embed; its route shows the
  "isn't available in-app yet" panel, and no GOG pixels were left in the slot. One `ignored zero-area bounds` line
  on leaving GOG; no new settled line on the return.
- **E5: RECORDED, not gating.** A link click (GOG GALAXY) navigated the embed; the URL label read `www.gog.com`
  before and after (host only); the Back arrow looked enabled. Back did NOT return to page A: slot change b->c
  0.0002, a->c 0.6214, so `back_moved_history=NO`. Consistent with Phase 40 Observable Truth 6 being FAILED on
  macOS itself.
- **FINDING (FAIL, not diagnosed, no fix taken): window resize after E4b plus a link click does not resize the
  embed.** In that same launch, resizing 1280x800 -> 1100x650 -> 1000x600 -> 1280x800 produced ZERO settled lines
  and four `ignored zero-area bounds (slot unmounted)` lines, one at each resize instant; at 1100x650 the embed
  stayed at 204,82,1076x718 and overhung the window (`s1/resize-1100x650-after-e4b-e5.png`). A fresh launch that
  went tracer -> the same three resizes gave 6 of 6 passing settled lines with flush 0,0 (`s1/s1b-*`), and the
  drag and HiDPI launches resize correctly too. So the plain resize path is fine; the defect is in the state left
  behind by the Epic round trip and/or the in-embed navigation. The two were not separated. Stop rule applied:
  no diagnosis loop, no speculative fix, `FIX_TAKEN=no`. Scored as `S1_CONTROL VERDICT=FAIL`.
- **HiDPI at GDK_SCALE=2: the scale took effect, and the renderer and GTK AGREE in logical px.** The shell and the
  WebKitWebProcess both carry `GDK_SCALE=2`. Measured ratio = X client size / GTK vbox = 2200x1294 / 1100x647 =
  2.000 on both axes (the window manager clamped the requested height 1600 -> 1294 and then 1300 -> 1294).
  `requested=204,82,896x565`, `embed` equal, `main=0,0,1100x647`; the slot is flush with the vbox's right and
  bottom edges (0,0), the same property measured at scale 1 at 1100x650 and 1000x600 (flush 0,0). Resize to
  2000x1200 (vbox 1000x600) and back: flush 0,0 both times. Wheel (5 clicks at the slot centre) changed 48.7% of
  the slot and 0.0% of chrome and left nav. A click on LIBRARY reached main and left no GOG pixels. Slot corner
  aligned at device px. Text crispness RECORDED, not gated: glyph edges are anti-aliased at device pixels, no 2x2
  blocks seen (one crop, one eye).
- **Drag-resize (Linux branch of 38-E04), MEASURED as far as the harness can see.** Six scripted steps
  (1250x784 .. 1100x700): 6 of 6 ended in a correct settled line, 0 missing, 0 stale, lag from the X size change
  546-590 ms. That lag INCLUDES the shell's 500 ms settle debounce by design plus +-50 ms of poll granularity, so
  the estimated apply time is about 90 ms or less. A 40-step burst (25 ms apart, 1100x700 -> 1280x800) fired NO
  settled line mid-burst and one correct line 571 ms after the final size; captures at +100 ms and +1500 ms were
  pixel-identical (no stale frame at the end). One best-effort pointer drag was achieved (1280x800 -> 1100x700,
  matched, 570 ms, measured from mouse-up).
- **NOT MEASURED.** Per-frame staleness or tearing during a continuous drag (no settled line fires mid-drag);
  perceived responsiveness (the ledger's "no visible lag"); the renderer-to-GTK path separate from the debounce.
- **NOT VERIFIED.** The packaged AppImage/release build; a real logged-in profile; Wayland; macOS; Windows;
  mixed-DPI or per-monitor scaling; fractional scales; Tauri's own `scale_factor()` (never read: the scale is
  inferred from X vs GTK sizes); keyboard focus and the first-open split frame; any host but this one.
- **What remains.** The finding above. The operator live gate. `ready: live-gate` stays and the frontmatter is
  unchanged on purpose. `38-VERIFICATION.md` is not edited; whether any of this discharges part of 38-E03/38-E04
  is the operator's call in a ledger change.

## Addendum (2026-10-01): the 260930-feh `S1_CONTROL` finding is FIXED and live-verified

- Root cause and fix: debug session `.planning/debug/resolved/linux-embed-resize-dead-after-epic-roundtrip.md`,
  commit `d71269c2a`. `useStoreEmbedHost`'s bounds effect was keyed on a one-way latch, so after GOG -> Epic -> GOG
  (one `store/:store` route, no remount) the ResizeObserver and listeners stayed bound to the detached slot. It now
  keys on the slot element itself. Not Linux-specific code: the renderer hook is shared with macOS.
- Live re-run (dev build, X11, one host): 7 of 7 valid launches pass (Epic round trip x4, round trip + link click
  x2, neither x1), each 3/3 resizes settled, embed == requested, flush, 0 zero-area lines. 9 further launches were
  discarded because a "Retrying" banner on the Accounts screen blocked the driver; they measured nothing.
- The 2026-09-30 finding "FAIL, not diagnosed" above is superseded. The E5 Back-button result stands.
- Still open: the operator live gate, Wayland, packaged build, macOS re-check of the shared hook. `ready: live-gate`
  stays. `38-VERIFICATION.md` is not edited.

## Addendum (2026-10-01): macOS re-check of the shared `useStoreEmbedHost` fix — operator-reported PASS

- The operator ran branch `quick-260930-feh` (fix `d71269c2a`) on their Mac: the WebView jest suite, then `pnpm tauri:dev`.
  GOG -> Epic -> GOG, then window resizes: the embed followed the slot with no overhang. The two extra checks
  (GOG <-> Steam without Epic in between, and in-embed navigation) also passed, with no flicker or position reset.
- Reported by the operator in conversation, not captured by a harness: no pixel measurement, no log, no launch count,
  and the Mac model/display were not recorded. Treat it as a desk sanity check, not a scored gate.
- This closes the "macOS re-check of the shared hook" item from the 2026-10-01 addendum above. Still open: the operator
  live gate on the packaged Linux build, Wayland, non-2.0 scales. `ready: live-gate` stays.

## Addendum (2026-10-01): packaged-build desk gate — the resize fix holds in the release build and the real AppImage

- **Build.** `pnpm download-helper-binaries`, `vite build`, `build:sidecar-sea`, `tauri build --config
  '{"bundle":{"createUpdaterArtifacts":false}}'` (the README sequence) on this host (Ubuntu glibc 2.35, x86_64), from
  tree `a2b22a3a4` (tracked files clean). Output `GameLib_0.7.0_amd64.AppImage`, sha256 prefix `a89ac8bb3b713ae4`.
  A local build, NOT the CI artifact and NOT the `release-tauri.yml` leg; nothing was published or tagged.
- **Identity.** Sampled from `/proc` during the AppImage runs: the shell, `WebKitNetworkProcess`, `WebKitWebProcess` and
  the bundled `gamelib-sidecar` (the SEA; a release build does not take the dev node path) all ran from
  `/tmp/.mount_GameLib*/usr/...`. The harness's own `EXE_MATCH` reads `no` for the AppImage, which is expected: the
  process lives under the mount, not at the path handed to it.
- **Method.** Same dev-gate driver, resizes 1280x800 -> 1100x650 -> 1000x600 -> 1280x800, fresh
  `createFakeHomeProfile()` per launch, DMABUF unset, X11, one host. Pass = 1 settled line per resize, embed == requested,
  flush with the window edge, 0 zero-area lines.
- **Release binary (`target/release/gamelib-shell`): 6 of 6 valid launches PASS** (Epic round trip x3, round trip +
  in-embed link click x2, neither x1).
- **AppImage: 10 of 10 valid launches PASS** (round trip x5, round trip + link x3, neither x2), each 3/3 resizes settled.
- **One AppImage launch (`a4`) never left the "Loading" splash, and one release-binary launch (`r1`, 14 s ceiling only)
  was still on it when the driver started clicking.** Both are excluded (they measured nothing about the embed) and NOT
  explained. `a4` was still on the splash roughly 85 s in. Whether that is a slow cold boot or a stall was not
  established, and it is 1 of 12 AppImage launches, so the rate is unmeasured. Related prior records: cold sidecar boots
  of 27-39 s (260913-m9c) and the 2026-09-17 blank-launch todo. The driver now polls for the splash to clear (ceiling
  `GL_BOOT_WAIT`, default 14 s) and marks such an arm INVALID instead of scoring it.
- **NOT verified:** the CI-built artifact (this is a local build), a real logged-in profile, Wayland, non-2.0 scales,
  another host or GPU, per-frame staleness/tearing during a continuous drag and perceived lag (the operator-judgement
  half of 38-E04), keyboard focus, the first-open split frame. The Linux branches of 38-E03/38-E04 are not discharged.
- **What remains.** The operator's own sitting on the packaged build (a real profile, a human drag). `ready: live-gate`
  stays. `38-VERIFICATION.md` is not edited by this addendum.
- Harness changes: `gate_live.ts` gained `--no-vite` (a release binary serves its embedded frontend);
  `arm.py` gained the `GL_BOOT_WAIT` readiness poll.

## Addendum (2026-10-01, quick 261001-apg): AppImage desk run of the live-gate checklist — automatable half only

Ran the machine-checkable part of `.planning/quick/261001-pez-mid-drag-frame-capture-for-the-linux-sto/LIVE-GATE-CHECKLIST.md`
on the local `GameLib_0.7.0_amd64.AppImage` (sha256 prefix `a89ac8bb3b713ae4`, the same build as the packaged-build addendum
above; local, not the CI artifact). Fresh `createFakeHomeProfile()` per launch, X11, DMABUF unset, NVIDIA 580.173.02, one
host, graphics mode `compute`, nothing logged in. Evidence: `.planning/quick/261001-apg-appimage-desk-run-of-the-linux-embed-live/evidence/`.

- **Check 2 (embed in slot): PASS.** `settled requested=204,82,1076x718 embed=204,82,1076x718 main=0,0,1280x800`.
- **Check 6 (grow-drag), 3 of 3 VALID** (pre-drag and final frames both flush): scripted grow strip up to 48 px right / 40 px
  bottom, exposed 921 ms, converged 123 ms after the last resize event; real pointer drag up to 42 / 28 px, exposed 740 ms,
  converged 118 ms. Matches the release-binary numbers in `261001-pez-SUMMARY.md` (33-54 / 22-45 px). The embed trails the
  live chrome while growing and snaps flush shortly after; whether that is acceptable is the operator's call.
- **Check 7 (shrink-drag): final state only.** The embed ends exactly at the requested rect (`896x568` at 1100x650). Overhang
  DURING the shrink is not visible to the scorer (the window clips it) and remains unmeasured.
- **Check 1 (boot): not timed.** The harness finds the window but does not time boot from launch, so there is no boot figure.
- **Not run on the AppImage in this pass:** check 4 (tab round trip) and check 5 (wheel, click-outside, typing); both passed on
  this same build in the packaged-build addendum above.
- **Needs the operator, NOT done:** check 3 (a logged-in store; needs credentials and a real profile), checks 8-9 (maximise,
  second monitor, keyboard focus), and the judgement half of check 6.
- **Does not discharge the Linux branches of 38-E03/38-E04.** `ready: live-gate` stays; `38-VERIFICATION.md` is not edited.

## Addendum (2026-10-01, quick 261001-e4l): operator live gate, E04 half — grow strip ACCEPTABLE, no shrink overhang

The operator sat the E04 checks on the local `GameLib_0.7.0_amd64.AppImage` (sha256 prefix `a89ac8bb3b71`, not the CI
artifact), X11, a real profile (not a fake HOME), DMABUF unset. A stale instance (PID 86918) was killed and the app
relaunched fresh (shell PID 89895, window confirmed owned by that PID). One host, one human, one sitting.

- **Check 6 (drag-resize, grow): ACCEPTABLE.** The operator judged the trailing black strip acceptable. This is the
  judgement the harness numbers in the addenda above could not make. No new todo for the strip is needed.
- **Check 7 (drag-resize, shrink): no overhang.** The embed did not hang past the window edge or cover the chrome. This is
  the half the scorer could not see.
- **Not scored in this sitting:** checks 1-5 and 8-10, including an explicit "GOG page fills the slot" confirmation (the
  embed-in-slot result stands on the desk runs above). Monitor scale and GPU mode were not recorded.
- **E03 check 3 (a logged-in store) was NOT run.** `ready: live-gate` stays for it.
- **Side finding, out of scope here:** library tiles stretch with window width. Filed as
  `2026-10-01-library-tiles-stretch-with-window-width-consider-a-set-size.md`.
- **Does not discharge 38-E04.** This closes the Linux branch (c) judgement only. Branch (a), other macOS displays and
  hardware, stays open. Any `38-VERIFICATION.md` ledger change is the operator's to approve and is NOT made here.

## Addendum (2026-10-01, quick 261001-lgc): operator live gate on the rebuilt AppImage — checks 1-9 PASS, after a real-profile reload bug was found and fixed

The operator sat the checklist (`.planning/quick/261001-pez-mid-drag-frame-capture-for-the-linux-sto/LIVE-GATE-CHECKLIST.md`)
on a REAL profile (the named real-profile arm of the two-profile rule), X11, two monitors, DMABUF unset, on a local
`GameLib_0.7.0_amd64.AppImage` rebuilt from branch `quick-260930-feh` at `baa8e8e54`, sha256 prefix `8dc406b3d3198b36`
(not the CI artifact). Reported by the operator in conversation; no harness, no pixel measurement.

- **A real bug surfaced and was fixed first.** On the earlier build (`a89ac8bb`) the GOG embed reloaded endlessly on the real
  profile, the URL label flicking between `af.gog.com` and `track.adtraction.com`, so check 2 FAILED. No fake-profile run had
  shown it. Debug session `.planning/debug/resolved/linux-embed-gog-reload-loop-real-profile.md`, commit `22fcf15e1`: a renderer
  feedback loop through the saved `last-url-<store>` value (shared with macOS); the `about:` block was only an accompaniment.
  After the rebuild the label settled and the page stopped reloading.
- **Rebuilt build: checks 1-9 PASS.** 1 boot (well under 40 s, not timed); 2 embed in slot and layout fine; 3 logged-in store
  (sign-in completes, survives a store switch and an app restart); 4 tab round trip incl. Epic -> GOG; 5 input; 6 grow-drag
  (the trailing strip judged acceptable, already recorded by quick 261001-e4l on `a89ac8bb`); 7 shrink-drag, no overhang; 8
  maximise/restore and the second monitor; 9 keyboard focus. Check 10 (one shared cookie jar) is the decided behaviour, not a test.
- **Not verified:** Wayland, scales other than the operator's, the CI-built artifact, the real-profile logged-in state of stores
  other than GOG, and macOS after the shared-hook change (`22fcf15e1` is not run on a Mac).
- **Does not edit `38-VERIFICATION.md`.** Whether this discharges the Linux branches of 38-E03 and 38-E04 is the operator's call in
  a ledger change. `ready: live-gate` is left for that call; the todo stays in `pending/` because its `38-E03`/`38-E04` routes
  still cite this path.

## Addendum (2026-10-01, quick 261001-g3k): operator live gate COMPLETE — checks 1-9 PASS, 10 n/a

The operator reported the whole `261001-pez` checklist on the local `GameLib_0.7.0_amd64.AppImage` (sha256 prefix
`a89ac8bb3b71`, not the CI artifact), X11, a real profile, DMABUF unset, one host. The report was a blanket "1-9 pass, 10
n/a", NOT per-check detail, so nothing below is finer-grained than that.

- **Checks 1-9: PASS**, as reported: boot, embed in the slot, logged-in store (check 3), tab round trip, input,
  grow-drag (acceptable), shrink-drag (no overhang), maximise/restore and second monitor, keyboard focus.
- **Check 10: n/a** (shared cookie jar is the decided behaviour, 2026-09-29).
- **This supersedes** the "not scored" lists in the two addenda above (`261001-e4l` and `261001-apg`).
- **Not recorded:** boot time, monitor scale, GPU mode, and what was seen in check 3 (which store, whether sign-in survived
  an app restart as well as a tab switch). Treat check 3's restart clause as asserted by the operator, not observed here.
- **Not covered, unchanged:** Wayland, fractional scales, mixed-DPI, the CI-built AppImage, and HiDPI on the packaged build.
  The Linux HiDPI branch of `38-E03` is a separate question and is still un-run on the packaged build.
- **Effect on this todo:** the live gate it was waiting on is done. The todo is NOT moved to `completed/` by this
  addendum, and `38-VERIFICATION.md` is not edited.

## Addendum (2026-10-01, quick 261001-h8m): 38-E03 Linux branch (c), packaged AppImage at GDK_SCALE=2 — operator PASS

The operator sat the HiDPI checks on the local `GameLib_0.7.0_amd64.AppImage` (sha256 prefix `a89ac8bb3b71`, not the CI
artifact), X11, a real profile, DMABUF unset, launched with `GDK_SCALE=2` (shell PID 158838, started 20:37). Identity was
proven by PID: the shell and the WebKitWebProcess both carried `GDK_SCALE=2`, and the main window's X client size was
2560x1290 (about 1280x645 logical). A first launch was absorbed by a stale single instance and was discarded; the stale
instance was stopped and the build relaunched.

- **PASS (operator):** the embed fills its slot with no gap and no overlap of the tabs or left nav; the embed's text is
  sharp; a corner drag larger and smaller still works with the embed following. Reported as "1-3 pass", NOT per-check detail.
- **PASS (operator):** GOG stayed signed in across the restart. This is also the restart clause of check 3.
- **CLAIM LIMIT, important:** `GDK_SCALE=2` is a toolkit scale override, NOT a native display scale (GNOME's own scaling
  was left at 100% on both monitors). It is the same method as the dev-build desk gate, now on the packaged build.
- **Not measured:** no embed-rect-vs-slot number was taken on this launch (the harness runs its own instance on a fake
  profile). The 2.000 ratio and 0 px alignment remain the dev-build desk numbers above. Crispness is the operator's eye.
- **Not covered, unchanged:** Wayland, fractional scales, mixed-DPI or per-monitor scaling, external displays, a native
  GNOME 200% setting, Tauri's own `scale_factor()`, the CI-built AppImage.
- **Does not discharge 38-E03.** Its macOS branch (a) is un-run and not descoped. `38-VERIFICATION.md` is not edited.
