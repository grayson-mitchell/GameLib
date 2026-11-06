---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 17
subsystem: i18n
tags: [catalogue, gap-closure]
provides:
  - "steam.engine.override.storedUnavailable, selectionRejected, sharedBottle, status.verifying/extracting/settingUp in gamelib.json"
affects: [59-18, 59-20, 59-22]
key-files:
  modified:
    - public/locales/en/gamelib.json
requirements-completed: [D-05, D-06, D-14]
completed: 2026-11-02
---

# Phase 59 Plan 17: Gap-closure catalogue strings Summary

Added the six new `steam.engine` strings (stored-unavailable override label, selection-rejected and shared-bottle dialogs, verifying/extracting/setting-up status labels) to gamelib.json in one place, with the exact English text from the plan, keys kept alphabetical.

## Deviations from Plan
None. Only gamelib.json was changed; gamepage.json and translation.json untouched by this plan.

## Verification notes
- Node key check prints ok; JSON parses.
- `pnpm lint-translations:gamelib` fails on pre-existing un-localised `da.gamelib.reportProblem.*` keys (not from this plan).
- `pnpm i18n-churn-guard` fails because of the pre-existing uncommitted edits to translation.json in the working tree (not from this plan); left untouched.
- New keys are not yet used by t() calls; those land in 59-18..59-22.

## Known Stubs
None.

## Self-Check: PASSED
