---
created: 2026-08-06T02:19:51.519Z
title: "Phase 34.8 i18n context: fork namespace + LLM machine-fill, defer Weblate"
area: i18n
files:
  - public/locales/
  - i18next-parser.config.js
  - scripts/
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
