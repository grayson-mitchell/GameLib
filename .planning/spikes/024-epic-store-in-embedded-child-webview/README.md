---
spike: 024
name: epic-store-in-embedded-child-webview
type: standard
validates: "Given a Tauri-managed child webview (`Window::add_child`, spike 016's harness) pointed at Epic's storefront, when the page loads with the injected Tauri globals PRESENT, then observe whether Talon/Cloudflare blocks STORE browsing the way it blocks the LOGIN endpoint"
verdict: RESOLVED — the store is NOT browsable in a Tauri-managed child webview. Interactive runs 4–5 (2026-09-15) closed the open question: a human CAN click the Turnstile widget, and it does NOT clear — the challenge re-issues indefinitely
run_date: 2026-09-15
runs: 5
related: [013, 016, 017, 018]
tags: [tauri, webview, epic, talon, cloudflare, turnstile, anti-bot, embed, store-browser, macos]
---

# Spike 024: Epic store in an embedded child webview

## Verdict — PARTIAL, and read the three runs before quoting this

**Epic's store rendered fully on first contact and was blocked by a Cloudflare Turnstile challenge
on both subsequent runs.** One run in three is not "browsable".

| Run | Container | Cloudflare challenge navs | Epic result |
|---|---|---|---|
| **1** (12:51) | fresh (`spike024`) | **0** | **Store rendered.** Real title, `bodyLen=89181`, live sale copy, header painted |
| **2** (13:06) | reused | **2** | `Just a moment...`, `bodyLen=18450`, **empty** text |
| **3** (13:1x) | **fresh** (`spike024c`) | **2** | `Just a moment...`, `bodyLen=18450`, **empty** text |

The **Steam positive control rendered in all three runs** (`bodyLen` ~295 k, real text), so no run
can be dismissed as a broken harness or a dead network.

### Runs 4–5 — the INTERACTIVE arm (2026-09-15, quick `260915-hza`)

A human clicked the widget. It does not clear.

| Run | Container | Viewport at challenge | Turnstile issuances | Result |
|---|---|---|---|---|
| **4** | fresh (`spike024d`) | **969×58 — INVALID** | 4 (`68xxg`, `0ryr2`, `jqh5w`, `12326`) | **Discard.** See the harness defect below |
| **5** | `spike024d` | **986×630, pixel-verified** | 3 (`98ums`, `1tuf5`, `whqym`) | Clicked "Verify you are human" → challenge **re-issued**, ~25 s and ~30 s apart |

Run 5's Steam positive control rendered first (`add_child` at 986×630, two `on_page_load`, then
destroyed), so the harness and network were sound in the same session.

`shot-epic-INTERACTIVE-challenge-run5.png` is the evidence: Epic's "One more step" card with an
**unchecked** `Verify you are human` box at full size. Nav logs for both runs are in
`run-4-5-interactive.log`.

