---
spike: 024
name: epic-store-in-embedded-child-webview
type: standard
validates: "Given a Tauri-managed child webview (`Window::add_child`, spike 016's harness) pointed at Epic's storefront, when the page loads with the injected Tauri globals PRESENT, then observe whether Talon/Cloudflare blocks STORE browsing the way it blocks the LOGIN endpoint"
verdict: RESOLVED — the store is NOT browsable in a Tauri-managed child webview. Interactive runs 4–5 (2026-09-15) closed the open question: a human CAN click the Turnstile widget, and it does NOT clear — the challenge re-issues indefinitely. Runs 6–10 (2026-10-11) ruled the user agent OUT as the cause — no override, `EpicGamesLauncher` and a full Safari string are all challenged on fresh containers
run_date: 2026-09-15
rerun_date: 2026-10-11
runs: 10
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

### Runs 6–10 — the UA arm (2026-10-11, quick `261011-w8j`)

**Runs 1–5 all sent a Chrome 131 UA from WebKit, and this file never named that as a variable.**
The harness builder did `builder.user_agent(CHROME_UA)` whenever `spoof_ua` was true; the autorun
hardcoded `true` and the panel checkbox defaulted to ticked (`grep '"spoofUa":' run*.log` →
12 × `true`, 0 × `false`). A Chrome UA on a Safari TLS/JS fingerprint is a textbook bot-management
signal, so the cheaper explanation had never been tested. Todo
`2026-10-11-re-probe-spike-024-epic-store-embed-with-the-chrome-ua-spoof` asked for the same
harness with that one flag flipped.

