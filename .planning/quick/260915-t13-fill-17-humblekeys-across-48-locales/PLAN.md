---
quick_id: 260915-t13
title: Fill the 17 unlocalised humbleKeys keys across 48 locales
created: 2026-09-15
status: in-progress
---

# Quick Task 260915-t13

Clear the 816-finding CI red by filling the 17 `humbleKeys.*` keys missing from
`public/locales/<locale>/gamelib.json` in all 48 non-English locales.

Follows quick task `260915-srx`, which corrected the record for this defect but fixed nothing.

## Why hand-filling

The sanctioned `pnpm machine-fill-gamelib` path is **dead, re-measured live today**: the 108-char
`sk-ant-` key in `~/.gamelib.env` returns `HTTP 401 {"type":"authentication_error","message":"API
key is invalid."}`. That confirms the 2026-09-08 observation rather than inheriting it.
`machineFillGamelib.ts`'s own D-08 also states it deliberately does **not** bulk-run across all 48
locales. Hand-filling is sanctioned and precedented (quick `260908-iq8`, 46 locales).

## Measured constraints

`gamelibCatalogParity.test.ts:60-82` runs `validateTranslation(source, target, glossary)` over
**every non-empty key in every locale catalog**, so these fills are checked. Of the 17:

| key | constraint |
| --- | --- |
| `claimOnStore` | must reproduce `{{store}}` verbatim |
| `loginAndClaim` | must reproduce `{{store}}` verbatim |
| `emptyBody` | must keep glossary term `Humble Bundle` verbatim |
| the other 14 | no placeholder, no `<N></N>` tag, no glossary term — unconstrained |

`checkStringValueAgainstEnglish` only flags an **empty** string and `<N></N>` tag mismatch. There
is **no identical-to-English check**, so `Type` → `Type` in Dutch is legal, not a finding.

`Humble` alone is **not** a glossary term (only the compound `Humble Bundle` is), so
`Claim on Humble` carries no survival constraint.

## Translation policy

**House style is read from each locale's 13 existing `humbleKeys` strings, not imposed.** The word
"key" is already rendered per-locale and those choices are followed: `de` → **Key**, `nl` → **key**,
`vi` → **mã key**, `ja` → **キー**, `zh_Hans` → **密钥**, `zh_Hant` → **金鑰**, `fr` → **clé**,
`es` → **clave**, and so on. Formality follows each catalog's existing register (`de` Sie,
`es`/`it` tú/tu, `id` Anda).

`filteredEmptyBody` quotes the `redeemableOnly` label; the quoted text is kept byte-consistent with
that locale's own `redeemableOnly` value.

## Tasks

- [ ] Author 17 strings x 48 locales (4 batches).
- [ ] Apply with a round-trip-verified script: assert `json.dumps(json.load(f))` reproduces the
      original before mutating; insert **order-preservingly** (before the first existing key that
      sorts after the new one) because 7 locales' key order is not a subsequence of English.
- [ ] `npx jest --testPathPattern lintTranslations` → both tests 0 findings.
- [ ] `npx jest --testPathPattern gamelibCatalogParity` → green.
- [ ] `pnpm planning-gates` → 11/11.

## Constraints

- Do **not** touch `gamelib.mt.json`. These are hand-written, not machine-translated; the parity
  test only checks manifest ⊆ catalog, so extra catalog keys are fine, and not stamping MT
  provenance on hand-written strings is the honest record.
- Do **not** regenerate `meta/i18nCatalogPresenceBaseline.json`. Filling is the fix.
- Scope is the `gamelib` namespace **only**. The 84 `translation.json` keys are deliberately
  excluded — they require an operator decision about editing an upstream catalog.
- Do not run any `gsd-sdk state.*`, `roadmap.*` or `phase.complete` verb.

## Honest limitation

These are unreviewed translations authored in-session. They are a strict improvement over shipping
English to every locale, but they are not native-reviewed, and confidence is lower for the
low-resource locales (`br`, `uz`, `ta`, `ml`, `ka`, `eu`, `ga`). This adds to the population that
todo `2026-09-03-all-10032-non-english-fork-strings-are-unreviewed-machine-translation` tracks.
