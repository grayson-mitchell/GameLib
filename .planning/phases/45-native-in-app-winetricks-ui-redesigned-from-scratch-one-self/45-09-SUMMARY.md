---
phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self
plan: 09
subsystem: i18n
tags: [i18next, winetricks, localization, cldr-plurals, applyFill]

# Dependency graph
requires:
  - phase: 45-03
    provides: "winetricksBrowse copy table (33 non-plural keys + 4 plural bases: applyAriaLabel, selectedCount, installedCount, failedCount) and the canonical English source values"
provides:
  - "24 of 48 non-English locales (batch A) carrying every new winetricksBrowse key, hand-authored, validator-gated, provenance-stamped: ar, az, be, bg, br, bs, ca, cs, da, de, el, es, et, eu, fa, fi, fr, ga, gl, he, hr, hu, id, it"
affects: ["45-10 (batch B: the remaining 24 locales)", "winetricks-browse-ui", "i18n-coverage"]

# Actuals (#2632)
actuals:
  tokens: 67054
  tasks: 3
  commits: 3
  plan_head_before: 08126ec40035c7c47a19cb10728c76ddf7edc5e3
  plan_head_after: b42d77d1e011951840988701b9196c21aba94a44

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "In-session hand-authored translation through a validate-before-write staging tool (applyFill.ts), never a hand-edited catalog and never a network translation service"
    - "Always include {{count}} in every CLDR plural form regardless of whether that form is countOptional for the locale — a safe default that never fails the placeholder-preservation validator"
    - "Reuse each locale's existing Phase-44 winetricksBrowse terminology (Installed/Install failed/Retry/search copy) for new keys so the tab reads consistently"

key-files:
  created:
    - .planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-i18n-fill/{ar,az,be,bg,br,bs,ca,cs,da,de,el,es,et,eu,fa,fi,fr,ga,gl,he,hr,hu,id,it}.json (staging files, one per locale)
  modified:
    - public/locales/{ar,az,be,bg,br,bs,ca,cs,da,de,el,es,et,eu,fa,fi,fr,ga,gl,he,hr,hu,id,it}/gamelib.json
    - public/locales/{ar,az,be,bg,br,bs,ca,cs,da,de,el,es,et,eu,fa,fi,fr,ga,gl,he,hr,hu,id,it}/gamelib.mt.json

key-decisions:
  - "Always included {{count}} in every plural form, never omitted it even for CLDR categories that would technically allow countOptional omission — this avoided a second class of validator failure after the Task 1 br fix"
  - "Irish (ga) required the full five-category CLDR set (one/two/few/many/other) for all four plural bases; pragmatic best-effort mutation forms were used (lenition for one/two/few, eclipsis for many) rather than attempting full dialectal precision"

requirements-completed: [D-08, D-20]

coverage:
  - id: D1
    description: "All 24 batch-A locales carry a non-empty value for every new winetricksBrowse key, including every CLDR plural form requiredPluralKeys demands for that locale"
    requirement: "D-20"
    verification:
      - kind: other
        ref: "node -e completeness probe comparing flattened en keys against all 24 locale catalogs (see task verify blocks); 0 unfilled keys reported"
        status: pass
      - kind: unit
        ref: "meta/__tests__/gamelibCatalogParity.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every value was validated by validateTranslation (placeholders and glossary terms) through applyFill.ts --check before being written; no locale written with an open problem"
    requirement: "D-20"
    verification:
      - kind: other
        ref: "JEST_WORKER_ID=1 node meta/runTs.cjs ... applyFill.ts --locales <batch> --check (run before each write; clean on Task 2 and Task 3 first attempt, one fix applied and re-verified on Task 1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Each locale's gamelib.mt.json lists the newly filled winetricksBrowse keys; model and filledAt left untouched versus the parent commit"
    requirement: "D-20"
    verification:
      - kind: other
        ref: "git diff inspection of each gamelib.mt.json: only the keys array grew; model/filledAt byte-identical"
        status: pass
    human_judgment: false
  - id: D4
    description: "The 13 family.* sentences are translated as family-level descriptions, not per-verb text, across all 24 locales"
    requirement: "D-08"
    verification: []
    human_judgment: true
    rationale: "Translation quality/tone and whether a sentence reads as family-level vs per-verb is a judgment call across 24 languages, several outside the executor's strongest languages (ar, he, ga, bg, be, fa) — a human fluent reviewer is the appropriate check, not an automated rule."

duration: ~95min
completed: 2026-10-10
status: complete
---

# Phase 45 Plan 09: Fill Winetricks i18n Keys — Batch A (24 Locales) Summary

**Hand-authored, validator-gated translations for the new Winetricks `winetricksBrowse` keys across 24 non-English locales (ar, az, be, bg, br, bs, ca, cs, da, de, el, es, et, eu, fa, fi, fr, ga, gl, he, hr, hu, id, it), applied exclusively through `applyFill.ts`'s validate-before-write pipeline with provenance stamped in each `gamelib.mt.json`.**

## Performance

