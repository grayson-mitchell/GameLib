---
created: 2026-09-02
title: "CLOSED 2026-09-03 -- all 10032 fork strings filled across 48 of 48 locales; the blocker was never only the API key but two English-morphology defects in the glossary validator"
title_history: "242 of 10032 fork strings (48 locales x 209 translatable keys) remain outstanding after the 260903-itr machine-fill + glossary-matcher fix; 185 need only a re-run, 57 are undiagnosed"
area: i18n
status: CLOSED
closed: 2026-09-03
severity: medium
resolves_phase: ""
found_by: "Quick task 260902-9wt (the 2026-08-06 Phase-34.8 i18n closure), split out into its own record by quick 260902-ad5 at the operator's request"
blocked_by: ""
blocked_by_history: "Nothing operator-side any more. The prior API-key blocker was resolved when quick 260903-itr ran the fill on 2026-09-03 (commit 3b3d813f2). The dominant remaining blocker was meta/machineFillGamelib.ts containsTermLoose/containsTermVerbatim case asymmetry, fixed by the same quick task (commit c198c1021) -- a pnpm machine-fill-gamelib re-run is now required to collect the 185 fills that fix unblocks. The other 57 outstanding fills are undiagnosed and need separate investigation."
files:
  - public/locales/
  - public/locales/en/gamelib.json
  - meta/machineFillGamelib.ts
  - meta/i18nGlossary.json
  - meta/lintTranslations.ts
  - meta/hardcodedStringGate.ts
  - meta/__tests__/gamelibCatalogParity.test.ts
---

# 46 of 49 locales have zero fork-string coverage

## Why this is being filed now

`260902-9wt` closed the 2026-08-06 Phase-34.8 i18n decision todo on shipped evidence and, in
the same pass, widened the `2026-08-28` de/fr todo to also carry this 46-locale gap. The
operator has since asked for this gap tracked as its own record. `260902-ad5` splits it back
out. **`260902-9wt` was not wrong** — it correctly re-homed a residue that until then was
owned by nobody; the operator simply wants the larger gap tracked separately.

**Sole owner:** this todo OWNS the 46-locale x 204-key fork-string coverage gap.

## 2026-09-03 update (quick 260903-itr) — coverage landed, glossary matcher was the real blocker

The API-key blocker recorded below is now HISTORICAL. On 2026-09-03, quick task `260903-itr`:

1. Committed the machine fill for all 48 non-en locales (`3b3d813f2`): every one of the **49**
   locale directories now carries a `gamelib.json`, and 48 carry a `gamelib.mt.json`
   MT-provenance sidecar. **48 locales x 209 translatable English keys = 10032.** Measured:
   **9790 filled**, **242 outstanding**, 0 interpolation-placeholder mismatches, 2749
   brand-term occurrences preserved and 0 dropped. `de` is the only locale at full 209/209
   coverage.
2. While proving the glossary-consumer gates for a planned glossary edit, measured that
   `meta/machineFillGamelib.ts`'s glossary validator applied its "does the source use this
   term" check (`containsTermLoose`) case-INsensitively while its "does the translation keep
   the term" check (`containsTermVerbatim`) stayed case-SENSITIVE. `Browser` is the one
   glossary entry that is also an everyday English common noun, so any source string
   containing lowercase "browser" demanded the literal ASCII `Browser` survive into the
   translation — something no genuine translation of the word can do. This silently rejected
   **185 of the 242** outstanding fills across 46 languages while the fill run still exited 0;
   `de` passed only because "Browser" happens to also be the German noun.
