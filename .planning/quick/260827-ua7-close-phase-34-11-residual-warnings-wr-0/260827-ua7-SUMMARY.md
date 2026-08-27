---
quick_task: 260827-ua7
title: "Close phase 34.11 residual warnings WR-08/WR-16"
resolves_phase: "34.11"
tags: [i18n, testing, react, jest, ledger-reconciliation]

key-files:
  created:
    - src/frontend/screens/Library/components/CategoriesManager/__tests__/newCollectionFocus.test.tsx
    - src/frontend/screens/Library/components/FilterChipRow/__tests__/chipLabels.realI18next.test.ts
  modified:
    - src/frontend/types.ts
    - src/frontend/screens/Library/LibraryContext.tsx
    - src/frontend/screens/Library/index.tsx
    - src/frontend/components/UI/NavShell/components/FilterCollectionList/index.tsx
    - src/frontend/components/UI/NavShell/__tests__/FilterCollectionList.test.tsx
    - src/frontend/screens/Library/components/CategoriesManager/index.tsx
    - src/frontend/screens/Library/components/FilterChipRow/__tests__/index.test.tsx
    - .planning/phases/34.11-library-filtering-search-views-collections-and-cross-store-f/34.11-REVIEW-FIX.md
    - .planning/todos/pending/2026-08-25-phase-34-11-residual-review-warnings.md

key-decisions:
  - "WR-08 closed via option (b): an intent param ('create' | 'manage') threaded through setShowCategories/LibraryContext, reusing CategoriesManager's existing create flow rather than adding a new one — zero new i18n strings."
  - "WR-16 closed by adding a sibling real-i18next test file rather than replacing index.test.tsx's mock — the mock stays for element-graph assertions; the new file owns every claim that depends on real i18next/catalog behaviour."
  - "PRESET_UNCATEGORIZED and 'sideload' used as the collection/store specimen values in the WR-16 catalog-fidelity test (per plan-check amendment #1) — the only values of those two kinds that route through a real i18next lookup rather than a bare literal."

completed: 2026-08-27
---

# Quick Task 260827-ua7: Close Phase 34.11 Residual Warnings WR-08/WR-16 Summary

**Gave the collection-manager dialog's two rows distinct open intents and replaced WR-16's mocked i18next-injection tests with a real `i18next.createInstance()` harness over all eleven `ActiveFilterDescriptor` kinds, then reconciled both 34.11 ledgers from 17/5/1/23 to 19/3/1/23.**

## Performance

- **Tasks:** 3/3 completed
- **Files created:** 2
- **Files modified:** 9 (7 source/test, 2 `.planning/` ledgers)
- **Commits:** 3 (`a9b6ef51a`, `4329529e0`, `a6456fb71`)

## Task Commits

1. **Task 1: Close WR-08 — distinct dialog-row intents** — `a9b6ef51a` (fix)
2. **Task 2: Close WR-16 — real i18next injection/catalog-fidelity tests** — `4329529e0` (test)
3. **Task 3: Reconcile both ledgers to 19/3/1/23** — `a6456fb71` (docs)

No separate plan-metadata commit — this SUMMARY.md is intentionally left uncommitted per this
task's explicit instruction.

## Accomplishments

- **WR-08 (fixed, `a9b6ef51a`):** `setShowCategories` (in `types.ts`) now takes an optional
  `intent: 'create' | 'manage'`, threaded through `LibraryContext` as
  `categoriesManagerIntent`. `FilterCollectionList/index.tsx`'s `+ New collection` row calls
  `setShowCategories(true, 'create')`; `Manage collections` calls
  `setShowCategories(true, 'manage')`. `CategoriesManager`'s existing create flow is reused —
  its `new-category-name` `TextInputField` gets `autoFocus={categoriesManagerIntent ===
  'create'}`. No new dialog, no new i18n string, D-20 preserved (neither row mutates a
  category).
- **WR-16 (fixed, `4329529e0`):** new
  `FilterChipRow/__tests__/chipLabels.realI18next.test.ts` runs `chipLabelSpec`/`resolveLabel`
  against a fresh `i18next.createInstance()` (`i18next-fs-backend`) reading the real
  `public/locales` catalog — all eleven `ActiveFilterDescriptor` kinds, `$t(...)`/`{{token}}`
  injection-safety cases, and a plural-variant specimen. `index.test.tsx`'s
  `jest.mock('react-i18next', ...)` is kept for element-graph assertions; its two hostile-name
  tests are retitled as structural pass-through checks with a cross-reference to the new file.
