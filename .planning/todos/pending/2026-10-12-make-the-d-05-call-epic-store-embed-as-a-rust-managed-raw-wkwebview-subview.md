---
created: 2026-10-12T20:30:00.000Z
title: 'Make the D-05 call: ship /store/epic as a Rust-managed raw WKWebView subview, or keep it gated for good'
area: webview/store-embed
severity: medium
platform: any
ready: human
status: OPEN
found_by: 'quick 261012-ago closeout (2026-10-12) — spike 024 is finished; what is left is a decision'
files:
  - .planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-CONTEXT.md
  - .planning/spikes/024-epic-store-in-embedded-child-webview/README.md
  - .planning/spikes/024-epic-store-in-embedded-child-webview/app/src/main.rs
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/storeEmbedOrigins.ts
  - src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx
  - src-tauri/src/main.rs
---

## The decision

Phase 40's **D-05** scoped `/store/epic` out as "a predicted failure with a known mechanism" and
handed it to spike 024. The spike is done. Its prediction held for the Tauri-managed child
webview (Turnstile-challenged in every cold run since run 2, 8 of 8 this week) and it found the
construction that is served: **a raw `WKWebView` built from Rust, with no wry setup, attached as a
subview of the main window at the embed's rect** — challenged 0 of 22 Epic arms across runs
17–27, rendering the real store beside Tauri's own webview. Both blank states that looked like
blockers are explained and neither needs webview code (README established #8 and #9).

D-05 is therefore no longer a scoping decision; it is a product and architecture decision nobody
has made:

**Option A — adopt the raw-subview construction for Epic.** A second webview construction in the
app, Rust-owned: bounds sync with the React panel, show/hide with route changes, back/forward and
URL reporting, cookie reads for the existing `humble_login_open`-style seams, a navigation
delegate, and a load timeout with a reload affordance (the stream stall of runs 15–19). macOS
only as written; Windows has no Stores-tab embed at all today
(`2026-10-11-stores-tab-embed-not-implemented-on-windows.md`) and Linux would need a WebKitGTK
equivalent.

**Option B — keep `/store/epic` gated, permanently and honestly.** `WebviewUnavailablePanel
reason="epic"` stays; its copy and the guard comment in `index.tsx` change from "measured, not
permanent" to "by decision", citing this todo. Zero new code. Epic library, install and launch
are unaffected either way — this is only the in-app storefront.

**Option C — pristine window, not an embed.** `is_epic_login` already routes any
`www.epicgames.com` URL to `open_pristine_epic_login_window`, so "Open Epic store" can open it
in the existing pristine `NSWindow` today with no code. Cheapest shippable path; it is a
separate window, shares the operator's signed-in `defaultDataStore()`, and inherits the same
occlusion rule. Could be the interim for A.

## Sub-decisions that come with A (and partly C)

1. **The Sign in button** — `2026-09-15-epic-in-embed-sign-in-button-has-no-decided-behaviour.md`
   is `human` and was written to wake up on exactly this unblock. Hand off to the pristine login
   window (correct-feeling, cross-webview handoff), fail visibly (cheapest, ships a dead-end
   button), or hide it (DOM injection into Epic's page — the technique class that started the
   fingerprint suspicion). Recommendation in the spike: hand off, because the window and the host
   check already exist.
2. **Platform scope** — Mac-first with the panel staying on Windows/Linux, or wait for a
   cross-platform construction. The Windows embed todo above is the other half.
3. **Jar** — `nonPersistentDataStore()` per open (cold, what the spike measured) vs the shared
   `defaultDataStore()` (warm, signed in; a logout there is a one-way door —
   `logging-out-of-epic-is-a-one-way-door-on-a-cold-jar`).
4. **Reputation** — 1 of 32 raw arms was challenged, after ~50 store hits a day from one IP with
   the child embed challenged alongside every time. A shipped embed exercises the store far
   less; unquantified, not zero.

## What the decision unblocks

- A: a phase (Rust subview plumbing, panel integration, timeout/reload UX, Sign in handoff).
- B: a one-file copy change and two todo closures (this one and the Sign in one, as WONTFIX).
- C: a copy change plus a product check that a separate window is acceptable UX.

## Do not re-derive

- Not the IP, UA or jar (runs 6–11); not the attachment (runs 17–19); not occlusion (runs 20–23,
  #8); not a WebKit parse defect (runs 24–27, #9). Read `## What IS established` before
  re-opening any of these.
- The public wry builder cannot strip the init scripts and handlers; a Tauri-managed webview is
  not a candidate under any flag.
