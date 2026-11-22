---
phase: quick-261122-rz8
plan: 01
subsystem: frontend-theming
tags: [nord-light, theme, contrast, scss, frost]
requires:
  - quick-261122-qwk
provides:
  - nord-light as a Frost-forward theme (nord9 navbar, nord8 primary, nord5 raised surfaces) on the 16 official Nord colours
affects:
  - src/frontend/themes.scss
  - src/frontend/styles/_buttons.scss
  - src/frontend/customThemes/builtinTokens.generated.json
tech-stack:
  added: []
  patterns:
    - "specificity-neutral theme label override via :where(body.nord-light) in the base .button block"
    - "nested body.nord-light & overrides inside .NavTabs / FilterFacetGroup (MUI scoping guard)"
key-files:
  created: []
  modified:
    - src/frontend/themes.scss
    - src/frontend/styles/_buttons.scss
    - src/frontend/screens/Library/components/LibrarySignInNotice/index.scss
    - src/frontend/components/UI/NavShell/components/NavTabs/index.scss
    - src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss
    - src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss
    - src/frontend/customThemes/builtinTokens.generated.json
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
    - src/frontend/customThemes/__tests__/nordLightPalette.test.ts
decisions:
  - "Nav rows keep nord0 labels in both states; the nord8 active row on the nord9 bar is 1.35:1 by the operator's choice"
  - "--text-tertiary stays nord6; the plain .button label is re-paired with a :where() rule instead, because --text-tertiary also labels dark accent/success badges"
  - "Snow Storm layering: nord6 page, nord5 raised surfaces, nord4 controls and insets"
metrics:
  duration: "about 25 minutes"
  completed: 2026-11-22
status: complete
commits: 6
plan_head_before: 88b48b70d4c5a0270eabd4f49aef6a178b60878a
plan_head_after: 4471acdc03b36640d16cf7ed451984220fa0a2a6
actuals:
  tokens: 6500
  tasks: 3
  commits: 6
---

# Phase quick-261122-rz8 Plan 01: Make Nord Light bluer with a Frost navbar Summary

Nord Light now reads blue: a Frost nord9 navbar and tier-2 panel with nord0 labels and a nord8 active row, nord8 primary buttons with nord0 labels, and nord5 raised surfaces over the nord6 page with nord4 controls. It still declares only the 16 official Nord colours, and every site that assumed a dark bar was re-paired from the palette.

BASE: `88b48b70d4c5a0270eabd4f49aef6a178b60878a`

## Commits

Each task is a RED test commit followed by a GREEN implementation commit, all staged by explicit path.

| Task | RED | GREEN |
|------|-----|-------|
| 1. Frost navbar | 6ca6e9638 | a907db9a9 |
| 2. Tab chrome and facet controls | 83e7f3d43 | 03bba6009 |
| 3. Frost primary and panel layering | 4ce17ff26 | 4471acdc0 |

## Token mapping

Official palette: nord0 #2e3440, nord1 #3b4252, nord2 #434c5e, nord3 #4c566a, nord4 #d8dee9, nord5 #e5e9f0, nord6 #eceff4, nord7 #8fbcbb, nord8 #88c0d0, nord9 #81a1c1, nord10 #5e81ac, nord11 #bf616a, nord12 #d08770, nord13 #ebcb8b, nord14 #a3be8c, nord15 #b48ead. All ratios are WCAG contrast. On nord9 only nord0 reaches 4.5:1 (4.64); nord1 is 3.74, nord2 3.21, and no Aurora colour reaches 3:1 (nord11 1.52, nord12 1.06, nord13 1.72, nord14 1.32, nord15 1.05).

All values below were implemented exactly as mapped in the plan; there was no deviation from the mapping.

### A. Navbar (change 1), `body.nord-light`