- **Ledgers reconciled (`a6456fb71`):** `34.11-REVIEW-FIX.md` moves from
  `fixed: 17 / open: 5` to `fixed: 19 / open: 3` (`invalid: 1`, `total: 23` unchanged),
  `status: partial` (WR-10/WR-11/WR-18 still open). The residual todo drops its now-empty
  **UX** and **Test quality** groups/headings and stays `status: pending` with three bullets
  (WR-10, WR-11, WR-18).

## Plan-Check Amendments Closed

1. **THE IMPORTANT ONE — confirmed done.** The WR-16 catalog-fidelity test's
   `ALL_KIND_DESCRIPTORS` array uses `PRESET_UNCATEGORIZED` as the `'collection'` kind's
   specimen value and `'sideload'` as the `'store'` kind's specimen value, with an
   explanatory comment in the test file stating why (these are the only values of those two
   kinds that route through a real i18next key lookup — any other value would make those two
   of eleven branches a no-op against the mocked-vs-real distinction this file exists to
   draw, reproducing WR-16's own disease inside WR-16's fix).
2. **Closed this session.** Task 3's stale-count grep pattern
   `(five|\b5\b) (open )?[Ww]arnings` does not match the literal heading text
   "5 of 19 Warnings" (the "of 19" breaks contiguity). Ran a supplemental literal grep for
   `5 of 19 Warnings` against `34.11-REVIEW-FIX.md` before committing Task 3 — empty, and the
   heading now reads "3 of 19 Warnings remain open".
3. **Already satisfied by the plan's own text**, reconfirmed this session: the plan's
   `<verify><automated>` block for Task 3 already contains
   `! grep -qiE '(five|\b5\b) (open )?[Ww]arnings' "$FIX"` and the same for `$TODO` inside
   the automated section (not prose-only in `<action>`), and both were run as part of this
   task's verification (see below) with empty results.
4. **Closed this session (re-confirmed).** `git diff --stat public/locales/` was run and
   confirmed empty as part of Task 2's own verification before committing Task 2 (per the
   prior session's record), and re-confirmed empty again in this session's overall
   verification pass (against `c388d4f81`, the commit immediately preceding this plan's first
   task).

## Non-Vacuity Proofs (verbatim Jest failure output)

### Task 1 — WR-08

**Specimen: `autoFocus` prop absent from `CategoriesManager`'s new-category field (proof that
`newCollectionFocus.test.tsx` is not vacuous):**

```
● CategoriesManager's new-category input autoFocus (WR-08) › categoriesManagerIntent === 'create' -> the new-category-name field has autoFocus === true

  expect(received).toBe(expected) // Object.is equality

  Expected: true
  Received: undefined

    139 |
    140 |     expect(field).toBeDefined()
  > 141 |     expect(field?.props.autoFocus).toBe(true)
```

**A-17 ANTI-ROT prediction, confirmed exactly:** before Task 1's commit, the diff showed 2
missing files from `meta/i18nForkTouchedFiles.json` (`PathSelectionBox/index.tsx`,
`InstallModal/defaultPlatform.ts`); after committing Task 1, the same test showed exactly 3
missing files — the same 2 plus `src/frontend/screens/Library/components/CategoriesManager/index.tsx`
— confirming the prediction that editing `CategoriesManager/index.tsx` (absent from the
199-entry `i18nForkTouchedFiles.json` snapshot) would enlarge that already-red diff by exactly
one file. No other unexpected file appeared.

### Task 2 — WR-16

**Specimen 1a — catalog-fidelity assertion, run against a namespace list omitting `gamelib`
(`ns: ['translation']`), proving the sentinel-default assertion is not vacuous:**

```
expect(received).not.toBe(expected) // Object.is equality
Expected: not "__WR16_DEFAULT_SHOULD_NEVER_WIN__"
> 153 |       expect(label).not.toBe(SENTINEL_DEFAULT)
```

**Specimen 1b — injection-safety assertion, same missing-namespace configuration, reproducing
fact 6's bare-key string exactly:**

