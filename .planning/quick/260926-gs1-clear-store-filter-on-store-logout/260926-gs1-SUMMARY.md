---
phase: quick-260926-gs1
plan: 01
subsystem: ui
tags: [react, useEffect, localStorage, filters, library]

requires: []
provides:
  - pruneDisconnectedStores pure helper in filterEngine.ts
  - transition-only useRef baseline + useEffect wiring in Library/index.tsx
  - closed todo 2026-09-26-store-filter-survives-logout-and-empties-the-library
affects: [library-filters, store-facet]

tech-stack:
  added: []
  patterns:
    - "Transition-only prune via a useRef baseline (never seeded at mount) to avoid an async account-load race"
    - "Reference-inequality (toBe) as the no-op signal for a guarded useEffect, mirroring the existing collectionIsStale/setCurrentCollectionPersisted precedent"

key-files:
  created: []
  modified:
    - src/frontend/screens/Library/filterEngine.ts
    - src/frontend/screens/Library/__tests__/filterEngine.test.ts
    - src/frontend/screens/Library/index.tsx
    - .planning/todos/completed/2026-09-26-store-filter-survives-logout-and-empties-the-library.md
    - .planning/quick/260925-uok-windows-gamelib-self-heal-on-launch/260925-uok-SUMMARY.md
    - .planning/quick/260925-uok-windows-gamelib-self-heal-on-launch/260925-uok-VERIFICATION.md
    - .planning/quick/260925-uok-windows-gamelib-self-heal-on-launch/deferred-items.md

key-decisions:
  - "Prune on connected->disconnected TRANSITION only, never a mount-time intersection (async ContextProvider account-load race)"
  - "Persist through setStoreFacetPersisted, never setStoreFacet_, so the dead selection does not resurrect on relaunch"
  - "FilterZeroResult/FilterChipRow left untouched -- the todo's Option 2 (surface the empty state) was already shipped; only Option 1 (clear the selection) was missing"
  - "The pre-existing, unrelated envelope-tag gate failure (260925-uok artifacts) was fixed as its own commit, first, per orchestrator amendment -- not folded into the store-filter fix"

patterns-established:
  - "A logout-driven filter clear follows the repo's D-08a precedent: when the control governing a filter is hidden, the filter is cleared"

requirements-completed:
  - TODO-2026-09-26-store-filter-survives-logout

duration: 5min
completed: 2026-09-26
---

# Quick Task 260926-gs1: Clear store filter on store logout Summary

**A store facet selection now clears itself the moment its store logs out, via a transition-only `pruneDisconnectedStores` helper (never a mount-time intersection) wired through a guarded `useEffect`, persisted so it does not resurrect on relaunch.**

## Performance

- **Duration:** ~5 min (commit-to-commit span; wall-clock session was longer due to context-gathering)
- **Started:** 2026-09-26T00:14:40Z (first task commit)
- **Completed:** 2026-09-26T00:18:46Z (final commit)
- **Tasks:** 3/3 completed (Task 3 split into two commits per orchestrator amendment)
- **Files modified:** 7 (3 source/test, 1 todo move, 3 unrelated collateral repair)

## Accomplishments

- Added `pruneDisconnectedStores`, a pure helper in `filterEngine.ts`, with six unit tests including the load-bearing `toBe` identity assertion.
- Wired a `useRef` baseline + guarded `useEffect` into `Library/index.tsx`, directly after the `connectedStores` memo, persisting via `setStoreFacetPersisted`.
- Closed `.planning/todos/pending/2026-09-26-store-filter-survives-logout-and-empties-the-library.md` with a resolution that corrects its headline: the "bare empty library with no explanation" claim was measured false at HEAD — `FilterZeroResult` already covered that half.
- Fixed an unrelated, pre-existing planning-gate failure (three stray envelope tags in the `260925-uok` quick-task artifacts) as its own separate, first commit, per the orchestrator's amendment.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the pure pruneDisconnectedStores helper and its six unit tests** - `f06a1ac62` (feat)
2. **Task 2: Wire the transition-only prune into Library/index.tsx** - `5850a0448` (feat)
3. **[Orchestrator amendment] Repair unrelated collateral: stray envelope tags in 260925-uok artifacts** - `04490034b` (fix)
4. **Task 3: Close the todo (move + resolution)** - `1b38eebc8` (docs)

