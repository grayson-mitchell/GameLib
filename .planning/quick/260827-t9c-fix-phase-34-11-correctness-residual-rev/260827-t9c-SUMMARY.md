---
phase: quick/260827-t9c-fix-phase-34-11-correctness-residual-rev
plan: 260827-t9c
subsystem: ui
tags: [react, hooks, useCallback, jest, eslint, filter-engine, library-screen]

requires:
  - phase: 34.11-library-filtering-search-views-collections-and-cross-store-f
    provides: buildGridPipeline/engineWiring wiring layer, chipLabels label-resolution layer, FilterRunnabilityFacet
provides:
  - makeLibrary/libraryUnion dependency-complete via useCallback (WR-01 closed)
  - recentAppNames refreshed on handleRecentGamesChanged (WR-05 closed)
  - module-scope throw removed from FilterRunnabilityFacet, replaced with it.each drift alarm (WR-06 closed)
  - collectionIsStale() staleness predicate + wiring effect (WR-09 closed)
  - renderableActiveFilters() applied before activeFilterCount is derived (WR-12 closed)
  - 34.11-REVIEW-FIX.md and the pending todo reconciled to the same 5-open count
affects: [34.11-library-filtering-search-views-collections-and-cross-store-f, phase-34-11-residual-review-warnings-todo]

tech-stack:
  added: []
  patterns:
    - "useCallback with an exhaustive dependency list, consumed by a downstream useMemo([callback]), instead of hand-copying the callback's free-variable reads into the memo's own array"
    - "state + useEffect subscribing to an IPC push listener (window.api.handleRecentGamesChanged), mirroring an existing sibling component's pattern, instead of useMemo(..., [])"
    - "a pure exported staleness predicate (collectionIsStale) in the React-free engineWiring.ts layer, wired into a small useEffect in the component"
    - "source-text gates with a mandatory non-vacuity assertion and a known-bad specimen proof, following connectedStoresParity.test.ts's established idiom"

key-files:
  created:
    - src/frontend/screens/Library/__tests__/libraryHookStaleness.test.ts
  modified:
    - src/frontend/screens/Library/index.tsx
    - src/frontend/screens/Library/engineWiring.ts
    - src/frontend/components/UI/NavShell/components/FilterRunnabilityFacet/index.tsx
    - src/frontend/components/UI/NavShell/__tests__/FilterRunnabilityFacet.test.tsx
    - src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts
    - src/frontend/screens/Library/components/FilterZeroResult/index.tsx
    - src/frontend/screens/Library/components/FilterChipRow/__tests__/index.test.tsx
    - src/frontend/screens/Library/__tests__/engineWiring.test.ts
    - src/frontend/screens/Library/__tests__/libraryPipeline.test.ts
    - .planning/phases/34.11-library-filtering-search-views-collections-and-cross-store-f/34.11-REVIEW-FIX.md
    - .planning/todos/pending/2026-08-25-phase-34-11-residual-review-warnings.md

key-decisions:
  - "WR-01 fixed via the review's FIRST option (useCallback with a complete dependency list), not its second (add six values to the memo array) — leaving the second option in place would have left the react-hooks/exhaustive-deps tripwire tripped, which the review itself names as the finding's own detector."
  - "WR-05's fix subscribes to handleRecentGamesChanged (the review's primary recommendation); the review's libraryStatus-dependency fallback was explicitly rejected, in both the code comment and the ledger row, because libraryStatus changes on every download progress tick and would cause a re-render storm."
  - "WR-06's fix deletes the module-scope throw outright rather than guarding it further; the drift alarm moves entirely into an it.each test over RUNNABILITY_LABELS, converting a production crash into a named, non-fatal test failure."

requirements-completed: [WR-01, WR-05, WR-06, WR-09, WR-12]

duration: ~25min (commit span 21:23–21:34 NZST across the 3 task commits; total session time longer due to a mid-execution context compaction)
completed: 2026-08-27
---

# Quick Task 260827-t9c: Close Phase 34.11's 5 Correctness Residual Review Warnings Summary

**Closed WR-01/WR-05/WR-06/WR-09/WR-12 in `Library/index.tsx` and its supporting modules with regression tests, then reconciled both open-findings ledgers to the same 5-open count.**

## Performance

- **Duration:** ~25 min (see frontmatter note — session spanned a context compaction)
- **Completed:** 2026-08-27
- **Tasks:** 3/3 complete
- **Files modified:** 11 (1 created, 10 modified) across the three task commits

