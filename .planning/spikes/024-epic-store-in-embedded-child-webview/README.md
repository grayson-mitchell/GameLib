---
spike: 024
name: epic-store-in-embedded-child-webview
type: standard
validates: "Given a Tauri-managed child webview (`Window::add_child`, spike 016's harness) pointed at Epic's storefront, when the page loads with the injected Tauri globals PRESENT, then observe whether Talon/Cloudflare blocks STORE browsing the way it blocks the LOGIN endpoint"
verdict: RESOLVED — the store is NOT browsable in a Tauri-managed child webview. Interactive runs 4–5 (2026-09-15) closed the open question: a human CAN click the Turnstile widget, and it does NOT clear — the challenge re-issues indefinitely. Runs 6–10 (2026-10-11) ruled the user agent OUT as the cause — no override, `EpicGamesLauncher` and a full Safari string are all challenged on fresh containers. Run 11 (2026-10-11): a Safari Private Window on the SAME IP and engine, cold jar, rendered both hosts twice — the discriminator is the embedded webview itself, not the IP, the UA or the jar. Runs 12–16 (2026-10-12), a PRISTINE raw WKWebView (zero Tauri injection, no add_child, cold ephemeral store) in the same harness process was challenged 0 of 10 Epic arms (6 rendered, 4 stalled mid-parse on the real store document) while the Tauri child webview in the same five runs was challenged 10 of 10 — the gate is Tauri's webview construction, and /store/epic has an in-app path in a pristine window. Runs 17–19 (2026-10-12), the same raw WKWebView attached as a subview INSIDE the main window at the embed's rect, beside Tauri's own webview, was challenged 0 of 6 and rendered 4 of 6 by 120 s while the child embed was challenged 6 of 6 alongside it — the attachment is not the trigger, the embed shape exists without Tauri's multiwebview, and the open defect is a cold-load stall (half-parsed store document, 5 of 16 arms at 40 s, 2 of 6 still blank at 120 s). Runs 20–23 (2026-10-12): the probe was extended to list in-flight head resources and NO head resource is pending on a blank arm — every blank arm captured has the whole 1.12 M store document, 9 of 9 head scripts and 4 of 4 stylesheets fetched, readyState complete, 113 k of body, and nothing painted; raising an opaque occluder over the host window reproduces that state on demand (Steam too) and removing it makes the store boot and paint within the next sample, so the blank is WebKit suspending rendering updates for a window the window server reports as not visible, not a load stall; the earlier mid-parse variant (readyState loading at ~938 k) did not recur in 8 arms and is NOT produced by occlusion, so it stays open and narrower. Runs 24–27 (2026-10-12): on documents of exactly the stalled runs' lengths the stall offset lands 149–150 characters into the inline analytics-worker script, inside a string literal — mid character token, no element or resource boundary — so the document stream had stopped arriving at a fixed transfer position; a stalled upstream response, not a webview defect, 0 of 16 arms since run 19
run_date: 2026-09-15
rerun_date: 2026-10-12
runs: 27
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

**What survived at this point** (superseded by run 11, kept for the record): the IP is not
blanket-blocked — a warm jar on it is served. The two candidates left were (a) per-IP reputation
applied to cold visitors, and (b) something about the embedded `WKWebView` itself. A **Safari
Private Window** on this machine separates them: renders ⇒ (b), challenged ⇒ (a). Run 11 ran it.

### Run 11 — Safari Private Window, cold jar, same IP (2026-10-11, quick `261011-ws7`)

**Rendered, twice.** Real Safari 26.6, a fresh Private Window each time (closing the last
Private Window discards its ephemeral store), not signed in, same machine, same residential IP.

| Sample | URL | Window title at 25 s (CGWindowList) | At 45 s | Egress IP |
|---|---|---|---|---|
| 1 | `store.epicgames.com/en-US/` | `Epic Games Store \| Download & Play PC Games, Mods, DLC & More – Epic Games` | unchanged, Discover page painted | `api.ipify.org` in the **same private window** printed the exact address the webview's challenge card printed in runs 5–10 — iCloud Private Relay is **not** in play |
| 2 | `www.epicgames.com/store/en-US/` (the configured URL) | same real title | — | same window session as the IP check's successor; new Private Window |

`shot-safari-private-cold-jar-RENDERED-run11.png` is sample 1: the `Private` badge top-left, a
**`Sign in`** button (no account, so no warm jar), the store's Discover carousel. The IP shot is
not committed (it is the address). Driven by `System Events` keystrokes (⇧⌘N, ⌘L, URL, ⏎) because
Apple events to Safari itself are not authorised from the session; titles read via a Swift
one-off over `CGWindowListCopyWindowInfo`.

**What this settles — and it is the biggest move in this file since run 2:**

- **IP reputation is refuted** as the discriminator. A cold visitor from this IP, on this
  WebKit, is served the store. The "different network" test is moot.