- **Duration:** ~95 min
- **Started:** (session spans a prior compaction boundary; exact start not captured)
- **Completed:** 2026-10-10
- **Tasks:** 3 completed
- **Files modified/created:** 72 (24 locales × 3 files: `gamelib.json`, `gamelib.mt.json`, staging `45-i18n-fill/<locale>.json`)

## Accomplishments
- Authored and validated all 41–57 required `winetricksBrowse` keys (including CLDR plural expansions) for 24 locales, spanning CLDR plural systems from the simplest (`one`/`other`: gl, hu, id) to the richest (`one`/`two`/`few`/`many`/`other`: ga; six-form Arabic: ar)
- Every value passed `validateTranslation` (placeholder preservation + glossary term presence for `GameLib`/`macOS`/`Windows`) through `applyFill.ts --check` before any catalog write
- Confirmed via `gamelibCatalogParity.test.ts` (199/199 passing) and a standalone completeness probe that all 24 locales have zero unfilled keys and zero orphaned/dropped placeholders
- Reused each locale's existing Phase-44 terminology (e.g., fr "Installé"/"résultat(s)", he "מותקן"/"תוצאות", it "Installato"/"risultato/risultati", ga "Suiteáilte"/"toradh" with its five plural forms) for consistency within each locale's tab

## Task Commits

Each task was committed atomically:

1. **Task 1: Author, validate and write the Winetricks keys for ar, az, be, bg, br, bs, ca, cs** - `c6bdc295b` (feat)
2. **Task 2: Author, validate and write the Winetricks keys for da, de, el, es, et, eu, fa, fi** - `76b006ba4` (feat)
3. **Task 3: Author, validate and write the Winetricks keys for fr, ga, gl, he, hr, hu, id, it** - `b42d77d1e` (feat)

**Plan metadata:** recorded below (final commit of this execution)

## Files Created/Modified
- `public/locales/{ar,az,be,bg,br,bs,ca,cs,da,de,el,es,et,eu,fa,fi,fr,ga,gl,he,hr,hu,id,it}/gamelib.json` - new `winetricksBrowse.*` keys added (33 non-plural + CLDR-appropriate plural expansions of applyAriaLabel/selectedCount/installedCount/failedCount)
- `public/locales/{same 24}/gamelib.mt.json` - `keys` array extended with the newly filled key names; `model`/`filledAt` left unchanged from the parent commit
- `.planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-i18n-fill/{same 24}.json` - staging files carrying the hand-authored, validated translations consumed by `applyFill.ts`

## Decisions Made
- Always include `{{count}}` in every plural-form translation regardless of whether that specific CLDR category is `countOptional` for the locale — a safe default that avoids a second round of placeholder-preservation failures after the Task 1 fix
- For Irish (`ga`), used pragmatic best-effort mutation forms (lenition for `one`/`two`/`few`, eclipsis for `many`) across all five CLDR categories rather than attempting exhaustive dialectal precision — acceptable given D-08's scope is "family-level description," not literary Irish

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Breton (br) placeholder drop in `applyAriaLabel_one`**
- **Found during:** Task 1 (`--check` validation before first write)
- **Issue:** Initial Breton translation for `applyAriaLabel_one` ("Arloañ ar parzh diuzet") omitted the `{{count}}` placeholder present in the English source, tripping `validateTranslation`'s placeholder-preservation check
- **Fix:** Patched the staged value to "Arloañ an {{count}} parzh diuzet", preserving the placeholder
- **Files modified:** `.planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-i18n-fill/br.json`
- **Verification:** Re-ran `applyFill.ts --check` for all 8 Task-1 locales; reported no problems
- **Committed in:** `c6bdc295b` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Fix was necessary for correctness (validator-required placeholder preservation). No scope creep — fixed inline before the write, as the plan's action block directs ("fix the staged value, never the validator").

## Issues Encountered
None beyond the one auto-fixed issue above. Tasks 2 and 3 passed `--check` cleanly on the first attempt with no validator rejections, likely because the plural-form discipline (always include `{{count}}`) was internalized from the Task 1 fix.

## User Setup Required
None - no external service configuration required. Translations were hand-authored in-session per D-20; `machine-fill-gamelib` was never invoked (plan prohibition, and it is non-functional under the session's gateway-scoped API key regardless).

## Next Phase Readiness
- Plan 45-10 can proceed independently to fill the remaining 24 batch-B locales using the same `applyFill.ts` validate-before-write pipeline
- All 24 batch-A locales are fully filled, validated, and parity-tested; no partial or stub translations remain in this batch
- `D-08` (family-level `family.*` descriptions) and `D-20` (complete, validated, provenance-stamped batch-A fill) requirements marked complete for this plan's scope

---
*Phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self*
*Completed: 2026-10-10*

## Self-Check: PASSED

All created/modified files confirmed on disk (SUMMARY.md, `public/locales/fr/gamelib.json`, `public/locales/it/gamelib.mt.json`, `.planning/.../45-i18n-fill/ga.json`). All 3 task commits (`c6bdc295b`, `76b006ba4`, `b42d77d1e`) confirmed in `git log --oneline --all`.
