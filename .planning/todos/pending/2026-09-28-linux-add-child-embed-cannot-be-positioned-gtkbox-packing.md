---
created: 2026-09-28
title: 'On Linux an add_child store embed cannot be positioned — set_bounds is a silent no-op because Tauri packs WindowChild webviews into the window''s shared GtkBox. The Linux layout strategy must be decided before the embed is un-gated there.'
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
  `.planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md`,
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
  (`.planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md`)
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