_Note: Task 3 was split into two commits per orchestrator amendment #1 — the envelope-tag repair (unrelated collateral, already-red at HEAD before this plan started) landed first and separately from the todo move._

## Files Created/Modified

- `src/frontend/screens/Library/filterEngine.ts` - Added `pruneDisconnectedStores(selection, previousConnected, currentConnected)`, a pure transition-only prune helper.
- `src/frontend/screens/Library/__tests__/filterEngine.test.ts` - Added `describe('store facet prune on disconnect', ...)` with six unit tests direct-invoking the new helper.
- `src/frontend/screens/Library/index.tsx` - Added a `useRef<StoreFacetValue[] | null>(null)` baseline and a `useEffect` keyed on `[connectedStores, storeFacet]` that calls the helper and persists the pruned result only when it differs by reference.
- `.planning/todos/completed/2026-09-26-store-filter-survives-logout-and-empties-the-library.md` - Moved from `pending/`, appended `## Resolution (2026-09-25, quick 260926-gs1)` correcting the headline and recording what shipped.
- `.planning/quick/260925-uok-windows-gamelib-self-heal-on-launch/260925-uok-SUMMARY.md`, `260925-uok-VERIFICATION.md`, `deferred-items.md` - Deleted stray trailing envelope-tag lines (`</content>`, `</invoke>`) left by an unrelated prior quick task, per the planning-envelope-tag gate's own prescribed action. Unrelated to this plan's objective; landed as its own commit per orchestrator amendment.

## Deviations from Plan

### Auto-fixed Issues

None beyond the orchestrator's own explicit amendments (both followed exactly, not autonomous deviations):

1. **[Orchestrator amendment 1] Split Task 3's commit in two.** The stray envelope-tag repair in the `260925-uok` artifacts was unrelated collateral (a gate already red at HEAD, independently confirmed before this plan started). It was committed first and separately (`04490034b`) from the todo move (`1b38eebc8`), rather than folded into one combined commit as the plan text originally described.
2. **[Orchestrator amendment 2] Explicit-pathspec commits throughout.** Per the amendment's warning that `gsd-sdk query commit` stages the entire working tree, every commit in this plan used `git commit -m "..." -- <explicit paths>` instead, verified afterward with `git status --short` and `git show --stat --oneline -1` to confirm no foreign file (notably the untracked `.planning/quick/260926-gs1-.../` plan/summary directory) was absorbed.

### Process Note (not a deviation, recorded for transparency)

Task 1 carried `tdd="true"`, but this plan's frontmatter `type` is `execute`, not `tdd` — there was no plan-level RED/GREEN/REFACTOR gate requirement. The helper and its six tests were written and verified together, then committed as a single `feat` commit (`f06a1ac62`), rather than as separate `test(...)` (RED) then `feat(...)` (GREEN) commits. All six tests were confirmed passing against the implementation before commit; no test was observed failing-then-passing across two commits. This is noted for completeness, not as a compliance gap requiring rework — the plan's own `<verify>` block for Task 1 did not ask for separate RED/GREEN commits.

## Known Stubs

None. No hardcoded empty values, placeholder text, or unwired data sources were introduced.

## Threat Flags

None. This plan's own `<threat_model>` (T-gs1-01, T-gs1-02) already covers the only trust boundary touched (`storeFacet` localStorage), and no new network endpoints, auth paths, file access, or schema changes were introduced.

## Verification Results

- `npx jest --selectProjects Frontend src/frontend/screens/Library/__tests__/filterEngine.test.ts` — PASS (6/6 new tests, all suites green)
- `npx jest --selectProjects Frontend src/frontend/screens/Library` — PASS (178 suites / 3034 tests, including `libraryPipeline`, `libraryHookStaleness`, `connectedStoresParity`, `clearAllFiltersCoverage`)
- `pnpm codecheck` — clean (0 errors)
- `pnpm lint` — 0 errors (pre-existing unrelated warnings only)
- `pnpm planning-gates` — 13/13 passed (was 12/13 at HEAD before the envelope-tag repair commit)
- `npx prettier --check` over every exact written path (never `.`) — clean for all files in this plan

## Next Steps

None required. The todo is closed. No follow-on work identified.

## Self-Check: PASSED

All created/modified files verified present on disk; all four task commits
(`f06a1ac62`, `5850a0448`, `04490034b`, `1b38eebc8`) verified present in
`git log`; todo confirmed absent from `.planning/todos/pending/` and present
in `.planning/todos/completed/`.
