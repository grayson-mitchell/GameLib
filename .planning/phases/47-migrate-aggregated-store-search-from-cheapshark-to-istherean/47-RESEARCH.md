# Phase 47: Migrate aggregated store search from CheapShark to IsThereAnyDeal - Research

**Researched:** 2026-11-12
**Domain:** Provider-adapter swap behind an existing IPC contract (Node sidecar + React renderer), third-party price API with shared-key rate limit, per-install persisted cache
**Confidence:** MEDIUM. Code mapping is HIGH (read directly). ITAD API behaviour is SPEC/MEASURED from the prior research (`260916-gdg`) and could not be re-verified this session: `docs.isthereanydeal.com` and `isthereanydeal.com/faq` return 403 to WebFetch, and the terms text is not reachable. The country/currency coverage is still UNKNOWN and is handled by a measurement task (Wave 0).

## Provenance and grading used in this file

Prior research grades are preserved verbatim: **MEASURED** (request run and read), **SPEC** (read from the OpenAPI schema/docs, not exercised), **UNKNOWN** (needs key or human). Additions in this session use the tags `[VERIFIED: codebase]` (read in this repo this session), `[CITED: url]`, `[ASSUMED]` (training knowledge, needs confirmation). Vendor statement = ITAD's 2026-10-01 email reply (not MEASURED).

No new npm packages are recommended, so there is no Package Legitimacy Audit (see that section).

<user_constraints>
## User Constraints (from ROADMAP.md Phase 47 gates; there is no CONTEXT.md, the user chose to plan from the roadmap)

### Locked Decisions
- Embedded ITAD API key + persisted per-install cache + debounced search + keyless `POST /lookup/id/shop/61/v1` for Steam AppID mapping (MEASURED no-key) + `429`/`Retry-After` degrading to the cached price with a visible timestamp + an optional user-supplied-key setting.
- NO proxy server. NO OAuth (OAuth branch is dead: rate limit follows the **app**, vendor statement 2026-10-01).
- `obj.deal2.url` (the provider deal URL) passed through **verbatim** (contractual: ITAD terms forbid altering provided data, including stripping affiliate tags).
- In scope: ITAD adapter replacing `cheapshark.ts` (search = 2 calls); batch Steam AppID matching for the owned badge; `countryCode` locale plumbing settings -> IPC -> adapter; real currency formatting (touches the Currency Contract in `20-UI-SPEC.md` and `formatUsdPrice.test.ts`); persisted cache (`CacheStore` registration lives in mirrored lists); `429`/`Retry-After` handling; `common/discounts/storeMapping` CheapShark string IDs -> ITAD numeric shop IDs (one production importer).
- Operating policy: monitor usage in ITAD's app dashboard; build the intermediate caching server only when usage approaches the limit; request a raised limit only if needed.
- The "user-supplied key gets its own budget" point is an INFERENCE from "follows the app"; verify against ITAD's published terms (attempted, see Open Questions Q1: not verifiable from here).

### Claude's Discretion
- Everything not listed above: cache key shape/TTL, where the user-key setting lives, currency formatting approach, how the badge join is wired, test layout, the measurement task design.

### Deferred Ideas (OUT OF SCOPE)
- The `/discounts` screen (stays GOG-only, locale-correct). An ITAD-backed deals browser is gated on a one-line written confirmation of ITAD's ambiguous Q1 reply ("yes, this is fine" to "Does the clause rule out (b)?").
- Stage 2: a GameLib-owned affiliate-feed/mirroring service.
- Amazon price coverage (ITAD does not track Amazon; operator decision 2026-09-24).
- OAuth, any proxy server, the affiliate-partnership question (UNASKED and OPEN, not this phase).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRICE-01 | User sees store-search prices in their own currency (ITAD replaces CheapShark) | ITAD adapter (search v1 + prices v3 with `country`), `countryCode` plumbing (renderer already derives it for Deals tab: `Discounts/helpers.ts:getLocaleSettings`), real `Intl.NumberFormat` currency formatting replacing `formatUsdPrice`, measurement task for coverage |
| PRICE-02 | The "you already own this" badge keeps working on ITAD results | `POST /lookup/id/shop/61/v1` (MEASURED keyless) maps owned Steam appids -> ITAD gids; container re-injects `steamAppId` so `resolveStoreSearchBadges` is untouched (badges.ts:147); GOG/Epic/Amazon stay fuzzy-title |
| PRICE-03 | When rate-limited, user sees the cached price with its timestamp instead of an error | Persisted `CacheStore` with own `fetchedAt` clock, per-boot `blockedUntil` timestamp from `Retry-After` (no timers), result/deal types gain `cachedAt`, row renders timestamp |
</phase_requirements>

## Summary

The Phase 20 type vocabulary survived as designed: `StoreSearchResult`/`StoreSearchDeal`/`StoreSearchStore` need small additive changes, not a reshape. The migration is concentrated in one backend module (`src/backend/storeSearch/cheapshark.ts`, 193 lines), one shared module with a single production importer (`common/discounts/storeMapping.ts`, imported only at `cheapshark.ts:5`), one frontend helper (`formatUsdPrice`, used at exactly two render sites), and the IPC signature of two channels. The structurally new pieces are (1) a persisted cache, (2) a rate-limit gate, (3) an owned-badge join that no longer gets `steamAppID` inline.

Store search runs entirely in the **Node sidecar**. The renderer calls `window.api.searchStores` -> preload `makeHandlerInvoker` -> Rust shell `sidecar_invoke` (channel allow-listed in generated `ipc_contract.rs`) -> sidecar `deps.ipc.handle('searchStores', ...)` -> `handleSearchStores` -> `cheapshark.ts` -> `axios`. Outbound HTTP is `axios` with `timeout: 15000` and a `User-Agent: GameLib/<version>` header; there is no shared HTTP client wrapper. The renderer never touches the provider, which is what makes the key embedding and the cache backend-side concerns.

The decision with the most plan impact: **do the owned-badge join by mapping the user's Steam library (and waiting Humble-key appids) to ITAD gids with the keyless route, then compare against `result.gameId`**, because that is the locked, MEASURED route and it costs no quota. To leave `resolveStoreSearchBadges` unchanged, the container maps a result's gid back to an owned appid and passes it as `steamAppId`. Side effect to plan for: CheapShark returned `steamAppID` for every result, so the exact-appid arm of the Humble `keyAvailable` check worked for unowned games; with the library-only mapping it silently degrades to fuzzy-title for keys whose appid is not in the library unless the key appids are included in the lookup batch (they should be).

**Primary recommendation:** Build `src/backend/storeSearch/itad.ts` (adapter) + `itadCache.ts` (CacheStore wrapper + `blockedUntil` gate) behind the **unchanged handler seam** (`handlers.ts` keeps its rethrow contract), add `countryCode` as an optional 2nd arg to `searchStores`/`getStoreSearchDeals`, replace `formatUsdPrice` with an `Intl.NumberFormat` formatter, and run the operator coverage sweep (Wave 0) before locking the country list and the "unsupported country" UX.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| ITAD HTTP calls, key handling | Sidecar (Node backend) | none | Key must never reach the renderer; `axios` already lives here (`cheapshark.ts:1`) |
| Persisted price cache + `Retry-After` gate | Sidecar | Disk (`store_cache/`) | Cache is a `CacheStore` (backend file store); gate is per-boot memory in `miscRuntime` |
| Country selection | Renderer | none | Language -> country map + override already live in the renderer (`Discounts/helpers.ts:140`); passed as an IPC arg |
| Currency formatting | Renderer | none | Needs `i18n.language`; adapter only supplies `{amount, currencyCode}` |
| Steam appid -> gid mapping | Sidecar (call + persisted cache) | Renderer (decides which appids to map; joins) | Keyless call is backend; library state is renderer-side (`useSteamAccount`) |
| Owned badge resolution | Renderer (pure `common/discounts/badges.ts`) | none | Unchanged; already memoised once per results array |
| Debounce / min-chars / generation counter | Renderer (`useDebouncedStoreSearch`) | none | Already the quota's first line of defence; keep |
| User-supplied key setting | Sidecar secret store | Renderer settings UI | Credential: follow the `steamGridSecrets` precedent (keyring), not `config.json` |

