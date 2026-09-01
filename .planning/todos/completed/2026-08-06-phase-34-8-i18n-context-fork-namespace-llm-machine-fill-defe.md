---
created: 2026-08-06T02:19:51.519Z
title: "Phase 34.8 i18n context: fork namespace + LLM machine-fill, defer Weblate"
area: i18n
files:
  - public/locales/
  - i18next-parser.config.js
  - scripts/
status: CLOSED
closed: 2026-09-02
closed_by: "quick task 260902-9wt"
amended: 2026-09-02
amended_by: "quick task 260902-ad5"
---

## Problem

Phase 34.8 (frontend i18n compliance for fork-added code) needs a decided approach for how fork-added strings get keyed, how the ~50 non-English locales get filled, and how translations are maintained — before planning starts. The phase directory is empty (`.gitkeep` only). Heroic's setup is inherited: i18next with three namespaces (`translation`, `gamepage`, `login`) in `public/locales/`, and `i18next-parser` (`pnpm i18n`) extracting keys from `src/**/*.{ts,tsx}` into the English catalogs. Heroic maintains its translations via hosted.weblate.org, which pushes into `public/locales/<locale>/translation.json` upstream — so any fork-added keys placed in those same files will conflict on every upstream sync across ~50 files × 3 namespaces.

## Solution

Adopt the **hybrid approach** (decided 2026-08-06):

1. **Fork-owned namespace.** All fork-added strings go in `public/locales/<locale>/gamelib.json` (usage: `t('gamelib:steam.installQueued')`). Upstream Heroic catalogs stay byte-identical and merge cleanly; tooling only ever touches files the fork owns. Matches the phase scope boundary — upstream strings are out of scope for 34.8.

2. **LLM-based machine-fill script** in `scripts/`, glossary-aware, run after `pnpm i18n`:
   - Diffs each locale's `gamelib.json` against English; translates only missing keys.
   - **Never overwrites a non-empty value** — this is what lets human corrections survive re-runs.
   - English is the only source of truth; missing keys are not broken UI (`fallbackLng: 'en'`), so machine-fill is polish, not the compliance gate. The compliance bar is "no hardcoded strings" — enforceable via the parser (fork keys must exist in `en/gamelib.json`).
   - Must preserve `{{interpolation}}` and `_one`/`_other` plural suffixes; pass the key path as context.
   - Keep it as a repeatable `pnpm` task for future string additions.
   - Volume is trivial (a few hundred keys × 50 locales) — an LLM covers all Heroic locales; DeepL does not (~35 langs), raw Google Translate mangles brand terms.

3. **Mark machine-filled strings** (sidecar manifest of MT-origin keys, or a commit-message convention) so they can later be imported into Weblate flagged "needs editing" rather than as approved human translations.

4. **Defer Weblate until real demand.** Do NOT stand up a GameLib project on Hosted Weblate as part of 34.8 — a young fork has no translator community and it would be an empty dashboard. Nothing in the script approach blocks adopting Weblate later: the file format is exactly what Weblate consumes, and hosted.weblate.org's Libre plan (free, needs approval + OSI license) plus its automatic-translation add-on remain available when a contributor community materializes.

5. **Glossary is non-negotiable.** Pin brand/platform terms as do-not-translate: Steam, Epic, GOG, Proton, CrossOver, Steam Deck. Reuse the upstream catalogs already in the repo as a free 50-language translation memory for shared vocabulary ("Library", "Install", …) so fork strings match Heroic's established per-locale terminology.

## CLOSURE RECORD — 2026-09-02, quick task 260902-9wt

**Why this closes as a decision item.** This todo's own `## Problem` states the approach was
needed "before planning starts." Planning happened: `.planning/phases/34.8-frontend-i18n-compliance-for-fork-added-code-retrofit-hardco/`
holds twelve plans (`34.8-01`..`34.8-12`, including the `08a`/`08b`/`08c` split, each carrying
its own `-CLOSURE.md`), plus `-AUDIT.md`, `-CONTEXT.md`, `-I18N-CONTRACT.md`, `-PATTERNS.md`,
`-RESEARCH.md`, `-RUNTIME-CHECK.md` and `-DISCUSSION-LOG.md`. `34.8-VALIDATION.md`'s frontmatter
reads `status: approved`, `nyquist_compliant: true`. The decision question this todo asked is
settled; it has no further work to gate.

