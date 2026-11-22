---
phase: quick-261122-qwk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
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
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
  - src/frontend/components/UI/NavShell/__tests__/appShellLayout.test.ts
  - src/frontend/screens/StoreSearch/__tests__/rowSurfaceTheme.test.ts
  - src/frontend/components/UI/ThemeSelector/__tests__/ThemeGallery.test.tsx
  - src/frontend/components/UI/ThemeSelector/__tests__/index.test.tsx
  - src/frontend/components/UI/ThemeSelector/__tests__/ThemeThumbnail.test.tsx
  - src/frontend/customThemes/__tests__/applyTheme.test.ts
  - src/frontend/customThemes/__tests__/thumbnailPalette.test.ts
  - src/frontend/customThemes/__tests__/customTheme.test.ts
  - src/frontend/__tests__/muiTheme.test.ts
  - src/frontend/customThemes/__tests__/nordLightPalette.test.ts
  - src/frontend/customThemes/__tests__/fixtures/nordLightPreChange.json
autonomous: true
requirements:
  - "quick:261122-qwk"

estimate:
  tokens: 110000
  raw_tokens: 110000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "The theme picker lists GameLib Light (key gamelib-light) as a built-in theme, and selecting it renders exactly what Nord Light rendered before this task: its flattened token seed equals the pre-change nord-light seed, its themes.scss block body is the pre-change nord-light body (sha256-pinned), and it carries the four component overrides and the thumbnail base overrides with the pre-change values"
    - "Nord Light (key nord-light) declares only the 16 official Nord colours (or alpha forms of them) in its themes.scss block, in every body.nord-light-scoped rule in any frontend stylesheet, and in its thumbnail base override. Every token in its flattened seed resolves to an official colour except --neutral-04 and --neutral-05, which themeTokens.test.ts forbids any theme to redeclare"
    - "A guard test fails if an off-palette colour is later added anywhere nord-light is scoped (block, scoped overrides, thumbnail literal, resolved seed), and fails if GameLib Light drifts from the pre-change Nord Light"
    - "Every existing theme contrast gate (themeTokens.test.ts, rowSurfaceTheme.test.ts) holds both light themes, and no floor or threshold was lowered"
    - "en/gamelib.json carries themeSelector.gamelibLight = GameLib Light, and the i18n presence baseline records it as unlocalised in the other 48 locales"
  artifacts:
    - path: "src/frontend/themes.scss"
      provides: "body.gamelib-light (verbatim pre-change nord-light) and the palette-only body.nord-light, including its nested .mainInfoBody rule"
      contains: "body.gamelib-light {"
    - path: "src/frontend/customThemes/__tests__/nordLightPalette.test.ts"
      provides: "palette guard over every nord-light-scoped rule, the thumbnail literal and the resolved seed; GameLib Light pre-change pins"
      contains: "10ab554e9a5929edd5e39f9afc96c412112781e64d2a4d498e36f1b70563c184"
    - path: "src/frontend/customThemes/__tests__/fixtures/nordLightPreChange.json"
      provides: "the pre-change nord-light flattened seed, copied verbatim from the base commit's builtinTokens.generated.json"
    - path: "src/frontend/components/UI/ThemeSelector/themeLabels.ts"
      provides: "gamelib-light in defaultThemes and its label case"
      contains: "'gamelib-light': true"
    - path: "src/frontend/customThemes/builtinTokens.generated.json"
      provides: "regenerated seeds: gamelib-light added, nord-light on the palette"
      contains: "\"gamelib-light\""
  key_links:
    - from: "src/frontend/components/UI/ThemeSelector/themeLabels.ts"
      to: "src/frontend/customThemes/builtinTokens.generated.json"
      via: "pnpm gen:theme-tokens flattens every defaultThemes key through meta/genThemeTokens.ts; builtinTokens.test.ts fails on drift"
    - from: "src/frontend/components/UI/ThemeSelector/themeLabels.ts"
      to: "public/locales/en/gamelib.json"
      via: "resolveThemeLabel case 'gamelib-light' -> t('gamelib:themeSelector.gamelibLight', 'GameLib Light')"
    - from: "src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts"
      to: "src/frontend/themes.scss"
      via: "themeSelectors gains 'body.gamelib-light', so every contrast census measures it"
    - from: "src/frontend/customThemes/__tests__/nordLightPalette.test.ts"
      to: "src/frontend/themes.scss"
      via: "scans every body.nord-light-scoped rule under src/frontend and BUILTIN_TOKENS['nord-light'] for off-palette literals; sha256 of the body.gamelib-light body"
---

<objective>
Add a new built-in theme, GameLib Light (`gamelib-light`), that is an exact copy of today's Nord Light: same token values and same per-theme overrides. Then rework Nord Light (`nord-light`) so it uses only the 16 official Nord palette colours, and add a guard test that keeps it that way.

Purpose: the operator keeps today's light look under a GameLib name, and Nord Light becomes a faithful Nord theme.
Output: one new theme block plus its registrations, a palette-only nord-light, regenerated token seeds, an updated locale key and presence baseline, updated gates, and one new guard test with a fixture.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

Load `Skill("gamelib-conventions")` before writing any `<verify>` step (the formatter rule). Load `Skill("sketch-findings-gamelib")` for the multi-theme rule: emphasis is relational, so never assume the navbar is the darker band.

@src/frontend/themes.scss
@src/frontend/components/UI/ThemeSelector/themeLabels.ts
@src/frontend/customThemes/thumbnailPalette.ts
@src/frontend/testUtils/scssTokenSource.ts
@src/frontend/customThemes/colour.ts

**Facts established during planning.** These were all measured. The plan was prototyped end to end on an isolated `git archive` copy of HEAD a67027ca4, so nothing in the live tree was touched.

