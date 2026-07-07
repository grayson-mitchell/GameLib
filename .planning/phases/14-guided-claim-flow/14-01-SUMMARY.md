---
phase: 14-guided-claim-flow
plan: 01
subsystem: backend
tags: [typescript, electron-store, ipc, jest, humble]

# Dependency graph
requires:
  - phase: 12-ownership-dedup
    provides: recomputeOwnership two-tier Steam ownership matcher (dedup.ts), HumbleKey.steamAppId/ownedElsewhere/matchConfidence fields
provides:
  - RevealOutcome/RedeemOutcome discriminated unions + ClaimAnnotation type (src/common/types/humble.ts)
  - 5 new humble IPC channel signatures (humbleRevealKey, humbleMarkRedeemed, humbleUndoRedeemed, humbleGetRevealedKeyValue, humbleGetClaimAnnotations)
  - HUMBLE_REDEEM_PATH constant + HUMBLE_CLASSIFIER_VERSION bumped 3 -> 4
  - humbleAuditStore + humbleLocalRedeemedStore composite-keyed (gamekey:machineName), disconnect-exempt CacheStores
  - HumbleKeyInternal/HumbleOrderCacheEntryInternal internal-only typing carrying revealedKeyValue/keyindex on humbleLibraryStore (D-74, no new secret-surface store)
  - D-71/WR-01 dedup fix: falsy steamAppId ('' or '0') now falls through to the fuzzy match tier
affects: [14-02-plan, 14-03-plan, 14-04-plan, 14-wizard-ui-plans]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composite-key discipline: gamekey:machineName string constructed by the caller (library.ts), stores treat it as an opaque string key"
    - "Internal-only cache-record typing (HumbleKeyInternal) rides an existing store rather than creating a new secret-surface store class (D-74)"

key-files:
  created: []
  modified:
    - src/common/types/humble.ts
    - src/common/types/ipc.ts
    - src/backend/humble/constants.ts
    - src/backend/humble/electronStores.ts
    - src/backend/humble/__tests__/electronStores.test.ts
    - src/backend/humble/dedup.ts
    - src/backend/humble/__tests__/dedup.test.ts

key-decisions:
  - "D-74 internal typing implemented as HumbleKeyInternal = HumbleKey & { keyindex?, revealedKeyValue? } riding the existing humbleLibraryStore, not a new store"
  - "WR-01 fix uses an explicit absent-or-falsy check (steamAppId !== undefined && !== '' && !== '0'), not a bare truthiness check, because the string '0' is truthy in JavaScript and a plain `if (key.steamAppId)` would not have fixed the '0' case"

patterns-established:
  - "Reveal/redeem outcome types use the same status-literal-discriminant convention as AdapterResult — never a boolean flag"

requirements-completed: [HCLAIM-01, HCLAIM-02, HCLAIM-04]

# Metrics
duration: 4min
completed: 2026-07-08
---

# Phase 14 Plan 01: Guided Claim Flow Foundation Summary

**Type/IPC/constant scaffolding for the guided claim flow plus the D-71/WR-01 dedup fix, with a corrected falsy-string check the plan's own literal suggestion would have missed**

## Performance

- **Duration:** ~4 min
- **Tasks:** 3 completed
- **Files modified:** 6

## Accomplishments
- Declared `RevealOutcome`/`RedeemOutcome` discriminated unions and `ClaimAnnotation` type, plus 5 new IPC channel signatures, all using composite `{ gamekey, machineName }` params (not machineName-only like older channels)
- Added two disconnect-surviving composite-keyed stores (`humbleAuditStore`, `humbleLocalRedeemedStore`) and D-74 internal-only typing (`HumbleKeyInternal`/`HumbleOrderCacheEntryInternal`) that lets the revealed key value and keyindex ride the existing `humbleLibraryStore` cache entries without a new secret-surface store class
- Fixed the WR-01 dedup bug: a falsy-but-present `steamAppId` ('' or '0') now correctly falls through to the fuzzy match tier instead of silently short-circuiting ownership matching

## Task Commits

Each task was committed atomically:

1. **Task 1: Declare reveal/redeem result types, IPC signatures, and constants** - `3e87daca` (feat)
2. **Task 2: Add two composite-keyed disconnect-surviving stores + D-74 internal cache-record typing** - `935aafb3` (test, RED) → `db9cde7e` (feat, GREEN)
3. **Task 3: Fix WR-01 falsy steam_app_id in dedup ownership matching** - `cf5cbd08` (test, RED) → `5aa28775` (fix, GREEN)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — orchestrator handles final metadata commit after merge)

