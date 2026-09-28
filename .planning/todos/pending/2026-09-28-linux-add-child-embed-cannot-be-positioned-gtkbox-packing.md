---
created: 2026-09-28
title: 'On Linux an add_child store embed cannot be positioned — set_bounds is a silent no-op because Tauri packs WindowChild webviews into the window''s shared GtkBox. The Linux layout strategy must be decided before the embed is un-gated there.'
found_during: spikes 025/026 (2026-09-28; commits c54e047ca, 369f482a4), filed by quick 260928-raq
severity: minor
platform: linux
ready: code
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