## Accomplishments

- WR-06 (module-scope `throw` crashing the app on import) and WR-12 (unrenderable descriptors inflating `activeFilterCount` and emptying the zero-result sentence) fixed in one commit, each with a regression test and a non-vacuity proof.
- WR-01 (`libraryUnion` memo's incomplete dependency array), WR-05 (`recentAppNames` frozen at mount), and WR-09 (a stale `currentCollection` silently emptying the grid) fixed in a second commit, using the review's first-choice remediation for WR-01 and explicitly rejecting the review's fallback for WR-05.
- `34.11-REVIEW-FIX.md` and the pending todo both now state exactly 5 open findings (WR-08, WR-10, WR-11, WR-16, WR-18), each citing the real commit hashes from this task.
- No `eslint-disable` was added anywhere in `src/` by this task (checked repo-wide against the pre-task base `91500a020`).

## Task Commits

1. **Task 1: WR-06 (module-scope throw) + WR-12 (unrenderable descriptors)** - `a0e7dfed7` (fix)
2. **Task 2: WR-01 (memo dependency completeness) + WR-05 (recentAppNames refresh) + WR-09 (stale currentCollection)** - `4ba13c636` (fix)
3. **Task 3: Reconcile both ledgers to 5 open findings** - `c388d4f81` (docs)

_No separate plan-metadata commit was made — this SUMMARY is written but intentionally NOT committed, per this task's explicit constraint (the orchestrator handles STATE.md/ROADMAP.md and the final commit)._

## Files Created/Modified

- `src/frontend/components/UI/NavShell/components/FilterRunnabilityFacet/index.tsx` - deleted the module-scope dev-only `throw`; exported `runnabilityLabel`/`echoDefaultValue` so the drift check can live in the test suite instead
- `src/frontend/components/UI/NavShell/__tests__/FilterRunnabilityFacet.test.tsx` - added an `it.each` over `RUNNABILITY_LABELS` (the new drift alarm) plus a no-throw source gate with its own non-vacuity proof
- `src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts` - added `renderableActiveFilters()`, filtering descriptors down to those with a resolvable `chipLabelSpec`
- `src/frontend/screens/Library/components/FilterZeroResult/index.tsx` - added a `labels.length === 0` guard as defence in depth
- `src/frontend/screens/Library/components/FilterChipRow/__tests__/index.test.tsx` - added tests for `renderableActiveFilters`
- `src/frontend/screens/Library/index.tsx` - `activeFilterDescriptors` now passes through `renderableActiveFilters` (WR-12); `makeLibrary` is a `useCallback` with all twelve identifiers it reads declared, `libraryUnion` depends on `[makeLibrary]` alone (WR-01); `recentAppNames` is state refreshed by `window.api.handleRecentGamesChanged` with the review's `libraryStatus` fallback explicitly rejected in a comment (WR-05); a new effect calls `collectionIsStale()` and clears the persisted collection on staleness (WR-09)
- `src/frontend/screens/Library/engineWiring.ts` - added and exported `collectionIsStale(collection, customCategories)`
- `src/frontend/screens/Library/__tests__/engineWiring.test.ts` - added the `collectionIsStale` five-row truth table (Test K)
- `src/frontend/screens/Library/__tests__/libraryPipeline.test.ts` - updated the `functionRegion` needle from `'const makeLibrary = () => {'` to `'const makeLibrary = useCallback(() => {'`
- `src/frontend/screens/Library/__tests__/libraryHookStaleness.test.ts` (new) - Tests G/H/I (WR-01 dependency-completeness subset check, non-vacuity, known-bad proof), Test J (WR-05 wiring presence check), Test L (WR-09 wiring presence check)
- `.planning/phases/34.11-library-filtering-search-views-collections-and-cross-store-f/34.11-REVIEW-FIX.md` - frontmatter `fixed: 17 / open: 5 / invalid: 1 / total: 23`, five rows flipped to FIXED with real commit hashes, a new re-sweep paragraph, Verdict and Residual sections updated
- `.planning/todos/pending/2026-08-25-phase-34-11-residual-review-warnings.md` - title and `files:` pruned to the 5 surviving findings, the now-empty "Correctness — small but real" group and its heading deleted, a new dated update paragraph added

## Decisions Made

- WR-01: took the review's first-listed remediation (extract `makeLibrary` into a `useCallback` with a complete, exhaustive-deps-checked dependency list) rather than its second (hand-add six values to `libraryUnion`'s own memo array while leaving `makeLibrary` a plain closure) — the second option would leave the `react-hooks/exhaustive-deps` warning live, and that warning is the finding's own tripwire.
- WR-05: took the review's primary recommendation (subscribe to `window.api.handleRecentGamesChanged`, mirroring `RecentlyPlayed/index.tsx`) and explicitly rejected its stated fallback (`libraryStatus` in the dependency array) in both the code comment and the ledger row, because `libraryStatus` changes on every download progress tick and would turn a rare event into a continuous recompute.
- WR-09: the `collectionIsStale()` predicate treats `null` and the `PRESET_UNCATEGORIZED` sentinel as never-stale by construction (imported by identifier from `filterEngine.ts`, never re-declared), so the Uncategorized view cannot be silently retired by a naive `!(x in list)` implementation — verified by a dedicated truth-table row.

