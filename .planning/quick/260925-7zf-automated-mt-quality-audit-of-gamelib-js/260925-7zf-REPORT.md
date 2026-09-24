# Quick 260925-7zf — Automated MT quality audit of `gamelib.json` fork strings

**Date:** 2026-09-25 · **Scope:** all 280 machine-translated `gamelib.json` keys in the 8
glossary-relaxed locales (`et fi hu hr sl da nb_NO sv`) reviewed row-by-row, plus a deterministic
structural pass over all 48 non-English locales (13,440 keys).

## What this is — and is NOT

- It IS a **second-model review**: the strings were filled by `claude-sonnet-5`
  (`gamelib.mt.json` sidecars); each of the 8 locales was reviewed row-by-row by an independent
  `opus` reviewer agent against the English source, the key name and `meta/i18nGlossary.json`.
- It is **NOT human review.** Every reviewer states non-native confidence limits on register and
  naturalness, and none saw the rendered UI. "48/48 reviewed" remains FALSE. A model reviewing a
  model shares blind spots with it; a clean row here is weaker evidence than a clean row from a
  speaker.
- No `ANTHROPIC_API_KEY` was available to this session, so the review ran through Claude Code
  subagents rather than a reproducible script. The inputs (`inputs/*.json`) and outputs
  (`findings/*.json`) are kept so the result can be re-checked; the run itself cannot be replayed
  byte-for-byte.
- **No locale file was changed.** Suggested fixes are one model's proposals; applying them would
  swap one unreviewed translation for another and must go through the follow-up todos.

## Headline numbers (8 locales × 280 rows = 2,240 rows)

| locale | ok | minor | major | critical |
|---|---|---|---|---|
| da | 253 | 26 | 1 | 0 |
| et | 230 | 49 | 1 | 0 |
| fi | 259 | 19 | 2 | 0 |
| hr | 255 | 22 | 3 | 0 |
| hu | 259 | 20 | 1 | 0 |
| nb_NO | 268 | 11 | 1 | 0 |
| sl | 243 | 35 | 2 | 0 |
| sv | 248 | 31 | 1 | 0 |
| **total** | **2015 (90.0%)** | **213** | **12** | **0** |

Minor by category: grammar 68, terminology 65, register 36, meaning 21, brand inflection 20,
placeholder position 3. Every reviewer independently reported **all `{{placeholders}}` and tags
intact** — consistent with the existing structural parity check.

## The findings that matter are SYSTEMIC, not per-locale

A key flagged in many locales is a defect in the **source or the fill process**, which is exactly
what a per-string human review would be slowest to see.

1. **`humbleKeys.activateConfirmBody` left the section name "Giftable spares" in English in 21 of
   48 locales** (`az br bs cs da eu fa hr id ja ka ko ml nb_NO nl ro sk sr sv ta th`, measured by
   grep over all 48, not just the 8 reviewed). Sibling keys (`c2Action`, `c2Body`,
   `revealConfirmBody`) translate the name, so the confirmation of an IRREVERSIBLE action names a
   section the user cannot find. Likely cause: the name is embedded mid-sentence between em-dashes
   in the source, and the fill treated it as a proper noun. Where it IS translated, the term drifts
   between keys (sl: "rezervne kopije" = *backups* in one row, "razdeljive rezerve" in another).
2. **`library.filterPanel.chipNoStorePageHidden` — English source is ambiguous.** Source:
   `"Hiding no store page"`. Mistranslated in 6/8 (3 major): da "hides nothing", et/hr
   ungrammatical, no locale reliably says *games without a store page are hidden*. **Fix the source
   first**, then re-fill.
3. **`{{minutes}}m` / `{{N}}m` minute abbreviation** (`humbleKeys.cooldown`,
   `revealCooldownBody`) reads as metres in da/nb_NO/sl/sv. Source-side: prefer a full word or
   `min`.
4. **No plural keys in the English source** for counted strings (`{{N}} days`, `{{minutes}}
   minutes`). Slavic locales (sl, hr, and by extension cs/sk/pl/ru/uk/sr/bs/be) cannot be correct
   for 2–4 without i18next `_one/_few/_other` keys. This is a source/code defect, not a
   translation defect.
5. **Claim vs Redeem collapse to one verb** in da, nb_NO, sl, et (and "Undo" == "Cancel" in et).
   These are distinct steps in the Humble keys flow; the source should carry translator context.