✅ **REDACTED 2026-09-18 — the warning below is DISCHARGED; the image is now safe to commit.**
Cloudflare printed the operator's residential IP and a `Session ID` at the foot of the challenge
card. Both are now covered by a solid black bar (pixels `1400,1020`–`1960,1170`, decoded and
re-encoded losslessly with `upng-js`; the re-encode also dropped the original's text chunk). The
evidentiary content is untouched: the "One more step" heading and the **unchecked** `Verify you
are human` box are both fully legible, as is the event log beneath. The bar is deliberately
opaque black rather than the card's background colour, so the redaction is visible as a
deliberate act rather than looking like a render glitch.

Note this supersedes the earlier description of the image, which listed "a Cloudflare `Session
ID`" as part of the evidence — that value is no longer readable, by design.

⚠️ ~~**The run-5 screenshot renders the operator's residential IP** (Cloudflare prints it on the
challenge card). This repo is a public fork. Redact before committing or publishing that
image.~~ — done, see above.

⚠️ **Run 4 was invalidated by a defect in THIS harness, listed below as a known limitation and
never fixed.** `#logwrap` was `flex: 0 0 170px`, but a flex item's automatic `min-height` is its
content height, so the growing event log expanded the panel and starved `#slot` — the embed was
created at `h:630` and measured **969×58** by the time the challenge was on screen. A Turnstile
widget rendered into a 58 px viewport cannot support any conclusion. Fixed in `35309eb4e`
(`min-height:0` + `max-height:170px`); run 5 is the first valid interactive sample.
**The known limitation the spike recorded went on to contaminate the very arm it was blocking.**

Note the log **cannot** corroborate viewport size over time: `syncBounds(false)` passes
`quiet: true` and `set_embed_bounds` only logs when `!quiet` (`main.rs:341`), so
`"category":"bounds"` entries number **0** across every session. Pixel capture is the only bounds
evidence there is — which is exactly why run 4's contamination was invisible in the log.

⚠️ **An earlier version of this file said VALIDATED on the strength of run 1 alone. That was
wrong** — it generalised from a single sample of a service whose posture is known to vary. Runs 2
and 3 were what caught it.

## What IS established

1. **The block is not the login fingerprint.** The injected globals — `isTauri`, `__TAURI__`,
   `__TAURI_INTERNALS__`, `ipc`, `__TAURI_IIFE__` — were read **from inside the loaded Epic page**
   and were present in **all three runs**, including the run that rendered fine. So the 2026-08-03
   Talon 403 mechanism (see [[tauri-pristine-wkwebview-defeats-fingerprinting]]) does **not**
   explain what happens on the store: the same fingerprint both passed and failed.
2. **The store CAN render in a Tauri-managed child webview.** Run 1 is a real, screenshotted
   render (`shot-epic-store.png`): Epic's header, nav, Sign in, Download, `Discover ⌄`. It is not
   a capability question.
3. **The gate is Cloudflare Turnstile**, not a bare 403. `shot-epic-CHALLENGED-run2.png` shows
   *"Please complete a security check to continue"*, and the nav log records
   `challenges.cloudflare.com/cdn-cgi/challenge-platform/…/turnstile/…`.
4. **`www.epicgames.com/store/en-US/` and `store.epicgames.com` converge.** Epic 302s the
   configured start URL onto the other host — observed in the nav sequence of every run. The
   host distinction that prompted run 2 is therefore **not** a variable.

## What is NOT established

- ~~**Whether a human can click through the challenge.**~~ — **ANSWERED by runs 4–5, and the
  answer is no.** The widget is genuinely interactive and clickable at full size; clicking it
  re-issues the challenge rather than clearing it. See the runs 4–5 table above.
- **Why run 1 passed.** Two candidates were considered; one is now dead:
  - ~~Container/cookie state~~ — **falsified.** Run 3 used a brand-new container and was still
    challenged.
  - **IP/behaviour reputation accrued over the session** — surviving, untested. Run 1 was this
    IP's first contact; by runs 2–3 it had a short history of visits that each loaded the store
    and then abruptly navigated away to `localhost` (the probe's exfil).
- Whether the challenge would have cleared given longer. Both challenged runs were still on the
  interstitial ~21 s after navigate. Not forever, just longer than the probe waited.
- Product pages, search, cart, and **anything behind sign-in** (still the known-blocked surface,
  deliberately untouched per D-07).
- ~~Full-viewport layout: the embed had shrunk to ~`986×117` logical by capture time.~~ — **fixed
  in `35309eb4e`**, but only after this exact defect silently invalidated run 4. Recording a
  measurement defect as a known limitation does not stop it contaminating the next run.
- **Whether a different IP would clear it.** Runs 4–5 share one residential IP with runs 1–3, so
  they cannot separate "Tauri webview is blocked" from "this IP's reputation is spent". Run 1
  remains the only unchallenged contact and it was this IP's first. Testing this
  needs a different network, not another run here — and it does not change the product decision,
  since the gate cannot be conditional on a user's IP reputation.

## Method notes worth keeping

- **The premise was measured, not assumed.** Reading the injected globals from inside the live page
  is what makes run 1 interpretable at all — a pass with an *absent* fingerprint would have proved
  nothing about Talon.
- **Exfiltrate by top-level navigation, never `fetch`.** An https store page cannot issue an
  `http://localhost` subresource request; WebKit blocks mixed content and a silently blocked
  `fetch` looks exactly like a blocked page.
- **`eval` after settle, never an `initialization_script`** — the latter is the technique that
  caused the original 403 suspicion.
- **A single run of a third-party anti-bot surface is not a result.** This spike's own history is
  the argument: run 1 alone produced a confident, wrong verdict.

## How to reproduce

```bash
cd .planning/spikes/024-epic-store-in-embedded-child-webview/app
SPIKE_AUTORUN=1 SPIKE_AUTORUN_EXIT=1 CARGO_TARGET_DIR=../../../../src-tauri/target cargo run
```

Drop `SPIKE_AUTORUN` for the interactive panel — that is the mode needed to answer the open
question above, since it lets a human click the Turnstile widget.

Screenshots are window-targeted: read `windowNumber` from the run log, then
`screencapture -l<id> -x shot.png` during the 6 s `SCREENSHOT WINDOW NOW` pause each arm logs.
Change `identifier` in `tauri.conf.json` to force a fresh WKWebsiteDataStore.

## Consequence for `/store/epic`

**Keep it scoped out — permanently, not "for now".** D-05's decision stands and is now backed by
the interactive measurement rather than by an unanswered question. `/store/epic` stays gated
(`embeddable: false`, the `store === 'epic'` guard in `WebView/index.tsx`, and
`WebviewUnavailablePanel reason="epic"`); the panel copy is already honest about it.

The follow-up todo closed WONTFIX on 2026-09-15 (quick `260915-hza`) with runs 4–5 attached. What
would reopen it is a change in Epic's posture, not a change in our code — so re-probe only if
there is a reason to think Cloudflare's configuration moved, and re-run the interactive arm more
than once when you do.
