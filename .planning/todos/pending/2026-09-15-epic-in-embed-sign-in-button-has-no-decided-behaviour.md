---
created: 2026-09-15T00:00:00.000Z
title: 'Epic''s in-embed "Sign in" button has no decided behaviour — intercept and hand off, fail visibly, or hide'
area: webview/store-embed
severity: minor
platform: any
ready: blocked
status: OPEN
found_by: 'quick-260915-hza, 2026-09-15 — split out of the /store/epic Turnstile todo when that closed WONTFIX. It was the "second decision, separable" in that todo and was deliberately never actioned there.'
blocked_by: '/store/epic is gated off the embed entirely (WONTFIX, 2026-09-15). This surface is UNREACHABLE by users today, so there is nothing to fix and nothing to verify. Unblocks only if Epic browsing is un-gated — see "What would unblock this".'
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
