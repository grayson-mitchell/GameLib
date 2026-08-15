# 260815-opt — Library filter visibility: facet-group selection badge + header denominator

**Status:** all three tasks executed and committed. Full regression gate green.
**Branch:** `fix/steam-native-install-stability` (no branch created or switched).

| Commit | Task |
|---|---|
| `285d0a98e` | Task 1 — selection badge on the shared facet-group primitive |
| `94b1f3adc` | Task 2 — wire all three facet groups to the badge |
| `b3c84f6e0` | Task 3 — filtered-vs-total denominator in the library header |
| `e4352dd5f` | follow-up — drop a literal token from a prohibition comment |

**Zero `git stash`, `git clean`, `git checkout`, `git restore`, or `git reset` invocations
across the whole execution.** Both catalog reverts and all three mutation reverts were done
by direct `Edit` or by `git show HEAD:<path> > <path>` redirect (a plain file write — it does
not fire `.husky/post-checkout` and cannot touch untracked files).

---

## Final gate results

| Gate | Result |
|---|---|
| `pnpm test:ci` | **273 suites passed, 5398 passed / 1 skipped, 0 failed**, exit 0 (baseline was 265 suites) |
| `npx tsc --noEmit` / `pnpm codecheck` | clean |
| `npx eslint` on touched files | 0 errors (24 pre-existing warnings in `Library/index.tsx`, incl. the deliberate WR-01 `exhaustive-deps` tripwire) |
| `sass … \| grep -c "…FilterFacetGroup .FilterFacetGroup__badge"` | `1` |
| `grep -c groupSelectedCount public/locales/en/gamelib.json` | `1` |
| `grep -c filteredOfTotal public/locales/en/gamelib.json` | `1` |
| `grep "{{count}}"` in `LibraryHeader/index.tsx` | `0` |
| `grep "storeFacet.length"` in the three callers | `0`, `0`, `0` |
| `useTranslation` / `useContext` in `FilterFacetGroup/index.tsx` | `0` / `0` — C3 contract intact |
| `LibraryContext.tsx`, `frontend/types.ts`, `meta/i18nGateScope.json`, `engineWiring.ts` | untouched (`git diff HEAD~3 --name-only` shows none of them) |

---

## Task 1 — selection badge on the shared primitive

### RED proofs (all runtime/behavioural per C7 — no type-error proofs)

**RED 1 — `facetSelectionCount.test.ts` before `selectionCount.ts` existed.**
```
● Test suite failed to run
  Cannot find module '../components/FilterFacetGroup/selectionCount' from
  'src/frontend/components/UI/NavShell/__tests__/facetSelectionCount.test.ts'
  at Resolver._throwModNotFoundError (node_modules/jest-resolve/build/resolver.js:427:11)
Test Suites: 1 failed, 1 total   Tests: 0 total
```
After implementation: `Tests: 7 passed, 7 total`.

**RED 2 — badge specs before editing `FilterFacetGroup/index.tsx`.**
`Tests: 3 failed, 8 passed, 11 total`. The split is itself the discriminator and is recorded
as such: the `selectedCount` omitted and `selectedCount={0}` specs **passed in RED** (correct —
the component already rendered no badge), while the three badge-present specs failed:
```
● selectedCount={3} renders a badge whose text child is the NUMBER 3, between the title and the caret
  expect(received).toHaveLength(expected)
  Expected length: 3   Received length: 2
  Received array: [<span className="FilterFacetGroup__title">Store</span>,
                   <FontAwesomeIcon className="FilterFacetGroup__caret" … />]

● selectedCountLabel supplies the badge accessible name via aria-label, title and role="img"
  Expected: "3 selected"   Received: undefined

● selectedCountLabel omitted leaves aria-label and title undefined
  expect(badge).toBeDefined()   Received: undefined
```