```
expect(received).toBe(expected) // Object.is equality
Expected: "No games match Backlog $t(header.uncategorized)."
Received: "library.filterPanel.emptyBody"
```

**Specimen 2 — renamed key, in a throwaway scratchpad copy of the catalog
(`/private/tmp/claude-501/.../scratchpad/ua7-locales-copy/`), never touching the repo's
`public/locales/`:** renamed `library.filterPanel.viewInstalled` → `viewInstalledX` (the key
actually consumed by the catalog-fidelity test's sentinel mechanism — `removeFilter`, the
plan's literal example, is not one of the eleven `chipLabelSpec`-routed keys, so this
adaptation was needed to make the proof meaningful):

```
expect(received).not.toBe(expected) // Object.is equality
Expected: not "__WR16_DEFAULT_SHOULD_NEVER_WIN__"
> 159 |       expect(label).not.toBe(SENTINEL_DEFAULT)
```

Cleanup confirmed: scratch copy removed (`rm -rf`), `git diff --stat -- public/locales/` and
`git status --short -- public/locales/` both empty afterward.

**Specimen 3 — `skipOnVariables: false` counterfactual:** kept permanently as a live test
(`'skipOnVariables=false would inject — this is what the assertion above rules out (fact 3)'`)
rather than a temporary specimen; confirmed passing in every full-suite run in this session,
including the final overall-verification run (2092/2092 passed).

## Overall Verification (run exactly as specified in the plan)

