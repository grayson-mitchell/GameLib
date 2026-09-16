---
phase: 44-in-app-winetricks-browse-ui-replacing-the-search-only-panel
plan: 06
subsystem: i18n

tags: [i18next, gamelib.json, translation.json, winetricks, locale-catalog, D-20]

# Dependency graph
requires:
  - phase: 44-02
    provides: "public/locales/en/gamelib.json winetricksBrowse block (13 keys), final and committed"
  - phase: 44-05
    provides: "corrected D-20(a) consumer census (removal set 5, not 6 -- winetricks.installing survives)"
provides:
  - "48 non-English gamelib.json catalogs carrying the full 13-key winetricksBrowse block, lint-translations:gamelib green"
  - "47 translation.json catalogs pruned of the 5 genuinely orphaned winetricks.* keys, with the 4 live-consumed survivors intact"
affects: [44-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Structural locale-file editing: locate a target JSON object by a distinguishing child key (here, \"search\") rather than by key name alone, when the same top-level key name appears more than once in a file for unrelated purposes"
    - "Diff-size sanity check must account for comma-rewrite churn, not just raw entry-line deletions, when removing a non-last key inside an object whose surviving last key changes"

key-files:
  created:
    - .planning/phases/44-in-app-winetricks-browse-ui-replacing-the-search-only-panel/deferred-items.md
  modified:
    - public/locales/*/gamelib.json (48 non-English files)
    - public/locales/*/translation.json (47 files)

key-decisions:
  - "Re-derived the Task 3 removal/survivor sets independently via grep against src/ rather than trusting either the plan's original text (6 removed / 3 survive) or the prompt's stated correction (5 removed / 4 survive) at face value -- both were verified, and the corrected 5/4 split held"
  - "Did not edit meta/i18nCatalogPresenceBaseline.json -- it already pinned the correct fully-filled end state (totalPairs: 0) and needed no change"
  - "Did not edit meta/i18nForkTouchedFiles.json, meta/i18nGateScope.json, or meta/__tests__/genI18nGateScope.test.ts despite one of their tests being red after this plan's commits -- measured the failure as pre-existing and unrelated (see Deviations), and those three files are explicitly owned by plan 44-07"
  - "Diff-size sanity for Task 3 (274 deletions vs. a derived 47x5=235 baseline, +16.6%) is explained in full by comma-rewrite churn (39 lines whose trailing-comma status changed, each showing as a paired delete+insert) -- not a serialiser round-trip or scope creep, and confirmed by two full per-file diff inspections plus a 47-file structural re-verification"

requirements-completed: [REQ-44-08, REQ-44-18]

duration: ~90min (across a session continuation)
completed: 2026-09-16
---

# Phase 44 Plan 06: Winetricks Locale Fill and Orphan Removal Summary

**Filled 624 (locale, key) `winetricksBrowse` pairs across 48 non-English `gamelib.json` catalogs to drive `lint-translations:gamelib` from 624 findings to 0, then structurally removed 5 genuinely-orphaned `winetricks.*` keys (not the plan's originally-stated 6) from 47 `translation.json` catalogs, preserving all 4 live-consumed survivors including `installing`.**

## Performance

- **Duration:** ~90 min (session continuation after a context compaction)
- **Completed:** 2026-09-16
- **Tasks:** 3/3 completed
- **Files modified:** 95 locale catalogs (48 `gamelib.json` + 47 `translation.json`), plus 1 new `deferred-items.md`

## Task 1: Re-measure `pnpm machine-fill-gamelib` once, and the glossary question

**Command:** `pnpm machine-fill-gamelib`
**Exit code:** `1`
**Verbatim output:**

```
> gamelib@0.7.0 machine-fill-gamelib /Users/graysonmitchell/Projects/GameLib
> node meta/runTs.cjs --bundle --platform=node --target=node21 meta/machineFillGamelib.ts

  ...6zm74fqyjf22r0000gn/T/gamelib-runts-Bhh4Qq/machineFillGamelib.cjs  18.5kb

⚡ Done in 2ms
::error::GAMELIB_MT_LOCALES is not set. D-08 ships this script BUILT and PROVEN on one or two
locales -- bulk-filling all 48 non-English locales is a separate, revertible commit, not this
run. Set GAMELIB_MT_LOCALES to a comma-separated list of locale codes (for example "de,fr") to
fill specific locales, or set it to "all" together with GAMELIB_MT_CONFIRM_BULK=1 to
deliberately opt into a full 48-locale bulk run.
 ELIFECYCLE  Command failed with exit code 1.
```

This is a `BulkRunRefusedError` -- a deliberate, by-design refusal to bulk-fill all 48 locales
without an explicit `GAMELIB_MT_LOCALES=all` + `GAMELIB_MT_CONFIRM_BULK=1` opt-in (D-08's own
stated intent: "a separate, revertible commit, not this run"). This is a different shape of
outcome than the `260915-t13` precedent's HTTP 401, but the plan's own branching instruction
("if it 401s or otherwise fails, record that verbatim and proceed to Task 2's hand-fill")
covers it: a deliberate non-write refusal is an "otherwise fails" outcome for the purpose of this
decision. **Path taken: hand-fill (Task 2), not machine-fill.** Confirmed the run wrote nothing:
`git status --short public/locales/` was empty immediately after this measurement.

**Glossary check:** `node -e "const g=require('./meta/i18nGlossary.json');console.log('Winetricks in glossary:', JSON.stringify(g).includes('Winetricks'))"` → `Winetricks in glossary: false`. **"Winetricks" is NOT a glossary term.** No value in the 13-key fill was therefore required to carry it verbatim (moot for `needsGuiTag`/`emptyBody`, which do contain "Winetricks" in the English source, but no glossary-survival constraint from `validateTranslation` applied).

## Task 2: Fill 13 `winetricksBrowse` keys into 48 non-English `gamelib.json` catalogs

**Validator-first, per D-10.** Built the full 48×13=624 candidate set in the session scratchpad first (`translations.py`), then ran `meta/machineFillGamelib.ts`'s exported `validateTranslation` (imported directly, `JEST_WORKER_ID=1` set to suppress its CLI-guard `main()` call) against every candidate before writing any file.

**First pass: 0 problems** across all 624 checks (bidirectional placeholder parity, empty-value check, `{{count}}` reserved-name check; glossary check was a no-op per Task 1's answer). Per the plan's own explicit prompt ("a run that reports zero problems on the first pass ... deserves a second look at whether the validator was actually invoked"), planted 4 synthetic defects across 3 locales (a dropped `{{total}}`, an emptied value, an injected `{{count}}`) and re-ran the identical validator script -- it caught all 4 correctly, confirming the validator was genuinely live, not a rubber stamp. Reverted to the real candidate set before writing.

**Editing mechanics.** Inserted the `winetricksBrowse` block as a top-level sibling immediately after each file's existing `winetricks` key, matching each file's own indentation -- no JSON-serialiser round-trip. First insertion pass omitted a trailing comma on the new block's closing brace (valid only because `en/gamelib.json` happens to have `winetricksBrowse` as its literal last key -- none of the 48 non-English files do), breaking JSON parsing in all 48 files; fixed with a targeted follow-up pass that adds the comma unless the new block is genuinely last.

**Verification:**
- `pnpm lint-translations:gamelib` → 0 findings, exit 0 (from 624 findings pre-fill).
- `npx jest --selectProjects Meta --passWithNoTests --silent gamelibCatalogParity` and `lintTranslations` → both green.
- Diff-size sanity: `git diff --numstat` → **720 inserted lines** across the 48 files, exactly matching the derived 48×15=720 expectation (13 keys + 2 braces per file), zero tolerance needed.
- No `winetricksBrowse.category.*` key, no `{{count}}` anywhere in the added block.
- `meta/i18nCatalogPresenceBaseline.json` needed no edit -- untouched, still pins `totalPairs: 0`.

**Committed:** `610311c3f` (`feat(44-06): fill 13 winetricksBrowse keys across 48 non-English gamelib.json catalogs`) -- 48 files changed, 720 insertions(+), 0 deletions.

## Task 3: Remove the orphaned `winetricks.*` keys from 47 `translation.json` catalogs

**Precondition re-derived, not trusted.** The plan's own text says "remove exactly 6 keys ... keep exactly 3" (`search`, `no-components`, `installed`, `nothingYet`, `installing`, `loading` removed; `install`, `openGUI`, `loading-available` survive). This was superseded before this plan ran: `44-05-SUMMARY.md`'s D-20(a) census found `winetricks.installing` has a live consumer at `WinetricksBrowse/Row/index.tsx:164` (a consumer plan 44-05 itself introduced), so removing it would ship a raw key string into the UI. Re-ran the same census independently immediately before editing:

```
grep -rEn "winetricks\.(search|no-components|installed|nothingYet)" src/   → 0 hits
grep -rn "winetricks\.loading'" src/                                        → 0 hits
grep -rn "winetricks\.install'\|winetricks\.installing\|winetricks\.openGUI\|winetricks\.loading-available" src/ | wc -l   → 7
```

**Confirmed removal set is 5, not 6: `search`, `no-components`, `installed`, `nothingYet`, `loading`. Survivor set is 4, not 3: `install`, `installing`, `openGUI`, `loading-available`.** This is a deviation from the plan's own literal Task 3 text -- see Deviations below.

**Structural removal.** Each of the 47 `public/locales/<locale>/translation.json` files has two objects matching `"winetricks": {` (an unrelated `error.winetricks` object with `message`/`title` keys, and the target 9-key object) -- disambiguated by checking for a `"search"` child key within the first ~20 lines, since only the target object has it. Verified programmatically across all 47 files that the target block always has exactly the expected 9-key set before editing. Removed the 5 orphaned entries per file, repairing trailing-comma placement wherever the removal changed which entry was last inside the block (never a blind line delete). Every file was re-parsed as JSON before being written back; all 47 passed.

**Post-edit verification:**
- All 47 files: valid JSON, exactly the 4 survivor keys, correct comma placement (spot-checked all 47 programmatically, plus two full per-file diffs inspected by eye: `de` and `fr`, both confined exactly to the `winetricks` block).
- Post-removal consumer census, re-run: 0 hits for all 5 removed keys, 7 hits confirming all 4 survivors still consumed.
- `pnpm lint-translations` (full, both namespaces): exit 0, 0 hard failures (the "Empty translation for ..." lines it prints are pre-existing, unrelated soft findings -- confirmed identical between `git show HEAD^` and the working tree for a spot-checked example, `ar.translation.winetricks.loading-available`).
- `pnpm lint-translations:gamelib`: still 0 findings.
- `meta/__tests__/gamelibCatalogParity.test.ts` and `meta/__tests__/lintTranslations.test.ts`: both green (230 tests).
- Diff-size sanity: `git diff --numstat` → **274 deleted lines, 39 inserted lines** across the 47 files. The plan's literal formula (`47×6=282`, stale -- written for the pre-correction 6-key removal set) and a naive re-derivation for the corrected 5-key set (`47×5=235`) both undercount this: the true total is 235 pure entry-line deletions **plus** 39 lines whose trailing-comma status changed as a result of the removal (each such line shows as a paired delete+insert in `git diff`, not a pure deletion). `235 + 39 = 274` reconciles exactly, and `39` inserted lines match `39` of those deletions 1:1. Confirmed via two full per-file diffs (`de`, `fr`) that every touched line sits inside the `winetricks` block and nothing else changed -- no serialiser round-trip, no unrelated edit.
- **Other gate artifacts enumerating these keys:** searched `meta/*.json` for `no-components`/`nothingYet`/`winetricksBrowse` -- no hits. No baseline or allowlist names these specific keys. (Two *unrelated* gates did react to this plan's file changes -- see Deviations.)

**Committed:** `e65b6275f` (`fix(44-06): remove 5 orphaned winetricks.* keys from 47 translation.json catalogs`) -- 47 files changed, 39 insertions(+), 274 deletions(-).

## Task Commits

1. **Task 1: Re-measure `pnpm machine-fill-gamelib`** -- no commit (measurement-only; `git status --short public/locales/` confirmed empty immediately after)
2. **Task 2: Fill 13 `winetricksBrowse` keys into 48 non-English `gamelib.json` catalogs** -- `610311c3f` (feat)
3. **Task 3: Remove 5 orphaned `winetricks.*` keys from 47 `translation.json` catalogs** -- `e65b6275f` (fix)

**Plan metadata:** this SUMMARY's own commit (see below)

## Deviations from Plan

### 1. [Correction, not a bug] Task 3's removal/survivor counts are 5/4, not the plan's stated 6/3

**Found during:** Task 3 precondition check.
**Issue:** `44-06-PLAN.md`'s own `<planner_decisions>` and Task 3 body both say "remove exactly 6 keys ... keep exactly 3" (including `installing` in the removal set). This was already superseded by `44-05-SUMMARY.md`'s D-20(a) census, which found `winetricks.installing` gained a live consumer (`WinetricksBrowse/Row/index.tsx:164`) from plan 44-05's own work, and by a prior commit on this branch (`6af3a85e1`, `docs(phase-44): mark 44-05 complete, correct 44-06 removal set 6 -> 5`) that had already recorded the correction at the phase-tracking level before this plan executed.
**Resolution:** independently re-ran the consumer census (see Task 3 above) before touching any file, confirmed the corrected 5/4 split, and executed against it rather than the plan's literal text. Removed: `search`, `no-components`, `installed`, `nothingYet`, `loading`. Kept: `install`, `installing`, `openGUI`, `loading-available`.
**Files modified:** the 47 `translation.json` files (see Task 3).
**Commit:** `e65b6275f`

### 2. [Rule 3 - Scope boundary, documented not fixed] `genI18nGateScope.test.ts`'s A-17 anti-rot check is red, pre-existing and unrelated

**Found during:** overall verification (`npx jest --selectProjects Meta --passWithNoTests --silent`, run after Task 3's commit).
**Issue:** one Meta test suite fails: `genI18nGateScope › staleness guard ... A-17 ANTI-ROT: the committed meta/i18nForkTouchedFiles.json equals the LIVE git derivation`. The live-computed fork-touched-file set (diffed against `package.json`'s pinned upstream `baseCommit`) differs from the committed 212-file snapshot by files this plan never touched (`WinetricksSearch`/`WinetricksBrowse`/`SearchBar` sources from earlier plans in this phase).
**Measured, not assumed, that this is pre-existing:** `diff <(git diff <baseCommit> 610311c3f^ --name-only -- public/locales | sort) <(git diff <baseCommit> HEAD --name-only -- public/locales | sort)` produces zero output -- the exact set of 191 fork-touched `public/locales/` paths is byte-identical before and after this plan's two commits. Every file this plan touched was already fork-touched relative to upstream before this plan edited it. This plan touched zero `src/` files.
**Disposition:** out of scope per the executor's scope-boundary rule, and additionally, `meta/i18nForkTouchedFiles.json`/`meta/i18nGateScope.json`/`meta/__tests__/genI18nGateScope.test.ts` are explicitly owned by plan 44-07 by this execution's own instructions -- not edited. Logged to `.planning/phases/44-in-app-winetricks-browse-ui-replacing-the-search-only-panel/deferred-items.md` (item `44-06-01`) for plan 44-07 to reconcile (likely via `pnpm gen-i18n-gate-scope`).

### 3. [Not a defect] A second Meta suite failure, `runTsSignals.test.ts`, is a load-induced flake

**Found during:** the same full-suite run above (`Test Suites: 2 failed`).
**Issue:** `runTsSignals.test.ts` (a signal-forwarding test for the `meta/runTs.cjs` wrapper, wholly unrelated to i18n) failed once inside the full 39-suite run (`expect(code).toBe(143)` mismatch).
**Resolution:** re-ran `runTsSignals.test.ts` in isolation -- all 8 tests passed cleanly in 21.5s. This matches a documented pattern in this repo's own operator memory (`full-suite-run-manufactures-failures-under-load.md`): running the entire Meta project concurrently induces process-scheduling timing flakes in signal tests that do not reproduce standalone. Not fixed (nothing to fix -- it is not reproducible), not related to this plan's changes.

### 4. [Rule 3] Two intermediate JSON-corruption bugs, caught and fixed before commit

**Found during:** Task 2's first insertion pass and confirmed structurally in Task 3's design.
**Issue:** Task 2's initial insertion script omitted a trailing comma on the new `winetricksBrowse` block's closing brace, assuming (wrongly, by analogy with `en/gamelib.json`) that the block would be the file's last top-level key. It never is in the 48 non-English files, so this broke JSON parsing in all 48 files at insertion time.
**Fix:** a targeted follow-up pass added the comma to every file where the new block was not genuinely last (all 48). Re-verified via a full JSON-parse pass across all 48 files afterward -- all passed. This was caught and fixed before anything was staged or committed; no broken state was ever committed.
**Files modified:** the same 48 `gamelib.json` files, before the Task 2 commit.
**Commit:** folded into `610311c3f` (never committed broken).

## Files Created/Modified

- `public/locales/{48 non-English locales}/gamelib.json` -- added the 13-key `winetricksBrowse` block as a top-level sibling of `winetricks`, matching each file's indentation. 720 total inserted lines.
- `public/locales/{47 locales with a translation.json}/translation.json` -- removed 5 orphaned `winetricks.*` keys, preserving the 4 survivors and repairing comma placement structurally. 274 deleted / 39 inserted lines total.
- `.planning/phases/44-in-app-winetricks-browse-ui-replacing-the-search-only-panel/deferred-items.md` -- new; records the pre-existing, out-of-scope `genI18nGateScope` A-17 failure for plan 44-07.

## STATE.md / ROADMAP.md

Per this execution's explicit instructions (standing ban on `gsd-sdk state.*`/`roadmap.*` writes; the orchestrator owns those writes), **this plan does not touch `.planning/STATE.md` or `.planning/ROADMAP.md` at all.** Confirmed via `git status --short .planning/STATE.md .planning/ROADMAP.md` -- empty. Both remain byte-identical to their state at the start of this execution.

## Verification Summary (final)

- `pnpm lint-translations:gamelib` -- exit 0, 0 findings.
- `pnpm lint-translations` (full) -- exit 0, 0 hard failures.
- `npx jest --selectProjects Meta --passWithNoTests --silent gamelibCatalogParity lintTranslations i18nCatalogChurnGuard` -- all green (the churn guard, which failed while Task 3's edits were uncommitted in the working tree, is green again once committed -- it is a working-tree-diff check, not a history check).
- `npx jest --selectProjects Meta --passWithNoTests --silent` (full 39-suite run) -- 37 passed, 2 failed: `genI18nGateScope` (pre-existing, deferred, see Deviations #2) and `runTsSignals` (load-induced flake, see Deviations #3; passes standalone).
- `pnpm lint` -- exit 0. Tests scope still exactly 638/638 (zero headroom, unaffected -- this plan touched no `src/` files). Production scope unaffected.
- `pnpm codecheck` (`tsc --noEmit`) -- exit 0.
- No `gsd-sdk state.*`/`roadmap.*`/`phase.complete`/`query commit` invocation anywhere in this execution.

## Next Phase Readiness

- Both of D-08's locale-catalog obligations for this phase are closed: `gamelib.json` is fully filled (49/49 catalogs) and `translation.json` is pruned of every genuinely orphaned `winetricks.*` key (47/47 catalogs, correctly preserving the one key -- `installing` -- that plan 44-05's own work turned back into a live consumer).
- Plan 44-07 has one concrete, measured, pre-scoped item waiting: reconcile `meta/i18nForkTouchedFiles.json` against the live git-derived fork-touched set (see `deferred-items.md` item `44-06-01`). This drift predates 44-06 and is not caused by it.

---
*Phase: 44-in-app-winetricks-browse-ui-replacing-the-search-only-panel*
*Completed: 2026-09-16*

## Self-Check: PASSED

- FOUND: `public/locales/de/gamelib.json` (modified, committed in `610311c3f`)
- FOUND: `public/locales/de/translation.json` (modified, committed in `e65b6275f`)
- FOUND: `.planning/phases/44-in-app-winetricks-browse-ui-replacing-the-search-only-panel/deferred-items.md`
- FOUND: this SUMMARY.md file on disk
- FOUND: commit `610311c3f` (Task 2) in `git log --oneline --all`
- FOUND: commit `e65b6275f` (Task 3) in `git log --oneline --all`
- `.planning/STATE.md` and `.planning/ROADMAP.md` confirmed untouched (`git status --porcelain` empty for both)
