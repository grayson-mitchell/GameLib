---
created: 2026-10-15T00:00:00.000Z
title: "Embed container's zero-floor grid column fix (261015-dlu) never ran in the real app — static harness only"
area: webview
severity: minor
platform: macos
ready: live-gate
source: quick task 261015-dlu, <verification> section ("Not verified by anything here")
files:
  - src/frontend/screens/WebView/index.css
  - src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx
  - .planning/quick/261015-dlu-embed-container-grid-column-has-no-zero-/evidence/README.md
---

# Verify the `.WebView__embedContainer` column fix in the running app, not just the static harness

Quick task `261015-dlu` added `grid-template-columns: minmax(0, 1fr)` to
`.WebView__embedContainer` and pinned it with a jest text-extraction test. The fix is MEASURED,
not OBSERVED: a static harness page (`evidence/build-page.mjs`), driven by a compiled WKWebView
probe and chrome-headless-shell, shows the container's computed column width shrinking from
`419.66px` to `334px` at a 600px viewport across both engines. jest performs no layout in this
project, so nothing in that quick task, and nothing in this repo's test suite, actually renders
the fix.

Owed: a live gate on this Mac, resizing the real app window down toward (and below) the 900px
floor set by `261015-9qy`, confirming:

- The notice row's message visibly ellipsises and the actions (`Reload`, `Open in browser`)
  stay fully on-screen at and above 900px (the existing UI-SPEC E3 contract).
- Below 900px — if the window is ever resizable there, or via a dev-only override — the row
  degrades the way the harness predicts (message narrows, actions stay put) rather than
  reproducing the pre-fix overflow.
- At the 500px regime, the harness-predicted clip (message already at 0 width, actions still
  overflow) is real on hardware too — this task does not and cannot fix that regime with CSS,
  and the harness explicitly does not claim to.

No code change is expected from this todo unless the live gate finds a discrepancy between the
harness's predictions and what WebKit actually paints.

## Resolution

**Closed by quick task `261015-n5k`, 2026-10-15, live on this Mac — no code change.** A
`pnpm tauri:dev` build of HEAD (dev pid 53538, window id 86558, Retina 2x) on the real
Stores -> Epic route, with the real `StoreEmbedTimeoutBanner` rendered by the real React path:
`probe.js` wrapped `window.api.storeEmbedTakeNavEvents` from the Web Inspector console so the
hook's own 250 ms drain saw `loadTimedOut: true`. Sub-900 viewports came from docking the
inspector to the right of a 1280 px window and dragging the divider, which is a true WebKit
layout-viewport shrink, not a CSS override. Evidence, rig and all twelve measurement records are in
`../../quick/261015-n5k-live-gate-for-261015-dlu-verify-the-embe/evidence/`.

Per bullet:

- **At and above 900 px — PASS, observed.** At the 900 floor the row shows the message (380.08 px,
  not yet ellipsised) and both actions whole, actions' right edge 884 < 900 (frame `02`). At
  1280: message 760.08, actions right 1264 (frame `01`). UI-SPEC E3 holds at its declared test
  point. The `261015-9qy` clamp that was "not verifiable at desk" is also now measured: a
  `set size … {800, 800}` left the window at 900x800 (width only; `minHeight` not exercised).
- **Below 900 px — degrades as the harness predicted, observed.** At a 600 px layout viewport the
  container's column resolves to `344px` (its own box), the message ellipsises to 80.08 px
  ("Epic is taking...") and both actions stay inside the viewport, right edge 584 (frame `03`).
  Every live number is the harness's `600 F1` number plus 10 px, the known `.App`-width offset.
  A pre-fix control arm (injected `grid-template-columns:auto`) reproduced the original
  `item16-width600.png` clip live — column `419.65625px`, actions right 659.66, identical to the
  harness's `shipped` arm to the hundredth (frame `05`) — and removing it restored frame `03`'s
  numbers. The rig can see the defect; the fix removes it.
- **500 px regime — clip is real on hardware, as predicted, and not claimed fixed.** Column
  `244px`, message 0 px, actions right 503.92 (3.92 px past the viewport), Open in browser's right
  border cut (frame `04`). CSS on this container cannot help there; `minWidth: 900` is what keeps
  a user out of it.

Two observations recorded in the evidence README's section (e) and not acted on: under the
renderer-side injection a window resize can clear the banner (Rust's own `load_timed_out:false`
comes back on the set-bounds return path — an artefact of the injection, not a defect; the real
timeout carries `true` there); and with the pre-fix sizing the native Epic subview follows the
inflated slot rect past the webview's edge, so the old defect mis-sized the native view as well
as the row.
