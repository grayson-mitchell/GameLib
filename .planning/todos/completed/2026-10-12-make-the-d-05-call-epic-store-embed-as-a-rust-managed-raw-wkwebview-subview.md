---
created: 2026-10-12T20:30:00.000Z
title: 'Make the D-05 call: ship /store/epic as a Rust-managed raw WKWebView subview, or keep it gated for good'
area: webview/store-embed
severity: medium
platform: any
ready: human
status: completed
resolution: decided-option-a-rust-managed-raw-wkwebview-subview-macos-first
resolved: 2026-10-12
resolved_by: "quick-261012-d5g"
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

## Decision (2026-10-12)

**a. The call — Option A.** Adopt the Rust-managed raw `WKWebView` subview for `/store/epic`,
macOS first. Owner: Phase 50 — `.planning/ROADMAP.md` `### Phase 50: Epic store in-app on macOS:
a Rust-managed raw WKWebView subview for /store/epic` is the canonical statement (scope, live-gate
arms, does-not-ship list), recorded by quick `261012-d5g`. In-repo precedent: a second Rust-owned
`WKWebView` construction scoped to Epic already ships — `open_pristine_epic_login_window`
(F-34.5-G6-01).

**b. Option B rejected, by precedent.** The 2026-09-29 Linux decision (quick `260929-9qr`,
`.planning/todos/completed/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md`,
"Why not keeping Linux off the embed", resting on quick `260928-upj`'s option (a)) rejected
keeping a platform off the embed as against the one-launcher core value; keeping a store off the
embed is the same class of call. Spike 024 runs 17-27 also found the construction that is served
(0 of 22 Epic arms challenged; README `## What IS established` #7-#9), so there is no longer a
measurement for "gated by decision" copy to rest on.

**c. Option C folded into A, not shipped as an interim.**

**d. Correction — this todo's own Option C text was wrong.** Its claim that the existing pristine
window could open the store "today with no code" does not hold. `is_epic_login` is a host check
(`url.host_str() == Some(EPIC_LOGIN_HOST)`, `EPIC_LOGIN_HOST` = `www.epicgames.com`) inside
`humble_login_open` — the LOGIN seam. Sending a browse URL down that arm inherits machinery built
for a sign-in sheet: the sheet single-flight guard, the login-cancel navigation sentinel, the
`LOGIN_WINDOW_EVENTS` queue, and `open_pristine_epic_login_window`'s fixed 900x700 `inner_size`.
Using it for browsing is a misuse of a login arm, not a no-code path. The spike README's
`## Consequence for /store/epic` already called the separate-window question moot once the
subview exists.

**e. The four locked sub-decisions.**

1. Sign in button — no interception, no DOM hiding; the subview is the same non-injected
   construction as the shipped pristine Epic login window, which completes Epic login today, so
   the sign-in todo's premise (a Talon 403 against a Tauri-injected webview) does not apply;
   Phase 50's live gate measures the button in place and a hand-off becomes a Phase 50 task ONLY
   if that arm is challenged or 403s
   (`.planning/todos/pending/2026-09-15-epic-in-embed-sign-in-button-has-no-decided-behaviour.md`).
2. Platform — macOS only in Phase 50; Windows and Linux keep `WebviewUnavailablePanel
   reason="epic"`; `2026-10-11-stores-tab-embed-not-implemented-on-windows.md` is untouched.
3. Jar — the shared default `WKWebsiteDataStore` (0 `data_store_identifier` hits in
   `src-tauri/src`; the Linux one-jar decision); the spike measured COLD only, so Phase 50's live
   gate must carry a warm, signed-in-jar arm.
4. Challenge / reputation — accepted, unquantified; Phase 50 ships Turnstile-host detection
   falling back to the panel, plus a load timeout with reload (README established #9); no Chrome
   UA spoof.

**f.** This todo is closed by decision; the work is Phase 50's.
