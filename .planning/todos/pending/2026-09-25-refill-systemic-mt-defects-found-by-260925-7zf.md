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

The source fixes are DONE (quick `260925-88h`, both commits `ddd2b8ed0` and `8816b2007`):
`2026-09-25-i18n-source-strings-defeat-translation-ambiguous-chip-minute-abbrev-no-plurals.md` is
closed. `machineFillGamelib.ts` now expands a plural group to each locale's own required CLDR
forms and threads per-key translator notes (`meta/i18nTranslatorNotes.json`) into the model
prompt. Every key this section lists was DELETED (not re-translated) from the affected locales by
260925-88h's invalidation sweep, so the fill below will see each one as a genuine missing key and
regenerate it under the fixed source text / new translator context — no key here needs manual
identification at re-fill time; `collectMissingKeys` finds all of them automatically.

## Run this

```
ANTHROPIC_API_KEY=<key> GAMELIB_MT_LOCALES=all GAMELIB_MT_CONFIRM_BULK=1 pnpm machine-fill-gamelib
```

Then re-record the presence baseline and confirm it goes clean:

```
LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib
```

`totalPairs` should return to 0, or name only genuinely SKIPPED keys (a translation the fill itself
declined to write — check the run's own `SKIPPED` log lines for why, e.g. a glossary-term or
plural-group-completeness rejection per `meta/machineFillGamelib.ts`'s D-09 rules).

Then:

```
npx jest meta/__tests__/gamelibCatalogParity.test.ts
```

should be fully green — including its `keeps each plural group fully present or fully absent, per
its own required CLDR forms` check, which will be exercising REAL data (ru/ar/etc. `_few`/`_many`
forms) for the first time once this run lands.

Then:

```
grep -l Giftable public/locales/*/gamelib.json
```

should return `en` only — the "Giftable spares" section name in `activateConfirmBody`/`c2Action`/
`c2Body`/`revealConfirmBody` should now be translated identically in every locale via the
`i18nTranslatorNotes.json` note, not left in English.

## What the fill will regenerate — full invalidated-key list (260925-88h Task 2(c))

Every key below was deleted from all 48 non-English `gamelib.json` + `gamelib.mt.json` files
(never re-translated by hand or model) so the fill sees each as missing.

**(i) Text changed:**
- `library.filterPanel.chipNoStorePageHidden`

**(ii) Flat key replaced by an i18next v4 `_one`/`_other` plural group (now needing each locale's
own full CLDR set, e.g. ru also needs `_few`/`_many`):**
- `box.error.install.stalled`
- `humbleKeys.cooldown`
- `humbleKeys.revealCooldownBody`
- `humbleKeys.urgencyDaysLeft`
- `humbleKeys.urgencyHoursLeft` (its old singular sibling `humbleKeys.urgencyOneDayLeft` was
  deleted outright, not replaced — plural resolution now covers count=1)
- `humbleKeys.syncing`
- `library.filterPanel.groupSelectedCount`
- `winetricksBrowse.resultsHeading`

**(iii) Translator input changed — every key in `meta/i18nTranslatorNotes.json` (Giftable
spares / Claim vs Redeem / Undo vs Cancel context added):**
- `humbleKeys.c2Action`, `humbleKeys.c2Body`, `humbleKeys.revealConfirmBody`,
  `humbleKeys.activateConfirmBody` (Giftable spares + Redeem vs Claim)
- `humbleKeys.claimOnHumble`, `humbleKeys.claimOnStore`, `humbleKeys.claimWizardTitle`,
  `humbleKeys.loginAndClaim`, `humbleKeys.syncToEnableClaiming` (Claim vs Redeem)
- `humbleKeys.giftConfirmBody` (Claim vs Redeem — contains both verbs)
- `humbleKeys.activateConfirmBodyRevealed`, `humbleKeys.activatingBody`,
  `humbleKeys.markRedeemed`, `humbleKeys.redeemableOnly`, `humbleKeys.redeemedAnnotation`,
  `humbleKeys.redeemOnPlatform`, `humbleKeys.revealRejectedBody`, `humbleKeys.state.redeemed`
  (Redeem vs Claim)
- `humbleKeys.undo`, `humbleKeys.undoOwnershipOverride`, `humbleKeys.activateDismiss`
  (Undo vs Cancel)

**(iv) Measured untranslated-English pairs (Target 2 below, now expressed as missing keys):**
- sk: `box.cancel`, `about.navLabel`, `library.filterPanel.storeGroup`,
  `library.filterPanel.viewFavourites`, `library.storeOther`
  (`humbleKeys.activateDismiss` already covered by (iii) above)
- ml: `box.cancel`, `library.filterPanel.storeGroup`, `library.filterPanel.viewFavourites`
  (`humbleKeys.activateDismiss` already covered by (iii) above)
- hr: `library.filterPanel.viewAll`, `library.filterPanel.viewFavourites`
- nl: `library.filterPanel.viewFavourites` (nl's `storeGroup` was deliberately LEFT IN PLACE —
  the original todo marks "Store" a possible acceptable loan word there; re-check it if you have a
  Dutch speaker, but it is not missing and will not be re-filled)
- az: `gamepage.tabsAriaLabel`

**Plus two brand-new keys (never existed before, not an invalidation — genuinely new):**
- `languageSelector.mtNotice`, `languageSelector.reportTranslationProblem` (260925-88h Task 3, the
  MT-disclosure note and report link)

## Targets (updated)

1. **Target 1 — "Giftable spares" in `activateConfirmBody`**: now expressed as key (iii) above,
   using the SAME translated term as `c2Action` in each locale via the shared translator note.
   Re-verify with `grep -l Giftable public/locales/*/gamelib.json` per the Run-this section.
2. **Target 2 — English UI words left untranslated**: now expressed as key (iv) above — every
   pair the original `structural-check.json` census found is now a genuinely missing key the fill
   will pick up, not something requiring separate identification.
3. **Target 3 — the 12 major findings** in the 260925-7zf report's table: UNCHANGED by 260925-88h.
   Apply after a speaker or a second reviewer agrees — the reviewers' `suggested` values are one
   model's proposals, not verified fixes.

## Trap

Re-filling updates `gamelib.mt.json` `filledAt`, and that is correct. Do NOT mark any key as
human-reviewed: a model-reviewed re-fill is still machine translation. See the parent todo
`2026-09-03-all-10032-non-english-fork-strings-are-unreviewed-machine-translation.md` (closed
2026-09-25 under the reframed "disclosed + reportable + no known systemic defect" criterion — this
re-fill is not required for that closure, but is still the right next step to actually correct the
defects it found).
