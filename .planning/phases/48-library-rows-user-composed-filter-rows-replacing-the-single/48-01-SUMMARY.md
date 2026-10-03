---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
plan: 01
subsystem: i18n
tags: [i18next, l10n, gamelib-catalogue, locale-fill]

# Dependency graph
requires: []
provides:
  - "The four net-new `gamelib:library.filterPanel.*` keys (focusRow, focusRowViewsGroup, focusRowNext, focusRowPrevious) filled with non-empty strings across all 49 shipped `public/locales/*/gamelib.json` catalogues"
  - "All 48 non-en `gamelib.mt.json` provenance manifests stamp the four keys in their `keys[]` arrays, model/filledAt untouched"
  - "`pnpm lint-translations:gamelib` presence baseline stays at 0 findings / 0 hard failures with the four new keys present"
affects: [48-02, 48-03, 48-04]

# Actuals (#2632)
actuals:
  tokens: 17784
  tasks: 3
  commits: 3
  plan_head_before: eead922182372696eedaa7462475ba8adaa84fc5
  plan_head_after: 44d8c8a274023ab2a4279bdb2cf11d91d6e6e48b

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Non-en gamelib.json catalogues are NOT alphabetically re-sorted by the i18next parser (locales: ['en'] only) — new keys get inserted near the end of the file's historical append order, right after chipNoStorePageHidden and before groupSelectedCount_one, matching where Task 1's tracer placed them in de/zh_Hant."
    - "gamelib.mt.json keys[] arrays ARE alphabetically sorted in every locale, independent of catalogue body ordering — insert via a surgical line-splice at the correct alphabetical position, never via JSON.stringify(obj, null, N) over the whole object (that silently reformats every pre-existing line to the new indent width)."

key-files:
  created: []
  modified:
    - public/locales/en/gamelib.json
    - public/locales/de/gamelib.json
    - public/locales/zh_Hant/gamelib.json
    - public/locales/{44 other locales}/gamelib.json
    - public/locales/de/gamelib.mt.json
    - public/locales/zh_Hant/gamelib.mt.json
    - public/locales/{46 other locales}/gamelib.mt.json

key-decisions:
  - "Sourced de/zh_Hant/46-remaining-locale translations against each locale's own existing gamelib.json/translation.json vocabulary (e.g. de 'Ansicht' for view, zh_Hant/zh_Hans '檢視'/'视图', he 'משחקים' for games) rather than inventing new terms or leaving English loanwords."
  - "Did not attempt `pnpm machine-fill-gamelib` (hard-codes api.anthropic.com, ignores local ANTHROPIC_BASE_URL, returns 401 deterministically in this environment) — authored all 46 remaining locales in-session instead, per the plan's explicit instruction."
  - "Validated all 46 locales' translations through the real `validateTranslation()` from meta/machineFillGamelib.ts in a scratch jest test (deleted before commit), including a sabotage control (an introduced {{count}} placeholder) to prove the validator actually discriminates rather than rubber-stamping."
  - "R2 and R3 requirements NOT marked complete in REQUIREMENTS.md — both IDs are shared with sibling plans 48-02/48-03/48-04 which have not yet executed; requirements.ready-ids confirms both as blocked."

requirements-completed: []

coverage:
  - id: D1
    description: "All 49 gamelib.json catalogues carry non-empty focusRow/focusRowViewsGroup/focusRowNext/focusRowPrevious strings"
    requirement: "R2"
    verification:
      - kind: unit
        ref: "node verify script (Task 2 <automated>): 49-catalogue non-empty check"
        status: pass
      - kind: other
        ref: "pnpm lint-translations:gamelib"
        status: pass
    human_judgment: false
  - id: D2
    description: "en catalogue holds the exact locked strings from 48-UI-SPEC.md's Copywriting Contract, and pnpm i18n does not rewrite them"
    requirement: "R2"
    verification:
      - kind: unit
        ref: "Task 1 node verify script (en text-exact check)"
        status: pass
      - kind: other
        ref: "pnpm i18n && git diff --quiet -- public/locales/en/gamelib.json (I18N NO-OP CONFIRMED)"
        status: pass
    human_judgment: false
  - id: D3
    description: "All 48 non-en gamelib.mt.json manifests stamp the four keys; model/filledAt byte-identical before/after"
    requirement: "R3"
    verification:
      - kind: unit
        ref: "node verify script (Task 2 <automated>): manifest key-stamp check across 48 locales"
        status: pass
      - kind: other
        ref: "SHA-256 digest of {model, filledAt} captured before and after edit, all 48 locales, 0 mismatches"
        status: pass
    human_judgment: false
  - id: D4
    description: "Catalogue change clears the i18n churn guard and the full planning-gates CI battery"
    verification:
      - kind: other
        ref: "pnpm i18n-churn-guard"
        status: pass
      - kind: other
        ref: "pnpm planning-gates (12/12)"
        status: pass
    human_judgment: false

duration: ~11min (commit-to-commit; pre-compaction authoring time for Task 1 not separately captured)
completed: 2026-10-04
status: complete
---

# Phase 48 Plan 01: Focus-Row Catalogue Keys Summary

**Filled four net-new `gamelib:library.filterPanel.*` keys (focusRow, focusRowViewsGroup, focusRowNext, focusRowPrevious) across all 49 shipped locale catalogues and all 48 non-en provenance manifests, keeping the presence-baseline l10n gate at zero findings.**

## Performance

