---
phase: quick-261123-pnl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
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
autonomous: true
requirements:
  - D-01
  - D-02
  - D-03
  - D-04
  - D-05

estimate:
  tokens: 100000
  raw_tokens: 100000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "D-01: in GameLib Light the top bar and the tier-2 panel are light (#e5e9f0). Inactive labels are #4c566a (6.06:1 on the bar), the active row is #d8dee9 with #2e3440 labels (9.25:1), and a 1px var(--neutral-04) seam runs under the top bar everywhere except beneath the selected tab. That is the same token as the tier-2 panel's existing ::after edge"
    - "D-01: nothing on the chrome still paints a light-on-dark colour. The version label, the back-button glyph, OSK button borders, the sign-in banner triangle and the context-menu hover all read against the light bar"
    - "D-02: every action fill is #4c6f99 with hover #3f5f86 and a white label (5.20:1 and 6.58:1). That covers game-page Play (.is-success), Install (.is-secondary), the installed .is-primary button, the plain .button, the recently played tile's Play pill and circle, the download circle and the game-page progress bar"
    - "D-03: green appears only as success status, as text #2f6b4b (5.48:1 on the page, 5.19:1 on the bar, 4.67:1 on inputs) and on the three status-only fills (Settings saved dot, SystemInfo meter, Discounts badge). No Play control is green"
    - "D-04: tertiary buttons, the game-card icon row, genre pills and the login runner block are neutral greys with dark text, and log text is the default text colour"
    - "D-05: every other theme is byte-identical. themes.scss outside the gamelib-light block and every seed but gamelib-light in builtinTokens.generated.json match HEAD, and nord-light's rules in the shared stylesheets are untouched"
    - "D-05: every theme gate passes at its existing floor, and no floor value or threshold is lowered"
  artifacts:
    - path: src/frontend/themes.scss
      provides: "the reworked body.gamelib-light block: light chrome tokens, one accent family, status-text green, neutral greys, re-paired nested rules"
    - path: src/frontend/customThemes/builtinTokens.generated.json
      provides: "the regenerated gamelib-light seed (only that key differs from HEAD)"
    - path: src/frontend/customThemes/__tests__/nordLightPalette.test.ts
      provides: "the new GameLib Light pin (palette, contrast pairs, re-paired rules) replacing the verbatim sha256 pin"
    - path: src/frontend/customThemes/thumbnailPalette.ts
      provides: "BASE_PREVIEW_OVERRIDES and BASE_OVERRIDDEN_TOKENS without a gamelib-light entry"
  key_links:
    - from: src/frontend/themes.scss
      to: src/frontend/customThemes/builtinTokens.generated.json
      via: "pnpm gen:theme-tokens flattens the block into the gamelib-light seed"
    - from: src/frontend/themes.scss
      to: src/frontend/screens/Library/components/GameCard/index.css
      via: ".playIcon re-scopes --success/--success-hover to the accent, which .playIcon > span and .playIcon circle read"
    - from: src/frontend/themes.scss
      to: src/frontend/styles/_buttons.scss
      via: "--success-button, --secondary-button, --brand-primary and --text-tertiary feed .button.is-success / .is-secondary / .is-primary and the base .button label"
    - from: src/frontend/customThemes/thumbnailPalette.ts
      to: src/frontend/components/UI/ThemeSelector/ThemeThumbnail.tsx
      via: "with no gamelib-light base override the thumbnail draws the generic token chains"
---

<objective>
Rework the built-in "GameLib Light" theme into a clean light interface. All of the work goes into the `body.gamelib-light` block in src/frontend/themes.scss, plus the few gamelib-light-scoped rules that already live in shared stylesheets. The user locked five decisions:

- **D-01 Whole chrome light.** The top bar and the tier-2 left panel go light. Both share `--navbar-background`, so token values change, a seam is added under the top bar, and every block-local rule that assumed dark chrome is re-paired.
- **D-02 One accent.** `#4c6f99` (hover `#3f5f86`, white label) is used for every action: primary, install, secondary, success/Play, accent, link hover, focus ring, tile Play, the download circle and the progress bar.
- **D-03 Dark green becomes accent where it fills a control.** `--success` splits into a status-text green, and the Play fills are re-scoped to the accent.
- **D-04 Neutral greys** for tertiary buttons, the icon row, genre pills, the runner block and log text.
- **D-05 Scope.** Only gamelib-light changes. nord-light and every other theme stay byte-identical. Tests are updated honestly and never weakened.

Purpose: the user wants GameLib Light to read as one calm light UI. Today it is a dark Nord bar over a light page, with purple, cyan and teal action fills and a dark-green Play pill.

Output: the reworked block, the forced shared-rule edits, the regenerated token seed, a GameLib Light pin that replaces the verbatim pin, and the thumbnail and census tests re-pointed at the new palette.

