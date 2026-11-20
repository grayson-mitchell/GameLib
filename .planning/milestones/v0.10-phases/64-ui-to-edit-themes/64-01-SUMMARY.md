---
phase: 64-ui-to-edit-themes
plan: 01
subsystem: ui
tags: [themes, colour, contrast, wcag, scss, jest, i18n-gate]

requires: []
provides:
  - "frontend/testUtils/scssTokenSource: fs-free SCSS block parsers (cssBlock, customProps, allBlocksFor, globalTokensFrom, themeTokensFrom)"
  - "frontend/customThemes/colour: legacy pinned colour math plus a total, never-throwing user-input colour API"
  - "frontend/customThemes/tokenResolve: var() chain and color-mix(in srgb) resolution"
  - "frontend/customThemes/contrastFloors: CONTRAST_FLOORS (three pure 3:1 pairs) and checkFloors, the single floor table (D-16)"
affects: [64-02, 64-03, theme token generator, theme thumbnail, theme editor warnings]

actuals:
  tokens: 13850
  tasks: 3
  commits: 11
plan_head_before: 2e346038801d74bd25090511412c5cba96a316d8
plan_head_after: 7e63b1729ca63dd31b5f7e25aac5f058da4d64bb

tech-stack:
  added: []
  patterns:
    - "Modules later bundled by meta/runTs.cjs use relative imports only (it ignores tsconfig baseUrl)"
    - "Total (null-returning, never-throwing) parsers for editor keystroke input; the legacy throwing contrastRatio stays for tests and the generator"

key-files:
  created:
    - src/frontend/testUtils/scssTokenSource.ts
    - src/frontend/customThemes/colour.ts
    - src/frontend/customThemes/tokenResolve.ts
    - src/frontend/customThemes/contrastFloors.ts
    - src/frontend/customThemes/__tests__/colour.test.ts
    - src/frontend/customThemes/__tests__/contrastFloors.test.ts
    - .planning/todos/pending/2026-11-18-themetokens-render-site-census-finds-37-sites-expects-34.md
  modified:
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
    - meta/i18nForkTouchedFiles.json
    - meta/i18nGateScope.json
    - meta/__tests__/genI18nGateScope.test.ts

key-decisions:
  - "Lifted helpers keep identical semantics; contrastRatio now shares a private ratioOf with tryContrast so the formula exists once"
  - "tryContrast measures a partly transparent background as opaque (the legacy toRgb behaviour the built-in floors were measured with); only alpha 0 on either side yields null"
  - "The i18n gate exemption for tokenResolve.ts is declaration-level (resolveColour only), not file-level"

requirements-completed: [THEME-01, THEME-02]

duration: 16min
completed: 2026-11-17
status: complete
---

# Phase 64 Plan 01: Shared theme colour, resolver and floor modules Summary

**The colour math, var()/color-mix resolver and SCSS block parsers now live in shared modules, a total never-throwing colour API exists for user-typed input, and one CONTRAST_FLOORS table drives both the CI theme test and the future editor.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-11-17T18:11:30Z
- **Completed:** 2026-11-17T18:27:02Z (SUMMARY committed shortly after)
- **Tasks:** 3 (one tracer, two TDD)
- **Files modified:** 11 (6 new source and test files, 4 modified, 1 new todo)

## Accomplishments

