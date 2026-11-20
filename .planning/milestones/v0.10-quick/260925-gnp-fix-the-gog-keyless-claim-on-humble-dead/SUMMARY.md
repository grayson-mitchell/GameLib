---
task: 260925-gnp
title: Fix the gog_keyless "Claim on Humble" dead button — route it through the Phase 40 host route
date: 2026-09-25
status: complete
commits:
  - c99fdee43
addresses: REQ-43-24
---

## What shipped

`HumbleKeyRow` called `window.api.storeEmbedOpen()` from inside a row while the Humble Keys route
was still mounted, fabricating bounds from `.App .content` with a viewport fallback. The embed
opened with no host route and no slot, so nothing sized, showed or scroll-synced the native
subview — the button read as completely dead.

**The bug was never the rectangle.** A second opener cannot be repaired by giving it a better
rect, only by ceasing to be a second opener.

| file                          | change                                                                 |
| ----------------------------- | ---------------------------------------------------------------------- |
| `HumbleKeyRow/index.tsx`      | `openHumbleKeysEmbed` + `HUMBLE_KEYS_URL` + the `isGogKeyless` onClick fork deleted |
| `Keys/index.tsx`              | `onClaim` navigates to `/store-page?store-url=` for `gog_keyless`      |
| `storeEmbedOrigins.ts`        | `humble` entry added                                                   |
| `Keys/__tests__/index.test.tsx` | 4 tests that INVOKE the handler                                      |
| `storeEmbedSingleOpener.test.ts` | new structural gate                                                 |

## Three decisions worth the record

**1. The fork lives in the container, not the row.** The todo said "route the claim through the
host route" without saying who navigates. `HumbleKeyRow` is deliberately hook-free — its suite
invokes it as a plain function with no Router context and states that in writing at
`__tests__/index.test.tsx:10-17`. `useNavigate()` there would have broken the harness for ~90
tests and forced a react-router mock into a file that needs none. `Keys/index.tsx` already holds
`useNavigate` and already navigates for the sibling login case, so this matches how `settleAction`
was threaded in 43-06. Side benefit: the row's two-way claim fork is gone.

**2. Adding Humble to `STORE_EMBED_ORIGINS` was mandatory, and it widens something.** Without the
entry, `resolveStoreForUrl` answers `null`, the deep-link gate takes `deepLinkShouldOpenExternally`
and the button "works" by leaving the app — the exact outcome D-43-11's probe rejected. Stated
rather than smuggled: **a Humble URL arriving from third-party deal data (`StoreSearch`,
`Discounts`) will now embed instead of opening externally.** Consistent with every other configured
store, but a change beyond the button. `storeKey` is caller bookkeeping only — the shipped Rust arm
ignores it (`storeEmbedFlowRegistration.ts:189`) — so a sixth key needed no backend work.

**3. The tests target the hole that let this ship.** Plan 43-09 shipped **eight** tests for this
button and every one pinned its **label**. Nothing invoked the handler, so a dead button passed the
suite, passed a live gate that never scored it, and was found only when a human clicked it. All
four new tests invoke `onClaim()`. The load-bearing one asserts the destination resolves as an
**embeddable** origin — delete Humble from the origin table and that fails loudly here instead of
silently routing users to a browser.

The `storeEmbedSingleOpener` gate exists because `useStoreEmbedHost` **already** declared itself
the single writer, in a comment, with the reasoning spelt out — and a second opener shipped anyway.
A prose invariant with nothing asserting it is a convention, not a contract. Comments are stripped
first and that is load-bearing: a bare grep returns **three** files today and exactly one is a
call, the other two being the comments explaining why the call is gone.

## Verification

| check                              | result                                          |
| ---------------------------------- | ----------------------------------------------- |
| Humble + WebView + storeEmbed jest | **1306 passed / 44 suites**                     |
| `pnpm codecheck`                   | exit 0                                          |
| `pnpm lint`                        | exit 0, **0 errors**, both ceilings PASS        |
| `npx prettier --check`             | clean over all five written paths               |
| revert-to-red on the new gate      | real second opener → RED; removed → GREEN       |

## NOT verified live — and a correction to my own earlier claim

The fix is proven by tests. **Nobody has seen the embed paint.**

I wrote in `43-VERIFICATION.md` on 2026-09-25 that this gap "cannot be closed on this machine",
because `gog_keyless` only occurs on unlinked GOG accounts. That is true of the **button** and
false of the **defect** — the framing had quietly widened from one to the other. The destination is
independently reachable with no entitlement at all:

```
/store-page?store-url=https%3A%2F%2Fwww.humblebundle.com%2Fhome%2Fkeys
```

PASS = Humble's keys page paints in-app, correctly sized, scrolling with the window, not in the
system browser. That covers the origin entry, the deep-link gate and the host lifecycle — every
part the defect broke. Only the button's own `onClick` wiring is out of its reach, and the four new
tests pin that directly.

Consequently: todo severity `major` → `medium`, `ready: code` → `live-gate`; `43-VERIFICATION.md`
stays `gaps_found` until that observation is taken. Phase 43's folder stays yellow, correctly, for
one more check.