**RED 3 — `facetGroupBadgeStyles.test.ts` before editing `index.scss`.**
`Tests: 4 failed, 4 passed, 8 total`. Failures: badge selector not emitted; badge class-count;
title class-count; badge token chain. Every SANITY counter-check passed in RED.
```
● the badge selector carries at least three class components…
  Expected: ArrayContaining ["NavShell__tier2Portal","FilterFacetGroup","FilterFacetGroup__badge"]
  Received: []
● the badge paints via the file-local --filter-active-color chain…
  Matcher error: received value must not be null nor undefined   Received has value: undefined
```

### Non-vacuity mutation (the C2 control) — PERFORMED

Scratchpad copy taken first. Badge rule rewritten **without** its `.FilterFacetGroup` ancestor
(bare `.FilterFacetGroup__badge`, i.e. `(0,2,0)`).

Observed — **exactly one spec failed, and it was the target spec**:
```
✕ the badge selector carries at least three class components, beating Dropdown on class count alone
  Expected: ArrayContaining ["NavShell__tier2Portal","FilterFacetGroup","FilterFacetGroup__badge"]
  Received: ["NavShell__tier2Portal","FilterFacetGroup__badge"]
Tests: 1 failed, 7 passed, 8 total
```
The other 7 (including both SANITY checks and the token-chain check) stayed green, so the
failure is attributable to specificity alone and not to a broken compile.

Reverted by direct `Edit`. **`diff` against the pre-mutation scratchpad copy: EMPTY.** Gate
re-run: `8 passed, 8 total`.

### Manual cascade verification (run in addition to the committed gate)

Emitted, both at `(0,3,0)`:
```
.NavShell__tier2Portal .FilterFacetGroup .FilterFacetGroup__title
.NavShell__tier2Portal .FilterFacetGroup .FilterFacetGroup__badge
```
Dropdown's emitted rules were read by eye. Confirmed no Dropdown selector can match the badge,
and for a stronger reason than class count: `Dropdown/index.tsx` renders `.dropdownButton`
(which holds the title fragment, hence the badge) as a **SIBLING** of `.dropdown`, both children
of `.dropdownContainer`. So `.dropdownContainer .dropdown button` (0,2,1) cannot reach the badge
at all — it is not a descendant of `.dropdown`, and it is a `<span>` not a `button`.
`.dropdownContainer .button` (0,2,0) cannot match either: the class is `FilterFacetGroup__badge`.
The `(0,3,0)` selector wins regardless, which is the ordering-independence C2 asked for.

---

## Task 2 — wiring the three callers

### RED proof — caller specs before editing the callers

Aggregate `Tests: 9 failed, 29 passed, 38 total`, i.e. **exactly 3 failures per file**, all
`Received: undefined`. Per-file counts:

| File | RED |
|---|---|
| `FilterStoreFacet.test.tsx` | 3 failed, 7 passed, 10 total |
| `FilterRunnabilityFacet.test.tsx` | 3 failed, 8 passed, 11 total |
| `FilterMoreGroup.test.tsx` | 3 failed, 14 passed, 17 total |

All pre-existing specs stayed green in RED. Sample:
```
● FilterStoreFacet › with no active filters, passes selectedCount 0 …   Expected: 0   Received: undefined
● FilterStoreFacet › counts only the store descriptors …                Expected: 2   Received: undefined
● FilterStoreFacet › supplies an already-translated badge label …       Expected: "2 selected"   Received: undefined
```
After wiring: `Tests: 38 passed, 38 total`.

### Non-vacuity mutation — PERFORMED

`FilterMoreGroup`'s `countDescriptorsOfKind(activeFilterDescriptors, MORE_FILTER_KINDS)`
replaced with the literal `0`. Observed:
```
PASS FilterStoreFacet.test.tsx
PASS FilterRunnabilityFacet.test.tsx
FAIL FilterMoreGroup.test.tsx
  ● counts only the More-filters descriptors -- two More plus one store yields 2
  ● supplies an already-translated badge label interpolated on {{selected}}, not the reserved name
Tests: 2 failed, 36 passed, 38 total
```
Isolation is exactly as intended: **only** `FilterMoreGroup`'s two count-bearing specs failed;
Store and Runnability stayed fully green. Its `selectedCount 0` spec correctly stayed green —
the mutation hardcodes `0`, which is what that spec asserts, so that spec is not the
discriminator and is not expected to fire here.