Every ratio quoted in this plan was computed (WCAG relative luminance), not guessed. Notable thin margin: the accent on the page (#eceff4) is 4.5086:1, which clears 4.5 by a hair. It is locked by the user, so never let accent-coloured text sit on the bar (#e5e9f0, 4.27:1) or on inputs (#d8dee9, 3.85:1). Hover and link-hover text on the chrome uses `--primary-hover` (5.40:1) instead.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

Project skills loaded for planning: `gamelib-conventions` (formatter check in every `<verify>`) and `sketch-findings-gamelib` (multi-theme survival: active states and dividers are defined relationally, never as "the bar is the dark band").

**Working tree is dirty with unrelated work** (.planning/**, a root-level `Schedule I Free Sample.dxvk-cache`, and possibly src/backend/** or src-tauri/**). EVERY commit in this plan stages ONLY the paths listed in that task's `<files>`, with `git add -- <path> ...`. Never `git add -A`, `git add .`, `git commit -a`, or a gsd-tools commit without `--files`. Before each commit, `git diff --cached --name-only` must list exactly that task's files.

**Baseline measured at HEAD 944510a9f (planning time):** these six suites run in about 1 s and all pass (492 tests): `npx jest --runTestsByPath` over nordLightPalette, thumbnailPalette, customTheme, builtinTokens, themeTokens, ThemeThumbnail. `pnpm -s gen:theme-tokens --check` reports up to date. Every path this plan writes reports `"ignored": false` under `npx prettier --file-info` (the scss, ts, tsx and the generated json alike), so every `<verify>` carries a real scoped `npx prettier --check`. The generated json is prettier-clean at HEAD. The byte-identity one-liners (Task 1) and the contrastFloors.ts diff guard (Task 2) are pinned to 944510a9f, not HEAD, so they stay meaningful after the task commits land. The last commit to touch themes.scss, the seed or contrastFloors.ts before that is 4471acdc0. If `git log 944510a9f..HEAD` shows another commit touching those three files before Task 1 starts, stop and re-pin to the commit just before Task 1.

**The tasks share one token change, so suites go red in between, by design.** All three tasks run in one session, and the suite is fully green only after Task 3. The expected-red ledger is below. Anything red that is NOT on it is a real defect: fix the palette value, never the floor.
- After Task 1: themeTokens.test.ts (the live-verdict row and the pure .is-text HOVER override census), thumbnailPalette.test.ts ("pins the overrides to the gamelib-light rules in themes.scss") and customTheme.test.ts (D-09).
- After Task 2: thumbnailPalette.test.ts and customTheme.test.ts only.
- After Task 3: nothing.

**Final palette (Claude's discretion items are marked *disc*):**

| token | HEAD | new | why / measured |
|---|---|---|---|
| --navbar-background | #4c566a | #e5e9f0 | D-01 |
| --navbar-active-background | #60697a | #d8dee9 | D-01 (now darker than the bar) |
| --navbar-inactive | #ffffff | #4c566a | D-01, 6.06:1 on bar |
| --navbar-active | #d0ddff | #2e3440 | D-01, 9.25:1 on active row, 10.84:1 on page |
| --navbar-accent | #81a1c1 | #2e3440 | D-01, 10.26:1 on bar |
| --brand-text-01 | #e0f9ff | #2e3440 | D-01 audit. Paints HeroicVersion on the bar (10.26:1) and WarningMessage / Settings defaults-hint on --status-danger #f97881 (4.78:1, was 2.39:1) |
| --status-default-hover | (global rgb(197,197,197)) | #2e3440 (new decl) | D-01. Game-page back glyph on the #e5e9f0 square, where the global grey is about 1.4:1. Same re-pair nord-light made |
| --osk-button-border | var(--navbar-background) | var(--navbar-inactive) | D-01 audit (the border would vanish into #d8dee9 keys) |
| --text-hover | #5e81ac | var(--primary-hover) | *disc*, D-02 link hover. NavTabs hover/focus and NavItem hover on the bar go from 3.31:1 to 5.40:1 |
| --primary / --primary-hover | #b48ead / #a17399 | #4c6f99 / #3f5f86 | D-02 |
| --brand-primary / --brand-primary-hover | (global cyan #1de8f5) | var(--primary) / var(--primary-hover) (new decls) | D-02. `.button.is-primary` fills with --brand-primary (_buttons.scss:50), so without this the installed-game button stays cyan. Also reaches the Download fills, AddGameButton and the tour, as nord-light's redeclaration does |
| --accent | #30444a | var(--primary) | D-02 (focus ring, search outline, link hover, tour bullet). 4.5086:1 on the page |
| --accent-overlay | #81a1c1 | var(--primary-hover) | D-02 |
| --secondary-button | #15a3e0 | var(--primary) | D-02 (Install) |
| --success-button | #3687a9 | var(--primary) | D-02 (Play) |
| --install-button | var(--primary) | unchanged | D-02 |
| --status-success-hover | #5e81ac | var(--primary-hover) | D-02 |
| --text-tertiary | var(--brand-text-01) | #ffffff | D-02. Label on accent fills: 5.20:1 on #4c6f99, 6.58:1 on #3f5f86. Must be decoupled from --brand-text-01, which goes dark |
| --tour-bullet-inactive | var(--accent-overlay) | var(--navbar-inactive) | *disc*. Otherwise the inactive bullet would be darker than the active one |
| --success | #3e532d | #2f6b4b | D-03 status text: 5.48:1 page, 5.19:1 bar, 4.67:1 input. #33704f was considered and rejected: it is 4.35:1 on inputs |
| --success-hover | #617550 | #245238 | D-03, 7.79:1 on the page (the old value was 4.37:1) |
| --tertiary-button | #6f738f | #d8dee9 | D-04 |
| --tertiary-button-overlay | (body default = orange --status-warning-hover) | #c8d0dc (new decl) | D-04 hover, text-default on it 10.01:1 |
| --icons-background | #6f738f | #d8dee9 | D-04 (the accent Play/download circles read 3.85:1 on it) |
| --neutral-03 | #429ec5 | #b8c2d1 | *disc*, D-02/D-04. Today it paints CYAN 1px borders on the game page's .mainInfo/.extraInfo cards (GamePage/index.css:103, :204, :306), which would be a second accent beside #4c6f99. #b8c2d1 is a soft neutral card edge at 1.56:1 on the page. Redeclaring --neutral-03 is allowed (only -04/-05 are forbidden) |
| --text-log | var(--status-warning) | var(--text-default) | D-04 |

All other declarations in the block keep their values (--background-light, --fav, --danger, --text-title, --text-default, --text-secondary, --input-background, --neutral-06, --status-warning, --gamecard-title-color, --action-icon, the tour popup tokens, gradients, modal and OSK backgrounds).
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: GameLib Light repaints end to end, from the block tokens through the regenerated seed to a new palette pin (D-01, D-02, D-03, D-04, D-05)</name>
  <files>src/frontend/customThemes/__tests__/nordLightPalette.test.ts, src/frontend/themes.scss, src/frontend/customThemes/builtinTokens.generated.json, src/frontend/styles/_buttons.scss, src/frontend/screens/Library/components/LibrarySignInNotice/index.scss</files>
  <read_first>
    - src/frontend/themes.scss lines 429-585 (the whole body.gamelib-light block plus the comment above it). Also lines 655-670 for how nord-light redeclares --brand-primary, and lines 1-12 for the body default that sets --tertiary-button-overlay
    - src/frontend/customThemes/__tests__/nordLightPalette.test.ts (whole file, 446 lines). The describe "GameLib Light is the pre-change Nord Light" is the one being replaced. The three nord-light describes stay byte-identical
    - src/frontend/styles/_buttons.scss lines 1-60 and 195-245 (base .button label, .is-primary fill, the .is-tertiary rules at 77-86, and the .button.is-text:hover theme overrides)
    - src/frontend/screens/Library/components/LibrarySignInNotice/index.scss lines 100-132
    - src/frontend/screens/Library/components/GameCard/index.css lines 790-855 (.playIcon / .downIcon) and src/frontend/screens/Game/GamePage/index.css lines 1, 44-66, 286-296, 750-776 (.gameConfigContainer root, back button, progress bar, settings square)
  </read_first>
  <behavior>
    RED first. Replace the describe "GameLib Light is the pre-change Nord Light" in nordLightPalette.test.ts with a describe "GameLib Light is a light-chrome, one-accent theme (261123-pnl)". It reads `BUILTIN_TOKENS['gamelib-light']` and the stripped themes.scss block via the file's existing `cssBlock`, `customProps`, `collapse` and `contrastRatio` helpers, and asserts:
    - Chrome (D-01): --navbar-background #e5e9f0, --navbar-active-background #d8dee9, --navbar-inactive #4c566a, --navbar-active #2e3440, --navbar-accent #2e3440, --brand-text-01 #2e3440, --status-default-hover #2e3440. Contrast: navbar-inactive, navbar-accent and brand-text-01 each ≥ 4.5 on --navbar-background; navbar-active ≥ 4.5 on --navbar-active-background; status-default-hover ≥ 3 on --navbar-background. The block's nested `.NavShell__navbar` rule sets `border-bottom-color: var(--neutral-04);`.
    - One accent (D-02): --primary #4c6f99 and --primary-hover #3f5f86. --accent, --install-button, --secondary-button, --success-button and --brand-primary each equal --primary. --accent-overlay, --brand-primary-hover, --status-success-hover and --text-hover each equal --primary-hover. --text-tertiary is #ffffff and reads ≥ 4.5 on both --primary and --primary-hover. --accent reads ≥ 4.5 on --body-background.
    - Green is status text only (D-03): --success #2f6b4b reads ≥ 4.5 on each of --body-background, --navbar-background and --input-background. --success-hover reads ≥ 4.5 on --body-background. The collapsed block contains `.playIcon { --success: var(--accent); --success-hover: var(--primary-hover); }` and `.gameConfigContainer .MuiLinearProgress-root { --success: var(--accent); }`. The block has no line-start nested `button.is-primary {` rule and no nested `.button.is-success {` rule (search with an `m`-flag line-start regex, as thumbnailPalette.test.ts already does).
    - Neutral greys (D-04): --tertiary-button #d8dee9, --tertiary-button-overlay #c8d0dc, --icons-background #d8dee9, --neutral-03 #b8c2d1, and --text-log equal to --text-default. Nested rules are `.genre { background: #e5e9f0 !important; color: #2e3440 !important; }`, `.runnerIcon { background: var(--input-background); }` and `.button.is-tertiary:not(:disabled) { color: var(--text-default); }`.
    - Dark-chrome assumptions re-paired (D-01): `.gameCard > .gameCardStatus { color: #d0ddff; --success: var(--status-success); }`, `.heroicVersion:hover { color: var(--primary-hover); }`, the context-menu item hover `background-color: #c8d0dc;` and `.introjs-nextbutton { color: var(--text-tertiary); }`. --osk-button-border equals --navbar-inactive. The block declares no nested `.button.is-link` rule and no nested `.currentDownload` rule.
    - Shared-file gamelib-light rules (D-05): the comment-stripped _buttons.scss contains no gamelib-light-scoped selector. The LibrarySignInNotice triangle override `cssBlock(notice, 'body.gamelib-light &')` collapses to `color: var(--danger);`, and --danger reads ≥ 3 on --navbar-background. NavTabs' gamelib-light override still collapses to `color: var(--accent);`. FilterFocusRow still groups dracula, nord-light and gamelib-light.
    Also remove what only the old describe used (the sha256 constant, the `sha256` helper and the `createHash` import). Keep the `preChange` fixture import, because the nord-light "checker can fail" test still uses it. Rewrite property 2 of the file header to describe the new GameLib Light. Run the file and confirm the new describe FAILS before any CSS changes.
  </behavior>
  <action>
    Order: write the RED describe (see behavior) and run it to failure. Then do GREEN in themes.scss, _buttons.scss and LibrarySignInNotice. Then regenerate the seed.

    themes.scss, inside the body.gamelib-light block only (D-05):
    1. Apply every token change in the context table, per D-01/D-02/D-03/D-04. Put the new declarations (--status-default-hover, --brand-primary, --brand-primary-hover, --tertiary-button-overlay) next to their families. Use var() references where the table says so, for example --accent: var(--primary). Fix the inline comment on --navbar-active-background, which says "lighter than", to say the active row is now one step darker than the light bar.
    2. Add a nested rule on `.NavShell__navbar` that sets `border-bottom-color: var(--neutral-04)`, per D-01. Why: the top bar (#e5e9f0) against the page (#eceff4) is a 1.06:1 step, so the bar-to-page edge disappears. NavShell/index.scss:168 paints that border in --body-background by design. The selected tab's own body-coloured bottom border, offset by top: 1px in NavTabs, erases it beneath the active tab. With a visible colour the seam shows everywhere except under the active tab, which is the card/folder look. --neutral-04 is the token the tier-2 panel's ::after edge already uses (NavShell/index.scss:54), so the L-shaped chrome edge is one colour. Do NOT edit NavShell/index.scss.
    3. Re-pair the nested rules:
       - delete the `button.is-primary` label rule (labels come from .button's --text-tertiary, now white)
       - delete the `.button.is-success` fill/label override (Play now fills from --success-button)
       - replace the `.playIcon circle` mint fill with a `.playIcon` rule that re-scopes --success to var(--accent) and --success-hover to var(--primary-hover), per D-03. GameCard/index.css then paints the recently played tile pill, its hover, the circle and the circle hover in the accent without being edited. This follows the block's existing token re-scope pattern
       - delete the `.downIcon circle` fill (the base rule fills it with --accent and hovers to --accent-overlay)
       - add `.gameConfigContainer .MuiLinearProgress-root` re-scoping --success to var(--accent), so the game-page progress bar (GamePage/index.css:295) is accent, per D-02/D-03
       - delete the `.button.is-link` colour override (the base --text-default is right on every light surface)
       - delete the `.currentDownload` rule. First confirm no frontend stylesheet or component names that class, by grepping src/frontend for it outside themes.scss. At planning time the only other hits were src/backend variable names
       - change `.heroicVersion:hover` to var(--primary-hover) (5.40:1 on the bar; the base label is now --brand-text-01 #2e3440, so --navbar-active would give no hover change)
       - change the context menu's MuiMenuItem hover background from var(--navbar-accent), which is now dark, to #c8d0dc
       - change `.gameCard > .gameCardStatus` to `color: #d0ddff` plus `--success: var(--status-success)`. It sits on the dark artwork gradient, so it keeps today's light label (13.48:1) and its svg icon turns mint instead of the dark status green
       - add `.introjs-nextbutton` with color var(--text-tertiary), because the tour's --brand-primary fill is now accent and Tour.scss's near-black label would read 3.82:1
       - add `.button.is-tertiary:not(:disabled)` with color var(--text-default). It wins over both .is-tertiary and .is-tertiary:hover, and the :not(:disabled) keeps the global disabled label
       - change `.genre` to background #e5e9f0 and color #2e3440, both still !important
       - change `.runnerIcon` to var(--input-background)
       - keep every other nested rule as it is
    4. Rewrite the one-line comment above the block: GameLib Light is GameLib's own light theme (quick 261123-pnl), with light chrome, one #4c6f99 accent and green only as status text. It began as the pre-261122-qwk nord-light, and nordLightPalette.test.ts pins it.

    _buttons.scss (D-02, D-05): inside .button.is-text:hover, delete the gamelib-light-scoped hover label override and the two-line comment introducing it. Why: the base label --background #eceff4 reads 5.71:1 on the new #3f5f86 hover fill, while the near-black override would read 3.02:1 and fail. In the long comment above (lines 201-222), fix the two sentences that say gamelib-light keeps the pre-change palette or rule. State the new fact in one sentence: gamelib-light (261123-pnl) needs no override, 5.71:1. Leave the nord-light and nord-dark overrides byte-identical.

    LibrarySignInNotice/index.scss (D-01, D-05): change the gamelib-light expired-triangle override from the light pink tint to var(--danger). Measured: on the new #e5e9f0 banner the pink reads 1.39:1, while --danger #bf616a reads 3.36:1 against the 3:1 non-text floor, and the triangle stays red. In the comment block, rewrite the gamelib-light sentences (which call it the mid-grey #4c566a banner and say it keeps the pink tint) to the new measurement. Leave the nord-light rule and its sentences unchanged.

    Regenerate with `pnpm gen:theme-tokens`. Never hand-edit the json. Then stage exactly this task's five files by explicit path and commit, for example "feat(261123-pnl): GameLib Light light chrome and one accent". Task 2 and Task 3 fix the expected reds from the context ledger.
  </action>
  <verify>
    <automated>pnpm -s gen:theme-tokens --check && npx jest --runTestsByPath src/frontend/customThemes/__tests__/nordLightPalette.test.ts src/frontend/customThemes/__tests__/builtinTokens.test.ts && node -e "const {execSync:x}=require('child_process');const fs=require('fs');const cut=s=>{const i=s.indexOf('body.gamelib-light {');if(i<0)throw new Error('no block');const p=s.lastIndexOf('}',i)+1;let d=0,j=s.indexOf('{',i);for(;j<s.length;j++){if(s[j]=='{')d++;else if(s[j]=='}'&&--d==0)break}return s.slice(0,p)+s.slice(j+1)};const a=cut(x('git show 944510a9f:src/frontend/themes.scss').toString()),b=cut(fs.readFileSync('src/frontend/themes.scss','utf8'));if(a!==b){console.error('themes.scss changed outside the gamelib-light block');process.exit(1)}console.log('themes.scss identical outside the gamelib-light block')" && node -e "const {execSync:x}=require('child_process');const a=JSON.parse(x('git show 944510a9f:src/frontend/customThemes/builtinTokens.generated.json'));const b=JSON.parse(require('fs').readFileSync('src/frontend/customThemes/builtinTokens.generated.json','utf8'));const bad=Object.keys({...a,...b}).filter(k=>k!=='gamelib-light'&&JSON.stringify(a[k])!==JSON.stringify(b[k]));if(bad.length){console.error('seeds changed:',bad);process.exit(1)}console.log('only the gamelib-light seed differs')" && test "$(grep -v '^\s*//' src/frontend/customThemes/__tests__/nordLightPalette.test.ts | grep -cE 'toBeGreaterThanOrEqual\((3|4\.5)\)')" -gt 7 && npx eslint src/frontend/customThemes/__tests__/nordLightPalette.test.ts && npx prettier --check src/frontend/customThemes/__tests__/nordLightPalette.test.ts src/frontend/themes.scss src/frontend/customThemes/builtinTokens.generated.json src/frontend/styles/_buttons.scss src/frontend/screens/Library/components/LibrarySignInNotice/index.scss</automated>
    Both node identity one-liners were run at HEAD 944510a9f during planning, and each printed its ok line (they are guards that must keep printing it). Floor-assertion lines in nordLightPalette.test.ts: [HEAD=7 EXPECT>7 @944510a9f]. All 7 are in the nord-light describes, which stay, and the new GameLib Light describe adds its own.
  </verify>
  <done>The new GameLib Light describe failed before the CSS edits and passes after them. All nord-light describes pass unchanged. gen:theme-tokens --check reports up to date. themes.scss outside the gamelib-light block and every seed but gamelib-light are byte-identical to HEAD. eslint and scoped prettier are clean. The commit contains exactly the five listed files. Only the reds in the context ledger remain.</done>
</task>

<task type="auto">
  <name>Task 2: Cross-theme census re-pointed at the new GameLib Light, with no floor lowered (D-02, D-05)</name>
  <files>src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts, src/frontend/components/UI/NavShell/components/NavTabs/index.scss, src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss</files>
  <read_first>
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts. The file is 3498 lines, so read ONLY lines 1-40 (imports), 55-85 (theme list and header note), 1146-1160, 1340-1376 (the live-verdict test) and 2995-3115 (the pure .is-text HOVER family). Use grep for anything else
    - src/frontend/components/UI/NavShell/components/NavTabs/index.scss lines 270-320
    - src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss lines 60-95
    - src/frontend/customThemes/__tests__/fixtures/nordLightPreChange.json (frozen pre-change seed: --text-default #20242c, --navbar-background #4c566a)
  </read_first>
  <action>
    themeTokens.test.ts (D-05; update expectations to the shipped truth and keep every threshold):
    1. Header note near line 65: gamelib-light began as the pre-261122-qwk nord-light, and since quick 261123-pnl it is its own light-chrome, one-accent palette.
    2. "the pre-fix pair reproduces the operator's live verdicts". The gamelib-light 'fail' row no longer reproduces anything: its bar is #e5e9f0, where #20242c reads 12.77:1, and no shipped theme still carries the palette the operator judged. Keep the three 'pass' rows exactly. Measure the 'fail' row in memory from the frozen pre-change seed: import fixtures/nordLightPreChange.json (via the baseUrl path frontend/customThemes/__tests__/fixtures/nordLightPreChange.json), take its --text-default and --navbar-background (2.11:1), and assert the same 4.5 pass/fail verdict object. Rewrite the in-test comment to say so. The 4.5 threshold stays.
    3. Pure .is-text HOVER family. Task 1 removed gamelib-light's hover override from _buttons.scss. Re-point the expectations: the override themes become nord-light and nord-dark (in the load-bearing test, the does-not-regress filter and both test titles); toHaveLength(3) becomes 2; drop the gamelib-light `.replace(...)` arm and its preFixRatios entry. Add one comment line: gamelib-light needs no override, because #eceff4 on #3f5f86 reads 5.71:1. The per-theme 4.5 it.each already gates it. Do not touch the nord-light or nord-dark ratios or the 4.5 floor.
    4. Run the whole file. Any OTHER failure here is a palette defect from Task 1. Fix the value in the themes.scss block (Task 1's file; stage it in this commit only if you had to change it) and never the census. The planner pre-computed: selected NavTab label 4.5086, border-color 3.43, FocusRow divider 6.06, sign-in row 6.06 / dismiss 10.26 / triangle 3.36, .is-text base 4.5086, Phase 100 switch track and knob 4.5086, and --fav 5.72.

    NavTabs/index.scss and FilterFocusRow/index.scss: comment-only truth fixes (D-05); no declaration changes. In NavTabs, the comment sentences saying gamelib-light is the verbatim pre-change copy and keeps the pre-change hexes become: gamelib-light (261123-pnl) keeps the override, and its --accent #4c6f99 reads 4.51:1 on #eceff4. In FilterFocusRow, the sentences calling gamelib-light the pre-change nord-light that keeps the 7.38 become: the chain now resolves to #4c566a on the #e5e9f0 panel, 6.06:1, and the override is kept because the census pins the three-theme set. Leave every nord-light and dracula sentence and rule byte-identical.

    Stage exactly this task's files by explicit path and commit (for example "test(261123-pnl): theme census follows the new GameLib Light").
  </action>
  <verify>
    <automated>npx jest --runTestsByPath src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/customThemes/__tests__/nordLightPalette.test.ts && test "$(grep -v '^\s*//' src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts | grep -cE 'ratio >= (3|4\.5)|toBeGreaterThanOrEqual\((3|4\.5)\)')" -ge 16 && git diff --quiet 944510a9f -- src/frontend/customThemes/contrastFloors.ts && npx eslint src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts && npx prettier --check src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/components/UI/NavShell/components/NavTabs/index.scss src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss</automated>
    Floor-assertion lines in themeTokens.test.ts (non-comment lines matching ratio >= 3|4.5 or toBeGreaterThanOrEqual(3|4.5)): [HEAD=16 EXPECT>=16 @944510a9f GUARD MUTATION: deleting any one per-theme floor arm, for example a `passes: ratio >= 4.5` line, drops it to 15]. The `git diff --quiet` arm is an exit-status guard: contrastFloors.ts must be unchanged against HEAD.
  </verify>
  <done>themeTokens.test.ts passes in every theme at the unchanged floors (count still 16; contrastFloors.ts untouched). The live-verdict fail row is measured from the frozen pre-change seed. The .is-text hover census names nord-light and nord-dark only. The NavTabs and FilterFocusRow comments tell the truth, with no declaration changed. The commit contains only this task's files.</done>
</task>

<task type="auto">
  <name>Task 3: The theme gallery thumbnail and seed tests follow the new GameLib Light, then a full sweep (D-02, D-05)</name>
  <files>src/frontend/customThemes/thumbnailPalette.ts, src/frontend/customThemes/__tests__/thumbnailPalette.test.ts, src/frontend/components/UI/ThemeSelector/__tests__/ThemeThumbnail.test.tsx, src/frontend/customThemes/__tests__/customTheme.test.ts</files>
  <read_first>
    - src/frontend/customThemes/thumbnailPalette.ts lines 60-100 (BASE_PREVIEW_OVERRIDES, BASE_OVERRIDDEN_TOKENS and their doc comments)
    - src/frontend/customThemes/__tests__/thumbnailPalette.test.ts lines 1-30 and 115-215
    - src/frontend/components/UI/ThemeSelector/__tests__/ThemeThumbnail.test.tsx lines 55-85
    - src/frontend/customThemes/__tests__/customTheme.test.ts lines 215-233
    - the regenerated gamelib-light object in src/frontend/customThemes/builtinTokens.generated.json
  </read_first>
  <action>
    thumbnailPalette.ts (D-02, D-05): Task 1 deleted the two nested gamelib-light button rules the thumbnail used to mirror (the primary label and the success fill and label), so remove the 'gamelib-light' entry from BASE_PREVIEW_OVERRIDES and from BASE_OVERRIDDEN_TOKENS. Rewrite the doc comment, which says Nord Light's and GameLib Light's rules, so that only Nord Light is named. Its Play, primary and secondary buttons now paint through the generic chains (accent fill, --text-tertiary white label). The ThemeEditor TokenRow chip (screens/Accessibility/ThemeEditor/TokenRow.tsx:73) then correctly stops flagging --success-button as base-overridden for gamelib-light copies. Leave nord-light's entries byte-identical.

    thumbnailPalette.test.ts: the expected BASE_PREVIEW_OVERRIDES keys become just nord-light. Replace the describe "GameLib Light base overrides (OD-2)" with "GameLib Light paints through the generic chains (261123-pnl)". It asserts:
    - no gamelib-light key in either override map
    - the thumbnail of the seed draws primary, secondary and success as #4c6f99 with #ffffff labels, tabBar and sidebar as #e5e9f0, activeRow as #d8dee9, inactiveLabel as #4c566a and activeLabel as #2e3440
    - a copy's --success-button of #ff0000 IS drawn as #ff0000
    - the themes.scss gamelib-light block has no line-start nested `button.is-primary {` rule and no nested `.button.is-success {` rule, so no override is owed. This is the inverse of the old "pins the overrides" test, and uses its anchored-search technique

    ThemeThumbnail.test.tsx: invert the GameLib Light case. With `--success-button: '#ff0000'` on base gamelib-light, the button-success rect is filled #ff0000, and the title says the copy's token is honoured.

    customTheme.test.ts, test "D-09: nested-override colours of gamelib-light are not stored as tokens":
    - the nested-only literals become the log box's #dde1e7 and the .gameCardStatus label #d0ddff (.runnerIcon now uses a token, so drop #88c0d0)
    - the .genre text #2e3440 now coincides with several DECLARED tokens. Assert the sorted names of every seed token resolving to #2e3440, read from the regenerated json, against the expected set --brand-text-01, --navbar-accent, --navbar-active, --neutral-06, --status-default-hover. If the regenerated set differs, stop and reconcile the block, because a token resolved where it was not meant to
    - update the comments to match
    - the copy and base assertions stay

    Full sweep, then commit:
    - run the whole Frontend project (`npx jest --selectProjects Frontend --silent`) and `pnpm codecheck`
    - fix any failure in the palette (themes.scss) or in the test that is honestly out of date, never by lowering a floor
    - stage exactly this task's four files (plus themes.scss only if the sweep forced a value fix) by explicit path and commit, for example "test(261123-pnl): theme thumbnail draws GameLib Light from its chains"
    - after the commit, run `graphify update .` (CLAUDE.md) and do not commit graphify-out unless it is already tracked and changed
  </action>
  <verify>
    <automated>npx jest --selectProjects Frontend --silent && pnpm -s gen:theme-tokens --check && pnpm codecheck && npx eslint src/frontend/customThemes/thumbnailPalette.ts src/frontend/customThemes/__tests__/thumbnailPalette.test.ts src/frontend/components/UI/ThemeSelector/__tests__/ThemeThumbnail.test.tsx src/frontend/customThemes/__tests__/customTheme.test.ts && npx prettier --check src/frontend/customThemes/thumbnailPalette.ts src/frontend/customThemes/__tests__/thumbnailPalette.test.ts src/frontend/components/UI/ThemeSelector/__tests__/ThemeThumbnail.test.tsx src/frontend/customThemes/__tests__/customTheme.test.ts src/frontend/themes.scss src/frontend/customThemes/builtinTokens.generated.json src/frontend/styles/_buttons.scss src/frontend/screens/Library/components/LibrarySignInNotice/index.scss src/frontend/customThemes/__tests__/nordLightPalette.test.ts src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/components/UI/NavShell/components/NavTabs/index.scss src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss</automated>
    <human-check>Live look in `pnpm tauri:dev` (NOT tauri:dev:run). Settings, then Accessibility, then theme GameLib Light. Restart dev first if the build is stale.
      (1) Library: the top bar and the tier-2 panel are both light. The hairline seam under the top bar breaks cleanly beneath the selected tab, with no line through the tab. The tier-2 right edge hairline does not look too heavy on the light chrome. The selected tab label is the blue accent, and the active row in the tier-2 panel is legible.
      (2) The recently played tile: the Play pill and circle are #4c6f99 with a white label, they darken on hover, and nothing is dark green. The icon row is light grey with the gear legible.
      (3) A Game page: Play, Install and the installed-game button are all the same blue with white labels. The back and gear squares are light, with dark glyphs that stay visible over the art band. The card borders are neutral, not cyan. The install/download progress bar is blue. Genre pills are light with dark text.
      (4) Optional: a context menu (right-click a tile) hovers light grey, and a dialog Cancel (tertiary) is light grey with dark text.
      Report pass, or the item and what looks wrong.</human-check>
  </verify>
  <done>The whole Frontend jest project passes. gen --check and codecheck pass, and eslint and scoped prettier are clean over every path written in the plan. Thumbnail and ThemeEditor tests now honour gamelib-light's own tokens. D-09 records the true nested-only literals and the true #2e3440 coincidence set. Each of the three commits contains only its task's paths, and the unrelated dirty files are still unstaged and unchanged. The human-check note has been handed to the operator.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | This is a CSS-token and test change inside the renderer. No input, IPC, network, storage or process boundary is touched |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261123-pnl-01 | Tampering | theme contrast gates (themeTokens.test.ts, contrastFloors.ts, nordLightPalette.test.ts) | medium | mitigate | No floor or threshold may be lowered. Task 2's verify pins the themeTokens floor-assertion count at 16 and requires contrastFloors.ts to be unchanged against HEAD. Task 1's verify requires nordLightPalette floors to stay above the HEAD count of 7. Failures are fixed by changing the palette value |
| T-261123-pnl-02 | Tampering | git staging of unrelated dirty work | medium | mitigate | Every commit stages explicit paths only (`git add -- <task files>`), with `git diff --cached --name-only` checked against the task's `<files>`. Never -A, `.`, -a, or gsd-tools commit without --files |
| T-261123-pnl-03 | Tampering | other built-in themes (nord-light especially) | medium | mitigate | Task 1's node one-liners prove themes.scss is identical outside the gamelib-light block and that every seed but gamelib-light matches HEAD. The nord-light describes in nordLightPalette.test.ts stay byte-identical and keep passing |
| T-261123-pnl-04 | Information disclosure | none | low | accept | No data, logs, credentials or profile state are read or written |
| T-261123-pnl-SC | Tampering | npm/pip/cargo installs | high | accept | No package is installed or upgraded by this plan, so the legitimacy gate has nothing to check |
</threat_model>

<verification>
- Task 3's automated line is the plan-level gate: the whole Frontend jest project, gen:theme-tokens --check, codecheck, eslint, and prettier scoped to all twelve written paths.
- The Task 1 identity one-liners are the D-05 scope proof, and Task 2's count gate plus the unchanged contrastFloors.ts are the no-weakened-floor proof.
- Coverage of the user's decisions:
  - D-01 (light chrome, seam, dark-chrome audit): Task 1, pinned by the new describe; census in Task 2
  - D-02 (one accent): Task 1 tokens and rules, Task 3 thumbnail
  - D-03 (green split, Play to accent): Task 1 re-scopes and --success
  - D-04 (neutral greys): Task 1
  - D-05 (scope, honest tests): every task
- Deliberate non-goals, stated so a reviewer does not read them as misses:
  - the three status-only green fills (Settings saved dot, SystemInfo meter, Discounts badge) stay green, because they are status, not actions
  - the tier-2 ::after edge keeps the global --neutral-04 (D-01 says to reuse the existing tokenisation before inventing anything)
  - NavShell/index.scss, GameCard/index.css and GamePage/index.css are not edited, because their gamelib-light behaviour comes entirely from block tokens and re-scopes
- Human check (Task 3 `<human-check>`): a live look in `pnpm tauri:dev` at the Library (top bar, tier-2 panel, recently played tile Play) and a Game page (Play, Install, back and gear squares).
</verification>

<success_criteria>
- GameLib Light shows a light top bar and tier-2 panel, one #4c6f99 accent with white labels on every action fill (including the recently played tile's Play), green only as status, and neutral grey secondary surfaces. Every quoted contrast is measured, and everything clears its floor.
- Every other theme is byte-identical (proved by Task 1's one-liners), and the whole Frontend jest project passes with no floor lowered.
- The verbatim gamelib-light pin is replaced by an honest pin of the new palette. The thumbnail and ThemeEditor chip follow gamelib-light's own tokens.
- There are three commits, each with exactly its task's paths, and no unrelated working-tree change is swept in.
</success_criteria>

<output>
Create `.planning/quick/261123-pnl-gamelib-light-clean-retheme-light-chrome/261123-pnl-SUMMARY.md` when done
</output>
