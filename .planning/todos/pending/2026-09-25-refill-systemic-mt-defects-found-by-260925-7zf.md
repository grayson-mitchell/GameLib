---
created: 2026-09-25
title: "Re-fill the systemic MT defects 260925-7zf found — \"Giftable spares\" untranslated in activateConfirmBody in 21/48 locales, English UI words left in sk/ml/hr/nl/az"
area: i18n
status: pending
severity: medium
platform: any
ready: human
found_by: "Quick task 260925-7zf (2026-09-25) automated MT quality audit — the 21/48 count is a grep over ALL locales, not only the 8 reviewed"
files:
  - public/locales/
  - meta/machineFillGamelib.ts
---

# Re-fill the systemic machine-translation defects

`ready: human` because the fill needs `ANTHROPIC_API_KEY`, which this repo reads from the
environment only (`meta/machineFillGamelib.ts:874`) and agent sessions do not have.

**Do the source fixes first:**
`2026-09-25-i18n-source-strings-defeat-translation-ambiguous-chip-minute-abbrev-no-plurals.md`.
Re-filling before that re-generates the same ambiguity.

## Targets

1. **`humbleKeys.activateConfirmBody`**: the "Giftable spares" section name is left in English in
   21/48 locales: `az br bs cs da eu fa hr id ja ka ko ml nb_NO nl ro sk sr sv ta th`. This is the
   confirmation for an IRREVERSIBLE action, and it names a section the user cannot find under that
   name. Re-fill so it uses the SAME term as `humbleKeys.c2Action` in each locale. Recheck with
   `grep -l Giftable public/locales/*/gamelib.json`, which should return `en` only.
2. **English UI words left untranslated** (from `structural-check.json`): sk
   `box.cancel`/`humbleKeys.activateDismiss`/`about.navLabel`/`library.filterPanel.storeGroup`/
   `library.filterPanel.viewFavourites`/`library.storeOther`; ml `box.cancel`/
   `humbleKeys.activateDismiss`/`library.filterPanel.storeGroup`/`library.filterPanel.viewFavourites`;
   hr `library.filterPanel.viewAll`/`library.filterPanel.viewFavourites`; nl
   `library.filterPanel.viewFavourites` (and `storeGroup`, where "Store" may be an acceptable loan
   word, so check it); az `gamepage.tabsAriaLabel`.
3. **The 12 major findings** in the report's table: apply after a speaker or a second reviewer
   agrees. The reviewers' `suggested` values are one model's proposals, not verified fixes.

## Trap

Re-filling updates `gamelib.mt.json` `filledAt`, and that is correct. Do NOT mark any key as
human-reviewed: a model-reviewed re-fill is still machine translation. See the parent todo
`2026-09-03-all-10032-non-english-fork-strings-are-unreviewed-machine-translation.md`.
