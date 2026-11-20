---
status: diagnosed
trigger: "store-search-region-only-in-deals — The Store Search price region can be chosen without going to the Deals screen (UAT 47 test 8, gap G-47-8)"
created: 2026-11-18T00:00:00Z
updated: 2026-11-18T00:00:00Z
audit_acknowledged:
  milestone: v0.10
  at: 2026-11-20
  status: diagnosed
---

## Current Focus

hypothesis: CONFIRMED. This is a deliberate scope cut, not a code defect. The region override is a renderer-only localStorage value (`discounts.regionOverride`) whose ONLY writer is the inline MUI `<Select>` inside `Discounts/index.tsx`. Store Search is a read-only consumer of it, and was specified (47-RESEARCH D3, 47-UI-SPEC section 1, 47-CONTEXT) as "caption, no control".
test: read both screens, the helpers, the backend cache and the Phase 47 decision records.
expecting: n/a (diagnosis complete)
next_action: return ROOT CAUSE FOUND to the caller (goal: find_root_cause_only). No fix applied.

bug_class: Bohrbug (deterministic design gap; always reproduces; not a defect in logic)
known_pattern_candidate: none (knowledge-base.md has no region/Store Search entry)

## Symptoms

expected: The Store Search price region can be chosen from Store Search itself (or a shared setting), not only from the Deals screen's region picker.
actual: User reported: "setting region in deals only is not a good ux."
errors: None reported
reproduction: Test 8 in UAT. To get Store Search prices in EUR the user had to open the Deals screen, change its region dropdown to Germany, then go back to Store Search. Store Search shows "Showing prices for {country}." under the search bar but offers no way to change it there.
started: Discovered during UAT of phase 47 (2026-11-18). Known, deliberate scope cut: 47-RESEARCH.md D3 says "no new picker this phase; reuse the stored override (localStorage discounts.regionOverride)" and notes the language-derived default is coarse (en -> US).

## Eliminated

- hypothesis: Store Search reads a region from somewhere other than the Deals key (e.g. its own store), so the two could be out of step
  evidence: StoreSearch/index.tsx:51-58 calls the SAME `getLocaleSettings(toShippedLanguage(i18n.language), getStoredRegionOverride())` that Discounts/index.tsx:59-62 uses; the only two call sites of `getStoredRegionOverride` in src are these two screens.
  timestamp: 2026-11-18

- hypothesis: The backend holds region state (or per-region cache state) that a Store Search picker would have to invalidate or migrate
  evidence: `handleSearchStores(deps, query, country)` and `handleGetStoreSearchDeals(deps, gid, country)` take `country` as a per-call argument and `normalizeCountry` just validates `^[A-Z]{2}$` else 'US' (storeSearch/handlers.ts). Cache keys are `search:${country}:${hash}` and `deals:${country}:${gid}` (itadCache.ts:32,41), so each country has its own entries and a region change needs no invalidation. The backend is stateless w.r.t. region.
  timestamp: 2026-11-18

- hypothesis: A Phase 68 persisted-store migration/versioning obligation blocks moving or renaming the key
  evidence: 68-INVENTORY.md:64 classifies `discounts.regionOverride` as "a country code, one-click to re-pick; not user data; migration: none". 68-RESEARCH.md:362: "UI preference; has its own shape validation". Moving or renaming costs the user one re-pick, no migration needed.
  timestamp: 2026-11-18

- hypothesis: Sketch findings contain a validated direction for a region/country picker that must be followed
  evidence: sketch-findings-gamelib references (navigation-shell, library-filtering, notices-and-toasts) have no region/picker/currency guidance. Only relevant facts: Deals and Store Search are sibling tier-2 nav items under the Stores tab (navigation-shell.md:65), and the "Deals" screen already puts its picker in a top bar row opposite the title. No design direction to override.
  timestamp: 2026-11-18

## Evidence

- timestamp: 2026-11-18
  checked: 47-UAT.md test 8 and gap G-47-8
  found: severity minor, status failed. Test 1 passed ONLY after the user set the region on the Deals screen to Germany; the complaint arose during that flow.
  implication: Feature works as specified; the spec itself is the gap.

