---
created: 2026-09-29
title: "Store embed may stay visible over the Epic unavailable panel after a GOG -> Epic switch — unverified on hardware"
area: webview/store-embed
severity: minor
platform: macos
ready: live-gate
files:
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
  - src/frontend/screens/WebView/index.tsx
---

## Hypothesis — not measured, not claimed as fixed

`260929-qth-CONTEXT.md`'s `<specifics>` section named this prediction, inferred from the code path
rather than observed on hardware: on a GOG -> Epic switch, before this quick task's CR-01 fix, no
code path called `storeEmbedHide()`, and the embed's bounds stayed wherever the GOG slot last set
them. Reading the code, the native webview should therefore have stayed VISIBLE at those bounds —
now showing Epic content — on top of the `<WebviewUnavailablePanel reason="epic" />` the render side
correctly shows. This was never run on macOS hardware, before or after this task's fix.

**This quick task's CR-01 fix (`isEmbeddableOrigin(startUrl)` gating `storeEmbedHide()` before any
navigate) would also resolve this hypothesis if it is real** — a non-embeddable target now hides the
embed instead of navigating it — but that is inference from source, the same kind of inference the
original hypothesis was, not a live measurement. No jest harness in this repo renders real native
webview compositing, so nothing in the automated suite can confirm or refute visibility over the
panel either before or after the fix.

## The live check that would settle it

On macOS hardware:

1. Cold-start the app directly on `/store/gog` (or navigate there fresh).
2. Confirm the GOG store embed is visible and positioned correctly.
3. Switch to `/store/epic` via the stores panel nav.
4. Look for native web content drawn over (or bleeding through) the
   `WebviewUnavailablePanel` — any visible GOG or Epic page content, not just the panel's own UI,
   at the panel's bounds.

If no native content is visible at any point during or after the switch, the hypothesis is refuted
and this todo can move to `completed/`. If content is visible, the defect is confirmed live and
should be re-triaged (likely `severity: medium` or above, since it would mean a shipped fix did not
fully close what it was believed to close).

## Why this stays `ready: live-gate` and not `ready: code`

There is no further code change proposed here — the CR-01 fix already lands the change that would
resolve this hypothesis if it is real. What remains is exclusively the live macOS observation above;
writing more code against an unmeasured hypothesis risks solving a problem that may not exist, or
missing the actual one.
