---
created: 2026-09-05T01:20:00.000Z
title: '`/store/epic` — decide the Turnstile story before un-gating the embed'
area: webview/store-embed
needs: spike-then-decision-then-code
status: completed
resolution: wontfix
resolved: 2026-09-15
resolved_by: "quick-260915-hza"
severity: minor
platform: any
ready: human
blocks: nothing
origin: spike 024 (3 runs, 2026-09-05); interactive runs 4-5 added 2026-09-15
files:
  - src/frontend/screens/WebView/storeEmbedOrigins.ts
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx
  - .planning/spikes/024-epic-store-in-embedded-child-webview/
---

## RESOLUTION — WONTFIX, 2026-09-15 (quick `260915-hza`)

**The question below was answered: a human CAN click the Turnstile widget, and it does NOT clear.**
The challenge re-issues. `/store/epic` stays gated exactly as it is — this is the outcome this
todo itself named as "a perfectly good outcome", and the panel copy is already honest.

| | Run 4 | Run 5 |
|---|---|---|
| Viewport at challenge | **969×58 — INVALID** | **986×630, pixel-verified** |
| Steam positive control | not run | **rendered** |
| Turnstile issuances | 4 (`68xxg`, `0ryr2`, `jqh5w`, `12326`) | 3 (`98ums`, `1tuf5`, `whqym`) |
| Verdict | discard | clicked → **re-issued**, ~25 s and ~30 s apart |

Evidence in the spike dir: `shot-epic-INTERACTIVE-challenge-run5.png` (Epic's "One more step" card,
an **unchecked** `Verify you are human` box at full size) and `run-4-5-interactive.log`. That
screenshot renders the operator's residential IP, so it is left unstaged pending redaction —
GameLib is a public fork.

**Three things this todo got wrong, recorded so the next reader does not inherit them:**

1. **The measurement it asked for was impossible with the harness it pointed at.** The interactive
   panel had buttons for the control origin, Steam and GOG but **no Epic** — Epic existed only in
   the `SPIKE_AUTORUN` path, i.e. the unattended mode that cannot answer an interactive question.
   This todo sat `ready: human` for ten days asking a human to click a button that did not exist.
2. **"Six WebView suites name epic" — it is seven.** Moot now the un-gate branch did not fire, but
   it would have under-scoped the sweep.
3. **Run 4 nearly closed this as a false negative.** The embed was created at `h:630` and measured
   `969×58` by the time the challenge was on screen, because `#logwrap`'s `flex: 0 0 170px` does
   not stop a flex item expanding to its content height. Spike 024 had **already recorded that
   defect as a known limitation and never fixed it**, and it then invalidated the very run it was
   blocking. Fixed in `35309eb4e`. The nav log could never have caught it: `set_embed_bounds` only
   logs when `!quiet`, so `"category":"bounds"` entries number 0 across every session.

**Not established, deliberately:** whether a different IP would clear it. Runs 1–5 share one
residential IP, so they cannot separate "Tauri webview is blocked" from "this IP's reputation is
spent". That needs a different network, and it would not change the decision — the gate cannot be
conditional on a user's IP reputation.

**Still open as its own item:** Epic's in-embed "Sign in" button (the second decision below). It
was not touched and does not become moot, since it concerns the login surface, not browsing.

**What would reopen this:** a change in Epic's Cloudflare posture, not a change in our code.

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