## Deviations from Plan

### Auto-fixed Issues

None beyond the plan's own prescribed fixes — no Rule 1/2/3 auto-fixes were needed.

### Other Deviations

**1. Verify block false-fire in Task 3's "no stale ten/10 open count" check**
- **Found during:** Task 3 verification (check 5 of 5)
- **Issue:** `! grep -Eqi 'ten (open|Warnings)|10 open Warning' ...` fails against the final state of `34.11-REVIEW-FIX.md`. The sole surviving hit is a pre-existing historical narration line from the `260827-s8z` re-sweep paragraph ("Fourteen open -> ten open + one invalid, arithmetic 12 + 10 + 1 = 23"), which describes *that* sweep's own past transition and predates this task. The plan's own Task 3 instructions say to add this task's paragraph "alongside the existing `260825-vy5` and `260827-s8z` paragraphs" — i.e. leave them in place.
- **Disposition:** OPEN-with-measurement, not fixed. Rewriting or deleting a prior sweep's historical narration to satisfy an overly broad literal grep would falsify the historical record the file exists to preserve — the check cannot distinguish "a past transition being narrated accurately" from "a currently-stated stale total." All CURRENT-state indicators (frontmatter `dispositions:`, the `## Verdict` line, the `## Residual` section) correctly and unambiguously state 5 open findings; the arithmetic check (check 1) and the per-finding FIXED/OPEN check (check 2) both independently confirm this. I did reword my own new (`260827-t9c`) paragraph to avoid using the phrase "ten open" so the false-fire is now isolated to exactly the one pre-existing historical line rather than two.
- **Evidence:** `grep -Eni 'ten (open|Warnings)|10 open Warning' 34.11-REVIEW-FIX.md` → one hit, at the `260827-s8z` paragraph, line ~47.
- **Files affected:** `.planning/phases/34.11-library-filtering-search-views-collections-and-cross-store-f/34.11-REVIEW-FIX.md` (not modified further beyond the reword above).
- **Commit:** `c388d4f81` (the commit already reflects the reworded paragraph; no separate fix commit was needed).

---

**Total deviations:** 1 (verify-block false-fire, disposed as OPEN-with-measurement rather than force-fixed).
**Impact on plan:** None on substance — every ledger field, row, and count that matters is correct and internally consistent; only one overly literal grep in the plan's own verify block cannot distinguish historical narration from a current claim.

## Issues Encountered

None beyond the deviation above. All three tasks' own `<verify>` blocks passed on the runs pasted below.

## Verification Output (real, pasted)

### Task 1 verify (from prior session, re-confirmed clean by the full-suite runs below)
Task 1's jest/eslint/tsc/anti-suppression checks all passed at commit time (`a0e7dfed7`); re-confirmed transitively by the Task 2 and final full-suite runs below, which include every file Task 1 touched.

### Task 2 verify

```
$ pnpm exec jest --config jest.config.js src/frontend/screens/Library/__tests__ --ci
Test Suites: 11 passed, 11 total
Tests:       207 passed, 207 total
Time:        0.382 s

$ test "$(grep -c 'buildGridPipeline(' src/frontend/screens/Library/index.tsx)" = "1"
VERIFY2 PASS

$ pnpm exec eslint src/frontend/screens/Library/index.tsx
✖ 22 problems (0 errors, 22 warnings)
VERIFY3 PASS: warnings now 22 (baseline 23, expected 22)

$ ! git diff -U0 -- src/frontend/screens/Library/ | grep -E '^\+' | grep -q 'eslint-disable'
VERIFY4 PASS

$ pnpm exec tsc --noEmit -p tsconfig.json
VERIFY5 PASS (no error TS lines)
```

