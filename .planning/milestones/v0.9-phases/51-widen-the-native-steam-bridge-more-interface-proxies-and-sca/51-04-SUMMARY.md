---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 04
subsystem: i18n
tags: [localization, gamelib-namespace, steam-bridge, translation-provenance]

requires:
  - phase: 51-01, 51-02, 51-03
    provides: the Steam bridge route/notice/limited-mode decisions (D-51-02, D-51-05, D-51-08/11, D-51-09, D-51-10, D-51-16) whose UI strings this plan localizes up front
provides:
  - "40 new steam.bridge.* / steam.bottle.waiting.* keys present in all 49 locales (English + 48 translations) under the gamelib namespace, with mt.json provenance stamps for all 48 non-English catalogs"
  - "51-i18n-fill.json provenance record (key -> locale -> value) for later audit/re-fill"
affects: [51-05, 51-08, 51-09, 51-12, 51-13, 51-16]

actuals:
  tokens: 126225
  tasks: 2
  commits: 2
  plan_head_before: 06c963f93af10add3330cea869f8c83c89536e34
  plan_head_after: b754f8592dd6c8e5f5d653af6ec3d30895b74aa0

tech-stack:
  added: []
  patterns:
    - "In-session hand-fill of a 48-locale i18n gap, validated post-hoc by importing the real validateTranslation() from meta/machineFillGamelib.ts under JEST_WORKER_ID (bypassing main()'s network call), with a sabotage control to prove the validator run was non-vacuous"
    - "Order-preserving key insertion into JSON locale catalogs: insert each new top-level key immediately before the first existing sibling key that sorts (case-insensitively) after it, rather than assuming global alphabetical order — 3 of 49 catalogs (de, et, fr) have non-alphabetical steam.* key order"

key-files:
  created:
    - .planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-i18n-fill.json
  modified:
    - public/locales/en/gamelib.json (+ 48 other public/locales/*/gamelib.json, 49 total)
    - public/locales/de/gamelib.mt.json (+ 47 other public/locales/*/gamelib.mt.json, 48 total)

key-decisions:
  - "machine-fill-gamelib was not run: the project's ANTHROPIC_BASE_URL is gateway-scoped in this session (HTTP 401 against api.anthropic.com, matching the prior measured blocker), so all 48 locales were hand-authored in-session per the plan's sanctioned fallback."
  - "Glossary terms (Steam, GameLib, Windows, CrossOver, etc.) kept verbatim in every locale; 'bridge' was coined per-locale (no prior translation memory existed for it anywhere in the repo — the one other 'bridge' key family, in gamepage.json, is unfilled in all 48 locales); 'client', 'Cancel', and the per-locale convention for keeping 'bottle' as either a loanword or a native word were all derived from each locale's own existing steam.* strings for terminology consistency."
  - "Discovered during validation that meta/i18nGlossary.json now carries 28 glossary terms (including 'Windows' and 'GameLib', not in the plan's shorthand note of just 'Steam'/'GameLib'); 6 Persian (fa) strings that had transliterated 'Windows' as 'ویندوز' were fixed to keep it literal before the final fill was applied — caught by running the real validateTranslation(), not the author's own placeholder/glossary reimplementation, which is why the task explicitly requires it."
  - "Task 1 (provenance record) and Task 2 (applying the fill) were committed separately, since they are two distinct deliverables (a .planning artifact and 97 locale-catalog files); the plan's 'one commit' success criterion refers to Task 2's 97-file catalog change landing atomically, which it does."

patterns-established:
  - "Pre-mutation round-trip assertion (json.dumps(parsed, indent=N, ensure_ascii=False) + '\\n' == original bytes) run across ALL 49 gamelib.json (indent=4) and 48 gamelib.mt.json (indent=2) files before any write, aborting the whole run on the first mismatch — confirmed empirically rather than assumed for every file."

requirements-completed: []

coverage:
  - id: D1
    description: "51-i18n-fill.json: 40 English keys, non-empty value for every (locale, key) across all 48 non-English locales, validated by the real validateTranslation()"
    verification:
      - kind: unit
        ref: "scratchpad runValidate.ts invoking meta/machineFillGamelib.ts validateTranslation() against all 1920 (locale,key) pairs plus a sabotage control (dropped {{symbols}})"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 49 public/locales/*/gamelib.json catalogs and 48 gamelib.mt.json manifests carry the 40 new keys, in one commit, with the four meta i18n gates green"
    verification:
      - kind: unit
        ref: "pnpm jest meta/__tests__/gamelibCatalogParity.test.ts meta/__tests__/lintTranslations.test.ts meta/__tests__/i18nGlossary.test.ts meta/__tests__/i18nCatalogChurnGuard.test.ts (269/269 passed)"
        status: pass
      - kind: integration
        ref: "pnpm lint-translations:gamelib (exit 0; 816 pre-existing findings for unrelated keys, 0 touching steam.bridge.*/steam.bottle.waiting.*)"
        status: pass
    human_judgment: false

duration: ~50min
completed: 2026-10-17
status: complete
---

# Phase 51 Plan 04: Steam Bridge i18n String Inventory Summary

**Authored and validated all 40 Phase 51 Steam-bridge/waiting-dialog strings into English plus all 48 non-English `gamelib` locale catalogs in one commit, hand-filled in-session after the machine-fill API returned the previously-measured gateway-scoped HTTP 401, and caught a real Persian glossary violation ("Windows" transliterated instead of kept literal) only by running the project's actual `validateTranslation()` rather than trusting a self-written check.**

## Performance
- **Duration:** ~50min (measured between first and last task commit; research/authoring time before the first commit is not separately instrumented)
- **Tasks:** 2 completed
- **Files:** 98 production files changed (1 created, 97 modified)

