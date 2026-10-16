---
phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self
plan: 10
subsystem: i18n
tags: [i18next, winetricks, localization, cldr-plurals, applyFill]

# Dependency graph
requires:
  - phase: 45-03
    provides: "winetricksBrowse copy table (33 non-plural keys + 4 plural bases: applyAriaLabel, selectedCount, installedCount, failedCount) and the canonical English source values"
  - phase: 45-09
    provides: "the applyFill.ts invocation, the always-keep-{{count}} plural discipline, and the validate-before-write workflow (batch A)"
provides:
  - "24 of 48 non-English locales (batch B) carrying every new winetricksBrowse key, hand-authored, validator-gated, provenance-stamped: ja, ka, ko, lt, ml, nb_NO, nl, pl, pt, pt_BR, ro, ru, sk, sl, sr, sv, ta, th, tr, uk, uz, vi, zh_Hans, zh_Hant"
  - "with 45-09, the full 48-locale gamelib catalog fill for the Winetricks tab; lintTranslations (gamelib) reports zero winetricksBrowse findings"
affects: ["45-11 (phase gate: lint-translations:gamelib and Meta presence baseline)", "winetricks-browse-ui", "i18n-coverage"]

# Actuals (#2632)
actuals:
  tokens: 70000
  tasks: 3
  commits: 3
  plan_head_before: 5b7370f859121ce8f247357ecf28a38a00abcdc5
  plan_head_after: 3575ea97e79641698740e2fb227ed11816a0cf9a

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "In-session hand-authored translation through the validate-before-write staging tool (applyFill.ts), never a hand-edited catalog and never a network translation service"
    - "{{count}} kept in every CLDR plural form; where a count-first phrasing would force awkward inflection (lt, pl, ru, sk, sl, sr, uk, ro) the label-colon form 'Installed: {{count}}' is used so one phrase is grammatical for every category"
    - "Each locale's existing Phase-44 winetricksBrowse terminology (Installed/Install failed/Retry/search copy) reused so the tab reads consistently"

key-files:
  created:
    - .planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-i18n-fill/{ja,ka,ko,lt,ml,nb_NO,nl,pl,pt,pt_BR,ro,ru,sk,sl,sr,sv,ta,th,tr,uk,uz,vi,zh_Hans,zh_Hant}.json (staging files, one per locale)
  modified:
    - public/locales/{same 24}/gamelib.json
    - public/locales/{same 24}/gamelib.mt.json

key-decisions:
  - "Counter labels (installedCount, selectedCount, failedCount) in lt, pl, ro, ru, sk, sl, sr, uk use the 'Label: {{count}}' form in every plural category, because a count-first phrase would need a different participle agreement per CLDR category and the labels are noun-less; applyAriaLabel keeps true per-category inflection"
  - "pt/pt_BR 'many' (CLDR: millions) written as 'de componentes' (the grammatical form) for applyAriaLabel and plain plural for the other counters"
  - "sr authored in Cyrillic to match the existing sr catalog; uz uses the straight-apostrophe Latin orthography already in the uz catalog"
  - "pt uses European Portuguese (A instalar, ecrã-neutral wording) and pt_BR Brazilian (Instalando), matching each catalog's Phase-44 wording"

requirements-completed: [D-08, D-20]

coverage:
  - id: D1
    description: "All 24 batch-B locales carry a non-empty value for every new winetricksBrowse key, including every CLDR plural form requiredPluralKeys demands for that locale"
    requirement: "D-20"
    verification:
      - kind: other
        ref: "node -e completeness probe comparing flattened en keys against all 24 locale catalogs (per-task verify blocks); 0 unfilled keys"
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
        ref: "applyFill.ts --locales <batch> --check run before each write: clean on first attempt for all three batches"
        status: pass
    human_judgment: false
  - id: D3
    description: "Each locale's gamelib.mt.json lists the newly filled winetricksBrowse keys; model and filledAt untouched"
    requirement: "D-20"
    verification:
      - kind: other
        ref: "git diff -U0 over public/locales/*/gamelib.mt.json: every changed line contains 'winetricksBrowse'; no model/filledAt line changed"
        status: pass
    human_judgment: false
  - id: D4
    description: "The 13 family.* sentences are translated as family-level descriptions, not per-verb text, across all 24 locales"
    requirement: "D-08"
    verification: []
    human_judgment: true
    rationale: "Translation quality and tone across 24 languages (several outside the author's strongest, e.g. ka, ml, ta, uz, sl) is a judgment call; a fluent reviewer is the appropriate check, not an automated rule."

duration: ~9min
completed: 2026-10-10
status: complete
---

# Phase 45 Plan 10: Fill Winetricks i18n Keys, Batch B (24 Locales) Summary