**Each of the five decisions, against a built artifact:**

1. **Fork-owned namespace** — `public/locales/en/gamelib.json` exists and holds 210 keys.
   Supporting tooling: `package.json:55` `lint-translations:gamelib`, `package.json:56`
   `i18n-churn-guard`, `package.json:59` `gen-i18n-gate-scope`, plus
   `meta/i18nGateScope.json`, `meta/i18nForkTouchedFiles.json`, `meta/i18nGateAllowlist.json`
   and `meta/i18nCatalogChurnGuard.ts`.
2. **LLM machine-fill script** — `meta/machineFillGamelib.ts`, invoked by `package.json:57`
   `machine-fill-gamelib`, with hermetic tests at `meta/__tests__/machineFillGamelib.test.ts`.
   It landed under `meta/`, not `scripts/` as the original Solution text named — a location
   detail, not a decision change.
3. **Mark machine-filled strings** — this landed as the first of the Solution's two named
   options, a SIDECAR MANIFEST, rather than a commit-message convention:
   `machineFillGamelib.ts:781` writes `public/locales/<locale>/gamelib.mt.json`, and both
   `public/locales/de/gamelib.mt.json` and `public/locales/fr/gamelib.mt.json` exist on disk.
   `machineFillGamelib.ts:358-366` documents that `filledAt` records when a key was FILLED,
   not when the script last ran — a re-run that fills nothing must carry the prior timestamp
   forward — precisely so a later Weblate import reads accurate provenance. Decision 3's
   stated PURPOSE (importable into Weblate flagged "needs editing") is honoured, not merely
   its mechanism.
4. **Defer Weblate** — honoured. No Weblate project has been stood up for GameLib.
5. **Glossary is non-negotiable** — `meta/i18nGlossary.json` exists, backed by
   `meta/__tests__/i18nGlossary.test.ts`.

**The closure is not total: what remains is COVERAGE, not a decision.** The approach was
decided and built; it was simply never RUN beyond `de` and `fr`. Measured 2026-09-02:
`en/gamelib.json` holds 210 keys, of which 204 are translatable (the other 6 are the
`redeemKey.*` authoring gap this todo's successor already documents correctly); `de/gamelib.json`
and `fr/gamelib.json` hold 124 keys each, so 80 translatable keys are absent from each; and of
the 49 directories under `public/locales/`, only `en`, `de` and `fr` carry a `gamelib.json` at
all, leaving 46 locales at ZERO fork-string coverage. Decision 2's own words were "an LLM covers
all Heroic locales," sized at "a few hundred keys x 50 locales" — that clause was never executed
beyond the two locales above. The residue is handed to
`.planning/todos/pending/2026-08-28-gamelib-json-de-fr-missing-five-keys-machine-fill-401s.md`,
which this same quick task widens from its original 2-locale/5-key scope to the 46-locale/80-key
item it actually is, and which STAYS PENDING.

**Carve-outs — what this closure must NOT be read as:**
- Not "fork strings are translated." They are not, in 48 of the 49 locales.
- Not an auto-close riding on Phase 34.8 having closed. It closes because each of the five
  decisions has a built artifact on disk, and because the unrun residue now has a named,
  still-open owner — not merely because the phase that decided the approach is done.
- The one thing still blocking the residue is a valid raw Anthropic API key — an OPERATOR
  action, not an engineering one. The script, its tests, the glossary and the sidecar-manifest
  mechanism are all built and tested already.

## Later addition — 2026-09-02, quick task 260902-ad5

This is a later addition to a closed record, NOT a correction of it — the CLOSURE RECORD
above was accurate on the day it was written and is unchanged. The residue it handed on has
since been SPLIT: the 46-locale half moved to
`.planning/todos/pending/2026-09-02-46-locales-have-zero-gamelib-json-fork-string-coverage.md`,
and the `2026-08-28` todo now owns the de/fr half only. The split was made at the operator's
request; `260902-9wt` was not wrong — it re-homed a residue that until then had no owner at
all. None of the five decisions above is reopened or re-adjudicated; this record stays
CLOSED.
