---
created: 2026-08-27T09:32:35.257Z
title: "Answer Q2 — what a CheapShark → IsThereAnyDeal migration actually costs"
area: store-search
status: OPEN
severity: minor
files:
  - .planning/research/questions.md:59
  - .planning/notes/aggregated-store-search-foundations.md
  - .planning/seeds/aggregated-discovery-multi-provider-deals.md
  - src/backend/storeSearch/cheapshark.ts:29
  - src/backend/discounts/fetchDiscounts.ts
  - src/common/types/discounts.ts:24
---

## Problem

`.planning/research/questions.md` Q2 has been open since 2026-07-12 and is still
unanswered. It now blocks two things at once, which is why it is worth doing.

### 1. The USD-only debt is live in shipped code

`src/backend/storeSearch/cheapshark.ts:29`:

```ts
/** D-13: the single place CheapShark's USD-only knowledge is applied. */
const SEARCH_CURRENCY = 'USD'
```

CheapShark was chosen for Phase 20 deliberately — no API key, no approval, public
JSON — with the USD-only cost accepted knowingly. The consequence is a **live
inconsistency inside the app**: the StoreSearch screen shows a UK user dollars,
while the GOG Deals tab shows the same user pounds correctly via
`CatalogLocaleSettings = { countryCode, locale, currencyCode }`. The prototype
provider is strictly less capable than the app around it.

### 2. It gates the multi-provider Deals decision (surfaced 2026-08-27)

Heroic v2.22.1 shipped GMG (`6d32bae8e`) and Humble (`728bd197e`) deals. Reviewed
again this session; the 2026-08-15 operator decision **not to port them stands**,
and the reasoning is now sharper than "they're Heroic's feeds":

- Both providers read static JSON from
  `raw.githubusercontent.com/Heroic-Games-Launcher/deals-listing/{gmg,humble}-feed/`.
- That feed is produced by a nightly GitHub Action calling `api.impact.com` with
  `Basic base64(AccountSID:AuthToken)`. **The mirror exists because those
  credentials are revenue-bearing and cannot ship in a desktop binary** — not as
  a caching preference. Heroic even strips the `Uri` field from the feed because
  it embeds the partner Account SID in its path.
- So adopting the client modules is inert without also becoming an impact.com
  partner and running a GameLib-owned mirror repo. That is the real cost, and it
  is the half a naive plan omits.
- Secondary consequences of the static-feed shape: locale collapses to a fixed
  per-currency fan-out (GMG 9 currencies, **Humble USD-only**), `hideOwned` /
  `wishlistOnly` become impossible (no account to filter against), and prices run
  up to ~48h stale (24h feed cron + 24h client `CacheStore`).

**ITAD is the alternative that makes the port unnecessary.** It is localised,
multi-store, and exposes both a lookup API and a deals/browse API — so one live
provider could serve the StoreSearch price-checker *and* replace the GOG-only
Deals screen, with no mirror repo, no affiliate pipeline, and no staleness.
That is a materially different plan from "port Heroic's two provider files", and
it cannot be chosen until Q2 is answered.

## Solution

Answer the five questions already specified in `questions.md:78-96`. Roughly a
few hours: register an app, hit the endpoints, read the terms.

1. **Access** — is the API key self-service/instant or approval-queued? Do the
   terms of use permit a desktop game launcher? Attribution required? A hard gate
   here changes the plan, and finding it late would hurt.
2. **Currency & region coverage** — which countries/currencies actually return
   prices, and how is region passed (param / key config / account setting)? Does
   it map onto the existing `CatalogLocaleSettings`, or is a translation layer
   needed?
3. **Rate limits & caching** — per-key limits, and whether a per-keystroke search
   box is viable or must be debounced/cached hard. Shapes the UX, not just the
   backend. (`useDebouncedStoreSearch` already exists.)
4. **Identity/matching** — does ITAD expose a Steam AppID the way CheapShark's
   `steamAppID` does? That field is what makes the "you already own this" badge
   exact rather than fuzzy for Steam titles. Losing it pushes everything onto
   fuzzy title matching and raises false-positive risk materially.
5. **Interface delta** — how much of the Phase 20 provider interface survives?
   Goal is to keep CheapShark-specific damage contained inside the adapter rather
   than leaked into shared types and IPC payloads.

**Additionally (new, from the 2026-08-27 review):** check whether ITAD's
deals/browse endpoint can back the Discounts screen, not just search. If yes,
this stops being a provider swap and becomes the answer to
[[aggregated-discovery-multi-provider-deals]] as well — the seed's step 2 already
names ITAD as the preferred aggregate source over CheapShark for exactly this
reason.

Record the answer in `questions.md` Q2 (mark ANSWERED with findings, as Q3 was),
then decide the Deals direction from it.
