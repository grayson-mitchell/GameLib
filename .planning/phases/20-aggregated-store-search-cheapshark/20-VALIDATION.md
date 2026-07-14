---
phase: 20
slug: aggregated-store-search-cheapshark
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-14
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.0 + ts-jest (`jest.config.js`, projects: `Backend`, `Frontend`, `Meta`) |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npx jest <path> --selectProjects <Backend\|Frontend>` (displayName is capitalized — `Backend`/`Frontend`, not lowercase) |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~5-6 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest <touched-path> --selectProjects <Backend|Frontend>`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~6 seconds (full suite), <2 seconds (targeted)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 0 | STORESEARCH-05, STORESEARCH-06 | — | Fuzzy title matcher lifted verbatim into `common/matching/titleMatch.ts`; 0.85 threshold single-sourced | unit | `npx jest src/backend/__tests__/titleMatch.test.ts --selectProjects Backend` | ✅ | ✅ green (14/14) |
| 20-01-02 | 01 | 0 | STORESEARCH-05, STORESEARCH-06 | — | `dedup.ts`/`constants.ts` re-export from shared matcher; `dedup.test.ts` stays green unchanged | unit (regression) | `npx jest src/backend/humble --selectProjects Backend` | ✅ | ✅ green (464/464 incl. dedup.test.ts) |
| 20-02-01 | 02 | 0 | STORESEARCH-01, STORESEARCH-03, STORESEARCH-04 | — | Provider-neutral types with `currencyCode: string` (never a literal `'USD'` union, D-13); CheapShark storeID→Runner mapping tested | unit | `npx jest src/backend/__tests__/storeMapping.test.ts --selectProjects Backend` | ✅ | ✅ green (6/6) |
| 20-02-02 | 02 | 0 | STORESEARCH-01, STORESEARCH-03, STORESEARCH-04 | — | `searchStores`/`getStoreSearchDeals`/`getStoreSearchStoreMap` declared in `AsyncIPCFunctions` | type-check | `npm run codecheck` | ✅ | ✅ green (tsc exit 0) |
| 20-03-01 | 03 | 1 | STORESEARCH-05, STORESEARCH-06 | T-20-03 | `resolveStoreSearchBadges()` — exact Steam-AppID-only join (never fuzzy), fuzzy GOG/Epic/Amazon at 85%, DLC guard, independent `keyAvailable` (D-07), deterministic Steam→GOG→Epic→Amazon ordering (D-06) | unit | `npx jest src/backend/discounts/__tests__/storeSearchBadges.test.ts --selectProjects Backend` | ✅ | ✅ green (15/15) |
| 20-04-01 | 04 | 2 | STORESEARCH-01, STORESEARCH-03, STORESEARCH-04, STORESEARCH-07 | T-20-01 | CheapShark HTTP adapter (search/deals/store-map mapping); `buildRedirectUrl` interpolates `dealID` verbatim inside a fixed `https://www.cheapshark.com/redirect?dealID=` host prefix — dealID double-encoding regression test asserts no `%25` for a dealID containing `%2F`/`%3D` (Pitfall 1) | unit | `npx jest src/backend/storeSearch/__tests__/cheapshark.test.ts --selectProjects Backend` | ✅ | ✅ green (includes double-encoding regression test) |
| 20-04-02 | 04 | 2 | STORESEARCH-01, STORESEARCH-03, STORESEARCH-04, STORESEARCH-07 | T-20-01 | Three IPC channels registered via `addHandler` throw-on-failure contract; wired into `main.ts` + preload bridge | type-check + smoke | `npm run codecheck` | ✅ | ✅ green (tsc exit 0) |
| 20-05-01 | 05 | 3 | STORESEARCH-03, STORESEARCH-04, STORESEARCH-07 | — | `formatUsdPrice`/`buildOwnedBadgeLabel` pure helpers — D-13 correctness (`$X USD` single text node) + D-04/D-06 badge copy contract | unit | `npx jest src/frontend/screens/StoreSearch/__tests__/formatUsdPrice.test.ts --selectProjects Frontend` | ✅ | ✅ green (7/7) |
| 20-05-02 | 05 | 3 | STORESEARCH-03, STORESEARCH-04, STORESEARCH-07 | — | `StoreSearchRow`/`StoreSearchBreakdown` — badge stack, lazy per-store breakdown, buy handoff via `window.api.openExternalUrl(deal.buyUrl)` verbatim (no affiliate/navigate rewrite) | component (DOM-less hook harness) | `npx jest src/frontend/screens/StoreSearch/__tests__/StoreSearchRow.test.tsx --selectProjects Frontend` | ✅ | ✅ green (10/10) |
| 20-06-01 | 06 | 4 | STORESEARCH-02 | T-20-04 | `useDebouncedStoreSearch` — 400ms debounce, min-3-char gate, generation-counter cross-IPC cancel (no AbortController) | unit | `npx jest src/frontend/screens/StoreSearch/__tests__/useDebouncedStoreSearch.test.ts --selectProjects Frontend` | ✅ | ✅ green (6/6) |
| 20-06-02 | 06 | 4 | STORESEARCH-01, STORESEARCH-02, STORESEARCH-05, STORESEARCH-06, STORESEARCH-08 | T-20-03 | `StoreSearch` container — badge-once `useMemo`, three fail-soft states (prompt/no-results/error), sidebar entry + `/store-search` route, D-05 library-source grep (sideloadedLibrary/zoom excluded) | component (DOM-less hook harness) | `npx jest src/frontend/screens/StoreSearch/__tests__/StoreSearchScreen.test.tsx --selectProjects Frontend` | ✅ | ✅ green (4/4) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Full-suite gate (this plan, Task 1):** `pnpm test` — 66 test suites, 1194 tests, all green (0 failures). `npm run codecheck` (tsc --noEmit) exits 0.