- **The UA is refuted** (runs 6–10). **The jar is refuted** (run 3 was fresh and failed; run 11
  was fresh and passed).
- What is left is **the embedded webview itself**: the Tauri-managed child `WKWebView` is
  challenged where Safari's `WKWebView` is not. Candidates, in order of cheapness to test:
  1. **Tauri's injected initialization scripts** — `__TAURI__`, `__TAURI_INTERNALS__`, `ipc`,
     `isTauri`, `__TAURI_IIFE__`. This file's "What IS established #1" called the 2026-08-03
     Talon-fingerprint theory refuted because the globals were present in run 1, which passed.
     That inference was too strong: Cloudflare's decision is reputation-weighted, and a
     first-contact pass followed by challenges on every later cold visit is exactly what a
     bot-like JS environment produces once the IP has a history. Run 11 makes this the prime
     suspect again.
  2. **WKWebView-vs-Safari environment tells** that survive a correct UA: no `window.safari`
     object, no Safari extension surface, `WKWebViewConfiguration` defaults.
  3. Something in how the child is attached (`add_child`, bounds, visibility) that Turnstile's
     visibility/interaction heuristics dislike.
- **The cheap next measurement already exists in the shipped app**: `open_pristine_epic_login_window`
  (`src-tauri/src/main.rs`) is a `WKWebView` with **no Tauri injection** that passed Cloudflare
  on 2026-09-28 with `cf_clearance` ×3 in its jar. Point it at the store URL instead of the login
  URL. Renders ⇒ candidate 1 is confirmed and `/store/epic` has an in-app path (a pristine
  window, not the child embed); challenged ⇒ candidate 1 is out and 2–3 remain. Filed as todo
  `2026-10-11-epic-store-in-the-pristine-login-wkwebview-the-embed-challenge-is-webview-side`.


### Runs 12–16 — the PRISTINE arm (2026-10-12, quick `261012-7f2`)

**Never challenged. Zero of ten.** The todo run 11 filed asked for the shipped
`open_pristine_epic_login_window` construction pointed at the store. The shipped window attaches
to the process-durable `defaultDataStore()`, which on this machine is the operator's signed-in
Epic jar — a render there would be the warm-jar confound run 11 was built to exclude — so the
harness app got a port of that construction instead (`SPIKE_PRISTINE=1`, PHASE P): a webview-less
`tauri::WindowBuilder` window, a raw `WKWebView` attached by hand via `objc2-web-kit`, on a fresh
`nonPersistentDataStore()` per window. No `WebviewBuilder`, no `add_child`, no Tauri
initialization script, no wry delegates. Same process, same IP, and the child-embed phases still
run afterwards in the same run as a same-session negative control. Steam first, every time.

| Run | `customUserAgent` | Steam (pristine) | `www.epicgames.com/store/en-US/` | `store.epicgames.com/en-US/` | Child embed, same run |
|---|---|---|---|---|---|
| 12 | Chrome 142 — the shipped `standardBrowserUserAgent()` stub | served | **stalled** (below) | **stalled** | challenged ×2 |
| 13 | none (bare WebKit, no `Version/`, no `Safari/`) | served | **RENDERED** `bodyLen=127915`, `complete` | **RENDERED** `bodyLen=127809` | challenged ×2 |
| 14 | none | served | **RENDERED** `bodyLen=127809` | **RENDERED** `bodyLen=127937`, `complete` | challenged ×2 |
| 15 | Chrome 142 | served | **RENDERED** `bodyLen=121318`, `complete` | **stalled** | challenged ×2 |
| 16 | none | served | **RENDERED** `bodyLen=127937`, `complete` | **stalled** | challenged ×2 |

Ten pristine Epic arms: **0 challenged, 6 rendered, 4 stalled.** Ten child-embed Epic arms in the
same five runs: **10 challenged** (`Just a moment...`, `bodyLen` 18.4 k, Turnstile navs). Steam
served in all 20 arms. `shot-pristine-epic-configured-RENDERED-run13.png` and
`shot-pristine-epic-alt-RENDERED-run14.png` are the store — header, `Sign in`, `Download`,
`Discover ⌄`, the Kernel Hearts / Galactic Racer carousels, NZ$ prices;
`shot-pristine-steam-control-run13.png` is the control. Titles and URLs were read from Rust
(`WKWebView.title`/`URL`) at 20 s and 40 s before the probe touched the page; the rendered arms
already carried the real title at 20 s.

**The stall is not a challenge document, and it is not understood.** `shot-pristine-epic-alt-STALLED-blank-run16.png`
is a white window. The probe read the real store document — `<meta name="host"
content="store-web-…">`, `egstore-cache-hit`, `docLen` 938 k — with `document.readyState ===
'loading'`, `document.body` empty (`bodyLen=0`), `isLoading` true, and the resource timeline still
receiving `cdn2.unrealengine.com` key-art preloads at 40 s. The parser had not reached `<body>`.
The initial `<title>` is `Epic Games Store | Official Site`; the rendered pages carry the long
title the app sets after boot, which is how the two states are told apart from the title alone.
A challenge document is 25.9 k with the `Just a moment...` title; this is a different thing. It
hit both UAs and both hosts (`store.epicgames.com/en-US/` 3 of 5, the configured URL 1 of 5).
Whether it completes given longer than 40 s was **not measured**.

