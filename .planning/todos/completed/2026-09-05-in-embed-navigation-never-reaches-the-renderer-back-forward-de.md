---
date: 2026-09-05
title: "In-embed navigation never reaches the renderer — Back/Forward stay disabled and the host label freezes after any in-page link click"
severity: high
area: frontend/store-embed
tags: [tauri, webview, store-embed, navigation, phase-40, req-40-06]
found_by: "Phase 40 verification (40-VERIFICATION.md, GAP-D)"
found_in_commit: cabc2c7d1
blocked_by: null
resolves_phase: null
resolved_by: 260905-e61
resolved_date: 2026-09-05
resolution: "Option 1 (Drain) implemented across all three layers. Automated DoD met; the live /store/gog confirmation remains OUTSTANDING."
---

## Symptom (user-visible)

Open `/store/steam` and click a game. The embedded store navigates correctly — the page
changes — but **the Back button stays greyed out**, so there is no way back except Reload.
The host label in the chrome is likewise frozen at the START URL's host.

This is most obvious on `/store/gog`, where the start URL is the affiliate host
`af.gog.com` and the landing page is `www.gog.com`: the label reads `af.gog.com`
indefinitely, no matter where the user browses. Pressing Reload is the only thing that
resynchronises the chrome with reality.

## Mechanism

REQ-40-06's inversion is **half-built**. The Rust side is correct; nothing carries its
state back to the renderer.

| Layer | State |
|---|---|
| `src-tauri/src/main.rs:~4913` | CORRECT. `on_page_load` + `PageLoadEvent::Finished` → `StoreEmbedState::push`, with seven passing unit tests for the cursor semantics. |
| same closure | **Emits nothing.** It only mutates the Mutex. |
| `storeEmbedFlowRegistration.ts:236-241` | `StoreEmbedSeam.takeNavEvents()` throws a declared-unimplemented Error. |
| `main.rs:7322-7406` | `RUST_STORE_EMBED_TAKE_NAV_EVENTS` has **no dispatch arm** — the nine registered arms do not include it. |
| `useStoreEmbedHost.ts:99-111` | No poll, no subscription. `navState` is only ever written by `applyNavResult`, from the RETURN VALUE of a back/forward/reload/navigate call **the user themselves initiated**. |
| `StoreEmbedControls/index.tsx:82` | `disabled={!backAvailable}` — driven purely by props that never update after an in-embed navigation. |

So Rust's `canGoBack` becomes `true` while the renderer's stays `false`, forever.

## Why nothing caught it

- **Every jest suite mocks `window.api`**, so no test could observe the missing arm.
- **The live gate clicked an in-page link** (Item 2) — but Item 2's pass condition is input
  *feel*, not chrome correctness. Nobody looked at the Back button. The gate contract did not
  ask them to.

## Why this is filed rather than left in a comment

The seam's own doc comment says *"no future plan has been assigned ownership yet"*. At the
time this todo was written the item existed in **code comments only**: no todo, no backlog
row, no Phase 38 ledger entry, no `deferred-items.md` entry — all four checked.

That is the exact **three-prose-locations-and-zero-queues** shape that Phase 40's own ROADMAP
preamble exists to prevent: this phase was created *because* REQ-34.4.1-07 sat in three prose
locations and zero queues for months. Leaving GAP-D in a doc comment would have reproduced
the phase's founding defect inside the phase itself.

## Fix options (pick one; they are alternatives, not steps)

1. **Drain (matches the existing seam shape).** Add a `store_embed_take_nav_events` Rust arm
   that drains a queue `on_page_load` writes, plus a renderer poll. Per the 013–015 rules the
   poller must be anchored to a **survivor** — the webview handle dies with the webview.
2. **Push.** Emit an event from `on_page_load` to the renderer and subscribe in the hook.
   Fewer moving parts, but check it against D-18: the renderer must remain the single writer
   of *geometry*; this channel carries nav state only, so the two do not conflict.

## Definition of done

- A test that **fails today**: assert `canGoBack` and the host label update after a simulated
  in-embed page load. Without this the fix cannot be proven, since the current suites cannot
  see the gap at all.
- Manual confirmation on `/store/gog` that the host label moves from `af.gog.com` to
  `www.gog.com` on landing.

## Related

- `40-VERIFICATION.md` GAP-D (the full measurement)
- `40-LIVE-GATE.md` Item 2 — the gesture that touched this and was not scored for it
- REQ-40-06


---

## RESOLUTION (quick task `260905-e61`, 2026-09-05)

**Option 1 (Drain)** was implemented, in three commits matching the three inert layers:

| Commit | Layer | Change |
|---|---|---|
| `b1fb9da27` | `src-tauri/src/main.rs` | `StoreEmbedState` gained a bounded `pending_nav_events` queue filled by `push()`; `store_embed_take_nav_events` dispatch arm added |
| `1a98652ca` | seam + transport | `takeNavEvents()` reaches the arm and coerces PER ELEMENT; two defect-pinning tests inverted |
| `b4de6820a` | `useStoreEmbedHost.ts` | 250 ms drain poll, anchored to a survivor, applies the last event |

Option 2 (Push) was rejected: it needed a new event channel and a subscription
shape with no sibling in this codebase, and would have left the already-shipped
`takeNavEvents` rung of the seam dead permanently.

### Definition of done

- [x] **A test that fails today.** `useStoreEmbedHost.test.tsx` property 10 asserts
  `canGoBack` and the host label follow a simulated in-embed page load, using the
  todo's own `af.gog.com` → `www.gog.com` reproduction. Verified RED against the
  pre-fix hook — **and properties 1–9 stayed GREEN under the same mutation**, which
  is exactly the blindness this todo described. Rust side:
  `store_embed_push_enqueues_a_nav_event_carrying_the_post_push_cursor_state`,
  verified RED by neutering `push`'s enqueue call.
- [ ] **Manual confirmation on `/store/gog`** that the host label moves from
  `af.gog.com` to `www.gog.com` on landing. **NOT DONE** — this is a live gate on
  real hardware and was not run. It is the one remaining unverified item.

### Notes for the live run

The 250 ms poll means the chrome updates up to a quarter-second after the page
lands. That is the expected feel, not a defect; a Back button that enables
instantly would mean the poll is running far hotter than intended.