| token | 261122-qwk value | new value | contrast / reason |
|---|---|---|---|
| --navbar-background | #4c566a nord3 | #81a1c1 nord9 | nord0 labels 4.64 |
| --navbar-active-background | #3b4252 nord1 | #88c0d0 nord8 | nord0 label 6.24. Fill reads only 1.35 against the bar (operator's choice, see trade-offs) |
| --navbar-inactive | #eceff4 nord6 | #2e3440 nord0 | 4.64 on the bar |
| --navbar-active | #88c0d0 nord8 | #2e3440 nord0 | 6.24 on the active row, 4.64 on the bar. Body-surface consumers (`.button.is-link`, Clear-all chains) now read 10.84 on nord6, up from 1.74 |
| --navbar-accent | #81a1c1 nord9 | #2e3440 nord0 | text on the tier-2 panel; at nord9 it would read 1.00 on the nord9 bar |
| --osk-button-border | var(--navbar-background) | #4c566a nord3 (literal) | unchanged appearance, 5.46 on the nord4 keys; decoupled because nord9 would read 1.99 there |
| --status-default-hover | #e5e9f0 nord5 | #2e3440 nord0 | only consumer is the game page `.backButton` icon: 4.64 on the navbar surface (was 6.06 on nord3, would have fallen to 2.21); 10.84 on the body on hover (was 1.06) |

### B. Primary (change 2)

| token / site | 261122-qwk value | new value | contrast / reason |
|---|---|---|---|
| --primary | #b48ead nord15 | #88c0d0 nord8 | fill of plain `.button`, ProgressDialog track, AlphabetFilter active |
| --install-button | var(--primary) (nord15) | var(--primary) (nord8), alias unchanged | |
| --primary-hover | #81a1c1 nord9 | unchanged | nord0 label 4.64 (nord7 reads 5.99 but differs from the nord8 fill by 1.04, so the hover would barely show) |
| --brand-primary / -hover | nord8 / nord7 | unchanged | `.button.is-primary` was already nord8 with nord0 label |
| plain `.button` label | --text-tertiary nord6 on nord8: 1.74 | NEW `:where(body.nord-light) &:where(:not(.is-danger))` in `.button` (`_buttons.scss`): `color: var(--text-default)` | 6.24, and 4.64 on the nord9 hover. `:where()` keeps (0,1,0), emitted right after `.button {}`, so modifiers that set their own colour still win. `.is-danger` excluded: nord0 on nord11 is 3.05, below nord6's 3.55. `--text-tertiary` itself unchanged: it labels the dark `--accent`/`--success` badges |
| NEW `.alphabet-filter-button--active` | nord6 on --primary: 1.74 | `color: var(--text-default)` | 6.24; `body.nord-light .alphabet-filter-button--active` is (0,2,1) and beats AlphabetFilter's (0,1,0) |
| NEW `.diskLabel, .dlcItem .action` | text in --primary: would be nord8 1.74 on nord6 | `color: var(--accent)` | nord1 8.73; the only two `color: var(--primary)` text consumers |

### C. Panels (change 3)

| token / site | 261122-qwk value | new value | contrast / reason |
|---|---|---|---|
| --background | var(--background-light) (nord6) | #e5e9f0 nord5 (literal) | L1 raised surface. `.button.is-text` labels (`--background` on --accent) read 8.26 |
| --modal-background | var(--body-background) | var(--background) (nord5) | text-default 10.26, text-secondary 6.06, border-color 3.31 (floor 3) |
| --modal-border | var(--body-background) | var(--input-background) (nord4) | visible dialog and settings-card edge |
| --osk-background | var(--body-background) | var(--background) (nord5) | nord4 keys sit on it |
| `.MuiDialog-paper` background-color | var(--background-light) | var(--modal-background) | |
| `.progressDialog.log-box, .errorDialog.error-box` | #e5e9f0 | #d8dee9 nord4 | inset inside the nord5 dialog; nord0 reads 9.25, --text-log nord3 reads 5.46 |
| --input-background, --tour-popup-background, `.contextMenu` background | nord4 | unchanged | L2 |
| --body-background, --background-light, --current-background, --background-darker | nord6 | unchanged | L0 |