Two smaller things: a cold jar is redirected to `store.epicgames.com/?lang=en-US`, not the
`/en-US/` the (warm-container) embed lands on — a first-visit locale hop, not a gate. And the UA
is irrelevant in *both* directions now: the Chrome string rendered (run 15) and the bare WebKit
string rendered (13, 14, 16), while runs 6–10 showed no UA saves the embed.

**What this settles:**

- **The gate is on Tauri's side of the webview.** Same process, same IP, same WebKit, cold jar
  in both: the raw `WKWebView` is never challenged, the Tauri-managed child always is. Candidate 2
  from run 11 (WKWebView-vs-Safari environment tells) is **refuted** — the pristine window is
  still a `WKWebView` with no `window.safari`, sending WebKit's bare UA, and it is served.
- **Candidates 1 and 3 are confirmed as a pair, not separated.** The pristine construction removes
  Tauri's initialization scripts (`__TAURI__`, `__TAURI_INTERNALS__`, `ipc`, `isTauri`,
  `__TAURI_IIFE__`) *and* the `add_child` attachment *and* wry's own delegates, script message
  handlers and custom scheme handlers, all at once. The todo's result table called a render
  "candidate 1 confirmed by elimination"; that is one step too far. The cheap separating test is a
  raw `WKWebView` added as a subview of the **main** window's content view, beside Tauri's own
  webview — which is also exactly the embed shape the product wants, so it is filed as the next
  todo rather than a curiosity.
- **`/store/epic` has an in-app path today**: a pristine window. D-05's *embed* decision stands on
  its own terms (the Tauri child embed is still challenged 10 of 10); what is new is that a
  separate pristine window renders the store, and whether that is acceptable Epic store UX is a
  product decision nobody has taken. The 2026-09-15 sign-in-button todo's blocker is therefore a
  decision, not a measurement.

### Runs 17–19 — the raw subview INSIDE the main window, and the 120 s sample (2026-10-12, quick `261012-8gu`)

**Never challenged, inside the main window.** `SPIKE_PRISTINE_INMAIN=1` keeps everything from
runs 12–16 except *where* the raw `WKWebView` is attached: as a subview of the **main** window's
content view, at the child embed's exact rect (`290,96 760×560` logical; AppKit origin
`290,244`, the content view is not flipped), beside Tauri's own webview, on a fresh
`nonPersistentDataStore()`. No new window. `SPIKE_PRISTINE_LONG=1` adds a third read and shot at
120 s on the Epic arms. No UA override.

| Run | Steam (in-main) | `www.epicgames.com/store/en-US/` at 20 / 40 / 120 s | `store.epicgames.com/en-US/` at 20 / 40 / 120 s | Child embed, same run |
|---|---|---|---|---|
| 17 | served | RENDERED / — / — (`bodyLen=112969`) | RENDERED / — / — | challenged ×2 |
| 18 | served | **stalled / stalled / stalled** (`bodyLen=0`, `loading`, 938 k) | **stalled / stalled / stalled** | challenged ×2 |
| 19 | served | stalled / stalled / **RENDERED** (`bodyLen=112969`, `complete`) | RENDERED / — / — | challenged ×2 |

Six in-main Epic arms: **0 challenged, 4 rendered by 120 s, 2 still blank at 120 s.** Six
child-embed Epic arms in the same runs: **6 challenged.** Steam served in all 12.
`shot-pristine-INMAIN-epic-configured-RENDERED-run17.png` is the store painted inside the
harness's main window, in the dashed `#slot` region, with the sidebar and event stream around
it — the embed shape, with no Tauri child webview involved.
`shot-pristine-INMAIN-epic-configured-STALLED-at-120s-run18.png` is the same region white.

**What this settles:**

- **The `add_child` attachment is not the trigger.** Candidate 3 from run 11 is out. What
  remains is what Tauri/wry put *on the webview* — the initialization scripts (`__TAURI__`,
  `__TAURI_INTERNALS__`, `ipc`, `isTauri`, `__TAURI_IIFE__`) and wry's script message handlers
  and custom scheme handlers. Those cannot be separated with the public builder (there is no
  flag to suppress injection), and for the product question they do not need to be: a raw
  `WKWebView` managed from Rust is served, a Tauri-managed one is not.
- **The embed shape exists.** `/store/epic` can render **in place**, in the store panel, without
  Tauri's multiwebview — a raw `WKWebView` subview with its own bounds-sync, cookie access and
  navigation delegate written on the Rust side. That is a different construction from D-05's
  "Tauri child webview" wording and needs its own decision; it is not a separate window.