- After all three tasks the whole Frontend jest project passed, apart from 3 suites that fail in a git-less copy only (cssTokenSweep, declaredUnavailable and deleteButtonReachability need `git` and `.planning`). cssTokenSweep also passed once the copy had a git index. `tsc` and eslint were clean.
- nord-light is wired in at these places, all of them non-test code:
  - the `body.nord-light` block in `src/frontend/themes.scss` (line 429, ending before `body.nord-dark` at 587)
  - four nested `body.nord-light &` overrides: `styles/_buttons.scss:211`, `NavTabs/index.scss:290`, `FilterFocusRow/index.scss:83` (a grouped selector shared with dracula) and `LibrarySignInNotice/index.scss:118`
  - `themeLabels.ts` (`defaultThemes`, `resolveThemeLabel`)
  - `thumbnailPalette.ts` (`BASE_PREVIEW_OVERRIDES`, `BASE_OVERRIDDEN_TOKENS`)
  - the generated `builtinTokens.generated.json`, produced by `pnpm gen:theme-tokens` and drift-gated by `builtinTokens.test.ts`
  - the locale key `themeSelector.nordLight`
- Nothing in code keys light-mode behaviour off the `nord-light` name. Light detection is token-based (`isLight(--body-background)` in rowSurfaceTheme). `muiTheme.ts` mentions nord-light only in a comment.
- Adding a gamelib key: the recent pattern (commit eb7eef233) adds the key to `en/gamelib.json` only, then regenerates `meta/i18nCatalogPresenceBaseline.json` with `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`. Without the regeneration, `meta/__tests__/lintTranslations.test.ts` fails 48 times (once per locale). Other locales fall back to English. Do not machine-fill them.
- `public/locales/en/gamelib.json` is prettier-ignored (`--file-info` reports `"ignored": true`). Every other path this plan writes is prettier-visible.
- The working tree carries another executor's uncommitted Phase 85 work: `src/backend/**`, `.planning/state.json` and others. **Stage only the files named in each task by explicit path. Never use `git add -A`, `git add .` or a sweeping commit helper.** `src/frontend`, `public/locales` and `meta/` were clean at planning time.
- Leave the contrast-history comments across the scss files alone. Update only a comment that becomes false next to a line you change. The places this plan requires are named in the tasks.
- Do not migrate users whose stored theme is `nord-light` to `gamelib-light`. Nobody asked for that. Record it in the SUMMARY as a decision the operator may want to revisit.
</context>

## Nord Light palette mapping (the source of truth for Task 3)

Official palette (nordtheme.com). These are the only colours nord-light may declare, plus alpha forms of the same RGB (`rgba(r, g, b, a)` or `#rrggbbaa`):

- Polar Night: nord0 #2e3440, nord1 #3b4252, nord2 #434c5e, nord3 #4c566a
- Snow Storm: nord4 #d8dee9, nord5 #e5e9f0, nord6 #eceff4
- Frost: nord7 #8fbcbb, nord8 #88c0d0, nord9 #81a1c1, nord10 #5e81ac
- Aurora: nord11 #bf616a, nord12 #d08770, nord13 #ebcb8b, nord14 #a3be8c, nord15 #b48ead

The ratios below are WCAG contrast. All of them were checked by `themeTokens.test.ts` in the prototype, which passed with exactly these values. If you change a value, re-run the gates. **Never lower a gate's floor.**

**A. Tokens already declared in `body.nord-light` (each one gets a palette value)**

| token | old | new | why |
|---|---|---|---|
| --background-light | #eceff4 | nord6 #eceff4 (unchanged) | Snow Storm base surface |
| --fav | #a03a45 | nord11 #bf616a | the heart is held to a 3:1 floor on nord6 and gets 3.55. nord15 (purple, the suggested favourite colour) fails at 2.46 |
| --accent-overlay | #81a1c1 | nord9 (unchanged) | |
| --navbar-accent | #81a1c1 | nord9 (unchanged) | |
| --navbar-active-background | #60697a | nord1 #3b4252 | no Polar Night colour is lighter than the nord3 bar, so the active row becomes darker. The nord8 label on it reads 5.03 (was 4.07). Rewrite this line's trailing "lighter than" comment to say darker |
| --primary | #b48ead | nord15 (unchanged) | |
| --primary-hover | #a17399 | nord9 #81a1c1 | hover fill under nord0 text reads 4.64. The palette has no darker purple. nord10 would give 3.10 and nord15 4.41 |
| --danger | #bf616a | nord11 (unchanged) | |
| --navbar-inactive | #ffffff | nord6 #eceff4 | 6.40 on the nord3 bar (was 7.38) |
| --navbar-active | #d0ddff | nord8 #88c0d0 | Frost highlight, 5.03 on the nord1 active row |
| --success-button | #3687a9 | nord9 #81a1c1 | matches the nested `.button.is-success` fill (already nord9), so the token and what is painted agree |
| --secondary-button | #15a3e0 | nord10 #5e81ac | primary-interactive Frost. Its nord6 label reads 3.50 (was 2.61) |
| --icons-background | #6f738f | nord3 #4c566a | |
| --tertiary-button | #6f738f | nord3 #4c566a | nord6 label reads 6.40 |
| --brand-text-01 (feeds --text-tertiary) | #e0f9ff | nord6 #eceff4 | label colour on filled buttons |
| --neutral-06 | #2e3440 | nord0 (unchanged) | |
| --neutral-03 | #429ec5 | nord10 #5e81ac | |
| --accent | #30444a | nord1 #3b4252 | carries text: the selected tab label reads 8.73 on nord6, and so does the nord6 text on a `.button.is-text` fill. Frost cannot carry 4.5:1 text on Snow Storm |
| --navbar-background | #4c566a | nord3 (unchanged) | the Polar Night bar is kept |
| --input-background | #d8dee9 | nord4 (unchanged) | |
| --success | #3e532d | nord2 #434c5e | the success token used as text (32 consumers, mostly on the light body). nord14 reads 1.77 there and nord2 reads 7.49. The green moves to the --status-success fill |
| --success-hover | #617550 | nord3 #4c566a | adjacent to nord2 |
| --text-title (feeds --text-default) | #20242c | nord0 #2e3440 | 10.84 on nord6 |
| --text-secondary | #393b41 | nord3 #4c566a | 6.40 on nord6, 5.46 on nord4 |
| --text-hover | #5e81ac | nord10 (unchanged) | |
| --action-icon | #748aa0 | nord10 #5e81ac | non-text, 3.50 (was 3.10) |
| --status-warning | #b86901 | nord12 #d08770 | |
| --gamecard-title-color | #ccdaf8cc | nord5 at the same alpha, #e5e9f0cc | row plate; the alpha stays because the plate sits over artwork |
| --status-success-hover | #5e81ac | nord10 (unchanged) | |
| --text-log | var(--status-warning) | nord3 #4c566a | log text; nord12 would read 2.47 |