### Plan-check amendment (repo-wide anti-suppression, base 91500a020)

```
$ ! git diff -U0 91500a020..HEAD -- src/ | grep -q 'eslint-disable'
AMENDMENT PASS
```

### Task 3 verify

```
$ (frontmatter arithmetic: fixed: 17 / open: 5 / invalid: 1 / total: 23 / status: partial / criticals_open: 0)
PASS

$ (WR-01/05/06/09/12 all **FIXED**; WR-08/10/11/16/18 all OPEN in 34.11-REVIEW-FIX.md)
PASS

$ (todo no longer carries WR-01/05/06/09/12 as bullets; still names WR-08/10/11/16/18; status: pending)
PASS

$ grep -q '260827-t9c' <both files>
PASS

$ ! grep -Eqi 'ten (open|Warnings)|10 open Warning' <both files>
FAIL — see Deviations section above (isolated to one pre-existing historical
line in the 260827-s8z paragraph; all current-state fields are correct)
```

### Overall plan `<verification>` (run after all three tasks, from repo root)

```
$ pnpm exec jest --config jest.config.js src/frontend/screens/Library src/frontend/components/UI/NavShell/__tests__ --ci
Test Suites: 50 passed, 50 total
Tests:       1032 passed, 1032 total
Time:        1.584 s

$ pnpm exec eslint src/frontend/screens/Library/index.tsx
✖ 22 problems (0 errors, 22 warnings)

$ pnpm exec tsc --noEmit
(clean, no error TS lines, exit 0)

$ git diff --stat 91500a020..a0e7dfed7   # Task 1, isolated
6 files changed, 174 insertions(+), 29 deletions(-)   -- exactly Task 1's files

$ git diff --stat a0e7dfed7..4ba13c636   # Task 2, isolated
5 files changed, 337 insertions(+), 26 deletions(-)   -- exactly Task 2's files

$ git diff --stat cc5ae4f36..c388d4f81  # Task 3, isolated (cc5ae4f36 is a
                                          # concurrent session's commit, not mine)
2 files changed, 45 insertions(+), 37 deletions(-)    -- exactly Task 3's files

$ pnpm exec jest --config jest.config.js meta --ci
Test Suites: 1 failed, 28 passed, 29 total
Tests:       1 failed, 1 skipped, 627 passed, 629 total
(the one failure is the pre-existing, known-red
 meta/__tests__/genI18nGateScope.test.ts:415 — not touched, not caused by this task)

$ git status --short --branch
## fix/steam-native-install-stability...gamelib/fix/steam-native-install-stability [ahead 15]
(nothing pushed)
```

**Note on `git diff --stat` across the full range:** `git diff --stat 91500a020..c388d4f81` (the full span) additionally shows `.planning/STATE.md` and a new todo file about a CheapShark/IsThereAnyDeal migration — these belong to a concurrent session's commit `cc5ae4f36` ("docs: capture todo - answer Q2 CheapShark to IsThereAnyDeal migration cost"), sandwiched between this task's Task 2 and Task 3 commits. Isolating each of this task's three commits individually (shown above) confirms each touches exactly its plan-declared files, with no cross-contamination in either direction.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 34.11's review-fix ledger and its pending todo are now consistent at 5 open findings each (WR-08, WR-10, WR-11, WR-16, WR-18). None of the five is a Critical or contradicts a declared REQ-34.11-01..17 truth (`34.11-VERIFICATION.md` stands at `passed` 17/17 independently). No blockers for further Phase 34.11 work; the five remaining findings are either blocked on decision D-08 (WR-10/WR-11), a design decision for the i18n gate scope (WR-18), UX polish (WR-08), or test quality (WR-16) — none require code correctness fixes of the kind this task addressed.

## Self-Check

- `test -f src/frontend/screens/Library/__tests__/libraryHookStaleness.test.ts` → FOUND
- `test -f src/frontend/screens/Library/engineWiring.ts` → FOUND (modified, pre-existing)
- `git log --oneline --all | grep -q a0e7dfed7` → FOUND
- `git log --oneline --all | grep -q 4ba13c636` → FOUND
- `git log --oneline --all | grep -q c388d4f81` → FOUND

## Self-Check: PASSED

---
*Quick task: 260827-t9c*
*Completed: 2026-08-27*
