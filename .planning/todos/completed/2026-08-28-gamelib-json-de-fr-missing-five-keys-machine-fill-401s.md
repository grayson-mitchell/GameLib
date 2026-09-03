---
created: 2026-08-28T00:10:00.000Z
title: "CLOSED 2026-09-03 -- de and fr are both at full fork-string coverage; the 401 was real, but two glossary-validator defects were the larger blocker"
title_history: "de/fr gamelib.json are missing 80 translatable keys each, machine-fill 401s, and the lint gate is structurally blind to an absent key"
area: i18n
severity: low
status: CLOSED
closed: 2026-09-03
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
amended_by: "quick tasks 260902-9wt, then 260902-ad5"
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

## Split out 2026-09-02

The 46-locale zero-fork-string-coverage gap has MOVED to
`.planning/todos/pending/2026-09-02-46-locales-have-zero-gamelib-json-fork-string-coverage.md`.
This todo now owns `de`/`fr` ONLY. The move deliberately reverses the widening quick
`260902-9wt` performed one hour earlier, at the operator's request, via quick task
`260902-ad5`. **`260902-9wt` was not wrong** — it re-homed a residue that until then had no
owner at all, and the operator subsequently asked for the larger gap as its own record.

## The only blocker is a valid raw Anthropic API key — an OPERATOR action

Every engineering prerequisite is built and tested: `meta/machineFillGamelib.ts`, the
`pnpm machine-fill-gamelib` task (`package.json:57`), hermetic tests at
`meta/__tests__/machineFillGamelib.test.ts`, the glossary at `meta/i18nGlossary.json` backed
by `meta/__tests__/i18nGlossary.test.ts`, and the MT-origin sidecar manifest written to
`public/locales/<locale>/gamelib.mt.json`. Nothing here needs engineering. It needs a key.

**How to apply:** export a real Anthropic API key and re-run
`GAMELIB_MT_LOCALES=de,fr pnpm machine-fill-gamelib`. Then verify the fill actually
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

**Later addition, 2026-09-02, quick task 260902-ad5.** Quick `260902-9wt`'s widened title
("gamelib.json fork strings are unfilled in 48 of 49 locales — 80 keys missing from de/fr,
46 locales have no gamelib.json at all, machine-fill 401s, and the lint gate is structurally
blind to all of it") is itself now superseded — see `## Split out 2026-09-02` above. This
todo reverts to owning `de`/`fr` only; the 46-locale gap has its own record.

## CLOSURE RECORD -- 2026-09-03

**Measured at closure:** `public/locales/de/gamelib.json` and `public/locales/fr/gamelib.json`
each hold **209 keys with 0 missing translatable keys**. The gap this todo recorded -- **80
translatable keys absent from each** -- is fully closed. Counted by flattening both catalogs
against `en/gamelib.json` key-by-key, not by reading an exit code.

### The 401 was real, and it was not the whole story

This todo named its only blocker as "a valid raw Anthropic API key -- an OPERATOR action, not
an engineering one." The operator supplied a working key and ran the fill on 2026-09-03, and
the 401 is resolved. **But the key alone would not have closed this gap.** Two defects in
`meta/machineFillGamelib.ts`'s glossary validator silently rejected correct translations while
the run exited 0:

1. **Quick `260903-itr`** -- the source-side presence check was case-**IN**sensitive while the
   survival check was case-**sensitive**, so an English source containing the ordinary word
   "browser" demanded the literal `Browser` survive into the translation. Cost: 185 strings
   across 46 languages.
2. **Quick `260903-ly4`** -- the trailing `(?![A-Za-z0-9_])` lookahead on the target-side
   matcher forbade a glossed brand from taking any suffix, which is invisible in English and
   fatal in inflecting languages. Cost: the last 57 strings across 8 locales.

Both are the same root shape: a validator encoding **English** morphology and applying it to
languages that do not share it. Without both fixes the fill would have written little or
nothing for most locales **and still exited 0** -- exactly the failure this todo warned about
in its own "verify the fill actually happened -- count the keys, do not trust exit 0" note.
That warning was correct and is the reason the closure above is stated in counted keys.

`de` is a special case worth recording: it was the **only** locale to survive defect (1)
intact, because "Browser" is also the capitalised German noun. A spot check against `de` alone
would have cleared a 46-locale defect.

**Wider outcome:** all 48 non-English locales now hold all 209 translatable keys -- 10032
filled, 0 outstanding. The full arc, the per-locale evidence and the residues are recorded in
`.planning/todos/completed/2026-09-02-46-locales-have-zero-gamelib-json-fork-string-coverage.md`,
closed the same day.

## What this closure does NOT cover

**Six keys are still empty in ENGLISH.** `redeemKey.alreadyOwned`, `.error`, `.invalid`,
`.rateLimited`, `.successNoPackage`, `.successWithPackage` are empty strings in
`en/gamelib.json` itself -- a pre-existing **authoring** gap this todo already documented, not
a translation gap, and correctly untouched by the machine-fill. `en` has 215 total keys and
209 translatable. Both todos that documented this residue are closed as of 2026-09-03, so it
now has **no owner**; that is recorded plainly rather than assumed away.

**The lint-gate blindness this todo diagnosed is NOT fixed.** `meta/lintTranslations.ts` still
checks a translated file's *own* keys against English, so a key **absent** from a translation
remains structurally invisible and the gate still stays green at zero coverage. That diagnosis
was this todo's most valuable content and it survives its closure intact -- the next fork
string added will be just as invisible as the 80 were. It has no owning todo after this
closure.

**Every non-English value is unreviewed machine translation**, marked MT-origin in each
locale's `gamelib.mt.json` sidecar. Weblate human review stays deferred per the 2026-08-06
decision.
