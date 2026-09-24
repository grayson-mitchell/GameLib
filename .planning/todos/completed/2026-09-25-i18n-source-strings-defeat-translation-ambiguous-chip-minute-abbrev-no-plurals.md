---
created: 2026-09-25
title: "English gamelib.json source strings defeat translation — ambiguous chip label, `{{minutes}}m` abbreviation, no plural keys, no translator context for Claim vs Redeem"
area: i18n
status: RESOLVED
resolved: 2026-09-25
resolved_by: quick-260925-88h
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

## Resolution

All four items landed in quick task `260925-88h`, split across two commits:

1. **Ambiguous chip label (item 1)** — Task 2, commit `8816b2007`.
   `library.filterPanel.chipNoStorePageHidden` reworded from "Hiding no store page" to
   "Hiding games without a store page", in both `en/gamelib.json` and `chipLabels.ts`'s matching
   inline `defaultText`.

2. **`m` abbreviation (item 2)** — Task 2, commit `8816b2007`. `humbleKeys.cooldown` and
   `humbleKeys.revealCooldownBody` now read "retry in {{count}} minute(s)" as a real i18next v4
   plural group — no abbreviation, no bare number. The same fix was extended to every other
   counted string found in the same audit pass: `box.error.install.stalled`,
   `humbleKeys.urgencyDaysLeft`, `humbleKeys.urgencyHoursLeft` (dropping the "h" abbreviation and
   the hand-rolled `urgencyOneDayLeft` singular), `humbleKeys.syncing`,
   `library.filterPanel.groupSelectedCount`, `winetricksBrowse.resultsHeading`.

3. **Plural keys + call sites passing `count` (item 3)** — split across both commits.
   `machineFillGamelib.ts` (Task 1, commit `ddd2b8ed0`) now expands a plural group to the UNION of
   en's own suffixes and each LOCALE's own CLDR categories (`pluralCategoriesFor`/
   `requiredPluralKeys`/`englishSourceFor`) — ru gets `_one/_few/_many/_other`, ar gets all six,
   ja stays at `_one/_other` — cross-checked against this repo's real `i18next` `pluralResolver`
   for every locale directory. Task 2 (`8816b2007`) converted every counted string above to a real
   `_one`/`_other` group in `en/gamelib.json` and updated every call site to pass `count` (plus
   `done` for syncing) via the `t(key, { count, defaultValue, defaultValue_one })` object-form
   shape i18next requires for inline plural defaults.

4. **Translator context for Claim vs Redeem / Undo vs Cancel / "Giftable spares" (item 4)** —
   Task 1, commit `ddd2b8ed0`. Added `meta/i18nTranslatorNotes.json`, a per-key (or per-plural-base)
   note consumed by `machineFillGamelib.ts` and surfaced to the model via a new `note` field on
   each `TranslateFn` batch item — covering the four "Giftable spares" keys, every `humbleKeys` key
   using Claim/Redeem (mechanical case-insensitive census), and the three Undo/Cancel button-label
   keys. `createAnthropicTranslator`'s system prompt gained two rules: a note is binding, and a
   term repeated across notes in the same batch must translate identically everywhere it appears.

**Item 4's actual re-generation is a SEPARATE step**, owned by
`2026-09-25-refill-systemic-mt-defects-found-by-260925-7zf.md` (needs `ANTHROPIC_API_KEY`). This
todo closes on the SOURCE fix + mechanism landing, not on the re-fill having run yet — Task 2 of
`260925-88h` also invalidated (deleted) every affected key from all 48 non-English locales so the
next fill run regenerates them correctly rather than re-filling around the old defect.