3. Fixed the root cause (commit `c198c1021`): the check is now symmetric with
   `containsTermVerbatim` (renamed `containsTermSourcePresence`). Measured blast radius:
   exactly 4 English strings change behaviour (`login.logoutFailedMessage`,
   `webview.unavailable.body`, `webview.unavailable.next-step`,
   `webview.unavailable.open-in-browser`), zero collateral across the other 27 glossary terms.
   `Browser` was deliberately kept IN the glossary (not removed — see "Provenance of the
   glossary-removal alternative" below); `meta/hardcodedStringGate.ts` is therefore unaffected
   and stayed green throughout.

**What is left, now that this todo is current:**

- A `pnpm machine-fill-gamelib` re-run is required to actually COLLECT the 185 fills the fix
  unblocks — the fix only stops future rejections, it does not retroactively fill anything.
- The other **57** of the 242 outstanding fills are **NOT** browser-caused and **NOT yet
  diagnosed** — they need separate investigation. Worst-affected locales by outstanding count:
  **et 37**, **fi 17**, **hu 11**, **hr 6**, **sl 5**, **sv 5**, **sk 4**, **ta 1**.
- This todo **stays `status: pending`** — the gap is smaller (242, not 10032, and half of that
  242 has a known fix awaiting only a re-run), not closed.

## Provenance of the glossary-removal alternative (considered, rejected)

`260903-itr`'s original plan proposed removing `Browser` from
`meta/i18nGlossary.json` instead of fixing the matcher. That was measured, at execution time,
to flip `meta/hardcodedStringGate.ts` — a BLOCKING gate — RED at **8 sites across 6 files**
(`InstallModal/index.tsx` x2, `InstalledInfo.tsx`, `GamePage/index.tsx`, `GameCard/index.tsx`,
`SideloadDialog/filters.ts`, `SideloadDialog/index.tsx` x2), not the 1 site originally
anticipated. A declaration-scoped `i18n-gate-exempt:` marker exempts an entire top-level
statement, not a single literal — for 4 of those 6 files that statement is a large React
component, so covering all 8 sites this way would have opened a materially wider hole in a
blocking gate than the coverage gap was worth. The root-cause fix above (making
`containsTermLoose` case-sensitive) was chosen instead: `Browser` stays in the glossary, no
`src/` file is touched, and `hardcodedStringGate` stays green and unchanged.


## What the gap actually is (as filed 2026-09-02 — see the 2026-09-03 update above for
current reality)

- `public/locales/` holds **49** locale directories. As filed, only **en**, **de** and **fr**
  carried a `gamelib.json` at all, leaving **46 locales** with never a single fork string
  filled. **As of 2026-09-03 this is resolved:** all 49 directories carry a `gamelib.json`
  and 48 carry a `gamelib.mt.json` sidecar (see the update section above).
- `en/gamelib.json` had **210** keys, of which **204** were translatable, at filing time. It
  has since grown to **215** keys (**209 translatable**, still **6** empty — the same
  pre-existing `redeemKey.*` English-authoring gap, still owned by the `2026-08-28` todo, not
  this one).
- Scale of the gap **as filed**: 204 translatable keys x 46 locales = 9384 unfilled strings.
  Scale **now**: 242 of 10032 (48 locales x 209 keys) remain outstanding, 185 with a known
  fix awaiting only a re-run, 57 undiagnosed (see the update section above).

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

## The only blocker was a valid raw Anthropic API key — an OPERATOR action (RESOLVED 2026-09-03, see the update section above)

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

## 2026-09-03 update (quick 260903-ly4) -- the 57 remaining fills diagnosed and unblocked, live re-run still owed

Landed 2026-09-03: the `260903-itr` machine fill batch committed `5bc76a74c`
(`i18n(locales): machine-fill 185 fork strings across 47 locales`), moving coverage
from **9790/10032** to **9975/10032 filled, 242 -> 57 outstanding**, 40 of 48 locales
now at full 209/209.

