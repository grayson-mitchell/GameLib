# Phase 74 deferred items

## From 74-20 (out of scope, pre-existing)

- `pnpm lint-translations:gamelib` and `lintTranslations.test.ts` (2 tests): 4 en keys are missing from all 48 catalogs and not recorded in `meta/i18nCatalogPresenceBaseline.json`: `box.error.launch.epic.credentials`, `box.error.launch.epic.loginFailed`, `box.error.launch.epic.network`, `steam.engine.markerNewer` (192 pairs). Fix: translate them (or regenerate the baseline with `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`).
- `gamelibCatalogParity.test.ts` (48 failures): `steam.bridge.route.missingSymbols` is an orphaned key in all 48 catalogs; quick 261113-8m6 dropped it from en. Fix: remove it from the 48 gamelib.json (and mt manifests).
- `gamelibCatalogParity.test.ts` (1 failure): one locale's `humbleKeys.giftConfirmBody` drops the glossary term `Humble`.