The var() aliases in the block stay as they are (--body-background, --background, --background-darker, --current-background, --modal-*, --osk-*, --action-icon-hover/-active, --text-default, --text-tertiary, --install-button, --tour-*, --gradient-body-background).

**B. Literals in the block's nested rules**

| rule | old | new |
|---|---|---|
| `.progressDialog.log-box, .errorDialog.error-box` background-color | #dde1e7 | nord5 #e5e9f0 (nord0 text reads 10.26) |
| `.CategoriesManager__Dialog` hover background-color | rgba(0, 0, 0, 0.05) | rgba(46, 52, 64, 0.05), which is nord0 at the same alpha |
| `.runnerIcon` #88c0d0, `.genre` #2e3440 / #e5e9f0, `.button.is-success` #81a1c1 | already palette | unchanged. The `.button.is-success` literal is pinned by thumbnailPalette and ThemeThumbnail tests |
| NEW nested `.mainInfoBody` rule | none | sets `--leftcard-warning-text` to `color-mix(in srgb, var(--status-warning) 50%, var(--text-default))`. Base LeftCard mixes 60%, which gives 4.31 with nord12 and nord0, under the 4.5 Hide-toggle gate. 50% reads 5.02. `body.nord-light .mainInfoBody` outranks `.mainInfoBody` by specificity |

**C. Inherited tokens nord-light must now declare.** They were off-palette before, coming from `body {}` or `styles/_colors.scss`, and they paint visibly. For example `.button.is-primary` filled with the neon --brand-primary, and the block's own `.playIcon` used --status-success.

| token | old (resolved) | new |
|---|---|---|
| --border-color | gray #808080 | nord10 #5e81ac. Reads 3.50 on nord6 against a 3:1 floor. The switch knob (--text-default, nord0) must also reach 3:1 against it and reads 3.10. nord3 failed the knob gate at 1.69 |
| --tertiary-button-overlay | #ffbd8e | nord2 #434c5e (hover of nord3; the label reads 7.49, was 1.48) |
| --cancel-button | #b86901 | nord11 #bf616a (danger button; the nord6 label reads 3.55, was 3.79) |
| --cancel-button-overlay | #ffbd8e | nord12 #d08770 (adjacent; 2.47, was 1.48) |
| --brand-primary / --brand-primary-hover | #1de8f5 / #0db4be | nord8 / nord7. `.button.is-primary` has a nord0 label: 6.24 on nord8, 4.64 on the nord9 hover |
| --brand-secondary / --brand-secondary-hover | #bfb3ff / #dad5ff | nord15 / nord9 |
| --brand-text-02 / -03 / -04 / -05 | #a5edfd / #6fd9f7 / #e0d0ff / #9ea3fd | nord3 / nord8 / nord15 / nord9 |
| --primary-active | #88ebf1 | nord8 |
| --secondary-hover / --secondary-active | #a7baff / #2253ff | nord9 / nord10 |
| --accent-02 | #484daf5b | #5e81ac5b (nord10, same alpha) |
| --neutral-01 / --neutral-02 | #070a0b / #161c1e | nord0 / nord0 |
| --neutral-07 / --neutral-08 | #f0f7f9 / #f9fbfc | nord6 / nord6 |
| --base-06 | #9aa1a3 | nord3 |
| --eighty-percent-black / --sixty-percent-black | #000000cc / #00000099 | rgba(46, 52, 64, 0.8) / rgba(46, 52, 64, 0.6). Scrims stay scrims, tinted nord0. --background-darker-80 follows automatically |
| --gradient-01 | #86b6ff to #18dfec | linear-gradient(270.36deg, #81a1c1 1.57%, #88c0d0 96.46%) |
| --gradient-02 | #1de8f5 to #4b93ff | linear-gradient(270.36deg, #88c0d0 1.57%, #5e81ac 96.46%) |
| --gradient-gamecard | rgba(0,0,0,0.418) to #000000cc | linear-gradient(180deg, rgba(46, 52, 64, 0.418) 1.8%, var(--eighty-percent-black) 45%) |
| --status-danger / --status-danger-hover | #f97881 / #fc9ba1 | nord11 / nord12. --danger-hover follows. --status-danger reads 3.55 on nord6, was 2.27 |
| --status-success | #0ce396 | nord14 #a3be8c |
| --status-warning-hover | #ffbd8e | nord13 #ebcb8b |
| --status-info / --status-info-hover | #2ceac7 / #0fefc7 | nord8 / nord7 |
| --status-default / --status-default-hover | #d2d2d2 / #c5c5c5 | nord4 / nord5 |
| --anticheat-denied | #a25d21 | nord11. The other anticheat tokens alias status tokens and follow them |

**Exempt, and the only exemption.** --neutral-04 #51595a and --neutral-05 #a8aeaf. The themeTokens.test.ts census "no theme block redeclares --neutral-04 or --neutral-05" forbids any theme to declare them.

**D. nord-light component overrides**

