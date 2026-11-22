---
phase: quick-261122-qwk
plan: 01
subsystem: frontend-themes
tags: [themes, nord, contrast, scss, guard-test]
status: complete
requires: []
provides:
  - "gamelib-light built-in theme (verbatim pre-change Nord Light)"
  - "palette-only nord-light"
  - "nordLightPalette.test.ts guard"
affects: [theme picker, themes.scss, builtinTokens.generated.json]
key-files:
  created:
    - src/frontend/customThemes/__tests__/nordLightPalette.test.ts
    - src/frontend/customThemes/__tests__/fixtures/nordLightPreChange.json
  modified:
    - src/frontend/themes.scss
    - src/frontend/styles/_buttons.scss
    - src/frontend/components/UI/NavShell/components/NavTabs/index.scss
    - src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss
    - src/frontend/screens/Library/components/LibrarySignInNotice/index.scss
    - src/frontend/components/UI/ThemeSelector/themeLabels.ts
    - src/frontend/customThemes/thumbnailPalette.ts
    - src/frontend/customThemes/builtinTokens.generated.json
    - src/frontend/muiTheme.ts
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json
    - "plus 9 theme-enumerating gate/test files (themeTokens, appShellLayout, rowSurfaceTheme, ThemeGallery, ThemeSelector index, ThemeThumbnail, applyTheme, thumbnailPalette, customTheme, muiTheme tests)"
decisions:
  - "Stored nord-light users are NOT migrated to gamelib-light (nobody asked); operator may want to revisit"
  - "No contrast floor or threshold lowered"
plan_head_before: 96557e48607f941c196cd6c7ba22a8ac969d3206
plan_head_after: 126567da4eda8dcd7575c10cebea277a400b62cf
commits: 3
actuals:
  tokens: 60000
  tasks: 3
  commits: 3
completed: 2026-11-22
---

# Quick 261122-qwk: GameLib Light copy and palette-only Nord Light Summary

GameLib Light (`gamelib-light`) is now a built-in theme that is a byte-for-byte copy of the old Nord Light, and `nord-light` now declares only the 16 official Nord colours, with a guard test (`nordLightPalette.test.ts`) enforcing both.

## BASE

