---
created: 2026-09-03
title: "All 10032 non-English fork strings are unreviewed machine translation — full coverage is not reviewed coverage"
area: i18n
status: pending
severity: low
resolves_phase: ""
found_by: "Closing the two i18n fork-string coverage todos on 2026-09-03 (commit ef7d7b8e6) — both closure records name this residue as surviving unowned"
files:
  - public/locales/
  - meta/machineFillGamelib.ts
  - meta/i18nGlossary.json
---

# All 10032 non-English fork strings are unreviewed machine translation

## The claim this record exists to prevent

As of 2026-09-03 all **48** non-English locales hold all **209** translatable fork keys —
**10032 filled, 0 outstanding**. Every one of those values was produced by
`meta/machineFillGamelib.ts` via `claude-sonnet-5`, and **none has been reviewed by a human
speaker of any of the 48 languages.**

"48 of 48 locales at full coverage" and "48 of 48 locales reviewed" are different claims. **Only
the first is true.** This todo exists so the second is never inferred from the first.

## Provenance is recorded, not lost

Each locale carries a `public/locales/<locale>/gamelib.mt.json` sidecar marking MT origin, written
by `machineFillGamelib.ts`. `machineFillGamelib.ts:358-366` documents that `filledAt` records when
keys were **FILLED** rather than when the script ran — deliberately, so that a later human-review
import reads accurate provenance.

The Weblate human-review path was **deliberately deferred** by decision 4 of the 2026-08-06
Phase-34.8 i18n decision todo (closed 2026-09-02 by quick `260902-9wt`) and remains deferred.
**This todo does not reverse that decision.** It records the standing exposure the deferral leaves.

## Why this is more than bookkeeping

Two separate defects in the fill's **own glossary validator** silently rejected **correct**
translations while the script exited 0:

| quick task | defect | strings lost |
|---|---|---|
| `260903-itr` | source-side check case-insensitive vs a case-sensitive survival check | 185 |
| `260903-ly4` | trailing word boundary forbade a glossed brand taking any suffix | 57 |

Both were found by **measuring which strings failed**, not by reading the script's output. A
validator that was wrong twice in two days about what a valid translation looks like is a reason to
treat the translations it **accepted** as unverified too.

**No systematic check of translation QUALITY has been run at any point.** The only automated
assertions are structural:

- interpolation-placeholder parity — 0 mismatches across all 10032
- glossary-term survival

Neither can detect a fluent, well-formed, **wrong** translation.

## A cheap first step — explicitly NOT the full Weblate path

Spot-review a sample in any language the team can read. **Start with the locales the glossary
validator had to be relaxed to accept** — `et`, `fi`, `hu`, `hr`, `sl`, `da`, `nb_NO`, `sv` —
since those are precisely the strings where the brand term was inflected and the survival check is
now **weaker by design** (`260903-ly4` traded a false-reject for a false-pass deliberately, and
recorded that trade in the code).

## Provenance

Filed from the residue carve-outs in
`.planning/todos/completed/2026-08-28-gamelib-json-de-fr-missing-five-keys-machine-fill-401s.md`
and
`.planning/todos/completed/2026-09-02-46-locales-have-zero-gamelib-json-fork-string-coverage.md`,
both closed 2026-09-03. Both state in writing that this residue survives their closure with **no
owner**.
