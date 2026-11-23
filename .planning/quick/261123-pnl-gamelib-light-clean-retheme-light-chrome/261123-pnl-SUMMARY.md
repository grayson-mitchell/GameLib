---
phase: quick-261123-pnl
plan: 01
subsystem: frontend-theming
tags: [theme, gamelib-light, css-tokens, contrast]
requires: []
provides:
  - "GameLib Light: light chrome, one #4c6f99 accent, green only as status text, neutral greys"
affects: [src/frontend/themes.scss, builtinTokens.generated.json]
key-files:
  modified:
    - src/frontend/themes.scss
    - src/frontend/customThemes/builtinTokens.generated.json
    - src/frontend/styles/_buttons.scss
    - src/frontend/screens/Library/components/LibrarySignInNotice/index.scss
    - src/frontend/customThemes/__tests__/nordLightPalette.test.ts
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
    - src/frontend/components/UI/NavShell/components/NavTabs/index.scss
    - src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss
    - src/frontend/customThemes/thumbnailPalette.ts
    - src/frontend/customThemes/__tests__/thumbnailPalette.test.ts
    - src/frontend/components/UI/ThemeSelector/__tests__/ThemeThumbnail.test.tsx
    - src/frontend/customThemes/__tests__/customTheme.test.ts
decisions:
  - "D-01..D-05 implemented as planned; no floor or threshold lowered"
metrics:
  tasks: 3
  completed: 2026-11-23
status: complete
actuals:
  tasks: 3
  commits: 3
plan_head_before: 909efb20d5d9f00f1d4124f54862d46e20c5ec50
---

# Phase quick-261123-pnl Plan 01: GameLib Light clean retheme Summary

GameLib Light is now a light-chrome theme with a single #4c6f99 accent (white labels, hover #3f5f86), green kept to status text only, and neutral greys for tertiary surfaces. Every other theme is byte-identical.

## Commits

| Task | Commit | Files |
| ---- | ------ | ----- |
| 1 | f968c55c1 | themes.scss, builtinTokens.generated.json, _buttons.scss, LibrarySignInNotice/index.scss, nordLightPalette.test.ts |
| 2 | 275149830 | themeTokens.test.ts, NavTabs/index.scss, FilterFocusRow/index.scss |
| 3 | ddb6e3db2 | thumbnailPalette.ts, thumbnailPalette.test.ts, ThemeThumbnail.test.tsx, customTheme.test.ts |

(Other sessions committed to main concurrently, so `git rev-list` from the plan base counts more than these three.)

## What changed

- **Task 1 (tracer):** the new "GameLib Light is a light-chrome, one-accent theme" describe was written first and failed 6 of 6 before any CSS edit. It replaces the verbatim sha256 pin. The `body.gamelib-light` block got the full palette table, a `.NavShell__navbar` seam (`border-bottom-color: var(--neutral-04)`), `.playIcon` / progress-bar `--success` re-scopes to the accent, and the re-paired nested rules. The gamelib-light hover override in `_buttons.scss` was removed (base label reads 5.71:1 on #3f5f86). The sign-in triangle now uses `var(--danger)` (3.36:1). Seed regenerated with `pnpm gen:theme-tokens`.
- **Task 2:** the live-verdict "fail" row is now measured from the frozen pre-change seed (`nordLightPreChange.json`, 2.11:1). The pure `.is-text` HOVER census names nord-light and nord-dark only (`toHaveLength(2)`). NavTabs and FilterFocusRow got comment-only truth fixes.
- **Task 3:** `gamelib-light` removed from `BASE_PREVIEW_OVERRIDES` and `BASE_OVERRIDDEN_TOKENS`; the thumbnail test asserts the generic-chain palette; ThemeThumbnail honours a copy's `--success-button`; D-09 asserts nested-only literals `#dde1e7` / `#d0ddff` and the true `#2e3440` coincidence set (`--brand-text-01, --navbar-accent, --navbar-active, --neutral-06, --status-default-hover`; matched the plan's expected set on the first run).

## Verification

- Whole Frontend jest project: 388 suites, 6794 tests, all pass.
- `pnpm gen:theme-tokens --check`: up to date. `pnpm codecheck`: clean.
- eslint and scoped `npx prettier --check` over all 12 written paths: clean.
- D-05 proof: themes.scss identical to 944510a9f outside the gamelib-light block; only the `gamelib-light` seed differs; `contrastFloors.ts` untouched; themeTokens floor-assertion count still >= 16; nordLightPalette floor lines above the 7 baseline.
- The expected-red ledger held: after Task 1 the three listed suites were red, after Task 2 only the thumbnail/customTheme ones, after Task 3 nothing.

## Deviations from Plan

None. Plan executed as written. One mechanical note: the git index held other sessions' staged deletions (src/backend/wine/**, meta/backendDiCeilings/wine.json). Commits used `git commit -- <paths>` (pathspec-only) so none were swept in, and they remain staged and untouched.

## Pending human verification

Live look in `pnpm tauri:dev` (not `tauri:dev:run`; restart dev first if the build is stale). Settings, Accessibility, theme GameLib Light:

1. Library: top bar and tier-2 panel both light; the hairline seam under the top bar breaks cleanly beneath the selected tab; the tier-2 right-edge hairline is not too heavy; the selected tab label is blue; the active tier-2 row is legible.
2. Recently played tile: Play pill and circle are #4c6f99 with a white label, darken on hover, nothing dark green; icon row light grey with the gear legible.
3. Game page: Play, Install and the installed-game button are the same blue with white labels; back and gear squares are light with dark glyphs visible over the art band; card borders neutral (not cyan); install/download progress bar blue; genre pills light with dark text.
4. Optional: context menu hover light grey; a dialog Cancel (tertiary) light grey with dark text.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

All 12 files exist and commits f968c55c1, 275149830, ddb6e3db2 are on main.