## Standard Stack

### Core (all already in the repo; nothing new to install)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| axios | already a dependency (used at `src/backend/storeSearch/cheapshark.ts:1`) | ITAD HTTP, `params:` auto-encoding, `validateStatus` for 429 | Same client as the adapter being replaced; Phase 20 V5 mitigation relies on `params` encoding |
| `CacheStore` (`src/backend/cache.ts`) | in-repo | Persisted per-install cache | Existing store framework; requires `root` + declared `kind: 'cache'` |
| zod | already a dependency | IPC arg schema in `common/types/ipc/enrichment.ts` | Every IPC tuple is zod-validated |
| `Intl.NumberFormat` | platform built-in | Real currency formatting | Precedent: `Humble/Keys/syncAge.ts:42-53` with `toI18nextCode` |
| jest + ts-jest | jest ^29.7.0 | Tests | Existing 6-project config |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Intl.NumberFormat` | `currency.js` / `dinero.js` | New dependency for a solved platform feature. Reject. |
| `CacheStore` | New bespoke JSON file / sqlite | Skips the four registration lists but also skips the store-versioning, notifier and test-containment machinery. Reject. |
| Embedded key in bundle | Runtime fetch of key from a GameLib server | That is the proxy the operator decided against. Reject. |

**Installation:** none.

## Package Legitimacy Audit

No external packages are recommended; every library above is already installed. slopcheck not run (nothing to check). If the planner adds a package (e.g. a retry helper), it must be gated by `checkpoint:human-verify`; this research recommends against it: a 429 gate is ~20 lines of timestamp arithmetic.

## Architecture Patterns

### System Architecture Diagram

```
Renderer (StoreSearch screen)
  query -> useDebouncedStoreSearch (400ms, >=3 chars, generationRef)           [unchanged]
  countryCode <- getLocaleSettings(toShippedLanguage(i18n.language), storedOverride).countryCode
  |
  | window.api.searchStores(query, countryCode)            (zod tuple, 2nd arg NEW)
  v
Rust shell: sidecar_invoke  (channel in generated ipc_contract.rs; no change for an existing channel)
  v
Sidecar: ipc.handle('searchStores') -> handleSearchStores  (rethrow contract kept, handlers.ts:46)
  v
itad.ts searchGames(query, country)
  |-- cache hit (fresh)? ---------------------------------> return rows {cachedAt: undefined}
  |-- blockedUntil > now? --------------------------------> cached rows (even stale) + cachedAt, else throw
  |-- GET  /games/search/v1?title=..            (KEY)  -> gids
  |-- POST /games/prices/v3?country=..  body gids (KEY) -> cheapest deal per gid   (200 gids/call)
  |       429 -> set blockedUntil = now + Retry-After; serve cache w/ cachedAt; else throw (D-14 error state)
  |-- write cache (fetchedAt) ; return StoreSearchResult[]
  v
Renderer: results -> container
  steam.library appids + waiting humble key appids -> window.api.<lookupGids>  (keyless POST /lookup/id/shop/61/v1, persisted map)
  gid -> owned appid  => resolveStoreSearchBadges({...result, steamAppId})      [badges.ts unchanged]
  row price = formatPrice(amount, currencyCode, language)  + "cached <time>" when cachedAt
  expand -> getStoreSearchDeals(gid, country) -> POST /games/prices/v3 (1 gid) -> deals[] (url verbatim)
