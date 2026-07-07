---
phase: 13-keys-waiting-giftable-spares-views
plan: 03
subsystem: frontend
tags: [react-router, humble, tab-navigation, urgency-badge, i18n]

# Dependency graph
requires:
  - phase: 13-01
    provides: selectKeysWaiting/selectGiftableSpares (common/humble/viewFilters.ts), getUrgencyTier/getUrgencyCountdownParts (common/humble/urgencyBadge.ts)
provides:
  - Nested humble-keys route table (/humble-keys/waiting, /humble-keys/spares, /humble-keys/all) — the locked route paths Phase 14's C2 guard depends on
  - Parent HumbleKeys shell (route guard + sync header + tab nav + Outlet + live counts)
  - HumbleKeysAll (verbatim D-21 grouped list, moved)
  - HumbleKeysWaiting (HVIEW-01 flat sorted list + blurb + empty state)
  - UrgencyBadge presentational component
  - HumbleKeyRow extended with optional urgencyTier/giftAction props
  - HumbleKeyGroup wired to compute+pass urgencyTier per row (D-63, All-keys coverage)
affects: [13-04 (Spares tab full implementation replaces this plan's compiling placeholder; gift action consumes the giftAction prop declared here), 14 (C2 guard consumes /humble-keys/spares)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Parent route + <Outlet/> tab shell: shared cross-cutting state (route guard, sync header) stays in the parent; each tab is its own lazy-loaded child route reading humble.keys from ContextProvider independently"
    - "Presentational badge component fed by a pure common/ helper (getUrgencyCountdownParts) mapped to locked i18n copy at the render layer, mirroring the existing getExpirationDisplay -> t() pattern"
    - "Additive prop pass-through into a D-21-locked component (HumbleKeyGroup): new caller-computed prop wired at the row-mapping call site only, zero changes to heading/collapse/ordering logic"

key-files:
  created:
    - src/frontend/screens/Humble/Keys/All/index.tsx
    - src/frontend/screens/Humble/Keys/Spares/index.tsx
    - src/frontend/screens/Humble/Keys/Waiting/index.tsx
    - src/frontend/screens/Humble/Keys/components/UrgencyBadge/index.tsx
  modified:
    - src/frontend/App.tsx
    - src/frontend/screens/Humble/Keys/index.tsx
    - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
    - src/frontend/screens/Humble/Keys/components/HumbleKeyGroup/index.tsx
    - src/frontend/screens/Humble/Keys/index.css
    - public/locales/en/translation.json

key-decisions:
  - "D-63 interpreted as literal: HumbleKeyGroup (the All-keys row renderer) computes getUrgencyTier per row and passes it to HumbleKeyRow, so an expiring owned-elsewhere+REVEALED key (D-55, All-keys-only) still badges somewhere"
  - "Rule 3 auto-fix: Task 1's route table references ./Waiting before Task 2 (same plan) creates it — added a minimal compiling placeholder in Task 1's commit, fully replaced in Task 2's commit, so pnpm codecheck stayed green between tasks"

requirements-completed: [HVIEW-01]

# Metrics
duration: 35min
completed: 2026-07-07
---

# Phase 13 Plan 03: Nested Tab Routes + Keys-Waiting + Urgency Badge Summary

**Three-tab real-sub-route shell (D-49/D-50/D-51) with the D-21 grouped list moved verbatim, HVIEW-01's flat sorted Keys-waiting list, and a shared urgency badge wired into all three tabs per D-63.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-07 (session start)
- **Completed:** 2026-07-07
- **Tasks:** 2
- **Files modified:** 10 (4 created, 6 modified)

## Accomplishments

- Replaced the flat `humble-keys` App.tsx route entry with a parent route + `children` array: an index redirect to `waiting` (D-50), and three real child paths `waiting` / `spares` / `all` (D-51) — the exact locked path segments Phase 14's C2 guard depends on.
- Moved the D-21 grouped-list render body (GROUP_ORDER.map + groupAndSortKeys + empty state) verbatim into new `All/index.tsx`, byte-for-byte, per Pitfall 4.
- Rewrote parent `Keys/index.tsx` to keep the D-20 route guard and the entire sync-status header (refresh button, spinner, last-synced text, fail-soft banner) rendered once, then added a tab bar of three `NavLink`s (`to="waiting"|"spares"|"all"`, active state via `var(--accent)`, inactive via `var(--text-secondary)`) and `<Outlet/>`. Live counts (`selectKeysWaiting`/`selectGiftableSpares` lengths) are computed in the parent and rendered in the waiting/spares tab labels only (D-52; All keys stays uncounted).
- Added a compiling `Spares/index.tsx` placeholder (header blurb + empty state only) so the nested route table resolves ahead of Plan 04's full gift-enabled view.
- Added `Waiting/index.tsx`: a single flat `<ul>` (no `HumbleKeyGroup`, per D-56) mapping `selectKeysWaiting(humble.keys)` to `HumbleKeyRow`s with the locked D-64 header blurb and locked empty state.
- Added `components/UrgencyBadge/index.tsx`: presentational, returns `null` when tier or expiration is null/none, otherwise renders `humbleUrgencyBadge--{tier}` with locked copy (`{{N}} days left` / `1 day left` / `{{H}}h left`) derived from `getUrgencyCountdownParts`.
- Extended `HumbleKeyRow`'s Props with optional `urgencyTier` (rendered via the new badge beside the existing state badge) and `giftAction` (declared now, unused until Plan 04) — the D-42 "Not the same game" override block is unchanged, still byte-identical.
- Wired `HumbleKeyGroup` (the All-keys row renderer) to compute `getUrgencyTier(key.state, key.expiration)` per row and pass it to `HumbleKeyRow` — a strictly additive one-line diff with zero changes to group heading/collapse/ordering logic (verified via `git diff`).
- Added `.humbleUrgencyBadge` CSS (copies `.humbleKeyStateBadge` chrome, `--danger`/`--warning` modifiers on `var(--status-danger)`/`var(--status-warning)`, no hex), tab-bar strip styles, and `.humbleKeysFlatList`.
- Added all new `humbleKeys.*` i18n keys (tab labels with counts, waiting/spares blurbs, waiting/spares empty states, urgency countdown copy) using the exact locked copy from 13-UI-SPEC.md.

## Task Commits

Each task was committed atomically:

1. **Task 1: Nested route table + parent shell + verbatim All-keys move** - `740aa933` (feat)
2. **Task 2: Keys-waiting view + UrgencyBadge + row/group urgency wiring (all 3 tabs, D-63) + CSS + i18n** - `a7472aa8` (feat)

**Plan metadata:** (this commit, added by orchestrator per worktree isolation policy — SUMMARY.md/REQUIREMENTS.md only)

## Files Created/Modified

- `src/frontend/App.tsx` - nested `humble-keys` route table (index redirect + waiting/spares/all children)
- `src/frontend/screens/Humble/Keys/index.tsx` - parent shell: guard + header + tab bar + counts + Outlet
- `src/frontend/screens/Humble/Keys/All/index.tsx` (new) - verbatim D-21 grouped list, moved
- `src/frontend/screens/Humble/Keys/Spares/index.tsx` (new) - compiling placeholder, replaced in Plan 04
- `src/frontend/screens/Humble/Keys/Waiting/index.tsx` (new) - HVIEW-01 flat sorted list + blurb + empty state
- `src/frontend/screens/Humble/Keys/components/UrgencyBadge/index.tsx` (new) - presentational badge
- `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` - `urgencyTier`/`giftAction` optional props, badge render, D-42 block preserved
- `src/frontend/screens/Humble/Keys/components/HumbleKeyGroup/index.tsx` - additive `getUrgencyTier` pass-through
- `src/frontend/screens/Humble/Keys/index.css` - `.humbleUrgencyBadge` family, tab-bar strip, `.humbleKeysFlatList`
- `public/locales/en/translation.json` - new `humbleKeys` i18n keys

## Decisions Made

- All decisions followed the plan's literal instructions; the one interpretive call was D-63's "all three tabs" scope — confirmed by wiring `getUrgencyTier` directly into `HumbleKeyGroup`'s row-mapping call site rather than leaving All-keys unbadged, since owned-elsewhere+REVEALED keys (D-55) are All-keys-exclusive and would otherwise never badge anywhere.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Missing referenced module during Task 1**
- **Found during:** Task 1 verification (`pnpm codecheck`)
- **Issue:** App.tsx's new nested route table lazy-imports `./screens/Humble/Keys/Waiting`, which Task 2 (same plan) creates. Without it, `tsc --noEmit` fails with `TS2307: Cannot find module`.
- **Fix:** Added a minimal one-line placeholder `Waiting/index.tsx` (`export default function HumbleKeysWaiting() { return null }`) in Task 1's commit so the route table resolved and codecheck passed; Task 2 immediately overwrote it with the full HVIEW-01 implementation in the same plan.
- **Files modified:** `src/frontend/screens/Humble/Keys/Waiting/index.tsx` (created in Task 1, replaced in Task 2)
- **Commits:** `740aa933` (placeholder), `a7472aa8` (full implementation)

## Known Stubs

- `src/frontend/screens/Humble/Keys/Spares/index.tsx` is an intentional compiling placeholder (header blurb + empty state only, no list, no gift action) — this is explicitly scoped in the plan; Plan 04 replaces it with the full gift-enabled Giftable Spares view (HVIEW-02, D-58/D-59/D-60).
- `HumbleKeyRow`'s `giftAction` prop is declared but never passed by any caller in this plan — Plan 04 wires it from the Spares tab.

## Issues Encountered

None beyond the Rule 3 deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Locked route paths confirmed live: `/humble-keys` → redirect to `/humble-keys/waiting`; `/humble-keys/waiting`, `/humble-keys/spares`, `/humble-keys/all` all resolve via the nested route table in `src/frontend/App.tsx`. Phase 14's C2 guard can target `/humble-keys/spares` directly.
- Plan 04 can now: replace `Spares/index.tsx` wholesale with the full `selectGiftableSpares` list + gift-confirm dialog + `giftAction` prop wiring into `HumbleKeyRow`; the row extension point (`giftAction?`) and CSS/i18n conventions are already established.
- `pnpm codecheck` and the pure-helper test suite (`viewFilters.test.ts`, `urgencyBadge.test.ts`, 43 tests) both pass clean.
- Manual routing/urgency visual confirmation deferred to Plan 05's human-verify checkpoint, per plan's own `<verification>` note.

---
*Phase: 13-keys-waiting-giftable-spares-views*
*Completed: 2026-07-07*

## Self-Check: PASSED

- FOUND: all 10 created/modified source files
- FOUND: 740aa933 (Task 1 commit)
- FOUND: a7472aa8 (Task 2 commit)
- FOUND: .planning/phases/13-keys-waiting-giftable-spares-views/13-03-SUMMARY.md
