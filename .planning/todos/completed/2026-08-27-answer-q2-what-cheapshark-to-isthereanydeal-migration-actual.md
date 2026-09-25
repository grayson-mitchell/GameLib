---
created: 2026-08-27T09:32:35.257Z
title: "Answer Q2 — what a CheapShark → IsThereAnyDeal migration actually costs"
area: store-search
status: RESOLVED
severity: minor
platform: any
ready: human # MOOT here — the three human gates moved to Phase 47; see Closure
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

---

## Closure — 2026-09-24

**Resolved as ANSWERED, not as done-and-dusted.** The todo's title asks what the migration
*costs*; that is measured and written up, so the title is true at close. The residue is **not**
discarded — it moved to a phase that owns it.

**Where each piece went:**

| residue | new owner |
| --- | --- |
| The migration work itself | **Phase 47** — Migrate aggregated store search from CheapShark to IsThereAnyDeal (Stage 1) |
| Human gate 1 — register an ITAD app | Phase 47, gate 1 |
| Human gate 2 — the terms/quota/partner email | Phase 47, gate 2 — **SENT 2026-09-24, out-of-office received, awaiting reply** |
| Human gate 3 — shared-key strategy | Phase 47, gate 3 (depends on gate 2) |
| The Discounts-screen question | Phase 47's explicit OUT-of-scope, gated on gate 2's answer |
| Aggregated multi-provider browse | `.planning/seeds/aggregated-discovery-multi-provider-deals.md`, unchanged and still a seed |

**Nothing here is closed on an assumption.** Gate 2 is in flight, and its answer to "does the
rate limit follow the key or the authenticated account" determines whether Phase 47 builds an
embedded key plus caching or a per-user OAuth flow. Phase 47's roadmap entry says so in terms and
instructs planning to hold the question open rather than guess it.

**One claim in the body above is now known to be too strong** (found 2026-09-24 while scoping the
phase): the interface-delta section treats `common/discounts/storeMapping` as a cross-surface
change shared with the Discounts screen. It is not — `grep` for importers of
`common/discounts/storeMapping` returns exactly one production file, `cheapshark.ts`. An earlier
count was inflated by `src/backend/wiki_game_info/umu/utils.ts`, which declares a **local variable**
of the same name and imports nothing. The migration is cheaper on that axis than this file says.

**Two directions the operator settled while scoping** (2026-09-24), recorded so they are not
re-litigated: ITAD's missing **Amazon** coverage is accepted — Amazon is retained-because-built,
not a first-class store — and **Stage 2** (GameLib-owned affiliate feeds and the mirroring service
they require) is explicitly deferred indefinitely, not merely unscheduled. The affiliate-programme
research behind that call is in the Phase 47 entry and in this session's transcript, not in a
separate artifact.