6. **`sideload.import-hint.content`: `<3>` link tag wraps only part of the verb** ("in på" / "ind
   på" instead of "Logga in"/"log ind") in 5/8 — renders, but the link text is a fragment.
7. **Untranslated English UI words** (structural pass, all 48): sk leaves
   Cancel/About/Store/Favourites/Other, ml leaves Cancel/Store/Favourites, hr leaves
   All games/Favourites, nl leaves Favourites, az leaves `gameinfo tabs`. The other ~480
   English-identical values are legitimate (theme names, AppImage, cognates such as fr
   *Images*/*Collections*, de/da/sv *Version*).

Structural-pass items NOT treated as defects: CJK length ratios (expected), Thai dropping terminal
full stops (Thai orthography). The apparent `FidelityFX�` corruption was a console-encoding
artefact — the file holds a correct UTF-8 `™`.

## All major findings

| locale | key | category | issue | suggested |
|---|---|---|---|---|
| da | `library.filterPanel.chipNoStorePageHidden` | meaning | Read naturally, the Danish says 'hides no store page', which a user will take to mean nothing is hidden. The chip actually means games without a store page are being hidden. The English is also terse and ambiguous, but the Danish makes the negation more misleading. | Skjuler spil uden butikside |
| et | `library.filterPanel.chipNoStorePageHidden` | grammar | Ungrammatical and unclear filter chip; a user cannot tell that games without a store page are being hidden. Sibling chips use 'Ainult ilma poelehata' / 'Kaasa arvatud ...' patterns. | Poeleheta mängud peidetud |
| fi | `sideload.filter.images` | meaning | The filter covers jpg/png/webp/gif/avif picture files (SideloadDialog/filters.ts:30). 'Levykuvat' means disk images (ISO etc.), which misleads the user in a file picker. settings.loginBackgroundFilterName correctly uses 'Kuvat'. | Kuvat |
| fi | `webview.login.oauth.timeout.body` | meaning | 'täyttyminen' means 'filling up', which makes no sense here. The intended meaning is that the sign-in did not complete in time. | Kirjautuminen kesti liian kauan. Voit yrittää uudelleen. |
| hr | `library.filterPanel.chipNoStorePageHidden` | meaning | Garbled: it reads as if the act of hiding lacks a store page. The chip means games with no store page are hidden. Also clashes with the chipHiddenIncluded/chipNonAvailableIncluded phrasing. | Skrivene igre bez stranice trgovine |
| hr | `library.filterPanel.viewAll` | meaning | Left in English. This is a main library view label. | Sve igre |
| hr | `library.filterPanel.viewFavourites` | meaning | Left in English. This is a main library view label. | Favoriti |
| hu | `themeSelector.oldSchool` | meaning | 'Régi Iskolás' literally means 'old pupil/schoolkid', which misses the idiom 'old school' (retro, classic style). | Oldschool GameLib |
| nb_NO | `humbleKeys.activateConfirmBody` | terminology | Refers to the section as 'Giftable-reservene' (English name left in), while every other row names the same section 'Kan gis bort'. A user looking for the named section will not find it. | Dette avslører nøkkelen — og fjerner den for godt fra «Kan gis bort» — og løser den inn på Steam-kontoen din. Dette kan ikke angres. |
| sl | `humbleKeys.c2Action` | terminology | 'Giftable spares' is rendered as 'Podarljive rezervne kopije'; 'rezervna kopija' is the standard Slovenian term for a BACKUP, so the feature name reads as 'Giftable backups'. It is also inconsistent with activateConfirmBody, which uses a different term ('razdeljive rezerve'). | Pojdi na Rezervne ključe za podaritev |
| sl | `humbleKeys.activateConfirmBody` | terminology | 'Giftable spares' here becomes 'razdeljive rezerve' (distributable reserves) while every other row uses 'Podarljive rezervne kopije'; the user cannot connect this irreversible-action warning to the named section it refers to. Also 'na vašem Steam računu' is more naturally 'v vašem računu Steam'. | To razkrije ključ — s tem se trajno odstrani iz Rezervnih ključev za podaritev — in ga unovči v vašem računu Steam. Tega ni mogoče razveljaviti. |
| sv | `humbleKeys.activateConfirmBody` | terminology | The section name 'Giftable spares' stays in English here, but other rows (c2Action, c2Body, revealConfirmBody) translate it as 'Kan ges bort'. In this confirmation for an action that can't be undone, the dialog names a section that doesn't appear under that name in the Swedish UI. | Detta visar nyckeln — vilket tar bort den från ”Kan ges bort” permanent — och löser in den på ditt Steam-konto. Det går inte att ångra. |

Full per-row findings (213 minor with back-translations and suggestions):
`findings/<locale>.json`. Structural pass over 48 locales: `structural-check.json`.

## What this changes about the parent todo's claim

- "No systematic check of translation QUALITY has been run" is **no longer true** — one has, by
  model, for 8 of 48 locales.
- "48 of 48 locales reviewed" is **still false**, and the parent todo stays open for that reason.
- The spot-check the parent asked for started with the 8 relaxed-glossary locales. Brand inflection
  there came out **mostly correct** (Steamiin, Steams, Humbles); the brand-category minors are
  mostly *missing* inflection (sl/hr "na Steam") or Hungarian hyphenation, not false passes that
  the weakened survival check let through.