Reverted by direct `Edit`. **`diff` against the pre-mutation scratchpad copy: EMPTY.** Re-run:
`38 passed, 38 total`.

### i18n

`pnpm i18n` extracted `library.filterPanel.groupSelectedCount = "{{selected}} selected"`
correctly. The run also produced **substantial unrelated drift** — 4 files, ~159 insertions,
all of it the concurrent Phase 34.13 session's keys (`steamInstall*`,
`steam.install.*`, `status.checkingSteamInstallOptions`) plus churn in `gamepage.json`,
`login.json` and `translation.json`. All four catalogs were restored to HEAD via
`git show HEAD:<path> > <path>` and the single key was re-added by hand `Edit`.

Final committed catalog delta for Task 2 — exactly one line:
```
+            "groupSelectedCount": "{{selected}} selected",
```

Test-mock upgrade worth noting: the three `react-i18next` mocks now **interpolate** their
options into the literal default. With the previous echo mock, a call site using i18next's
reserved `count` name would have produced a string indistinguishable from a correct one, so
the label specs could not have detected C6 violations. They now assert `'2 selected'`.

---

## Task 3 — header denominator

### RED proofs

**RED 1a — before `gameCount.ts` existed** (runtime module resolution):
```
● Test suite failed to run
  Cannot find module '../components/LibraryHeader/gameCount' from
  'src/frontend/screens/Library/__tests__/libraryHeaderVisibility.test.ts'
Tests: 0 total
```

**RED 1b — after creating `gameCount.ts`, before `DEFAULT_FILTER_ENGINE_STATE` and before
editing either component.** `Tests: 9 failed, 13 passed, 22 total`:
```
● DEFAULT_FILTER_ENGINE_STATE › is every filter at its default …
  Expected: {"collection": null, …, "view": "all"}   Received: undefined
● DEFAULT_FILTER_ENGINE_STATE › produces ZERO active filter descriptors …
● DEFAULT_FILTER_ENGINE_STATE › yields the count reachable by Clear all …
● LibraryHeader source gate › reads activeFilterCount off LibraryContext
  Expected substring: "activeFilterCount"
● LibraryHeader source gate › gates the new form on activeFilterCount > 0 …
  Expected substring: "activeFilterCount > 0"
● LibraryHeader source gate › carries a LITERAL key and a LITERAL default …
  Expected substring: "'gamelib:library.header.filteredOfTotal'"
● LibraryHeader source gate › counts through the shared helper and keeps no inline DLC filter …
  Expected substring: "countGamesExcludingDlc"
● Library/index.tsx source gate › passes totalGames to LibraryHeader
  Expected pattern: /<LibraryHeader[\s\S]{0,200}?totalGames=/
● Library/index.tsx source gate › derives that total through …
```
The five `countGamesExcludingDlc` specs went green at this point (module just written), and
**every SANITY counter-check passed in RED**, confirming the prohibition gates
(`{{count}}`, inline `install.is_dlc`) were not passing vacuously.

**RED 3 — stripper load-bearing proof.** A specimen carrying `activeFilterCount > 0` inside a
`//` line comment, a multi-line `/* */` block and a single-line `/* */` block was asserted to
contain the token before stripping and **not** to contain it after — with a companion spec
proving real code on the same specimen survives, so the stripper is not simply deleting
everything. Both green.

### Non-vacuity mutation — PERFORMED

The `activeFilterCount > 0` gate was deleted so the filtered form rendered unconditionally.
Observed — **exactly one spec failed, the gate spec**:
```
✕ gates the new form on activeFilterCount > 0, so an unfiltered library renders exactly what it renders today
  Expected substring: "activeFilterCount > 0"
Tests: 1 failed, 25 passed, 26 total
```
Reverted by direct `Edit`. **`diff` against the pre-mutation scratchpad copy: EMPTY.** Re-run:
`26 passed, 26 total`.