- Task 1 (tracer): moved 11 private helpers out of the 3,674-line `themeTokens.test.ts` into `scssTokenSource.ts`, `colour.ts` and `tokenResolve.ts`. The test imports them and keeps `globalTokens`/`themeTokens` as one-line wrappers. 288 tests still pass and the only failure is the pre-existing render-site census case. Tracer verified end-to-end before expansion.
- Task 2 (TDD): `parseColour`, `normaliseColour`, `tryContrast`, `safeColour`, `formatRatio` in `colour.ts`. 17 tests, including a 50+ malformed-string loop asserting nothing throws (T-64-01). `formatRatio(2.96)` is `2.9`.
- Task 3 (TDD): `CONTRAST_FLOORS` (border-body, border-modal, accent-body, each 3:1) and `checkFloors` (only `ratio < min` fails). All 10 built-in themes pass. `themeTokens.test.ts` now reads its border and chevron minimums from the table, so the value has one source.
- i18n gate scope: four new fork-touched files recorded in `i18nForkTouchedFiles.json` (408 to 412) and `i18nGateScope.json` (287 to 291), count pins updated. This also settles the note the phase 81 plan 08 session left in `genI18nGateScope.test.ts` about three phase-64 files it could not place.

## TDD Gate Compliance

| Task | RED commit | GREEN commit |
| ---- | ---------- | ------------ |
| 2 | `25614d9cc` test(64-01): colour API | `595973590` feat(64-01): colour API |
| 3 | `54b567f6a` test(64-01): CONTRAST_FLOORS | `7c4daaeff` feat(64-01): CONTRAST_FLOORS |

RED evidence: each RED commit carries signature stubs returning wrong values (`null`, `''`, empty floor table), because ts-jest type-checks and a missing export would be a compile failure, which is INVALID_RED. With stubs the suites compile, the target tests execute, and they fail on assertions: Task 2 had 10 of 17 failing, Task 3 had 13 of 15 failing. The remaining RED passes were the null-path cases, which a null stub satisfies legitimately. The tests were run directly and not through `gsd_run check tdd-red-evidence` (the repo does not run with `workflow.tdd_mode`). No REFACTOR commit was needed.

## Task Commits

1. Task 1 (tracer): `480e20ad8` refactor(64-01): lift theme colour math, var() resolver and SCSS parsers into shared modules
2. Task 2 RED: `25614d9cc`; GREEN: `595973590`
3. Task 3 RED: `54b567f6a`; GREEN: `7c4daaeff`
4. Gate scope follow-up: `7e63b1729` chore(64-01): record the shared theme-token modules in the i18n gate scope

Note on `actuals.commits: 11`: that is the measured `rev-list --count` from the ledger base. Six of the eleven are this plan's own commits listed above; the other five (`a1fb01883`, `44fd897d3`, `43ac5b53d`, `44f3f77e2`, `8c8e729f1`) are phase 81 and spike commits that other sessions landed on `main` while this plan ran.

## Files Created/Modified

- `src/frontend/testUtils/scssTokenSource.ts` - string-in, Map-out SCSS parsers; no fs, no imports
- `src/frontend/customThemes/colour.ts` - `NAMED_COLOURS`, `toRgb`, `contrastRatio`, `mixSrgb` (unchanged behaviour) plus the total API
- `src/frontend/customThemes/tokenResolve.ts` - `resolveValue`, `resolveColour`
- `src/frontend/customThemes/contrastFloors.ts` - `CONTRAST_FLOORS`, `checkFloors`
- `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` - imports shared modules, reads floor minimums from the table
- `meta/i18nForkTouchedFiles.json`, `meta/i18nGateScope.json`, `meta/__tests__/genI18nGateScope.test.ts` - gate scope bookkeeping

## Decisions Made

See `key-decisions` in the frontmatter. One implementation note: `relativeLuminance` stays module-private in `colour.ts` (nothing outside imports it), which keeps the knip ratchet green.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] genI18nGateScope.test.ts hard-codes the fork-touched and scope counts**
- **Found during:** Task 3 (gate scope step)
- **Issue:** After regenerating `i18nForkTouchedFiles.json` (412) and hand-adding four paths to scope (291), the A0, A2, A3 and A4 cases failed on pinned `408`/`287`. The plan listed only the two JSON files.
- **Fix:** Updated the eight pinned occurrences and added a dated log paragraph, following the phase 81 plan 08 precedent in that file.
- **Files modified:** `meta/__tests__/genI18nGateScope.test.ts`
- **Commit:** `7e63b1729`