Layering: L0 page nord6, L1 raised surfaces nord5, L2 controls and floating overlays nord4. Edges are carried by `--border-color` nord10, which reads 3.31 on nord5.

### D. Things that assumed a dark nord-light navbar (re-paired)

| site | before | after | contrast |
|---|---|---|---|
| themes.scss `.contextMenu ... .MuiMenuItem-root:hover` | var(--navbar-accent), nord9 | var(--brand-primary), nord8 | nord1 label 5.03 (--navbar-accent is now nord0, which would erase the nord1 label at 1.24) |
| themes.scss `.gameCard > .gameCardStatus` | var(--navbar-active), nord8 | #88c0d0 (literal) | pill is a dark scrim; reads 9.15 on its #141515 stop, keeps today's look |
| themes.scss NEW `.heroicVersion` (before `.heroicVersion:hover`) | --brand-text-01 nord6 on tier-2 panel: 2.34 | var(--navbar-inactive) | 4.64; existing `:hover` (var(--navbar-active)) is now nord0 too |
| themes.scss NEW `.heroicNewReleases > a` (`&`, `&:hover`) | --accent nord1 3.74; hover --accent-overlay nord9 1.00 | var(--navbar-inactive) both states, underline on hover | 4.64 |
| LibrarySignInNotice `&__row--expired > svg` nord-light rule | #ebcb8b nord13 | var(--navbar-inactive) | 4.64 on the nord9 banner; a token, so custom copies on the old nord3 banner keep 6.40 |
| NavTabs `.MuiTab-root:hover` | --text-hover nord10: 1.50 on nord9 | NEW nested `body.nord-light &` `color: var(--navbar-inactive)` | 4.64 |
| NavTabs `.MuiTab-root:focus-visible` | outline --text-hover: 1.50 | NEW nested `body.nord-light &` `outline-color: var(--navbar-inactive)` | 4.64 |
| FilterFacetGroup `.FilterFacetRow__count` | --text-secondary nord3: 2.74 on nord9 | NEW nested `body.nord-light &` `color: var(--navbar-inactive, var(--navbar-accent))` | 4.64 |
| FilterFacetGroup `.FilterFacetRow__box` | border --neutral-05: 1.20 on nord9 | NEW nested `body.nord-light &` `border-color: var(--navbar-inactive, var(--navbar-accent))` | 4.64 |
| NavTabs selected-label override `color: var(--accent)` | nord1 8.73 | rule unchanged | no longer load-bearing for contrast (nord0 would read 10.84); kept so the selected label stays --accent. Comment corrected |
| FilterFocusRow divider override | chain gave nord6 on nord3, 6.40 | rule unchanged; now nord0 on nord9, 4.64 | still load-bearing (base --text-secondary reads 2.74 there). Comment corrected |
| `_buttons.scss` `.is-text:hover` nord-light rule | var(--text-default) | rule unchanged | nord0 on nord9 hover fill reads 4.64; base label is now --background nord5 at 2.21. Comment corrected |

Improvements needing no edit: FilterChipRow chips, SteamSyncNotice, the LeftCard `.categoryPopover` and the Tools fade paint `--text-default` on `--navbar-background` and go from 1.69 to 4.64. The game page `.settings-icon` and the sign-in row text and dismiss hover follow the navbar tokens at 4.64.

## Contrast trade-offs

- The nav rows' active state is a nord8 fill on the nord9 bar, 1.35:1, with a nord0 label in both states. The selected tier-1 tab still merges into the nord6 body, which reads 2.34 against the bar.
- Navbar labels drop from 6.40 to 4.64. Still AA.
- Non-text uses of `--primary` drop from nord15 2.46 to nord8 1.74 on nord6 (1.64 on nord5). All were already under 3:1. They are the ProgressHeader ring stroke, the DownloadManagerItem icon (via --install-button), the AlphabetFilter focus box-shadow, the SideloadDialog and EditGameDialog borders, the SteamGridDBPicker outline, and the ProgressDialog track.
- The Snow Storm tiers are subtle: nord5 on nord6 is 1.06, nord4 on nord5 is 1.11. Borders carry the edges.
- `.button.is-secondary` stays nord10 with its nord6 label at 3.50, unchanged from 261122-qwk because it was not asked for. Danger buttons keep the nord6 label at 3.55.
- The plain `.button` label rule excludes `.is-danger` because nord0 on nord11 (3.05) is worse than the existing nord6 label (3.55).