1. **Targeted jest run** (`--selectProjects Frontend` against all four task test files — this
   project's jest quirk runs the full Frontend project regardless of the file args, matching
   the plan's own expected grep shape):
   ```
   Test Suites: 129 passed, 129 total
   Tests:       2092 passed, 2092 total
   Snapshots:   0 total
   ```
   No `No tests found` anywhere in the output (`grep -c` returned `0`).

2. **`pnpm codecheck`:** clean, `tsc --noEmit` exit 0.

3. **`pnpm exec eslint <9 changed source/test files> --max-warnings=0`:** `24 problems (0
   errors, 24 warnings)`. All 24 confirmed pre-existing in the prior session via
   `git show HEAD:<path>` swap-and-diff (never `git checkout --`): `Library/index.tsx`
   baseline 22 warnings (same categories, same count, just shifted line numbers from this
   task's inserted lines); `LibraryContext.tsx` baseline 1 warning
   (`import-x/no-named-as-default-member` on `React.createContext`, shifted from line 62 to
   63); `FilterCollectionList.test.tsx` baseline 1 warning at line 235
   (`@typescript-eslint/no-unsafe-member-access`, pre-existing and unrelated to this task's
   new WR-08 test). All five newly created/heavily-touched files
   (`chipLabels.realI18next.test.ts`, `newCollectionFocus.test.tsx`, `types.ts`,
   `FilterCollectionList/index.tsx`, `CategoriesManager/index.tsx`) show 0 problems. Zero new
   warnings introduced by this task.

4. **`pnpm lint-translations:gamelib`:** exits 0, but the log contains ~100+ `ENOENT` stack
   traces for locales lacking `public/locales/<locale>/gamelib.json` (e.g. `ar`, `zh_Hant`,
   ...). Confirmed pre-existing and unrelated: `git diff --stat`/`git status --short` against
   `public/locales/` are both empty across this entire plan's commits, and this task's
   explicit design (WR-08, WR-16) required zero new i18n strings.

5. **`git diff --stat public/locales/` (against `c388d4f81`, the commit preceding this plan's
   first task):** empty.

6. **`grep -rn 'eslint-disable' <full plan diff>`:** empty — no `eslint-disable` of any kind
   was added anywhere in this plan.

7. **Known-red tolerance, exactly one:** `meta/__tests__/genI18nGateScope.test.ts`'s `A-17
   ANTI-ROT` test — `1 failed, 27 passed, 28 total` test suites; `1 failed, 1 skipped, 603
   passed, 605 total` tests. The single failure's diff shows exactly the 3 predicted missing
   files (`PathSelectionBox/index.tsx`, `InstallModal/defaultPlatform.ts`,
   `CategoriesManager/index.tsx`) — the pre-existing 34.17-drift baseline of 2, plus exactly
   the 1 this task's `CategoriesManager/index.tsx` edit was predicted to add. No other test
   anywhere failed.

## Deviations from Plan

### Auto-fixed / Adapted Issues

**1. [Rule 3 - eslint blocking issue] Switched to named import for `createInstance`**
- **Found during:** Task 2, first eslint pass on the new test file.
- **Issue:** `import i18next from 'i18next'` + `i18next.createInstance()` triggered
  `import-x/no-named-as-default-member` (a pre-existing, accepted pattern elsewhere in the
  codebase per `gamelibNamespaceLoad.test.ts`, but this new file's `--max-warnings=0` gate
  demands 0 total, not 0-new).
- **Fix:** `import { createInstance } from 'i18next'`, confirmed functionally identical via
  `node -e "const m = require('i18next'); console.log(typeof m.createInstance)"` →
  `function`.
- **Files modified:** `chipLabels.realI18next.test.ts`.
- **Commit:** `4329529e0`.

**2. [Rule 3 - eslint blocking issue] Removed unnecessary type assertion**
- **Found during:** Task 2, same eslint pass.
- **Issue:** `@typescript-eslint/no-unnecessary-type-assertion` on
  `instance.t(key, SENTINEL_DEFAULT, options) as string` — TS already inferred `string`.
- **Fix:** Removed `as string`.
- **Files modified:** `chipLabels.realI18next.test.ts`.
- **Commit:** `4329529e0`.

**3. [Scope-boundary — documented, not fixed] Pre-existing eslint warnings (24 total)**
- Confirmed pre-existing in all three files that carry them (`Library/index.tsx`,
  `LibraryContext.tsx`, `FilterCollectionList.test.tsx`), via `git show HEAD:<path>`
  swap-and-compare (never `git checkout --`). Not fixed — out of scope for this task, not
  suppressed via `eslint-disable`.

**4. [Scope-boundary — documented, not fixed] `pnpm lint-translations:gamelib` ENOENT
failures**
- Pre-existing, repo-wide (only `en` has ever had a `gamelib.json`); confirmed unrelated via
  `git status --short public/locales/` (empty) and this task's zero-new-i18n-string design.
  Not fixed — creating `gamelib.json` for ~50+ locales is an unscoped, unrelated fix.

**5. [Plan-text ambiguity — resolved by covering both readings] Task 2 non-vacuity specimen
1**
- The plan named key `library.filterPanel.emptyBody` while describing it as "the
  catalog-fidelity assertion" — that key actually belongs to the injection-safety test. Ran
  the missing-key proof against both the catalog-fidelity test (specimen 1a, generic
  sentinel-default proof) and the injection-safety test (specimen 1b, reproducing fact 6's
  exact bare-key string) to satisfy both the plan's literal wording and its structural
  intent.

**6. [Plan-text ambiguity — resolved by covering both readings] Task 2 non-vacuity specimen
2**
- The plan's literal example key (`library.filterPanel.removeFilter`) is not one of the
  eleven keys the catalog-fidelity test's sentinel mechanism actually exercises. Renamed both
  `removeFilter` → `removeFilterX` (plan's literal example, for fidelity) and
  `viewInstalled` → `viewInstalledX` (the key the test's mechanism actually consumes, needed
  for the proof to be meaningful) in the throwaway scratchpad copy; only the
  `viewInstalledX` rename produced the failure recorded above (documented as Specimen 2).

No architectural changes (Rule 4) were needed. No authentication gates were encountered.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file-access patterns, or trust-boundary schema
changes were introduced. Both fixes are UI-intent plumbing (WR-08) and test-only additions
(WR-16).

## Self-Check

```
FOUND: src/frontend/screens/Library/components/CategoriesManager/__tests__/newCollectionFocus.test.tsx
FOUND: src/frontend/screens/Library/components/FilterChipRow/__tests__/chipLabels.realI18next.test.ts
FOUND: a9b6ef51a (git log --oneline --all)
FOUND: 4329529e0 (git log --oneline --all)
FOUND: a6456fb71 (git log --oneline --all)
```

## Self-Check: PASSED

## State Updates

Per this task's explicit instruction, `STATE.md` and `ROADMAP.md` were **not** touched — this
override supersedes the generic executor `<state_updates>` step for this quick task.
