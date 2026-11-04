---
created: 2026-11-05T12:00:00.000Z
title: "Localise steam.overlay.toast.title and .body in all 48 non-en catalogs"
area: i18n
files:
  - public/locales/en/gamelib.json
  - meta/i18nCatalogPresenceBaseline.json
severity: medium
platform: any
ready: code
---

## Problem

`steam.overlay.toast.title` and `steam.overlay.toast.body` (phase 59) exist in the `en` gamelib
catalog only and are recorded in `meta/i18nCatalogPresenceBaseline.json` (2 keys x 48 locales = 96
pairs). That masks the gap: the lint is green while non-English users see English overlay toast text.

## Solution

Same flow as quick 261105-a72: write per-language translations through a fill record, pass each
through `validateTranslation`, apply to the 48 `gamelib.json` and `gamelib.mt.json` files, then
re-sync the baseline with `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`
and confirm only those 96 pairs left it.

## Closed 2026-11-05 (quick 261105-gy5)

Scope amended by the orchestrator: besides `steam.overlay.toast.title|body`, the 6
`steam.overlay.step.*` sentences that fill `{{step}}` were translated too, so 8 keys x 48 locales =
384 pairs, via `261105-gy5-i18n-fill.json` (hand-authored; no API key). Each body keeps `{{step}}`
first, then one sentence meaning "The game is launching without the Steam overlay."

- `validateTranslation`: 384/384 pass; no en-identical values. Sabotage controls rejected: de body
  with `{{step}}` removed (dropped-placeholder message) and de title with Steam replaced by Dampf
  (glossary-term message). Thai values carry no trailing full stop (Thai has none).
- Baseline: totalPairs 6528 -> 6144, missing equals HEAD 3376fd5af minus exactly those 8 keys.
- The brief's assumption that `steam.overlay.override.label` gave per-locale "overlay" wording was
  wrong: no non-en catalog had a `steam.overlay` object. The "overlay" term came from each locale's
  EOS-overlay or stats-overlay wording in `translation.json` (br and sl have none; hand-chosen).
- The remaining masked keys (`exit` 2, `override` 6; 384 pairs) are handed to
  `2026-11-05-localise-remaining-steam-overlay-keys.md`.
