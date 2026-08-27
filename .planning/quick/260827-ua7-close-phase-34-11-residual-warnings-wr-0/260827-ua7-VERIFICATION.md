---
quick_task: 260827-ua7
verified: 2026-08-27T10:45:03Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Quick Task 260827-ua7 Verification Report

**Task goal:** Close Phase 34.11's last two workable residual review warnings — WR-08 (two
identical collection-manager dialog rows) and WR-16 (vacuous i18next-injection tests) —
then reconcile both ledgers to fixed 19 / open 3 / invalid 1 of 23.

**Verified:** 2026-08-27T10:45:03Z
**Status:** passed
**Mode:** initial verification (no prior VERIFICATION.md existed)

## Adversarial mandate: WR-16 non-vacuity — independently reproduced

This is the load-bearing check for this task. I did **not** accept the SUMMARY's recorded
failure output. I built my own scratch harness (never touching `public/locales/**` in the
working tree, never using `git checkout`/`stash`/`reset`) and ran it myself.

**Method:** copied `public/locales/en/` to a scratchpad directory
(`/private/tmp/.../scratchpad/ua7-locales-copy/en/`), renamed
`library.filterPanel.viewInstalled` → `viewInstalledMUTATED` in the scratch copy only, wrote
a throwaway test file (`wr16.verifierproof.test.ts`, deleted immediately after the run, never
committed) that re-implements the exact catalog-fidelity assertion against the scratch
catalog for the `view`/`collection`/`store` descriptor kinds (using `PRESET_UNCATEGORIZED`
and `'sideload'` as the collection/store specimens, matching the real test), then ran it with
`pnpm exec jest --selectProjects Frontend`.

**Exact failure output reproduced myself:**
```
FAIL src/frontend/screens/Library/components/FilterChipRow/__tests__/wr16.verifierproof.test.ts
  ● VERIFIER MUTATION PROOF (not part of the plan, deleted after run) › fails against a renamed key in a scratch catalog copy (viewInstalled -> viewInstalledMUTATED)

    expect(received).not.toBe(expected) // Object.is equality

    Expected: not "__WR16_DEFAULT_SHOULD_NEVER_WIN__"

      45 |       expect(spec).not.toBeNull()
      46 |       const label = resolveLabel(spec!, sentinelT, sentinelT)
    > 47 |       expect(label).not.toBe(SENTINEL_DEFAULT)
         |                         ^
      48 |       expect(label).not.toMatch(BARE_KEY_RE)
      49 |     }
      50 |   })

Test Suites: 1 failed, 129 passed, 130 total
Tests:       1 failed, 2092 passed, 2093 total
```

Cleanup verified: scratch test file removed, scratch locale copy `rm -rf`'d,
`git status --short -- public/locales/` and `git diff --stat -- public/locales/` both empty
afterward, and `git diff HEAD` on the whole repo showed nothing (confirmed with
`git status --short`).

**Conclusion: the new WR-16 test is genuinely non-vacuous.** It fails when the real catalog
is broken and passes when it is not — the opposite of the mocked harness it replaces.

Additional structural confirmation (read `chipLabels.ts` directly, not taken on trust):
- `kind: 'collection'` only routes through a real i18next key lookup (`header.uncategorized`)
  when `descriptor.value === PRESET_UNCATEGORIZED`; every other value returns
  `{ literal: descriptor.value }`, bypassing `t`/`tGamelib` entirely.
- `kind: 'store'` only routes through a real lookup (`gamelib:library.storeOther`) when
  `descriptor.value === 'sideload'`; every other value resolves through `RunnerToStore` and
  returns a literal.
- The new test's `ALL_KIND_DESCRIPTORS` array uses exactly `PRESET_UNCATEGORIZED` and
  `'sideload'` for those two kinds (`chipLabels.realI18next.test.ts:116-140`) — confirmed by
  direct read, not by trusting the SUMMARY's restatement.
