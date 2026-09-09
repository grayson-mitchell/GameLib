---
id: 260909-rvx
title: Rebrand remaining Heroic self-references in the upstream-owned non-English catalogs
date: 2026-09-09
status: complete
area: i18n
---

## What changed

**1677 strings / 1817 occurrences across 87 catalog files**, in `translation`, `gamepage`
and `login`, over 46 non-English locales. Plus a re-runnable script and a CI gate.

| artifact | role |
| --- | --- |
| `meta/rebrandUpstreamCatalogs.ts` | `pnpm rebrand-catalogs` (check, exit 1 on residue) / `--apply` |
| `meta/__tests__/rebrandUpstreamCatalogs.test.ts` | 30 tests: unit rules + live-tree anti-rot gate |

The gate is the durable half. The defect is an **input** regression, not a code one: every
upstream catalog refresh re-imports Weblate content that says "Heroic". Without the gate the
rebrand silently rots on the next pull — which is precisely how this todo came to exist.

## Two of todo 20's premises did not survive measurement

- **Its central complication is unfounded.** It warns a sweep would "produce false claims in
  46 languages" because some occurrences genuinely refer to upstream. Measured: **zero** keys
  have an English value containing "Heroic". The two "Heroic" hits in `en/translation.json`
  are KEY NAMES (`resetHeroic`); the value already reads "Reset GameLib".
- **Its proposed rule has a blind spot.** "English says GameLib → rename" misses 17 keys
  where English names no product but translators injected one (`tray.about`: "About" →
  "Über Heroic"). The rule shipped here — *English value contains no "Heroic"* — subsumes
  both shapes and needs no `src` grep.

## Every remaining occurrence is reconciled

Non-English "Heroic": **2061 → 336**, and all 336 are accounted for:

- **244** — values of 12 keys absent from `en/` with zero `src` references. They never
  render. Unclassifiable by the partition, so left alone rather than guessed at.
- **92** — KEY NAMES (`settings.advanced.resetHeroic` × 46 locales × 2). Identifiers that
  must match `en/`; renaming them would break the key contract with source.

Zero unexpected residue. The gate asserts this continuously.

## Safety checks that mattered

- **URLs:** the tree's only `github.com/Heroic-Games-Launcher` string is
  `box.error.ubisoft-connect.message`, absent from `en/` and therefore excluded by
  construction. Scan confirmed **0** capital-H occurrences inside any URL, URI scheme or
  `{{placeholder}}` in the rename set.
- **Case sensitivity is load-bearing:** it preserves the `heroic://` deep-link scheme (18
  occurrences) and `{{heroicVersion}}` (35). Pinned by test.
- **Inflection:** five locales needed overrides (`ca`/`fr` elision, `et` stem, `hu` harmony,
  `sv` compounds). Six that look risky (`fi`, `cs`, `hr`, `bs`, `da`, `nb_NO`) are correct
  under a plain swap; the suite pins their *absence* of a rule so it cannot silently grow.

## Verification

- New gate: **30/30**. Full `Meta` project: **39 suites / 1071 tests** green (was 38/1041).
- **Mutation-proven:** injecting "Über Heroic" into `de tray.about` fails both the jest
  live-tree assertion and the CLI, naming the exact offender; both green on revert.
- `tsc --noEmit` clean; eslint **0 errors**; prettier clean; all 90 catalogs parse.
- `en/` untouched: 0 files changed. Diff is 1677/1677 — pure replacements, no reflow.

## Evidence boundary — read this before trusting the copy

**No locale was read on screen for this batch.** The previous task (`260909-r4h`) live-gated
German and Korean and proved the in-place catalog edit mechanism renders correctly, but that
was 121 strings; this is 1677.

**The Hungarian vowel-harmony flip is the weakest link.** `Heroicot → GameLibet`,
`Heroicban → GameLibben`, `Heroichoz → GameLibhez` (15 occurrences) rest on the linguistic
rule that an `-i` final stem takes front suffixes. That is defensible reasoning, **not a
native speaker's judgement**, and it is the one change here that could read as wrong to a
Hungarian user. Estonian and Catalan are lower risk but the same class. If a speaker of any
of the five override languages is ever available, those ~65 strings are the ones to show
them.

## Follow-up in the same task: the 12 dead keys were pruned

Operator asked for the deletion, so it shipped as a third commit. **214 (locale, key) entries
removed**, taking non-English "Heroic" from **336 → 92** — and all 92 survivors are KEY NAMES
(`settings.advanced.resetHeroic`), identifiers that must match `en/`. **Zero user-visible
stale product references remain in any language.**

- **The list is explicit, not derived.** The general rule "present in a translation but absent
  from `en/`" matches **171** keys; only 12 also carry the old name. Deriving it would have
  deleted 159 unrelated keys. The suite pins the list and re-verifies each entry is genuinely
  absent from English, so it cannot silently grow.
- **Liveness established three ways** before deleting: absent from `en/`, no literal `src`
  reference, and unreachable by any template-literal `t()` call. Only four dynamic key
  constructions exist in the codebase (`notify.${type}.paused|canceled|failed|finished`,
  `platforms.*`, `setting.experimental_features.*`) and none can build these. The 50 `src`
  hits for "zstd" are the decompression library, not the i18n key.
- **214 > the 202 pairs containing "Heroic"** because these keys also exist in a few locales
  whose translation never named the product. Dead by the same test, so they went too.

**This prune is NOT gated, and cannot be.** The keys still exist upstream, so a wholesale
catalog refresh reintroduces them. Re-run `pnpm rebrand-catalogs --prune-dead` after the next
refresh. The rebrand itself IS gated; only the deletion is manual.

## Not done

- No live locale read for this batch, and the Hungarian harmony flip remains unverified by a
  native speaker (see the evidence boundary above).
