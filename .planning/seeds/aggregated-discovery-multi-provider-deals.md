---
title: Aggregated discovery — generalize Deals from GOG-only to N providers
trigger_condition: Once Phase 20 (Aggregated Store Search) has shipped and its provider interface has survived one real consumer — i.e. we know what a provider actually needs to expose before committing the browse surface to it
planted_date: 2026-07-12
related_phase: 20 (Aggregated Store Search — CheapShark)
---

# Seed: Aggregated discovery (multi-provider Deals)

## The idea

The `/discounts` "Deals" screen is a **browse** surface hardwired to one store: GOG's catalog
API (`src/backend/discounts/index.ts:17`). The ambition is a genuinely aggregated store — deals,
trending, and shelves across *every* store, with `hideOwned` on, so discovery happens inside
GameLib instead of across six tabs.

The screen already has the right bones: `hideOwned`, `wishlistOnly`, and a real
`CatalogLocaleSettings` (`{ countryCode, locale, currencyCode }`) model. What it lacks is a
**provider abstraction** — GOG is the only implementation and it is inlined.

## Why this is deferred rather than done now

Search and discovery share a provider layer and the ownership matcher, but they are separate UI
efforts, and search is the far smaller first bite. More importantly: **the provider interface
should be designed by a consumer that actually uses it, not speculatively.** Phase 20's search
is that consumer.

Building the browse surface against an unproven interface risks baking in the wrong shape —
and doing it while the prototype provider (CheapShark) is USD-only would bake in the *wrong
currency model* too, on a screen that today handles currency correctly.

## What "pull the seed" looks like

1. Refactor `backend/discounts` from hardcoded GOG → the provider interface Phase 20 proved out.
   GOG becomes one implementation among several, not the shape of the API.
2. Add providers behind it. Prefer IsThereAnyDeal (localised, multi-store) over CheapShark
   (USD-only) as the aggregate source for this surface — see the ITAD migration research question.
3. Extend `hideOwned` to use the generalized cross-store ownership matcher (from `humble/dedup.ts`),
   not just GOG ownership.
4. Merge/dedup the same game appearing from multiple providers — otherwise the shelves fill with
   duplicate tiles of the same title at different prices. This is the same title-matching problem
   as the owned-badge, pointed sideways.

## Watch out for

- **Do not ship an aggregated browse surface that shows USD prices to non-US users.** Deals is
  currently locale-correct; regressing that in the name of aggregation would be a real step
  backwards for a launcher whose users are global.
- Discovery surfaces are also where a "cheapest" claim becomes an implicit recommendation.
  Getting a price stale or wrong here has more weight than in an explicit search.

See `.planning/notes/aggregated-store-search-foundations.md` for the full context.
