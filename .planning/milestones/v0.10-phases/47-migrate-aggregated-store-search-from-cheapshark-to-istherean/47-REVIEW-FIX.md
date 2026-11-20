---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
fixed_at: 2026-11-19T00:00:00Z
review_path: .planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 47: Code Review Fix Report

**Fixed at:** 2026-11-19
**Source review:** .planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (WR-01, WR-02, WR-03; Info findings IN-01..IN-04 left documented in REVIEW.md)
- Fixed: 3
- Skipped: 0

**Verification environment:** `workflow.use_worktrees` is `false` in `.planning/config.json`, so edits, gates and commits ran in the main checkout (no worktree). Gates: affected Jest suites, `pnpm codecheck`, scoped `npx prettier --check`, plus the Meta `hardcodedStringGate` suite for WR-03.

## Fixed Issues

### WR-01: Kept rows can be up to ~2 hours old; the "never older than the cache" claim is false

**Files modified:** `src/frontend/screens/StoreSearch/storeSearchSession.ts`, `src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts`, `src/frontend/screens/StoreSearch/__tests__/storeSearchSession.test.ts`
**Commit:** 13ee3db66
**Applied fix:** Chose the minimal option, not the `StoreSearchResponse` change. Adding a backend fetch timestamp touches the IPC type, the backend response builder, the preload bridge and every consumer and mock, which is too wide for a staleness bound that a constant can close. `KEPT_RESULTS_MAX_AGE_MS` went from 1h to 15 min, and its doc comment now states the true end-to-end bound (`ITAD_FRESH_MS` 1h plus 15 min, so at most 1h15m) and why the renderer half is measured from receipt time. A restore past the max age re-asks the backend, which is cheap while the backend entry is fresh. The module header and a hook comment no longer claim an hour-fresh bound. `storeSearchSession.test.ts` now pins 15 min and that it is under an hour (the constant is still exercised through the inclusive and exclusive boundary tests, which use the constant), with the header and test titles reworded.
**Status:** fixed. A short renderer bound reduces but does not eliminate the 1h backend age; exact provenance would need the IPC timestamp.

### WR-02: First frame of a remount shows the "Search a title…" prompt beside a filled search box

**Files modified:** `src/frontend/screens/StoreSearch/storeSearchSession.ts`, `src/frontend/screens/StoreSearch/hooks/useDebouncedStoreSearch.ts`, `src/frontend/screens/StoreSearch/__tests__/storeSearchSession.test.ts`, `src/frontend/screens/StoreSearch/__tests__/useDebouncedStoreSearch.test.ts`
**Commit:** 9ddb8940a
**Applied fix:** `restoreStoreSearchSession` returns `status: 'loading'` when there is a committed query (>= 3 chars) but the kept rows are not current; a short query stays `'prompt'`. The hook seeds `fetching` from `seed.status === 'loading'` so the spinner also shows on the first frame. Index.tsx renders no body for `'loading'`, so the prompt panel no longer flashes. Pinned by first-render assertions (`status === 'loading'`, `loading === true`) in the region-change and failed-search remount tests, a new stale-rows-past-max-age remount test (uses `Date.now` spy and `KEPT_RESULTS_MAX_AGE_MS`), and a new test that a sub-3-char query restores as `'prompt'` with `loading === false`. `storeSearchSession.test.ts` `queryOnly` helper updated to the new restore contract.
**Status:** fixed: requires human verification (state-handling logic; verified by Jest, not visually in the running app).

### WR-03: `limitTags={2}` plus the removed Tooltip leaves blurred Genres/Features hiding chips; the comment says otherwise

**Files modified:** `src/frontend/screens/Discounts/components/DiscountFilters/index.tsx`, `src/frontend/screens/Discounts/components/DiscountFilters/index.css`, `src/frontend/screens/Discounts/components/DiscountFilters/__tests__/filterLayout.test.ts`
**Commit:** 430dc7f53
**Applied fix:** Chose to drop `limitTags` rather than keep it with an accessible "+N" label. The control already wraps and grows (`flex-wrap`, `height: auto`), so showing every chip makes the existing comment true, needs no new user-facing string (so no i18n key and no hardcodedStringGate impact) and avoids reintroducing a hidden-selection affordance. Component and CSS comments corrected. `filterLayout.test.ts` now asserts the component has no `Tooltip` and no `limitTags` (it previously pinned `limitTags={2}`). Trade-off: a selection of many genres makes the control taller; the inputs grid is `align-items: start`, so neighbours are not stretched.
**Status:** fixed: requires human verification (visual layout with many chips not checked in the running app).

---

_Fixed: 2026-11-19_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
