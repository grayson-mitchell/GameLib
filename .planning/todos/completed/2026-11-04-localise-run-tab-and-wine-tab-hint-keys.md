---
created: 2026-11-04T09:00:00.000Z
title: "Localise settings.navbar.run and steam.engine.wineTabHint in all 48 non-en catalogs"
area: i18n
files:
  - public/locales/en/gamelib.json
  - meta/i18nCatalogPresenceBaseline.json
severity: medium
platform: any
ready: code
---

## Problem

Quick tasks 261104-unp (`45f24f66f`, key `settings.navbar.run`) and 261104-tm6 (`4820bd8f3`,
key `steam.engine.wineTabHint`) added these keys to the `en` gamelib catalog only. Neither
SUMMARY records the debt. Result, found by the Phase 51 Nyquist re-audit on 2026-11-04:

- `pnpm lint-translations:gamelib` exits 1 with 96 hard failures (2 keys x 48 locales).
- `meta/__tests__/lintTranslations.test.ts` fails 2 tests (REQ-41-02 zero hard failures;
  REQ-41-01 R13 zero baseline drift). This turns row 51-04-02 of `51-VALIDATION.md` red.

## Solution

Same flow as quick 261027-thn: write per-language translations through a fill record,
pass each one through `validateTranslation`, then re-sync the baseline with
`LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`. Do not record the 96 pairs
in the presence baseline to silence the gate (commit 6de4cce9b did that once and hid the
failures). Then run `lintTranslations.test.ts`, `gamelibCatalogParity.test.ts`,
`i18nCatalogChurnGuard.test.ts`, `i18nGlossary.test.ts` and `pnpm i18n-churn-guard` and confirm all are green.

## Closed 2026-11-05 (quick 261105-9sr)

- 2 keys x 48 locales translated via `.planning/quick/261105-9sr-localise-settings-navbar-run-and-steam-e/261105-9sr-i18n-fill.json`; `validateTranslation` passed 96/96 and a sabotaged de value (GameLib replaced) was rejected.
- Commit `30ccb0b5f` (quick 261104-vvz) had recorded these 96 pairs in the presence baseline, masking the failures. The baseline was re-synced via the writer after the fill: 6960 -> 6864, exactly these pairs gone.
- The four `steam.engine.toast.*` keys vvz also masked are handed to `2026-11-05-localise-steam-engine-toast-keys.md`.
- Gates run: lintTranslations, gamelibCatalogParity, i18nCatalogChurnGuard, i18nGlossary jest suites; `pnpm lint-translations:gamelib`; `pnpm i18n-churn-guard`.
- Row 51-04-02 of `51-VALIDATION.md` flipped to green.
