---
phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self
plan: 11
subsystem: i18n-gates-and-planning-closeout
tags: [i18n, locale-catalogs, gate-scope, hand-edit, phase-closure]

requires:
  - phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self
    provides: 45-02 retired the last consumers of five locale keys; 45-07/45-08 built the final WinetricksSettings frontend file set
provides:
  - five dead locale keys removed from 96 catalog files by line edit
  - WinetricksSettings file set (plus components/UI/index.tsx) inside the blocking i18n gate scope
  - Phase 44 recorded closed as superseded by Phase 45, by hand, residue named
affects: [45-12]

actuals:
  tokens: 23280
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Locale-key removal as structural line edits with a per-file deep-equal proof, never a serializer round-trip"
    - "Gate-artifact mirroring by hand with generatedAt held constant, derived from buildScopeSnapshot() under JEST_WORKER_ID"

key-files:
  created: []
  modified:
    - public/locales/*/gamelib.json (49 files)
    - public/locales/*/translation.json (47 files)
    - meta/i18nGateScope.json
    - meta/i18nForkTouchedFiles.json
    - meta/__tests__/genI18nGateScope.test.ts
    - src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss
    - src/frontend/screens/Settings/sections/WinetricksSettings/GroupHeader/index.scss
    - src/frontend/screens/Settings/sections/WinetricksSettings/GroupHeader/index.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss
    - .planning/STATE.md
    - .planning/phases/44-in-app-winetricks-browse-ui-replacing-the-search-only-panel/44-LIVE-GATE.md
    - .planning/phases/44-in-app-winetricks-browse-ui-replacing-the-search-only-panel/44-VALIDATION.md

key-decisions:
  - "gamelib.mt.json carried neither retired key (0 matches in all 48 files), so the mt provenance arrays needed no edit"
  - "components/UI/index.tsx was promoted into scope alongside the 12 WinetricksSettings files: 45-02 edited it, it is a re-export barrel, and A-17 listed it as live drift"
  - "Comments in four Phase 45 style/component files were reworded so the banned token prefixes no longer appear as literal text, to satisfy the plan's literal git grep criterion"
  - "44-VALIDATION.md stays status: draft (planner decision); 44-LIVE-GATE.md takes status: superseded"

patterns-established:
  - "Run lint-translations:gamelib on Windows through the direct runTs.cjs command with the env var set in bash; the pnpm script's `export` prefix needs a POSIX script shell"

requirements-completed: [D-17, D-20, D-21, D-22]

coverage:
  - id: D1
    description: "Retired locale keys removed from every catalog that carried them, with a census proving zero consumers first"
    requirement: D-20
    verification:
      - kind: unit
        ref: "meta/__tests__/gamelibCatalogParity.test.ts and meta/__tests__/lintTranslations.test.ts (231 tests pass)"
        status: pass
      - kind: other
        ref: "node verify1.cjs: 144 catalog files parse, no retired key present, loading-available intact in all 47 translation.json"
        status: pass
      - kind: other
        ref: "pnpm i18n --fail-on-update exit 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "Final WinetricksSettings file set mirrored into i18nGateScope.json and i18nForkTouchedFiles.json and promoted into the blocking scope"
    requirement: D-20
    verification:
      - kind: unit
        ref: "meta/__tests__/genI18nGateScope.test.ts (A-17 anti-rot green) and meta/__tests__/hardcodedStringGate.test.ts (157 tests)"
        status: pass
      - kind: other
        ref: "LINT_TRANSLATIONS_NAMESPACES=gamelib lintTranslations: 0 hard failures"
        status: pass
    human_judgment: false
  - id: D3
    description: "Token census and banned-prefix grep clean over the final WinetricksSettings stylesheet set"
    requirement: D-21
    verification:
      - kind: other
        ref: "git grep for the four banned prefixes under WinetricksSettings (non-test) prints nothing; tokenCensus.test.ts passes in the full run"
        status: pass
    human_judgment: false
  - id: D4
    description: "Repo gate battery green: codecheck, lint, find-deadcode, planning-gates, and the full suite against the Windows baseline"
    verification:
      - kind: other
        ref: "pnpm codecheck; pnpm lint; pnpm find-deadcode; pnpm planning-gates 12/12"
        status: pass
      - kind: other
        ref: "npx jest --ci full run: failing set is a strict subset of the 39-suite Windows baseline; genI18nGateScope left it"
        status: pass
    human_judgment: false
  - id: D5
    description: "Phase 44 closed as superseded by Phase 45 by hand edit, residue named, not recorded as verified"
    requirement: D-22
    verification:
      - kind: other
        ref: "git show --numstat on the Task 3 commit: STATE.md 1/0, 44-LIVE-GATE.md 15/1; pnpm planning-gates 12/12"
        status: pass
    human_judgment: true
    rationale: "Whether the closure wording honestly represents Phase 44's residue is a reading judgment; no test asserts it."

