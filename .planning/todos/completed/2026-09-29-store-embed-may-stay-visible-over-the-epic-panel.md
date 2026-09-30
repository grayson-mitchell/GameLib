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

## Closed 2026-10-01 (quick task 261001-svm)

**Refuted — the todo's own branch was taken.** The live check above named two outcomes; the
orchestrating session ran it on macOS hardware and reached "no native content visible at any point
during or after the switch," not the re-triage branch.

**Positive control:** driving to the GOG store route first painted `www.gog.com` (read as an
image), proving the capture pipeline CAN see native embed content when it is actually present.

**Measurement:** a 24-frame burst at ~100 ms spacing was armed before switching to Epic. Pre-switch
frames ran ~1.10 MB; from the first post-switch frame they drop to ~579 KB and stay there. That
first frame, read as an image, shows the unavailable panel clean — no GOG or Epic content, no
native surface anywhere. All 13 post-switch frames (~1.1 s) differ only by the console caret blink;
a settled capture seconds later is likewise clean. Reproduced a second time later in the same
session.

**Scope, not widened:** refuted POST-CR-01-fix only — the pre-fix state was never run on hardware,
so this cannot distinguish "CR-01 closed a real defect" from "the hypothesis was never real"; both
readings stay open. Measured on the macOS dev/debug build (`pnpm tauri dev`) via the docked Web
Inspector console; the packaged build was not re-measured. Frames are NOT committed — the GOG page
was signed in, so they carry account UI, and they live only in the measuring session's scratchpad.

**Forward pointer:** the same gate run found a different, `major` macOS defect — the embed stays
HIDDEN (not too visible) after any return to a store route — filed separately at
`.planning/todos/pending/2026-10-01-macos-store-embed-stays-hidden-on-every-return-to-a-store-route.md`
and fixed in this same quick task.
