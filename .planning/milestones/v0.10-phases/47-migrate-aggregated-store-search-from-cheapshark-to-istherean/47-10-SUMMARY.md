---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 10
subsystem: ui/storeSearch
tags: [itad, store-search, cached-price, country, i18n]
requires: [47-03, 47-06, 47-09]
provides:
  - cached-at "Price from {{time}}" line on result rows and breakdown sub-rows
  - country-aware breakdown deals fetch (same country the search was priced for)
affects: [47-13]
tech-stack:
  added: []
  patterns: [sibling cached line next to (never inside) the single-text-node price]
key-files:
  created: []
  modified:
    - src/frontend/screens/StoreSearch/components/StoreSearchRow/index.tsx
    - src/frontend/screens/StoreSearch/components/StoreSearchBreakdown/index.tsx
    - src/frontend/screens/StoreSearch/index.tsx
    - src/frontend/screens/StoreSearch/__tests__/StoreSearchRow.test.tsx
    - src/frontend/screens/StoreSearch/index.css
    - public/locales/en/translation.json
key-decisions:
  - 'Row wraps price + cached line in div.storeSearchRow__priceColumn (flex column, right aligned); the price span keeps its class, rules and single text node'
  - 'Breakdown cached line sits after storeSearchRow__breakdownPrice inside the centre-aligned flex sub-row, so a descendant rule zeroes its margin-top there (the row-level top margin would misalign it)'
requirements-completed: [PRICE-01, PRICE-03]
duration: 20min
completed: 2026-11-17
status: complete
actuals:
  tokens: 9000
  tasks: 3
  commits: 2
plan_head_before: c84cb301f5fe03127fb1271af949988e2039af86
plan_head_after: ba1c6b36df65dfc5ee1d25b2072a5c7aaa23df95
---

# Phase 47 Plan 10: Cached-price line and country-aware breakdown Summary

A result row served from cache now shows its price plus a separate secondary "Price from <date, time>" line (title and aria-label carry the longer explanation), each breakdown sub-row does the same independently from its own `cachedAt`, and expanding a row fetches deals for the country the search was priced for.

## Commits

- 4008a8840: Row/Breakdown/container edits and tests (`feat(47-10)`)
- ba1c6b36d: CSS and en strings (`feat(47-10)`)

## What was built

- `StoreSearchRow`: new `countryCode` prop forwarded to `StoreSearchBreakdown`; when `result.cachedAt !== undefined`, a `span.storeSearchRow__cached` (clock icon `aria-hidden`, `t('storeSearch.cached', ...)` with `formatCachedAt`) sits beside the price in `div.storeSearchRow__priceColumn`. The price span is untouched (one text string).
- `StoreSearchBreakdown`: new `countryCode` prop; `window.api.getStoreSearchDeals(gameId, countryCode)` with effect deps `[gameId, countryCode]`; per-deal cached span when `deal.cachedAt !== undefined`; `buyUrl` and `storeName` passed through verbatim; no re-sort.
- Container passes `countryCode={countryCode}` to each row.
- CSS: `.storeSearchRow__priceColumn`, `.storeSearchRow__cached` (`--text-sm`, `--text-secondary`, no `font-weight`, no accent/danger), plus a breakdown-scoped `margin-top: 0`.
- en strings: `storeSearch.cached`, `storeSearch.cachedTitle` (neither says error, failed or rate limited).
- Tests (StoreSearchRow.test.tsx, 10 -> 16 tests, `jest.mock` count still 6): cached line text/title/aria-label and outside the price node, absent without `cachedAt`, price node equals `formatPrice` output exactly, no error/failed/rate wording, country forwarded to the breakdown, deals fetched with `('game-1','DE')` exactly once, per-deal cached line with API order preserved. The existing assertion became `toHaveBeenCalledWith('game-1', 'US')`.

## Verification (all run)

