---
created: 2026-09-02
title: "46 of 49 locales have ZERO fork-string coverage — `gamelib.json` exists only for en/de/fr, leaving 204 translatable keys x 46 locales unfilled"
area: i18n
status: pending
severity: medium
resolves_phase: ""
found_by: "Quick task 260902-9wt (the 2026-08-06 Phase-34.8 i18n closure), split out into its own record by quick 260902-ad5 at the operator's request"
blocked_by: "OPERATOR ACTION, not engineering — a valid RAW Anthropic API key. `ANTHROPIC_API_KEY` is set but 401s; an OAuth/subscription token will not work."
files:
  - public/locales/
  - public/locales/en/gamelib.json
  - meta/machineFillGamelib.ts
  - meta/i18nGlossary.json
  - meta/lintTranslations.ts
---

# 46 of 49 locales have zero fork-string coverage

## Why this is being filed now

`260902-9wt` closed the 2026-08-06 Phase-34.8 i18n decision todo on shipped evidence and, in
the same pass, widened the `2026-08-28` de/fr todo to also carry this 46-locale gap. The
operator has since asked for this gap tracked as its own record. `260902-ad5` splits it back
out. **`260902-9wt` was not wrong** — it correctly re-homed a residue that until then was
owned by nobody; the operator simply wants the larger gap tracked separately.

**Sole owner:** this todo OWNS the 46-locale x 204-key fork-string coverage gap.

## What the gap actually is

- `public/locales/` holds **49** locale directories. Only **en**, **de** and **fr** carry a
  `gamelib.json` at all. **46 locales have never had a single fork string filled.**
- `en/gamelib.json` has **210** keys, of which **204 are translatable**. The other 6 are
  empty in English too — a separate, pre-existing English AUTHORING gap (the `redeemKey.*`
  one), and it is owned by the `2026-08-28` todo, not by this one.
- Scale of this gap: **204 translatable keys x 46 locales.**

## Provenance — this is coverage, not a decision

Decision 2 of the now-closed
`.planning/todos/completed/2026-08-06-phase-34-8-i18n-context-fork-namespace-llm-machine-fill-defe.md`
said "an LLM covers all Heroic locales", sized at "a few hundred keys x 50 locales". That
clause was never executed beyond `de` and `fr`. The decision was adopted and BUILT; it was
simply never RUN at scale. This is why this is a coverage todo and not a reopened decision.

## User-visible consequence

A user running GameLib in any of those 46 locales sees **every fork-added string in
English**. That is the reason this deserves its own record.

## Related but distinct

`.planning/todos/pending/2026-09-01-non-english-catalogs-are-unrebranded-2117-heroic-strings.md`
covers UPSTREAM Heroic catalogs being unrebranded (2274 "Heroic" strings, 0 "GameLib", in
`translation.json`/`gamepage.json`). **That is a different defect.** That one is about
upstream strings carrying the wrong product name; **this one is about FORK strings in
`gamelib.json` being ABSENT ENTIRELY.** Both are plausibly served by the same
glossary-aware machine fill, and that shared tooling is exactly why they are easy to
conflate.

## The only blocker is a valid raw Anthropic API key — an OPERATOR action

Every engineering prerequisite is built and tested: `meta/machineFillGamelib.ts`; the
`pnpm machine-fill-gamelib` task (`package.json:57`); hermetic tests at
`meta/__tests__/machineFillGamelib.test.ts`; the glossary `meta/i18nGlossary.json` backed by
`meta/__tests__/i18nGlossary.test.ts`; and the MT-origin sidecar manifest written to
`public/locales/<locale>/gamelib.mt.json` (`machineFillGamelib.ts:781`). Nothing here needs
engineering — it needs a key. `ANTHROPIC_API_KEY` **is** set but 401s against the Anthropic
API; it is not a valid raw API key, and an OAuth/subscription token will not work, because
`machineFillGamelib.ts:824` reads `process.env.ANTHROPIC_API_KEY` and passes it straight
through.

## Verification discipline for whoever runs it

Count keys per locale afterwards; do **NOT** trust exit 0 — a batch translation job on this
project has previously returned zero results and still exited cleanly. Also: a retry is
SAFE — the prior failed run wrote **nothing** and both catalogs verified byte-unchanged
afterwards, so the D-09 contract held.

## Do not hand-translate

`emptyAlphabetLetter` is substituted into `emptyBody` (`No games match {{filters}}.`) as a
list member, so its grammatical form has to work inside that sentence in each target
language — which is exactly the judgement the glossary-aware fill exists to make.

## Provenance of this record — a deliberate split, not a correction

This gap was SPLIT OUT of
`.planning/todos/pending/2026-08-28-gamelib-json-de-fr-missing-five-keys-machine-fill-401s.md`
on 2026-09-02 by quick task `260902-ad5`, at the operator's request. Quick `260902-9wt` had
widened that todo to absorb this gap one hour earlier; this split deliberately reverses that
part of `260902-9wt`. **`260902-9wt` was not wrong** — it correctly re-homed a residue that
until then was owned by NOBODY. The operator simply wants the larger gap tracked as its own
record. This is not a correction, an error, or a fix.

Full pointer chain, so a reader can see it is complete: closed `2026-08-06` decision record
(whose CLOSURE RECORD hands the residue on, and which is forward-pointed here by an appended
"Later addition" note) →
`.planning/todos/pending/2026-08-28-gamelib-json-de-fr-missing-five-keys-machine-fill-401s.md`
(de/fr half, whose `## Split out 2026-09-02` section forwards here) → this todo (46-locale
half).

## Sources

- `.planning/todos/completed/2026-08-06-phase-34-8-i18n-context-fork-namespace-llm-machine-fill-defe.md`
  — the closed decision record, its CLOSURE RECORD, and its "Later addition" note
- `.planning/todos/pending/2026-08-28-gamelib-json-de-fr-missing-five-keys-machine-fill-401s.md`
  — the de/fr half this gap was split out of
- `meta/machineFillGamelib.ts`, `meta/i18nGlossary.json`, `meta/lintTranslations.ts`
