---
created: 2026-09-03
title: "All 10032 non-English fork strings are unreviewed machine translation — full coverage is not reviewed coverage"
area: i18n
status: RESOLVED
resolved: 2026-09-25
resolved_by: quick-260925-88h
severity: minor
platform: any
ready: human
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

## Automated audit — 2026-09-25 (quick `260925-7zf`) — this todo stays OPEN

The "cheap first step" above was run as a **second-model review**, not a human review. Each of the
8 relaxed-glossary locales (`et fi hu hr sl da nb_NO sv`) was reviewed row by row by an
independent `opus` reviewer. That covered 2,240 rows: **2,015 ok, 213 minor, 12 major, 0
critical**, with placeholders and tags intact everywhere. A deterministic structural pass was also
run over all 48 locales. Report:
`.planning/quick/260925-7zf-automated-mt-quality-audit-of-gamelib-js/260925-7zf-REPORT.md`.

- The line **"No systematic check of translation QUALITY has been run at any point" is no longer
  true.** One model-based check has run, over 8 of 48 locales.
- The line **"48 of 48 locales reviewed" is STILL FALSE.** A model reviewing a model shares its
  blind spots. Every reviewer declared non-native limits on register, and none of them saw the
  UI. Nothing in `public/locales/` was changed.
- The relaxed brand-survival check did **not** turn out to hide a cluster of false passes. Brand
  inflection in these 8 locales is mostly correct. The brand-category minor findings are
  *missing* inflection or Hungarian hyphenation, not wrong brands.
- The valuable findings are **systemic**, meaning the same key fails across locales, which a
  per-language human review would be slow to spot. They are filed as two follow-ups:
  `2026-09-25-i18n-source-strings-defeat-translation-ambiguous-chip-minute-abbrev-no-plurals.md`
  (`ready: code`, source fixes first) and `2026-09-25-refill-systemic-mt-defects-found-by-260925-7zf.md`
  (`ready: human`, needs the API key). The headline follow-up is that "Giftable spares" is left in
  English in `activateConfirmBody` in **21 of 48** locales.

What remains here: human review, via the still-deferred Weblate path or a speaker's spot check.
40 locales have had no quality check of any kind.

## Resolution — the done-criterion is reframed, not met by human review

Closed by quick task `260925-88h` (2026-09-25), acting on an **operator decision** to reframe this
todo's done-criterion rather than pursue human review of all 48 languages (no reviewer pool
exists). The new criterion: **"MT is disclosed in-app, reportable, and has no known systematic
defect."** Both halves of that criterion are now addressed:

1. **Disclosed in-app + reportable.** `LanguageSelector` now shows a machine-translation notice
   plus a "Report a translation problem" link for every non-English language (never for English),
   using the existing `window.api.openExternalUrl` — no new IPC surface. The link opens a prefilled
   GitHub issue via `.github/ISSUE_TEMPLATE/translation_problem.yaml`. The dead `showWeblateLink`
   path (never enabled anywhere, pointed at Heroic's own Weblate project which this fork does not
   pull from) was removed from the picker in the same change.
2. **No known systematic defect.** The systemic source defects this todo's own 260925-7zf audit
   found (ambiguous chip label, `m`/`h` abbreviations, missing plural forms, missing translator
   context for Claim/Redeem/Undo-Cancel/"Giftable spares") are fixed at the source — see
   `2026-09-25-i18n-source-strings-defeat-translation-ambiguous-chip-minute-abbrev-no-plurals.md`'s
   own Resolution section for the commit-level detail.

**Human review is no longer the criterion, and is NOT what closes this todo.** The line "48 of 48
locales reviewed is STILL FALSE" stays true in fact — nothing about that changed. What changed is
the standard this todo is held to: disclosure + reportability + no known systemic defect, not
per-language human sign-off. The remaining half-step — actually RE-RUNNING the fill so the fixed
source strings and translator notes reach the 48 catalogs — is a separate, `ready: human` step
(needs `ANTHROPIC_API_KEY`), owned by
`2026-09-25-refill-systemic-mt-defects-found-by-260925-7zf.md`, which this closure does not
presume has happened.