- `pnpm exec jest --selectProjects Frontend --runTestsByPath` over the 5 StoreSearch test files: exit 0, 5 suites, 59 tests (the plan's `--selectProjects Frontend src/...` form runs the whole project; `--runTestsByPath` used per orchestrator)
- `pnpm exec jest --selectProjects Meta --runTestsByPath meta/__tests__/hardcodedStringGate.test.ts`: exit 0, 176 tests
- `pnpm i18n-churn-guard` (after committing the translation edit): exit 0, "clean"
- `pnpm codecheck`: exit 0 (after Task 1, and again at the end)
- Scoped `npx prettier --check` over the 4 `.tsx` paths and `index.css` (each `ignored:false`): exit 0 (the Breakdown file needed one `--write` pass first). `translation.json` is prettier-ignored, JSON validity checked with a parse.
- Acceptance greps: `storeSearchRow__cached` in Row 1 / Breakdown 1 / CSS rule present with `var(--text-secondary)` and no `font-weight`; `getStoreSearchDeals(gameId, countryCode)` 1; `countryCode={countryCode}` 1; `"cachedTitle"` 1.
- Task 3 automated prep: `pnpm build:sidecar` exit 0; `build/main/sidecar.js` mtime Nov 17 22:00:35 2026 (fresh, within 10 min).

## Deviations from Plan

- **[Plan correction]** The plan's verify form `--selectProjects Frontend src/frontend/screens/StoreSearch` was replaced by `--runTestsByPath` over the StoreSearch test files (orchestrator instruction).
- **[Styling detail]** Added `.storeSearchRow__breakdownItem .storeSearchRow__cached { margin-top: 0 }` so the cached line aligns in the centre-aligned sub-row. Otherwise per plan.
- Rules 1-3: none needed.

## Live check (Task 3, non-blocking): pending operator

Status: **live check pending operator**. Setup: in your own terminal `export GAMELIB_ITAD_API_KEY=<your GameLib ITAD app key>`, stop any running dev session (`pnpm tauri:dev` does NOT rebuild the sidecar; a session started before the 22:00 build runs the old backend), then `pnpm tauri:dev` from the repo root. Never `pnpm tauri:dev:run`.

### 1. Localised prices in a non-US region
expected: With the Deals screen's region override set to Germany (or GBP: United Kingdom), searching Store Search for "portal" shows rows priced in that currency (e.g. "9,75 €" / "£8.19"), never "$… EUR" or "$… GBP", and the region caption names the priced country.
result: [pending — live check not yet run]

### 2. Expanded row uses the same country
expected: Expanding the first "portal" row lists per-store deals in the same currency as the collapsed row; clicking a store opens its ITAD link in the browser.
result: [pending — live check not yet run]

### 3. Cached price shows "Price from …" instead of an error
expected: After item 1, quit GameLib. Tell Claude "age the cache"; Claude finds `store_cache/itad_prices.json` under the GameLib config dir and moves every `fetchedAt` back 2 hours (no other change). Relaunch `pnpm tauri:dev` with network ON, open Store Search, then turn the network OFF only for this action: search "portal" again, note what the rows show, and turn the network back ON before reporting. Rows render normally with a separate secondary line "Price from <date, time>" under the price (hover shows the longer explanation); no error banner, no dimming, and the text never says error, failed or rate limited.
result: [pending — live check not yet run]

## Notes for 47-13

- Row and breakdown now require `countryCode`; any other caller of `StoreSearchRow`/`StoreSearchBreakdown` must pass it (only the Store Search container does today).
- No `47-UAT.md` exists yet; when `/gsd-verify-work` creates it, carry the three items above in the same shape.
- The 429-specific arm is pinned by `itad.test.ts`; item 3 uses a network cut because it exercises the same `cachedAt` stale-fallback path (47-06).

## Known Stubs

None.

## Threat Flags

None. T-47-34 (renderer passes `buyUrl` unchanged; adapter drops non-https) and T-47-35 (every cached row/sub-row carries an absolute timestamp) are mitigated; T-47-36 accepted (React text rendering, no `dangerouslySetInnerHTML`).

## Self-Check: PASSED

- FOUND commits: 4008a8840, ba1c6b36d
- FOUND files: all six modified files; this SUMMARY
