---
id: 260909-r4h
title: Rebrand stale "Heroic" self-references in translated tour steps and the version label
date: 2026-09-09
status: complete
area: i18n
---

## What changed

**121 strings across 39 locale catalogs.** No source files changed; no English catalog changed.

| key | locales | surface |
| --- | --- | --- |
| `tour.sidebar.settings` | 28 | nav tour step 4 |
| `tour.sidebar.docs` | 27 | nav tour step 9 |
| `tour.sidebar.community` | 28 | nav tour step 10 |
| `info.heroic.version` | 38 | Settings panel version label |

## Measured before / after

- Non-English "Heroic" in `translation.json`: **1967 → 1846**, exactly −121.
- Live keys still containing "Heroic": **none**.
- Discord promises in `tour.sidebar.community`: **28 → 0**.
- `public/locales/en/` files changed: **0**.
- Diff shape: 121 insertions / 121 deletions — pure line replacements, no reflow.

## Decisions

- **D-1 — Renamed in place instead of minting `tour.nav.*` keys.** The todo's prescribed fix
  is blocked at HEAD: the presence baseline is at `totalPairs: 0`, so 12 new keys × 48 locales
  = 576 unrecorded pairs would turn R13 red, and `pnpm machine-fill-gamelib` still 401s.
  Minting would also have downgraded 48 locales from translated-but-stale to English-only.
- **D-2 — Editing upstream-owned catalogs is CI-safe once staged.** Proven both ways, not
  assumed: the churn-guard suite was **RED unstaged** (39 paths in the upstream bucket) and
  **GREEN staged**. Its `live tree` test runs `git diff --name-only -- public/locales`, which
  is unstaged-only. Accepted cost: these files are no longer byte-identical to upstream, so
  the next catalog refresh needs a merge, not a wholesale copy.
- **D-3 — `tour.sidebar.version` left stale deliberately.** It has no `src/` reference, so it
  is dead; editing it would be churn on an upstream-owned file with no user-visible effect.
- **D-4 — `community` realigned to the English source**, dropping the Discord clause. The
  anchored row is now "Donate" → Ko-fi, so the Discord promise was false in all 28 languages.
  Each language's own existing verb phrase was reused; only the false clause was removed.
- **D-5 — Inflection hand-corrected, not token-swapped.** A naive `Heroic`→`GameLib` swap was
  wrong in four locales: `ca` `de l'Heroic` → `del GameLib` (elision dies before a consonant),
  `fr` `d'Heroic` → `de GameLib`, `et` `Heroicu` → `GameLibi` (genitive), `sv` `Heroicversion`
  → `GameLib-version`. Correct by construction elsewhere: `pl` `GameLiba`, `tr` `GameLib'in`,
  `nl` `GameLib's`, `da/de/nb_NO/sv` `GameLibs`, `lt` `„GameLib“`, `ja/zh` particle-attached.

## Verification

- Churn guard: 9/9 green (staged). Negative control recorded above.
- `NavShellTour`, `HeroicVersion`, `destinationCoverage`, `lintTranslations`,
  `gamelibCatalogParity`: **5 suites / 248 tests green**.
- `prettier --check` on all locale catalogs: clean.
- All 47 catalogs still parse; writer round-trip verified byte-identical before editing.

**The suites are not evidence of this fix.** They mock `t()` to echo English defaults, so they
are green either way — which is how 28 locales went stale under four green gates in the first
place. The evidence is the structural before/after measurement.

## Not done

- **The live gate.** The todo requires switching app language and reading tour steps 4, 9 and
  10 in an affected locale plus an unaffected one. Not run. The todo therefore stays in
  `pending/`, narrowed to that gate.
- **Todo 20** (`2026-09-01-non-english-catalogs-are-unrebranded`) remains open: 1846 "Heroic"
  occurrences across the catalogs. The 2026-09-05 staleness audit found these two todos
  overlap and said whoever takes either should take both. This task deliberately took only
  the two surfaces the nav-tour todo reports; todo 20 is `ready: human` and still needs its
  partition design and a re-runnable `meta/` script so the next upstream refresh cannot undo it.
