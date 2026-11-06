---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 06
subsystem: i18n
tags: [localization, gamelib-namespace, steam-bridge, steamstub, translation-provenance]

requires: []
provides:
  - "steam.bridge.steamstub.title and steam.bridge.steamstub.body in all 49 gamelib catalogs (en + 48 translations) with mt.json provenance for the 48 non-en"
  - "52-i18n-fill.json provenance record of the 48-locale fill"
affects: [52-09]

key-files:
  created:
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-i18n-fill.json
  modified:
    - public/locales/*/gamelib.json
    - public/locales/*/gamelib.mt.json

key-decisions:
  - "English strings used verbatim as the i18next.t defaults in plan 52-09; Steam, GameLib and Mac kept untranslated in every locale"

requirements-completed: [P52-SCOPE-4]

duration: 15min
completed: 2026-10-24
---

# Phase 52 Plan 06: SteamStub notice i18n Summary

**Two SteamStub-notice strings (`steam.bridge.steamstub.title/body`) landed in all 49 gamelib catalogs in one commit, in-session translated and validated with the real `validateTranslation`.**

## Tasks

1. Fill record (`e98e4207d`): in-session hand-translation for 48 locales (the 51-04 sanctioned fallback; no API key used). Validated by importing the real `validateTranslation` from `meta/machineFillGamelib.ts` under `JEST_WORKER_ID`: 96/96 (locale, key) pairs pass. First run caught one real defect (fa title transliterated "Steam"), fixed and re-run clean. Sabotage control (de body with "GameLib" replaced) was rejected: glossary term "GameLib" dropped. Control was run-only, not saved.
2. Catalog apply (`cb705bfe0`): round-trip-verified `json.dumps(indent=4, ensure_ascii=False)+"\n"` byte-for-byte before mutating every `gamelib.json`; inserted `steamstub {body,title}` under `steam.bridge` (sorted); appended the two keys to the 48 `gamelib.mt.json` `keys[]` (model/filledAt untouched). 97 files changed; only gamelib files touched.

## Verification

- gamelibCatalogParity, lintTranslations, i18nGlossary, i18nCatalogChurnGuard: 4 suites, 269 tests pass.
- `pnpm lint-translations:gamelib`: 0 hard failures (1152 pre-existing "missing translation" findings, unrelated).
- Porcelain check: 0 non-gamelib locale files modified.
- Formatter check omitted: `.planning/**` and `public/locales/**` are prettier-ignored.

## Deviations from Plan

None in scope. Note: `npx tsx` fetched tsx transiently to run the scratchpad validator (not added to the repo; nothing committed).

## Self-Check: PASSED

Both commits exist (e98e4207d, cb705bfe0); fill record present.