| site | old | new |
|---|---|---|
| `_buttons.scss` `.button.is-text:hover` nord-light rule | `var(--neutral-01, #070a0b)` | `var(--text-default)`, which is nord0 on nord9 at 4.64. Without the override, nord6 on nord9 reads 2.34, so the rule still earns its place |
| `LibrarySignInNotice` expired icon | #ffb3b8 | nord13 #ebcb8b, 4.72 on the nord3 banner. No palette red reaches 3:1 on nord3 (nord11 1.80, nord12 2.59), and yellow is Nord's attention colour |
| `NavTabs` selected label | var(--accent) | unchanged rule; it now resolves to nord1 at 8.73 |
| `FilterFocusRow` divider | navbar-inactive chain | unchanged rule; it resolves to nord6 on nord3 at 6.40 |
| `thumbnailPalette` nord-light success literal | #81a1c1 | unchanged (nord9) |

**Trade-offs to record in the SUMMARY.** The operator will judge these live.

- --text-secondary drops from 9.71 to 6.40, still AA.
- The `.button.is-primary` label drops from 10.31 to 6.24, still AA.
- --fav drops from 5.72 to 3.55, still above the 3:1 non-text floor.
- The danger-button label drops from 3.79 to 3.55.
- Success text is no longer green. It is Polar Night nord2, because colour is never the only signal.
- Aurora and Frost carry fills, not text, on Snow Storm.
- The Hide-toggle text and shared component `color-mix()` derivations (`--install-danger-text`, `--winetricks-danger-text`, `--leftcard-warning-text`) still compute colours between two palette colours. The guard checks declared literals and resolved tokens, not computed mixes.

<tasks>

<task type="tracer">
  <name>Task 1: GameLib Light, an exact copy of today's Nord Light, registered end to end</name>
  <files>src/frontend/themes.scss, src/frontend/styles/_buttons.scss, src/frontend/components/UI/NavShell/components/NavTabs/index.scss, src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss, src/frontend/screens/Library/components/LibrarySignInNotice/index.scss, src/frontend/components/UI/ThemeSelector/themeLabels.ts, src/frontend/customThemes/thumbnailPalette.ts, src/frontend/customThemes/builtinTokens.generated.json, src/frontend/muiTheme.ts, public/locales/en/gamelib.json, meta/i18nCatalogPresenceBaseline.json, src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts, src/frontend/components/UI/NavShell/__tests__/appShellLayout.test.ts, src/frontend/screens/StoreSearch/__tests__/rowSurfaceTheme.test.ts, src/frontend/components/UI/ThemeSelector/__tests__/ThemeGallery.test.tsx, src/frontend/components/UI/ThemeSelector/__tests__/index.test.tsx, src/frontend/components/UI/ThemeSelector/__tests__/ThemeThumbnail.test.tsx, src/frontend/customThemes/__tests__/applyTheme.test.ts, src/frontend/customThemes/__tests__/thumbnailPalette.test.ts, src/frontend/customThemes/__tests__/customTheme.test.ts, src/frontend/__tests__/muiTheme.test.ts</files>
  <precondition>`git status --porcelain src/frontend public/locales meta/i18nCatalogPresenceBaseline.json` prints nothing. Another executor's uncommitted work is confined to src/backend and .planning. If any of those paths is dirty, halt and report.</precondition>
  <action>
Before editing anything, record the base commit with `git rev-parse HEAD` and write it in the SUMMARY as BASE. Task 2 reads the pre-change values from BASE.

1. Theme block. In `src/frontend/themes.scss`, insert a new `body.gamelib-light { ... }` block immediately before `body.nord-light {`. Its body must be a verbatim copy of the current `body.nord-light` body: every declaration, every nested rule, the same order. Only the selector changes. Above it, add one short comment: this is the pre-261122-qwk nord-light, kept verbatim as GameLib Light, and `customThemes/__tests__/nordLightPalette.test.ts` pins it. Do not touch `body.nord-light` in this task.

2. Component overrides. Duplicate each nord-light override for gamelib-light, with the same declaration.
   - `styles/_buttons.scss`: inside `.button.is-text:hover`, add a `body.gamelib-light &:not(.is-link):not(:disabled)` rule with the same `color: var(--neutral-01, #070a0b);`, between the nord-light and nord-dark rules.
   - `NavTabs/index.scss`: add a nested `body.gamelib-light &` rule with `color: var(--accent);` directly after the nord-light one. It must stay nested inside `.NavTabs`; `appShellLayout.test.ts`'s MUI-scoping guard rejects a top-level rule.
   - `FilterFocusRow/index.scss`: extend the grouped selector to `body.dracula &, body.nord-light &, body.gamelib-light &`.
   - `LibrarySignInNotice/index.scss`: inside `&__row--expired > svg`, add `body.gamelib-light & { color: #ffb3b8; }` after the nord-light rule.

   In each of those four comment blocks, edit only the sentence that becomes false: the claims that nord-light is "the ONLY light theme" or "the one light theme", or "the one theme whose banner is a mid grey". Add one clause saying gamelib-light carries the same override because it is the pre-change nord-light. Leave every measurement number alone. Task 3 updates the nord-light numbers.

3. Registry and label. In `themeLabels.ts`, add `'gamelib-light': true` to `defaultThemes` immediately before `'nord-light'`, so the two light themes sit together. Add a `case 'gamelib-light':` to `resolveThemeLabel` returning `t('gamelib:themeSelector.gamelibLight', 'GameLib Light')`. It must be a direct literal-argument t() call, which is Pattern 1 of the hardcoded-string gate, the same shape as the other ten.

4. Locale. In `public/locales/en/gamelib.json`, add `"gamelibLight": "GameLib Light",` inside `themeSelector`, between `"dracula"` and `"gruvboxDark"`. Keys there are alphabetical and indented 4 spaces. The file is prettier-ignored, so match the surrounding lines by hand. Then run `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib` to regenerate `meta/i18nCatalogPresenceBaseline.json`. Expected result: 48 added locale pairs for `themeSelector.gamelibLight` and 0 removed. Do not touch other locales.

