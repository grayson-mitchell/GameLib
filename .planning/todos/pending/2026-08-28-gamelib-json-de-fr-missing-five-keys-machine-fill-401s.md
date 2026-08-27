---
created: 2026-08-28T00:10:00.000Z
title: "de/fr gamelib.json are missing 5 translatable keys and `pnpm machine-fill-gamelib` 401s — the lint gate is structurally blind to this"
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
---

`public/locales/en/gamelib.json` has **135** keys; `de` and `fr` have **124** each.
Eleven keys are absent from both, of which **five are translatable**:

| Key | English |
|---|---|
| `library.filterPanel.emptyAlphabetLetter` | `Starting with "{{letter}}"` |
| `library.filterPanel.emptyAlphabetNumber` | `Starting with a number` |
| `installFlows.pathRejectedTitle` | `Can't use that location` |
| `installFlows.pathRejectedBodyMove` | `GameLib couldn't move this game there. …` |
| `installFlows.pathRejectedBodyImport` | `GameLib couldn't import from that location. …` |

The remaining six (`redeemKey.alreadyOwned`, `.error`, `.invalid`, `.rateLimited`,
`.successNoPackage`, `.successWithPackage`) are **empty strings in English too** — a
separate, pre-existing authoring gap, not a translation gap.

The first two were added by quick task `260827-vpl` (WR-10's zero-state sentence,
commit `b04601b8a`). The three `installFlows.*` keys predate it and belong to the
path-rejection work — this todo covers both because the cause and the fix are identical.

**Why CI cannot see it.** `meta/lintTranslations.ts` (backing `pnpm
lint-translations:gamelib`) checks a translated file's *own* keys against English. A key
that is **absent** from a translation is structurally invisible to it, so the gate stays
green at zero coverage for the missing key and the plan's own "run machine-fill if the
gate complains" trigger never fires. Worth fixing the gate too: a presence check against
`en/gamelib.json` would have caught all five the day each landed.

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

**How to apply:** export a real Anthropic API key and re-run
`GAMELIB_MT_LOCALES=de,fr pnpm machine-fill-gamelib`. Then verify the fill actually
happened — count the keys, do not trust exit 0; a batch translation job on this project has
previously returned zero results and still exited cleanly. Do **not** hand-translate these
two in isolation: `emptyAlphabetLetter` is substituted into `emptyBody`
(`No games match {{filters}}.`) as a list member, so the descriptor's grammatical form has
to work inside that sentence in each target language — which is exactly the judgement the
glossary-aware fill exists to make.

**Not a blocker for Phase 34.11.** `34.11-REVIEW-FIX.md` is `all_fixed` on its own terms;
this is a done-criterion of the quick task that closed it, not one of the ledger's findings.
