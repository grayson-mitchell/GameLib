---
created: 2026-09-01T00:00:00.000Z
title: "Every non-English catalog is unrebranded — 2274 \"Heroic\" strings across 89 files, zero \"GameLib\""
area: i18n
status: "RESOLVED 2026-09-09 by quick 260909-rvx. 1677 strings / 1817 occurrences rebranded across 87 catalog files, plus a re-runnable meta/ script and a mutation-proven CI gate so the next upstream refresh cannot silently undo it."
severity: medium
platform: any
ready: human
resolves_phase: ""
found_by: "Quick task 260901-ncb (the upstream i18n catalog pull)"
files:
  - public/locales/
---

## Symptom

GameLib's English UI is rebranded. **No other language is.** Measured 2026-09-01 at commit
`5973d4448`, over every catalog under `public/locales/` except `en/` and the fork-owned
`gamelib*.json`:

| | "Heroic" | "GameLib" |
|---|---|---|
| non-English catalogs (89 files) | **2274** | **0** |
| `en/translation.json` | 2 | 58 |
| `en/gamepage.json` | 0 | 15 |
| `en/login.json` | 0 | 0 |

Any user running GameLib in one of the 46 shipped non-English locales sees the product
called Heroic throughout — in dialogs, settings copy, error messages and notifications.

Note the residual `Heroic` ×2 in `en/translation.json` as well; those are probably worth a
look while here, though they may be deliberate (e.g. naming upstream in an attribution or
changelog string).

## Why it looks the way it does

This is **not** a regression from the 2026-09-01 upstream catalog pull (quick task
`260901-ncb`). The gap is inherited from fork base `b5b5cad3f`: the fork rebranded `en/`
and never touched the translations. The pull took non-English content wholesale from
upstream `c39d40174`, which naturally still says Heroic, so it raised the count in the
files it touched from 2096 to 2117 (+21) — it did not create the problem.

It also means the gap will **keep reappearing**: every future upstream catalog refresh
re-imports upstream branding. Whatever fixes this has to be re-runnable, not a one-shot
find-and-replace.

## Complication: a plain `Heroic` → `GameLib` sweep is wrong

Some of those 2274 occurrences are genuinely about upstream Heroic — attribution, config
paths, migration copy referencing an existing Heroic install, upstream URLs. Substituting
blindly would produce false claims in 46 languages at once. The occurrences need
partitioning into "product self-reference" (rename) and "refers to upstream Heroic"
(keep), and the partition is most reliably derived from the **English** key, not from each
translation's text.

Sketch of a defensible approach:

1. In `en/`, classify each key whose value contains a product self-reference. `en/` already
   holds the answer: a key that reads "GameLib" in English is a self-reference, and one
   that still reads "Heroic" in English is deliberate. That gives a **key allowlist**
   derived from data the fork already curated, rather than from a guess.
2. Apply the rename only to those keys' values in each non-English catalog.
3. Make it a `meta/` script so the next upstream refresh can re-run it, and add a lint that
   fails when a self-reference key's translation contains "Heroic".

Grammatical caveat: several languages inflect the product name (genitive/locative endings,
e.g. `Heroic-a`, `Heroicu`, `Heroicem`). A pure token swap will leave those malformed. The
same glossary-aware machine fill used for `gamelib.json` is the natural tool here — see
[[2026-08-28-gamelib-json-de-fr-missing-five-keys-machine-fill-401s]], which also records
that `pnpm machine-fill-gamelib` currently 401s because `ANTHROPIC_API_KEY` holds a token
that is not a raw API key.

## Interaction with the fork's namespace split

D-06 keeps fork content in `gamelib.json` and upstream content in
`translation.json`/`gamepage.json`/`login.json`, and `meta/i18nCatalogChurnGuard.ts`
forbids `pnpm i18n` from writing any upstream-owned catalog. **Rebranding by hand-editing
upstream-owned non-English catalogs does not trip that guard** — the guard only inspects
what the *parser* changed, via `git diff --name-only` (unstaged only). But it does mean
those files stop being byte-identical to upstream, which is what has made every refresh so
far a clean wholesale copy. Decide deliberately whether to accept that cost, and if so,
record it, because the next refresh will then need a real merge instead of a copy.

## Related

- [[pull-upstream-i18n-catalog-refreshes]] — the pull that measured this (completed).
- [[2026-09-01-pnpm-i18n-reports-78-uncommitted-en-keys-4-of-them-test-sentinels]] — the
  `en/`-side i18n debt, independent of this.
- [[2026-09-02-46-locales-have-zero-gamelib-json-fork-string-coverage]] — a different
  defect: FORK strings absent entirely from `gamelib.json`, not upstream strings carrying
  the wrong product name.

## RESOLVED 2026-09-09 (quick `260909-rvx`)

**1677 strings / 1817 occurrences across 87 catalog files**, 46 non-English locales, all three
upstream namespaces. Shipped with the two things this todo asked for beyond the edit itself:
`meta/rebrandUpstreamCatalogs.ts` (`pnpm rebrand-catalogs [--apply]`) and a live-tree gate in
`meta/__tests__/rebrandUpstreamCatalogs.test.ts`.

### Two of this todo's own premises were wrong — corrected here

1. **"A plain sweep is wrong because some occurrences genuinely refer to upstream Heroic."**
   Measured at HEAD: **zero** keys have an English value containing "Heroic". The two hits in
   `en/translation.json` this todo flagged are **KEY NAMES** (`resetHeroic`) whose value
   already reads "Reset GameLib". The feared class of false claims does not exist.
2. **The proposed rule ("a key that reads GameLib in English is a self-reference") has a
   blind spot** — 17 keys where English names no product at all but translators injected
   one. `tray.about` is "About" in English and "Über Heroic" in German. The rule shipped is
   strictly wider and simpler: **renameable iff the key exists in `en/` and its English value
   contains no "Heroic"**.

Headline counts here (2117 / 2274) were already stale; do not quote them.

### Every remaining occurrence is reconciled

Non-English "Heroic": **2061 -> 336**, all accounted for:
- **244** — values of 12 keys absent from `en/` with no `src` reference; they never render.
- **92** — KEY NAMES that must match `en/` or the key contract with source breaks.

### The grammatical caveat this todo raised, answered

Five locales needed inflection overrides (`ca`/`fr` article elision, `et` oblique stem,
`hu` vowel harmony, `sv` compounds). Six that look risky (`fi`, `cs`, `hr`, `bs`, `da`,
`nb_NO`) are correct under a plain swap; the suite pins their *absence* of a rule.

**Unverified by a native speaker:** the Hungarian back->front harmony flip (15 occurrences)
rests on linguistic reasoning, not a speaker's judgement. Recorded in the task SUMMARY as the
weakest link. No live locale read was done for this batch.

### The namespace-split cost, decided

Accepted deliberately: these upstream-owned catalogs are no longer byte-identical to
upstream, so the next refresh needs a real merge rather than a wholesale copy. The gate makes
that survivable — it fails loudly if a refresh reintroduces upstream branding, which is
exactly the reappearance this todo predicted.

**Residual (optional):** the 12 dead keys are still present. Deleting them is inert cleanup,
deliberately left rather than widening scope.