- `makeSentinelT` (`chipLabels.realI18next.test.ts:102-105`) discards the caller-supplied
  default and substitutes `SENTINEL_DEFAULT` — i18next only falls back to a supplied default
  on a missing/mis-namespaced/plural-only key, so a real key always produces its real catalog
  value or the sentinel, never a value that happens to look right by coincidence.
- The harness uses `createInstance()` from the real `i18next` package + `i18next-fs-backend`
  reading `public/locales/{{lng}}/{{ns}}.json` — confirmed no `__mocks__/i18next.ts` shadows
  it anywhere under `src/frontend` (only `src/backend/__mocks__/i18next.ts` exists, a
  different jest project).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `+ New collection` and `Manage collections` produce observably different calls | ✓ VERIFIED | `FilterCollectionList/index.tsx:104,113` call `setShowCategories(true, 'create')` / `setShowCategories(true, 'manage')`; `FilterCollectionList.test.tsx` asserts `mock.calls[0]` `.not.toEqual` `mock.calls[1]`, both arity-exact `toHaveBeenCalledWith(true)` assertions updated to two-arg form (test run confirms pass) |
| 2 | Create-intent auto-focuses the create input; manage-intent does not | ✓ VERIFIED | `CategoriesManager/index.tsx:206` — `autoFocus={categoriesManagerIntent === 'create'}`; `newCollectionFocus.test.tsx` asserts `autoFocus === true` for `'create'` and `=== false` for `'manage'`, both passing |
| 3 | Chip/zero-result i18n keys proved to exist in the REAL catalog against a real `i18next.createInstance()` | ✓ VERIFIED | `chipLabels.realI18next.test.ts` — reproduced non-vacuous myself (see above); all 11 `ActiveFilterDescriptor` kinds covered, `PRESET_UNCATEGORIZED`/`'sideload'` specimens confirmed correct by reading `chipLabels.ts` directly |
| 4 | Hostile `$t(...)`/`{{token}}` proved literal by REAL i18next, with `skipOnVariables:false` counterfactual proved to inject | ✓ VERIFIED | `chipLabels.realI18next.test.ts:158-254` — both injection-safety assertions plus the permanent `skipOnVariables:false` counterfactual test, all passing in the full run |
| 5 | Both ledgers state 19/3/1/23 and name the same three open findings | ✓ VERIFIED | `34.11-REVIEW-FIX.md` frontmatter `fixed:19/open:3/invalid:1/total:23`, `status:partial`, `criticals_open:0`; todo `status:pending`; both name WR-10/WR-11/WR-18; no stale "five"/"5 open warnings" text in either file; arithmetic 19+3+1=23 checked |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `chipLabels.realI18next.test.ts` | Non-vacuous real-i18next assertions | ✓ VERIFIED | Exists, `createInstance` present, no `jest.mock('react-i18next')`, 11 kinds covered, reproduced failing against a mutated scratch catalog myself |
| `newCollectionFocus.test.tsx` | Direct-invocation proof intent reaches create input | ✓ VERIFIED | Exists, asserts `new-category-name` field's `autoFocus` for both intents |
| `src/frontend/types.ts` | `categoriesManagerIntent` on `LibraryContextType` | ✓ VERIFIED | `types.ts:329` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `FilterCollectionList/index.tsx` | `Library/index.tsx` | `setShowCategories(true, 'create'\|'manage')` | ✓ WIRED | Both call sites confirmed at lines 104/113 |
| `Library/index.tsx` | `CategoriesManager/index.tsx` | `categoriesManagerIntent` on LibraryContext | ✓ WIRED | State declared `index.tsx:385-396`, provided in context value `:1063-1064`, consumed `CategoriesManager/index.tsx:159,206` |
| `chipLabels.realI18next.test.ts` | `public/locales/en/gamelib.json` | `i18next-fs-backend` loadPath | ✓ WIRED | `existsSync` guard + real `loadPath`; confirmed by my own mutation proof against a scratch copy |

