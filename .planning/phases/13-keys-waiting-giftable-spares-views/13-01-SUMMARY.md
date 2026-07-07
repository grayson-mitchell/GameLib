---
phase: 13-keys-waiting-giftable-spares-views
plan: 01
subsystem: ui
tags: [typescript, jest, tdd, pure-functions, humble]

# Dependency graph
requires:
  - phase: 12-ownership-dedup
    provides: HumbleKey.ownedElsewhere/matchConfidence fields consumed by selectKeysWaiting/selectGiftableSpares
  - phase: 11-humble-keys-page
    provides: HumbleKeyState 5-state model, groupKeys.ts/expirationDisplay.ts style precedent
provides:
  - "selectKeysWaiting(keys) — D-53 membership + D-56 sort, pure function over HumbleKey[]"
  - "selectGiftableSpares(keys) — D-54/D-55 membership, pure function over HumbleKey[]"
  - "getUrgencyTier(state, expiration, now) — D-61/D-63 tier decision"
  - "getUrgencyCountdownParts(expiration, now) — D-62 hours/days countdown copy parts"
affects: [13-02, 13-03, 13-04, 13-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure predicate/comparator helpers over HumbleKey[] in common/humble/, zero React/i18n/I/O, unit-tested from backend jest project (same tier as groupKeys.ts/expirationDisplay.ts)"
    - "Discriminated-union return types for pure display-decision functions (UrgencyCountdownParts mirrors HumbleExpirationDisplay's kind-tagged shape)"

key-files:
  created:
    - src/common/humble/viewFilters.ts
    - src/common/humble/urgencyBadge.ts
    - src/backend/humble/__tests__/viewFilters.test.ts
    - src/backend/humble/__tests__/urgencyBadge.test.ts
  modified: []

key-decisions:
  - "getUrgencyCountdownParts returns { kind: 'none' } (not null) for the blank case, matching expirationDisplay.ts's discriminated-kind convention rather than a bare null return"
  - "getUrgencyCountdownParts is independent of getUrgencyTier's state-eligibility gating — it only does date math, so the caller (frontend UrgencyBadge, later plan) is responsible for not rendering countdown copy when tier is null"

patterns-established:
  - "Pattern 2 from RESEARCH.md (pure predicate/comparator helper) confirmed and extended: WAITING_STATES as an exported Set<HumbleKeyState> constant, same convention as groupKeys.ts's GROUP_ORDER"

requirements-completed: [HVIEW-01, HVIEW-02]

# Metrics
duration: 6min
completed: 2026-07-07
---

# Phase 13 Plan 01: View-Logic Foundation Summary

**Pure, unit-tested selectKeysWaiting/selectGiftableSpares membership+sort helpers and getUrgencyTier/getUrgencyCountdownParts tier+countdown helpers — the foundation both frontend tabs (Plans 03/04) and the urgency badge import.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-07T19:15:00+12:00 (approx, first commit)
- **Completed:** 2026-07-07T19:19:36+12:00
- **Tasks:** 2 completed (both TDD: RED → GREEN)
- **Files modified:** 4 (all new)

## Accomplishments
- `selectKeysWaiting`/`selectGiftableSpares` implement D-53/D-54/D-55/D-56 membership and sort rules as pure functions, unit-tested with 22 passing test cases covering every state × ownership combination, the fuzzy-match irrelevance rule, and all three sort-ordering scenarios (dated-before-undated, soonest-first, alphabetical tiebreak).
- `getUrgencyTier`/`getUrgencyCountdownParts` implement D-61/D-62/D-63 tier and countdown-copy rules as pure functions, unit-tested with 21 passing test cases covering both tier boundaries (7-day, 30-day), the REDEEMED/UNREDEEMABLE never-badge rule, null/past-expiration handling, and the 24h hours-vs-days countdown split.
- Zero new gift-link field or `giftLink`/`gift_link`/`giftUrl` identifier introduced (research Pitfall 1 avoided).
- Zero "week" phrasing introduced in `urgencyBadge.ts` (UI-SPEC.md rejection honored).

## Task Commits

Each task was committed atomically following RED → GREEN TDD:

1. **Task 1: viewFilters.ts** — test `58cfb707` (test), impl `4df8328e` (feat)
2. **Task 2: urgencyBadge.ts** — test `c676984f` (test), impl `06ae6fd8` (feat)

**Plan metadata:** committed as part of this SUMMARY.md commit (worktree mode — orchestrator handles the final metadata commit sequencing).

_No REFACTOR commits were needed — both implementations were correct and clean on first GREEN pass._

## Files Created/Modified
- `src/common/humble/viewFilters.ts` - `selectKeysWaiting`/`selectGiftableSpares` pure predicates/comparator (D-53/54/55/56), exported `WAITING_STATES` constant
- `src/common/humble/urgencyBadge.ts` - `getUrgencyTier`/`getUrgencyCountdownParts` pure helpers (D-61/62/63), exported `UrgencyTier`/`UrgencyCountdownParts` types
- `src/backend/humble/__tests__/viewFilters.test.ts` - 22 test cases, `makeKey` fixture-builder copied from `groupKeys.test.ts` convention
- `src/backend/humble/__tests__/urgencyBadge.test.ts` - 21 test cases, table-driven boundary tests

## Decisions Made
- Modeled `getUrgencyCountdownParts`'s blank case as `{ kind: 'none' }` rather than a bare `null` return, to match the existing `HumbleExpirationDisplay` discriminated-union convention in `expirationDisplay.ts` (the plan left the exact "null/blank" shape to implementer discretion).
- Kept `getUrgencyCountdownParts` fully independent of `getUrgencyTier`'s `BADGE_ELIGIBLE_STATES` gate per the plan's explicit instruction ("Do NOT fold hour-math into `getUrgencyTier`") — the frontend caller (a later plan) is responsible for only invoking the countdown helper when `getUrgencyTier` is non-null.

## Deviations from Plan

None — plan executed exactly as written. Both pure helpers match the RESEARCH.md/13-PATTERNS.md drafted code nearly verbatim, with test coverage extended beyond the drafted examples to hit every acceptance-criteria line item explicitly (REVEALED+ownedElsewhere exclusion, dated-before-undated ordering, 7-day/30-day boundaries, REDEEMED never-badge case).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Zero new dependencies (confirmed by `13-RESEARCH.md`'s Package Legitimacy Audit: not applicable).

## Next Phase Readiness
- `selectKeysWaiting`, `selectGiftableSpares`, `getUrgencyTier`, `getUrgencyCountdownParts` are ready to import from `common/humble/viewFilters` and `common/humble/urgencyBadge` by Plans 02-05 (routing, Waiting/Spares/All tab components, `HumbleKeyRow`/`UrgencyBadge` extension).
- No blockers. `pnpm test` (targeted) and `pnpm codecheck`/`eslint` both exit 0 on the new files.

---
*Phase: 13-keys-waiting-giftable-spares-views*
*Completed: 2026-07-07*