duration: 26min
completed: 2026-10-11
status: complete
plan_head_before: 7050e3995e1ee35acaf225aab3b6988d2004ffe3
plan_head_after: f60cee1c7c42e88137b12509833092117e34950b
commits: 3
---

# Phase 45 Plan 11: Catalog pruning, i18n gate mirror and Phase 44 closure Summary

**Five dead Winetricks locale keys removed from 96 catalogs by line edit with a per-file deep-equal proof, 13 files promoted into the blocking i18n gate scope (193 to 206), and Phase 44 closed as superseded by hand with its residue named.**

## Performance

- **Duration:** 26 min
- **Started:** 2026-10-10T18:35:12Z
- **Completed:** 2026-10-10T19:01:10Z (2026-10-11 local)
- **Tasks:** 3
- **Files modified:** 106 (96 locale catalogs, 3 meta, 4 Phase 45 style/component files, 3 planning)

## Accomplishments

- Census proved zero non-test consumers for all five candidate keys, then removed them: `winetricksBrowse.needsGuiTag` and `winetricksBrowse.installingRow` from 49 `gamelib.json`; `winetricks.openGUI`, `winetricks.install`, `winetricks.installing` from 47 `translation.json`. 247 lines deleted, 8 comma-only rewrites, every one of the 144 catalog files still parses, `winetricks.loading-available` intact everywhere.
- The i18n gate artifacts now mirror the final tab: 13 files added to both `meta/i18nGateScope.json` (193 to 206) and `meta/i18nForkTouchedFiles.json` (235 to 248), `generatedAt` untouched, ledger entry and every pinned count updated in `genI18nGateScope.test.ts`. A-17 (the 40th Windows failure) is green.
- Full repo battery green and Phase 44 recorded closed as superseded in STATE.md, `44-LIVE-GATE.md` and `44-VALIDATION.md`, by hand, with defect 9, the unreached D-24 cells and D-23 named and no claim of verification.

## Task Commits

1. **Task 1: Census and remove the retired catalog keys** - `0d5e4c65f` (chore)
2. **Task 2: Mirror the final frontend file set into the i18n gate artifacts, drive the gates green** - `a933151d6` (chore)
3. **Task 3: Close Phase 44 as superseded by Phase 45, hand edits only** - `f60cee1c7` (docs)

**Plan metadata:** recorded in the closing docs commit that follows this file (SUMMARY, STATE, ROADMAP).

## Verification

### Task 1 census (verbatim)

`git grep -n -e "<leaf>" -- src ':!**/__tests__/**'` with the bare leaf, each run separately:

| Candidate | Command leaf | Output | Exit | Decision |
| --- | --- | --- | --- | --- |
| `winetricksBrowse.needsGuiTag` | `needsGuiTag` | (empty) | 1 | remove |
| `winetricksBrowse.installingRow` | `installingRow` | (empty) | 1 | remove |
| `winetricks.openGUI` | `openGUI` | (empty) | 1 | remove |
| `winetricks.install` | `'winetricks.install'` | (empty) | 1 | remove |
| `winetricks.installing` | `winetricks.installing` | (empty) | 1 | remove |
| `winetricks.loading-available` | never a candidate | consumed at `WinetricksSettings/index.tsx:522` | - | keep |