- **Duration:** ~11 min between first and last task commit (sandbox clock); Task 1's authoring happened before a mid-session context compaction and its wall-clock duration was not separately recorded
- **Completed:** 2026-10-04
- **Tasks:** 3/3 completed
- **Files modified:** 97 (49 `gamelib.json` + 48 `gamelib.mt.json`; `en`'s own `.mt.json` does not exist, hence 48 not 49)

## Accomplishments

- Added `focusRow` ("Focus row"), `focusRowViewsGroup` ("Views"), `focusRowNext` ("Show more games"), `focusRowPrevious` ("Show previous games") — the exact strings locked by `48-UI-SPEC.md`'s Copywriting Contract — to `public/locales/en/gamelib.json`
- Authored locale-appropriate translations for all 48 non-en locales (de and zh_Hant as the Task 1 tracer, the remaining 46 as Task 2), sourced against each locale's own existing vocabulary for "view"/"show more"/"game" terms
- Stamped all 48 non-en `gamelib.mt.json` manifests' `keys[]` arrays with the four new fully-qualified keys, leaving `model`/`filledAt` byte-identical (digest-verified before and after, all 48 locales)
- Proved `pnpm i18n` is a true no-op over the four locked `en` strings (no source call sites exist yet — those land in 48-02 through 48-04), and that the 49-file catalogue change clears `pnpm i18n-churn-guard` and all 12 `pnpm planning-gates`
- Validated every one of the 46 Task 2 translations through the project's real `validateTranslation()` (placeholder/glossary checker from `meta/machineFillGamelib.ts`) in a scratch jest run, including a sabotage control proving the validator rejects a deliberately broken translation

## Task Commits

Each task was committed atomically:

1. **Task 1: Author and stamp the tracer locales (en, de, zh_Hant)** - `085fa4efa` (feat)
2. **Task 2: Author and stamp the remaining 46 locales** - `721d6b6d5` (feat), corrected by `44d8c8a27` (fix — see Deviations)
3. **Task 3: Prove `pnpm i18n` is a no-op and both catalogue gates are green** - no commit (pure verification; zero files changed, confirmed by `git status` before and after)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `public/locales/en/gamelib.json` — four new keys inserted alphabetically between `emptyHeading` and `groupSelectedCount_one`
- `public/locales/{de,zh_Hant}/gamelib.json` + `.mt.json` — Task 1 tracer locales
- `public/locales/{ar,az,be,bg,br,bs,ca,cs,da,el,es,et,eu,fa,fi,fr,ga,gl,he,hr,hu,id,it,ja,ka,ko,lt,ml,nb_NO,nl,pl,pt,pt_BR,ro,ru,sk,sl,sr,sv,ta,th,tr,uk,uz,vi,zh_Hans}/gamelib.json` + `.mt.json` — Task 2's 46 locales

## Decisions Made

See `key-decisions` in frontmatter. In short: borrowed in-repo vocabulary per locale rather than inventing terms; skipped the broken `machine-fill-gamelib` network path entirely per plan instruction; validated with the real validator plus a sabotage control; left the two shared requirement IDs (R2, R3) unmarked pending sibling plans.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Task 2's initial mt.json edit reformatted the entire file instead of inserting four lines**
- **Found during:** Task 2, post-commit review of diff stats (`721d6b6d5` showed ~14,000 insertions/deletions across 46 files for what should have been a ~180-line semantic change)
- **Issue:** The Task 2 apply script read each `gamelib.mt.json` into memory and wrote it back via `JSON.stringify(mt, null, 4)`. Every file's native indent unit is 2 spaces (top-level keys at 2 spaces, array items at 4); `JSON.stringify(..., 4)` reformatted the whole file to a 4-space unit (top-level at 4, array items at 8), turning a 4-key addition into a full-file rewrite in the diff. Content was logically correct (right keys stamped, model/filledAt untouched, keys.length correct) but the diff shape was wrong and would have made every future diff against these files noisy.
- **Fix:** Reverted all 46 `gamelib.mt.json` files to their Task-1-era content (`git show 085fa4efa:<path>`) and reapplied the four-key insert as a surgical text-level line-splice at the correct alphabetical position (after `library.filterPanel.emptyHeading`, matching the file's own indentation), exactly mirroring the convention Task 1 already used for de/zh_Hant.
- **Files modified:** all 46 non-tracer `gamelib.mt.json` files
- **Verification:** post-fix diff against the Task 1 baseline is a clean 4-line insertion per file (`git diff 085fa4efa 44d8c8a27 -- public/locales/ar/gamelib.mt.json` → `1 file changed, 4 insertions(+)`); re-ran Task 2's full verify script, `pnpm lint-translations:gamelib`, and confirmed digest/keys.length invariants all still held
- **Committed in:** `44d8c8a27`

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in my own Task 2 tooling, not a plan defect)
**Impact on plan:** No scope creep; pure correctness fix to the shape of an already-correct content change. All acceptance criteria and `<verify>` blocks for both affected tasks re-ran green after the fix.

## Issues Encountered

None beyond the self-caught deviation above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plans 48-02 through 48-04 can now add real `tGamelib('gamelib:library.filterPanel.focusRow', ...)` (etc.) call sites — the catalogue values they'll resolve to already exist in all 49 locales and are gate-clean.
- `pnpm i18n` was proven a no-op over these four keys with zero call sites; once 48-02/03/04 land real call sites, a future `pnpm i18n` run remains expected to be a no-op against the already-authored `en` values (same keepRemoved:true / sort:true contract).
- R2 and R3 remain open in REQUIREMENTS.md pending 48-02/48-03/48-04.

## Self-Check: PASSED

- FOUND: `public/locales/en/gamelib.json`
- FOUND: `public/locales/de/gamelib.mt.json`
- FOUND: `public/locales/zh_Hans/gamelib.json`
- FOUND: `.planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-01-SUMMARY.md`
- FOUND commit: `085fa4efa` (Task 1)
- FOUND commit: `721d6b6d5` (Task 2)
- FOUND commit: `44d8c8a27` (Task 2 deviation fix)