- timestamp: 2026-11-18
  checked: 47-RESEARCH.md D3 (:221-223), open question 4 (:418-419), 47-UI-SPEC.md section 1 (:129-134), 47-CONTEXT.md (:78-79, :151), 47-DISCUSSION-LOG.md (:59)
  found: Every Phase 47 document records "no Store Search region picker this phase". UI-SPEC even says "do not link to [Deals] and do not add helper copy about it" and "This is a recorded limitation: language-derived country is coarse (en -> US)". The picker is listed under Deferred Ideas. RESEARCH :223 flagged `getLocaleSettings`/`REGION_OPTIONS` living inside the Discounts directory as an assumption (A9) and suggested hoisting to src/common/ if a lint boundary complains.
  implication: Root cause is a documented, user-visible scope cut whose UX cost the user has now hit. Not a regression.

- timestamp: 2026-11-18
  checked: src/frontend/screens/Discounts/helpers.ts:109-148
  found: `LOCALE_OVERRIDE_KEY = 'discounts.regionOverride'`; `getStoredRegionOverride()` returns the stored code only if it is in `REGION_OPTIONS` (29 countries), else null; `setStoredRegionOverride()` writes/removes it. `getLocaleSettings(language, override)` returns `{countryCode, currencyCode, locale:'en-US'}`: the override wins, else a language->country map (`en` -> US).
  implication: The override is a bare country code in localStorage; read/write helpers are already exported and reusable. Nothing in the helpers ties them to the Deals screen except the key name and file location.

- timestamp: 2026-11-18
  checked: src/frontend/screens/Discounts/index.tsx:50-62, 116-129, 569-627
  found: Region state is `useState(() => getStoredRegionOverride())`. The ONLY writer is `handleRegionChange` (:116), wired to an INLINE MUI `<Select id="discountsScreen__regionSelect">` in the screen's topbar (:569-627). It is not a component. `handleRegionChange` also resets ALL Deals filter state (sort, genres, features, OS, rating, PEGI, search, hide-DLC, hide-owned, wishlist) and `localeSettings` feeds the GOG catalog fetch (:223) and the price-range currency.
  implication: (a) there is no reusable picker component today; (b) the writer's handler is coupled to Deals-only state resets, so it cannot simply be imported and called from Store Search; (c) the Deals picker exists because GOG's catalog API needs a country+currency pair.

- timestamp: 2026-11-18
  checked: src/frontend/screens/StoreSearch/index.tsx:45-58, 136-140
  found: `countryCode = useMemo(() => getLocaleSettings(..., getStoredRegionOverride()).countryCode, [i18n.language])`. Read ONCE per mount/language change (stored override is not in the deps and is not state). The region is shown only as a caption `<p className="storeSearchScreen__region">` plus the D-13 fallback note. `countryCode` is passed to `useDebouncedStoreSearch(countryCode)` (re-fires the committed search once on change) and to each `StoreSearchRow` (expanded deals fetch uses the same country).
  implication: Store Search has no write path at all and its read is a non-reactive snapshot. This works today only because Deals and Store Search are separate routes (App.tsx:264-271: 'discounts', 'store-search'), so Store Search re-reads on every mount. An in-screen picker needs this to become real state.

