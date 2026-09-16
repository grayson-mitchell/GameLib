---
phase: 44-in-app-winetricks-browse-ui-replacing-the-search-only-panel
plan: 02
subsystem: i18n

tags: [i18next, gamelib.json, winetricks, locale-catalog]

# Dependency graph
requires:
  - phase: 44-01
    provides: verbs.ts and deriveRowState.ts (no file overlap with this plan)
provides:
  - "public/locales/en/gamelib.json winetricksBrowse block (13 keys), final and committed"
  - "Measured, exact red-gate baseline (624 findings) for plan 44-06's locale fill target"
affects: [44-03, 44-04, 44-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "New copy for a component lives under a single top-level {component}Browse key in gamelib.json, sibling to any pre-existing key of the same base name, never nested inside it"
    - "Reserved i18next interpolation name {{count}} avoided by using a differently-named placeholder ({{total}}) for a plain count string with no plural resolution needed"

key-files:
  created: []
  modified:
    - public/locales/en/gamelib.json

key-decisions:
  - "Added two keys (searchPlaceholder, resultsHeading) beyond D-09's 11, closing gaps the UI-SPEC's Copywriting Contract left uncovered — total is 13, not 11 (see plan's planner_correction)"
  - "resultsHeading uses {{total}}, not {{count}}, to avoid triggering i18next plural-form resolution across 49 locales"
  - "Left the gamelib lint gate RED on purpose (624 findings) — D-08 requires the 48-locale fill to happen in-phase (plan 44-06), not here"
  - "No edit to meta/i18nCatalogPresenceBaseline.json in this plan — it already pins the zero-drift target state (totalPairs: 0, missing: {}) that 44-06's completed fill should return to"

requirements-completed: [REQ-44-08, REQ-44-09, REQ-44-25]

duration: 25min
completed: 2026-09-16
---

# Phase 44 Plan 02: Winetricks Browse Copy Contract Summary

**Locked 13 new English `winetricksBrowse` keys in `gamelib.json` and measured the resulting locale-fill gate at exactly 624 findings, matching plan 44-06's target before any translation work begins.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-09-16T16:28:10Z
- **Tasks:** 2/2 completed
- **Files modified:** 1 (`public/locales/en/gamelib.json`)

## Accomplishments

- Added a single top-level `winetricksBrowse` object (13 keys) to `public/locales/en/gamelib.json`, alphabetically ordered to match the file's existing convention, placed as a sibling directly after the pre-existing `winetricks` key.
- Confirmed no `winetricksBrowse.category.*` keys exist (D-09) and no reserved `{{count}}` interpolation exists anywhere in the new block.
- Measured the exact red-gate finding count (624) that plan 44-06 must drive to zero, and reconciled it against the plan's own 624 prediction (13 keys × 48 non-English locales) — they match exactly.
- Confirmed `meta/i18nCatalogPresenceBaseline.json` needs no edit in this plan; its already-committed state (`totalPairs: 0`, `missing: {}`) is the correct end target for 44-06's completed fill.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the winetricksBrowse block (13 keys) to public/locales/en/gamelib.json** - `5fe16754d` (feat)
2. **Task 2: Measure and record the gamelib gate baseline** - no commit (measurement-only task; no files modified, per task's own `<files>` declaration and its acceptance criterion that `git status --porcelain meta/` and `public/locales/` stay clean of any new change)

**Plan metadata:** this SUMMARY's own commit (see below)

## Files Created/Modified

- `public/locales/en/gamelib.json` - added the `winetricksBrowse` top-level block, 13 keys, English values only. Diff confined to 15 inserted lines (13 key/value pairs plus the object's opening/closing braces), immediately following the pre-existing `winetricks` key.

## The 13 keys as written (verbatim)

| Key | Value |
|---|---|
| `curatedGroup` | `Commonly needed` |
| `searchPlaceholder` | `Search components…` |
| `resultsHeading` | `{{total}} results` |
| `cachedTag` | `Cached (installs offline)` |
| `installedTag` | `Installed` |
| `needsGuiTag` | `Needs the Winetricks GUI` |
| `installingRow` | `Installing…` |
| `installFailedTag` | `Install failed` |
| `retry` | `Retry` |
| `emptyHeading` | `No components available` |
| `emptyBody` | `Winetricks metadata could not be loaded for this bottle.` |
| `zeroResultHeading` | `No components match "{{query}}".` (curly quotes `“ ”` around the interpolation, as drawn in the UI-SPEC) |
| `clearSearch` | `Clear search` |

(In the committed file the keys are stored in alphabetical order — `cachedTag`, `clearSearch`, `curatedGroup`, `emptyBody`, `emptyHeading`, `installFailedTag`, `installedTag`, `installingRow`, `needsGuiTag`, `resultsHeading`, `retry`, `searchPlaceholder`, `zeroResultHeading` — matching the file's pre-existing top-level and nested-object ordering convention. The table above orders them as the plan listed them for readability; both orderings hold the same 13 key/value pairs.)

## Baseline measurement for plan 44-06 (Task 2)

**Locale directories carrying `gamelib.json`:** re-verified at 49 (`ls public/locales/*/gamelib.json | wc -l` → 49), i.e. 48 non-English locales.

**1. `pnpm lint-translations:gamelib` — exit code 1. Verbatim tail:**

```
zh_Hant.gamelib.winetricksBrowse.searchPlaceholder: a new key is not localised and was not recorded — fill it or regenerate the baseline
zh_Hant.gamelib.winetricksBrowse.zeroResultHeading: a new key is not localised and was not recorded — fill it or regenerate the baseline
lint-translations[gamelib]: 624 findings, 624 hard failures
 ELIFECYCLE  Command failed with exit code 1.
```

Every one of the 624 findings is the same shape: `{locale}.gamelib.winetricksBrowse.{key}: a new key is not localised and was not recorded — fill it or regenerate the baseline`, one per (locale, key) pair, for all 48 non-English locales × all 13 new keys.

**2. `npx jest --selectProjects Meta --passWithNoTests --silent gamelibCatalogParity` — PASSED.**

```
PASS Meta meta/__tests__/gamelibCatalogParity.test.ts
Test Suites: 1 passed, 1 total
Tests:       198 passed, 198 total
```

This gate did not move. It checks structural catalog parity (matching interpolation placeholders/tags between `en` and each locale for keys that exist in both), not presence of new keys — so an as-yet-unfilled new key in `en` alone does not trip it.

**3. `npx jest --selectProjects Meta --passWithNoTests --silent lintTranslations` — FAILED, 2 of 32 tests failed.**

The `lintTranslations.test.ts` suite's own live-tree assertions (REQ-41-01, REQ-41-02) now fail, both driven by the same 624-pair drift:
- `REQ-41-02: zero hard failures for gamelib namespace against committed tree` — `expect(received).toHaveLength(0)`, received length 624.
- The presence-baseline drift assertion — 624 pairs newly missing live that are not recorded in `meta/i18nCatalogPresenceBaseline.json`.

**4. `meta/i18nCatalogPresenceBaseline.json` — no edit needed in this plan.**

Current committed content: `{"namespace":"gamelib", ..., "totalPairs":0, "missing":{}}`. This file is a record of *known, accepted* missing (locale, key) pairs — the drift check (`comparePresenceBaseline`) fails when the live tree has a missing pair the baseline does not record (our case, now) *or* when the baseline records a pair that is no longer missing live. Because the baseline already states "0 known-missing pairs" (the fully-filled target state), the correct remediation is for plan 44-06 to fill all 624 pairs and return the live tree to zero drift against this already-committed baseline — not to widen the baseline to admit the 624 findings. **No baseline-file obligation is handed to 44-06 beyond filling the 624 pairs.** If 44-06 ever needs to leave any pair intentionally unfilled, regenerating via `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib` (never a hand-edit) would then be required and should be named explicitly at that time, not assumed here.

**Predicted vs. measured:** Predicted 624 (13 keys × 48 non-English locales). Measured 624 exactly, across both `pnpm lint-translations:gamelib` (624 findings, 624 hard failures) and the `lintTranslations.test.ts` live-tree assertion (received length 624). No discrepancy — the `t13` precedent's "48 findings per key" held exactly at this larger key count, and the 49-locale-directory recount confirms no locale was miscounted.

## Decisions Made

- Followed the plan's `planner_correction` exactly: 13 keys, not 11 — the two additional keys (`searchPlaceholder`, `resultsHeading`) close copy gaps the UI-SPEC's own Copywriting Contract left short, and are not a scope expansion (see plan lines 42-85 for the full rationale).
- Kept the gate RED deliberately per D-08/the plan's explicit instruction — did not add an allowlist entry, revert the addition, or widen `i18nCatalogPresenceBaseline.json` to force green.

## Deviations from Plan

None — plan executed exactly as written. Both tasks' acceptance criteria were met without needing any Rule 1-4 auto-fix.

## Issues Encountered

None.

## STATE.md / ROADMAP.md

Per this execution's explicit instructions (project-specific hard ban on `gsd-sdk state.*`/`roadmap.*` and a measured prior-session finding that those verbs silently truncate `STATE.md` fields), **this plan does not touch `.planning/STATE.md` or `.planning/ROADMAP.md`.** Both remain byte-identical to their state at the start of this execution. The orchestrator owns those writes after the wave completes.

## Next Phase Readiness

- Plans 44-03/44-04 can now render against the final, committed English `winetricksBrowse` strings — no further English-copy churn expected from this plan.
- Plan 44-06 has an exact, measured target: fill 624 (locale, key) pairs across 48 non-English locales to drive `pnpm lint-translations:gamelib` and `lintTranslations.test.ts` green, with no `meta/i18nCatalogPresenceBaseline.json` edit anticipated as part of that work.

---
*Phase: 44-in-app-winetricks-browse-ui-replacing-the-search-only-panel*
*Completed: 2026-09-16*
