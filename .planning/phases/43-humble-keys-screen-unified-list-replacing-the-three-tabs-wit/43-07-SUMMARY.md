---
phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit
plan: 07
subsystem: ui
tags: [react, react-router-dom, react-i18next, jest, humble-bundle, testing]

requires:
  - phase: 43-02
    provides: HumbleKeyRow component and its scenario resolver, reused unmodified
  - phase: 43-04
    provides: search/sort/filter helpers in common/humble/viewFilters.ts
  - phase: 43-05
    provides: generic-platform key handling (common/humble/genericKeyPlatform.ts)
  - phase: 43-06
    provides: per-row KEY-column action-scenario resolution (HumbleKeyRow)
provides:
  - One unified, searchable/sortable Humble Keys screen at /humble-keys replacing the three tab screens
  - Flat sibling redirects for the three retired tab paths in App.tsx's route config
  - A single jest suite (33 tests) covering the unified screen's full behavioural surface
affects: [humble-keys, frontend-routing, frontend-testing-conventions]

tech-stack:
  added: []
  patterns:
    - "SOURCE GATE testing (readFileSync + stripSourceComments, no live import) for asserting on App.tsx's route config under a no-jsdom jest project"
    - "Slot-based, dependency-aware react mock (useState/useEffect/useMemo) reused verbatim from the Waiting tab's retired suite, extended with react-router-dom + child-component CSS-import stubs"

key-files:
  created:
    - src/frontend/screens/Humble/Keys/__tests__/index.test.tsx
  modified: []

key-decisions:
  - "Ported all 22 assertions from the two retired tab suites individually (20 PORT, 2 REWRITE), never bulk-copied or bulk-dropped -- full disposition table below"
  - "REQ-43-16 (App.tsx redirect assertion) uses source-text scanning, not a live import -- App.tsx's own `./App.css` import crashes this jest project's no-jsdom environment, and mocking its entire dependency graph is out of scope for one routing assertion (Rule 3, blocking issue)"
  - "Every ported D-42-01 settle-undo assertion (all target REDEEMED-state keys) must explicitly turn off the new 'Redeemable keys only' checkbox before it can find its row -- the checkbox's true default (WAITING_STATES only) hides REDEEMED keys from the rendered list, which the retired All tab never had to account for"

patterns-established:
  - "New component test files under this no-jsdom jest project must audit their transitive import graph for CSS/SCSS side-effect imports (not just their own) and jest.mock() every offending child before importing the module under test"

requirements-completed: [REQ-43-01, REQ-43-04, REQ-43-05, REQ-43-06, REQ-43-08, REQ-43-09, REQ-43-16, REQ-43-17, REQ-43-20, REQ-43-21]

metrics:
  duration: 31min (whole plan, Tasks 1-3); Task 3 alone ~24min
  completed: 2026-09-10
---

# Phase 43 Plan 07: Unified Humble Keys screen Summary

**Single searchable/sortable Humble Keys list at `/humble-keys` (React + react-router-dom + react-i18next), replacing the three-tab route tree, backed by a 33-test jest suite that ports every assertion from the two retired tab suites individually and adds coverage for every new-control requirement.**

**IMPORTANT CONTEXT NOTE:** Per this plan-execution's explicit standing instruction, this summary intentionally does **NOT** touch `.planning/STATE.md`, `.planning/ROADMAP.md`, or `.planning/REQUIREMENTS.md`, and no `gsd-sdk query state.*` / `roadmap.*` / `requirements.*` / `phase.complete` verb was called at any point in this execution. This deviates from the standard GSD executor workflow's normal end-of-plan state-update steps, on explicit instruction for this plan.

## Performance