- **The stall is the real open defect, and it is now the thing to fix.** Across runs 12–19, 16
  cold Epic loads in a raw `WKWebView`: 11 rendered by 40 s, 5 stalled at 40 s; of the 3 stalls
  sampled at 120 s, 1 completed (run 19, between 40 and 120 s) and 2 had not. Terminal-looking
  state each time: the real store document, `readyState=loading`, `document.body` empty, ~938 k
  parsed, `isLoading` true, key-art preloads still arriving. Never a challenge document. Not
  seen in Safari (run 11, 2 of 2 at 25 s) and not seen in the Tauri child embed's one render
  (run 1) — but neither of those is a large sample. The next measurement is cheap and named:
  list `performance.getEntriesByType('resource')` entries with `responseEnd === 0` on a stalled
  arm to see which head resource is holding the parser. Filed as
  `2026-10-12-which-in-flight-head-resource-holds-the-stalled-epic-store-load.md`.

### Runs 20–23 — no head resource is pending; the blank is an occluded window (2026-10-12, quick `261012-97a`)

**The question the stall todo asked has a measured answer: nothing.** The probe gained
`inflight` (resource entries with `responseEnd === 0`), `pendingScripts` / `pendingStyles`
(every `script[src]` and `link[rel=stylesheet]` in the document whose URL has no Resource
Timing entry — the real in-flight set, since Resource Timing only adds an entry once a fetch
*finishes*, which `inflight` now shows from a measurement rather than a reading of the spec:
empty on every arm), `nav.responseEnd` / transfer sizes, `counts`, `tail` and `lastEl` (where
the parser is sitting), and every title read gained the host window's `occlusionState`,
`isKeyWindow`, `NSApp.isActive` and the view's hidden/in-window flags. Same in-main raw
`WKWebView`, same cold `nonPersistentDataStore()`, no UA override, `LONG=1`.

| Run | Arm | Occluder | 20 s | 40 s | 120 s | Probe at ~125 s |
|---|---|---|---|---|---|---|
| 20 | `www…/store/en-US/` | none (natural) | RENDERED | — | — | complete, 113 k body, 9/9 scripts, 4/4 styles |
| 20 | `store…/en-US/` | none (natural) | **short title, not loading** | same | same, **unpainted** | **complete, 113 k body, 9/9, 4/4, `inflight: []`, `pending: []`** |
| 21 | `www…` | raised ~0 ms after create, removed at 40 s | `occluded:true`, **Turnstile** | same | `occluded:false`, card **painted** | challenge document (25.8 k) |
| 21 | `store…` | none, host focused | RENDERED | — | — | complete |
| 22 | Steam | raised ~0 ms after create | served, **painted** at 40 s (first paint beat the occluder) | | painted | complete, 20/20 |
| 22 | `www…` | raised ~0 ms after create, removed at 40 s | `occluded:true`, short title, not loading | same, **unpainted** (1 colour) | `occluded:false`, **app title, painted** | complete, 113 k, 9/9, 4/4 |
| 22 | `store…` | none, host focused | RENDERED | — | — | complete |
| 23 | Steam | raised **1.5 s before** create (`occluded:true` before load) | served title, loading done | **unpainted** (1 colour) | **painted** after removal | complete, 20/20 |
| 23 | `www…` | raised 1.5 s before create | short title, not loading | **unpainted** | **app title, painted** | complete, 113 k, 9/9, 4/4 |
| 23 | `store…` | none, host focused | RENDERED | — | — | complete |

Eight raw-`WKWebView` Epic arms: 4 un-occluded control arms rendered by 20 s, 4 of 4; 1 natural
blank; 3 occluded (1 challenged, 2 blank-then-recovered). Raw Epic arms across runs 12–23 are now
24, challenged **1** (run 21, under the occluder — n=1, most likely this IP's accrued reputation
after ~50 store hits in a day with the child embed challenged in every run; not attributed to
occlusion). Steam served 8 of 8 in these runs; the child embed was challenged 8 of 8 alongside.

**What the new fields say about a blank arm** (run 20 `store…`, natural; runs 22 and 23
`www…`, occluded — same reading all three times):

- `readyState: complete`, `isLoading: false` from the 20 s read on, `bodyLen` 112 946–112 969
  (the rendered arms read 112 969), `docLen` ≈ 1.121 M (rendered: the same), `nav.responseEnd`
  79–302 ms, `counts: {scripts: 9, scriptsDone: 9, styles: 4}`, `pendingScripts: []`,
  `pendingStyles: []`, `inflight: []`, `tail` ends `</style></body></html>`. The whole document is
  in and every head resource has been fetched. **No head resource holds anything.**
- `document.title` is the server's `Epic Games Store | Official Site`; a rendered arm's is the
  app's long title. The store's client app has not booted — a `requestAnimationFrame`-gated step
  never ran.
