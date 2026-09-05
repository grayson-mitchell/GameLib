---
spike: 024
name: epic-store-in-embedded-child-webview
type: standard
validates: "Given a Tauri-managed child webview (`Window::add_child`, spike 016's harness) pointed at Epic's storefront, when the page loads with the injected Tauri globals PRESENT, then observe whether Talon/Cloudflare blocks STORE browsing the way it blocks the LOGIN endpoint"
verdict: PARTIAL — the store is NOT reliably browsable; it rendered on FIRST contact and was Cloudflare-challenged on both later runs, including from a fresh container
run_date: 2026-09-05
runs: 3
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

- **Whether a human can click through the challenge.** Turnstile in normal mode is often an
  interactive checkbox. **These runs were fully automated and never clicked anything.** So
  "challenged" here does **not** mean "a user cannot browse the Epic store in-app" — it means the
  unattended probe never got past it. This is the single most important open question and it is
  cheap to answer: launch the harness interactively and click the widget.
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
- Full-viewport layout: the embed had shrunk to ~`986×117` logical by capture time.

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

**Keep it scoped out for now.** D-05's decision stands, and this spike does not overturn it. The
follow-up is no longer "flip `embeddable: false`" — it is "find out whether a user can clear the
Turnstile challenge in-app, and decide what the embed shows when they cannot." Filed as a todo.
