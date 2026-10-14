---
created: 2026-09-15T00:00:00.000Z
title: 'Epic''s in-embed "Sign in" button has no decided behaviour — intercept and hand off, fail visibly, or hide'
area: webview/store-embed
severity: minor
platform: macos
ready: live-gate
status: CLOSED
resolves_phase: 50
found_by: 'quick-260915-hza, 2026-09-15 — split out of the /store/epic Turnstile todo when that closed WONTFIX. It was the "second decision, separable" in that todo and was deliberately never actioned there.'
closed_by: "Phase 50's live gate, UAT Item 2 pass, 2026-10-13T09:06Z — the arm this todo's own falsifiable rule named. Closed with no code, per that rule."
files:
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/storeEmbedOrigins.ts
  - src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx
  - src/frontend/screens/WebView/useTauriOAuthLogin.ts
---

## The question

If Epic's storefront ever renders in the embed, its own **"Sign in"** button sits in the page
header — and it leads to the one surface that is *known* blocked for a Tauri-injected webview: the
Talon 403 on `/id/api/email/exists`, root-caused 2026-08-03. Three options, undecided:

1. **Intercept and hand off** to the pristine `WKWebView` login window. Correct-feeling, and by far
   the most work — it is a cross-webview handoff, not a click handler.
2. **Let it fail visibly.** Cheapest. Ships a dead-end button that 403s.
3. **Hide it.** Requires injecting into Epic's DOM, which is fragile against their markup and is
   the class of technique that caused the original fingerprint suspicion.

No option is obviously right, which is exactly why this is filed rather than fixed.

## Why this is `blocked`, not `human`

**The surface is unreachable.** `/store/epic` returns `<WebviewUnavailablePanel reason="epic" />`
at `index.tsx:468` before any embed renders, so Epic's header — and therefore its Sign in button —
is never painted. Deciding option 1/2/3 today would be speculative design for a screen no user can
open.

⚠️ **This is a parked item and parked items get buried** (the risk is recorded in this project's
own lessons). The unblock condition below is written to be greppable so it surfaces again rather
than rotting quietly. **`blocked_by:` records rot silently — re-read it before trusting it.**

## What would unblock this

Exactly one thing: **`/store/epic` being un-gated.** That is currently WONTFIX because a human
*can* click Epic's Cloudflare Turnstile widget and it does **not** clear — the challenge re-issues
(spike 024 runs 4–5, 2026-09-15). What would reverse it is a change in Epic's Cloudflare posture,
**not** a change in our code.

So: if anyone re-opens
`.planning/todos/completed/2026-09-05-store-epic-blocked-by-cloudflare-turnstile-in-the-embed.md`,
this todo wakes up with it. If that todo stays closed, this one is correctly dormant.

## Trap for whoever un-gates Epic — `embeddable: false` is NOT what gates the direct route

`storeEmbedOrigins.ts:44` sets `embeddable: false` for the `epic` entry, and it is natural to read
that as the gate. **It is not.** The in-situ comment at `index.tsx:460-467` states that the flag
*"is consulted only by the deep-link/restore path above, never by this direct route"*. The direct
route is gated **solely** by the `if (store === 'epic')` guard at `index.tsx:468`.

Consequence: flipping `embeddable` to `true` without removing the guard changes nothing, and
removing the guard while trusting the flag to still protect you exposes the embed. Both halves
have to move together, deliberately.

## Do not re-derive

- **The Talon 403 is login-scoped, not store-scoped.** The injected Tauri globals were present in
  every spike 024 run *including the one where the store rendered fine*, so the fingerprint does
  not explain the store gate. Do not conflate the two surfaces: browsing is blocked by Cloudflare
  Turnstile, sign-in is blocked by Talon. They are different mechanisms with different evidence.
- **Epic login itself works** through the existing pristine-`WKWebView` path — that is the escape
  hatch option 1 would hand off to. This todo is about Epic's *own* in-page button, not about the
  launcher's Epic account login, which is a separate and working flow.
- The `WebviewUnavailablePanel` `reason: 'epic'` arm and its i18n keys are **live**, not dead, for
  as long as the gate stands. If Epic is ever un-gated they go inert — but **do not delete the keys
  from `public/locales/`**: `meta/i18nCatalogChurnGuard.ts` rejects any non-`gamelib.json` change
  there and asserts it against the live tree in `pnpm test:ci`.

## 2026-10-12 — the blocker is now a decision, not a measurement (quick `261012-7f2`)

Spike 024 runs 12–16: a pristine raw `WKWebView` (no Tauri injection, no `add_child`, cold store)
renders the Epic store — 0 of 10 challenged, 6 rendered — with the `Sign in` button painted in
the header (`shot-pristine-epic-configured-RENDERED-run13.png`), while the Tauri child embed is
still challenged 10 of 10. So Epic browsing has an in-app path in a *separate pristine window*,
not in this embed. This todo wakes only if that window (or a raw-WKWebView subview of the main
window, the filed follow-up) is adopted for `/store/epic`; until someone decides that, `blocked`
is still right. If it is adopted, the question here is unchanged but the surface is a raw
`WKWebView`, so "intercept" means a native navigation delegate, not an `on_navigation` closure.

