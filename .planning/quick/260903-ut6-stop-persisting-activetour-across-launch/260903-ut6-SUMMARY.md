---
phase: quick-260903-ut6
plan: 01
status: complete
date: 2026-09-03
commits:
  - c55071298
files_modified:
  - src/frontend/state/TourContext.tsx
  - src/frontend/state/__tests__/tourContextState.test.ts
decisions:
  - id: D-01
    decision: "Fix at BOTH the read and the write boundary, not one."
    rationale: "They close different halves. Excluding `activeTour` from the persisted payload stops new poison but leaves every machine that already has `activeTour: \"nav-tour\"` on disk resurrecting a tour on its next launch -- including the operator's, from the 34.12-07 run. Dropping it at the read boundary heals those, and is also the half that is unit-testable in a jest project with no jsdom. Neither alone is the fix."
  - id: D-02
    decision: "`activeTour` stays a field of `TourState`; only its PERSISTENCE is removed."
    rationale: "It is legitimate in-session state -- `isTourActive` is the gate both tours read. The defect was never the field, it was treating a pointer to a live DOM overlay as a durable preference."
  - id: D-03
    decision: "Introduced `type PersistedTourState = Omit<TourState, 'activeTour'>` rather than inlining the two field names."
    rationale: "Makes the exclusion structural. A field added to `TourState` later cannot silently start persisting -- the author has to decide."
  - id: D-04
    decision: "Executed inline rather than dispatching gsd-planner + gsd-executor."
    rationale: "The investigation was already complete in this session (the defect was found during 34.12-07 and re-confirmed by reading the file), the change is two files, and a planner agent would have re-derived known facts. All GSD guarantees are preserved: PLAN.md written before any edit, atomic commit, this SUMMARY, STATE.md row. Recorded here so a later reader can tell inline-sourced work from generated work."
---

# Quick task: stop `activeTour` surviving a launch

## What was wrong

`TourContext` wrote the **entire** `TourState` to `localStorage['heroic-tour-state']` on every
change and read it back verbatim at boot. Nothing cleared `activeTour`.

`NavShellTour` (`index.tsx:166`) and `LibraryTour` (`LibraryTour.tsx:147`) both set
`enabled={isTourActive(TOUR_ID)}` and nothing else, so a **restored** id is indistinguishable from
a real `startTour()` click. Any session that ended with a tour on screen -- crash, `pkill`,
force-quit, anything that is not a clean `endTour` -- reopened that tour on the next launch,
unprompted.

Second-order cost, and how it was found: it **contaminates its own gate**. During 34.12-07 the
"no tour on launch" observation had to be redone because the previous run was torn down with
`pkill` mid-tour, which is exactly the condition that arms the defect.

## What changed

`src/frontend/state/TourContext.tsx`

- `readPersistedTourState` no longer derives `activeTour` from the parsed value; it returns
  `defaultState.activeTour` for every input. The `tourProgress` / `completedTours` normalisation
  from 34.12-05 (T-34.12-05-01) is untouched -- that logic is load-bearing for a different defect
  and was not in scope.
- The persist effect writes `{ tourProgress, completedTours }` typed as the new
  `PersistedTourState`. The stored blob now has **no `activeTour` key at all** -- absent, not
  `null`.

`src/frontend/state/__tests__/tourContextState.test.ts`

- The old `'returns a well-formed round-trip value unchanged, field for field'` case asserted
  `activeTour: 'nav-tour'` survives. That test **encoded the defect**; it is now
  `'round-trips the persistable fields of a well-formed value'` and asserts only the two fields
  that should survive.
- Two new cases pin the fix by name, with the failure mode in a docstring so the intent survives a
  future reader: `'never restores activeTour, even from a valid tour id'` and
  `'drops activeTour without disturbing the other fields'`.

## Evidence

| check | result |
| --- | --- |
| `pnpm jest --selectProjects Frontend` | 141 suites, **2186 tests, all pass** (2184 before; +2 new, 1 renamed) |
| pin convicts | read boundary reverted in the working tree → **both new tests FAIL**; restored → both pass |
| `pnpm codecheck` (`tsc --noEmit`) | clean |
| `npx eslint` on both files | 0 errors; 1 warning, `import-x/no-named-as-default-member` on `React.useEffect`, **pre-existing at HEAD line 105** and the file's own idiom |
| `npx prettier --check` on both files | clean |
| other readers/writers of `heroic-tour-state` | none — grep across `src` returns only `TourContext.tsx` |

The RED check matters more than the GREEN one here. A test asserting `activeTour` is `null` would
also pass against a `readPersistedTourState` that returned `defaultState` unconditionally, or
against one that never ran -- so the pin was verified by reintroducing the defect in the working
tree (`git`-untouched, restored from a scratchpad copy) and confirming both new cases fail.

## Not done

- **No live verification.** Proving the real gesture -- start a tour, `pkill` mid-tour, relaunch,
  observe no tour -- needs a rebuild and an operator. The read boundary is an exported pure
  function precisely because this jest project is `testEnvironment: 'node'` with no jsdom and
  cannot mount `TourProvider` (see `src/frontend/jest.config.js`). Worth folding into the next
  live session rather than rebuilding for it alone.
- **`tourProgress` is still written and never read.** Dead but harmless; deliberately left alone
  rather than widening a targeted fix.