| Run | Container | UA presented (server-side oracle at `/probe`) | Embed viewport | Turnstile navs | Epic (both hosts) | Steam control |
|---|---|---|---|---|---|---|
| **6** | fresh `spike024e` | **none** — `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)` | 986×630 synced, **pixel-verified** | 2 | `Just a moment...`, `bodyLen` 18447 / 18383, "One more step" | rendered, 304406 |
| **7** | fresh `spike024f` | none (as run 6) | log-only | 2 | challenged, 18447 / 18383 | rendered, 273117 |
| **8** | fresh `spike024g` | none (as run 6) | log-only | 2 | challenged, 18469 / 18383 | rendered, 273117 |
| **9** | fresh `spike024h` | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) EpicGamesLauncher` — the string the pristine login window passes Talon with | 760×560 (add_child size), **pixel-verified** | 2 | challenged, 18469 / 18298 | rendered, 273119 |
| **10** | fresh `spike024i` | `… AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Safari/605.1.15` — a complete Safari 26.6 string | 760×560, **pixel-verified** | 2 | challenged, 18490 / 18447 | rendered, 273117 |

Logs: `run-6.log` … `run-10.log` (IP and Cloudflare session ID redacted — the challenge card's
text is now exfiltrated via `textHead`, so the raw logs carried both). Shots:
`shot-epic-NOSPOOF-challenge-run6.png`, `shot-epic-EGLUA-challenge-run9.png`,
`shot-epic-SAFARIUA-challenge-run10.png`, each with the card foot black-barred as run 5's was.
`SPIKE_SPOOF_UA=0` / `SPIKE_UA=<string>` are the two new harness knobs (see *How to reproduce*);
the log's PHASE 1 header and `add_child` record carry `spoofUa` / `uaOverride` so each run is
self-describing.

⚠️ **Read the shots against the log, not the panel.** The panel's `spoof Chrome UA` checkbox is
visibly ticked in all three shots because the autorun ignores the panel and the env var ruled —
`"spoofUa":false` at the PHASE 1 header is the authoritative record for runs 6–8.

⚠️ **Two viewport shapes, both valid.** Runs 6–8 show the embed synced to the slot (986×630);
runs 9–10 show it at the `add_child` size (760×560) because the panel's `ResizeObserver` sync had
not fired by capture. Neither is the 58 px squeeze that invalidated run 4; the widget is at full
size in every verified shot.

**What this arm settles:**

1. **The user agent is not the discriminator.** Four UA identities — Chrome 131 (runs 1–5), WebKit's
   own default (6–8), `EpicGamesLauncher` (9) and a complete Safari string (10) — are all challenged
   on fresh containers. The Steam control rendered in all five new runs, so none is a harness or
   network failure.
2. **The todo's premise about WKWebView's default UA was wrong, usefully.** With no
   `applicationNameForUserAgent`, WKWebView sends a *bare* `AppleWebKit/605.1.15 (KHTML, like
   Gecko)` with **no `Version/` and no `Safari/` token** — itself an unusual string. Run 10 exists
   to close that gap, and it was challenged too.
3. **Same machine, same IP, same engine, real Safari: served.** Opened during the same session;
   CGWindowList reported the window title `Epic Games Store | Download & Play PC Games, Mods, DLC &
   More – Epic Games` and the Discover page rendered. **Confound:** that Safari is signed in to an
   Epic account, so its jar is warm (very likely holding `cf_clearance`); it is a cold-jar-vs-warm-jar
   comparison, not a webview-vs-browser one. The shot is deliberately **not** committed (it shows the
   account and the operator's tab bar). AppleScript to Safari was not authorised from this session,
   so a Private Window control was not run.

**What survives, sharpened.** The IP is not blanket-blocked — a warm jar on it is served. What is
challenged every time is a **cold jar from this IP in this embedded webview**, with the UA now
irrelevant. The two candidates left are (a) per-IP reputation applied to cold visitors, and (b)
something about the embedded `WKWebView` itself (Tauri's injected scripts, custom-scheme origin,
missing TLS session state). One of two cheap controls separates them, and both need an operator:
a **Safari Private Window** on this machine (cold jar, real browser — renders ⇒ (b), challenged ⇒
(a)), or a run of this harness on a **different network**.

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
- **Whether a different IP would clear it.** Runs 4–10 share one residential IP with runs 1–3, so
  they cannot separate "Tauri webview is blocked" from "a cold jar on this IP is challenged". Run 1
  remains the only unchallenged contact and it was this IP's first. Runs 6–10 ruled the **user
  agent** out and showed a warm signed-in Safari jar on the same IP is served (see the runs 6–10
  section). Testing the remainder needs a Safari Private Window control or a different network,
  not another run of this arm — and it does not change the product decision, since the gate
  cannot be conditional on a user's IP reputation.

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

UA knobs (quick `261011-w8j`): `SPIKE_SPOOF_UA=0` sends no `user_agent()` override at all (runs
6–8); `SPIKE_UA='<string>'` substitutes an explicit string for the Chrome one when the spoof is on
(runs 9–10). Both apply to the autorun's PHASE 1 `create_embed` only; the panel checkbox still
governs panel-created embeds. `tauri.conf.json`'s `identifier` is baked in by
`generate_context!()`, so a fresh container needs a rebuild, not just an edit.

Screenshots are window-targeted: read `windowNumber` from the run log, then
`screencapture -l<id> -x shot.png` during the 6 s `SCREENSHOT WINDOW NOW` pause each arm logs.
Change `identifier` in `tauri.conf.json` to force a fresh WKWebsiteDataStore.

## Consequence for `/store/epic`

**Keep it scoped out — on measurement, not "for now".** D-05's decision stands and is backed by
ten runs: the interactive measurement (runs 4–5) and the UA arm (runs 6–10). `/store/epic` stays
gated (`embeddable: false`, the `store === 'epic'` guard in `WebView/index.tsx`, and
`WebviewUnavailablePanel reason="epic"`); the panel copy is already honest about it.

The follow-up todo closed WONTFIX on 2026-09-15 (quick `260915-hza`) with runs 4–5 attached, and
quick `261011-w8j` appended runs 6–10 on 2026-10-11 without reopening it. An earlier draft of this
section said "permanently" and "only a change in Epic's posture could reopen it"; that overstated
what five runs with a constant UA could show. What would reopen it now is specific: a **cold-jar
control that renders** — a Safari Private Window on this machine, or this harness on a different
network. If either renders, the discriminator is on our side and the question is live again; if
both are challenged, the IP-reputation reading stands with nothing left untested on this machine.
Either way, re-run more than once and keep the Steam control.
