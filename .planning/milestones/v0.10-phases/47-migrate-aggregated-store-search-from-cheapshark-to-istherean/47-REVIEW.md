---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
reviewed: 2026-11-19T00:00:00Z
depth: standard
scope: gap-closure plans 47-19..47-22 (incremental, diff_base af88c70d8)
files_reviewed: 21
files_reviewed_list:
  - meta/__tests__/genI18nGateScope.test.ts
  - meta/i18nForkTouchedFiles.json
  - meta/i18nGateScope.json
  - src/frontend/components/UI/RegionPicker/__tests__/RegionPicker.test.tsx
  - src/frontend/components/UI/RegionPicker/index.tsx
  - src/frontend/components/UI/SearchBar/__tests__/searchBarTextChecking.test.tsx
  - src/frontend/components/UI/SearchBar/index.tsx
  - src/frontend/components/UI/TextInputField/__tests__/textInputFieldTextChecking.test.ts
  - src/frontend/components/UI/TextInputField/index.tsx
  - src/frontend/screens/Discounts/components/DiscountFilters/__tests__/filterLayout.test.ts
  - src/frontend/screens/Discounts/components/DiscountFilters/index.css
  - src/frontend/screens/Discounts/components/DiscountFilters/index.tsx
  - src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.tsx
  - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/everythingElse.test.tsx
  - src/frontend/screens/StoreSearch/__tests__/StoreSearchScreen.test.tsx
  - src/frontend/screens/StoreSearch/__tests__/rowSurfaceTheme.test.ts
  - src/frontend/screens/StoreSearch/__tests__/storeSearchSession.test.ts
  - src/frontend/screens/StoreSearch/__tests__/useDebouncedStoreSearch.test.ts
  - src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts
  - src/frontend/screens/StoreSearch/index.css
  - src/frontend/screens/StoreSearch/storeSearchSession.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
  necessity: 0
status: issues_found
---

# Phase 47 — Code Review (gap closure 47-19..47-22)

Incremental review of the changes since the 47-14..47-18 review (`af88c70d8`). The prior report is in git history.
Verified clean: RegionPicker `displayEmpty`; the SearchBar / TextInputField / Winetricks spellcheck and autocorrect
opt-outs; the hook's debounce early-return and fetch-skip guards across the remount, country-change, error and
short-query paths; the i18n scope / fork-touched JSONs (sorted, mutually consistent, 318 / 440 counts match).
The `--gamecard-title-color` token and the `main-content` container declaration (`App.css:61`) were checked against the code. No tests were run by the reviewer.

## Warnings

### WR-01: Kept rows can be up to ~2 hours old; the "never older than the cache" claim is false
**File:** `src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts:156-160`, `src/frontend/screens/StoreSearch/storeSearchSession.ts:345-349`
**Issue:** The hook stamps `fetchedFor.at` with renderer `Date.now()` when the response arrives, but the backend serves ITAD rows from its cache for up to `ITAD_FRESH_MS` (1h, `src/backend/storeSearch/itad.ts:349`) and `StoreSearchResponse` carries no fetch time. A search answered from a 59-minute-old backend entry is stamped "now", and `restoreStoreSearchSession` keeps it for a further hour — prices up to ~2h old shown as current. The doc comment ("kept rows are never older than the cache that produced them") is wrong; `storeSearchSession.test.ts` pins only the 1h constant, not the end-to-end bound.
**Fix:** Add a `fetchedAt` (backend cache timestamp) to `StoreSearchResponse` and stamp `at` from it; or use a shorter renderer max age (e.g. 30 min) and correct the comment; or at minimum correct the comment to state the ~2h bound.

### WR-02: First frame of a remount shows the "Search a title…" prompt beside a filled search box
**File:** `src/frontend/screens/StoreSearch/storeSearchSession.ts:403-405`, `src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts:177-192`
**Issue:** When the query is restored but rows are not current (different country, >1h, last status error/loading, query edited after fetch), `restoreStoreSearchSession` returns `status: 'prompt'` with a non-empty `debouncedQuery`. `index.tsx:223` renders the full prompt panel for `'prompt'`, and the restoring fetch only sets `'loading'` after the first commit — a one-frame flash of the empty-state prompt with the query already in the box. Only the fresh-rows path asserts the first frame (G-47-12a); the stale/error/region tests do not.
**Fix:** In the restore path, return `status: 'loading'` when `debouncedQuery !== ''` and rows are not current (or initialise `fetching` to `seed.debouncedQuery !== '' && seed.status === 'prompt'`); add first-render assertions to the stale-rows tests.

### WR-03: `limitTags={2}` plus the removed Tooltip leaves blurred Genres/Features hiding chips; the comment says otherwise
**File:** `src/frontend/screens/Discounts/components/DiscountFilters/index.tsx:101-131`
**Issue:** The comment says "The control shows every chip itself, so no hover bubble is needed", but `limitTags={2}` still collapses a blurred control to two chips + "+N". The hover bubble was the only way to see the hidden selections without focusing; mouse users lose it and keyboard / screen-reader users get no description of what is hidden. The comment is inaccurate for the default (blurred) state.
**Fix:** Drop `limitTags` (the control now grows to hold every chip), or keep it, correct the comment, and give "+N" a `title`/`aria-label` listing the hidden names via `getLimitTagsText`.

## Info

### IN-01: `storeSearchSession.test.ts` replaces `globalThis.localStorage`/`sessionStorage` and never restores them
**File:** `src/frontend/screens/StoreSearch/__tests__/storeSearchSession.test.ts` (D-22 test, ~lines 150-165)
**Issue:** Mocks are left in place after the test; only Jest's per-file isolation protects other files, and later tests in this file would inherit them. The assertion is near-vacuous for a module that never references storage; the source-gate `describe` covers the same ground.
**Fix:** Save and restore in `afterEach`, or `jest.spyOn(Storage.prototype, …)`, or drop it in favour of the source gate.

### IN-02: `rowSurfaceTheme.test.ts` hard-codes "ten built-in themes"
**File:** `src/frontend/screens/StoreSearch/__tests__/rowSurfaceTheme.test.ts`
**Issue:** Adding or removing a built-in theme fails a G-47-12c contrast test on an unrelated count. `isLight` is also silently false when `--body-background` is not a plain colour (`tryContrast` returns null); the "at least one light theme" test only partly covers this.
**Fix:** Assert `themes.length > 0` or compare against the generator's own theme count instead of the literal 10.

### IN-03: Container-query comment contradicts itself about the one-column rule
**File:** `src/frontend/screens/Discounts/components/DiscountFilters/index.css:219-228`
**Issue:** It says the 700px rule "could never fire" (true as a viewport rule at the 900px window minimum) and then that "as a container rule it would fire at the minimum for no reason" — at the minimum, main-content is ~644px, so a container rule would fire. Removing it is defensible; the rationale is muddled.
**Fix:** Reword: a one-column container rule was judged unnecessary because two columns at ~644px are acceptable.

### IN-04: `meta/i18nGateScope.json` `generatedBy` is an append-only multi-KB history string
**File:** `meta/i18nGateScope.json:5`
**Issue:** 47-19 appended another clause to a single-line, hand-maintained provenance string now several KB long (existing pattern), making every diff of this file unreadable.
**Fix:** Move the history to a `history` array or a changelog file; keep `generatedBy` short.

---

_Reviewed: 2026-11-19_
_Reviewer: Claude (gsd-code-reviewer); written to disk by the execute-phase orchestrator from the reviewer's returned text (reviewer had no write tool)_
_Depth: standard_
