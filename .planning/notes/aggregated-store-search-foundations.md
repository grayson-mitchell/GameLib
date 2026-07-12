---
title: Aggregated store search & store — existing foundations and the CheapShark→ITAD debt
date: 2026-07-12
context: /gsd-explore session — aggregated cross-store price search + an aggregated store/discovery surface, prototyped on CheapShark, targeting IsThereAnyDeal for production
related_phase: 20 (Aggregated Store Search — CheapShark)
---

# Aggregated Store Search — Foundations

## The idea

Two related things, deliberately separated:

1. **Aggregated search** — type a title, see what it costs across every store, buy at the
   cheapest. Kills the "open six tabs" problem. **Shipping first**, as a new left-sidebar entry.
2. **Aggregated store / discovery** — a browsable multi-store deals surface. Deferred — see
   `.planning/seeds/aggregated-discovery-multi-provider-deals.md`.

## Why this belongs in GameLib and not in a browser bookmark

**GameLib knows what you already own. No price-comparison site can.**

CheapShark and IsThereAnyDeal will happily sell you a second copy of a game sitting in your
GOG library. GameLib can badge a search result **"you already own this on GOG"** — because
Phase 12 built cross-store ownership dedup. That badge is the entire justification for
building this in-app rather than linking out. It should be treated as the headline feature,
not a nice-to-have decoration on a price list.

## What already exists (do NOT rebuild)

### 1. `Discounts` is a single-provider version of the target

`src/backend/discounts/index.ts` (169 LOC) + `src/frontend/screens/Discounts/` (~700 LOC)
already implement a store-browse surface against GOG's catalog API
(`CATALOG_URL = 'https://catalog.gog.com/v1/catalog'`, `index.ts:17`). It already has:

- **`hideOwned`** — the owned-filter, already wired
- **`wishlistOnly`**
- **`CatalogLocaleSettings` = `{ countryCode, locale, currencyCode }`** (`common/types/discounts.ts`),
  with a `FALLBACK_LOCALE` of `US`/`en-US`/`USD` when locale can't be resolved

This is the skeleton the aggregated store eventually becomes — generalize the hardcoded GOG
provider into N providers. **It is already localised.** That matters below.

### 2. `humble/dedup.ts` is the store-agnostic matcher, despite its name

`src/backend/humble/dedup.ts` exports:

- `normalizeTitle()` — lowercases, strips `™®©`
- `titleSimilarity()` — **length-sensitive** normalized-Levenshtein (`1 - distance / maxLen`)
- `isDlcFalsePositiveRisk()` — blocks a short base-game title matching a longer DLC/expansion
  title regardless of score (stops `Hollow Knight` ≈ `Hollow Knight: Silksong`-shaped errors)
- `fuzzyMatch(humbleTitle, steamTitle)` — the two above, gated at `HUMBLE_FUZZY_MATCH_THRESHOLD` (85%)
- `recomputeOwnership()`

The `humble`/`steam` parameter naming is a **historical artifact of where it was first needed**.
The logic is store-agnostic. Phase 20 should lift/generalize this rather than write a second
matcher — a second, subtly-different title matcher in the codebase is a bug farm.

### 3. Sidebar entry pattern

`src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx:199` already registers
`/discounts` with label `t('discounts.sidebar', 'Deals')` and `dataTour="sidebar-discounts"`.
Store search is a **sibling entry** next to it (explicit user preference: left menu, not a
tab nested inside Deals).

## Matching: the good news

CheapShark's game results carry a **`steamAppID`** field. For Steam-owned titles the join is
**exact — no fuzzy matching at all.** Fuzzy title matching (via `dedup.ts`) is only needed for
the Epic / GOG / Amazon / Humble side of the library.

This is the same asymmetry as Phase 19's CrossOver dump (exact on `<steamid>`, fuzzy on
everything else) — and the same risk applies: **a false-positive "you already own this" is
worse than a miss**, because it talks the user out of a purchase they actually wanted. Bias
the threshold conservative, and consider showing owned-badges only where confidence is high.
See `.planning/research/questions.md` Q1 for the parallel discussion.

## The CheapShark → ITAD debt (decided with eyes open)

**Decision: prototype on CheapShark as-is. Accept the reshape cost later.**

CheapShark is the easy path — no API key, no approval, public JSON. But it is **USD-only**.
The `Discounts` screen *already* models `currencyCode` properly, so wiring CheapShark in as
the first provider means the new provider interface gets designed against a source that
cannot express the one field the rest of the app already handles correctly.

This was raised explicitly during exploration and **consciously accepted** to get something on
screen fast. Recording it so future-you knows it was a choice, not an oversight:

- The provider interface **will** need reshaping when IsThereAnyDeal lands.
- Prototype prices are USD-only. **The UI must say so** — a non-US user seeing unlabelled `$`
  figures will read them as their own currency and the "cheapest" verdict will be wrong for them.
- Do not let USD-only leak outward as an assumption in shared types, IPC payloads, or the
  owned-badge logic. Contain it inside the CheapShark adapter.

The migration cost is scoped in `.planning/research/questions.md` (IsThereAnyDeal migration).

## Flow, settled

Search → results with prices + owned-badges → `shell.openExternal()` to the store → user buys
in their browser → **next library sync picks it up**. GameLib takes no money and needs no
purchase callback. The handoff at checkout is expected and fine; the loop closes via sync.