The remaining **57** were diagnosed as the SAME root shape as the `Browser` defect
`260903-itr` fixed, just on the target side instead of the source side:
`containsTermVerbatim`'s trailing `(?![A-Za-z0-9_])` lookahead forbade a glossed term
from taking ANY suffix. English brands do not inflect, so the defect was invisible in
English. Every one of the 57 has an English source containing a glossary term --
zero have a glossary-term-free source. Per-locale evidence: Estonian misses 31 of its
33 Steam-bearing strings vs 2 of 176 others (94% vs 1%); Finnish 9 of 33 vs 5 of 176;
Hungarian 4 of 33 vs 0; Croatian 2 vs 0; Slovenian 1 vs 0; and Danish, Norwegian-Bokmål
and Swedish each miss the exact same single string, `webview.unavailable.body`, whose
English source opens with the genitive `GameLib's` -- three independent North Germanic
locales failing on one English possessive.

`260903-ly4` fixed the root cause by relaxing `containsTermVerbatim` to keep only the
leading `(?<![A-Za-z0-9_])` lookbehind, dropping the trailing lookahead --
`containsTermSourcePresence` (the source-side check) is untouched and stays strict on
both sides. The fix is hermetically proven: six new accept-case assertions (Estonian
`Steami`/`Steamis`/`Steamiga`, Finnish `Steamin`, Hungarian `Steamet`, Scandinavian
bare-s `GameLibs`) demonstrated RED against the unmodified validator, then GREEN after
the fix; two regression pins (a genuine localisation of the term, and a mid-word match)
stayed green throughout and the mid-word pin was mutation-proven capable of failing; a
scratchpad sweep over all 9,975 filled pairs in the committed catalogs confirmed
`patched <= baseline` with zero problem-free -> problem-bearing flips (both counts were
0, expected: the catalogs were filled under the OLD strict validator, so nothing
rejected by it was ever written to disk to appear in a sweep of committed content).

**What is still owed:** a live `pnpm machine-fill-gamelib` re-run, scoped to the
affected locales, to actually COLLECT the 57 fills the fix unblocks -- the fix only
stops future rejections, it does not retroactively fill anything already on disk.
This is an OPERATOR step: `260903-ly4` ran in an environment where
`ANTHROPIC_API_KEY` is a truthy but non-functional placeholder, so the live fill could
not be run or verified here. Whoever runs it should
`GAMELIB_MT_LOCALES=et,fi,hu,hr,sl,da,nb_NO,sv pnpm machine-fill-gamelib`, then COUNT
the outstanding keys afterwards rather than trusting exit 0 -- per the "Verification
discipline" note above, this script has silently rejected translations and still
exited 0 twice now.

This todo **stays `status: pending`** -- the fix is proven but not yet run at scale.

## CLOSURE RECORD -- 2026-09-03

**Closed on measurement, not on a green tick.** Every non-English locale directory under
`public/locales/` now carries a `gamelib.json`, and every translatable English key has a
value in every one of them.

| measure | when filed (2026-09-02) | at closure (2026-09-03) |
|---|---|---|
| locale dirs with a `gamelib.json` | 3 of 49 (`en`, `de`, `fr`) | **49 of 49** |
| filled strings | 0 of 10032 | **10032** |
| outstanding | 10032, then 242 | **0** |
| locales at FULL coverage | 1 | **48 of 48** |
| interpolation-placeholder mismatches | -- | **0** |

Counted by flattening `en/gamelib.json` and every `<locale>/gamelib.json` and comparing
key-by-key, because this script has twice reported success while writing nothing. Exit code
was not accepted as evidence at any point.

### The blocker was never only the API key

The record as filed named a missing Anthropic API key as the operator-side blocker. That was
true but incomplete. **Two defects in `meta/machineFillGamelib.ts`'s glossary validator
silently rejected correct translations while the run exited 0.** Both are the same root
shape: *a validator encoding ENGLISH morphology and applying it to languages that do not
share it.*

1. **Quick `260903-itr`** -- `containsTermSourcePresence` was case-**IN**sensitive while
   `containsTermVerbatim` was case-**sensitive**. Any English source containing the ordinary
   word "browser" therefore triggered the rule and then demanded the literal capitalised
   `Browser` survive into the translation, which no genuine translation can do. **Cost: 185
   strings across 46 languages.** German passed only because "Browser" is also the
   capitalised German noun -- which is precisely why a single-locale spot check cleared a
   46-locale defect.
