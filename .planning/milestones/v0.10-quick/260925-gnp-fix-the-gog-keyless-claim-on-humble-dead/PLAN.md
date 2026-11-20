---
task: 260925-gnp
title: Fix the gog_keyless "Claim on Humble" dead button — route it through the Phase 40 host route
created: 2026-09-25
status: in-progress
closes: REQ-43-24
todo: .planning/todos/pending/2026-09-25-humble-keys-gog-keyless-claim-button-opens-an-embed-with-no-host-lifecycle.md
---

## The defect

`openHumbleKeysEmbed()` (`HumbleKeyRow/index.tsx:304-321`) calls `window.api.storeEmbedOpen()`
directly from a row while the Humble Keys route is still mounted. No host route, no slot — so
nothing afterwards sizes, shows or scroll-syncs the native subview it creates, and the click looks
like nothing happened.

## Chosen approach — option 1 of the todo, with the container owning navigation

The todo offered two routes. Taking **"route the claim through the Phase 40 host route"**, because
`/store-page?store-url=` already exists (`App.tsx:287`, `WebView/index.tsx:207-233`) and gives the
embed the full `useStoreEmbedHost` lifecycle for free. Option 2 (give the row its own slot) would
build a second host, which is what the single-geometry-oracle rule exists to prevent.

**One refinement over the todo's wording, decided here:** the navigation lives in the CONTAINER,
not the row.

`HumbleKeyRow` is deliberately hook-free — its test suite invokes it as a plain function with no
Router context and says so in writing (`__tests__/index.test.tsx:10-17`: "HumbleKeyRow has no
useState/useEffect ... the component is invoked directly as a plain function"). Adding
`useNavigate()` there would break that harness for every one of its ~90 tests and force a
react-router mock into a file that needs none. `Keys/index.tsx` already holds `useNavigate`
(`:108`) and already navigates for the sibling login case (`:479`), so threading the destination
through `claimAction.onClaim` matches the pattern 43-06 established for `settleAction`.

Bonus: the row's `isGogKeyless ? openHumbleKeysEmbed : claimAction.onClaim` fork disappears
entirely. One fewer branch, and the row goes back to having exactly one way to claim.

## Blast radius I am accepting deliberately

Humble is **not** currently in `STORE_EMBED_ORIGINS`, so `/store-page?store-url=<humble>` today
resolves to `null` → not embeddable → opens in the system browser, which is the exact outcome the
operator rejected. The fix therefore requires a `humble` entry in that table.

**Consequence, stated rather than smuggled:** `resolveStoreForUrl` is also consulted for
third-party deal deep links (`StoreSearch`, `Discounts`). After this change a Humble URL arriving
from deal data will embed in-app instead of opening externally. That is consistent with every
other configured store and is an improvement, but it IS a behaviour change beyond the button.

`storeKey` is caller bookkeeping only — the shipped Rust arm ignores it
(`storeEmbedFlowRegistration.ts:189`, `_storeKey`) — so a sixth key introduces no backend work.

## Tasks

1. Add the `humble` entry to `STORE_EMBED_ORIGINS`. Its test suite is table-driven over the
   entries, so the apex/subdomain/prefix-label/suffix-label/http attack cases extend to
   `humblebundle.com` automatically.
2. `Keys/index.tsx`: `onClaim` for a `gog_keyless` key navigates to the deep link; every other
   platform keeps the wizard.
3. `HumbleKeyRow/index.tsx`: delete `openHumbleKeysEmbed`, `HUMBLE_KEYS_URL` and the `isGogKeyless`
   onClick fork. Keep the `isGogKeyless` LABEL branch — "Claim on Humble" is still correct.
4. Tests that **exercise the click**, which is the hole that let this ship: 8 existing tests pinned
   the button's label and none invoked its handler.
5. A structural regression pin: no `storeEmbedOpen` call site outside `useStoreEmbedHost`.

## Verification

Live confirmation is NOT available on this machine — `gog_keyless` is the unlinked-GOG-account
shape and the operator linked GOG on 2026-09-22, so the branch is unreachable here. Fixture-driven
tests stand in for the live click deliberately, and that substitution is recorded in the SUMMARY
rather than left implicit.

- `npx jest` over the Humble + WebView suites
- `pnpm codecheck`
- `npx prettier --check` over the exact paths written
