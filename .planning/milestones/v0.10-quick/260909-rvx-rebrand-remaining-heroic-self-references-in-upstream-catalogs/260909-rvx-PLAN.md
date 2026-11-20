---
id: 260909-rvx
title: Rebrand remaining Heroic self-references in the upstream-owned non-English catalogs
created: 2026-09-09
status: complete
area: i18n
resolves_todo: .planning/todos/pending/2026-09-01-non-english-catalogs-are-unrebranded-2117-heroic-strings.md
---

## Problem

The fork rebranded `public/locales/en/` and never touched the translations, so every
non-English catalog calls the product "Heroic". Worse, the gap is self-renewing: each
upstream i18n refresh copies Weblate content wholesale, so a one-shot find-and-replace
would rot on the next pull.

## What the measurement changed about the todo

Todo 20's headline (2117 / 2274) is stale, and two of its premises did not survive contact
with the data:

- **Its central complication is unfounded.** It warns that a sweep would "produce false
  claims in 46 languages" because some occurrences genuinely refer to upstream Heroic.
  Measured: **zero** keys have an English value containing "Heroic". The only two "Heroic"
  hits in `en/translation.json` are KEY NAMES (`resetHeroic`), whose value already reads
  "Reset GameLib".
- **Its proposed rule has a blind spot.** "English says GameLib → rename" misses 17 keys
  where English names no product but translators injected one — `tray.about` is "About" in
  English and "Über Heroic" in German.

## Approach

**Partition:** a key is renameable iff it exists in `en/` and its English value does NOT
contain "Heroic". One rule, covering both shapes, needing no `src` grep.

Both exclusions earn their place: an English value containing "Heroic" is a deliberate
upstream reference; a key absent from English is unclassifiable orphan residue. The latter
is what keeps the tree's only `github.com/Heroic-Games-Launcher` URL out of the rename set.

## Decisions

- **D-1 — partition derived from English, as above.**
- **D-2 — inflection overrides for five locales only.** `ca`/`fr` undo article elision,
  `et` shifts the oblique stem, `hu` flips vowel harmony, `sv` hyphenates compounds.
  `fi`/`cs`/`hr`/`bs`/`da`/`nb_NO` are correct under a plain swap and get no rule.
- **D-3 — the swap is case-sensitive.** This is the mechanism protecting the `heroic://`
  deep-link scheme and the `{{heroicVersion}}` interpolation name.
- **D-4 — dead keys left alone.** 12 keys absent from `en/` with no `src` reference, 244
  occurrences, never rendered.
- **D-5 — key names untouched.** 92 occurrences are identifiers that must match `en/`.

## Tasks

1. `meta/rebrandUpstreamCatalogs.ts` — re-runnable check/apply implementing the partition.
2. `meta/__tests__/rebrandUpstreamCatalogs.test.ts` — unit rules + live-tree anti-rot gate.
3. Apply, and reconcile every remaining occurrence to a named exclusion.

## Verification

- Residue in the rename set is zero, by the gate's own live-tree assertion.
- Every remaining "Heroic" reconciles: 244 dead-key values + 92 key names = 336.
- Gate mutation-proven: inject and confirm it fails, revert and confirm it passes.
- Safety scan: zero capital-H inside any placeholder, URI scheme or URL in the rename set.