## Files Created/Modified
- `src/common/types/humble.ts` - Added `RevealOutcome`, `RedeemOutcome`, `ClaimAnnotation` types; added `locallyRedeemedPending?: boolean` to `HumbleKey`
- `src/common/types/ipc.ts` - Added `humbleRevealKey`, `humbleMarkRedeemed`, `humbleUndoRedeemed`, `humbleGetRevealedKeyValue`, `humbleGetClaimAnnotations` to `AsyncIPCFunctions`
- `src/backend/humble/constants.ts` - Added `HUMBLE_REDEEM_PATH`; bumped `HUMBLE_CLASSIFIER_VERSION` 3 → 4
- `src/backend/humble/electronStores.ts` - Added `humbleAuditStore`, `humbleLocalRedeemedStore` (both disconnect-exempt); added `HumbleKeyInternal`/`HumbleOrderCacheEntryInternal` types; re-typed `humbleLibraryStore`'s CacheStore generic
- `src/backend/humble/__tests__/electronStores.test.ts` - Added composite-key round-trip, WR-01 non-collision, disconnect-survival, and internal-field round-trip tests for the two new stores and the internal typing
- `src/backend/humble/dedup.ts` - Fixed the `steamAppId !== undefined` branch guard to correctly exclude falsy values ('', '0')
- `src/backend/humble/__tests__/dedup.test.ts` - Added falsy-steamAppId fuzzy-fallback tests and exact-match/undefined regression tests

## Decisions Made
- D-74 internal typing implemented inline in `electronStores.ts` (not `humble.ts`) since it is backend-only and must never leak to the renderer-facing `HumbleKey` type
- `AuditRecord` defined inline in `electronStores.ts` next to `humbleAuditStore` (plan allowed either location)
- WR-01 fix corrected to an explicit `!== undefined && !== '' && !== '0'` check rather than the plan's literal `if (key.steamAppId)` suggestion (see Deviations below)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's literal WR-01 fix suggestion does not actually fix the '0' case**
- **Found during:** Task 3 (Fix WR-01 falsy steam_app_id in dedup ownership matching)
- **Issue:** The plan's `<action>` text instructed replacing the guard with a plain truthiness check (`if (key.steamAppId)`), asserting this would treat `''`, `'0'`, and `undefined` all as absent. This is incorrect: in JavaScript, the string `'0'` is truthy (`Boolean('0') === true`) — only `''` is falsy. A literal truthiness check would have fixed the `''` case but left the `'0'` case broken, which the plan's own `<behavior>` block and acceptance criteria explicitly require to pass.
- **Fix:** Implemented an explicit check — `key.steamAppId !== undefined && key.steamAppId !== '' && key.steamAppId !== '0'` — that correctly excludes both falsy-string variants from the exact-match branch, verified by the RED test failing under a literal truthiness implementation and passing under the explicit check.
- **Files modified:** `src/backend/humble/dedup.ts`
- **Verification:** `pnpm jest src/backend/humble/__tests__/dedup.test.ts` — 26/26 pass, including both the `''` and `'0'` falsy cases and the exact-match/undefined regression cases
- **Committed in:** `5aa28775`

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** Necessary correctness fix — the plan's stated behavior spec (falsy '0' must fuzzy-match) could not be satisfied by its own literal code suggestion. No scope creep; acceptance criteria (WR-01 tag present, tests green) still met.

## Issues Encountered
None beyond the deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Downstream Phase 14 plans (adapter, library orchestration, IPC handlers, wizard UI) can now consume `RevealOutcome`/`RedeemOutcome`/`ClaimAnnotation`, the 5 new IPC signatures, `HUMBLE_REDEEM_PATH`, `HUMBLE_CLASSIFIER_VERSION === 4`, `humbleAuditStore`/`humbleLocalRedeemedStore`, and `HumbleKeyInternal`/`HumbleOrderCacheEntryInternal` without further codebase exploration.
- No blockers. `pnpm codecheck` exits 0; `pnpm jest src/backend/humble` — 314/314 tests pass (11 suites).

---
*Phase: 14-guided-claim-flow*
*Completed: 2026-07-08*

## Self-Check: PASSED

All created/modified files verified present on disk; all 6 task commits + this summary commit verified present in git log.
