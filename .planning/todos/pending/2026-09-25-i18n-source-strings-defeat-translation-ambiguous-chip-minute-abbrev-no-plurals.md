---
created: 2026-09-25
title: "English gamelib.json source strings defeat translation — ambiguous chip label, `{{minutes}}m` abbreviation, no plural keys, no translator context for Claim vs Redeem"
area: i18n
status: pending
severity: medium
platform: any
ready: code
found_by: "Quick task 260925-7zf (2026-09-25) automated MT quality audit — defects flagged in the SAME key across several independently reviewed locales, which points at the source rather than the translation"
files:
  - public/locales/en/gamelib.json
  - src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts
  - meta/machineFillGamelib.ts
---

# English source strings that no translation can get right

Evidence: `.planning/quick/260925-7zf-automated-mt-quality-audit-of-gamelib-js/260925-7zf-REPORT.md`
§ "The findings that matter are SYSTEMIC". Fix these at the SOURCE first — re-filling
translations before the source is fixed just re-generates the same defect.

1. **`library.filterPanel.chipNoStorePageHidden` = `"Hiding no store page"`** — ambiguous even in
   English. Mistranslated in 6 of 8 reviewed locales (3 major; da reads "hides nothing"). Reword to
   say what it means, e.g. "Hiding games without a store page".
2. **`humbleKeys.cooldown` / `humbleKeys.revealCooldownBody` use `{{minutes}}m` / `{{N}}m`** — "m"
   is the metre symbol in da/nb_NO/sl/sv. Use a full word, or `min`.
3. **No plural keys for counted strings** (`{{N}} days`, `{{minutes}} minutes`, …). Slavic locales
   need 2–4 forms (i18next `_one`/`_few`/`_other`). Needs the call sites to pass `count`, not just
   new JSON.
4. **Claim vs Redeem, Undo vs Cancel, and the "Giftable spares" section name** carry no translator
   context, so the fill collapsed distinct steps to one verb (da, nb_NO, sl, et) and left the
   section name in English inside `activateConfirmBody` in 21/48 locales. Decide how context is
   supplied to `machineFillGamelib.ts` (a per-key note or a glossary entry that marks
   "Giftable spares" as TRANSLATED UI term, not a brand).

After the source changes land, the affected keys need re-filling — tracked by
`2026-09-25-refill-systemic-mt-defects-found-by-260925-7zf.md`.