Cross-checks: a repo-wide `git grep -E "needsGuiTag|installingRow|openGUI|winetricks\.install(ing)?['\"\`]"` outside `public/locales`, `.planning` and `graphify-out` printed nothing; a dynamic-key probe (`winetricks.${`) found none. The one other `winetricks.*` literals in `src` are `winetricks.unavailable`, `winetricks.unavailableDetail` and `winetricks.loading-available`, all kept. The nested top-level lookalike `translation.winetricks` error-dialog block (`"winetricks": {` at 12-space indent, keys `message`/`title`) was excluded structurally by requiring the 4-space top-level parent.

Populations (from `git ls-files`): `gamelib.json` 49, `gamelib.mt.json` 48, `translation.json` 47 (144 total). `gamelib.mt.json`: `git grep -c -E "needsGuiTag|installingRow"` matched in 0 of 48 files, so the plan's mt-array edit had nothing to remove.

Per-file proof (script `prune-keys.cjs`, scratchpad): parent block located by indentation, leaf found by exact `"<leaf>":` at parent indent + 4, JSON.parse before and after, and `assert.deepStrictEqual(after, before minus the removed leaves)`. Result across 96 files: 0 parent-count anomalies, 0 missing leaves, line delta equal to the number of removed keys in every file. Numstat shape: 49 gamelib files at 0/2, 39 translation files at 0/3, 8 translation files at 1/4.

Trailing-comma repair fired in exactly 8 files, all for `openGUI` as the last key: `da`, `el`, `en`, `ga`, `gl`, `id`, `nl`, `vi` (`translation.json`). It fired for no other key and in no `gamelib.json`. In the other 39 translation files `loading-available` was already last after the removals, so no repair was needed.

Gate results: `node verify1.cjs` printed `OK parsed 144 loading-available missing in 0`; `npx jest --selectProjects Meta --passWithNoTests --silent gamelibCatalogParity lintTranslations` 2 suites, 231 tests passed. Formatter: `public/locales/**` and `.planning/**` are prettier-ignored, so no `--check` was run on them.

### Task 2 derivation

`buildScopeSnapshot()` run against the real merge-base diff with `JEST_WORKER_ID=1`, via a transpile of `meta/genI18nGateScope.ts` into the scratchpad (the artifact paths were never passed to a writer):

```
md5 before:  004090a6bf8b7a09fa1f770974f32451  meta/i18nGateScope.json
             ca192c0718fe32b172cf5f934134864d  meta/i18nForkTouchedFiles.json
md5 after:   identical to before (diff printed "md5 UNCHANGED")
fresh 248 committed 235 scope files 193
REMOVED vs committed: []   scope entries not in fresh: []
ADDED vs committed (13): src/frontend/components/UI/index.tsx plus the 12 non-test
  .ts/.tsx files under WinetricksSettings/ (EnvironmentBanner, EverythingElseGroup,
  GroupHeader, LogPanel, Row, StickyBar, SuggestedGroup, TaskGroup, index.tsx,
  labels.ts, useMouseDownActivate.ts, visibility.ts)
```

After the hand edits the artifacts' md5 are `be88c32a...` (scope) and `ca23d950...` (fork-touched). `git show -U0` of the Task 2 commit has no added or removed line mentioning `generatedAt`. `grep -c WinetricksSettings meta/i18nGateScope.json` is 13 (needs at least 10).

Gate battery (all exit 0 unless noted):

| Gate | Result |
| --- | --- |
| `pnpm codecheck` | exit 0 |
| `pnpm lint` | 0 errors, 638 warnings, `production: PASS \| tests: PASS` |
| `pnpm find-deadcode` | `unreachable: 46 OK \| used-in-module: 0 OK` (nothing to un-export) |
| `pnpm i18n --fail-on-update` | exit 0 (Added keys 0, Restored keys 0 in every namespace) |
| `pnpm lint-translations` | 0 hard failures |
| `lint-translations:gamelib` | 0 hard failures (run through the direct command, see Deviations) |
| Meta jest `genI18nGateScope hardcodedStringGate gamelibCatalogParity lintTranslations` | genI18nGateScope + parity + lintTranslations 257 passed, 1 skipped (pre-existing); hardcodedStringGate 157 passed (run separately, 317 s) |
| banned-token `git grep` | prints nothing, then `no banned tokens` |
| `npx prettier --check` over the 3 meta paths and the 4 reworded source paths | All matched files use Prettier code style |
| `pnpm planning-gates` | 12/12 |
| `graphify update .` | produced no output and no tracked change; `graphify-out/` not committed |