Content BASE is `92495cd50987976ba7566d4254a3bbb03a6c6a6e` (HEAD at dispatch). HEAD moved to `96557e486` (another session's `docs(87)` commit, touching no frontend file) before my first commit, so the commit ledger `plan_head_before` is `96557e486`. `src/frontend`, `public/locales` and `meta/i18nCatalogPresenceBaseline.json` were identical between the planner's `a67027ca4`, BASE and `96557e486`, so the sha256 pin
`10ab554e9a5929edd5e39f9afc96c412112781e64d2a4d498e36f1b70563c184` held without change (the guard test's pin test passed against the live `body.gamelib-light` body on first run).

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 (tracer) | 17c528d82 | GameLib Light end to end: block, 4 overrides, registry, label, locale, baseline, thumbnail, seeds, 11-theme gates |
| 2 (RED) | b3ce729d3 | Guard test and pre-change fixture; palette describe RED, pin describe green |
| 3 (GREEN) | 126567da4 | nord-light reworked to the palette |

Tracer gate: the Task 1 `<verify>` was run end to end (seeds check, 13 suites / 856 tests, codecheck, i18n churn guard, eslint, scoped prettier, three count gates) and passed before Task 2 began.

## Nord Light mapping (final, identical to the plan table)

No value was changed from the plan's table; every gate passed on the first run with exactly these values.

### A. Tokens already declared in the block

| token | old | new |
|---|---|---|
| --background-light | #eceff4 | #eceff4 nord6 (unchanged) |
| --fav | #a03a45 | #bf616a nord11 |
| --accent-overlay, --navbar-accent | #81a1c1 | nord9 (unchanged) |
| --navbar-active-background | #60697a | #3b4252 nord1 (comment now says darker than the bar) |
| --primary | #b48ead | nord15 (unchanged) |
| --primary-hover | #a17399 | #81a1c1 nord9 |
| --danger | #bf616a | nord11 (unchanged) |
| --navbar-inactive | #ffffff | #eceff4 nord6 |
| --navbar-active | #d0ddff | #88c0d0 nord8 |
| --success-button | #3687a9 | #81a1c1 nord9 |
| --secondary-button | #15a3e0 | #5e81ac nord10 |
| --icons-background | #6f738f | #4c566a nord3 |
| --tertiary-button | #6f738f | #4c566a nord3 |
| --brand-text-01 | #e0f9ff | #eceff4 nord6 |
| --neutral-06 | #2e3440 | nord0 (unchanged) |
| --neutral-03 | #429ec5 | #5e81ac nord10 |
| --accent | #30444a | #3b4252 nord1 |
| --navbar-background | #4c566a | nord3 (unchanged) |
| --input-background | #d8dee9 | nord4 (unchanged) |
| --success | #3e532d | #434c5e nord2 |
| --success-hover | #617550 | #4c566a nord3 |
| --text-title (-> --text-default) | #20242c | #2e3440 nord0 |
| --text-secondary | #393b41 | #4c566a nord3 |
| --text-hover | #5e81ac | nord10 (unchanged) |
| --action-icon | #748aa0 | #5e81ac nord10 |
| --status-warning | #b86901 | #d08770 nord12 |
| --gamecard-title-color | #ccdaf8cc | #e5e9f0cc nord5, same alpha |
| --status-success-hover | #5e81ac | nord10 (unchanged) |
| --text-log | var(--status-warning) | #4c566a nord3 |

### B. Nested literals

| rule | old | new |
|---|---|---|
| `.progressDialog.log-box, .errorDialog.error-box` background | #dde1e7 | #e5e9f0 nord5 |
| `.CategoriesManager__Dialog` hover background | rgba(0,0,0,0.05) | rgba(46,52,64,0.05) |
| new nested `.mainInfoBody` | none | `--leftcard-warning-text: color-mix(in srgb, var(--status-warning) 50%, var(--text-default))` (50% reads 5.02; the shared 60% reads 4.31) |

### C. Inherited tokens now declared in the block (previously off-palette from `body {}` / `_colors.scss`)

--border-color #5e81ac; --tertiary-button-overlay #434c5e; --cancel-button #bf616a; --cancel-button-overlay #d08770; --brand-primary #88c0d0 / -hover #8fbcbb; --brand-secondary #b48ead / -hover #81a1c1; --brand-text-02..05 #4c566a / #88c0d0 / #b48ead / #81a1c1; --primary-active #88c0d0; --secondary-hover #81a1c1 / -active #5e81ac; --accent-02 #5e81ac5b; --neutral-01/-02 #2e3440; --neutral-07/-08 #eceff4; --base-06 #4c566a; --eighty-percent-black rgba(46,52,64,0.8); --sixty-percent-black rgba(46,52,64,0.6); --gradient-01 / -02 / -gamecard on Frost and nord0 scrims; --status-danger #bf616a / -hover #d08770; --status-success #a3be8c; --status-warning-hover #ebcb8b; --status-info #88c0d0 / -hover #8fbcbb; --status-default #d8dee9 / -hover #e5e9f0; --anticheat-denied #bf616a. Exempt: --neutral-04 and --neutral-05 (themeTokens.test.ts forbids any theme to declare them).

### D. Component overrides

| site | old | new |
|---|---|---|
| `_buttons.scss` `.button.is-text:hover` nord-light rule | `var(--neutral-01, #070a0b)` | `var(--text-default)` (nord0 on nord9: 4.64; base nord6 on nord9 reads 2.34, so the rule still earns its place) |
| LibrarySignInNotice expired icon | #ffb3b8 | #ebcb8b nord13 (4.72 on the nord3 banner) |
| NavTabs selected label, FilterFocusRow divider | unchanged rules | now resolve to nord1 (8.73) and nord6 on nord3 (6.40) |
| thumbnailPalette nord-light success literal | #81a1c1 | unchanged (nord9) |

gamelib-light keeps every pre-change value in all four overrides and in the thumbnail base overrides.

## Contrast trade-offs (for the operator to judge live)

- --text-secondary drops from 9.71 to 6.40, still AA.
- The `.button.is-primary` label drops from 10.31 to 6.24, still AA.
- --fav drops from 5.72 to 3.55, still above the 3:1 non-text floor.
- The danger-button label drops from 3.79 to 3.55.
- Success text is no longer green. It is Polar Night nord2 (colour is never the only signal); the green moved to the --status-success fill.
- Aurora and Frost carry fills, not text, on Snow Storm.
- The `.is-text` hover fill is now nord9 (4.64 under the nord0 override, not the old 5.13), and the active nav row is now darker than the bar rather than lighter.
- The expired-sign-in icon is yellow (nord13), not red, because no palette red reaches 3:1 on the nord3 banner.
- No contrast floor, threshold or expected value was lowered. The only themeTokens.test.ts edits are theme enumerations (10 to 11 themes), the new `gamelib-light` entries, the nord-light `preFixRatios` value (2.3354075448387865, nord6 on nord9) beside gamelib-light's unchanged 3.356770572062584 (#eceff4 on #a17399), and `leftScopeFor` now applying a theme's own nested `.mainInfoBody` rule.

## Component color-mix() derivations that still compute non-palette colours

The guard checks declared literals and resolved tokens, not computed mixes. These still blend two palette colours at render time into a non-palette result: `--install-danger-text`, `--winetricks-danger-text`, `--leftcard-warning-text` (Hide-toggle text), and the danger-zone border mixed into `--border-color`.

## Decisions and risks

- Users whose stored theme is `nord-light` are not migrated to `gamelib-light`; they will see the reworked palette-only Nord Light. Operator may want to revisit this.
- Existing custom copies with base `nord-light` keep their stored tokens, but their base's nested rules (for example `.button.is-success` #81a1c1) follow the reworked theme (threat T-qwk-02, accepted).
- Other 48 locales are unlocalised for `themeSelector.gamelibLight` (recorded in the presence baseline, 48 pairs added, 0 removed); they fall back to English.

## Verification

- `pnpm gen:theme-tokens --check` up to date; only the `nord-light` entry changed in Task 3 (the other ten seeds are unchanged; `gamelib-light` is byte-identical to the BASE nord-light seed, 94 keys).
- Task 1 verify: 13 suites, 856 tests. Task 2 RED: pin describe and "checker can fail" pass; the palette describe fails on the off-palette values, as designed. Task 3 verify: 19 suites, 863 tests.
- Full `npx jest --selectProjects Frontend`: 385 suites, 6718 tests, all passing (including cssTokenSweep in the live tree).
- `pnpm codecheck` clean, `pnpm i18n-churn-guard` clean, eslint clean (one pre-existing warning in ThemeGallery.test.tsx, `import-x/no-named-as-default-member` on i18next, not touched by this plan), scoped prettier check clean.
- `graphify update .` run.
- No live UI check was done; the operator will look at both themes live.

## Deviations from Plan

None. The plan was executed as written. One bookkeeping note: the Task 1 precondition (`git status --porcelain src/frontend ...` empty) was not literally true because other sessions had uncommitted `src/frontend/helpers/stores.ts`, `state/initStateSubscriptions.ts`, `state/libraryState.ts` and a new `state/__tests__/libraryStoreFollowers.test.ts`; the orchestrator had named these as not mine, none overlaps this plan's files, and none were staged or touched.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- Commits 17c528d82, b3ce729d3, 126567da4 are ancestors of HEAD; each staged only its own files (checked with `git diff --cached --name-only` before every commit).
- Created files present: nordLightPalette.test.ts and fixtures/nordLightPreChange.json.
- Other sessions' uncommitted files (stores.ts, initStateSubscriptions.ts, libraryState.ts, libraryStoreFollowers.test.ts, .planning files) were left untouched.
