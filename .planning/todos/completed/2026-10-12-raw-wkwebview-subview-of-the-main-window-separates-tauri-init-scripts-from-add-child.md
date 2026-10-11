---
created: 2026-10-12T05:50:00.000Z
title: 'Raw WKWebView as a subview of the MAIN window — separates Tauri''s init scripts from the add_child attachment, and is the embed shape /store/epic would actually ship'
area: webview/store-embed
severity: medium
platform: macos
ready: live-gate
status: completed
resolution: measured-rendered-in-main-never-challenged
resolved: 2026-10-12
resolved_by: "quick-261012-8gu"
found_by: 'quick 261012-7f2, spike 024 runs 12-16 (pristine WKWebView arm, 2026-10-12)'
files:
  - .planning/spikes/024-epic-store-in-embedded-child-webview/app/src/main.rs
  - .planning/spikes/024-epic-store-in-embedded-child-webview/README.md
  - src-tauri/src/main.rs
  - src/frontend/screens/WebView/index.tsx
---

## RESOLUTION — rendered inside the main window, never challenged, 2026-10-12 (quick `261012-8gu`)

**Row 1 fired.** Spike 024 runs 17–19 (`SPIKE_PRISTINE_INMAIN=1 SPIKE_PRISTINE_LONG=1`, no UA
override): the raw `WKWebView` as a subview of the main window's content view at the embed rect
(`290,96 760×560`, AppKit origin `290,244`, content view not flipped), beside Tauri's own webview,
fresh `nonPersistentDataStore()`. Six Epic arms: **0 challenged, 4 rendered by 120 s, 2 still
blank at 120 s.** Child embed in the same runs: 6 of 6 challenged. Steam served in all 12.
`shot-pristine-INMAIN-epic-configured-RENDERED-run17.png` is the store painted in the harness's
`#slot` region with the sidebar around it.

- **Attachment is not the trigger.** What remains is wry's per-webview setup (init scripts,
  message handlers, scheme handlers), which the public builder cannot strip and the product does
  not need stripped: a Rust-managed raw `WKWebView` IS the embed.
- **The 120 s sample** (the second ask): of 3 stalls sampled, 1 completed between 40 and 120 s,
  2 had not by 120 s. Same terminal-looking state every time (real store document,
  `readyState=loading`, empty body, 938 k parsed). Not a challenge. Filed as
  `2026-10-12-which-in-flight-head-resource-holds-the-stalled-epic-store-load.md` — it is the
  shipping blocker for either shape now.
- **Decisions opened.** D-05 said "Tauri child webview"; this is a different construction
  (raw subview, Rust-side bounds-sync/cookies/navigation delegate, macOS-only as written). The
  2026-09-15 sign-in-button todo moved `blocked` → `human` on it.

## Problem

Spike 024 runs 12–16 settled that the Turnstile gate is on Tauri's side of the webview: a raw
`WKWebView` in its own `WindowBuilder` window, cold store, was challenged 0 of 10 while the Tauri
child embed in the same five runs was challenged 10 of 10. But that construction removes two
things at once — Tauri's initialization scripts (`__TAURI__`, `__TAURI_INTERNALS__`, `ipc`,
`isTauri`, `__TAURI_IIFE__`) **and** the `add_child` attachment with wry's delegates, message
handlers and custom scheme handlers — so candidates 1 and 3 from run 11 are confirmed as a pair,
not separated. The previous todo's result table claimed candidate 1 by elimination; the README
corrects that.

The product question is sharper than the mechanism question. A separate pristine window renders
the store, but D-05 wanted an *embed*. The thing that answers both at once is a raw `WKWebView`
added as a subview of the **main** window's content view, beside Tauri's own webview, sized to
the store panel's rect.

## Solution

Harness first, in `.planning/spikes/024-…/app` (PHASE P already builds the raw webview; the
change is where it is attached):

- Add `SPIKE_PRISTINE_INMAIN=1`: instead of a new `WindowBuilder` window, add the raw `WKWebView`
  as a subview of the main window's `ns_view()` at the embed rect (`290,96 760×560`), the same
  rect the child embed uses, on a fresh `nonPersistentDataStore()`.
- Same arms, same order (Steam control first), same 20 s / 40 s title+URL reads and shots, same
  probe. ≥3 runs. Keep the child-embed phases in the run as the negative control.
- Then one arm that adds back ONLY the attachment variable: a Tauri `add_child` webview whose
  initialization scripts are stripped — not possible with the public builder, so if the
  in-main raw subview renders, the mechanism split is settled from the other side (attachment is
  not it) and the product path is a raw subview.

| Result | Consequence |
|---|---|
| Renders ≥3 | Attachment to the main window is not the trigger; the init scripts and/or wry's handlers are. `/store/epic` has an *embed* path: a raw `WKWebView` subview managed from Rust with its own bounds-sync, which is a new design decision against D-05's "Tauri child webview" wording. The sign-in-button todo wakes. |
| Challenged | The main-window attachment itself trips Turnstile (visibility/occlusion heuristics). The pristine *window* remains the only path. |
| Stalled (the 4-of-10 blank state from runs 12–16) | Record it; it is not a challenge. Measure past 40 s this time. |

Also worth measuring in the same runs, cheaply: let one stalled load run to 120 s and read
`readyState` again — the runs 12–16 stall was never measured past 40 s.

## Do not re-derive

- The gate is Turnstile on the store, webview-side; IP, UA and jar are each refuted (runs 6–16).
- The child embed does not need re-running; it is the in-run negative control, nothing more.
- The shipped `open_pristine_epic_login_window` already routes ANY `www.epicgames.com` URL to the
  pristine window (`is_epic_login` is a host check), so no shipped code change is needed to open
  the store in a pristine window — but it attaches to the shared `defaultDataStore()`, which is
  the operator's signed-in jar; do not clear it (`logging-out-of-epic-is-a-one-way-door-on-a-cold-jar`).
- `embeddable: false` does not gate the direct route; only the `index.tsx` guard does.