**2. [Rule 3 - Blocking] hardcodedStringGate flagged two CSS literals in tokenResolve.ts**
- **Found during:** Task 3
- **Issue:** `'color-mix('` and `'in srgb'` in `resolveColour` were reported as user-facing strings once the file entered scope. The plan anticipated this for Error messages and suggested a file-level `i18n-gate-exempt:` marker.
- **Fix:** Used the declaration-level form of the same marker on `resolveColour` only. The gate's own comment calls the file-level marker the largest-blast-radius exemption in the gate, and the exemption is only needed for one statement. `resolveValue` and the helpers stay scanned.
- **Files modified:** `src/frontend/customThemes/tokenResolve.ts`
- **Commit:** `7e63b1729`

**3. [Rule 2 - Missing] No todo recorded the pre-existing render-site census failure**
- **Issue:** The plan required a todo if none names the failing census case.
- **Fix:** Added `.planning/todos/pending/2026-11-18-themetokens-render-site-census-finds-37-sites-expects-34.md` (`severity: minor`, `platform: any`, `ready: code`). `pnpm planning-gates` todo-frontmatter gate passes.

**Total deviations:** 3 (2 blocking, 1 missing-item). **Impact:** none on behaviour; all are gate or bookkeeping accommodations.

## Issues Encountered

- The `render-site census` case in `themeTokens.test.ts` finds 37 sites against a pin of 34. Pre-existing at HEAD, deliberately not fixed here (todo recorded).
- `pnpm planning-gates` reports 11/12: the `preload-surface-gate.py` failure names four `steamAdoption*`/`steamLaunchWithoutSteamOnce` channels from phase 81 work. Unrelated to this plan.
- `pnpm find-deadcode` reports three findings, none in this plan's files: `Steam.handleSteamAdoptionStatusChanged` (an uncommitted phase 81 change in `src/preload/api/steam.ts`) and two `NativePort*` types in `src/common/nativePortCatalogue.ts`.
- A first run of the gate-scope jest invocation went to the background because of a BSD `sed` range-flag error in my own command; it was rerun in full afterwards and passes.

## Known Stubs

None. The RED-phase signature stubs were replaced in the GREEN commits.

## Threat Flags

None. T-64-01 (denial of service via the colour parser) is mitigated by the total API and its 50+ string no-throw test; T-64-02 by the 288-test gate on `themeTokens.test.ts`.

## Verification

- `pnpm exec jest src/frontend/customThemes src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts`: 320 passed, 1 failed (the pre-existing census case).
- `pnpm exec jest meta/__tests__/genI18nGateScope.test.ts meta/__tests__/hardcodedStringGate.test.ts`: 202 passed, 1 skipped, 0 failed.
- `pnpm codecheck` exits 0. `eslint` over the changed files is clean. `npx prettier --check` over every written path: clean (each path confirmed not ignored by `--file-info` first).
- Acceptance greps: lifted-helper definitions left in `themeTokens.test.ts` = 0; `from 'frontend/customThemes/colour'` = 1; `CONTRAST_FLOORS` in `themeTokens.test.ts` = 3; `contrastFloors.ts` in `i18nGateScope.json` = 1; `export function tryContrast` = 1; `__tests__` references in the three src modules = 0.

## Next Phase Readiness

The token generator, thumbnail and editor-warning plans can import `tryContrast`, `normaliseColour`, `safeColour`, `formatRatio`, `checkFloors`, `resolveColour` and the SCSS parsers directly, using relative imports under `meta/runTs.cjs`.

## Self-Check: PASSED

- Files: scssTokenSource.ts, colour.ts, tokenResolve.ts, contrastFloors.ts, colour.test.ts, contrastFloors.test.ts and the todo all exist on disk.
- Commits: 480e20ad8, 25614d9cc, 595973590, 54b567f6a, 7c4daaeff and 7e63b1729 are ancestors of HEAD.
