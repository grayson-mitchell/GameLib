---
phase: quick-261121-lco
plan: 01
subsystem: i18n-gates
tags: [gameinfo-narrowing, i18n, presence-baseline, fork-touched, hardcoded-string-gate]
requires: [quick-261121-dzl]
provides: [green gameinfo-narrowing-ceiling, green lintTranslations, green genI18nGateScope]
affects: [meta/i18nCatalogPresenceBaseline.json, meta/i18nForkTouchedFiles.json, meta/i18nGateScope.json]
key-files:
  modified:
    - src/frontend/screens/Settings/components/SettingsModal/SettingsModalHeader.tsx
    - meta/i18nCatalogPresenceBaseline.json
    - meta/i18nForkTouchedFiles.json
    - meta/i18nGateScope.json
    - meta/__tests__/genI18nGateScope.test.ts
    - .planning/todos/completed/2026-11-21-redesign-i18n-baseline-and-touched-files-regen.md
decisions:
  - "Five zero-violation files promoted into blocking scope (317 -> 322); tabs.ts declared unscanned debt"
status: complete
commits: 4
plan_head_before: 2ec0a9fec4a909b7b6c228fc912e9dd9bb07a973
plan_head_after: 9457e908b61f8290ba8dc7f2bf0aa9add339570a
actuals:
  tokens: 40000
  tasks: 3
  commits: 4
completed: 2026-11-21
---

# Quick 261121-lco: Fix stale i18n baseline and fork-touched files Summary

The three gates quick 261121-dzl left red are green again, using the repo's own generators and the existing curation path. No gate was loosened, and nothing was pushed.

## Commits

| Task | SHA | Message |
| ---- | --- | ------- |
| 1 | 370e1ce7a | fix: pick the settings header App-ID label from the runner string, not GameInfo |
| 2 | 98f952f4b | chore: record the 261121-dzl gamelib keys in the i18n presence baseline |
| 3 | 60e1c07ed | chore: regenerate i18n fork-touched list; scope five 261121-dzl files, declare tabs.ts debt |
| 3 (todo) | 9457e908b | docs: close the i18n baseline and fork-touched regen todo |

## Evidence

Baseline writer stdout (`LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`):

- `Wrote meta/i18nCatalogPresenceBaseline.json: 16368 pairs across 341 keys`
- `Added (new blind spot recorded): 1728`
- `Removed (no longer missing): 0`

`pnpm gen-i18n-gate-scope`: `Left meta/i18nGateScope.json untouched ...` and `Wrote meta/i18nForkTouchedFiles.json: 445 fork-touched eligible files.` Numstat `7 1` (six paths plus `generatedAt`).

scanScope audit: baseline `317 0` (files, violations); with the six extra files `323 2`. Five files had 0 violations; `GamesSettings/tabs.ts` had 2 (lines 71, 76, localStorage key templates).

Test counts, before to after:

- `lintTranslations.test.ts`: 2 failed / 30 passed to 32 passed.
- `genI18nGateScope.test.ts`: 1 failed / 1 skipped / 25 passed to 0 failed / 1 skipped / 26 passed.
- `SettingsModalHeader.test.tsx`: 5/5 before and after.
- `hardcodedStringGate.test.ts`: 178/178 passed on the widened scope.

## Deviations from Plan

None. The plan executed as written. Task 1's HEAD was 2ec0a9fec rather than the planned 88dd4edaf (one further docs-only commit by another session); no effect.

## Known Stubs

None.

## Self-Check: PASSED

All four commits present in history on main; each holds only its planned paths. Other session's dirty files left untouched and unstaged. `public/locales/en/gamelib.json` never staged.