## Existing assertions edited (no floor lowered)

Only two existing assertions in `themeTokens.test.ts` changed, both exact pins specific to nord-light. No floor, threshold or other expected value moved.

1. "the pre-fix pair reproduces the operator's live verdicts": the `['body.nord-light', 'fail']` row became `['body.gamelib-light', 'fail']`. The live verdict was given on the pre-261122-qwk palette, which gamelib-light keeps verbatim; nord-light's banner is now nord9, where body text nord0 reads 4.64, so nord-light is no longer a fail there. The fail verdict is still proven, on the theme that still carries that palette. Not a lowered floor: the 4.5 threshold and the verdict side are unchanged.
2. The `.is-text` HOVER "load-bearing" test, `preFixRatios['nord-light']`: 2.3354075448387865 became 2.2105479406777806 (nord5 on nord9, since `--background` is now nord5). It is the measured pre-fix pair and still sits under 4.5, so the override stays proven load-bearing. Not a lowered floor: it is a recorded measurement, not a threshold.

## Custom-copy note (threat T-rz8-02)

Custom themes with base `nord-light` keep their own stored token seed but pick up this plan's nested rules from the live CSS. The re-pairings use tokens where that keeps old copies readable: the expired icon is `var(--navbar-inactive)` (6.40 on a stored nord3 banner) and the menu hover is `var(--brand-primary)` (stored nord8). The new plain-`.button` label (nord0) on a stored nord15 `--primary` reads 4.41, up from 2.46. Copies that stored the old nord3 navbar with nord6 labels will, however, get nord0 tab-hover and facet label overrides on a dark bar; accepted per the plan, since gamelib-light is the verbatim copy for anyone who wants the old look.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- Baseline (Task 1, before any edit): full Frontend project, 0 failed suites, 6718 tests passing. After all changes: 385 suites, 0 failed, 6726 tests passing (8 new tests).
- `pnpm -s gen:theme-tokens --check` clean; only the `nord-light` entry differs from BASE (12 values across 94 keys).
- The 13 theme gate suites (themeTokens, appShellLayout, rowSurfaceTheme, builtinTokens, thumbnailPalette, customTheme, contrastFloors, ThemeThumbnail, cssTokenSweep, humbleKeysStylesheet, redeemSteamKeyDialogStylesheet, downloadManagerLayout, nordLightPalette): 673 tests passing. The "GameLib Light is the pre-change Nord Light" fixture and sha256 pins are green, so gamelib-light is byte-identical.
- `pnpm -s codecheck` exit 0, eslint clean on the edited TS, `npx prettier --check` clean on every edited path, `sass` compiles every edited stylesheet. `thumbnailPalette.ts` needed no edit; the new thumbnail pins prove the blue palette.
- No live UI check was done by the executor.

## Notes for the operator

- Please look at nord-light live with both titlebar styles (frameless off and on); the macOS 78px traffic-light inset is layout and unchanged, but the bar is a new colour.
- Seen, not touched: `.gameCard > .gameCardStatus svg` paints `--success` (nord2 since 261122-qwk) on the dark scrim. That is low contrast and predates this task; it may merit a todo.
- The shared tree held other sessions' uncommitted work (src/frontend/state/*, src/frontend/helpers/stores.ts, src/backend/*, .planning/*). None touched this plan's files, and no failure traced to it. Every commit was staged by explicit path.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- All six commits present (6ca6e9638, a907db9a9, 83e7f3d43, 03bba6009, 4ce17ff26, 4471acdc0), measured 6 from the ledger.
- All nine modified files exist and are committed; `git status` shows none of this plan's source paths dirty.