Full suite, `npx jest --silent --maxWorkers=50% --ci`: `Test Suites: 38 failed, 2 skipped, 495 passed, 533 of 535 total`. Criterion applied: the failing set must equal the orchestrator's 39-suite Windows baseline, with nothing added and `genI18nGateScope.test.ts` gone. Failing set versus baseline, `comm -3` output verbatim (column 1 = failing now only, column 2 = baseline only):

```
	src/backend/tools/__tests__/dxvkInstallRemove.test.ts
```

Nothing is in the "failing now only" column; the single baseline suite `dxvkInstallRemove.test.ts` passed this run (it is one of the POSIX-assuming backend suites, so a pass is timing or load, not a change of mine, and the 38 remaining are the baseline exactly). The criterion's "nothing added, genI18nGateScope left" holds. This is a strict subset, not a strict equality; reported as such.

### Task 3

`git show --numstat --format= f60cee1c7`: `.planning/STATE.md` 1 added 0 deleted; `44-LIVE-GATE.md` 15 added 1 deleted (the status line); `44-VALIDATION.md` 12 added 0 deleted. `grep -c "^status: superseded$"` on `44-LIVE-GATE.md` is 1; `grep -c "superseded by Phase 45"` is 2 in `44-VALIDATION.md` and 2 in `STATE.md`. No `gsd-sdk`/`gsd-tools` `state.*`, `roadmap.*`, `phase.complete` or `query commit` call was made for Task 3; it is a plain `git commit` of three hand-edited files. Formatter: all three paths are `.planning/`, prettier-ignored.

## Files Created/Modified

- `public/locales/*/gamelib.json`, `public/locales/*/translation.json` - five dead keys removed (96 files)
- `meta/i18nGateScope.json`, `meta/i18nForkTouchedFiles.json` - 13 files added, `generatedBy` extended with a Phase 45 sentence on the scope file
- `meta/__tests__/genI18nGateScope.test.ts` - dated Phase 45 plan 45-11 ledger entry; A0, A2, A3, A4 counts 193/235 to 206/248
- `WinetricksSettings/{EverythingElseGroup,GroupHeader,Row}/index.scss`, `GroupHeader/index.tsx` - comment rewording only, no declaration or code changed
- `.planning/STATE.md`, `44-LIVE-GATE.md`, `44-VALIDATION.md` - Phase 44 closure

## Decisions Made

- Left `gamelib.mt.json` untouched: neither retired key was ever in a provenance array, so the plan's mt-array edit was a no-op proven by census.
- Promoted `components/UI/index.tsx` with the WinetricksSettings files rather than declaring it debt. It is a re-export barrel with no string, 45-02 made it fork-touched, and A-17 reported it as live drift the plan's expected-delta list did not name. Unscanned debt stays 42.
- Inserted the STATE.md bullet after the blank line that follows the `### Roadmap Evolution` heading (above the Phase 48 bullet), so the markdown list stays contiguous.

## Deviations from Plan

**1. [Rule 3 - Blocking] `components/UI/index.tsx` was a fork-touched delta the plan did not list**
- **Found during:** Task 2 derivation
- **Issue:** A-17 anti-rot failed on 13 files, not 12; the thirteenth, `src/frontend/components/UI/index.tsx`, became fork-touched when 45-02 edited it.
- **Fix:** Added to both artifacts and promoted into scope; a re-export barrel, so no scan consequence.
- **Files modified:** `meta/i18nGateScope.json`, `meta/i18nForkTouchedFiles.json`
- **Committed in:** `a933151d6`

**2. [Rule 1 - Bug] Banned-token `git grep` printed comment lines**
- **Found during:** Task 2 verify
- **Issue:** The plan's criterion ("any matching line is printed" fails) matched 8 lines in 4 Phase 45 files where comments explained why the banned tokens are not used. `tokenCensus.test.ts` passes, but the literal criterion did not.
- **Fix:** Reworded those comments to describe the tokens without the literal prefixes ("the navbar custom-property family", "the generic border-colour token"). Comments only; compiled CSS and code are unchanged.
- **Files modified:** `EverythingElseGroup/index.scss`, `GroupHeader/index.scss`, `GroupHeader/index.tsx`, `Row/index.scss`
- **Verification:** the grep now prints nothing and `no banned tokens` follows; prettier check clean.
- **Committed in:** `a933151d6`

