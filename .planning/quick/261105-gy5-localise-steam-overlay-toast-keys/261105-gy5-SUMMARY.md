---
phase: quick-261105-gy5
plan: 01
status: complete
subsystem: i18n
tags: [i18n, gamelib-catalog, steam-overlay]
requirements: [TODO-2026-11-05-localise-steam-overlay-toast-keys, "l10n standing req (51-04-02)"]
key-files:
  created:
    - .planning/quick/261105-gy5-localise-steam-overlay-toast-keys/261105-gy5-i18n-fill.json
    - .planning/todos/pending/2026-11-05-localise-remaining-steam-overlay-keys.md
  modified:
    - public/locales/*/gamelib.json (48 non-en)
    - public/locales/*/gamelib.mt.json (48)
    - meta/i18nCatalogPresenceBaseline.json
    - .planning/todos/completed/2026-11-05-localise-steam-overlay-toast-keys.md (moved from pending)
metrics:
  completed: 2026-11-05
  commit: 7796dd9c1
---

# Quick 261105-gy5: Steam overlay toast and step keys in 48 locales

Translated `steam.overlay.toast.title|body` plus the six `steam.overlay.step.*` sentences into all 48 non-en gamelib catalogs (8 keys x 48 = 384 pairs) through a hand-authored fill record, and shrank the presence baseline by exactly those pairs.

## Results

- `validateTranslation` (real, from `meta/machineFillGamelib.ts`): **384/384 pass**, no en-identical values.
- Sabotage controls, both rejected: de body without `{{step}}` (dropped-placeholder message); de title with Steam replaced by Dampf (glossary-term message).
- Baseline: totalPairs **6528 -> 6144**; `missing` equals HEAD 3376fd5af minus exactly the 8 keys. The 8 remaining `steam.overlay` keys (`exit.body|title`, six `override.*`) keep 48 locales each.
- Gates: `pnpm lint-translations:gamelib` exit 0 (6144 findings, 0 hard failures); four jest suites 267/267; `i18n-churn-guard` clean; planning-gates 11/12 with only the pre-existing STATE.md Plan-field gate failing (todo-frontmatter-gate PASS).
- Prettier `--file-info`: ignored for `public/locales/de/gamelib.json`, `gamelib.mt.json`, the new todo and the fill record (left out); `meta/i18nCatalogPresenceBaseline.json` not ignored and `prettier --check` passes.
- Staged and committed: 101 paths (96 locale files, baseline, fill record, both sides of the todo rename, new todo); no `src/` or unrelated paths. Commit `7796dd9c1`. mt `keys` orders preserved (existing entries asserted unchanged after inserting 8 sorted keys).
- Overlay catalog structure: each locale gained `steam.overlay.{step,toast}` (no `steam.overlay` existed before).

## Deviations from Plan

**1. [Scope amendment, orchestrator] Added the 6 `steam.overlay.step.*` keys**
- Reason: they fill `{{step}}` in the toast body; otherwise non-en users still saw an English sentence in it.
- Effect: 8 keys / 384 pairs instead of 2 / 96; baseline 6528 -> 6144 (not 6432); the follow-up todo covers only `exit` (2) and `override` (6) = 8 keys, 384 pairs, not 14 keys.
- Staged count stayed at 101.

**2. Thai values omit the trailing full stop** (Thai orthography has none; sentences are space-separated). All other locales end step and launch sentences with their native full stop.

**3. Plan premise correction (already noted in plan):** no non-en `steam.overlay.override.label` existed; the "overlay" term came from each locale's `translation.json` EOS/stats-overlay wording. `br` and `sl` have no `translation.json`, so their terms were hand-chosen (br uses the loanword "overlay"; sl "prekrivni sloj"). Lower confidence for br, ga, ka, ml, ta, th; worth a native-speaker pass.

## Known Stubs

None.

## Self-Check: PASSED

Fill record, new todo, completed todo and commit 7796dd9c1 all present.
