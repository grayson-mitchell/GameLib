---
phase: quick-260903-ut6
plan: 01
status: complete
live_verified: 2026-09-03
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

- **`tourProgress` is still written and never read.** Dead but harmless; deliberately left alone
  rather than widening a targeted fix.
- **Tested on the dev build (`pnpm tauri:dev`), not a packaged `--debug` bundle.** The change is
  pure frontend TypeScript and the origin differs (`http://localhost:5173` vs `tauri://localhost`),
  so the fix applies identically; but a packaged run was not performed.

## Addendum 1 -- LIVE VERIFICATION (2026-09-03, same day)

The "no live verification" caveat above is now retired. Verified on a live dev build with the
operator, plus direct reads of WebKit's localStorage backing store.

### The instrument

WebKit persists localStorage to
`~/Library/WebKit/gamelib-shell/WebsiteData/Default/<origin-hash>/.../LocalStorage/localstorage.sqlite3`,
in an `ItemTable(key TEXT, value BLOB)` where values are **UTF-16LE** (so `cast(value as text)`
truncates at the first NUL -- decode `hex(value)` instead). Reading that file directly is a far
better instrument than the DevTools console, which is awkward to drive under Tauri. The dev origin
is `5aTadv95...` (`http://localhost:5173`).

Starting state, before anything: all five GameLib origins held
`{"activeTour":null,"tourProgress":{},"completedTours":[]}` -- old-format blobs (the key is
present) with a clean `null`, because the previous session was quit properly. **No live poison
existed**, so the condition had to be created.

### The control -- because the premise itself was unproven

The resurrect had been asserted from code reading and from one contaminated 34.12-07 observation;
nobody had watched it happen. Running only the fixed build would have been worthless: "no tour
appears" is equally consistent with the fix working and with the premise having been wrong.

| # | code | gesture | result |
| --- | --- | --- | --- |
| B1 | pre-fix | operator starts nav tour, `kill -9` mid-tour | db: `{"activeTour":"nav-tour",...}` -- **poison is real** |
| B2 | pre-fix | relaunch on that poison | **tour appeared, unprompted** (operator-confirmed) |
| B3 | pre-fix | relaunch on an injected copy of the same blob | **tour appeared** -- screenshot: "Nav Bar / Welcome to GameLib!", step 1 of 12 |

B3 exists as a **false-pass guard**. Between B2 and C the poison had to be re-established by
writing the blob back into sqlite; if WebKit had ignored that write, C's "no tour" would have
measured a clean launch and proved nothing. B3 launching *pre-fix* code against the injected value
and showing the tour proves WebKit reads it, which is what licenses C.

### The fix

| # | code | gesture | result |
| --- | --- | --- | --- |
| C1 | **fixed** | relaunch on the same poisoned db | **no tour** -- screenshot shows a clean library |
| C2 | **fixed** | read db after that launch | `{"tourProgress":{},"completedTours":[]}` -- `activeTour` key **absent**, not `null` |
| C3 | **fixed** | operator starts a tour; read db while it is on screen | tour opens normally; db still has **no `activeTour` key** |
| C4 | **fixed** | `kill -9` mid-tour, then relaunch -- **no injection anywhere** | db has no `activeTour`; relaunch shows **no tour** |

C1 proves the read side heals poison already on disk. C2/C3 prove the write side. C3 is also the
regression check that starting a tour still works. C4 is the real user gesture end to end.

### One anomaly, recorded not explained

Between B2 and B3 the persisted value **self-cleared to `null` before the kill**: the resurrected
tour ended on its own, or the operator's window interaction ended it. Cause not established. It
does not affect the conclusion -- it means the pre-fix defect was *intermittent* rather than
certain, and the fix removes the possibility outright. It is why B3 needed the re-injection at all.

### Not covered

Packaged-bundle run, and non-macOS platforms.