## Accomplishments
- Produced `.planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-i18n-fill.json`: a 40-key x 49-locale (en + 48) provenance record, every (locale, key) pair validated by the real `validateTranslation()` imported from `meta/machineFillGamelib.ts` (1920/1920 pairs pass; sabotage control with a dropped `{{symbols}}` placeholder correctly rejected, then removed).
- Applied the fill to all 49 `public/locales/*/gamelib.json` catalogs (`steam.bridge.*`, 33 keys; `steam.bottle.waiting.*`, 7 keys) and all 48 non-English `gamelib.mt.json` provenance manifests, in a single 97-file commit, order-preserving per file's own existing key order (3 locales — `de`, `et`, `fr` — have non-alphabetical `steam.*` ordering; each new key was inserted immediately before the first existing sibling that sorts after it, not assumed to land at a globally "correct" alphabetical slot).
- Every catalog file was round-trip-verified byte-exact against its original encoding (`indent=4` for `gamelib.json`, `indent=2` for `gamelib.mt.json`) before any mutation, and every rewritten file was re-parsed and diffed against the pre-mutation parse to confirm no unrelated key changed.

## Task Commits
1. **Task 1: Author and validate the 48-locale fill into a provenance record** - `c276c9b65` (feat)
2. **Task 2: Apply the fill to all 49 gamelib catalogs and mt manifests in one commit; run the i18n gates** - `b754f8592` (feat)

## Files Created/Modified
- `.planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-i18n-fill.json` - provenance record of the 48-locale fill (key -> locale -> value), kept for future audit/re-fill
- `public/locales/en/gamelib.json` and 48 other `public/locales/*/gamelib.json` - the 40 new keys under `steam.bridge` and `steam.bottle.waiting`
- `public/locales/*/gamelib.mt.json` (48 non-English locales) - `keys[]` extended with the 40 new dotted key paths; `locale`/`model`/`filledAt` untouched

## Decisions Made
See `key-decisions` in frontmatter. Most notable: the live `meta/i18nGlossary.json` glossary (28 terms) is larger than the plan's shorthand description implied — it now includes `Windows` and `GameLib` as hard-enforced verbatim terms, not just `Steam`. Running the author's own placeholder/glossary reimplementation against the full 1920-pair set reported 0 problems, but the REAL `validateTranslation()` caught 6 real failures (Persian "Windows" → "ویندوز") that the reimplementation missed because it was built from a stale/truncated read of the glossary file earlier in the session. This is exactly why the task mandates running the project's own validator rather than trusting a custom one, and the fix (restoring literal "Windows" in the 6 affected Persian strings) was applied before the final 51-i18n-fill.json was written and before Task 2 applied it to the catalogs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Persian "Windows" transliteration violated the live glossary**
- **Found during:** Task 1, running the real `validateTranslation()` after initially validating only with a hand-rolled reimplementation that (incorrectly) assumed the glossary was the 15-term list seen earlier in the session rather than the current 28-term one on disk.
- **Issue:** 6 Persian (`fa`) strings rendered "Windows" as "ویندوز" (a Persian transliteration) instead of the glossary-mandated verbatim "Windows": `steam.bridge.route.reason.userForcedBottle`, `steam.bridge.forceBottle.label`, `steam.bridge.routeNotice.title`, `steam.bridge.routeNotice.bottledExplainer`, `steam.bridge.setup.redownloadNote`, `steam.bottle.waiting.intro`.
- **Fix:** Replaced all 6 occurrences of "ویندوز" with literal "Windows" in the fa fill data before regenerating `51-i18n-fill.json`.
- **Files modified:** `.planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-i18n-fill.json`, `public/locales/fa/gamelib.json` (fix was applied before either file was committed, so no separate fix commit exists).
- **Verification:** Re-ran the real `validateTranslation()` against all 1920 pairs: 0 failures. Sabotage control (independently, a deliberately dropped `{{symbols}}` placeholder) still correctly rejected, confirming the validator run was not vacuous.
- **Commit:** Folded into `c276c9b65` (Task 1 was not yet committed when this was caught).

**Total deviations:** 1 auto-fixed (Rule 1 - bug). **Impact:** Caught before any commit; zero blast radius. The deviation is recorded because it demonstrates the task's own mandated process (real validator, not a reimplementation) working as designed.

## Issues Encountered

`pnpm lint-translations:gamelib` reports 816 "Missing translation" findings (exit code 0 — these are soft findings, not hard failures). All 816 are for keys unrelated to this plan (`box.protocol.launch.*`, `downloadManager.upNext`, `tour.*`, `wineExplanation.*`, etc.) in `uz`, `vi`, `zh_Hans`, `zh_Hant`, and other locales — pre-existing gaps that predate this plan (confirmed: none of the 816 findings reference `steam.bridge.*` or `steam.bottle.waiting.*`). Per the deviation-rules scope boundary, these are out of scope for this plan and were not touched.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

All 40 Phase 51 UI strings (`steam.bridge.*`, `steam.bottle.waiting.*`) are live in `gamelib` for all 49 locales, so plans 51-05, 51-08, 51-09, 51-12, 51-13, and 51-16 can call `t('gamelib:steam.bridge....', '<English default>')` without any further i18n work. `i18next-parser.config`'s `keepRemoved: true` means these keys will not be pruned by `pnpm i18n` before their call sites exist.

No blockers.

---
*Phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca*
*Completed: 2026-10-17*

## Self-Check: PASSED
- FOUND: `.planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-i18n-fill.json`
- FOUND: `public/locales/en/gamelib.json`, `public/locales/de/gamelib.mt.json`
- FOUND commit `c276c9b65` (Task 1)
- FOUND commit `b754f8592` (Task 2)
- Spot-checked `steam.bridge.route.native` present and non-English in `ar`, `ja`, `pl`
