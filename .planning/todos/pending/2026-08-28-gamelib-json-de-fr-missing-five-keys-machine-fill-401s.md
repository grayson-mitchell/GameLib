---
created: 2026-08-28T00:10:00.000Z
title: "gamelib.json fork strings are unfilled in 48 of 49 locales — 80 keys missing from de/fr, 46 locales have no gamelib.json at all, machine-fill 401s, and the lint gate is structurally blind to all of it"
area: i18n
severity: low
status: pending
resolves_phase: ""
found_by: "Quick task 260827-vpl verification (gsd-verifier), while closing Phase 34.11's residual ledger"
files:
  - public/locales/de/gamelib.json
  - public/locales/fr/gamelib.json
  - meta/lintTranslations.ts
  - meta/machineFillGamelib.ts
  - public/locales/
  - meta/i18nGlossary.json
amended: 2026-09-02
amended_by: "quick task 260902-9wt"
---

`public/locales/en/gamelib.json` has **210** keys, of which **204 are translatable** (the
other 6 are a pre-existing English authoring gap, covered below). `public/locales/de/gamelib.json`
and `public/locales/fr/gamelib.json` have **124** keys each — **80 translatable keys are absent
from each**, and 0 are present-but-empty.

The five keys below are still missing from `de` and `fr`. They are a documented SUBSET of the
80, not the whole gap:

| Key | English |
|---|---|
| `library.filterPanel.emptyAlphabetLetter` | `Starting with "{{letter}}"` |
| `library.filterPanel.emptyAlphabetNumber` | `Starting with a number` |
| `installFlows.pathRejectedTitle` | `Can't use that location` |
| `installFlows.pathRejectedBodyMove` | `GameLib couldn't move this game there. …` |
| `installFlows.pathRejectedBodyImport` | `GameLib couldn't import from that location. …` |

The remaining six (`redeemKey.alreadyOwned`, `.error`, `.invalid`, `.rateLimited`,
`.successNoPackage`, `.successWithPackage`) are **empty strings in English too** — a
separate, pre-existing authoring gap, not a translation gap. `en` still has exactly 6 empty
values.

The first two of the five-key table were added by quick task `260827-vpl` (WR-10's zero-state
sentence, commit `b04601b8a`). The three `installFlows.*` keys predate it and belong to the
path-rejection work — this todo covers both because the cause and the fix are identical.

**Why CI cannot see it.** `meta/lintTranslations.ts` (backing `pnpm
lint-translations:gamelib`) checks a translated file's *own* keys against English. A key
that is **absent** from a translation is structurally invisible to it, so the gate stays
green at zero coverage for the missing key and the plan's own "run machine-fill if the
gate complains" trigger never fires. Worth fixing the gate too: a presence check against
`en/gamelib.json` would have caught all five the day each landed. This is exactly why the
gap could grow from 5 to 80 unobserved — this todo predicted that shape, and the prediction
is now measured.

**Why it is not already fixed.** `GAMELIB_MT_LOCALES=de,fr pnpm machine-fill-gamelib`
correctly planned 5 keys for `de`, then failed:

```
Requesting translation for 5 key(s) into locale "de"...
::error::machine-fill-gamelib failed: Anthropic API request failed for locale "de": HTTP 401
```

`ANTHROPIC_API_KEY` **is** set in the environment but the value 401s against the
Anthropic API — it is not a valid raw API key (an OAuth/subscription token will not work
here; `machineFillGamelib.ts:824` reads `process.env.ANTHROPIC_API_KEY` and passes it
straight through). The failed run wrote **nothing** — both catalogs verified byte-unchanged
afterwards, so the D-09 contract held.

## Widened 2026-09-02 — 46 locales have ZERO fork-string coverage

`public/locales/` holds 49 locale directories; only `en`, `de` and `fr` carry a
`gamelib.json` at all. 46 locales have never had a single fork string filled — 204
translatable keys x 46 locales. Decision 2 of the now-closed
`.planning/todos/completed/2026-08-06-phase-34-8-i18n-context-fork-namespace-llm-machine-fill-defe.md`
said "an LLM covers all Heroic locales," sized at "a few hundred keys x 50 locales"; that
clause was never executed beyond `de` and `fr`. Until this amendment the 46-locale gap was
owned by NOBODY — the 2026-08-06 todo closed on its five decisions each having a built
artifact, and this todo, until now, only knew about two locales. This todo now owns the
full 46-locale residue.

## The only blocker is a valid raw Anthropic API key — an OPERATOR action

Every engineering prerequisite is built and tested: `meta/machineFillGamelib.ts`, the
`pnpm machine-fill-gamelib` task (`package.json:57`), hermetic tests at
`meta/__tests__/machineFillGamelib.test.ts`, the glossary at `meta/i18nGlossary.json` backed
by `meta/__tests__/i18nGlossary.test.ts`, and the MT-origin sidecar manifest written to
`public/locales/<locale>/gamelib.mt.json`. Nothing here needs engineering. It needs a key.

**How to apply:** export a real Anthropic API key and re-run `pnpm machine-fill-gamelib`
with `GAMELIB_MT_LOCALES` naming the full locale set (or omitted, if the script defaults to
all locales) — this is no longer a de/fr-only run. Then verify the fill actually
happened — count the keys, do not trust exit 0; a batch translation job on this project has
previously returned zero results and still exited cleanly. Verify by counting keys per
locale afterwards. Do **not** hand-translate these in isolation: `emptyAlphabetLetter` is
substituted into `emptyBody` (`No games match {{filters}}.`) as a list member, so the
descriptor's grammatical form has to work inside that sentence in each target language —
which is exactly the judgement the glossary-aware fill exists to make.

**Not a blocker for Phase 34.11.** `34.11-REVIEW-FIX.md` is `all_fixed` on its own terms;
this is a done-criterion of the quick task that closed it, not one of the ledger's findings.

## Amendment note — 2026-09-02, quick task 260902-9wt

This todo previously stated `en` had 135 keys and that 5 translatable keys were missing from
`de`/`fr`. English grew 135 -> 210 between 2026-08-28 and 2026-09-02 (the fork's namespace
kept growing as Phase 34.8's plans landed), and the measured gap grew 5 -> 80 in the same
window — exactly the shape the gate-blindness diagnosis above predicted. The old figures are
preserved here as history rather than erased. The old title ("de/fr gamelib.json are missing
5 translatable keys …") is superseded by the title above; the filename is deliberately left
unchanged, since the closed 2026-08-06 todo's closure record already cross-links to it by
filename.