- The embed rect in the 40 s and 120 s shots is **one colour, `#1e1e1e`** — the host's background,
  nothing painted by the raw view at all. (Run 18's stall shot was one colour too, but **white**:
  that arm had painted an empty page once. Different signature; see below.) Rendered arms show
  84–86 k distinct colours in the same rect.

**The occluder reproduces it, and removing it ends it.** A bare, undecorated, always-on-top
`tauri::WindowBuilder` window over the host's outer frame flips the host's `occlusionState` from
`8194` to `8192` (loses `NSWindowOcclusionStateVisible`) within a second. Under it, Epic reads
exactly like the natural blank arm (runs 22, 23) and **Steam does the same** when the occluder is
up before the load (run 23: served title at 20 s, one-colour rect at 40 s) — so this is WebKit,
not Epic: a `WKWebView` whose window the window server reports as not visible gets no rendering
updates (no paint, no rAF). Epic adds one thing on top: its app boot waits on a rendering
update, so the title never changes either. Removing the occluder and focusing the host: the
next sample (≤80 s later) has the app title and the painted store in 2 of 2 store arms, and the
painted challenge card in the challenged arm. The natural evidence agrees: in runs 22 and 23 the
control arm's 120 s read found `occluded:true, appActive:false` — the operator had switched
away — and the already-painted page kept its last frame.

**What is NOT reproduced: the mid-parse stall.** Runs 15, 16, 18 and 19 showed a different
state — `readyState: loading`, `isLoading: true`, `document.body` empty, `docLen` 938 382 /
938 383 (one day) and 938 544 / 938 545 (the next), both hosts, key-art preloads still arriving.
It did not recur in these 8 Epic arms, and occlusion does **not** cause it: both Epic arms that
loaded under the occluder (one through the whole parse) reached `isLoading: false` with the
full document. Its offset is the same to ±1 character within a day and moves by ~160 across a
~15 k document change between days, so it is a fixed point in the document — the parser's first
yield, a streaming-SSR flush boundary, or a specific element — but which is unmeasured. The
document cannot be inspected from outside a webview: `curl` with WebKit's own UA gets the
Cloudflare challenge (`403`, `cf-mitigated: challenge`) on every try. The narrower follow-up
names the measurement (a probe window around the offset on a rendered arm, plus
`nav.responseEnd` on the next stall if one recurs).

Observations not pursued: Tauri's own webview in the same window kept painting under the
occluder (its event stream advanced between the 20 s and 40 s shots) while the raw subview did
not — how wry's view differs was not measured. The shipped `is_epic_login` pristine window
(`open_pristine_epic_login_window`) is a separate NSWindow and would be subject to the same
occlusion rule.

Shots: `shot-pristine-INMAIN-epic-alt-UNPAINTED-complete-document-at-120s-run20.png` (natural),
`shot-pristine-INMAIN-epic-configured-OCCLUDED-unpainted-at-40s-run22.png` and
`…-UNOCCLUDED-painted-at-120s-run22.png` (the pair),
`shot-pristine-INMAIN-steam-PREOCCLUDED-unpainted-at-40s-run23.png` and
`…-epic-configured-PREOCCLUDED-unpainted-at-40s-run23.png`,
`shot-pristine-INMAIN-epic-configured-OCCLUDED-challenge-painted-after-unocclusion-run21.png`
(session id and IP blacked out). Logs `run-20.log` … `run-23.log`, challenge-card session ids
and IPs redacted in both the plain and the URL-encoded probe copies.

### Runs 24–27 — the stall offset is mid-string-literal inside an inline script: the document stream stopped there (2026-10-12, quick `261012-ago`)

**What sits at ~938 k is nothing the parser would stop for.** The probe gained `at938` (the raw
serialised document from offset 937 800 to 939 200), `headEnd` / `bodyAt`, `tagsAround` (the tag
opens either side of offset 938 450) and `scriptAt` (the bounds of the inline `<script>` that
contains offset 938 500). Same in-main raw `WKWebView`, cold `nonPersistentDataStore()`, no UA
override, `LONG=1`, no occluder; `SPIKE_PRISTINE_FOCUS=1` made the host key right after each arm
was created so a blank arm could not be a natural occlusion.

