---
created: 2026-09-01T00:00:00.000Z
title: "Every non-English catalog is unrebranded — 2274 \"Heroic\" strings across 89 files, zero \"GameLib\""
area: i18n
status: pending
severity: medium
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