## 2026-10-12 — awake, `ready: human` (quick `261012-8gu`)

Spike 024 runs 17–19: the raw `WKWebView` renders the Epic store **inside the main window** at the
embed rect, 0 of 6 challenged, `Sign in` painted. The embed shape exists; what it waits on is the
decision to adopt a Rust-managed raw `WKWebView` for `/store/epic` (a different construction from
D-05's wording) and the cold-load stall todo. If adopted, "intercept" here is a native
`WKNavigationDelegate` on that subview — the `open_pristine_epic_login_window` delegate is the
in-repo precedent — not an `on_navigation` closure.

## Decision (2026-10-12)

**The call.** Quick `261012-d5g` recorded the D-05 call in
`.planning/todos/completed/2026-10-12-make-the-d-05-call-epic-store-embed-as-a-rust-managed-raw-wkwebview-subview.md`,
owned by Phase 50 in `.planning/ROADMAP.md` `### Phase 50`: **no interception and no DOM hiding.**
`/store/epic` will render in a Rust-managed raw `WKWebView` subview — the same non-injected
construction as the shipped pristine Epic login window (`open_pristine_epic_login_window`), which
completes Epic login today. This todo's premise — the Talon 403 on `/id/api/email/exists` against
a Tauri-injected webview — does not apply to that construction. Option 3 (hide via DOM injection)
is rejected outright; option 2's "dead-end button" is not expected to be dead.

**The falsifiable rule.** Phase 50's live gate measures Epic's own Sign in button in place (its
"Sign in" arm). If that arm completes sign-in, this todo closes with no code. ONLY if that arm is
Turnstile-challenged or 403s does the hand-off to the pristine login window become a Phase 50
task — and then "intercept" is a native `WKNavigationDelegate` on the subview, as the 261012-8gu
section above already says.

**Superseded premise.** `## What would unblock this` said the only unblock was "a change in
Epic's Cloudflare posture, not our code." That is superseded — the un-gate came from our side:
spike 024 runs 12-27 placed the discriminator in Tauri's webview construction (README `## What IS
established` #6-#9) and found a construction that is served. `## Why this is blocked, not human`
is likewise historical. Both are kept as written, as the record.

**Re-triage note.** `ready: live-gate` because only Phase 50's live gate, not a human design call,
can now move this todo. `platform: macos` because Phase 50 is macOS only.

## 2026-10-14 — CLOSED with no code, by the rule this todo wrote for itself

**Phase 50's live gate ran 2026-10-13/14 and UAT Item 2 — the "Sign in" arm — PASSED.** The
operator completed a normal login sequence against Epic's own in-page Sign in button, inside the
Rust-managed raw `WKWebView` subview, on the packaged build's jar that had never held an Epic
session. That is the `## Decision (2026-10-12)` section's first branch verbatim: *"If that arm
completes sign-in, this todo closes with no code."*

**It was not challenged and it did not 403** — the two conditions that would instead have made the
hand-off a Phase 50 task:

- `grep -c 'flagged as challenged'` returned **0** across every launch transcript of the gate
  (launches 1, 2, 2b, 2c and 3), and `WebviewUnavailablePanel reason="epic-challenged"` was never
  seen. UAT Item 18, the conditional challenge arm, was recorded `skipped` because its condition
  never occurred.
- No `403` line appears anywhere in `gamelib.log` for the session.

Corroborated by the jar rather than by the operator's word alone: the packaged jar's
`epicgames.com` entry count rose 6 to 22 with an mtime matching the sign-in minute, which is
session cookies landing.

**So the Talon 403 premise is retired by measurement, not by assumption.** This todo was filed
because Epic's Sign in button led to a surface known blocked for a *Tauri-injected* webview. The
shipped construction is not Tauri-injected, and the sign-in it was filed against now demonstrably
completes. Options 1 (intercept and hand off) and 3 (hide via DOM injection) are both moot;
option 2's feared "dead-end button that 403s" did not materialise.

**Nothing is owed by this closure.** No code shipped for it and none is needed. The `## Trap for
whoever un-gates Epic` section below still holds for anyone touching the guard or the
`embeddable` flag, and is kept for that reason.

## The Trap still holds

`## Trap for whoever un-gates Epic` still holds, and Phase 50 moves both
halves together (the guard becomes darwin-only; the `embeddable: false` flag and the deep-link /
last-URL restore paths are revisited). Its cited line numbers (`index.tsx:468`,
`index.tsx:460-467`, `storeEmbedOrigins.ts:44`) are stale — the guard and flag have moved; locate
them by `grep -n "store === 'epic'" src/frontend/screens/WebView/index.tsx` and
`grep -n 'embeddable: false' src/frontend/screens/WebView/storeEmbedOrigins.ts` rather than citing
new numbers.