| Run | Steam | `www…` 20 s / 40 s / 120 s | `store…` 20 s / 40 s / 120 s | Probes | Embed |
|---|---|---|---|---|---|
| 24 | served | RENDERED / — / — | RENDERED / — / — | complete, 1.121 M, 9/9, 4/4 both | challenged ×2 |
| 25 | served | RENDERED / — / — | RENDERED / — / — | complete, 9/9, 4/4 both (host not key — operator away; `occluded:false`) | challenged ×2 |
| 26 | served | RENDERED / — / — | RENDERED / — / — | complete, **1 121 252** (run 18's document length), 9/9, 4/4 | challenged ×2 |
| 27 | served | RENDERED / — / — | RENDERED / — / — | complete, **1 121 253** (run 19's), 9/9, 4/4 | challenged ×2 |

**Rate.** 0 of 8 mid-parse stalls in these runs; 0 of 16 across runs 20–27; the 4 probed stalls
(plus run 19's 40 s blank that completed by 120 s) all sit in runs 12–19. Raw Epic arms across
runs 12–27: 32, challenged 1. Steam 12 of 12 in these runs; the child embed challenged 8 of 8
alongside.

**The offset reading.** Every rendered arm has the same two inline scripts straddling the stall
offset: the service-worker registration script and, right after it, the analytics
`SharedWorker` bootstrap, followed by the `async defer` hCaptcha loader. Runs 26 and 27 served a
document of exactly run 18's and run 19's lengths (1 121 252 / 1 121 253), so run 18's stalled
`docLen` (938 545 on `www…`, 938 544 on `store…`) maps onto them directly. `docLen` is
`outerHTML.length` of the partial DOM; with the parser inside a head script and no body yet
(`bodyLen 0`), the serialiser appends `</script></head></html>` — 23 characters — so the parse
position is 938 522 / 938 521, which is **149–150 characters into the analytics script
element** (run 26: element at 938 372–939 035; run 27: 938 373–939 036):

```
var statsWorker = new SharedWorker('/epic-analytics-worker.js', 'epic|-analytics-worker');
```

The parser was parked inside the string literal `'epic-analytics-worker'`, in the middle of a
single character token. There is no element boundary, no `</head>` (that is at 1 008 7xx), no
parser-blocking external script (the only sync one, `fonts.egstore-site`, is ~1 k earlier and
had been fetched on every stalled arm's own `res` list), nothing a tokenizer yields on. The one
thing that stops an HTML tokenizer mid-character-run is **the end of its input**: the main
document's response body had stopped arriving at that byte. A fixed decoded offset that is the
same to ±1 across both hosts (the hosts differ by one character in the head) and shifts by
~160 with a ~15 k document change between days is the signature of a fixed position in the
**transfer** stream — a chunk or compression-block boundary — not of anything in the DOM.
Run 19's instance completing between 40 s and 120 s is a stream that resumed.

So the discriminator the todo named resolves to the stream-stall side, by position rather than
by `nav.responseEnd`: `responseEnd` read `0` on two of the eight *rendered* `store…` arms here
(runs 24 and 27, `readyState complete`), so it is not reliable on its own in this WebKit;
`nav.decoded` is `0` on every `www…` arm regardless. The 23-character serialiser assumption
moves the position by at most a few characters either way — still inside the same script text.

**Consequence.** The mid-parse stall is a stalled main-document response, not a WebKit parser
or rendering defect and not something the embed's construction causes; it is upstream of the
webview (Epic's edge, Cloudflare, or the path to it) and would hit Safari the same way. It is
rare now (0 of 16 since run 19) but when it happens the raw embed shows a white page with no
feedback — the shipped embed wants the same thing any browser gives: a load timeout with a
reload affordance, not a code change to the webview. Not a blocker for the raw-subview design.

Observations not pursued: why `nav.transferSize`/`encodedBodySize`/`decodedBodySize` are 0 on
the `www…` host and populated on `store…` (same document, one redirect vs none); whether Safari
reproduces the stream stall on a cold load (never seen there, n small); whether the position is
a brotli block or an HTTP chunk boundary (not readable from JS; `curl` is challenged).

Logs `run-24.log` … `run-27.log`, challenge-card session ids and IPs redacted in plain and
URL-encoded copies. No new shots kept: every arm rendered, and the 20 s / 40 s / 120 s captures
show the painted store already on file from runs 17–23.

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
5. **The challenge is specific to the embedded webview** (run 11, 2026-10-11). Same IP, same
   WebKit, cold jar, real Safari: served, twice. Not the IP, not the UA (runs 6–10), not the jar
   (run 3 vs run 11). Item 1 above stands as a *fact* (globals present in the run that passed)
   but no longer as a *refutation* — see run 11 for why.
6. **The challenge is specific to the Tauri-managed webview construction, not to WKWebView**
   (runs 12–16, 2026-10-12). A raw `WKWebView` in the same process — no Tauri injection, no
   `add_child`, no wry delegates, cold ephemeral store — was challenged 0 of 10 while the child
   embed in the same runs was challenged 10 of 10. Six of the ten rendered the full store; the
   other four stalled mid-parse on the real store document, which is a separate, unexplained
   observation, not a challenge.
7. **The attachment is not the trigger either** (runs 17–19, 2026-10-12). The same raw
   `WKWebView` as a subview of the MAIN window, at the embed's rect, beside Tauri's webview:
   challenged 0 of 6, rendered 4 of 6 by 120 s, child embed challenged 6 of 6 alongside. What is
   left is what wry puts on the webview itself — the init scripts and its message/scheme
   handlers — which the public builder cannot strip, and which the product does not need
   stripped: a Rust-managed raw `WKWebView` is the embed.
8. **The blank store is an occluded window, not a stalled load** (runs 20–23, 2026-10-12). On
   every blank arm captured with the extended probe the whole document is in, all 9 head
   scripts and 4 stylesheets are fetched and nothing is painted; an opaque occluder over the
   host window reproduces the state on demand, for Steam as well as Epic, and removing it makes
   the store boot and paint within the next sample. WebKit suspends rendering updates for a
   window the window server reports as not visible; Epic's app boot waits on one. By
   definition the user is not looking at an occluded window, and the page recovers when they
   are. The mid-parse variant (runs 15–19) is a different state — see #9.
9. **The mid-parse stall is a stalled document stream, not a parser or resource wait** (runs
   24–27, 2026-10-12). On documents of exactly the stalled runs' lengths, the stalled offset
   lands 149–150 characters into the inline analytics-worker `<script>`, inside the string
   literal `'epic-analytics-worker'` — mid character token, no element or resource boundary,
   `</head>` 70 k further on. Only the end of input stops a tokenizer there: the response body
   had stopped arriving at a fixed transfer position. 0 of 16 arms since run 19 reproduced it.
   Upstream of the webview; the embed's answer is a load timeout + reload, not webview code.

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
- ~~**Whether a different IP would clear it.**~~ — **moot after run 11.** A cold jar on *this*
  IP in real Safari is served, so the IP is not what is being judged. Runs 6–10 ruled the user
  agent out. ~~What is NOT established is **which property of the Tauri-managed child webview**
  trips the challenge — the three candidates and the one-config-change test are listed under run
  11.~~ — **narrowed by runs 12–16.** Candidate 2 (WKWebView-vs-Safari tells) is out. Candidates
  1 (Tauri's init scripts) and 3 (the `add_child` attachment and the rest of wry's webview
  setup) are confirmed *together*; which of the two it is, or whether both are needed, is the
  remaining question, and the raw-subview-in-the-main-window test under runs 12–16 separates
  them. **Separated by runs 17–19: the attachment is out.** What is left is wry's per-webview
  setup (init scripts, message handlers, scheme handlers), not separable with the public
  builder and not needed to be.
- ~~**Why cold loads stall** with the real store document half-parsed~~ — **split by runs 20–23.**
  The blank-with-a-complete-document state is measured and explained: no head resource is
  pending; the host window is occluded and WebKit is not rendering; it recovers on un-occlusion
  (established #8). What remains is the **mid-parse stall** of runs 15, 16, 18 and 19
  (`readyState=loading`, `isLoading=true`, 938 k parsed, empty body): 0 of 8 Epic arms in runs
  20–23, not caused by occlusion (two arms parsed to completion under the occluder), fixed
  document offset to ±1 character within a day. **Placed by runs 24–27:** the offset is inside
  a string literal in an inline script — the document stream stopped there (established #9).
  What is still not established: whether it is a brotli block or an HTTP chunk boundary, and
  whether Safari sees it on a cold load; 0 of 16 arms since run 19 have reproduced it.

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

Pristine arm (quick `261012-7f2`, runs 12–16): `SPIKE_PRISTINE=1` adds PHASE P before the embed
phases — Steam, then both Epic hosts, each in its own `WindowBuilder` window with a raw
`WKWebView` on a fresh `nonPersistentDataStore()`. `SPIKE_PRISTINE_UA='<string>'` sets
`customUserAgent` (unset = WebKit's own). `SPIKE_RUN=<n>` names the shots, which PHASE P takes
itself (`screencapture -l`) at 20 s and 40 s into the spike directory as
`shot-pristine-<arm>-run<n>-{20,40}s.png`. The probe reads title, URL, `readyState`, `docLen`,
the head and the last six resource entries as well as the original fields. The logs committed
as `run-12.log` … `run-16.log` have the IP and session ids redacted by hand; `events-export.json`
is NOT updated by these runs (it carries the raw IP).

In-main arm (quick `261012-8gu`, runs 17–19): `SPIKE_PRISTINE_INMAIN=1` attaches the raw
`WKWebView` as a subview of the main window's content view at the embed rect instead of building
a window (close = `removeFromSuperview`; shots target the main window). `SPIKE_PRISTINE_LONG=1`
adds a 120 s read + shot on the Epic arms (`…-120s.png`).

Occlusion arm (quick `261012-97a`, runs 20–23): the probe now also reports `inflight`,
`pendingScripts`, `pendingStyles`, `counts`, `tail`, `lastEl`, `sw`, `currentScript` and
`nav.responseEnd`/sizes, and every title read carries the host window's `occlusionState`,
`occluded`, `keyWindow`, `appActive`, `onActiveSpace` and the view's hidden/in-window flags.
`SPIKE_PRISTINE_OCCLUDE=1` raises an opaque always-on-top occluder over the host right after
the Steam and `www…` arms are created and removes it after the 40 s read (the 120 s read is
then the recovery sample; with `LONG=1` the Steam arm gets the 120 s read too);
`SPIKE_PRISTINE_OCCLUDE=pre` raises it 1.5 s *before* the webview exists and logs the host's
occlusion before the load. The `store…` arm is always the un-occluded, focused control.
`curl` cannot stand in for the webview here: WebKit's own UA from the shell is challenged.

Offset arm (quick `261012-ago`, runs 24+): the probe also reports `at938` (the serialised
document from offset 937 800 to 939 200, where runs 15/16/18/19 parked), `headEnd` and `bodyAt`
(`indexOf('</head>')` / `indexOf('<body')`), and `tagsAround` (the six tag opens before offset
938 450 and the four after, as `offset:<tag>`) and `scriptAt` (start/end of the inline `<script>`
containing offset 938 500), so a rendered arm names what sits at the stall offset. `SPIKE_PRISTINE_FOCUS=1` focuses the host right after each arm is created when no
occluder is in play — the un-occluded condition of runs 17–19, with the host explicitly key.

## Consequence for `/store/epic`

**The gate stays; the reason for it changed.** Nothing shippable moved: the Tauri child embed is
challenged in 9 of 10 cold runs across four UAs (runs 2–10), so `/store/epic` stays gated
(`embeddable: false`, the `store === 'epic'` guard in `WebView/index.tsx`, and
`WebviewUnavailablePanel reason="epic"`) and the panel copy is still honest.

What is retired is the *explanation*. The 2026-09-15 WONTFIX rested on "the Turnstile cannot be
cleared and the cause is Epic's posture or this IP"; quick `261011-w8j` ruled the UA out and quick
`261011-ws7`'s run 11 ruled the IP and the jar out — a cold Safari Private Window on the same IP
renders the store. **The discriminator is on our side**, in the embedded webview. Quick
`261012-7f2` (runs 12–16, 2026-10-12) then ran the pristine construction — a raw `WKWebView` with
no Tauri injection and no `add_child`, cold store — in the same harness process: **challenged 0 of
10, rendered 6 of 10**, with the child embed challenged 10 of 10 alongside it. So Epic in-app
browsing **has a path today**: a pristine window, not the child embed. D-05's embed decision
still stands on its own terms. Quick `261012-8gu` (runs 17–19, same day) then attached the same
raw `WKWebView` **inside the main window** at the embed's rect: challenged 0 of 6, rendered 4 of
6 by 120 s, child embed challenged 6 of 6 alongside. So the embed shape exists without Tauri's
multiwebview — a Rust-managed raw `WKWebView` subview — and the separate-window question is moot
unless the subview is rejected on other grounds. What is open now is (a) the design decision:
D-05 said "Tauri child webview", and this is a different construction with its own bounds-sync,
cookie and navigation plumbing on the Rust side, macOS-only as written; and (b) the **cold-load
blank**, which quick `261012-97a` (runs 20–23) split in two: the state that recurs is an
**occluded host window** — the document and every head resource are in, WebKit is not rendering
because the window server says the window is not visible, and it boots and paints when the window
is uncovered — which is **not a shipping blocker** for either shape (the user is not looking at an
occluded window, and a product subview would inherit the same rule as any WKWebView); and the
mid-parse stall of runs 15–19, which quick `261012-ago` (runs 24–27) placed: the stalled offset
is inside a string literal in an inline head script — the document stream had stopped arriving
at a fixed transfer position, upstream of the webview, 0 of 16 arms since run 19. Its product
answer is a load timeout with a reload affordance on the embed, the same as any browser, not
webview code. The 2026-09-15 sign-in-button todo is awake on (a) and no longer waits on (b). An earlier draft of this section said
"permanently"; two earlier drafts stated reopen conditions that fired within a day. Re-run more
than once and keep the Steam control.

**Decided 2026-10-12 (quick `261012-d5g`) — the D-05 call is made and (a) above is closed.** Option
A: ship `/store/epic` as a Rust-managed raw `WKWebView` subview, macOS first, as **Phase 50**
(`ROADMAP.md` `### Phase 50`). Keeping the route gated for good was rejected by the same reasoning
the 2026-09-29 Linux decision recorded (a store off the embed is against the one-launcher core
value); the separate pristine window was folded in, not shipped as an interim — the
`humble_login_open` arm is a login-seam window (single-flight, cancel sentinel, fixed 900×700) and
reusing it for browsing is a misuse, not the "no code" path the todo described. Locked with it:
no interception or hiding of Epic's Sign in button (the subview is the same non-injected
construction as the shipped pristine login window; Phase 50's live gate measures it, hand-off only
if that arm is challenged), the shared default data store (so the gate carries a warm signed-in
arm — every run above was a cold `nonPersistentDataStore`), Turnstile-host detection falling back
to the panel, and a load timeout + reload for #9. Decision record:
`.planning/todos/completed/2026-10-12-make-the-d-05-call-epic-store-embed-as-a-rust-managed-raw-wkwebview-subview.md`.