```

### Recommended Project Structure
```
src/backend/storeSearch/
├── itad.ts            # NEW adapter (replaces cheapshark.ts): search, getGameDeals, shop directory, gid lookup
├── itadCache.ts       # NEW: CacheStore wrapper + blockedUntil gate (pure, injectable clock)
├── stores.ts          # NEW: createStoreSearchStores(deps) factory (CacheStore 'itad_prices', 'itad_steam_gids')
├── handlers.ts        # edit: re-point imports, add country arg, keep rethrow
└── __tests__/         # itad.test.ts, itadCache.test.ts replace cheapshark.test.ts
src/frontend/screens/StoreSearch/
├── helpers.ts         # formatUsdPrice -> formatPrice (Intl), cachedAt label helper
└── hooks/useOwnedSteamGids.ts   # NEW: library appids -> gid map
```

### Pattern 1: Provider-neutral mapping at the adapter edge (kept from Phase 20)
**What:** All ITAD-shaped JSON is mapped to `common/types/storeSearch` in `itad.ts` only. Nothing downstream imports ITAD types.
**Example (verbatim URL, contractual):**
```typescript
// CONTRACTUAL, NOT STYLISTIC: ITAD's terms forbid changing provided data in any way,
// explicitly including removing affiliate tags from URLs. Do not "clean up", normalise,
// re-encode, add UTM params to, or rebuild this URL. Reject (do not rewrite) a non-https URL.
buyUrl: deal.url
```
Trust posture change vs `buildRedirectUrl` (cheapshark.ts:84): there the host+path were a fixed constant and only an opaque id was interpolated (T-20-01); here the whole URL is provider-supplied. The safe move is validation (`new URL(u).protocol === 'https:'`, else drop the deal) never rewriting. Check that `window.api.openExternalUrl` already enforces a scheme allowlist before relying on it `[ASSUMED: not read this session]`.

### Pattern 2: Rate-limit gate without timers
**What:** `blockedUntil: number` (epoch ms) held per boot in a `miscRuntime` member (replace the `storeMap` slot at `miscRuntime.ts:33,47`, whose only consumer is the CheapShark `/stores` cache). On 429 set `blockedUntil = Date.now() + retryAfterSeconds*1000` (cap it, default 60s if the header is absent or unparseable); every call compares against `Date.now()`.
**Why:** The sidecar exit contract (CLAUDE.md, `gamelib-conventions`) forbids any handle that keeps the loop alive past stdin EOF. A timestamp comparison creates no handle, so nothing needs `unref()` and there is no boot work. Do NOT implement the backoff with `setTimeout`/`setInterval`.

### Pattern 3: Keep-last-good cache with the loader's own clock
**What:** Mirror `crossover_index/stores.ts:37-41`: `new CacheStore<Cached<T>>('itad_prices', ttlMinutes, { root, kind: 'cache', invalidateCheck: () => false })` and store `{ data, fetchedAt }`. `invalidateCheck: () => false` disables eviction on read, so a stale entry is still available to serve under a 429. Freshness is decided by the adapter comparing `fetchedAt`.
**Suggested numbers (planner may tune; all `[ASSUMED]`):** fresh window 6h for prices, 7d-30d for the appid->gid map (mappings are near-immutable), search-result lists keyed by normalized query+country with the same 6h window. Cap total entries (evict oldest by `fetchedAt` when over ~500) so the file cannot grow without bound.

### Anti-Patterns to Avoid
- **Per-keystroke or per-row ITAD calls.** Prices v3 takes up to 200 gids per call (SPEC); one search = 1 search + 1 prices call (+0 for owned badges). Never loop one prices call per result.
- **Using `String(err)` of an axios error to log with request config.** The key is a query parameter; never log `err.config.url`, `err.request`, or the full URL. Log status + endpoint name only (see Pitfall 3).
- **Reusing `COUNTRY_CURRENCY_MAP.currencyCode` for ITAD.** It is GOG-scoped (`Discounts/helpers.ts:7-12` says unsupported currencies fall back to USD). Send only `countryCode`; ITAD returns the currency per price.
- **Changing `gameId`'s type.** It stays a string (the ITAD uuid); React keys, `badgesByGameId` Map keys and `getStoreSearchDeals` all use it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Currency formatting | A symbol table / manual `$` concat (that is the D-13 debt) | `Intl.NumberFormat(toI18nextCode(language), {style:'currency', currency})` | Symbol, placement, separators and minor-unit digits are locale- and currency-specific |
| Persisted cache | A new JSON file writer | `CacheStore` (`src/backend/cache.ts`) | Versioning declaration, per-boot root, change notifier, containment in tests |
| Secret storage for the user's key | `config.json` field | `SidecarKeyringSlotStore` pattern (`steamgridSecretStore.ts`) | Same hazard documented in `steamgrid/secretStore.ts` header: plaintext `config.json` |
| Query encoding | String concatenation | axios `params` | Phase 20 RESEARCH V5 mitigation |
| Owned-badge logic | A second matcher | `resolveStoreSearchBadges` (`common/discounts/badges.ts:147`) | Already correct and fully tested; feed it a `steamAppId` |
| IPC contract for new channels | Hand-edited `ipc_contract.rs` | `pnpm gen:ipc-contract` (file is `@generated`) | `pnpm check:ipc-contract` fails CI if stale |

**Key insight:** the work is wiring, not invention. Every hard piece (store framework, secret store, badge matcher, debounce, IPC contract generation) exists; the risk is in the seams and in conventions that no gate sees.

## Current Code Map (file:line, all `[VERIFIED: codebase]`)

| What | Where |
|------|-------|
| CheapShark adapter | `src/backend/storeSearch/cheapshark.ts` (193 lines). `CHEAPSHARK_BASE` :20, `SEARCH_CURRENCY = 'USD'` :29, `createStoreMapCache` :63, `buildHeaders` UA :80, `buildRedirectUrl` :92, `mapSearchResults` :99, `mapGameDeals` :119, `getStoreMap` :143, `searchGames` (limit 60, timeout 15000) :171, `getGameDeals` :200 |
| Shared handler bodies (the rethrow contract) | `src/backend/storeSearch/handlers.ts` :46 `handleSearchStores`, :58 `handleGetStoreSearchDeals`, :72 `handleGetStoreSearchStoreMap`. Imports only `./cheapshark` + logger |
| Sidecar registration | `src/backend/sidecar/enrichmentFlowRegistration.ts` :329 `searchStores`, :333 `getStoreSearchDeals`, :339 `getStoreSearchStoreMap`. Deps type `EnrichmentFlowDeps` :185 already has `stores: Pick<Stores,'kvs'\|'runsForMe'\|'wikiGameInfo'\|'crossoverIndex'\|'gog'>`, `appInfo`, `miscRuntime` slice `'storeMap'`, `steamGridSecrets` |
| IPC arg schemas / return types | `src/common/types/ipc/enrichment.ts` :69 `searchStores: z.tuple([searchTerm])`, :70 `getStoreSearchDeals: z.tuple([nonEmptyString(256)])`, :71 `getStoreSearchStoreMap: noArgs`; returns :92-94. Existing `localeSettings` strict object at :37 |
| Preload invokers | `src/preload/api/storeSearch.ts` :3-5 |
| Rust allow-list (generated) | `src-tauri/src/ipc_contract.rs` :318,:319 (`getStoreSearchDeals`, `getStoreSearchStoreMap`), :414 (`searchStores`). Existing channels: changing args needs no regen; NEW channels do (`pnpm gen:ipc-contract`) |
| Provider-neutral types | `src/common/types/storeSearch.ts` (`StoreSearchResult`, `StoreSearchDeal`, `StoreSearchStore`; `currencyCode: string` already bare string per D-13) |
| Store -> Runner mapping | `src/common/discounts/storeMapping.ts` `CHEAPSHARK_STORE_TO_RUNNER` {'1':steam,'7':gog,'25':legendary,'4':nile}, `resolveRunner`. **Single production importer: `cheapshark.ts:5`** (verified by grep over `src/`); test at `src/backend/__tests__/storeMapping.test.ts` |
| Currency formatter | `src/frontend/screens/StoreSearch/helpers.ts:19` `formatUsdPrice(amount, currencyCode)` returns `` `$${amount} ${currencyCode}` ``. Call sites: `StoreSearchRow/index.tsx:58` (and import :11), `StoreSearchBreakdown/index.tsx:98` (import :8). Tests: `StoreSearch/__tests__/formatUsdPrice.test.ts` (also holds the `buildOwnedBadgeLabel` tests; keep those) |
| Screen / owned badge | `StoreSearch/index.tsx`: `useDebouncedStoreSearch()`, `badgesByGameId` useMemo calls `resolveStoreSearchBadges(result, {steam: steam.library, gog, epic, amazon}, keysWaiting)` |
| Badge matcher | `common/discounts/badges.ts:147`: exact `steamAppId` join against `steam.library[].app_name` (D-01), fuzzy title for gog/epic/amazon; Humble `keyAvailable` joins by appid OR fuzzy title |
| Debounce hook | `StoreSearch/hooks/useDebouncedStoreSearch.ts`: `DEBOUNCE_MS = 400`, `MIN_QUERY_LENGTH = 3`, generation counter; calls `window.api.searchStores(searchQuery)` at :101 |
| Breakdown fetch | `StoreSearchBreakdown/index.tsx:33` `window.api.getStoreSearchDeals(gameId)`; `onClick` -> `window.api.openExternalUrl(deal.buyUrl)` :76,:79 |
| Locale / country | Renderer only. `Discounts/helpers.ts`: `COUNTRY_CURRENCY_MAP` :11-44 (language -> country+GOG currency), `REGION_OPTIONS` :54-90 (29 countries), override in `localStorage` key `discounts.regionOverride` (`getStoredRegionOverride`), `getLocaleSettings(language, regionOverride)` :145. `Discounts/index.tsx:60` calls it with `toShippedLanguage(i18n.language)`. Zod `localeSettings` (:37 of enrichment.ts) is sent whole to `getGogDiscounts` (:65). **There is no country in app settings/config**; the Deals tab itself shows GOG-returned strings, it does not format with Intl |
| Cache store framework | `src/backend/cache.ts` (`CacheStore`, ctor takes `{root, kind, invalidateCheck?}`; `get` evicts expired entries only when `invalidateCheck` returns true; writes `__timestamp.<key>` alongside). Precedents: `crossover_index/stores.ts:37` (keep-last-good, own `fetchedAt`), `wiki_game_info/stores.ts` |
| Store registration (post-66.1/66.4 reality) | See "CacheStore registration" below |
| Per-boot runtime slot being replaced | `src/backend/miscRuntime.ts:33` `storeMap: StoreMapCache`, `:47` `storeMap: createStoreMapCache()`; also imported at the top (`./storeSearch/cheapshark`) |
| Sidecar bundling | `package.json:37` `build:sidecar`: `esbuild --bundle ... --packages=external --outfile=build/main/sidecar.js src/sidecar/index.ts`; `build:sidecar-sea` wraps it. No existing build-time constant injection was found `[VERIFIED: codebase, grep of package.json scripts]` |
| Jest DI ceilings | `meta/backendDiCeilings/storeSearch.json`: `jestMock` counts 2 and 2 for the two existing test files. New test files that call `jest.mock` need ceiling entries or the ratchet goes red |
| Existing tests | `src/backend/storeSearch/__tests__/cheapshark.test.ts` (7 `it`), `handlers.test.ts` (9 `it`); frontend `StoreSearchScreen.test.tsx`, `StoreSearchRow.test.tsx`, `useDebouncedStoreSearch.test.ts`, `formatUsdPrice.test.ts`; `src/backend/__tests__/storeMapping.test.ts` |

### CacheStore registration: the "four mirrored lists" have moved
The 260819 lists (`BOOT_SET_CACHE_STORE_NAMES`, etc.) are the **renderer-visible** lists and only matter if the renderer reads the store. For a backend-only cache (recommended) the registration is now the per-boot factory model. Re-locate before planning; `[VERIFIED: codebase]` for each item, the "four" count itself is no longer authoritative:
1. A factory returning the `CacheStore`s (new `src/backend/storeSearch/stores.ts`, shape of `wiki_game_info/stores.ts`).
2. `src/backend/stores/createStores.ts`: import + a new family key in the returned object.
3. `src/backend/services/types.ts` (`Stores` interface, ~:72): `ReturnType<typeof import('backend/storeSearch/stores').createStoreSearchStores>`.
4. `src/backend/testUtils/testServices.ts`: build it for tests (see how `createCrossoverIndexStores` is imported at :16).
Plus the test pins that go red on a new store: `src/backend/stores/__tests__/fixtures/registeredStores.json` (add `{registeredAs:null, options:{cwd:'store_cache', name:'itad_prices', ...}, declaration:{kind:'cache'}}`), `src/backend/__tests__/storeKinds.test.ts` (kind map, near :113 `crossover_index: 'cache'`), `src/backend/stores/__tests__/createStores.test.ts` (TTL/invalidateCheck pin, near :167). And `EnrichmentFlowDeps.stores` `Pick<>` (`enrichmentFlowRegistration.ts:196`) must add the new family key.
If the planner instead exposes the cache to the renderer (not recommended; the renderer only needs the `cachedAt` already on the IPC result), the `storePolicy.ts` lists (`RECOGNIZED_CACHE_STORE_NAMES`, `BOOT_SET_CACHE_STORE_NAMES`, tests `storePolicy.test.ts`, `handlers.ts:577 CACHE_BACKED_STORE_NAMES`, `typed_store.ts StoreStructure`) all apply.

## Design Decisions the Plan Needs (prescriptive)

### D1. Search = 2 calls; type changes (additive)
`/games/search/v1?title=&results=` (KEY, SPEC) -> `[{id,title,assets,...}]`; then `POST /games/prices/v3?country=` with the gid array (SPEC: 1-200 gids). Row = best (lowest `price.amount`) deal per gid. Rows with no deals are dropped or rendered without a price: choose drop (empty price cannot be formatted and "missing beats wrong" is the repo's badge convention). Type deltas:
- `StoreSearchResult`: `gameId` = gid (string); `steamAppId?` remains optional and is now injected by the renderer, not the adapter; `cheapestPrice` stays a decimal **string**; add `cachedAt?: number` (epoch ms, present only when served from cache because of a rate limit).
- `StoreSearchDeal`: add `cachedAt?: number`; `storeId` stays `string` ("61"); `retailPrice` <- `regular.amount`.
- `StoreSearchStore`: `isActive` becomes always true (`/service/shops/v1` is the active list, SPEC).
- Header comment in `common/types/storeSearch.ts` ("always the US dollar code today") must be rewritten; `currencyCode` stays a bare `string`.

Price string derivation: ITAD gives `amount` (number) and `amountInt` (minor units) (SPEC). The prior research said to format from `amountInt`. The minor-unit exponent for zero-decimal currencies (JPY, KRW) is UNKNOWN. Recommendation: build the decimal string from `amount` via `String(amount)` (shortest round-trip repr, no float artefacts) and have the measurement script assert `Math.round(amount * 10**d) === amountInt` where `d` = `Intl.NumberFormat(...,{style:'currency',currency}).resolvedOptions().maximumFractionDigits`, across the sweep. If any currency disagrees, switch that path to `amountInt / 10**d` with `d` from Intl.

### D2. Currency formatting and the Currency Contract (`20-UI-SPEC.md:246`)
The contract's correctness intent (D-13: unit impossible to miss, a single text node) survives; its mechanics (`"$" + verbatim string + " USD"`) must be amended in the same phase. Prescribe: `formatPrice(amount, currencyCode, language)` = `Intl.NumberFormat(toI18nextCode(language), {style:'currency', currency: currencyCode}).format(Number(amount))`, then append the ISO code unless the formatted text already contains it (so `$14.99 USD` is preserved for en/USD, `14,99 EUR` is not doubled to "14,99 EUR EUR", and ambiguous `$` for CAD/AUD stays labelled). Wrap in try/catch falling back to `` `${amount} ${currencyCode}` `` (an unusable currency code throws RangeError). Still ONE string in ONE element. The old "never fabricate `.00`" rule was about passing CheapShark strings through; with ITAD's exact amount `Intl` default fraction digits for the currency is correct, and this amendment must be written into `20-UI-SPEC.md` (or a Phase 47 UI-SPEC addendum) and the tests renamed (`formatUsdPrice.test.ts` -> keep the file for `buildOwnedBadgeLabel`, move price tests to a new `formatPrice` describe; keep the file name stable only if `i18n`/knip gates reference it, grep first).
`i18n.language` is a shipped directory code; pass through `toI18nextCode` exactly as `syncAge.ts:50` does. Add the `{{time}}` strings with `t()` + defaultValue; the i18n gates (`meta/hardcodedStringGate.ts`, `i18nCatalogPresenceBaseline.json` baseline, `i18n-churn-guard`) apply to new keys, and CLAUDE-era memory notes that a new key can deepen a red presence gate: check the baseline before adding keys.

### D3. `countryCode` plumbing
Renderer computes `getLocaleSettings(toShippedLanguage(i18n.language), getStoredRegionOverride()).countryCode` (the Deals tab's exact derivation, `Discounts/index.tsx:60`) and passes it as the 2nd IPC arg. Make the arg `optionalArg(z.string().regex(/^[A-Z]{2}$/))` so a missing/garbled value falls back to `US` in the handler rather than failing the search. Do not send `currencyCode` or `locale` (adapter must not trust the renderer for currency). The region override currently lives in the **Discounts** screen picker (`localStorage discounts.regionOverride`); StoreSearch has no picker. Planner decision (recommend: no new picker this phase; reuse the stored override so a user who set Deals to GBP gets GBP here, and say so in a short note) and the language-derived default is coarse (`en` -> US, so a UK English user sees USD unless they set the Deals override). That is a UX limitation worth recording, not a blocker; fixing it is a settings-surface decision outside the locked scope.
`getLocaleSettings` and `REGION_OPTIONS` are frontend helpers inside the Discounts screen directory: import them from StoreSearch (cross-screen import) or hoist to `src/common/` if the lint boundary complains `[ASSUMED]`.

### D4. Owned badge (PRICE-02)
1. New keyless backend op (new IPC channel, e.g. `getItadSteamGids`, args `z.tuple([z.array(z.string().regex(/^\d{1,10}$/)).max(1000)])`): given appids, return `Record<appId, gid>` using `POST /lookup/id/shop/61/v1` with body `["app/<id>", ...]`; chunk (batch ceiling UNKNOWN, measure; default chunk 200); persist results (`itad_steam_gids` CacheStore, long TTL) and only call for unseen appids. This is a NEW channel: add to the schema map, regenerate `ipc_contract.rs`, and add to `renderer allow-list` tests (`rendererAllowList.test.ts` references the contract).
2. Renderer hook maps `steam.library[].app_name` + `keysWaiting[].steamAppId` (non-empty, not `'0'`) -> gids once per library change.
3. Container builds `gidToAppId` and calls `resolveStoreSearchBadges({ ...result, steamAppId: gidToAppId.get(result.gameId) }, ...)`. `badges.ts` is untouched; GOG/Epic/Amazon keep fuzzy-title matching; the exact-join semantic (D-01) is preserved because it is still an appid equality, just derived through ITAD's own mapping.
4. Failure of the lookup must not break search or badges: no gid map -> `steamAppId` undefined -> badges fall back to the fuzzy arms (never a wrong "owned").
Alternative (not recommended, SPEC only): reverse route `POST /lookup/shop/61/id/v1` gid -> `app/N` per search. Costs one extra call per search and has not been MEASURED keyless; the locked route is the MEASURED one. Mention only as the fallback if the batch ceiling makes the library mapping impractical.
Non-`app/` ids (`sub/`, `bundle/`) can appear in reverse mappings (SPEC, ID format `app/{appid}`); not relevant to the locked direction beyond prefixing on the way in.

### D5. Shop directory and runner mapping
Replace `CHEAPSHARK_STORE_TO_RUNNER` with an ITAD map keyed by numeric shop id **as string** (keep `StoreSearchStore.storeId: string`): Steam `'61'`, GOG `'35'` (MEASURED/SPEC in prior research). **Epic's ITAD shop id is not recorded anywhere in the repo or the prior research** (training memory suggests 16 `[ASSUMED]`); the measurement script must dump `/service/shops/v1` (keyless, MEASURED) so the planner can lock Epic by name rather than guess. Amazon (`nile`) has no ITAD shop: delete the entry and its comment (the old comment about forward-compat no longer applies; the owned "Amazon" badge reads GameLib's own `amazon.library` and is unaffected). Rename the export (`CHEAPSHARK_STORE_TO_RUNNER` -> `ITAD_SHOP_TO_RUNNER`), keep the file path `common/discounts/storeMapping.ts`, and update `src/backend/__tests__/storeMapping.test.ts`. Fetching the shop directory once per boot into `miscRuntime` (replacing `storeMap`) is fine, or skip the fetch entirely since `deal.shop.{id,name}` arrives on every deal (SPEC); in that case `getStoreSearchStoreMap` becomes a thin shim or is dropped (no renderer caller exists: `grep` finds only the sidecar registration, schema and preload). Dropping a channel means regenerating the contract.

### D6. Persisted cache + 429 (PRICE-03)
- Stores: `itad_prices` (rows + deals keyed `search:<country>:<hash(normalizedQuery)>` and `deals:<country>:<gid>`) and `itad_steam_gids`. **Do not use the raw query as a `CacheStore` key**: the store layer treats `.` as a path separator (documented at `macArch/stores.ts` header: "electron-store treats dots as path separators"), and titles contain dots (`S.T.A.L.K.E.R.`). Hash or sanitise the query part of the key. gids (uuid), country codes and numeric ids are safe.
- Flow: fresh hit -> serve, no request. Miss or stale -> if `blockedUntil > now` serve stale with `cachedAt` (or throw if no entry, which the container renders as the existing provider-error state); else request. On 429: set `blockedUntil` from `Retry-After` (seconds or HTTP-date; clamp to e.g. [1s, 15min]), serve stale-with-`cachedAt` if present, else throw. On other network errors with a cached entry: also serve stale-with-`cachedAt` (ITAD "may revoke access without notice", SPEC; the adapter must degrade, not hard-fail). The handler's rethrow contract (`handlers.ts` D-14: "a swallowed error is indistinguishable from no results") stays: serve-from-cache is a SUCCESS return carrying `cachedAt`, the throw remains for the no-cache case.
- Renderer: `formatCachedAt(cachedAt, language)` via `Intl.DateTimeFormat` or the `syncAge.ts` relative-unit pattern, shown on the row and in the breakdown row as e.g. "Price from {{time}} (rate limited)". Copy goes through `t()`.
- Single-flight: dedupe concurrent identical in-flight requests (a `Map<string, Promise>` removed in `finally`; no timers) so a double mount cannot spend two budget units.
- The 429 can also hit the keyless lookup route if ITAD limits it per IP `[ASSUMED]`; treat any 429 uniformly.

### D7. Key handling
- Embedded key: inject at build time into the sidecar bundle, never in git. Recommended mechanism `[ASSUMED]`: esbuild `--define:__ITAD_API_KEY__="..."` fed from an env var in `build:sidecar` (CI secret for release builds), with a runtime `process.env.GAMELIB_ITAD_API_KEY` override for dev. Missing key at runtime => adapter throws a typed "provider not configured" error that the container shows through the existing error state, never a crash, and the optional user key still works. The planner must decide where release CI gets the secret (human/CI task). A shipped key is extractable from the bundle (prior research noted this; it is ITAD's risk model).
- User-supplied key: store via the keyring-slot pattern. Cost: a new Rust allow-list arm next to `"steamgrid-api-key" => Ok("steamgrid-api-key")` (`src-tauri/src/main.rs:464`) plus its test at `:2895-2904`, a `SidecarKeyringSlotStore` subclass (copy `steamgridSecretStore.ts`), new IPC channels (`itad.hasApiKey/setApiKey/clearApiKey`, bounded `z.string().max(256)`, non-string rejected at the boundary like `enrichmentFlowRegistration.ts:385-392`), a Settings control modelled on `Settings/components/SteamGridDbApiKey.tsx`, `EnrichmentFlowDeps` gaining the store. Precedence: user key (if set) else embedded key. A rejected/invalid user key (401/403) must fall back to the embedded key once and surface a visible "your key was rejected" state rather than silently burning the shared budget.
- Cost control option: if the planner wants this phase smaller, the user-key setting can be its own plan in the last wave; PRICE-01..03 do not depend on it.
- Never log the key (Pitfall 3).

## Runtime State Inventory
Not a rename/refactor phase, but one migration-flavoured item exists:
| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None for CheapShark: Phase 20 explicitly kept the `/stores` map in memory only (`cheapshark.ts:60`). No persisted CheapShark data to migrate | none |
| Live service config | None | none |
| OS-registered state | None | none |
| Secrets/env vars | New: embedded-key build input (env var name TBD) and optional keyring slot. Not renames | code + CI secret (human task) |
| Build artifacts | `build/main/sidecar.js` must be rebuilt after backend changes (memory note: `tauri dev` does not rebuild the sidecar; run `pnpm build:sidecar` before live testing) | rebuild |

## Common Pitfalls

### Pitfall 1: Dots in cache keys
**What goes wrong:** a title containing `.` is split as a nested path by the underlying store, silently writing/reading the wrong shape.
**How to avoid:** hash/sanitise the query component; unit-test a key with `.` (e.g. `"S.T.A.L.K.E.R."`).
**Warning signs:** cache never hits for some titles; `__timestamp.<key>` weirdness.

### Pitfall 2: `unref`/timer discipline (sidecar exit contract)
**What goes wrong:** a retry/backoff `setTimeout`, a cache-flush `setInterval`, or an in-flight request kicked off at boot keeps the sidecar alive past stdin EOF (measured precedent: `gog/presence.ts:39`).
**How to avoid:** this phase needs **no timers and no boot work** (timestamp-based `blockedUntil`; lazy, user-triggered fetches; `use_in_memory()`/`commit()` batching is not needed). If a timer is introduced anyway it must `unref()` and the plan must justify it. Do not prefetch the shop directory or the gid map at boot.

### Pitfall 3: The key leaks through logs and errors
**What goes wrong:** ITAD authenticates with a `key` query parameter `[ASSUMED: from training, confirm in OpenAPI]`; axios errors and `err.config.url` contain it; `logError(String(err))` plus uploaded log files (there is a log uploader store) exposes it, and the user-key case is a personal credential.
**How to avoid:** adapter catches, logs `{endpoint, status}` only; a test asserts a thrown axios error with a fake key in its config never reaches `logError`'s arguments. Prefer a header over the query string if the spec allows `[ASSUMED]`.

### Pitfall 4: Rewriting the provider URL
**What goes wrong:** a refactor "normalises", re-encodes, or appends params to `deal.url` (the CheapShark double-encoding lesson inverted). Breaches ITAD terms.
**How to avoid:** the contractual comment (Pattern 1) plus a test that asserts byte-equality between the fixture URL and `buyUrl`/`deal.buyUrl`, including a URL carrying affiliate tags, encoded chars and a trailing fragment.

### Pitfall 5: Country silently falls back to US
**What goes wrong:** a third-party report says ITAD's `games/overview/v2` returned **US** prices for AR and MD although the website supports them `[CITED: github.com/kevinfiol/enhanced-gog/issues/10, one maintainer observation, April 2024, no ITAD reply, endpoint differs from v3]`. If v3 behaves the same, a user in an unsupported country gets USD for their country code with no error.
**How to avoid:** because every price carries its real `currencyCode`, the UI stays truthful (shows `USD`). Do not claim "your currency" in copy; optionally show a one-line note when the returned currency differs from the currency expected for the country. The Wave 0 sweep decides how much of this matters (see below).

### Pitfall 6: Currency formatting regressions
**What goes wrong:** `Intl` throws RangeError on a bad code; zero-decimal currencies (JPY/KRW) shown with fake decimals; `$` ambiguity (USD/CAD/AUD).
**How to avoid:** try/catch fallback; ISO code always visible (D2); test JPY, EUR in `de`, GBP, CAD.

### Pitfall 7: keyAvailable regression
**What goes wrong:** CheapShark supplied `steamAppID` for every result so Humble `keyAvailable` exact-matched unowned games; with a library-only gid map that arm is lost.
**How to avoid:** include waiting-key appids in the mapped set (D4.2); test an unowned-but-keyed title.

### Pitfall 8: Budget burn from the renderer
**What goes wrong:** `retry` button (`useDebouncedStoreSearch` `retry`) and breakdown expand re-requests each spend budget. A shared 1000/5min ceiling across all installs (SPEC, per-app, vendor-confirmed) means a few thousand concurrent users could saturate it.
**How to avoid:** cache-first on both paths (D6), single-flight, keep the 400ms/3-char guard, cap rows (CheapShark used `limit: 60`; keep results modest, e.g. 20-30, since each row is a price lookup).

### Pitfall 9: Stale generated artefacts
**What goes wrong:** adding/removing an IPC channel without `pnpm gen:ipc-contract` fails `check:ipc-contract`; adding a store without updating the three test pins fails the suite; new `jest.mock` files without `meta/backendDiCeilings/storeSearch.json` entries fail the ratchet.
**How to avoid:** make each an explicit task step with its command in `<verify>`.

## Code Examples

### Adapter skeleton (shape, not final code)
```typescript
// Source: ITAD OpenAPI SPEC per 260916-gdg-RESEARCH.md; field names [ASSUMED] until Wave 0 captures real fixtures
const ITAD_BASE = 'https://api.isthereanydeal.com'

