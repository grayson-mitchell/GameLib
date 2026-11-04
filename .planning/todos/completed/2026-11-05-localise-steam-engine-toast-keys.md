---
created: 2026-11-05T09:00:00.000Z
title: "Localise the four steam.engine.toast.* keys in all 48 non-en catalogs"
area: i18n
files:
  - public/locales/en/gamelib.json
  - meta/i18nCatalogPresenceBaseline.json
severity: medium
platform: any
ready: code
---

## Problem

Quick 261104-vvz (`30ccb0b5f`) added `steam.engine.toast.body`, `steam.engine.toast.title.cxBroken`,
`steam.engine.toast.title.cxExpired` and `steam.engine.toast.title.cxMissing` to the `en` gamelib
catalog only, and recorded their 192 pairs (4 keys x 48 locales) in
`meta/i18nCatalogPresenceBaseline.json`. That masks the gap: the lint is green while non-English
users see English toast text.

## Solution

Same flow as quick 261105-9sr: write per-language translations through a fill record, pass each
through `validateTranslation`, apply to the 48 `gamelib.json` and `gamelib.mt.json` files, then
re-sync the baseline with `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`
and confirm only those 192 pairs left it.

## Closed 2026-11-05 (quick 261105-a72)

Scope widened by one decision: the 3 flat keys `steam.engine.toast.cxBroken|cxExpired|cxMissing`
(still read by `src/backend/storeManagers/steam/games.ts`) were localised together with the four
`title.*`/`body` keys, so 7 keys x 48 locales = 336 pairs, via `261105-a72-i18n-fill.json`
(hand-authored; no API key). Each flat value is that locale's title plus an em dash plus a short
"using built-in engine" phrase.

- `validateTranslation`: 336/336 pass; no en-identical values. Sabotage control (de cxMissing title with
  CrossOver replaced by Crossover-Software) rejected with the glossary-term message.
- Baseline: totalPairs 6864 -> 6528, missing equals HEAD 233d53729 minus exactly those 7 keys
  (the vvz `30ccb0b5f` masking reversed for them). `steam.overlay.toast.title|body` remain recorded.
- The brief's assumption that the flat leaves existed as translated memory was wrong: they were never
  translated in any non-en catalog. They are now.
- Remaining masked toast keys (`steam.overlay.toast.title|body`, 96 pairs) are handed to
  `2026-11-05-localise-steam-overlay-toast-keys.md`.
