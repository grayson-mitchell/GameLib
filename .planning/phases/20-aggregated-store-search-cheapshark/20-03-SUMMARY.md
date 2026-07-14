---
phase: 20-aggregated-store-search-cheapshark
plan: 03
subsystem: discounts
tags: [ownership-resolver, fuzzy-match, steam, gog, legendary, nile, humble-keys, jest]

# Dependency graph
requires:
  - phase: 20-01
    provides: "Shared fuzzy title matcher (fuzzyMatch/titleSimilarity/isDlcFalsePositiveRisk/HUMBLE_FUZZY_MATCH_THRESHOLD) in src/common/matching/titleMatch.ts"
provides:
  - "resolveStoreSearchBadges() — pure, store-attributed, multi-badge ownership resolver for the aggregated store-search surface"
  - "StoreOwnershipMatch type (store: 'steam'|'gog'|'legendary'|'nile', confidence: 'exact'|'fuzzy')"
  - "storeSearchBadges.test.ts unit coverage (exact-Steam, fuzzy-others, DLC guard, key coexistence, deterministic ordering)"
affects: [20-04, 20-05, store-search-ui, discounts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "New sibling export added to an existing pure resolver file (common/discounts/badges.ts) rather than forking a new module — keeps Phase 15's resolveDiscountBadge byte-for-byte unchanged while reusing its steamAppId falsy-guard idiom"
    - "Store-attribution via a fixed-order array iteration ([gog, legendary, nile]) pushing into a shared owned[] accumulator, guaranteeing deterministic D-06 output ordering"

key-files:
  created:
    - src/backend/discounts/__tests__/storeSearchBadges.test.ts
  modified:
    - src/common/discounts/badges.ts

key-decisions:
  - "Steam ownership resolved by EXACT steamAppId === app_name join only — fuzzyMatch is never called against the Steam library, per D-01 (mitigates T-20-03 false-badge spoofing risk)"
  - "GOG/Epic('legendary')/Amazon('nile') ownership resolved via the Plan 01 shared fuzzyMatch (85% threshold + DLC guard), imported from common/matching/titleMatch.ts rather than reimplemented"
  - "keyAvailable is computed independently of owned and never suppressed by an ownership match (D-07) — departs from resolveDiscountBadge's single-badge 'Owned wins' contract, which does not apply to this resolver"
  - "owned[] entries pushed in fixed order Steam, GOG, Epic(legendary), Amazon(nile) (D-06) so downstream UI cap/overflow rendering is deterministic"

patterns-established:
  - "Extend, never fork: new resolver added beside resolveDiscountBadge/buildDiscountBadgeMaps in the same file, with a header comment citing the specific decision IDs it departs on"

requirements-completed: [STORESEARCH-05, STORESEARCH-06]

# Metrics
duration: ~15min
completed: 2026-07-14
---

# Phase 20 Plan 03: Store-Search Ownership Badge Resolver Summary

**New `resolveStoreSearchBadges()` in `common/discounts/badges.ts` resolves multi-store, store-attributed ownership (exact Steam AppID join + shared 85% fuzzy match for GOG/Epic/Amazon) with an independently-computed key-available signal, leaving Phase 15's `resolveDiscountBadge()` byte-for-byte untouched.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-14T09:52:46Z (approx, per STATE.md session continuity)
- **Completed:** 2026-07-14T09:56:42Z
- **Tasks:** 1
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments
- Added `StoreOwnershipMatch` type and `resolveStoreSearchBadges()` export to `src/common/discounts/badges.ts`, importing `fuzzyMatch` from `../matching/titleMatch` (Plan 01's shared matcher)
- Steam branch is a strict exact-ID join (`libraries.steam.some((g) => g.app_name === result.steamAppId)`) gated by the three-way falsy guard (`!== undefined && !== '' && !== '0'`) — no `fuzzyMatch` call anywhere in the Steam path
- GOG/Epic/Amazon branch iterates a fixed-order array and attributes matches to `'gog' | 'legendary' | 'nile'` respectively, preserving D-06's deterministic Steam→GOG→Epic→Amazon ordering in the output array
- `keyAvailable` computed independently: true on an exact falsy-guarded Steam-AppID key match OR a fuzzy title match against any waiting key — coexists with `owned` per D-07, never suppressed
- 15 new unit tests in `storeSearchBadges.test.ts` covering all 8 behaviors from the plan's `<behavior>` block plus extra edge cases (empty-owned/no-key-available baseline, multi-store ordering)
- `resolveDiscountBadge`/`buildDiscountBadgeMaps` left completely unmodified; existing `badges.test.ts` (17 tests) still green

## Task Commits

Each task was committed atomically:

1. **Task 1: Add resolveStoreSearchBadges() to badges.ts; write the unit suite** - `9bda81a4` (feat)

**Plan metadata:** (this commit, docs)

## Files Created/Modified
- `src/common/discounts/badges.ts` - Added `import { fuzzyMatch } from '../matching/titleMatch'`, new `StoreOwnershipMatch` interface, and `resolveStoreSearchBadges()` function (exact Steam join + fuzzy GOG/Epic/Amazon + independent key-available signal); `resolveDiscountBadge`/`buildDiscountBadgeMaps` unchanged
- `src/backend/discounts/__tests__/storeSearchBadges.test.ts` - New unit test file, mirroring `badges.test.ts`'s fixture-builder style, asserting exact-Steam-only, fuzzy-others-with-store-attribution, DLC false-positive guard, falsy-guard values on both `result.steamAppId` and `key.steamAppId`, key/ownership coexistence, and deterministic multi-store ordering

## Decisions Made
- Applied the three-way falsy guard (`!== undefined && !== '' && !== '0'`) to BOTH `result.steamAppId` (before the Steam library join, and before the exact-key comparison in `keyAvailable`) and `k.steamAppId` (the waiting-key side) — the plan's interface sketch used a looser `result.steamAppId &&` truthiness check in one spot, which would incorrectly treat a literal `'0'` AppID as usable; the full three-way guard from `resolveDiscountBadge` was applied consistently instead, per T-20-03's mitigation requirement.
- No architectural changes; plan executed as specified.

## Deviations from Plan

None - plan executed exactly as written. The one implementation refinement (applying the full three-way falsy guard to `result.steamAppId`, not just a truthiness check) is not a deviation — it is the plan's own stated mitigation for T-20-03, made explicit in code where the `<interfaces>` sketch had abbreviated it.

## Issues Encountered

Initial `npx jest src/backend/discounts --selectProjects backend` (as literally specified in the plan's `<verify>` block) returned "no projects found" because the backend jest project's `displayName` is `Backend` (capitalized), not `backend`. Re-ran with `--selectProjects Backend`; both `badges.test.ts` (17 tests) and `storeSearchBadges.test.ts` (15 tests) pass, 32/32 total. `tsc --noEmit`, `eslint`, and `prettier --check` all clean on the touched files.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `resolveStoreSearchBadges()` is ready to be consumed by the store-search container (later plan in this phase) via the same `useMemo`-computed-once-in-container pattern `resolveDiscountBadge` already establishes
- The `StoreOwnershipMatch[]` return shape gives the UI everything it needs to render "Owned on GOG"-style attribution and D-06 cap/overflow ("+N more") without recomputation
- No blockers for downstream plans (20-04/20-05 UI wiring)

---
*Phase: 20-aggregated-store-search-cheapshark*
*Completed: 2026-07-14*

## Self-Check: PASSED

- FOUND: src/common/discounts/badges.ts
- FOUND: src/backend/discounts/__tests__/storeSearchBadges.test.ts
- FOUND: .planning/phases/20-aggregated-store-search-cheapshark/20-03-SUMMARY.md
- FOUND commit: 9bda81a4
- FOUND commit: 84586533
