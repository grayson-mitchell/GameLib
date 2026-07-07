---
phase: 13-keys-waiting-giftable-spares-views
plan: 05
subsystem: ui
tags: [humble, react-router, jest, human-verification, uat]

# Dependency graph
requires:
  - phase: 13-keys-waiting-giftable-spares-views (plans 01-04)
    provides: viewFilters/urgencyBadge helpers, gifted-at IPC, three-tab Keys surface, Giftable-Spares view
provides:
  - Human sign-off on HVIEW-01 (Keys waiting) and HVIEW-02 (Giftable spares) in the running app on a real Humble account
  - Checkpoint-feedback fix — selectKeysWaiting scoped to game keys only (generic platform excluded)
  - Confirmed route paths for Phase 14's C2 redirect dependency
affects: [phase-14, humble-keys]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/common/humble/viewFilters.ts
    - src/backend/humble/__tests__/viewFilters.test.ts

key-decisions:
  - "Keys waiting is game-keys-only: generic-platform (PDF/ebook/publisher) entries are excluded via the shared GENERIC_KEY_PLATFORM constant; they remain in All keys under Other (checkpoint feedback, D-53 scope narrowed)"

patterns-established: []

requirements-completed: [HVIEW-01, HVIEW-02]

# Metrics
duration: ~30min (gate + checkpoint fix + human verification)
completed: 2026-07-07
---

# Plan 13-05: Human Verification Summary

**Human sign-off on the three-tab Humble Keys surface after a checkpoint-feedback fix scoping Keys waiting to game keys only; badge-color check deferred pending keys near expiry**

## Performance

- **Duration:** ~30 min across gate, fix, and human verification
- **Completed:** 2026-07-07
- **Tasks:** 2/2
- **Files modified:** 2 (checkpoint-feedback fix)

## Accomplishments
- Pre-checkpoint automated gate green: `pnpm codecheck` exit 0, `pnpm test` 616/616 tests across 36 suites (viewFilters, urgencyBadge, and humbleGiftedAtStore disconnect-survival suites all passing)
- Human verified the three-tab surface on a real connected Humble account and approved: default-tab routing, Giftable-spares membership + blurb + fuzzy safety valve, gift confirm dialog + external open + gifted annotation, All-keys no-regression, deep links and back/forward
- Checkpoint feedback applied: Keys waiting now shows game keys only

## Task Commits

1. **Task 1: Pre-checkpoint automated gate** — no commit (read-only verification)
2. **Task 2: Human-verify checkpoint** — `5937925b` (fix: exclude generic-platform keys from Keys waiting, checkpoint feedback)

## Files Created/Modified
- `src/common/humble/viewFilters.ts` — `selectKeysWaiting` excludes `GENERIC_KEY_PLATFORM` keys; D-53 doc comment scoped to game keys
- `src/backend/humble/__tests__/viewFilters.test.ts` — exclusion tests for generic-platform keys in all three waiting states + non-generic control

## Decisions Made
- Keys waiting membership narrowed to game keys only (user checkpoint feedback). Generic-platform entries stay in the All tab's collapsed "Other" bucket — display partition unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Checkpoint feedback] Generic-platform keys leaked into Keys waiting**
- **Found during:** Task 2 (human-verify checkpoint)
- **Issue:** `selectKeysWaiting` filtered only on ownership + waiting state, so PDF/ebook/publisher ("generic") keys appeared in a view meant for claimable game keys
- **Fix:** Exclusion via the shared `GENERIC_KEY_PLATFORM` constant from `groupKeys.ts`; tab count self-corrected (derives from `selectKeysWaiting`)
- **Files modified:** src/common/humble/viewFilters.ts, src/backend/humble/__tests__/viewFilters.test.ts
- **Verification:** New jest cases (616/616 passing), human re-checked the running app before approving
- **Committed in:** `5937925b`

---

**Total deviations:** 1 (checkpoint feedback fix)
**Impact on plan:** Membership rule corrected before sign-off. No scope creep.

## Issues Encountered
None beyond the checkpoint feedback above.

## Outstanding Human Verification

**Urgency badge colors (step 3, partial):** the ≤7-day red badge and 8–30-day orange badge could not be observed — the user's account currently has no keys close enough to expiry. Deferred, tracked in `13-HUMAN-UAT.md`. Pure-helper tier logic is covered by `urgencyBadge.test.ts`; only the visual rendering on real data remains.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- HVIEW-01 and HVIEW-02 approved on a real account; `/humble-keys/spares` route confirmed for Phase 14's C2 redirect dependency
- One deferred visual check (badge colors near expiry) tracked as pending UAT

---
*Phase: 13-keys-waiting-giftable-spares-views*
*Completed: 2026-07-07*
