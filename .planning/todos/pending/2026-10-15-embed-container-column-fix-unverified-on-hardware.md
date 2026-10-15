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
