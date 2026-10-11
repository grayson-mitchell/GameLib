---
created: 2026-10-12T07:20:00.000Z
title: 'Which in-flight head resource holds the stalled Epic store load — 5 of 16 raw-WKWebView cold loads are blank at 40 s, 2 of 3 still blank at 120 s'
area: webview/store-embed
severity: major
platform: macos
ready: live-gate
status: OPEN
found_by: 'quick 261012-7f2 and 261012-8gu, spike 024 runs 12-19 (2026-10-12)'
files:
  - .planning/spikes/024-epic-store-in-embedded-child-webview/app/src/main.rs
  - .planning/spikes/024-epic-store-in-embedded-child-webview/README.md
---

## Problem

The raw `WKWebView` is never Turnstile-challenged (runs 12–19, 0 of 16), so `/store/epic` has a
path — but 5 of those 16 cold loads sat on a white view at 40 s, and of the 3 stalls sampled at
120 s only 1 had completed. Every stall looks the same from the probe: the real store document
(`<meta name="host" content="store-web-…">`, `egstore-cache-hit`), `document.readyState ===
'loading'`, `document.body` empty, ~938 k of the ~1.12 M document parsed, `isLoading` true,
`cdn2.unrealengine.com` key-art preloads still arriving. The parser is stopped in `<head>`, which
means a render-blocking resource (a synchronous `<script src>` or a stylesheet) has not finished.
Which one is not known. Both UAs, both hosts, both attachments (own window, main-window subview).
Not seen in Safari (run 11, 2 of 2) or in the child embed's one render (run 1), but both are tiny
samples. `severity: major` because it is the shipping blocker for either embed shape, and because
a one-in-three blank store tab would read as "Epic is broken".

## Solution

Harness only, in `.planning/spikes/024-…/app`:

- In `probe_script`, add `inflight: performance.getEntriesByType('resource').filter(e =>
  e.responseEnd === 0).map(e => e.name)` and `headScripts: [...document.head.querySelectorAll(
  'script[src],link[rel=stylesheet]')].map(e => e.src || e.href)` — the exfil URL has room.
- Run `SPIKE_PRISTINE=1 SPIKE_PRISTINE_LONG=1` (either attachment) until ≥2 stalls are
  captured; the stall rate is roughly 1 in 3 per Epic arm, so 2–3 runs.
- Read the in-flight list on the stalled arm against the rendered arm's. The candidates, in
  order: a third-party script host that is slow or blocked for a non-Safari-shaped client; the
  `epic-service-worker.js` registration (only rendered runs show it fetched); an HTTP/2 stream
  stall on the store origin that a persistent store would not hit.
- If the resource is third-party and non-essential, a `WKContentRuleList` blocking it in the raw
  webview is the fix; if it is the store's own, measure with `WKWebsiteDataStore::defaultDataStore`
  (warm) once to see whether a persistent store changes the rate.

## Do not re-derive

- The stall is NOT a challenge: a challenge document is 25.9 k, title `Just a moment...`, and the
  nav log shows `challenges.cloudflare.com`. The stall shows neither.
- The rendered and stalled states are told apart from Rust without touching the page: the
  server's initial `<title>` is `Epic Games Store | Official Site`; the app sets the long title
  after boot. `WKWebView.title` at 20 s is enough.
- The 0-of-16 challenge result does not depend on this; do not reopen the gate question here.