---

## Wave 0 Requirements

- [x] `src/backend/__tests__/titleMatch.test.ts` — stubs for STORESEARCH-05/06 (shared matcher)
- [x] `src/backend/discounts/__tests__/storeSearchBadges.test.ts` — stubs for STORESEARCH-05/06 (ownership resolver)
- [x] `src/backend/storeSearch/__tests__/cheapshark.test.ts` — stubs for STORESEARCH-01/03/04/07 (adapter + dealID double-encoding regression)
- [x] `src/backend/__tests__/storeMapping.test.ts` — stubs for STORESEARCH-01/03/04 (storeID→Runner mapping)
- [x] `src/frontend/screens/StoreSearch/__tests__/formatUsdPrice.test.ts` — stubs for STORESEARCH-04 (price/badge-copy helpers)
- [x] `src/frontend/screens/StoreSearch/__tests__/StoreSearchRow.test.tsx` — stubs for STORESEARCH-03/04/07 (row/breakdown components)
- [x] `src/frontend/screens/StoreSearch/__tests__/useDebouncedStoreSearch.test.ts` — stubs for STORESEARCH-02 (debounce hook)
- [x] `src/frontend/screens/StoreSearch/__tests__/StoreSearchScreen.test.tsx` — stubs for STORESEARCH-01/02/05/06/08 (container + fail-soft states)

All eight Wave 0 test files exist and are green as of this plan's full-suite gate (Task 1).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live CheapShark search returns priced rows with correct "$X USD" labels for a real query | STORESEARCH-01, STORESEARCH-04 | Unit tests mock `axios`; only a live run confirms the real CheapShark response shape maps correctly end-to-end (RESEARCH Validation Architecture rationale) | 20-07-PLAN.md Task 2, steps 1-4 |
| Sidebar entry placement and prompt/min-3-char gate visible in the running app | STORESEARCH-01, STORESEARCH-02, STORESEARCH-08 | Requires visual/DOM rendering in a real browser-like environment; project has no jsdom, so component tests use a DOM-less hook harness that cannot verify actual visual placement/behavior | 20-07-PLAN.md Task 2, steps 1-3 |
| Store-attributed ownership badge fires correctly for the user's real Steam/GOG/Epic/Amazon library and coexists with a real Humble "Key available" pill | STORESEARCH-05, STORESEARCH-06 | The headline feature — needs the user's actual owned library and actual Humble key data, not fixtures; also the exact Steam-attribution-no-false-positive guarantee (T-20-03) is only provable against real data | 20-07-PLAN.md Task 2, steps 4-5 |
| Expand-to-breakdown live network fetch, mapped-store runner icons vs unmapped text-only stores | STORESEARCH-03 | Requires a real `/games?id=` response shape and real store icon rendering | 20-07-PLAN.md Task 2, step 6 |
| Clicking a per-store deal opens the correct store in the external browser (no 404) — the dealID-verbatim redirect | STORESEARCH-07 | This is exactly the live-testing-catches-what-unit-tests-can't case (RESEARCH Pitfall 1) — only a real CheapShark redirect + real external browser proves the correct store opens | 20-07-PLAN.md Task 2, step 7 |
| Inline retryable error banner on a real provider failure (network disconnect / blocked host), and recovery via Retry | STORESEARCH-08 | Requires actually inducing a live network failure against `www.cheapshark.com`, not a mocked rejection | 20-07-PLAN.md Task 2, step 8 |
| No-results state on a real zero-match live query | STORESEARCH-08 | Requires a real CheapShark response with zero matches, not a fixture | 20-07-PLAN.md Task 2, step 9 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 6s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — awaiting live human verification (20-07 Task 2)
</content>