**Hand-authored, validator-gated translations of the new `winetricksBrowse` keys for 24 non-English locales (ja, ka, ko, lt, ml, nb_NO, nl, pl, pt, pt_BR, ro, ru, sk, sl, sr, sv, ta, th, tr, uk, uz, vi, zh_Hans, zh_Hant), written only through `applyFill.ts`'s validate-before-write pipeline with provenance stamped in each `gamelib.mt.json`. Together with 45-09 this completes the 48-locale fill.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-10-10T08:30:44Z
- **Completed:** 2026-10-10T08:39Z
- **Tasks:** 3 completed
- **Files modified/created:** 72 (24 locales x 3: `gamelib.json`, `gamelib.mt.json`, staging `45-i18n-fill/<locale>.json`)

## Accomplishments

- Authored and validated 41 required keys per locale (33 non-plural + 4 plural bases x CLDR categories), 45 for pt/pt_BR/ro/sr, 49 for lt/pl/ru/sk/sl/uk
- CLDR plural coverage confirmed by the tool's own REQUIRED list before authoring: lt/pl (one/few/many/other), ru/sk/uk (one/few/many/other), sl (one/two/few/other), pt/pt_BR (one/many/other), ro/sr (one/few/other), the rest one/other
- Every value passed `validateTranslation` (placeholder preservation, glossary terms `GameLib`/`macOS`/`Windows` verbatim in Latin script) via `applyFill.ts --check` before any write; all three batches passed `--check` on the first run
- `gamelibCatalogParity.test.ts` 199/199 after each task; `lintTranslations.test.ts` 32/32; `LINT_TRANSLATIONS_NAMESPACES=gamelib` lint run exits 0 with zero findings mentioning `winetricksBrowse` (its 720 findings are pre-existing, unrelated missing keys)
- Environment banners (`environmentBannerGptk`, `environmentBannerMissingDeps`) written as calm information; product names (DirectX, DXVK, Vulkan, PhysX, NVIDIA, Visual C++, Visual Basic, .NET Framework, ClearType, Xbox, Wine) kept untranslated

## Task Commits

1. **Task 1: ja, ka, ko, lt, ml, nb_NO, nl, pl** - `b8db0acab` (feat)
2. **Task 2: pt, pt_BR, ro, ru, sk, sl, sr, sv** - `2e3c5ff35` (feat)
3. **Task 3: ta, th, tr, uk, uz, vi, zh_Hans, zh_Hant** - `3575ea97e` (feat)

**Plan metadata:** final docs commit (SUMMARY, STATE, ROADMAP).

## Files Created/Modified

- `public/locales/<24 locales>/gamelib.json` - new `winetricksBrowse.*` keys added (4-space serializer, byte-identical round trip asserted by the tool)
- `public/locales/<24 locales>/gamelib.mt.json` - `keys` extended; `model`/`filledAt` unchanged (the known one-global-field manifest inaccuracy documented in the staging README)
- `.planning/phases/45-.../45-i18n-fill/<24 locales>.json` - staged, validated values

No `translation.json` path appears in any of the three task commits (`git show --stat` count 0 each).

## Decisions Made

See `key-decisions` in the frontmatter. The main one: noun-less counter labels use `Label: {{count}}` in Slavic/Baltic/Romance-plural locales so a single grammatical phrase serves every CLDR category, while `applyAriaLabel` (a full sentence) keeps true per-category noun inflection.

## Deviations from Plan

None - plan executed exactly as written.

Notes (not deviations):
- The plan's plan-level `<verification>` line (`applyFill.ts --check` over all 24 "reports no problem") cannot literally pass after the write: re-running `--check` on already-applied keys reports each staged key as "not required (not missing/empty in target)" (1048 lines, 100% of that single message type, zero validation/completeness/round-trip problems). This is the tool's idempotency refusal, not a defect; the meaningful pre-write `--check` was clean for every batch.
- Formatter check omitted per the plan: `npx prettier --file-info` confirms `public/locales/**` and `.planning/**` are `"ignored": true`, so `prettier --check` would match zero files.

## Issues Encountered

None.

## User Setup Required

None - translations were hand-authored in-session; `machine-fill-gamelib` was never invoked and no catalog content left the machine.

## Known Stubs

None. (Translation quality for languages outside the author's strongest is flagged under coverage D4 for human review; it is not a stub.)

## Next Phase Readiness

- All 48 non-English locales now carry the Winetricks keys; plan 45-11 can run `lint-translations:gamelib` and the Meta presence baseline as the phase gate
- Carried-red suites untouched: `genI18nGateScope.test.ts` (45-11) and `findDeadcode` (45-05/06/11)

---
*Phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self*
*Completed: 2026-10-10*

## Self-Check: PASSED

All 24 staging files and a sample of catalog files confirmed on disk; commits `b8db0acab`, `2e3c5ff35`, `3575ea97e` confirmed in `git log`; measured `commits: 3` from the persisted ledger (`plan_head_before` 5b7370f85).
