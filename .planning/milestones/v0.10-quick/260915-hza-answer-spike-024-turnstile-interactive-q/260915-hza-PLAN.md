---
quick_id: 260915-hza
title: Answer spike 024's Turnstile interactive question for `/store/epic`
created: 2026-09-15
status: awaiting-human-measurement
todo: .planning/todos/pending/2026-09-05-store-epic-blocked-by-cloudflare-turnstile-in-the-embed.md
---

# Quick 260915-hza — answer spike 024's open question

## Why this is not a normal quick task

The todo is `ready: human`, and that is load-bearing. Its decisive step is **a person clicking a
Cloudflare Turnstile checkbox in a GUI window**. No subagent, no test, and no automated gate can
produce that measurement, and an agent that reports one has fabricated it — the recorded failure
mode in `execute-phase-auto-mode-fabricates-human-verify-outcomes`.

So this plan deliberately stops at the handover. Tasks 1–2 are desk work that make the
measurement *possible*; task 3 is the measurement and belongs to the operator; task 4 branches on
its result and cannot be written until the result exists.

## Premises re-verified at HEAD (2026-09-15)

The todo was filed 2026-09-05. All three of its code citations still hold:

| Claim | Verified |
|---|---|
| `storeEmbedOrigins.ts` epic entry gated | `epic` entry at `:42`, `startUrl` `:44` |
| `WebView/index.tsx:468` `store === 'epic'` gate | present, exact line |
| test pin asserts `false` | `__tests__/storeEmbedOrigins.test.ts:163` |
| "Six WebView suites name epic" | **7** files name epic (see task 4) |

## Task 1 — give the harness an Epic button ✅

`dist/index.html` had buttons for the control origin, Steam and GOG, but **not Epic** — Epic was
reachable only from the `SPIKE_AUTORUN` path, which is precisely the unattended mode that cannot
answer this question. Added two buttons: the configured URL (`www.epicgames.com/store/en-US/`,
what would actually ship) and the `store.` host. They converge via 302, per the spike, so this is
belt-and-braces rather than two variables.

## Task 2 — fresh container ✅

`tauri.conf.json` identifier `com.gamelib.spike024c` → `com.gamelib.spike024d`. `spike024c` is
run 3's container and carries its challenge history; a new identifier forces a fresh
`WKWebsiteDataStore`, which is the honest "new user's first contact" condition.

## Task 3 — the measurement (OPERATOR, cannot be delegated)

```bash
cd .planning/spikes/024-epic-store-in-embedded-child-webview/app
CARGO_TARGET_DIR=../../../../src-tauri/target cargo run    # no SPIKE_AUTORUN
```

Click **Create embed → Epic store (configured URL)**, then click the Turnstile widget.

Record: did the store render, or did the challenge persist / loop?

**Run it more than once, and keep the Steam control.** This is the spike's own hard-won caution —
run 1 alone produced a confident VALIDATED verdict that runs 2–3 overturned. One run against a
third-party anti-bot surface is not a result.

Two asymmetries worth knowing before scoring it:

- **A single success is decisive; a single failure is not.** One clean click-through proves
  passability outright. Failure has to repeat before it means anything, because Epic's posture is
  a service-side variable that throttled this account once already with no code change involved.
- **Clearance lands in the spike's container, not the app's.** A pass here answers "can a human
  clear it", not "does clearance persist into GameLib's own embed". That is a separate question
  and must not be silently folded into this one.

## Task 4 — branch on the result (blocked on task 3)

**If passable** — the change the todo describes:

- `storeEmbedOrigins.ts` — `embeddable: false` → `true` for `epic`
- `WebView/index.tsx:468` — remove the `store === 'epic'` gate
- `WebviewUnavailablePanel`'s `reason: 'epic'` arm becomes dead; its i18n keys go inert.
  **Do not delete them from `public/locales/`** — `meta/i18nCatalogChurnGuard.ts` rejects any
  non-`gamelib.json` change there and asserts it against the live tree in `pnpm test:ci`.
- **The test pin inverts, it does not extend:** `storeEmbedOrigins.test.ts:163` asserts `false`.
  Seven suites under `WebView/__tests__` and `components/__tests__` name epic; sweep them.

**If not passable** — close the todo WONTFIX with the measurement attached. The panel copy is
already honest and D-05's scope-out stands on its own. This is a perfectly good outcome, not a
failure of the task.

**Either way, Epic's own "Sign in" button in the embed header is a separate item** and must not be
allowed to inflate this one. It leads to the one surface known-blocked for a Tauri-injected
webview (the 2026-08-03 Talon 403 on `/id/api/email/exists`). Cross-webview handoff to the
pristine `WKWebView` login window is its own piece of work; file it, do not grow this.