### i18n

Second `pnpm i18n` run extracted `library.header.filteredOfTotal = "{{shown}} of {{total}}"`
correctly, and again dragged in the same concurrent-session drift. Same treatment: all four
catalogs restored to HEAD (which by then contained Task 2's key), key re-added by hand.
Final committed delta:
```
+        "header": {
+            "filteredOfTotal": "{{shown}} of {{total}}"
+        },
```

---

## Deviations from the plan

### 1. [Rule 3 — blocking] The denominator's engine call could not live in `Library/index.tsx`

**Found during:** Task 3, at first GREEN run.

The plan's step 3 specified the memo inline in `Library/index.tsx`:
```js
filterEngine.filterLibrary(libraryUnion, filterEngine.DEFAULT_FILTER_ENGINE_STATE, engineDeps)
```
Implemented as written, this **failed a pre-existing gate**:
```
FAIL src/frontend/screens/Library/__tests__/libraryPipeline.test.ts
● Library pipeline has exactly one implementation › never calls filterLibrary( or countFor(
  itself -- both call shapes live in engineWiring.ts, where a behavioural test can reach the
  real arguments
```
That gate is not incidental. It was written after CR-01, where an engine call sitting in the
component was handed the wrong first argument and **no test could reach it**; its rule is that
engine call shapes must live somewhere a behavioural test can exercise them over real
arguments. The plan's own instruction not to modify `engineWiring.ts` or `buildGridPipeline`
closed the obvious alternative — and `engineWiring.ts` is separately pinned by its own gate to
*exactly* three engine calls, so a fourth could not be added there without breaking a passing
test either.

**Resolution:** the call was moved into a new pure exported function,
`countUnfilteredGames(libraryUnion, deps)`, in `components/LibraryHeader/gameCount.ts` (a file
already in `files_modified`). `Library/index.tsx`'s memo now reads
`countUnfilteredGames(libraryUnion, engineDeps)` and contains no engine call shape.

This satisfies the gate's actual purpose rather than working around it, and is **strictly
stronger than the plan**: the denominator is now proven **behaviourally** (three direct specs
over a fixture union containing hidden, non-available and DLC entries) instead of by a source
gate asserting `DEFAULT_FILTER_ENGINE_STATE` appears in the component. `engineWiring.ts` and
`buildGridPipeline` are byte-unchanged, `libraryPipeline.test.ts` and `engineWiring.test.ts`
are unmodified and green.

The two affected gate specs in `libraryHeaderVisibility.test.ts` were rewritten accordingly:
`Library/index.tsx` is now gated on containing `countUnfilteredGames(libraryUnion, engineDeps)`
and on **not** containing `filterLibrary(` or `DEFAULT_FILTER_ENGINE_STATE`, each with its own
executable known-bad specimen.

### 2. [Rule 3 — blocking] Two pre-existing eslint errors in `FilterFacetGroup.test.tsx`

**Found during:** Task 1 `done`-criteria check (`npx eslint` clean on touched files).

```
109:10  error  This assertion is unnecessary since it does not change the type of the expression
128:10  error  This assertion is unnecessary since it does not change the type of the expression
        @typescript-eslint/no-unnecessary-type-assertion
```
Both are on lines I did not write. **Confirmed pre-existing** by linting an unmodified copy of
the file at HEAD (written to a throwaway path, linted, deleted) — identical two errors. `pnpm
lint` uses `--cache`, which is why they had not been surfacing.

Fixed (removed two redundant `as AnyElement` casts, no behaviour change) rather than deferred,
because the file is in this task's `files_modified`, is committed by this task, and the plan's
`done` requires eslint-clean touched files. Suite re-verified green afterwards.

### 3. [Rule 1 — grep hygiene] Literal forbidden tokens removed from four prose comments

**Found during:** Task 3 verification, and again at final success-criteria checks.

Comments I authored explaining that a token must NOT be used contained that token literally, so
the plan's own audit greps reported hits in the very files that provably do not use it:

- `{{count}}` appeared in prose in `LibraryHeader/index.tsx` and all three Filter* callers. The
  plan's Task 3 automated verify greps raw source for `{{count}}` and requires `0`; it would
  have failed on a comment.
- `storeFacet.length` appeared in prose in `FilterStoreFacet/index.tsx`. The success criterion
  greps for it expecting `0`.

All five rephrased to name the constraint without the literal token (commit `e4352dd5f` for the
last one). This is the "pin asserting the rationale" hazard in miniature: a comment naming a
forbidden token makes every future grep for that token ambiguous.

### Not deviations

- No architectural (Rule 4) decisions were needed; no checkpoints were hit.
- No package installs were attempted. `sass@1.89.0` was already a devDependency and its own
  types resolve, so the gate uses `import * as sass from 'sass'` (the plan's `require` fallback
  was unnecessary and would have tripped `@typescript-eslint/no-require-imports`).
- C10's out-of-scope list was honoured: `FilterChipRow` and `FilterZeroResult` untouched, no
  Games-tab badge, no auto-expand.

---

## Human gate — OWED, NOT PASSED

**No automated evidence in this task speaks to rendering, layout, or per-theme legibility.**
The jest project has no jsdom and no CSS engine; the style gate inspects compiled selector text
only, and the component gates inspect React-element objects and source text. Nothing below has
been observed. All four are **OWED**.

1. **OWED** — Collapse the `STORE` group with 2 stores ticked: a `2` appears on the header, left
   of the caret, and the header title is not pushed off-centre or truncated prematurely.
2. **OWED** — Untick both: the badge disappears entirely (no `0`, no empty gap).
3. **OWED** — Cycle every shipped theme with a badge visible and a filtered header; the badge
   stays legible on the panel surface in all of them. This is the repeatedly-burned failure mode
   (CR-03); `gruvbox_dark` and `dracula` are the two that historically lack tokens. Mitigated by
   design (the badge reuses `.FilterFacetRow--checked`'s already-live-swept
   `var(--filter-active-color)` relationship verbatim and introduces zero new contrast pairs),
   but **mitigation is not observation**.
4. **OWED** — Apply one store facet: the header reads e.g. `42 of 318`; click `Clear all`: the
   header returns to the bare `318` in today's exact form and that number **matches** the
   denominator that was showing.

Note for item 4: the denominator's correctness is unit-proven against fixtures
(`countUnfilteredGames` excludes hidden, non-available and DLC in one pass, and the
`describeActiveFilters(DEFAULT_FILTER_ENGINE_STATE, '') === []` invariant ties it to the render
gate), but that the two numbers agree **on the real library in the running app** has not been
observed.

---

## Working-tree hygiene

Final `git status --porcelain` shows only this task's untracked planning directory:
```
?? .planning/quick/260815-opt-library-filter-visibility-facet-group-se/
```
The concurrent session's files were never touched, staged, or committed. Its two named
untracked files (`InstallModal/steamEligibilityProbe.ts` and its test) did not appear in
`git status` at any point during execution — that session appears to have committed them
before this task started (`f323b3593` and later). No post-commit deletion check reported any
deleted file for any of the four commits.

No docs artifacts were committed — `SUMMARY.md`, `STATE.md` and `PLAN.md` are left for the
orchestrator's docs commit. `ROADMAP.md` was not updated (quick tasks are tracked separately).
`STATE.md` was **not read or modified**: it is 818 KB, exceeds the read limit, and a concurrent
session is active in it.

## Self-Check: PASSED

All 5 created source/test artifacts verified present on disk; all 4 commit hashes verified
present in `git log`. Final `git status --porcelain` clean apart from this task's own untracked
planning directory.
