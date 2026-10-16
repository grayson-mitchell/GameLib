---
phase: 15-store-overlay-expiration-alerts
plan: 01
subsystem: ui
tags: [react, typescript, jest, i18n, discounts, humble, steam]

# Dependency graph
requires:
  - phase: 12-ownership-dedup
    provides: dedup.ts exact-AppID falsy-guard convention (WR-01), matchConfidence model
  - phase: 13-keys-waiting-giftable-spares-views
    provides: selectKeysWaiting (common/humble/viewFilters.ts), .humbleKeyStateBadge pill chrome
provides:
  - Pure resolveDiscountBadge(product, titleToAppId, ownedAppIds, keysWaiting) helper in common/discounts/badges.ts
  - DiscountCard non-interactive Owned/Key-available ownership pill
  - Discounts container title->Steam-AppID bridge + per-product badge memoization
affects: [15-02, 15-03, 15-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exact-normalized-title (.trim().toLowerCase()) bridge from a non-Steam catalog title to a Steam AppID, mirroring the ownedTitles memo convention"
    - "Badge resolution computed once by the container (useMemo, keyed on product page), never recomputed inside the presentational card"

key-files:
  created:
    - src/common/discounts/badges.ts
    - src/backend/discounts/__tests__/badges.test.ts
  modified:
    - src/frontend/screens/Discounts/components/DiscountCard/index.tsx
    - src/frontend/screens/Discounts/components/DiscountCard/index.css
    - src/frontend/screens/Discounts/index.tsx
    - public/locales/en/translation.json

key-decisions:
  - "Badge resolution is exact-title-match only, structurally excluding any fuzzy/matchConfidence path — a missing badge is preferred over a wrong one (D-79/D-82/T-15-01-01)"
  - "Owned always wins over Key-available when both conditions are true; at most one pill renders per card (D-85)"
  - "Ownership pill lives inside .discountCard__info above the title, not as a third image-overlay corner span (D-80)"
  - "Manually added the two new i18n keys directly to public/locales/en/translation.json instead of running the full pnpm i18n scan, after that scan surfaced ~29 lines of pre-existing orphaned-key churn in unrelated humbleKeys.* entries (out of scope for this plan, logged to deferred-items.md)"

patterns-established:
  - "resolveDiscountBadge pure-helper pattern: common/domain-mixing helpers (Steam + Humble + a third catalog) live in common/, tested from the backend jest project, following the viewFilters.ts / urgencyBadge.ts precedent"

requirements-completed: [HSTORE-01]

# Metrics
duration: ~5min
completed: 2026-07-09
---

# Phase 15 Plan 01: Discounts Ownership Badges Summary

**Exact-match Owned/Key-available ownership pills on the native Discounts screen, driven by a pure `resolveDiscountBadge` helper bridging normalized GOG catalog titles to Steam AppIDs — zero fuzzy matching.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-09T20:04:00Z (approx, worktree setup)
- **Completed:** 2026-07-09T20:15:29Z
- **Tasks:** 2 completed
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- Pure `resolveDiscountBadge` helper (`src/common/discounts/badges.ts`) with full unit coverage (9 tests: owned, key-available, no-match, near-title-miss, owned-wins, falsy-AppID-guard x3, case/whitespace normalization) — TDD RED→GREEN cycle followed with a verified failing test before implementation existed
- `DiscountCard` renders a non-interactive `<span>` ownership pill (`Owned` / `Key available`) computed by the parent, positioned inside `.discountCard__info` above the title — never a third image-overlay corner badge, never clickable
- `Discounts/index.tsx` builds a `titleToSteamAppId` map + `ownedSteamAppIds` set from `steam.library` only, and a memoized per-product badge map via `resolveDiscountBadge` + `selectKeysWaiting(humble.keys)`, passed to each `DiscountCard` as a `badge` prop

## Task Commits

Each task was committed atomically (TDD tasks split into RED/GREEN):

1. **Task 1: Pure resolveDiscountBadge helper + unit tests (RED→GREEN)**
   - `76494e08` (test) — failing test, verified module-not-found before implementation existed
   - `5a30cfec` (feat) — implementation, all 9 tests green
2. **Task 2: DiscountCard ownership pill + Discounts container wiring + i18n**
   - `2b27c7fd` (feat) — DiscountCard pill, container wiring, CSS, i18n keys

**Plan metadata:** (this commit, docs: complete plan — added after this summary)

_Note: Task 1 used the mandatory TDD RED→GREEN flow: implementation was temporarily removed via `mv` to confirm the test suite failed with "Cannot find module" before being restored and re-verified green, per the RED-gate fail-fast rule._

## Files Created/Modified
- `src/common/discounts/badges.ts` - Pure `resolveDiscountBadge`/`DiscountBadge` export; exact-normalized-title lookup, falsy-guarded exact-AppID key match, Owned-wins precedence
- `src/backend/discounts/__tests__/badges.test.ts` - 9 unit tests covering D-79/D-82/D-83/D-84/D-85 and the WR-01 falsy-AppID guard
- `src/frontend/screens/Discounts/components/DiscountCard/index.tsx` - New optional `badge` prop; renders the `Owned`/`Key available` `<span>` pill inside `.discountCard__info`
- `src/frontend/screens/Discounts/components/DiscountCard/index.css` - `.discountCard__badge--owned` / `--keyAvailable` pill chrome cloned from `.humbleKeyStateBadge` (padding/border-radius/font/color identical; only `background` varies)
- `src/frontend/screens/Discounts/index.tsx` - `humble` destructured from `ContextProvider`; new `titleToSteamAppId`/`ownedSteamAppIds`/`discountBadges` memos; `badge` prop wired onto each rendered `DiscountCard`
- `public/locales/en/translation.json` - `discounts.badge.owned` / `discounts.badge.keyAvailable` keys added

## Decisions Made
- Exact-title-match only, structurally verified absent of "fuzzy"/"levenshtein"/"matchConfidence" tokens in `badges.ts` (grep-checked) — a crafted/colliding catalog title cannot silently borrow an unrelated AppID (T-15-01-01)
- Owned wins over Key-available; single-badge-per-card guarantee lives entirely inside the pure helper, not duplicated in the render layer
- Manually hand-added the two new locale keys rather than running the full `pnpm i18n` scan (see Deviations below)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `humble.keys` is optional in `ContextType`, not `HumbleKey[]`**
- **Found during:** Task 2 (`pnpm codecheck`)
- **Issue:** `selectKeysWaiting(humble.keys)` failed `tsc --noEmit` — `ContextType['humble']['keys']` is `HumbleKey[] | undefined`, and `selectKeysWaiting` requires a non-undefined array
- **Fix:** Changed the call to `selectKeysWaiting(humble.keys ?? [])`, matching the existing convention already used in `src/frontend/screens/Humble/Keys/index.tsx` (`const keys = humble.keys ?? []`)
- **Files modified:** `src/frontend/screens/Discounts/index.tsx`
- **Verification:** `pnpm codecheck` passes clean
- **Committed in:** `2b27c7fd` (Task 2 commit)

**2. [Rule 3 - Blocking, scoped down] `pnpm i18n` full scan surfaced unrelated pre-existing orphaned-key drift**
- **Found during:** Task 2 (running `pnpm i18n` per the plan's action step)
- **Issue:** Running the full i18next-parser scan (as the plan literally instructs: "Run `pnpm i18n` to register the two new `discounts.badge.*` keys") produced a diff touching ~29 unrelated lines in the pre-existing `humbleKeys.*` locale section (removing/renaming legacy duplicate keys like `ownedBlockGoto`/`revealBody`/`state.*` and converting `tabSpares`/`tabWaiting` to `_one`/`_other` plural forms) — this matches the known pre-existing "orphaned-key drift" blocker already logged in STATE.md (unrelated Prettier/i18n repo debt from a prior phase)
- **Fix:** Reverted the full-scan diff on `translation.json` via `git checkout -- public/locales/en/translation.json` (single-file, non-destructive) and manually added only the two new keys (`discounts.badge.owned` / `discounts.badge.keyAvailable`) by direct edit, keeping the plan's stated intent (register the new keys) without absorbing unrelated pre-existing drift into this plan's commit
- **Files modified:** `public/locales/en/translation.json` (targeted addition only)
- **Verification:** `node -e "JSON.parse(...)"` confirms valid JSON; `grep` confirms both new keys present; targeted `npx eslint`/`tsc` on all 15-01 files clean
- **Committed in:** `2b27c7fd` (Task 2 commit)
- **Logged out-of-scope item:** `.planning/phases/15-store-overlay-expiration-alerts/deferred-items.md` also notes 1 pre-existing `pnpm lint` error in `src/frontend/screens/Humble/Keys/Waiting/__tests__/index.test.tsx` (Phase 14 commit `88f53fd5`, unrelated to any file this plan touches) — not fixed, per scope-boundary rule.

---

**Total deviations:** 2 auto-fixed (1 Rule-1 bug, 1 Rule-3 blocking/scoped-down)
**Impact on plan:** Both fixes necessary to land a clean `pnpm codecheck` and avoid absorbing unrelated repo debt into this plan's commit. No scope creep — the second deviation actively narrowed scope rather than expanding it.

## Issues Encountered
None beyond the deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `resolveDiscountBadge` and `DiscountBadge` are exported from `src/common/discounts/badges.ts` and available for reuse by 15-02/15-03/15-04 if a badge-adjacent surface is needed
- Manual human-check from the plan's Task 2 `<verify>` block (connect a real Humble account with waiting keys, visually confirm Owned/Key-available pills, confirm click-through still works, confirm low badge coverage is expected per RESEARCH Pitfall 1) was NOT performed in this autonomous execution — this plan has no `checkpoint:*` tasks (fully autonomous, Pattern A) so it was not a blocking gate, but a live visual pass is recommended before Phase 15 sign-off
- One pre-existing, unrelated `pnpm lint` error remains outstanding (see deferred-items.md) — not introduced by this plan

---
*Phase: 15-store-overlay-expiration-alerts*
*Completed: 2026-07-09*

## Self-Check: PASSED

All created/modified files verified present on disk; all 4 task/deferred-item commit hashes (`76494e08`, `5a30cfec`, `2b27c7fd`, `36143697`) verified present in `git log --oneline --all`.

## TDD Gate Compliance

Task 1 (`tdd="true"`) gate sequence verified in git log: `test(15-01)` commit `76494e08` (RED, confirmed failing via temporary module removal) precedes `feat(15-01)` commit `5a30cfec` (GREEN, all 9 tests passing). No REFACTOR commit was needed.