- **Duration:** 31 min across all three tasks (Task 1: `f24a1d927`, Task 2: `fbab332e5`, Task 3: `3301bcca1`); Task 3 (this session) took ~24 min end to end (write suite -> fix 11 real failures -> two mutation proofs -> lint -> commit)
- **Tasks:** 3/3 complete
- **Files modified/created this plan:** `src/frontend/screens/Humble/Keys/index.tsx`, `src/frontend/screens/Humble/Keys/index.css`, `public/locales/en/gamelib.json`, `src/frontend/App.tsx`, `src/frontend/screens/Humble/Keys/__tests__/index.test.tsx` (5 total, matching the plan's `files_modified` list exactly)

## Accomplishments

- Task 1 (prior session, `f24a1d927`): rewrote `Humble/Keys/index.tsx` as one unified list screen with search, sort, and a "Redeemable keys only" checkbox; minted 13 new `gamelib.json` i18n keys.
- Task 2 (prior session, `fbab332e5`): collapsed `App.tsx`'s three-tab nested route tree to one `/humble-keys` leaf plus three flat `<Navigate>` redirects for the retired tab paths.
- Task 3 (this session, `3301bcca1`): authored `Humble/Keys/__tests__/index.test.tsx` -- 33 tests, all passing; the full `Humble/Keys` directory (old tab suites + new suite + `HumbleKeyRow`'s + `HumbleClaimWizard`'s) is at 147/147.

## Task Commits

1. **Task 1: Rewrite the unified Humble Keys screen** - `f24a1d927` (feat) -- prior session
2. **Task 2: Collapse App.tsx's route tree** - `fbab332e5` (feat) -- prior session
3. **Task 3: Author the unified screen's test suite** - `3301bcca1` (test) -- this session, includes two in-flight fixes made before the final commit (see below)

## Test Disposition Table (22 ported assertions)

Source suites retired by this plan: `Waiting/__tests__/index.test.tsx` (13 tests), `All/__tests__/index.test.tsx` (9 tests). Both source files remain on disk (per the plan's verification block); their retirement is a later plan's concern, not this one's. Every row below is an individually-justified decision, not a bulk copy or bulk drop.

| # | Source | Test name | Disposition | Reason |
|---|--------|-----------|--------------|--------|
| 1 | Waiting | fetches claim annotations once on mount | PORT | Mount-time annotation fetch is unchanged behaviour, now on the unified component |
| 2 | Waiting | refetches claim annotations after the claim wizard closes (round-7 fix) | PORT | `onDone` callback wiring is unchanged; regression-critical (round-7 fix history) |
| 3 | Waiting | refetches claim annotations after an undo-redeem action resolves | PORT | Same lifecycle, adapted: checkbox must be turned off since the key is REDEEMED (new-to-this-component gating, absent from the retired Waiting tab) |
| 4 | Waiting | passes undoOverride=true when an override record exists (WR-04) | PORT | Ownership-override lookup logic unchanged |
| 5 | Waiting | passes undoOverride=false when no override record exists (WR-04) | PORT | Same, negative case |
| 6 | Waiting | rejected mount-time annotation/ownership fetches do not escape (WR-02) | PORT | IPC rejection handling unchanged |
| 7 | Waiting | rejected humbleUndoRedeemed still refreshes annotations (WR-02) | PORT | Same, adapted: checkbox off (REDEEMED key) |
| 8 | Waiting | onFinish (not onClaim) rendered for a REVEALED key with no annotation (CR-01) | PORT | `resolveKeyScenario`/HumbleKeyRow button wiring unchanged, verified unmodified via source read |
| 9 | Waiting | onFinish opens the wizard in finish mode (CR-01) | PORT | Same dialog-wiring behaviour |
| 10 | Waiting | refetches annotations when a key is ADDED after mount (260823-n5b) | PORT | Key-set-identity refetch effect carried forward verbatim per plan's `<threat_model>` (T-43-19) |
| 11 | Waiting | does NOT refetch when the key set is unchanged (260823-n5b) | PORT | Same effect, negative case -- proves the dependency-aware mock is load-bearing |
| 12 | Waiting | same-SIZE key-set swap still refetches (260823-n5b) | PORT | Identity-not-count distinction unchanged |
| 13 | Waiting | key-set change does not latch mountedRef (260823-n5b) | PORT | mountedRef non-latching unchanged |
| 14 | All | ownership-exact-settled REDEEMED key receives settleAction (REACHABILITY) | PORT | D-42-01 settle/undo reachability logic (`settleActionFor`) carried unmodified into the unified component; adapted: checkbox off |
| 15 | All | settleAction.onUndoSettle calls humbleUndoRedeemed + refreshes (REACHABILITY) | PORT | Same, adapted: checkbox off |
| 16 | All | WR-02: rejected humbleUndoRedeemed still refreshes (REACHABILITY) | PORT | Same, adapted: checkbox off |
| 17 | All | SCOPING: redeemedSource "user" -> settleAction undefined | PORT | Explicit-source gating unchanged, adapted: checkbox off |
| 18 | All | SCOPING: redeemedSource absent (legacy shape, inversion trap) -> undefined | PORT | Same; this is the anti-inversion regression pin, unchanged logic |
| 19 | All | SCOPING: no annotation entry -> undefined | PORT | Same |
| 20 | All | SCOPING: redeemedSource ownership-exact but redeemedAt absent -> undefined | PORT | Same |
| 21 | All | GROUP SCOPING (settleAction only inside REDEEMED group) | REWRITE | The unified list has no groups (`HumbleKeyGroup` is not used) -- rewritten as "the gate is on the annotation, never on structural position," proving a REVEALED key with the right annotation still gets settleAction (not just REDEEMED keys) |
| 22 | All | GROUP SCOPING (unrelated group's key unaffected) | REWRITE | Same rewrite family: a plain key sitting next to an unrelated settled key still resolves independently, in a flat list with no group boundary to test |

## New Tests Added (11, for the plan's listed REQ-IDs)

1. REQ-43-08 -- checkbox is `true` on first render.
2. REQ-43-06 -- a fresh `mount()` after driving all three controls away from default lands back on `''`/`'expiring'`/`true`; plus a source-text check that `index.tsx` contains no `localStorage`/`sessionStorage`/`useSearchParams` token.
3. REQ-43-21 -- a REDEEMED key matching the search query is hidden when the checkbox is on and shown when off (AND combination, both directions).
4. REQ-43-09 -- a key whose `origin` (not `title`) matches the query is absent (search is title-only).
5. REQ-43-01 -- a generic-platform key in a live state is an ordinary list member, in comparator order, never partitioned or sorted last.
6. REQ-43-04 -- no rendered text is a bare parenthesised count; no element carries a group-count-style class.
7. REQ-43-17 -- no `humbleKeysPinnedSection` element and no standalone "Expiring soon" heading text (regex excludes the legitimate "Expiring soonest" sort-option label).
8. REQ-43-20a -- a genuinely-empty library renders the empty state, not the filtered-empty state.
9. REQ-43-20b -- a non-empty library filtered to zero renders the filtered-empty state; its clear button resets query to `''` and checkbox to `false`, then the key becomes visible again.
10. REQ-43-05 -- three keys (two undated out-of-order, one dated) render dated-first, then undated-alphabetical, end to end through the rendered row list.
11. REQ-43-16 -- SOURCE GATE scan of `App.tsx` confirming all three retired tab paths redirect to `/humble-keys` and the leaf route carries no `children`.

## Real Observed Test Results

```
Test Suites: 1 passed, 1 total
Tests:       33 passed, 33 total
```
(`npx jest --selectProjects Frontend --testPathPattern "src/frontend/screens/Humble/Keys/__tests__/index"`, final run)

Whole-directory run (old tab suites + new suite + `HumbleKeyRow`'s + `HumbleClaimWizard`'s):
```
Test Suites: 5 passed, 5 total
Tests:       147 passed, 147 total
```

## Mutation Proofs (recorded verbatim)

**Proof 1 -- REQ-43-08's initial-checkbox-state assertion:**
- Mutation: `src/frontend/screens/Humble/Keys/index.tsx` line 145, `useState(true)` -> `useState(false)` for `redeemableOnly`.
- Result: `✕ REQ-43-08: "Redeemable keys only" checkbox is checked (true) on first render` -- FAILED by name (plus 3 other tests that depend on the checkbox's true default, expected collateral).
- `Tests: 4 failed, 29 passed, 33 total`
- Reverted: `useState(false)` -> `useState(true)`. Re-ran: `Tests: 33 passed, 33 total`. `git diff --stat` on `index.tsx` empty (clean revert).

**Proof 2 -- REQ-43-20b's clear-button recovery assertion:**
- Mutation: `src/frontend/screens/Humble/Keys/index.tsx` line 514, `clearFilters()`'s `setRedeemableOnly(false)` -> `setRedeemableOnly(true)`.
- Result: `✕ REQ-43-20b: a non-empty library filtered to zero renders the filtered-empty state, and its clear button resets the query and the checkbox to false` -- FAILED by name.
- `Tests: 1 failed, 32 passed, 33 total`
- Reverted: `setRedeemableOnly(true)` -> `setRedeemableOnly(false)`. Re-ran whole directory: `Test Suites: 5 passed, 5 total`, `Tests: 147 passed, 147 total`.

Both proofs confirm the two named assertions are load-bearing, not vacuous.

## Verification Run (this session, in order)

1. `npx jest --selectProjects Frontend --testPathPattern "src/frontend/screens/Humble/Keys/__tests__/index"` -> 33/33 (after fixing 11 real failures discovered on first real run, see Deviations below)
2. `npx jest --selectProjects Frontend --testPathPattern "src/frontend/screens/Humble/Keys"` -> 147/147 (whole directory)
3. Mutation proof 1 (above), reverted, re-confirmed green
4. Mutation proof 2 (above), reverted, re-confirmed green (whole directory: 147/147)
5. `git diff --stat src/frontend/screens/Humble/Keys/index.tsx` -> empty (mutation reverts left no residual diff; the file was already committed by Task 1)
6. `git diff --name-only public/locales/` -> empty (Task 3 touches no locale files, as expected)
7. `grep -c 'grid-template-columns' src/frontend/screens/Humble/Keys/index.css` -> `1` (unaffected by Task 3)
8. `npx tsc --noEmit` -> clean, zero errors
9. `node meta/lintScoped.cjs` -> `production: PASS | tests: PASS` (tests scope: 638/638 warnings, exactly at `TESTS_CEILING`, 0 errors, after two lint-error fixes below)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 11 real test failures on first jest run: REDEEMED-state assertions didn't account for the new checkbox's default filtering**
- **Found during:** Task 3, first real jest run against the authored suite (before any commit)
- **Issue:** Every ported D-42-01 settle-undo assertion (`REACHABILITY`, `SCOPING`, the two `REWRITE`d "GROUP SCOPING" tests) targets a `REDEEMED`-state key. The unified screen's `filteredKeys` filter (`!redeemableOnly || WAITING_STATES.has(key.state)`) excludes `REDEEMED` by default (the checkbox starts `true`), so those rows were never in the rendered tree at all -- `findHumbleKeyRowProps` correctly returned `undefined`, and every assertion built on top of it failed. This gating did not exist in the retired `All` tab (it had no "waiting only" concept), so it was a genuinely new adaptation this plan's own "adapted only for the unified list's shape" instruction anticipated but the first draft missed.
- **Fix:** Added a `turnOffRedeemableOnly(tree)` helper (flips the mocked `ToggleSwitch` stub's `handleChange` to `false` and re-renders) and called it in every affected test before looking up REDEEMED-state rows.
- **Files modified:** `src/frontend/screens/Humble/Keys/__tests__/index.test.tsx`
- **Verification:** Re-ran the suite; all 11 previously-failing tests passed.
- **Committed in:** `3301bcca1` (single Task 3 commit; the fix was applied before the commit, so no separate fix commit exists)

**2. [Rule 1 - Bug] REQ-43-17's text assertion produced a false positive against correct output**
- **Found during:** Task 3, same jest run
- **Issue:** `expect(textContent(tree)).not.toContain('Expiring soon')` failed because the sort control's own default option label is "Expiring soonest" (D-43-06's locked default), which legitimately contains "Expiring soon" as a substring -- the assertion was too broad and would fail against correct code.
- **Fix:** Replaced with a negative-lookahead regex, `/Expiring soon(?!est)/`, that still catches a reintroduced pinned-section heading (the retired tabs' exact standalone phrase) while permitting the legitimate "Expiring soonest" control copy.
- **Files modified:** `src/frontend/screens/Humble/Keys/__tests__/index.test.tsx`
- **Verification:** Re-ran; test passes without weakening its regression-catching purpose (still fails if a `humbleKeysPinnedSection`-style heading reappears).
- **Committed in:** `3301bcca1`

**3. [Rule 1 - Bug] Two ESLint errors in the new test file (tests scope)**
- **Found during:** Task 3, `node meta/lintScoped.cjs --tests` run, before committing
- **Issue:** (a) `syncError?: 'none' | 'partial' | 'denied' | string` on the mock context type triggered `@typescript-eslint/no-redundant-type-constituents` (the string literals are subsumed by `string`). (b) `collectElements(filteredEmpty!)` triggered `@typescript-eslint/no-unnecessary-type-assertion` -- `collectElements`'s parameter type is `ReactNode`, which already includes `undefined`, making the `!` non-null assertion redundant.
- **Fix:** (a) simplified the field to `syncError?: string`. (b) removed the `!` from `collectElements(filteredEmpty)`.
- **Files modified:** `src/frontend/screens/Humble/Keys/__tests__/index.test.tsx`
- **Verification:** `node meta/lintScoped.cjs --tests` -> `0 errors, 638 warnings`, `tests: PASS`.
- **Committed in:** `3301bcca1`

---

**Total deviations:** 3 auto-fixed (all Rule 1 -- bugs in the test file itself, discovered and fixed before the file was ever committed; none touch production code beyond the two temporary, fully-reverted mutation-proof edits documented above)
**Impact on plan:** All three fixes were necessary for the suite to correctly exercise the unified component's actual (correct) behaviour. No scope creep -- no production code was changed by this task.

## Issues Encountered

None beyond the auto-fixed issues above. The App.tsx SOURCE-GATE-instead-of-live-import approach (established as the plan for REQ-43-16 before writing any code, based on the existing `loginInFlightUiReachability.test.tsx` convention) worked exactly as anticipated on the first attempt.

## Known Stubs

None. This plan adds no new data-flow surface beyond what Tasks 1-2 already covered; the test file introduces no production stubs.

## Threat Flags

None. This plan's `<threat_model>` (T-43-01/05/19/22/23/SC) required no new production surface -- Task 3 is test-only. The 22-row disposition table above and the two mutation proofs satisfy the plan's own verification block for T-43-19/22/23 (carrying forward existing lifecycle/copy patterns, proven non-vacuous).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The unified Humble Keys screen is fully implemented, routed, and tested (147/147 across the whole `Humble/Keys` directory).
- The two retired tab source files (`Waiting/index.tsx`, `All/index.tsx`) and their test suites remain on disk, per this plan's verification block -- their removal is explicitly out of scope for this plan and is a follow-up concern for a later plan/phase.
- `.planning/STATE.md`, `.planning/ROADMAP.md`, and `.planning/REQUIREMENTS.md` were **not** touched by this execution, per this plan's explicit standing instruction (see note at top of this summary). Whoever picks up phase bookkeeping next should apply the normal end-of-plan state updates (advance-plan, update-progress, record-metric, mark-complete for REQ-43-01/04/05/06/07/08/09/16/17/20/21/23) manually or via a follow-up invocation.

---
*Phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit*
*Completed: 2026-09-10*

## Self-Check: PASSED

- FOUND: `src/frontend/screens/Humble/Keys/__tests__/index.test.tsx`
- FOUND: `.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-07-SUMMARY.md`
- FOUND commit `f24a1d927` (Task 1)
- FOUND commit `fbab332e5` (Task 2)
- FOUND commit `3301bcca1` (Task 3)