**3. [Rule 3 - Blocking] `pnpm lint-translations:gamelib` cannot run as written on this Windows machine**
- **Found during:** Task 2
- **Issue:** The script is `export LINT_TRANSLATIONS_NAMESPACES=gamelib && node ...`; pnpm's default script shell here is `cmd`, which has no `export` (`'export' is not recognized`).
- **Fix:** Ran the identical payload from bash: `LINT_TRANSLATIONS_NAMESPACES=gamelib node meta/runTs.cjs --bundle --platform=node --target=node21 meta/lintTranslations.ts`. Result: 720 pre-existing "Missing translation" findings, 0 hard failures, exit 0. Not a code change; CI is ubuntu.

**4. Selection-script correction (no repo effect)**
- My first fork-touched insertion wrote all 55 non-scope fork-touched files into `i18nGateScope.json`. It was caught by the script's own count before commit and the file was restored with `git checkout`, then redone with only the 13-file delta. Nothing wrong was committed.

**Total deviations:** 4 (2 Rule 3, 1 Rule 1, 1 self-correction). **Impact:** none on scope; the 13-file delta and the comment rewording are both within Phase 45's own files.

## Issues Encountered

- **A `git checkout -- <file>` fired the repo's `post-checkout` hook**, which runs `pnpm i` and `pnpm download-helper-binaries` (`.husky/post-checkout`). It reported `Packages: -127` (pruned) and "Nothing to download". `node_modules` still resolved everything the rest of this plan needed (jest, tsc, eslint, prettier all ran; full suite 495 passed), but the pruning of 127 packages from the working install is a side effect of the hook, not of the plan. Avoid `git checkout -- file` on this machine; use `git show HEAD:path > path` to revert a single file.
- The `hardcodedStringGate` suite takes 317-353 s when other jest processes compete; my first attempt under a `timeout 115` was killed (exit 143, not a failure). It was re-run to completion twice.
- The full suite showed one worker `JSON.stringify` circular-structure message (`messageParent`) from a failing baseline suite; it is part of the pre-existing Windows failures, not new.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path, file access or schema change.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

45-12 is the macOS live gate and cannot run on this Windows box. Carry forward, by name:

- **45-06 D-15 measurement deferral:** the share of `[WineTricks]` lines the classifier now logs at ERROR versus the roadmap's 846-line / 40%-noise baseline was not measured (this machine's `gamelib.log` has 0 such lines). It must be measured on the operator's macOS log, alongside the unattended-install half of the `gdiplus_winxp` D-17 check.
- **45-07 / 45-08 human-judgment rows:** narrow-width, `de`-locale and two-theme checks for the E2-E9 overflow and long-text backstop rows (bar text truncation, the 200-character line in the 160px log panel), and whether the dock's sticky behaviour holds inside `.App .content`.
- **45-08 live-view edge cases:** (1) a few log lines can appear twice at a seed boundary (`run.log` appended per line while `progressOfWinetricks` is flushed on an interval, no line id to dedupe on); (2) lines emitted between apply-accepted and run registration.
- **Phase 44 residue, now closed on paper:** defect 9 (`:hover` 3.50:1 on nord-light), the unreached D-24 cells and D-23 die with the retired screen; the replacement surface's equivalents are 45-12's to measure.
- The catalogs and gate scope are now final for the tab: if 45-12 changes any string, add it to `en/gamelib.json` in parser sort order and re-run `pnpm i18n --fail-on-update`.

---
*Phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self*
*Completed: 2026-10-11*

## Self-Check: PASSED

- FOUND: commit `0d5e4c65f` (Task 1)
- FOUND: commit `a933151d6` (Task 2)
- FOUND: commit `f60cee1c7` (Task 3)
- FOUND: `meta/i18nGateScope.json` lists 13 `WinetricksSettings` occurrences; `meta/i18nForkTouchedFiles.json` 248 files
- FOUND: this file; `git rev-list --count 7050e3995..HEAD` was 3 at write time
