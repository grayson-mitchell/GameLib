# Quick 261105-s7f Summary

Translated the last 8 en-only `steam.overlay` keys (exit.body|title, override.automatic|help|label|off|on|summary) into all 48 non-en `gamelib.json` catalogs and `gamelib.mt.json` manifests. Presence baseline totalPairs 6384 -> 6000. Todo closed.

- Commit: 7f3877fa2 (100 paths with renames expanded; 99 as shown with rename detection).
- Fill record: `261105-s7f-i18n-fill.json` (hand-authored, no API key).

## Verification
- validateTranslation: 384/384 pass.
- Sabotage controls rejected: de help `Mac Steam` -> `Mak Steam` (glossary message); de exit.body + `{{appName}}` (placeholder message).
- Baseline: missing == pre-fill snapshot minus exactly the 8 keys (48 locales each); no steam.overlay.* remain.
- lint-translations:gamelib exit 0; 4 jest suites 267 tests pass; i18n-churn-guard clean; planning-gates 12/12. No verify step failed.
- Prettier: de gamelib.json, de gamelib.mt.json and the completed todo are ignored; baseline checked and passes.

## Deviations
1. [Plan inconsistency] The plan's verify required `Mac Steam` in exit.body, but en exit.body does not contain it ("the Steam overlay"). I kept translations faithful to en and checked `Steam` literal in exit.body; `Mac Steam` is verified in override.help only.
2. [Sabotage control] `Mac-Steam` was not rejected by validateTranslation (relaxed trailing boundary accepts `Mac-`); replaced with `Mak Steam`, which was rejected.
3. fa initially used Persian digits for 30; changed to ASCII 30 per the plan.

## Exceptions
- en-identical (override.label "Steam overlay"): az, be, bs, eu, fa, hr, uz. These locales' gy5 toast titles already use the loan word "overlay" with literal Steam; kept consistent.
- label not a substring of gy5 toast title (article/case/capitalisation only): bg (definite "Наслагването"), ca ("La"), el ("Η ... του"), gl ("A"), ga (lowercase "forleagan" mid-sentence), hu (gy5 "Steam átfedése" vs nominative "Steam-átfedés").
- Pre-existing unrelated dirty `src/.../overlayLaunch.test.ts` belongs to quick 261105-gx2; not touched.

## Self-Check: PASSED
