---
phase: 15-store-overlay-expiration-alerts
plan: 04
subsystem: ui
tags: [react, humble, urgency, keys-waiting, i18n]

# Dependency graph
requires:
  - phase: 13-keys-waiting-giftable-spares-views
    provides: selectKeysWaiting (D-53) and the getUrgencyTier/getUrgencyCountdownParts urgency helpers (D-61/D-62/D-63) this plan reuses unchanged
provides:
  - partitionWaitingByUrgency pure helper (common/humble/viewFilters.ts) splitting a waiting-keys array into { pinned, rest } by urgency-tier membership
  - Pinned "Expiring soon" section rendered at the top of the Humble Keys-waiting view, static heading, hidden when empty
affects: [15-store-overlay-expiration-alerts other plans (badges/notifications), any future Keys-waiting view changes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-pass partition helper (pinned/rest) guarantees disjoint, order-preserving membership — avoids the double-filter drift risk called out in D-88"
    - "Shared renderKeyRow() closure extracted in the view component so both the pinned section and the normal list reuse identical row JSX/props"

key-files:
  created: []
  modified:
    - src/common/humble/viewFilters.ts
    - src/backend/humble/__tests__/viewFilters.test.ts
    - src/frontend/screens/Humble/Keys/Waiting/index.tsx
    - src/frontend/screens/Humble/Keys/index.css
    - public/locales/en/translation.json

key-decisions:
  - "partitionWaitingByUrgency delegates entirely to the existing getUrgencyTier — zero new threshold literals (D-87)"
  - "Pinned heading is a static <div>, not a <button> — no chevron/aria-expanded/onClick, deliberately deviating from the collapsible HumbleKeyGroup pattern per UI-SPEC"
  - "Empty state ('You're all caught up') only renders when both pinned and rest are empty; a non-empty pinned section with an empty rest list renders no flat-list placeholder"

patterns-established:
  - "Pure view-partition helpers stay in common/humble/ (no React/i18n/I/O) so they're unit-testable from the backend jest project, matching viewFilters.ts's existing convention"

requirements-completed: [HSTORE-03]

# Metrics
duration: 25min
completed: 2026-07-09
---

# Phase 15 Plan 04: Pinned Expiring-Soon Section Summary

**Pure `partitionWaitingByUrgency` helper (TDD) plus a static, non-collapsible "Expiring soon" section pinned above the Keys-waiting list, reusing Phase 13's urgency thresholds and HumbleKeyRow/UrgencyBadge unchanged.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-09T19:51:00Z
- **Completed:** 2026-07-09T20:16:27Z
- **Tasks:** 2 completed
- **Files modified:** 5

## Accomplishments
- Added a single-pass, unit-tested `partitionWaitingByUrgency` helper that splits `selectKeysWaiting` output into `{ pinned, rest }` by urgency-tier membership (D-87), with no new threshold logic
- Wired the Keys-waiting view to render a pinned "Expiring soon" section (static heading + count, no collapse affordance) above the existing flat list, hidden entirely when no keys are in the urgency window (D-89)
- Guaranteed move-not-duplicate semantics (D-88) via the single-pass partition and a shared `renderKeyRow` closure reused by both sections

## Task Commits

Each task was committed atomically (TDD RED→GREEN for Task 1):

1. **Task 1: Pure partitionWaitingByUrgency helper + test extension** - `e9de5eab` (test, RED) → `5d1a6f99` (feat, GREEN)
2. **Task 2: Pinned "Expiring soon" section render + i18n** - `a9bfd135` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `src/common/humble/viewFilters.ts` - Added `partitionWaitingByUrgency(waiting)` single-pass helper delegating to `getUrgencyTier`
- `src/backend/humble/__tests__/viewFilters.test.ts` - Added `describe('partitionWaitingByUrgency')` covering membership, disjoint union/order preservation, empty-window case, and 7/30-day boundaries
- `src/frontend/screens/Humble/Keys/Waiting/index.tsx` - Partitions `selectKeysWaiting` output; renders the pinned section (static heading) above the `rest` list; extracted `renderKeyRow` shared by both
- `src/frontend/screens/Humble/Keys/index.css` - Added `.humbleKeyGroupHeading--static` (resets cursor for the non-interactive heading) and `.humbleKeysPinnedSection` (`--space-md` gap per UI-SPEC)
- `public/locales/en/translation.json` - Added `humbleKeys.expiringSoon: "Expiring soon"` (inserted directly, not via full `pnpm i18n` scan — see Deviations)

## Decisions Made
- Reused `.humbleKeyGroupHeading`/`.humbleKeyGroupLabel`/`.humbleKeyGroupCount` chrome verbatim for the pinned heading, adding only a `--static` modifier class to reset `cursor: pointer` (the base class assumes a `<button>`) — no new visual language introduced, matching the UI-SPEC Component Inventory contract.
- Empty-state gating: `rest.length > 0 ? <ul>… : pinned.length === 0 ? <emptyState> : null`. This ensures the "You're all caught up" copy never shows when the pinned section alone has content (i.e., all remaining waiting keys are urgent) — the plan's D-89 language protects the pinned section from a false empty state, but by construction this same guard also protects the empty-state message from firing incorrectly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] i18n key added by direct edit instead of `pnpm i18n` scan**
- **Found during:** Task 2
- **Issue:** Running `pnpm i18n` (as the plan's action step instructs) triggered the project's pre-existing locale-key orphan drift (documented in STATE.md Blockers/Concerns: "~141 files fail prettier --check", "locale files have orphaned-key drift") — the scanner removed 16 unrelated keys and reordered/renamed several others, none of which were caused by this plan's changes.
- **Fix:** Reverted the full-scan diff and instead hand-inserted `"expiringSoon": "Expiring soon"` at the correct alphabetical position inside the existing `humbleKeys` object, verified via `grep` that only the intended key was added.
- **Files modified:** public/locales/en/translation.json
- **Verification:** `grep -n "humbleKeys.expiringSoon" public/locales/en/translation.json` confirms the key exists; `git diff --stat` confirms only 1 line added, no unrelated removals.
- **Committed in:** a9bfd135 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed unclosed ternary in the empty-state render branch**
- **Found during:** Task 2 (self-review before verification)
- **Issue:** The `rest.length > 0 ? (...) : pinned.length === 0 ? (...)` conditional was missing a final `: null` else-branch, which would have been a JSX syntax error (an unresolvable ternary) for the case where `rest.length === 0 && pinned.length > 0`.
- **Fix:** Added `: null` to close the ternary.
- **Files modified:** src/frontend/screens/Humble/Keys/Waiting/index.tsx
- **Verification:** `pnpm codecheck` (tsc --noEmit) passes clean.
- **Committed in:** a9bfd135 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking-workaround, 1 bug)
**Impact on plan:** Both necessary for correctness; no scope creep. The i18n deviation deliberately avoided pulling ~141-file-wide pre-existing repo debt into this plan's commit.

## Issues Encountered

- **Acceptance-criteria grep count note:** Task 2's acceptance criteria states `grep -c "partitionWaitingByUrgency" src/frontend/screens/Humble/Keys/Waiting/index.tsx` should equal `1`. In practice this identifier necessarily appears on two lines (the import statement and the destructuring usage) — an unavoidable minimum for any non-duplicated single-import/single-use pattern. Verified instead: exactly one `import` of the helper (no duplicate imports) and exactly one call site. Functional intent of the criterion (no duplication) is satisfied; the literal count is 2, not 1.
- **Pre-existing prettier drift:** running `prettier --write` on `viewFilters.test.ts` (to format this plan's new test block) also reformatted one pre-existing `test.each(...)` call earlier in the file (multi-line → single-line). This is a no-op formatting change with no behavior difference; included in the Task 2 commit since it touched a file already modified by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `partitionWaitingByUrgency` is available for reuse by any future surface needing the same pinned/rest split (e.g., a future badge or digest feature in this same phase).
- The pinned section and its CSS/i18n are fully wired and verified (`pnpm codecheck` clean, `npx eslint` clean on all touched files, 35/35 `viewFilters.test.ts` tests passing, 444/444 backend Humble tests passing).
- Manual human-check (real account, at least one key expiring within 30 days) from the plan's Task 2 verification step was not performed in this automated execution — recommend a live UAT pass alongside this phase's other plans before Phase 15 close-out.

---
*Phase: 15-store-overlay-expiration-alerts*
*Completed: 2026-07-09*

## Self-Check: PASSED

All created/modified files confirmed present on disk; all 3 task commit hashes (e9de5eab, 5d1a6f99, a9bfd135) confirmed in git log.
