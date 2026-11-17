# Phase 47: IsThereAnyDeal API coverage

**Service:** IsThereAnyDeal API (`api.isthereanydeal.com`), replacing CheapShark for Store Search.
**Drafted:** 2026-11-18, for the `api-coverage.verify-pre` gate. Status: DRAFT, awaiting operator sign-off.

**Sources:** `47-RESEARCH.md` (Locked Decisions, D1–D7), `47-ITAD-COVERAGE.json` (the 47-01 sweep),
and the calls the shipped adapter makes (`src/backend/storeSearch/itad.ts`). The ITAD docs site returned
403 to the researcher, so the surface below is enumerated from the prior research (`260916-gdg`) and the
OpenAPI families named there, not from a fresh read of the docs.

## Coverage matrix

| capability | decision | reason |
|---|---|---|
| Game search by title (`GET /games/search/v1`) | INTEGRATE | Store Search step 1: query -> ITAD game ids (`itad.ts`, D1) |
| Current prices per country (`POST /games/prices/v3`) | INTEGRATE | Store Search step 2 and the expanded-row deals, batched per search, with `country` (D1, D3) |
| Steam AppID -> ITAD id lookup (`POST /lookup/id/shop/61/v1`) | INTEGRATE | Owned badge mapping, keyless and MEASURED (D4, locked) |
| Shop directory (`GET /service/shops/v1`) | INTEGRATE | Used offline by the 47-01 sweep to fix shop ids (Steam 61, GOG 35, Epic 16); at runtime each deal already carries `shop.{id,name}`, so it is not called per search (D5) |
| Reverse lookup ITAD id -> shop id (`POST /lookup/shop/61/id/v1`) | OPT-OUT | One extra call per search and never MEASURED keyless; the forward lookup covers the owned badge (D4 names it only as a fallback) |
| Lookup by title (`/lookup/id/title/v1`, `/games/lookup/v1`) | OPT-OUT | Search v1 already resolves titles to ids; a second title-matching path would duplicate it |
| Game info and overview (`/games/info`, `/games/overview/v2`) | OPT-OUT | Rows need only title, art and prices, which search + prices v3 return; overview v2 is the endpoint reported to fall back to US prices (Pitfall 5) |
| Price history and historical lows (`/games/history`, `historylow`, `storelow`) | OPT-OUT | No historical-price UI in the locked scope (PRICE-01..03 are current prices only) |
| Bundles and subscriptions (`/games/bundles`, `/games/subs`) | OPT-OUT | Not in the locked scope; no Store Search surface shows them |
| Deals feed (`/deals/v2`) | OPT-OUT | The Deals tab has its own providers; this phase only replaces Store Search's provider |
| Stats and popularity (`/stats/*`) | OPT-OUT | No ranking or popularity feature planned |
| User-scoped data (waitlist, collection, notes, profile) | OPT-OUT | Needs OAuth, which is locked out: rate limits follow the app, not the user (vendor statement 2026-10-01) |
| Partner and affiliate redirects | OPT-OUT | The affiliate question is deferred as UNASKED and OPEN; links use the plain ITAD deal URL (Pitfall 4: never rewrite provider URLs) |
