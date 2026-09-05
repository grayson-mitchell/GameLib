---
created: 2026-09-05T01:20:00.000Z
title: '`/store/epic` — decide the Turnstile story before un-gating the embed'
area: webview/store-embed
needs: spike-then-decision-then-code
status: OPEN
severity: minor
blocks: nothing
origin: spike 024 (3 runs, 2026-09-05)
files:
  - src/frontend/screens/WebView/storeEmbedOrigins.ts
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx
  - .planning/spikes/024-epic-store-in-embedded-child-webview/
---

## Problem

`/store/epic` is gated off the live embed on every platform (`storeEmbedOrigins.ts`
`embeddable: false`; `WebView/index.tsx:468`'s `if (store === 'epic')`;
`WebviewUnavailablePanel reason="epic"`). Phase 40 scoped it out under D-05 and filed the question
as spike 024.

**Spike 024 has now run — three times — and the answer is not the clean yes it first looked like.**

| Run | Container | CF challenge navs | Epic result |
|---|---|---|---|
| 1 | fresh, this IP's first contact | **0** | **Store RENDERED**, `bodyLen=89181`, header painted |
| 2 | reused | 2 | Cloudflare Turnstile — `Just a moment...`, empty text |
| 3 | **fresh** | 2 | same |

Steam positive control rendered in all three, so no run is a broken harness.

**Established:** the store *can* render in a Tauri-managed child webview; the injected Tauri
globals were present in **all three runs including the one that passed**, so the login-endpoint
Talon fingerprint does **not** explain the store gate; the gate is **Cloudflare Turnstile**; and
`www.epicgames.com/store/en-US/` 302s onto `store.epicgames.com`, so the two hosts converge.

**Falsified:** container/cookie state — run 3 was a brand-new container and was still challenged.

## The question to answer first (cheap, and it decides everything else)

**Can a human click through the Turnstile widget in the embed?** All three spike runs were
unattended and never clicked, so *challenged* does **not** establish *unusable*. Turnstile in
normal mode is frequently an interactive checkbox, and the challenge screen renders fine.

```bash
cd .planning/spikes/024-epic-store-in-embedded-child-webview/app
CARGO_TARGET_DIR=../../../../src-tauri/target cargo run   # no SPIKE_AUTORUN — interactive
```

Click "Create embed" → point it at Epic → click the widget → record whether the store loads.

- **If yes** → this becomes the small change it was originally thought to be (below).
- **If no** → `/store/epic` stays gated, and this todo closes as WONTFIX with the measurement
  attached. That is a perfectly good outcome; the panel copy is already honest.

## If it turns out passable — the change

Small, but not a one-liner:

- `storeEmbedOrigins.ts` — `embeddable: false` → `true` for the `epic` entry.
- `WebView/index.tsx:468` — remove the `store === 'epic'` gate (added by plan 40-10 as a Rule 2
  fix).
- `WebviewUnavailablePanel`'s `reason: 'epic'` arm becomes dead code; its i18n keys go inert.
  **Do not delete them from `public/locales/`** — `meta/i18nCatalogChurnGuard.ts` rejects any
  non-`gamelib.json` change there and asserts it against the live tree in `pnpm test:ci`. Same call
  as quick `260810-tr4` D-01.
- **Test pins invert**, they do not merely extend: `__tests__/storeEmbedOrigins.test.ts:163`
  asserts `isEmbeddableOrigin('https://www.epicgames.com/store/en-US/')` is `false`. Six WebView
  suites name epic; sweep them.

## The second decision, separable — do not let it inflate this

**Epic's own "Sign in" button sits in the embed header**, and it leads straight to the one surface
that IS known-blocked for a Tauri-injected webview (the 2026-08-03 Talon 403 on
`/id/api/email/exists`). Options: intercept it and hand off to the pristine `WKWebView` login
window; let it fail visibly; or hide it.

The handoff option is a **cross-webview handoff and is its own item** — ship browsing first if it
ships at all, and file sign-in separately rather than growing this todo into a phase.

## Scheduling

**Todo, not a phase** — deliberately. Phase 40 already built, verified and live-gated the whole
embed machinery; this consumes it. There are no new requirements and no multi-plan sequencing.
Pick it up as a `/gsd-quick` once the interactive question above is answered.

**Blocks nothing.** D-05's scope-out stands on its own and Phase 40 closes without this.

## Do not re-derive

- The spike's own history is the caution: **run 1 alone produced a confident VALIDATED verdict that
  runs 2–3 overturned.** One run against a third-party anti-bot surface is not a result. If this is
  re-probed, do it more than once and keep the Steam control.
- Epic's posture is a service-side variable: it throttled this account on 2026-08-04 producing
  symptoms unrelated to any code change. A bad run here is not necessarily a regression.