- timestamp: 2026-11-18
  checked: REGION_OPTIONS (Discounts/helpers.ts:76-106) vs ITAD_PRICED_COUNTRIES (backend/storeSearch/itadCoverage.ts:15-48, measured in the Phase 47 Wave 0 sweep)
  found: The two lists differ. REGION_OPTIONS (29, built for GOG's supported currencies) includes IL, RU, UA, which ITAD does NOT price (they fall back to US and trigger the regionFallback note). ITAD prices AR, NZ, IE, AT, BE, IN which REGION_OPTIONS does not offer. Also `getStoredRegionOverride` rejects anything not in REGION_OPTIONS, so a stored 'NZ' would read back as null.
  implication: Reusing the Deals option list verbatim for Store Search would offer 3 countries that silently fall back and omit 6 countries ITAD can price. ITAD_PRICED_COUNTRIES is backend-only, so the frontend has no priced-set constant today (it learns it only from `pricedCountry` in the response). If the shared key is widened beyond REGION_OPTIONS the validator in `getStoredRegionOverride` must be widened too, and then Deals (GOG, needs a currency per country) must tolerate a stored country it has no currency for (it already degrades: `getLocaleSettings` ignores an override not in REGION_OPTIONS and falls back to the language default).

- timestamp: 2026-11-18
  checked: Discounts/index.css:27-94 and the shared SelectField (components/UI/SelectField)
  found: The picker's styling (outlined-input min-height, border, hover/focus accent, currency pill) is scoped under `.discountsScreen`, so the markup would render unstyled inside `.storeSearchScreen`. A generic `SelectField` (MUI Select + FieldLabel, used in Settings) exists but has no currency-pill/auto-option rendering the Deals picker has.
  implication: Reuse means extracting the picker into a shared component with its own (or hoisted) CSS, not a one-line import.

- timestamp: 2026-11-18
  checked: Phase 68 inventory (68-INVENTORY.md:63-64), LanguageSelector (uses window.localStorage), Phase 47 RESEARCH :189 ("There is no country in app settings/config")
  found: Renderer-owned preferences in localStorage are normal in this codebase (language itself is one). The region has no backend/GlobalConfig representation.
  implication: Two viable homes: (1) keep it in localStorage and hoist the key + helpers out of the Discounts directory; (2) promote it to a GlobalConfig setting (backend schema + IPC contract + a Settings control). (2) is heavier and buys cross-window/backend visibility nothing currently needs.

- timestamp: 2026-11-18
  checked: StoreSearchScreen.test.tsx:480-520 and the harness at :1-60
  found: Tests pin the caption text ("Showing prices for United States."), `searchStores('portal','US')`, and the region-fallback note. The harness is a hand-rolled react mock (useState/useRef/useEffect/useMemo), no DOM. Nothing asserts "no picker".
  implication: Adding a picker does not break existing assertions; new tests must follow the same no-DOM harness style.

## Resolution

root_cause: |
  Where the region is owned and why Store Search cannot set it:
  The price region is a single renderer-side value, a bare ISO country code in localStorage under `discounts.regionOverride`. Its read/write helpers (`getStoredRegionOverride`, `setStoredRegionOverride`, `getLocaleSettings`, `REGION_OPTIONS`) live in `src/frontend/screens/Discounts/helpers.ts`, and its ONLY writer is `handleRegionChange` bound to an inline MUI `<Select>` in `src/frontend/screens/Discounts/index.tsx` (:569-627). That picker exists because the GOG catalog API needs a country+currency pair; the key and list are named and scoped for Deals. Phase 47 made Store Search a read-only consumer (`StoreSearch/index.tsx:51-58`, a non-reactive useMemo snapshot) and DELIBERATELY shipped it with a caption and no control (47-RESEARCH D3, 47-UI-SPEC section 1, 47-CONTEXT deferred idea), accepting that the language-derived default is coarse (en -> US). So Store Search has no write path, there is no reusable picker component, and the only UI that can change the shared value is on a different screen. The user hit exactly the limitation the spec recorded. No backend defect; the backend takes country per call and caches per country.
fix: (not applied; diagnose-only) see Suggested Fix Direction below
verification: n/a
files_changed: []

candidate_causes_considered:
  - "code: no write path / non-reactive read in StoreSearch, picker inlined in Discounts (CONFIRMED, the cause)"
  - "config/data: option list scoped to GOG currencies, not ITAD coverage (CONFIRMED as a contributing constraint on the fix, not on the gap itself)"
  - "environment: none"
  - "data: backend per-country cache or state would block a picker (ELIMINATED)"
and_gate: "No. The gap is single-cause (no picker by spec). The option-list mismatch and non-reactive read are constraints the fix must handle, not co-causes of the gap."

suggested_fix_direction: |
  Recommended: keep it in localStorage as ONE shared value, add a real picker on Store Search, and make both screens read one hoisted source. Do not move it to GlobalConfig.
  1. Hoist the region persistence + option list out of `screens/Discounts/` into a neutral module (e.g. `src/frontend/helpers/storeRegion.ts` or `src/common/`), keeping `discounts.regionOverride` as the key so existing choices survive (Phase 68 classifies it as migration-none, so a rename would also be cheap, but keeping the key is free). Re-export from `Discounts/helpers.ts` to keep its imports and `localeSettingsLanguageForm.test.ts` green.
  2. Extract the inline MUI Select into a shared `RegionPicker` component (label "Store region", Auto option, `discounts.region.countries.*` strings, currency pill) and hoist its CSS out from under `.discountsScreen`. Use it in the Deals topbar and in Store Search. Place it on the title row of Store Search, mirroring the Deals topbar (title left, picker right), and keep the "Showing prices for X" caption and D-13 note (or drop the caption if the picker's Auto/selected label makes it redundant; caption still needed when fallback note explains a mismatch).
  3. In `StoreSearch/index.tsx` replace the `useMemo` snapshot with `useState(() => getStoredRegionOverride())` (as Discounts does); the picker's onChange calls `setStoredRegionOverride` + state. `useDebouncedStoreSearch(countryCode)` already re-runs the committed search once on a country change and `StoreSearchRow` already takes `countryCode`, so no hook/row change is needed. Do NOT reuse Deals' `handleRegionChange` (it resets Deals filters); the picker's onChange should be a plain callback, with Deals supplying its own reset wrapper.
  4. Decide the option list deliberately. GOG's REGION_OPTIONS vs ITAD's priced set differ: IL/RU/UA are offered but unpriced (fall back to US with the existing note); AR/NZ/IE/AT/BE/IN are priced but not offered and would be rejected by `getStoredRegionOverride`. Simplest: keep REGION_OPTIONS for both (the fallback note already makes unpriced picks truthful). Better: give Store Search its own option list derived from ITAD coverage (needs a frontend-visible copy of `ITAD_PRICED_COUNTRIES`, currently backend-only, e.g. hoist to src/common) and widen the stored-value validator so the shared key accepts it; Deals already degrades gracefully for a stored country it has no currency for (falls back to the language default). Note ITAD takes only a country (currency comes from ITAD), so no currency table is needed for Store Search.
  5. Cheap coherence improvement while there: when no override is set and language is `en`, Auto resolves to US; consider labelling the Auto option "Auto (United States)" the way Deals does so the user sees why.

  Things that must stay in sync:
  - Both screens must read the same key via the same hoisted helpers (single source of truth). They are separate routes (never mounted together), so a mount-time read is sufficient for Deals; there is no cross-screen live-sync requirement unless a picker is ever shown in two mounted places. If one is added (e.g. a Settings control), then add a small subscribe/`useSyncExternalStore` wrapper or a custom event, because `storage` events do not fire in the same window.
  - Validator and option list must be the same set (`getStoredRegionOverride` rejects anything outside the list).
  - Backend needs no change: `country` is a per-call IPC arg normalized by `normalizeCountry`, and cache keys `search:{country}:{hash}` / `deals:{country}:{gid}` are already per-country. Cost to note: the first search in a newly chosen country is a cache miss, i.e. a live ITAD call; rapid region flipping spends ITAD quota and, on a 429 with no cached entry for that country, shows the rateLimited error rather than a stale price.
  - i18n: reuse `discounts.region.label`, `discounts.region.auto`, `discounts.region.countries.*` (or add `storeSearch.regionPicker.*` if the copy diverges) and regenerate locale files via the repo's i18n extraction.
  - Tests: StoreSearchScreen.test.tsx uses a no-DOM hand-rolled react harness; its pinned caption/`searchStores('portal','US')` assertions stay valid. Add a case that a picker change updates the country passed to `searchStores` and persists via `setStoredRegionOverride`.
  - UI-SPEC amendment: 47-UI-SPEC section 1 says "No picker... do not link to [Deals]"; a follow-up plan should amend it and 47-CONTEXT's deferred idea. UAT item 8 / gap G-47-8 closes with it.

specialist_hint: typescript (react)