5. Thumbnail. In `thumbnailPalette.ts`, add a `'gamelib-light'` entry before `'nord-light'` in `BASE_PREVIEW_OVERRIDES`, with exactly the nord-light entry's three fields (success literal `#81a1c1`, successLabel and primaryLabel tokens `--text-default`). Add `'gamelib-light': ['--success-button']` to `BASE_OVERRIDDEN_TOKENS`. Update the doc comment above `BASE_PREVIEW_OVERRIDES` to name both themes.

6. Regenerate the seeds with `pnpm gen:theme-tokens`. The new `gamelib-light` entry must be byte-identical to the `nord-light` entry.

7. Light-theme wording. In the `muiTheme.ts` comment, "nord-light is a light theme; the rest are dark" becomes "nord-light and gamelib-light are light themes; the rest are dark". Change the matching `it()` title in `src/frontend/__tests__/muiTheme.test.ts` the same way. No code change: nothing keys behaviour off the theme name.

8. Gates that enumerate themes. These edits make gamelib-light measured by every census, and every one of them was validated in the prototype.
   - `themeTokens.test.ts`:
     - Add `'body.gamelib-light'` to `themeSelectors` right after `'body.nord-light'`, and say 11 in its header comment.
     - The FilterFocusRow divider census `overridden` becomes `['dracula', 'nord-light', 'gamelib-light']`.
     - The sign-in triangle census `overridden` becomes `['nord-light', 'gamelib-light']`.
     - `expect(themeClasses).toHaveLength(10)` becomes 11.
     - In the pure `.is-text` HOVER tests:
       - loop over `['nord-light', 'gamelib-light', 'nord-dark']`
       - also strip the gamelib-light rule in `withoutOverrides`
       - add `'gamelib-light': 3.356770572062584` to `preFixRatios`, which is the pre-change nord-light value, unchanged
       - `isTextHoverThemeOverrides` becomes length 3
       - exclude gamelib-light from the "no other theme carries a hover override" filter
   - `appShellLayout.test.ts`: add `/^body\.gamelib-light\s*\{/m` to `REAL_THEME_BLOCK_PATTERNS`.
   - `rowSurfaceTheme.test.ts`: the count becomes 11, with title "covers all eleven built-in themes". The light-bodied assertion must contain both `nord-light` and `gamelib-light`, using `expect.arrayContaining`.
   - `ThemeGallery.test.tsx`: both counts 10 become 11, title included.
   - `ThemeSelector/__tests__/index.test.tsx`: add `'gamelib-light': 'GameLib Light'` to `expectedLabels`; 10 becomes 11, title included.
   - `applyTheme.test.ts`: 10 becomes 11, title included.