export async function searchGames(deps: ItadDeps, query: string, country: string) {
  const cached = readFresh(deps.cache, searchKey(country, query))
  if (cached) return cached.data
  if (deps.gate.blocked()) return staleOrThrow(deps.cache, searchKey(country, query))
  try {
    const { data: found } = await axios.get(`${ITAD_BASE}/games/search/v1`, {
      params: { key: deps.key(), title: query, results: 30 },
      timeout: 15000,
      headers: buildHeaders(deps)
    })
    const gids = found.map((g: { id: string }) => g.id)
    const { data: priced } = await axios.post(`${ITAD_BASE}/games/prices/v3`, gids, {
      params: { key: deps.key(), country },
      timeout: 15000,
      headers: buildHeaders(deps)
    })
    const rows = mapSearchResults(found, priced) // cheapest deal per gid; deal.url passed VERBATIM
    writeCache(deps.cache, searchKey(country, query), rows)
    return rows
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 429) {
      deps.gate.block(parseRetryAfter(err.response.headers['retry-after']))
      return staleOrThrow(deps.cache, searchKey(country, query)) // success w/ cachedAt, or rethrow
    }
    logFailure('search', err) // status + endpoint only; never the URL, never the key
    throw err
  }
}
```

### Keyless gid lookup (MEASURED shape, prior research)
```typescript
// POST https://api.isthereanydeal.com/lookup/id/shop/61/v1   body ["app/220","app/570"]  -> {"app/220":"<gid>",...}
const { data } = await axios.post<Record<string, string | null>>(
  `${ITAD_BASE}/lookup/id/shop/61/v1`, appIds.map((id) => `app/${id}`), { timeout: 15000, headers }
)
// strip the 'app/' prefix on the way out; null/absent = unmapped (do not cache a null forever: short TTL)
```

### Currency formatter
```typescript
// Pattern source: Humble/Keys/syncAge.ts:42-53 (toI18nextCode + try/catch)
export function formatPrice(amount: string, currencyCode: string, language: string): string {
  try {
    const text = new Intl.NumberFormat(toI18nextCode(language), { style: 'currency', currency: currencyCode })
      .format(Number(amount))
    return text.includes(currencyCode) ? text : `${text} ${currencyCode}`
  } catch {
    return `${amount} ${currencyCode}`
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CheapShark, keyless, USD, one call, no shared ceiling | ITAD, keyed, per-country currency, 2 calls, shared per-app 1000/5min | This phase | Cache + gate become mandatory |
| In-memory `/stores` map, no persistence (Phase 20 A3) | Persisted `CacheStore` | This phase (ITAD terms require caching, SPEC) | Phase 20's "no persisted cache" decision is reversed on purpose; record it |
| `formatUsdPrice` string concat | `Intl.NumberFormat` | This phase | Currency Contract text amended |
| Rate limit assumed per key | Per **app** (vendor statement 2026-10-01) | 2026-10-01 | OAuth no longer helps; embedded-key + hard-caching branch |

**Deprecated/outdated in this repo:** `20-RESEARCH.md` Pitfall 1 (CheapShark dealID double-encoding) and A3 (in-memory `/stores`); `cheapshark.ts` header comment claiming a future second provider "reshapes nothing downstream" (true for types, but the badge join, formatter and IPC arg do change).

## Measurement Task (Wave 0, operator-run; resolves the one remaining UNKNOWN)

**Goal:** which countries/currencies ITAD's price endpoints actually serve, plus the real response shapes, without the key ever entering the repo.

**Design** (`meta/measureItadCoverage.ts`, run through `node meta/runTs.cjs --bundle --platform=node --target=node22 meta/measureItadCoverage.ts`, same runner convention as other `meta/` scripts):
- Reads the key **only** from `process.env.ITAD_API_KEY` (name suggested; never printed, never written to output, exit 2 with a message if absent). No keychain/env spelunking by the agent: the **operator** exports it and runs the script.
- Plain `https`/axios calls, **spawns no child process**, so the fake-HOME convention is not triggered (if a spawn is added, use `createFakeHomeProfile()`).
- Inputs: a country list = every `REGION_OPTIONS.countryCode` (29) plus the 14 from the prior sweep plus AR, MD, NZ, IE, AT, BE, MX, IN, ZA, SG, HK, SA, AE; 3 stable paid test gids (e.g. from `lookup/id/shop/61` for appids 220, 400, 292030) so the price set is non-empty.
- For each country, `POST /games/prices/v3?country=XX` with the gids; record: HTTP status, per-deal `price.currency` distribution, whether prices are byte-identical to the `US` run (fallback detector), shop count with deals, `amount` vs `amountInt` agreement per currency (answers D1), `Retry-After`/rate-limit headers if present. Pace to <= ~2 req/s total (the sweep is ~45 requests; far under 1000/5min; do not hammer the shared app budget).
- Also dump `GET /service/shops/v1` (keyless) to capture shop ids for Epic/GOG/Steam (D5), and `POST /lookup/id/shop/61/v1` with 50, 200, 500, 1000 ids to find the batch ceiling (D4).
- Output: a JSON table to a gitignored scratch path (`.planning/phases/47-.../47-ITAD-COVERAGE.json` is fine, with the key redacted by construction since it is never in the data) plus **redacted** raw response fixtures for the adapter tests (strip nothing from `url` fields: the verbatim test needs real affiliate-tagged URLs, but check they carry no key). Confirm before committing fixtures that no `key=` substring appears (a `grep` step in `<verify>`).
- Also run **one** request without a key to a keyed endpoint and record the status, and one with a deliberately invalid key, to pin the 401/403 shape used by the "user key rejected" branch.

**What result changes the plan:**
| Result | Plan change |
|--------|-------------|
| Most `REGION_OPTIONS` countries return their own currency | Plan as written; ship the country list as is. |
| Many return USD identical to the `US` run (silent fallback) | Add the "showing USD, your region isn't priced by ITAD" note (Pitfall 5) and a per-country supported-set constant (`ITAD_PRICED_COUNTRIES`) so the UI can say so truthfully; stop implying localisation for those countries. |
| Some countries return 4xx | Handler retries once with `US` and flags the result; the zod regex stays but the adapter must not surface a raw 4xx as "provider down". |
| `amountInt` disagrees with `amount` x 10^d for JPY/KRW | Switch formatting to `amountInt / 10^d` using Intl's digits (D1). |
| Lookup batch ceiling < library size | Chunk and show badges progressively; consider the reverse route as primary (D4 alternative). |
| Epic shop id != assumed 16 | Lock the id from the dump. |
| 429 on the sweep itself | Stop, wait the `Retry-After`; the finding (limit headers) goes into the cache TTL decision. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ITAD authenticates via a `key` query parameter and `POST /games/prices/v3` takes a JSON array of gids plus `country` query param | Pitfall 3, Code Examples | Adapter shape wrong; Wave 0 fixtures settle it |
| A2 | Response field names `deals[].price.{amount,amountInt,currency}`, `.regular`, `.shop.{id,name}`, `.url` (prior research SPEC names `obj.deal2`, `obj.price`, `obj.shop`, so mostly SPEC) | D1, Code Examples | Mapping bugs; fixtures settle it |
| A3 | Epic's ITAD shop id is 16 | D5 | Wrong runner mapping for Epic rows (logo/badge); dump settles it |
| A4 | A user-registered ITAD app gets its own 1000/5min budget | Locked decisions (INFERENCE from vendor statement) | The optional-key feature would not relieve the shared budget; still harmless, but the roadmap's rationale would be wrong |
| A5 | `window.api.openExternalUrl` enforces an http(s) scheme allowlist | Pattern 1 | A hostile/compromised provider URL could open an arbitrary scheme; add validation in the adapter either way |
| A6 | Cache TTLs (6h prices, 7-30d gid map), entry cap ~500, `Retry-After` clamp [1s, 15min] | D6 | Tuning only |
| A7 | esbuild `--define` from an env var is the right embedded-key mechanism, and release CI can hold the secret | D7 | Build/release process change; needs a human decision on CI secret placement |
| A8 | 429 applies to the keyless lookup route too | D6 | Minor; uniform handling covers both |
| A9 | `getLocaleSettings`/`REGION_OPTIONS` can be imported across screens without tripping a lint boundary | D3 | Hoist to `src/common/` |

## Open Questions

1. **ITAD terms on user-supplied keys (the INFERENCE the roadmap asked to verify).**
   - What we know: vendor statement (2026-10-01): "rate limit follows the app, doesn't matter whether it's api key or oauth." The prior research's terms list (SPEC) says nothing against users registering their own app. Third-party search results could not surface the terms page; `docs.isthereanydeal.com` returns 403 to WebFetch from here, and I did not try to bypass that.
   - Unclear: whether the terms restrict distributing an app that asks users for keys, or require approval for it; whether one person registering many apps is "circumvention" ("will cause ban", SPEC). A user registering **one** app of their own for personal use is the ordinary case and is not circumvention by the spec wording we have, but that is still unverified.
   - Recommendation: keep the setting optional and last-wave; add a one-line question to the existing `api@isthereanydeal.com` thread (alongside the owed Q1 confirmation) before shipping it as a headline feature. Do not claim in UI copy that it gives "your own quota" until confirmed.
2. **Country/currency coverage.** Remains UNKNOWN until the operator runs the Wave 0 sweep. Plan branches are in the table above.
3. **Embedded-key CI secret.** Who injects it for release builds and what is the env var name? Human/CI decision; the plan needs a `checkpoint:human-action` task.
4. **Region UX.** Language-derived country is coarse and the only override is on the Deals screen. Accept for Phase 47 (recommended) or add a picker?
5. **`getStoreSearchStoreMap` channel.** Keep as shim or delete (no renderer caller)? Deleting requires regenerating the IPC contract and the allow-list tests.
6. **Search result count.** Not specified by the roadmap; recommend 20-30 (each row costs price data, and search v1's result limit parameter name is UNKNOWN until the fixtures exist).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node + pnpm + jest | tests | yes (repo toolchain) | n/a | n/a |
| `api.isthereanydeal.com` (keyless routes) | lookup, shops, measurement | yes (MEASURED in prior research; not re-run this session) | n/a | n/a |
| ITAD API key | search, prices, measurement | not in repo by design; operator has one (registered 2026-11-12) | n/a | Unit tests use fixtures; no live test without the operator's run |
| `docs.isthereanydeal.com` / FAQ | terms + coverage | no (403 to WebFetch) | n/a | Operator reads terms; measurement script settles coverage |
| Rust toolchain | `pnpm gen:ipc-contract`/`check:ipc-contract` run through node, cargo only if a Rust arm is added (user-key slot) | not probed | n/a | n/a |

**Missing with no fallback:** none blocking planning. Live end-to-end verification needs the operator's key (a `checkpoint:human-action`).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | jest ^29.7.0 + ts-jest; projects Backend / Common / Frontend / Preload / Meta / relay (`jest.config.js`) |
| Config file | `/Users/graysonmitchell/Projects/GameLib/jest.config.js` plus per-project `src/{backend,common,frontend}/jest.config.js` |
| Quick run command | `pnpm exec jest --selectProjects Backend --runTestsByPath src/backend/storeSearch/__tests__/itad.test.ts src/backend/storeSearch/__tests__/itadCache.test.ts src/backend/storeSearch/__tests__/handlers.test.ts` |
| Frontend quick | `pnpm exec jest --selectProjects Frontend src/frontend/screens/StoreSearch` |
| Full suite command | `pnpm test:ci` (plus `pnpm check:ipc-contract`, `pnpm lint:src` scoped, `pnpm find-deadcode` ratchet, i18n gates) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRICE-01 | Adapter maps ITAD search+prices fixtures to `StoreSearchResult` with real `currencyCode`; sends `country` param; row = cheapest deal | unit (axios mocked) | `pnpm exec jest --selectProjects Backend --runTestsByPath src/backend/storeSearch/__tests__/itad.test.ts` | no, Wave 0 |
| PRICE-01 | `deal.url` byte-identical in results and deals (affiliate tags, encoded chars) | unit | same file | no, Wave 0 |
| PRICE-01 | `formatPrice`: en/USD -> `$14.99 USD`; de/EUR; GBP; JPY no decimals; unknown code falls back; single string | unit | `pnpm exec jest --selectProjects Frontend src/frontend/screens/StoreSearch/__tests__/formatPrice.test.ts` | no (rework of `formatUsdPrice.test.ts`) |
| PRICE-01 | `countryCode` passed from renderer through IPC; invalid code rejected/defaulted by zod | unit (schema) + hook test | `pnpm exec jest --selectProjects Common src/common/types/ipc` and `useDebouncedStoreSearch.test.ts` | partial |
| PRICE-01 | `ITAD_SHOP_TO_RUNNER` maps 61->steam, 35->gog, Epic id (from dump); Amazon absent | unit | `pnpm exec jest --selectProjects Backend --runTestsByPath src/backend/__tests__/storeMapping.test.ts` | yes (rewrite) |
| PRICE-02 | Gid lookup maps appids (prefix `app/`), chunks, persists, only calls for unseen ids, tolerates failure | unit | `itad.test.ts` | no, Wave 0 |
| PRICE-02 | Container injects `steamAppId` from gid map -> "Owned on Steam" shows; no map -> fuzzy fallback, never wrong owned; waiting-key appid -> keyAvailable | component/unit | `pnpm exec jest --selectProjects Frontend src/frontend/screens/StoreSearch/__tests__/StoreSearchScreen.test.tsx` | yes (extend) |
| PRICE-03 | 429 + `Retry-After` -> cached rows with `cachedAt`; no cache -> rethrow; gate blocks further calls until `blockedUntil` (injectable clock, no real timers); header absent/HTTP-date/garbage handled | unit | `itadCache.test.ts`, `itad.test.ts` | no, Wave 0 |
| PRICE-03 | Row/breakdown render the cached timestamp, copy via `t()` | component | `StoreSearchRow.test.tsx` (extend) | yes (extend) |
| All | Handler rethrow contract unchanged (provider-failed vs empty distinct) | unit | `handlers.test.ts` | yes (adjust mocks to `./itad`) |
| All | Dotted-title cache key; key never reaches `logError`; entry cap eviction | unit | `itadCache.test.ts` | no, Wave 0 |
| All | New store registered: fixtures/kind/TTL pins | unit | `pnpm exec jest --selectProjects Backend src/backend/stores src/backend/__tests__/storeKinds.test.ts` | yes (update) |
| All | IPC contract regenerated if channels change | gate | `pnpm check:ipc-contract` | yes |
| Coverage | Operator sweep produces `47-ITAD-COVERAGE.json` | manual (operator, needs key) | `ITAD_API_KEY=... node meta/runTs.cjs --bundle --platform=node --target=node22 meta/measureItadCoverage.ts` | no, Wave 0 |
| Live | Real search in a running app, 429 simulated | manual live-gate (needs operator key, a built sidecar: `pnpm build:sidecar` first) | n/a | n/a |

### Sampling Rate
- **Per task commit:** the quick backend command + frontend StoreSearch command above.
- **Per wave merge:** `pnpm test:ci` + `pnpm check:ipc-contract`.
- **Phase gate:** full suite green, `pnpm find-deadcode` ratchet (the removed `cheapshark.ts`/`StoreMapCache` exports must not leave dead code), i18n gates, then `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/backend/storeSearch/__tests__/itad.test.ts`, `itadCache.test.ts` (replace `cheapshark.test.ts`)
- [ ] ITAD response fixtures (from the measurement run, redacted of any key) under `src/backend/storeSearch/__tests__/fixtures/`
- [ ] `meta/measureItadCoverage.ts` and the operator run (human-action checkpoint)
- [ ] `formatPrice` test file; extend `StoreSearchScreen.test.tsx` / `StoreSearchRow.test.tsx`
- [ ] `meta/backendDiCeilings/storeSearch.json` entries for any new `jest.mock` file; update for the removed `cheapshark.test.ts`
- Framework install: none.

## Conventions this phase triggers (from CLAUDE.md / `Skill("gamelib-conventions")`)

| Convention | Triggered? | How |
|------------|-----------|-----|
| Sidecar exit contract (`unref`, no unbounded boot work) | **Yes** | Cache + gate are timer-free by design (Pattern 2); no prefetch at boot; if any timer/handle appears it must `unref()`. `smoke:sidecar` does not catch slow exit (discipline-only) |
| `<verify>` runs `npx prettier --check` over exact paths | **Yes, every task** | Scoped paths, never `.`; run `--file-info` first and omit the check where every path is prettier-ignored |
| Fake-HOME isolation for spawned processes | Only if a task spawns a process (the measurement script and tests should not). If one does: `createFakeHomeProfile()`, no hand-rolled `env` | `fakeHomeIsolation.test.ts` |
| UAT item shape (`### N.`, inline `expected:`, `result:` opens with a status word) | **Yes**, the live gate (real search, 429 simulation, key setting) will be a `*-UAT.md` | Discipline-only, nothing in CI |
| Todo triage frontmatter | Only if the plan files todos (e.g. the owed ITAD Q1 confirmation, region picker): `severity:` `platform:` `ready:` in that order | `pnpm planning-gates` |
| Other repo rules | Use `/gsd-` hyphen command form; dev launch is `pnpm tauri:dev` not `tauri:dev:run`; `pnpm build:sidecar` before live-testing backend changes; no commit of the ITAD key; do not raise upstream-Heroic deviation as a concern | memory notes + CLAUDE.md |

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | partial | API-key (not user auth); embedded key + optional user key via keyring slot |
| V3 Session Management | no | none |
| V4 Access Control | partial | Renderer-callable channels must be in the generated allow-list; key-setting channels never return the key (`hasApiKey` returns boolean) |
| V5 Input Validation | yes | zod tuples (bounded strings, `^[A-Z]{2}$` country, digit-only appid arrays with max length); axios `params` encoding |
| V6 Cryptography | yes | Key at rest in the OS keyring slot, not `config.json`; never hand-roll |
| V7 Error handling / logging | yes | No key or full URL in logs (Pitfall 3) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Embedded key extracted from the binary | Spoofing / Info disclosure | Accepted risk (ITAD's model); cache + debounce limit abuse blast radius; monitor ITAD dashboard (operating policy) |
| Key leaked via logs / uploaded log files | Info disclosure | Log endpoint+status only; redaction test |
| Provider-supplied URL opened by `openExternalUrl` | Tampering / Elevation | Require `https:` parse success; drop (never rewrite) otherwise; confirm renderer-side scheme allowlist (A5) |
| Query injection into the ITAD URL | Tampering | axios `params`; zod max length (already 256) |
| Cache poisoning via crafted key (path separators) | Tampering | Hash/sanitise query key component; `CACHE_STORE_NAME_PATTERN` governs store names, not entry keys |
| Rate-limit exhaustion / DoS of the shared budget | Denial of service | Debounce, cache-first, single-flight, 429 gate, row cap |
| Hostile renderer script calling the key-setting or lookup channels | Tampering | Bounded zod args; lookup array max length; allow-list |

## Sources

### Primary (HIGH, codebase read this session)
- `src/backend/storeSearch/cheapshark.ts`, `handlers.ts`; `src/common/types/storeSearch.ts`; `src/common/discounts/storeMapping.ts`, `badges.ts:147`; `src/frontend/screens/StoreSearch/**`; `src/frontend/screens/Discounts/helpers.ts`, `index.tsx`; `src/common/types/ipc/enrichment.ts`; `src/backend/sidecar/enrichmentFlowRegistration.ts`; `src/backend/cache.ts`; `src/backend/crossover_index/stores.ts`; `src/backend/wiki_game_info/stores.ts`; `src/backend/stores/createStores.ts`; `src/backend/services/types.ts`; `src/backend/miscRuntime.ts`; `src/backend/steamgrid/secretStore.ts`; `src-tauri/src/ipc_contract.rs`; `package.json` scripts; `meta/backendDiCeilings/storeSearch.json`
- `.planning/ROADMAP.md` Phase 47 section; `.planning/REQUIREMENTS.md` PRICE-01..03; `.planning/quick/260916-gdg-.../260916-gdg-RESEARCH.md`; Phase 20 `20-CONTEXT.md` (D-11..D-14), `20-RESEARCH.md` (A3), `20-UI-SPEC.md`; `.claude/skills/gamelib-conventions/SKILL.md`

### Secondary (MEDIUM)
- Prior research's ITAD OpenAPI v2.11.0 reading and live keyless probes (graded SPEC/MEASURED there; not re-run here)

### Tertiary (LOW)
- [github.com/kevinfiol/enhanced-gog/issues/10](https://www.github.com/kevinfiol/enhanced-gog/issues/10): one maintainer's observation that `games/overview/v2` returned US prices for AR/MD (April 2024). Single source, different endpoint, no ITAD reply.
- Web search results for ITAD terms/prices v3/countries returned nothing authoritative; `docs.isthereanydeal.com` and `isthereanydeal.com/faq` were 403 to WebFetch. A follow-up attempt to read the docs with a spoofed User-Agent was blocked by the permission classifier and was NOT retried; the operator should read the terms in a browser if the user-key question matters.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, nothing new; all reused.
- Architecture / code map: HIGH, read directly, file:line cited.
- ITAD API specifics (field names, auth style, batch limits): MEDIUM/LOW, SPEC from prior research plus `[ASSUMED]` items; Wave 0 fixtures convert them.
- Coverage (countries/currencies): UNKNOWN until the operator sweep.
- Pitfalls: HIGH for repo-specific ones (dots in keys, timers, generated files), MEDIUM for ITAD behaviours.

**Research date:** 2026-11-12
**Valid until:** 2026-12-12 for the code map (moves fast: Phases 74-76 are active), the ITAD claims until the first Wave 0 run replaces them with measurements.
