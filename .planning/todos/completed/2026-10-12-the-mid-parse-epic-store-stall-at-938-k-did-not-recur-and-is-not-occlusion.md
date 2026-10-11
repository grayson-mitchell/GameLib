---
created: 2026-10-12T07:50:00.000Z
title: 'The mid-parse Epic store stall at ~938 k (readyState loading, isLoading true) did not recur in 8 arms and is NOT occlusion — what sits at that offset is unmeasured'
area: webview/store-embed
severity: medium
platform: macos
ready: live-gate
status: RESOLVED
resolved: 2026-10-12
resolved_by: 'quick 261012-ago, spike 024 runs 24-27'
found_by: 'quick 261012-97a, spike 024 runs 20-23 (2026-10-12), splitting the stall todo'
files:
  - .planning/spikes/024-epic-store-in-embedded-child-webview/app/src/main.rs
  - .planning/spikes/024-epic-store-in-embedded-child-webview/README.md
---

## Problem

Runs 15, 16, 18 and 19 of spike 024 showed a raw `WKWebView` cold load of the Epic store parked at
`readyState=loading`, `isLoading=true`, `document.body` empty, `docLen` 938 382 / 938 383 on one
day and 938 544 / 938 545 the next (both hosts), key-art preloads still arriving — 4 arms of 16.
Quick `261012-97a` built the probe to name the resource holding the parser and then did not see
the state again in 8 Epic arms (runs 20–23). The blank state it did capture three times is a
different one — complete document, every head resource fetched, nothing painted — and that one is
explained and reproduced: the host window is occluded and WebKit is not rendering; it recovers on
un-occlusion (README runs 20–23, established #8). Occlusion does **not** produce the mid-parse
stall: two Epic arms loaded under the occluder, one from before the request, and both parsed to
completion. So the mid-parse stall is unexplained, currently unreproducible, and its one hard fact
is the offset: the same to ±1 character within a day, moving ~160 characters across a ~15 k
document change between days — a fixed point in the document, not a random network stall.

`severity: medium`, not `major`: 0 of 8 today after 4 of 16 before; run 19's instance completed
on its own between 40 s and 120 s; and the shipping-blocker framing rested on the blank state
that is now explained. It is not `minor` because, if it recurs at 1 in 4 on a visible window, it
is a white store tab with no recovery path measured.

## Solution

Harness only, two cheap additions to `probe_script`, then runs until one stall is caught or the
rate is bounded:

- On every arm, `at938: document.documentElement.outerHTML.slice(937800, 939200)` and
  `headEnd: outerHTML.indexOf('</head>')`, `bodyAt: outerHTML.indexOf('<body')` — on a rendered
  arm this names the element at the stall offset (end of an inline SSR-state `<script>`, a
  `<link rel=preload>` run, the `</head>`). The offset is stable enough within a day that a
  rendered arm's reading applies to a stalled one from the same day.
- On a stalled arm, the fields already present decide it: `nav.responseEnd === 0` with
  `nav.decodedBodySize` short of ~1.1 M means the *server* has not sent the rest (streaming-SSR
  flush stall — not ours to fix, and Safari would see it too); `responseEnd > 0` with the parser
  parked means WebKit is holding at a yield and the resume is what to look at.
- Keep the control arm focused and un-occluded (`SPIKE_PRISTINE_OCCLUDE=pre` leaves the `store…`
  arm as that control) so a recurrence cannot be an occlusion case in disguise: the title reads
  carry `occluded` now.
- `curl` is not a shortcut: WebKit's own UA from the shell gets `403 cf-mitigated: challenge`.
- Budget: ~6.5 min per run; 4 runs bounds the rate at ≤1 in 8 with the offset reading in hand
  either way.

## Do not re-derive

- Not a challenge (25.9 k document, `Just a moment...`, `challenges.cloudflare.com` in the
  resource list — none of which the stall shows).
- Not a pending head resource on the complete-document blank (runs 20, 22, 23: 9/9 scripts,
  4/4 stylesheets fetched, `inflight: []` — and `inflight` is empty by construction, Resource
  Timing only lists finished fetches; the set-difference `pending*` is the real test).
- Not occlusion (two occluded arms parsed to completion).
- `WKWebView.title` at 20 s still separates rendered from not: server title vs app title.

## RESOLUTION (2026-10-12, quick `261012-ago`, spike 024 runs 24–27)

**Measured.** Four runs, 8 raw Epic arms, 0 mid-parse stalls (0 of 16 since run 19). The
rendered arms carry the offset reading, and runs 26 and 27 served documents of exactly run 18's
and run 19's lengths (1 121 252 / 1 121 253), so run 18's stalled `docLen` maps onto them
directly: parse position 938 522 / 938 521 after the serialiser's `</script></head></html>`,
which is **149–150 characters into the inline analytics `SharedWorker` script, inside the
string literal `'epic-analytics-worker'`**. Mid character token — no element boundary, no
`</head>` (1 008 7xx), no parser-blocking resource (the only sync external script is ~1 k
earlier and was on every stalled arm's own resource list). The one thing that stops a tokenizer
there is the end of its input: the main-document response had stopped arriving at a fixed
transfer position (chunk or compression-block boundary — hence ±1 across hosts and a ~160
shift with a ~15 k document change between days). Run 19's instance completing by 120 s is a
stream that resumed.

**Decision from the todo's own discriminator:** stream stall, upstream of the webview (Epic's
edge / Cloudflare / the path), not a WebKit yield — by position, because `nav.responseEnd` read
`0` on two rendered `store…` arms and `nav.decoded` is `0` on every `www…` arm, so neither is a
reliable tell alone in this WebKit. Not a webview defect and not a shipping blocker for the
raw-subview design; the product answer is a load timeout with a reload affordance on the
embed, the same as any browser.

**Not established:** brotli block vs HTTP chunk boundary (not readable from JS; `curl` is
challenged); whether Safari reproduces it on a cold load. README `### Runs 24–27`, established
#9; `run-24.log` … `run-27.log`.