9. Move pins that hold today's nord-light values onto gamelib-light, or duplicate them.
   - `thumbnailPalette.test.ts`: `Object.keys(BASE_PREVIEW_OVERRIDES)` becomes `['gamelib-light', 'nord-light']`. Add a parallel `GameLib Light base overrides (OD-2)` describe asserting the same three entries, the #81a1c1 success draw, `BASE_OVERRIDDEN_TOKENS['gamelib-light']`, and the themes.scss pin against `body.gamelib-light`'s `button.is-primary` and `.button.is-success` rules.
   - `ThemeThumbnail.test.tsx`: add a gamelib-light case for the #81a1c1 success button.
   - `customTheme.test.ts`: retarget the D-09 "nested-override colours ... are not stored as tokens" test from nord-light to gamelib-light, covering the seed, makeCopy base and title. Its literals (#88c0d0, #dde1e7, #2e3440 as only --neutral-06) are pre-change nord-light facts, which gamelib-light now owns. Task 3 changes nord-light, and with the new palette many tokens become #2e3440 and #88c0d0.

Run `npx prettier --write` over the prettier-visible paths in this task's files list. That is every path except `public/locales/en/gamelib.json`.
  </action>
  <verify>
    <automated>pnpm -s gen:theme-tokens --check && npx jest --runTestsByPath src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/components/UI/NavShell/__tests__/appShellLayout.test.ts src/frontend/screens/StoreSearch/__tests__/rowSurfaceTheme.test.ts src/frontend/components/UI/ThemeSelector/__tests__/ThemeGallery.test.tsx src/frontend/components/UI/ThemeSelector/__tests__/index.test.tsx src/frontend/components/UI/ThemeSelector/__tests__/ThemeThumbnail.test.tsx src/frontend/customThemes/__tests__/applyTheme.test.ts src/frontend/customThemes/__tests__/thumbnailPalette.test.ts src/frontend/customThemes/__tests__/customTheme.test.ts src/frontend/customThemes/__tests__/builtinTokens.test.ts src/frontend/__tests__/muiTheme.test.ts meta/__tests__/lintTranslations.test.ts meta/__tests__/gamelibCatalogParity.test.ts && pnpm -s codecheck && pnpm -s i18n-churn-guard && npx eslint src/frontend/components/UI/ThemeSelector/themeLabels.ts src/frontend/customThemes/thumbnailPalette.ts src/frontend/muiTheme.ts src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/components/UI/NavShell/__tests__/appShellLayout.test.ts src/frontend/screens/StoreSearch/__tests__/rowSurfaceTheme.test.ts src/frontend/components/UI/ThemeSelector/__tests__/ThemeGallery.test.tsx src/frontend/components/UI/ThemeSelector/__tests__/index.test.tsx src/frontend/components/UI/ThemeSelector/__tests__/ThemeThumbnail.test.tsx src/frontend/customThemes/__tests__/applyTheme.test.ts src/frontend/customThemes/__tests__/thumbnailPalette.test.ts src/frontend/customThemes/__tests__/customTheme.test.ts src/frontend/__tests__/muiTheme.test.ts && npx prettier --check src/frontend/themes.scss src/frontend/styles/_buttons.scss src/frontend/components/UI/NavShell/components/NavTabs/index.scss src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss src/frontend/screens/Library/components/LibrarySignInNotice/index.scss src/frontend/components/UI/ThemeSelector/themeLabels.ts src/frontend/customThemes/thumbnailPalette.ts src/frontend/customThemes/builtinTokens.generated.json src/frontend/muiTheme.ts meta/i18nCatalogPresenceBaseline.json src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/components/UI/NavShell/__tests__/appShellLayout.test.ts src/frontend/screens/StoreSearch/__tests__/rowSurfaceTheme.test.ts src/frontend/components/UI/ThemeSelector/__tests__/ThemeGallery.test.tsx src/frontend/components/UI/ThemeSelector/__tests__/index.test.tsx src/frontend/components/UI/ThemeSelector/__tests__/ThemeThumbnail.test.tsx src/frontend/customThemes/__tests__/applyTheme.test.ts src/frontend/customThemes/__tests__/thumbnailPalette.test.ts src/frontend/customThemes/__tests__/customTheme.test.ts src/frontend/__tests__/muiTheme.test.ts && test "$(grep -c '^body\.gamelib-light {' src/frontend/themes.scss)" = 1 && test "$(grep -c '"gamelibLight": "GameLib Light"' public/locales/en/gamelib.json)" = 1 && test "$(grep -c 'themeSelector.gamelibLight' meta/i18nCatalogPresenceBaseline.json)" = 1</automated>
    Count gates, measured at HEAD a67027ca4:
    - `^body\.gamelib-light {` in themes.scss [HEAD=0 EXPECT==1 @a67027ca4]
    - `"gamelibLight": "GameLib Light"` in en/gamelib.json [HEAD=0 EXPECT==1 @a67027ca4]
    - `themeSelector.gamelibLight` in i18nCatalogPresenceBaseline.json [HEAD=0 EXPECT==1 @a67027ca4]

    public/locales/en/gamelib.json is prettier-ignored (`--file-info` reports `"ignored": true`), so a `--check` on it would prove nothing and is omitted.
  </verify>
  <done>
GameLib Light is a built-in theme: in defaultThemes, labelled "GameLib Light", in the generated seeds byte-identical to nord-light, and with thumbnail base overrides and the four component overrides carrying the pre-change values. Every contrast census measures it and passes. The theme-count pins read 11. The i18n presence baseline records the new key. nord-light is unchanged. Commit by explicit path only.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Guard test for the palette rule and the GameLib Light pin (RED for nord-light)</name>
  <files>src/frontend/customThemes/__tests__/nordLightPalette.test.ts, src/frontend/customThemes/__tests__/fixtures/nordLightPreChange.json</files>
  <precondition>Task 1 is committed. Using the BASE recorded in Task 1, the comment-stripped (`stripSourceComments`), whitespace-collapsed (`replace(/\s+/g, ' ').trim()`) `cssBlock` body of `body.nord-light` in BASE's themes.scss hashes, by sha256, to 10ab554e9a5929edd5e39f9afc96c412112781e64d2a4d498e36f1b70563c184. Measured at a67027ca4. If BASE differs and the digest differs, use BASE's digest and record why in the SUMMARY.</precondition>
  <behavior>
    - Palette guard, describe "Nord Light uses only the official Nord palette":
      - (a) Every rule in any `.scss`/`.css` under `src/frontend` (excluding `__tests__`) whose selector names `body.nord-light`, followed by neither a word character nor a hyphen, declares only palette colours. The file is read through `stripSourceComments`; the rule body is the brace-matched block after the next `{`.
      - (b) Non-vacuity for (a): the set of files with such rules contains at least `src/frontend/themes.scss`, `src/frontend/styles/_buttons.scss`, the NavTabs and FilterFocusRow `index.scss`, and LibrarySignInNotice `index.scss`.
      - (c) `BASE_PREVIEW_OVERRIDES['nord-light']` has at least one literal, and every literal is palette.
      - (d) Every value of `BUILTIN_TOKENS['nord-light']` is palette, except the exempt `--neutral-04` and `--neutral-05`. The seed has at least 90 entries (94 in the prototype). Neither exempt token is declared in `customProps(cssBlock(themes, 'body.nord-light'))`, so the reason for the exemption stays true.
      - (e) The checker can fail, in memory only. The pre-change fixture fed through (d)'s checker reports `--fav`, among others. A rule body string containing `#ffffff` is flagged by (a)'s checker.
    - Colour rule: first remove custom-property names (`--[\w-]+`). Without this, the `black` in `--eighty-percent-black` counts as a named colour; the prototype hit exactly that. Then match hex literals of 3 to 8 digits, `rgb()`/`rgba()`, and the names white, black, gray and grey. Parse each with `parseColour` from `../colour`. A literal passes when its r, g and b equal one of the 16 official colours; alpha is free. An unparseable literal fails.
    - Pin, describe "GameLib Light is the pre-change Nord Light":
      - (f) `BUILTIN_TOKENS['gamelib-light']` equals the fixture.
      - (g) The sha256 of the comment-stripped, whitespace-collapsed `body.gamelib-light` body equals 10ab554e9a5929edd5e39f9afc96c412112781e64d2a4d498e36f1b70563c184, or BASE's digest per the precondition.
      - (h) The gamelib-light overrides carry the pre-change declarations:
        - the `_buttons.scss` hover rule declares exactly `color: var(--neutral-01, #070a0b)`
        - the NavTabs rule declares `color: var(--accent)`
        - the FilterFocusRow grouped selector includes `body.gamelib-light &` beside dracula
        - LibrarySignInNotice declares `color: #ffb3b8`
    - RED expectation at the end of this task: the pin describe passes in full, and (e) passes. (a), (c) and (d) fail on the current nord-light: (a) and (d) on, for example, #a03a45 and #60697a, and (d) also on #1de8f5. (c) passes already, because #81a1c1 is nord9.
  </behavior>
  <action>
Create `src/frontend/customThemes/__tests__/fixtures/nordLightPreChange.json` from the `"nord-light"` entry of `git show BASE:src/frontend/customThemes/builtinTokens.generated.json`, verbatim, written as 2-space-indented JSON with a trailing newline. It must hold 94 keys and be equal to today's `BUILTIN_TOKENS['nord-light']`.

Create `src/frontend/customThemes/__tests__/nordLightPalette.test.ts`, implementing every behaviour above.
- Imports: `stripSourceComments` from `backend/testUtils/stripSourceComments`; `cssBlock` and `customProps` from `frontend/testUtils/scssTokenSource`; `parseColour` from `../colour`; `BUILTIN_TOKENS` from `../builtinTokens`; `BASE_PREVIEW_OVERRIDES` from `../thumbnailPalette`; `createHash` from `crypto`; `readFileSync` and `readdirSync` from `fs`; the fixture JSON.
- Name the 16 colours nord0 to nord15 in one constant, with a comment citing nordtheme.com.
- Off-palette failures must report as arrays of readable `file: literal` or `[token, value]` entries compared with `toEqual([])`, so a failure names the offender.
- Write a comment above EXEMPT giving the reason: the themeTokens.test.ts census forbids any theme block from redeclaring these two global constants.
- Use exactly these titles, because the verify step filters on them with `-t`: the two describes are "Nord Light uses only the official Nord palette" and "GameLib Light is the pre-change Nord Light", and behaviour (e) is the test "checker can fail, in memory only", inside the palette describe.

This is the RED step. Run the test, confirm the failures listed in the behaviour block and nothing else, then commit with a `test(quick-261122-qwk)` message, staging only these two paths.
  </action>
  <verify>
    <automated>npx jest --runTestsByPath src/frontend/customThemes/__tests__/nordLightPalette.test.ts -t 'GameLib Light is the pre-change Nord Light' && npx jest --runTestsByPath src/frontend/customThemes/__tests__/nordLightPalette.test.ts -t 'checker can fail' && ! npx jest --runTestsByPath src/frontend/customThemes/__tests__/nordLightPalette.test.ts -t 'Nord Light uses only the official Nord palette' && pnpm -s codecheck && npx eslint src/frontend/customThemes/__tests__/nordLightPalette.test.ts && npx prettier --check src/frontend/customThemes/__tests__/nordLightPalette.test.ts src/frontend/customThemes/__tests__/fixtures/nordLightPreChange.json</automated>
  </verify>
  <done>
The guard test exists. The GameLib Light pins pass. The palette describe fails only because nord-light still carries off-palette values, and its checker-can-fail case passes. The fixture equals BASE's nord-light seed. Committed (RED).
  </done>
</task>

<task type="auto">
  <name>Task 3: Rework nord-light to the official Nord palette (GREEN)</name>
  <files>src/frontend/themes.scss, src/frontend/styles/_buttons.scss, src/frontend/components/UI/NavShell/components/NavTabs/index.scss, src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss, src/frontend/screens/Library/components/LibrarySignInNotice/index.scss, src/frontend/customThemes/builtinTokens.generated.json, src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts</files>
  <action>
Apply the "Nord Light palette mapping" section above to `body.nord-light` only. gamelib-light and every other theme must not change; Task 2's pins enforce that.

1. `themes.scss`, the `body.nord-light` block:
   - Set every token in table A to its new value.
   - Add the table C declarations, grouped with a blank line between brand, neutral/scrim/gradient, and status groups.
   - Change the two table B literals.
   - Append the nested `.mainInfoBody` rule from table B as the block's last nested rule, with a one-line comment: 50% because the shared 60% mix reads 4.31 with nord12 and nord0, under the 4.5 Hide-toggle floor.
   - Put a short comment at the top of the block: nord-light uses only the 16 official Nord colours, per quick 261122-qwk; `nordLightPalette.test.ts` guards it; --neutral-04 and --neutral-05 are the only exemption.
   - Rewrite the `--navbar-active-background` trailing comment to say the active row is darker than the nord3 bar.
   - Do not declare --neutral-04 or --neutral-05.

2. Component overrides, table D:
   - In `_buttons.scss`, the nord-light `.button.is-text:hover` rule's colour becomes `var(--text-default)`. Its comment block currently says --neutral-01 measures 5.13:1 for both themes and that nord-light's base reads 3.36:1. Rewrite only the nord-light facts: the base nord6 on the nord9 hover reads 2.34:1, and the override (nord0) reads 4.64:1. Add that gamelib-light keeps the pre-change rule. Keep the nord-dark facts.
   - In `LibrarySignInNotice/index.scss`, the nord-light expired-icon colour becomes `#ebcb8b`. Update the adjacent comment numbers: nord13 reads 4.72:1 on the nord3 banner, and no palette red clears 3:1 there. gamelib-light keeps its value.
   - In the NavTabs and FilterFocusRow comments, update only the nord-light hex and ratio statements that are now false:
     - NavTabs: --accent is nord1 at 8.73:1; --navbar-active is nord8.
     - FilterFocusRow: the divider resolves to nord6 on nord3 at 6.40:1.
     Leave the history.

3. Run `pnpm gen:theme-tokens`. Only the `nord-light` entry may change; check with `git diff --stat` and a JSON diff of the other ten entries.

4. `themeTokens.test.ts`, the two edits the prototype needed:
   - In the pure `.is-text` HOVER "load-bearing" test, the nord-light `preFixRatios` value becomes 2.3354075448387865, which is nord6 on nord9. The gamelib-light value from Task 1 stays 3.356770572062584. Add a one-line comment saying which pair each is.
   - In the left-card Hide-toggle describe, `leftScopeFor` must also apply the custom properties of a nested `.mainInfoBody` rule inside the theme's own block. Iterate `allBlocksFor(themesScss, selector)` and the file's existing module-level `nestedRules` helper; take the rule whose selector is exactly `.mainInfoBody`, apply its `customProps` last, and comment why: `body.<theme> .mainInfoBody` outranks `.mainInfoBody`. The existing non-vacuity test, which wants exactly one top-level `.mainInfoBody {` in LeftCard, and the sabotage test, which wants exactly one `60%` in LeftCard, stay as they are. Both still hold.

   Do not change any floor, threshold or other expected value. If a gate fails with a value you chose, pick another palette colour from the mapping's options and record the change in the SUMMARY.

5. Run `npx prettier --write` over this task's prettier-visible paths, which is all of them. Then run `graphify update .`; it is AST-only, writes the gitignored graphify-out, and nothing from it is committed.

6. The SUMMARY records:
   - BASE
   - the final mapping, if it differs from the table
   - the trade-offs listed under the mapping section
   - the decision not to migrate stored `nord-light` users
   - which component `color-mix()` derivations still compute non-palette colours
  </action>
  <verify>
    <automated>pnpm -s gen:theme-tokens --check && npx jest --runTestsByPath src/frontend/customThemes/__tests__/nordLightPalette.test.ts src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/components/UI/NavShell/__tests__/appShellLayout.test.ts src/frontend/screens/StoreSearch/__tests__/rowSurfaceTheme.test.ts src/frontend/customThemes/__tests__/builtinTokens.test.ts src/frontend/customThemes/__tests__/thumbnailPalette.test.ts src/frontend/customThemes/__tests__/customTheme.test.ts src/frontend/customThemes/__tests__/applyTheme.test.ts src/frontend/customThemes/__tests__/contrastFloors.test.ts src/frontend/components/UI/ThemeSelector/__tests__/ThemeThumbnail.test.tsx src/frontend/components/UI/ThemeSelector/__tests__/ThemeGallery.test.tsx src/frontend/components/UI/ThemeSelector/__tests__/index.test.tsx src/frontend/state/__tests__/customThemesState.test.ts src/frontend/styles/__tests__/focusIndicator.test.ts src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts src/frontend/screens/DownloadManager/__tests__/downloadManagerLayout.test.ts src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts src/frontend/components/UI/RedeemSteamKeyDialog/__tests__/redeemSteamKeyDialogStylesheet.test.ts src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts && pnpm -s codecheck && npx eslint src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/customThemes/__tests__/nordLightPalette.test.ts && npx prettier --check src/frontend/themes.scss src/frontend/styles/_buttons.scss src/frontend/components/UI/NavShell/components/NavTabs/index.scss src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss src/frontend/screens/Library/components/LibrarySignInNotice/index.scss src/frontend/customThemes/builtinTokens.generated.json src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts</automated>
  </verify>
  <done>
nord-light declares only official Nord colours, or alpha forms of them, in its block, its scoped overrides and its thumbnail literal. Its resolved seed is palette except the two exempt globals. The guard test is fully green. gamelib-light is byte-for-byte the pre-change nord-light. Every themes.scss-reading gate passes with no floor lowered. Committed by explicit path only.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| stored `theme` config value to body class | A stored key is either a built-in or a custom theme CSS filename (`window.setTheme`). `gamelib-light` becomes a built-in key |
| custom theme copies to base theme | A copy stores its own token seed, while its base's nested rules come from the base's live CSS |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-qwk-01 | Spoofing | themeLabels.ts defaultThemes | low | accept | A custom theme file literally named `gamelib-light` would now be shadowed by the built-in. That needs a hand-placed file with exactly that name; the built-in renders a valid theme, so the app is never left blank |
| T-qwk-02 | Tampering | existing custom copies with base `nord-light` | low | accept | Their stored tokens are unchanged, but the base's nested rules (for example `.button.is-success` #81a1c1) follow the reworked nord-light. That is intended, since the base is the live theme. The SUMMARY records it so the operator can judge |
| T-qwk-03 | Repudiation | a contrast gate silently weakened to fit the palette | medium | mitigate | The plan forbids changing any floor or threshold. The only themeTokens edits are the enumerations, a measured pre-fix ratio for the new base pair, and leftScopeFor learning about a nested theme rule. Each one is named in Task 1 and Task 3 |
| T-qwk-SC | Tampering | npm/pip/cargo installs | high | accept | No package is installed by this plan. If one is ever added, the package-legitimacy gate applies, with a blocking human checkpoint |
</threat_model>

<verification>
- `pnpm -s gen:theme-tokens --check` reports the seeds up to date.
- The guard test `src/frontend/customThemes/__tests__/nordLightPalette.test.ts` is green, and it was RED in its own commit (Task 2) before the palette rework.
- `npx jest --selectProjects Frontend` passes. Before blaming anything on this task, compare any failure against a run at BASE: the 3 suites that need git and `.planning` passed in the live tree during planning.
- `meta/__tests__/lintTranslations.test.ts` and `pnpm -s i18n-churn-guard` are clean.
- `pnpm -s codecheck` is clean. If it fails only in src/backend files owned by the concurrent Phase 85 executor, record that in the SUMMARY; do not fix it here.
- No live UI check is required from the executor. The operator will look at both themes live.
</verification>

<success_criteria>
- GameLib Light is selectable and is today's Nord Light: token seed equal, block body digest equal, overrides equal.
- Nord Light declares only the 16 official Nord colours, or alpha forms of them, everywhere it is scoped, and every token it resolves is palette except the two documented globals.
- A guard test enforces both properties going forward.
- No contrast floor lowered; every theme gate is green for 11 themes.
- Commits contain only this task's files.
</success_criteria>

<output>
Create `.planning/quick/261122-qwk-copy-nord-light-as-new-gamelib-light-the/261122-qwk-SUMMARY.md` when done.
</output>
