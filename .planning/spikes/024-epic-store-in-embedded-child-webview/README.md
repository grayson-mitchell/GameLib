---
spike: 024
name: epic-store-in-embedded-child-webview
type: standard
validates: "Given a Tauri-managed child webview (`Window::add_child`, spike 016's harness) pointed at Epic's storefront, when the page loads with the injected `window.isTauri`/`__TAURI__`/`__TAURI_INTERNALS__`/`window.ipc` globals PRESENT, then the store renders normally — Talon's block is LOGIN-scoped, not store-scoped"
verdict: VALIDATED
run_date: 2026-09-05
related: [013, 016, 017, 018]
tags: [tauri, webview, epic, talon, anti-bot, embed, store-browser, macos]
---

# Spike 024: Epic store in an embedded child webview

## Verdict

**VALIDATED — Epic's storefront browses fine inside a Tauri-managed child webview, with the full
Tauri fingerprint present.** The confirmed 2026-08-03 Talon 403 is **login-endpoint-scoped**
(`/id/api/email/exists`), not a blanket block on the domain.

This means `/store/epic` is a **small follow-up**, not a new phase. The feared fallback — a raw
zero-injection `WKWebView` subview, with its four known plumbing gaps (no `WKUIDelegate`, dead
Cmd+V, no inspector, every `get_webview_window` lookup broken) — is **not needed for store
browsing**.

## The measurement

Two arms through the **same embed, same window, same session**, ~40 s apart.

| | `href` after settle | `document.title` | `bodyLen` | Injected globals present |
|---|---|---|---|---|
| **epic** (subject) | `https://store.epicgames.com/?lang=en-US` | `Epic Games Store \| Download & Play PC Games, Mods, DLC & More – Epic Games` | **89 181** | `isTauri`, `__TAURI__`, `__TAURI_INTERNALS__`, `ipc`, `__TAURI_IIFE__` |
| **steam** (positive control) | `https://store.steampowered.com/app/440/Team_Fortress_2/` | `Team Fortress 2 on Steam` | 295 547 | identical set |

`textHead` for the Epic arm is live merchandising copy, not an error page:

> `Discover Discover End of Summer Sale Save up to 75% on your favorites during the End of Summer
> Sale. Save Now Deals end September 17, 11am ET. New Featured Carousel Fortnite OG …`

Navigation sequence (from `run.log`): `navigate → on_page_load started → on_page_load finished
url=https://store.epicgames.com/?lang=en-US`. **No redirect to a challenge page**, and the
canonical anti-bot string `enable javascript and cookies to continue` appears nowhere.

`shot-epic-store.png` is the visual half: the real Epic Games Store header — logo, STORE /
Support / Distribute nav, locale globe, **Sign in**, **Download**, `Discover ⌄` — composited inside
the harness window. A populated DOM alone would not have proved it painted.

## Why the premise had to be measured, not assumed

The whole question presupposes the child webview *carries* the fingerprint. It does — the probe
read the globals **from inside the loaded Epic page** and found all five. Had they been absent,
this run would have proved nothing about Talon (it would only have shown that a clean webview
passes, which spike 013's pristine `WKWebView` already established for login).

So the two facts sit together and the conclusion follows:

1. The fingerprint Talon 403s the **login** endpoint over is present in this webview.
2. The **store** renders anyway.

⇒ The block is scoped to the login endpoint.

## Controls

- **Positive control (Steam)** ran through the *same* embed minutes later and rendered — so a
  passing Epic arm cannot be explained by a broken harness or a dead network.
- **Fresh container.** The app was renamed (`com.gamelib.spike024`, `spike-024-epic-store-embed`)
  so it got its own WKWebsiteDataStore. No Epic cookie or prior session was inherited; this is the
  first-visit case.
- **UA is representative, checked not assumed.** Harness sends
  `…Chrome/131.0.0.0 Safari/537.36`; production's `STORE_EMBED_USER_AGENT`
  (`src-tauri/src/main.rs:4666`) is the same macOS Chrome-token shape at `Chrome/142.0.0.0`. Same
  shape, different version.

## Method note — the exfil channel is a navigation, deliberately

The probe reads page state and ships it by **top-level navigation** to the harness's existing
`/report` endpoint, not `fetch`. An https store page cannot issue an `http://localhost` subresource
request — WebKit blocks mixed content — and a silently blocked `fetch` would have looked exactly
like a blocked page. Same navigation-exfil channel `report_response` already served for 016–018.

The probe `eval`s **after** the page settles, so it cannot influence what Talon fingerprinted at
load. It is measurement, not an `initialization_script` (the latter is the technique that *caused*
the original 403 suspicion).

## What this does NOT prove

- **Store landing page only.** Product pages, search, cart, checkout and anything behind sign-in
  are untested. Bounded probe scope per D-07 — this spike answers the store-page question and
  nothing broader.
- **Sign-in is still the known-blocked surface** and was deliberately not touched. Nothing here
  reopens it; the pristine `WKWebView` remains the login answer.
- **Not a full-size layout proof.** The harness's live bounds sync had shrunk the embed to
  `986×117` logical by screenshot time (its log strip grew), against `760×560` requested. The page
  loaded, executed and painted — but scroll feel, retina and drag-resize at a real viewport remain
  what spike 016 already listed as unverified.
- **n=1**, one machine, one IP, one account-less session, on 2026-09-05. Epic's posture is a
  service-side variable that has changed before: it throttled this account on 2026-08-04 after
  repeated logins, and that produced symptoms unrelated to any code change.

## How to reproduce

```bash
cd .planning/spikes/024-epic-store-in-embedded-child-webview/app
SPIKE_AUTORUN=1 SPIKE_AUTORUN_EXIT=1 CARGO_TARGET_DIR=../../../../src-tauri/target cargo run
```

Screenshots are window-targeted and taken externally: read `windowNumber` from `run.log`, then
`screencapture -l<id> -x shot.png` during the 6 s `SCREENSHOT WINDOW NOW` pause each arm logs.

Warm build after the harness copy: **4.3 s**.

## Follow-up this unblocks

`/store/epic` is currently gated off on every platform (`storeEmbedOrigins.ts`'s
`embeddable: false`, plus the `WebviewUnavailablePanel` `reason: 'epic'` arm added by plan 40-10).
Flipping it is a small change — but it is **not** in Phase 40's scope by D-05/D-06, and this spike
was explicitly filed as blocking nothing. It should be scheduled deliberately, with a live check
that Epic's own `Sign in` button inside the embed degrades acceptably (it leads straight to the
one surface known to be blocked).
