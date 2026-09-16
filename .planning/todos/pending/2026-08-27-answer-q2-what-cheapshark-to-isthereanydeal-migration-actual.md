---
created: 2026-08-27T09:32:35.257Z
title: "Answer Q2 — what a CheapShark → IsThereAnyDeal migration actually costs"
area: store-search
status: OPEN
severity: minor
platform: any
ready: human
files:
  - .planning/research/questions.md:59
  - .planning/notes/aggregated-store-search-foundations.md
  - .planning/seeds/aggregated-discovery-multi-provider-deals.md
  - src/backend/storeSearch/cheapshark.ts:29
  - src/backend/discounts/fetchDiscounts.ts
  - src/common/types/discounts.ts:24
  - .planning/quick/260916-gdg-answer-q2-cheapshark-to-itad-migration-cost/260916-gdg-RESEARCH.md
---

## Problem

The research is now done — `.planning/research/questions.md` Q2 is marked ANSWERED and the
full findings live in
`.planning/quick/260916-gdg-answer-q2-cheapshark-to-itad-migration-cost/260916-gdg-RESEARCH.md`.
What is left is not research, it is three human actions that code cannot substitute for. This
todo stays open and `ready: human` for exactly that reason.

## What is now answered

- **Access** is self-service at `isthereanydeal.com/apps/my/`, but the terms carry a "MUST NOT
  build a competition to IsThereAnyDeal" clause (**SPEC**) — see the human gate below.
- **Region** is a per-request `country` param (ISO 3166-1 alpha-2) that maps 1:1 onto
  `CatalogLocaleSettings.countryCode` — no translation layer needed (**SPEC**).
- **Rate limits** are 1000 req / 5 min *per key*, and GameLib ships one key in the binary, so
  that budget is shared across the whole user base (**SPEC**) — see the key-strategy gate below.
- **Steam AppID matching works exactly and in batch, with no API key** — `POST
  /lookup/id/shop/61/v1` returned real gids for real AppIDs this session (**MEASURED**). This is
  strictly better than CheapShark's per-result `steamAppID`.
- **The interface delta is small.** `buildRedirectUrl()` and the Phase 20 double-encoding
  pitfall both delete themselves — ITAD returns a complete, verbatim deal URL instead.

Point at RESEARCH.md for the field-by-field detail; this file only needs the headline.

## What is still open — three human actions

1. **Register an ITAD app** at `isthereanydeal.com/apps/my/`. Needs a human account. Unblocks
   the country/currency coverage measurement, which is still **UNKNOWN** (a 14-country sweep of
   `/service/shops/v1` returned an identical 34-shop list for every country, which disproves
   that endpoint as a coverage measure), and any live test of search / prices / deals.
2. **Email `api@isthereanydeal.com`** about the "MUST NOT build a competition to IsThereAnyDeal"
   clause — describe GameLib as a desktop launcher and ask explicitly whether an in-app
   aggregate deals browser is permitted. **This gates the Discounts-screen half only** — it
   blocks nothing about the StoreSearch price-checker.
3. **Decide the shared embedded-key strategy** — request a raised limit, per-user keys, or a
   GameLib-owned proxy. Each option has a friction or infra cost; this is a product decision,
   not an implementation detail.

## What this does NOT authorise

Recording the answer is not permission to migrate. `src/backend/storeSearch/cheapshark.ts` is
untouched and `SEARCH_CURRENCY = 'USD'` still ships. A migration needs its own plan.

## The 2026-08-27 Heroic GMG/Humble reasoning (still live)

Heroic v2.22.1 shipped GMG (`6d32bae8e`) and Humble (`728bd197e`) deals as static JSON mirrored
from `raw.githubusercontent.com/Heroic-Games-Launcher/deals-listing/`, itself fed by a nightly
GitHub Action calling `api.impact.com` with revenue-bearing credentials that cannot ship in a
desktop binary — that mirror-repo requirement, not caching preference, is why adopting the
client modules as-is is inert. The **2026-08-15 decision not to port them stands**, and two new
findings now bear on it:

- **ITAD's 34-shop list subsumes GMG, Humble, GOG, Epic, Steam, and Fanatical with no mirror
  repo, no impact.com partnership, and no affiliate pipeline (MEASURED).** `hideOwned` /
  `wishlistOnly` — impossible under the static-feed model because there is no account to filter
  against — become possible via ITAD OAuth (**SPEC**).
- **Amazon Games is absent from ITAD's shop list (MEASURED).** GameLib supports Amazon as a
  first-class store; ITAD does not track it. An ITAD-backed Discounts screen would be
  structurally blind to one of GameLib's four stores. Do not let the good news above land
  without this caveat — it is the reason "ITAD subsumes both Heroic feeds" is not the whole
  story.
