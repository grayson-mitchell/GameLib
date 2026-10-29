---
phase: quick-261029-nmt
plan: 01
status: complete
commits: [2b67b952d, f118e0c81, a36f7329a]
completed: 2026-10-29
---

# Quick 261029-nmt: Fix the 5 red jest suites on main

Five gates left red by quicks ji2, mkz and n4v are green again. No gate was weakened.

## Commits
- 2b67b952d: steam.adoptRestart.{busy,gameRunning,quitTimeout} translated into 48 non-en gamelib catalogs (lintTranslations).
- f118e0c81: runnerSliceRegistration pins bumped (70/2 handle/listen, enrichment 17, total 69), and 8 deadcode findings resolved at source. 7 had `export` dropped; `steamPendingAdoptionStore` got `ts-prune-ignore-next` plus a WHY comment.
- a36f7329a: 4 audited-clean fork files added to i18nForkTouchedFiles (287) and i18nGateScope (235); genI18nGateScope pins 231/283 to 235/287; facetLabels exempted pin 14 to 16, each with a provenance comment.

## Verification
- Targeted suite: 224 suites passed, 7112 tests passed, 2 skipped, 0 failed.
- Full `pnpm test`: 661 suites passed, 15284 tests passed, 4 skipped, 0 failed.
- `pnpm codecheck` exit 0. `pnpm planning-gates` exit 0.
- `node meta/findDeadcode.cjs`: unreachable 46 OK, used-in-module 0 OK. No deadcode baseline diff.
- tsc clean. Prettier clean on all touched non-ignored paths (locale catalogs are prettier-ignored, so omitted).

## Deviations
- Rule 3: the first locale script run matched nested `"steam": {` as well (substring); fixed by anchoring on a leading newline before any file was written. Stage list then passed as a zsh array after a quoting slip, with no effect on the committed content.
- The first `graphify update .` reported exit 1 while running inside the larger command; a rerun succeeded.
- Translations were written by the executor, not native-reviewed.
- Gen script wrote only the +4 fork-touched entries and generatedAt; no drift.

## Known Stubs
None.