### Behavioral Spot-Checks / Independent Re-runs

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Targeted jest (4 task test files, full Frontend project runs regardless per known quirk) | `pnpm exec jest --selectProjects Frontend <4 paths>` | `Test Suites: 129 passed, 129 total` / `Tests: 2092 passed, 2092 total` | ✓ PASS |
| `pnpm codecheck` | `tsc --noEmit` | exit 0, clean | ✓ PASS |
| `pnpm exec eslint <9 changed files> --max-warnings=0` | eslint | `24 problems (0 errors, 24 warnings)` | ✓ PASS (matches SUMMARY) |
| Baseline eslint diff (0-new check) | overwrote `index.tsx`/`LibraryContext.tsx` in-place with `b85f3005d` content, ran eslint, restored via `cp` from backup (never `git checkout`) | baseline 22 + 1 = 23 warnings, same categories; restoration confirmed byte-identical to HEAD (`git diff HEAD` empty) | ✓ PASS — 0 new warnings confirmed independently |
| `pnpm lint-translations:gamelib` | lint-translations | exit 0; ENOENT stack traces for ~50 locales lacking `gamelib.json`, pre-existing and unrelated | ✓ PASS |
| `git diff --stat public/locales/` (full task range) | git diff | empty | ✓ PASS |
| `grep -rn eslint-disable` (full task diff, 9 files) | grep | no matches | ✓ PASS |
| `A-17 ANTI-ROT` known-red arithmetic | `pnpm exec jest --selectProjects Meta meta/__tests__/genI18nGateScope.test.ts` | `1 failed, 27 passed, 28 total` suites; `1 failed, 1 skipped, 603 passed, 605 total` tests; diff shows exactly 3 missing files (`PathSelectionBox/index.tsx`, `InstallModal/defaultPlatform.ts` pre-existing + `CategoriesManager/index.tsx` predicted) | ✓ PASS — matches SUMMARY's claimed arithmetic exactly, no unnoticed new breakage |
| `meta/i18nGateScope.json` / `i18nForkTouchedFiles.json` regenerated? | `git log b85f3005d..HEAD -- <both paths>` | empty | ✓ PASS — neither artifact touched |
| Concurrent commit `72da3b6f8` absorbed? | `git log b85f3005d..HEAD --oneline` + per-commit `--stat` | `72da3b6f8` is a standalone todo-doc commit (steam-depot stall watchdog), untouched by any of the three task commits; none of the three task commits reference steam-depot content | ✓ PASS — not absorbed |
| Debt markers (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) in 9 changed files | grep | none found | ✓ PASS |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| WR-08 | Two identical collection-manager rows | ✓ SATISFIED | Distinct `intent` argument, distinct `autoFocus` behavior, both proved non-vacuous in commit `a9b6ef51a` |
| WR-16 | Vacuous i18next-injection tests | ✓ SATISFIED | Real `i18next.createInstance()` harness, independently reproduced failing against a mutated scratch catalog, commit `4329529e0` |

### Anti-Patterns Found

None. No debt markers, no stub returns, no hardcoded-empty props, no `eslint-disable` additions in any of the 9 changed source/test files.

### Human Verification Required

None. This task involves plain function/state wiring and file-based test assertions, all independently reproducible via grep, jest, eslint, and tsc — no visual, real-time, or external-service behavior to verify.

### Gaps Summary

No gaps found. All five must-have truths verified with independent evidence (not merely the SUMMARY's claims): I read the actual wiring across `types.ts` → `LibraryContext.tsx` → `Library/index.tsx` → `FilterCollectionList/index.tsx` / `CategoriesManager/index.tsx`, ran the real test suite myself, ran eslint myself (including an independent 0-new-warnings check via a pre-existing-file overwrite/restore, confirmed byte-identical restoration), ran the known-red `A-17 ANTI-ROT` test myself and confirmed the predicted arithmetic, and — critically — built and ran my own scratch-catalog mutation proof for WR-16 rather than trusting the SUMMARY's recorded Jest output. Both ledgers reconcile to 19/3/1/23 with `status: partial` / `status: pending` unchanged, no stale "five" language remains, and the concurrent `72da3b6f8` commit was confirmed untouched by this task's three commits.

---

_Verified: 2026-08-27T10:45:03Z_
_Verifier: Claude (gsd-verifier)_