2. **Quick `260903-ly4`** -- the trailing `(?![A-Za-z0-9_])` lookahead on the **target-side**
   matcher forbade a glossed brand from taking any suffix. Invisible in English, where brands
   do not inflect; fatal in inflecting languages. **Cost: the last 57 strings across 8
   locales.**

### Three passes, each delta matching its prediction exactly

| pass | filled | outstanding |
|---|---|---|
| after `260903-itr` fill | 9790 | 242 |
| after the `Browser` fix | 9975 (**+185**) | 57 |
| after the lookahead fix | 10032 (**+57**) | **0** |

The final pass filled `et` 33, `fi` 14, `hu` 4, `hr` 2, `sl` 1, `da` 1, `nb_NO` 1, `sv` 1 --
**0 skipped**.

**The diagnosis is legible in the delivered translations.** Every form below would have been
rejected by the old trailing boundary:

```
et            Steami  Steamis  Steamist         GameLib'i
fi            Steamin Steamiin Steamille        GameLibin
              Steamissa
hu            Steamen
da nb_NO sv                                     GameLibs
```

The three North Germanic locales independently produced the bare `-s` genitive on the one
English source carrying "GameLib's" -- three unrelated languages converging on one string is
what pointed at the lookahead before the fix was written, and the delivered text confirms it
from the other direction.

**Integrity across all three batches:** D-09 held throughout (0 non-empty values overwritten,
0 emptied); 0 interpolation-placeholder mismatches across all 10032 filled strings; prettier
clean; `lint-translations:gamelib` exit 0; 263 meta tests green.

**Commits:** `5bc76a74c` (+185, 94 files) - `7be3bfaa9` / `787f8354d` / `00ecab7be` (the
`260903-ly4` fix) - `5ecdf2768` (its records) - `f492b11c0` (+57, 16 files).

## What this closure does NOT cover

Three residues survive this todo. None is closed by it, and none should be read as closed
because coverage is now complete.

**(a) Six keys are empty in ENGLISH.** `public/locales/en/gamelib.json` has **215** total keys
of which only **209 are translatable**; the other six -- `redeemKey.alreadyOwned`, `.error`,
`.invalid`, `.rateLimited`, `.successNoPackage`, `.successWithPackage` -- are empty strings in
the source language. This is a pre-existing English **authoring** gap, not a translation gap;
the machine-fill correctly never touched them. Both this todo and the `2026-08-28` de/fr todo
documented it, and **both are now closed, so as of 2026-09-03 this residue has NO owner.**
That is stated rather than papered over: whoever next touches `redeemKey.*` should file it.

**(b) Every non-English value is unreviewed machine translation.** Each is marked MT-origin in
its locale's `gamelib.mt.json` sidecar. The Weblate human-review path was deliberately
deferred by the 2026-08-06 decision todo and **remains deferred** -- full coverage is not the
same as reviewed coverage.

**(c) `meta/lintTranslations.ts` is still structurally blind to an ABSENT key.** It checks a
translated file's *own* keys against English, so a key missing entirely from a translation is
invisible and the gate stays green at zero coverage. That blindness is why this gap grew from
5 keys to 80 unobserved. **Closing the coverage gap does not fix the gate** -- the next fork
string added will be just as invisible. This diagnosis has no owning todo after this closure
either.

## One observation, not a fix

`pnpm lint-translations:gamelib` prints ENOENT stack traces for
`public/locales/sl/translation.json` and `public/locales/uz/login.json` and **still exits 0**.
Both files are absent at `HEAD` as well, so this is pre-existing and unrelated to
`gamelib.json` -- but a gate that dumps error objects and reports success is a fail-open
shape worth a look on its own terms. Recorded here so the observation is not lost with this
file.
