---
phase: quick-261011-pjv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
  - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss
  - src/frontend/styles/_buttons.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx
  - src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss
  - .planning/todos/pending/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md
  - .planning/todos/completed/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md
  - .planning/todos/pending/2026-10-11-button-is-text-hover-and-is-link-pairs-miss-4-5-to-1.md
autonomous: true
requirements: [45-12-G7] # the todo carries no REQ id; it descends from 45-12 G7 via quick 261011-gpn's census

estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 3
  confidence: low # `estimate-calibration` is not in this gsd-sdk's registry (measured at planning: "not in native registry", fallback failed), so no factor and no samples

must_haves:
  truths:
    - "Enabled Retry, enabled Clear and enabled pure `.button.is-text` each paint text at >= 4.5:1 against their own accent fill in all 10 themes, token-resolved: midnightMirage 14.64, cyberSpaceOasis 7.77, gruvbox_dark 5.26 (via the --neutral-01 override), high-contrast 11.41, dracula 8.09, nord-light 8.88, nord-dark 11.41, marine 7.42, zombie 7.52, sweet 10.82"
    - "Disabled states are unchanged: Retry's `&:disabled` arm still declares only cursor + opacity (no colour), Clear still has no disabled arm, and disabled `.button.is-text` is still painted by the global `.button:disabled` rule (--text-secondary on --disabled-button); every new override ends in `:not(:disabled)` so none can reach a disabled button"
    - "The 22 `.is-text.is-link` render sites (GameSubMenu, MainButton) render exactly as before in every theme, because the `.button.is-text` override carries `:not(.is-link)`"
    - "A jest census in themeTokens.test.ts fails if any of the three enabled pairs drops below 4.5:1 in any theme. RED was observed before the SCSS change: exactly the 3 gruvbox_dark cases at 4.35 failed and the other 27 passed. Load-bearing and in-memory can-fail proofs back it"
    - "src/frontend/themes.scss is byte-unchanged, and rowStates.test.tsx still asserts that every compiled Row rule sits under `.WinetricksSettings`. Its one theme-ancestor allowance is enumerated and proven able to fail"
    - "The todo sits in .planning/todos/completed/ with a `## Fix` section stating: option (a) was chosen and extended to `.button.is-text`, option (b) is still an open design decision, and a pixel-sampled gruvbox_dark capture is STILL OWED. The `.button.is-text` hover and is-link residual is filed as a new pending todo, and `pnpm planning-gates` passes"
  artifacts:
    - path: src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss
      provides: "Retry's `body.gruvbox_dark &:not(:disabled)` --neutral-01 override"
      contains: "body.gruvbox_dark &:not(:disabled)"
    - path: src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss
      provides: "Clear's `body.gruvbox_dark &:not(:disabled)` --neutral-01 override"
      contains: "body.gruvbox_dark &:not(:disabled)"
    - path: src/frontend/styles/_buttons.scss
      provides: "`.button.is-text`'s `body.gruvbox_dark &:not(.is-link):not(:disabled)` --neutral-01 override"
      contains: "body.gruvbox_dark &:not(.is-link):not(:disabled)"
    - path: src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
      provides: "all-10-theme census for the three accent-filled controls, plus load-bearing, disabled, is-link and can-fail proofs"
      contains: "261011-pjv"
    - path: .planning/todos/completed/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md
      provides: "the closed todo with its Fix section"
      contains: "## Fix (2026-10-11, quick 261011-pjv"
    - path: .planning/todos/pending/2026-10-11-button-is-text-hover-and-is-link-pairs-miss-4-5-to-1.md
      provides: "the residual, triaged"
      contains: "ready: code"
  key_links:
    - from: src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
      to: Row/index.scss, EverythingElseGroup/index.scss, styles/_buttons.scss
      via: "read() of each stylesheet, then cssBlock(src, <selector>), declsAtDepthZero and nestedRules over the block body"
      pattern: "WINETRICKS_ROW_SCSS|WINETRICKS_EVERYTHING_ELSE_SCSS|BUTTONS_SCSS"
    - from: src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
      to: src/frontend/themes.scss + src/frontend/styles/_colors.scss
      via: "themeTokens(themesScss, selector) + globalTokens() + resolveValue() + contrastRatio(), the same resolver the Apply census uses"
      pattern: "themeTokens\\(themesScss, selector\\)"
    - from: src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx
      to: src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss
      via: "sass.compile(...).css, then the compiled-selector scope assertion"
      pattern: "scopes every rule under the tab root"
---

<objective>
Close todo `2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md` (severity minor). Use its fix option (a), extended to `.button.is-text`: copy the sibling Apply fix (quick 261011-gpn) into Retry, Clear and `.button.is-text`, and pin all three with an all-10-theme WCAG census in `themeTokens.test.ts`.

Option (b) is NOT chosen. That would be a theme-level gruvbox_dark `--accent` change. It stays a design decision for a later owner, and the closed todo says so.

This task makes no live capture and does not run `tauri dev`. Every number below is token-resolved, not pixel-sampled.

**Measured at planning (HEAD `6bb8e809e`, branch `quick-261002-b63`).** I ran the test file's own resolver lines (L417-566, executed directly under Node 26 type-stripping, no reimplementation) and compiled the candidate SCSS with the repo's `sass`:

| pair (gruvbox_dark unless noted) | ratio |
|---|---|
| `--background` `#1d2021` on `--accent` `#b57614`: Retry, Clear, `.button.is-text` today | **4.35**, fails 4.5 |
| `--neutral-01` `#070a0b` on `--accent`: the override | **5.26** |
| the other 9 themes, base pair (identical for all three controls; `.button.is-text`'s fallback-less `var()`s resolve the same) | midnightMirage 14.64, cyberSpaceOasis 7.77, high-contrast 11.41, dracula 8.09, nord-light 8.88, nord-dark 11.41, marine 7.42, zombie 7.52, sweet 10.82 |
| `.button.is-text:hover`, base text on `--primary-hover` `#83a598` | 6.09 |
| `.button.is-text:hover`, override text on `--primary-hover` | 7.38: the override improves hover, it does not regress it |

**Planner finding 1: the brief's exact idiom on `.button.is-text` would cause a regression, so that override also carries `:not(.is-link)`.**
- `grep -rn 'is-text' src/frontend` returns 28 matches, 23 of them render sites.
- 22 of those 23 are `link button is-text is-link`: 21 in `Game/GameSubMenu/index.tsx` (one is a `CircularProgress`) and 1 in `Game/GamePage/components/MainButton.tsx`.
- The ONLY pure `button is-text` render site is DownloadManager's "Clear List" button (`DownloadManager/index.tsx:165`).
- The `.is-link` consumers take their text colour from `.button.is-link` (`_buttons.scss:168`, same specificity, later in the file). In the game menu they take it from `.gameConfigContainer .game-actions .gameTools .link` (`GamePage/index.css:699`, (0,4,0), `background: none`, `color: var(--navbar-inactive)`).
- A bare `body.gruvbox_dark .button.is-text:not(:disabled)` is (0,4,1). It outranks that rule and would repaint every game-menu link `--neutral-01` on gruvbox_dark's `--navbar-background` `#32302f`: **1.51:1**.
- With `:not(.is-link)` the sass-compiled selector is `body.gruvbox_dark .button.is-text:not(.is-link):not(:disabled)`, (0,5,1), and matches none of them.

**Planner finding 2: the Retry override turns an existing gate RED, so this task amends that gate.**
- `rowStates.test.tsx` L378-386 ("scopes every rule under the tab root so nothing leaks app-wide") requires every compiled selector of `Row/index.scss` to match `/^\.WinetricksSettings\b/`.
- Compiled, the Retry override is `body.gruvbox_dark .WinetricksSettings .WinetricksRow__retry:not(:disabled)`, the only selector that fails (sass-compiled at planning against a scratch copy).
- The gate's invariant is "nothing leaks out of the tab root". A theme-class ancestor ABOVE the root narrows the match; it cannot widen it.
- Task 1 therefore admits exactly one optional leading `body.<class> ` ancestor. It also enumerates the theme-scoped selectors (exactly that one) and proves the amended pattern still rejects an unscoped selector. Clear (`everythingElse.test.tsx`) and `_buttons.scss` have no compiled-scope gate.

**Planner finding 3: a pre-existing, out-of-scope pair is recorded and not fixed.**
- MainButton's install-options button keeps `.button.is-text`'s `--accent` fill. `Dropdown/index.scss` sets spacing only.
- It paints `.button.is-link`'s `--text-default` on that fill: the exact pre-fix Apply pair, failing 4.5 in all 10 themes at token level (gruvbox_dark 3.09, midnightMirage 1.01).
- `.button.is-text:hover` with base text misses in nord-light (3.36) and nord-dark (4.41).
- Neither is this todo's pair, and `:not(.is-link)` deliberately leaves MainButton byte-identical. Task 3 files both as one new pending todo.

**Disabled arms, per control (checked at planning):**
- Retry: its `&:disabled` declares `cursor: not-allowed; opacity: 0.5` and no colour (`Row/index.scss` L299-302). `Row/index.tsx:172` passes `disabled={locked}`.
- Clear: it has no disabled arm, and `EverythingElseGroup` passes it no `disabled` prop.
- `.button.is-text`: it has no arm of its own. Disabled is painted by the global `.button:disabled` at `_buttons.scss:189` ((0,2,0): `background: var(--disabled-button); color: var(--text-secondary)`). An override without `:not(:disabled)` would outrank that.
- In all three, `:not(:disabled)` keeps the disabled state exactly what it paints today.

Purpose: Apply, Retry, Clear and `.button.is-text` share one accent fill. After this task every enabled member of that family clears 4.5:1 in every theme, and the gate fails the next time one does not.

Output: three SCSS overrides, one new census describe, one gate amendment, one comment refresh, the todo closed, one residual todo filed. Three commits.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.claude/skills/gamelib-conventions/SKILL.md
@.planning/todos/pending/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md
@.planning/quick/261011-gpn-fix-the-winetricks-apply-enabled-button-/261011-gpn-PLAN.md

The graphify read-hook may ask you to orient first. One `graphify query "themeTokens accent contrast census"` satisfies it. The line ranges below were grounded at planning, so do not browse beyond them.

Read by line range only. `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` is 2250 lines; do not read it whole:
- L24-68: imports, `REPO_ROOT`, `read()` (it runs `stripSourceComments`, which strips WHOLE-LINE comments only), `THEMES_SCSS`, `themeSelectors` (10 entries).
- L114-138: `cssBlock(source, selector)`. It returns the FIRST block whose text is exactly `<selector> {`.
- L417-566: `globalTokens`, `allBlocksFor` (L468, every `<selector> {` block), `themeTokens` (L493), `resolveValue` (L504), `toRgb`, `contrastRatio` (L558).
- L663-694: `declsAtDepthZero(blockBody, prop)`. It returns depth-0 declarations only and skips nested rules.
- L777-805: `nestedRules(blockBody)`, giving depth-0 `{ selector, body }` pairs.
- L902-1099: the Apply census, which this task mirrors. It contains:
  - `WINETRICKS_STICKY_BAR_SCSS` and `WINETRICKS_APPLY_SELECTOR`.
  - An orphaned JSDoc at L907-913 that documents `applyTextColourDecl` but sits above the predicate's JSDoc.
  - `themeOverridesMissingNotDisabled` (L922). It filters on `endsWith('&:not(:disabled)')`.
  - `applyTextColourDecl` (L928). Its override regex is fixed to `body\.<theme>\s*&:not\(:disabled\)\s*\{`.
  - The describe at L964, with non-vacuity, the 10-theme `it.each`, and Tests A-D.
- L1293-1297: `WINETRICKS_ROW_SCSS` is ALREADY declared. L1785-1786: `WINETRICKS_EVERYTHING_ELSE_SCSS` is ALREADY declared. Reuse both; redeclaring either is a TS error. `BUTTONS_SCSS` is not declared anywhere yet.
- All helpers are module-private `const` arrows. New describes MUST be appended at the END of the file, after L2250. Describe bodies run at collection time, so a call to a later `const` hits the TDZ.

Other files, read by range only:
- `src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss` L76-125: the Apply rule and its override comment. Copy this idiom and comment shape.
- `src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss` L274-303: `.WinetricksRow__retry`. The todo's cited L232/240/245 are stale; HEAD has the rule at L274, `background` at L282 and `color` at L287.
- `src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss` L96-113: `.WinetricksEverythingElse__clear`. The todo cites L82/86/88; HEAD has L96/100/102.
- `src/frontend/styles/_buttons.scss` L151-193: `.button.is-text`, `.button.is-text:hover`, `.button.is-link`, `.button:disabled`. Note that `.button:disabled {` appears TWICE (L29 cursor-only, L189 colours). `cssBlock` returns L29, so use `allBlocksFor`.
- `src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx` L362-391: the compiled-stylesheet describe.

**Comment-text and gate traps. Each was measured at planning:**
- `everythingElse.test.tsx` L383-384 raw-reads `EverythingElseGroup/index.scss` WITHOUT stripping comments, and negative-matches `max-height`, `overflow-y` and `overflow:` followed by `auto` or `scroll`. A new comment in that file must contain none of those.
- `tokenCensus.test.ts` scans the Winetricks stylesheets. Every `var()` needs a terminal fallback, and `--navbar-*`, `--text-hover` and raw `--status-*` are banned. `var(--neutral-01, #070a0b)` is admitted, as the Apply override already proves. Do not name a banned token even in a Winetricks comment.
- Write comments as WHOLE-LINE `//` lines only, with no trailing comment on a declaration line. `read()` strips whole-line comments only, so a trailing one glues onto the next statement and hides it from `declsAtDepthZero`.

**Jest invocation, grounded at planning. Use this exact form: paths FIRST, `--selectProjects Frontend` LAST.**
`npx jest src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/everythingElse.test.tsx --selectProjects Frontend`
- Measured at planning on HEAD `6bb8e809e`: `Test Suites: 4 passed, 4 total`, `Tests: 227 passed, 227 total`, about 0.6s.
- The reverse order is a trap. `--selectProjects` is variadic, so it swallows the paths as project names and runs the whole Frontend project. Always confirm the `Test Suites:` line says 4.
- No `src/frontend` file is added, deleted or moved, and no `.tsx` component is edited. The Meta project's i18n-scope gates are therefore not armed, and running Meta is not required.

**Branch assertion.** This is the precondition for every commit:
- `git merge-base --is-ancestor 6bb8e809e HEAD` exits 0.
- `git branch --show-current` prints `quick-261002-b63`. Record it in the SUMMARY.
- If either check fails, halt and report.
- Stage explicit paths only, never `git add -A` or `.`. An untracked `.planning/milestone.lock` is present and must never be committed.
- End every commit message with the `Co-Authored-By:` line your own session's attribution reminder specifies.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: All-10-theme census for Retry, Clear and .button.is-text (RED on gruvbox_dark), then the three overrides plus the Row scope-gate amendment (GREEN)</name>
  <files>src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts, src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss, src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss, src/frontend/styles/_buttons.scss, src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx</files>
  <precondition>`git merge-base --is-ancestor 6bb8e809e HEAD` exits 0, and `git diff --quiet HEAD -- src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss src/frontend/styles/_buttons.scss src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx` exits 0, so all five files start clean.</precondition>
  <read_first>
    - The themeTokens.test.ts line ranges listed in `<context>`, and only those.
    - src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss L76-125
    - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss L274-303
    - src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss L96-113
    - src/frontend/styles/_buttons.scss L151-193
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx L362-391
  </read_first>
  <behavior>
    The new describe is appended at the END of `themeTokens.test.ts` and titled "Accent-filled Retry, Clear and .button.is-text text contrast in every theme (261011-pjv)". It contains:
    - Non-vacuity, an `it.each` over the three controls. Each one checks:
      - `globals.size > 0`.
      - The control's block resolves via `cssBlock` and is non-empty.
      - It has exactly one depth-0 `background`, matching `/var\(\s*--accent/`.
      - It has exactly one depth-0 `color`, matching `/var\(\s*--background/`.
      - `nestedRules(block)` contains a rule whose selector equals the control's expected gruvbox override selector, with exactly one depth-0 `color`.
    - Per-theme, an `it.each` over the 30 (control, theme) pairs. The enabled text (the theme's guarded override `color` if one exists, else the depth-0 base `color`) and the depth-0 `background` both resolve non-null through `themeTokens(themesScss, selector)` + `globals`. The ratio must be >= 4.5. Use the object-form expect `{ control, theme, fg, bg, ratio, passes: ratio >= 4.5 }` against the same object with `passes: true`, so a failure names the control, the theme and the ratio.
    - RED, on the unmodified stylesheets, gives exactly 6 failures in the new describe:
      - The 3 non-vacuity cases fail because no override exists yet.
      - The 3 gruvbox_dark per-theme cases fail at 4.35 (`#1d2021` on `#b57614`).
      - The other 27 per-theme cases PASS. If any of those 27 fail, or a gruvbox_dark case passes, the census is reading the wrong declaration: fix the test, not the SCSS.
      - Every pre-existing test in the four suites still passes.
    - After the SCSS change but BEFORE the rowStates amendment, the rowStates "scopes every rule under the tab root" test fails on exactly `body.gruvbox_dark .WinetricksSettings .WinetricksRow__retry:not(:disabled)`. This is Planner finding 2, observed.
    - GREEN: 4 suites pass. The 30 per-theme ratios match the objective's table, with gruvbox_dark at 5.26 for all three controls.
  </behavior>
  <action>
    **RED first, test file only.**
    1. In `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts`, generalize `applyTextColourDecl` IN PLACE so one picker serves Apply and the three new controls. This reuses the helper rather than re-deriving it.
       - Widen its override regex so that after `body\.<theme>\s*&` it accepts zero or more `:not(<simple selector without parentheses>)` compounds and then REQUIRES a final `:not(:disabled)` before the `{`. Keep the body capture as group 1, using non-capturing groups for the repetition.
       - Keep the name and the two-argument signature.
       - Reword its two error messages so they do not say "Apply".
       - Move the orphaned JSDoc at L907-913 so it sits directly above `applyTextColourDecl`, and say there that it now serves every accent-filled control.
       - The Apply describe's 15 tests are the regression check for this generalization and must stay green.
    2. Append at the END of the file (after L2250):
       - A module-level `BUTTONS_SCSS` constant, set to `src/frontend/styles/_buttons.scss`.
       - A module-level `ACCENT_FILL_CONTROLS` table with three entries, each carrying `control`, `path`, `selector` and `gruvboxOverride`:
         - Retry: `WINETRICKS_ROW_SCSS`, `.WinetricksRow__retry`, `body.gruvbox_dark &:not(:disabled)`.
         - Clear: `WINETRICKS_EVERYTHING_ELSE_SCSS`, `.WinetricksEverythingElse__clear`, `body.gruvbox_dark &:not(:disabled)`.
         - `.button.is-text`: `BUTTONS_SCSS`, `.button.is-text`, `body.gruvbox_dark &:not(.is-link):not(:disabled)`.
       - Reuse the existing `WINETRICKS_ROW_SCSS` and `WINETRICKS_EVERYTHING_ELSE_SCSS`; do not redeclare them.
    3. Precede the new describe with a JSDoc saying four things:
       - It is the per-theme WCAG 1.4.3 census for the three remaining members of the accent-fill family Apply belongs to (todo 2026-10-11, gruvbox_dark 4.35:1).
       - It lives here for the same reason the Apply census does: the resolver is module-private.
       - It reads authored declarations from each stylesheet, never a hardcoded copy.
       - It cannot see a pixel, so a live capture still adjudicates appearance.
    4. Inside the describe:
       - Read `themesScss` and `globals` once, and read each control's block once via `cssBlock(read(path), selector)`.
       - Build the 30-pair `it.each` table at describe level, as a flatMap of controls over `themeSelectors`.
       - Strip `body.` from each selector to get the theme class, as the Apply describe does at L989.
       - Implement the non-vacuity and per-theme tests exactly as `<behavior>` states.
    5. Run the jest command from `<context>` and confirm the RED shape in `<behavior>`: 6 failures in the new describe, everything else green. Record the counts.

    **Then GREEN, the three overrides (option (a) extended).** Mirror Apply's idiom (`StickyBar/index.scss` L94-113).
    - Every new comment is whole-line `//` only.
    - Each comment states the 4.35:1 / 5.26:1 arithmetic and ends with a NOT LIVE-VERIFIED line: contrast arithmetic only, and a gruvbox_dark capture is still owed.
    - `src/frontend/themes.scss` stays byte-unchanged. Option (b), the theme-level token change, is not chosen.

    a. `src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss`, inside `.WinetricksRow__retry`:
       - Insert a nested `body.gruvbox_dark &:not(:disabled)` block declaring `color: var(--neutral-01, #070a0b);`. Place it after the last depth-0 declaration (`cursor: pointer;`) and before `&:focus-visible`.
       - The comment above it says:
         - gruvbox_dark's `--accent` `#b57614` is a mid-tone; its own `--background` `#1d2021` measures 4.35:1 and `--neutral-01` measures 5.26:1.
         - It is the same theme-scoped override Apply carries, and like NavTabs' `body.nord-light &` precedent it is a measured per-theme collision, not a general rule.
         - `:not(:disabled)` keeps the disabled arm (cursor and opacity only, no colour of its own) exactly as it paints today.
       - Leave every existing declaration, the existing colour comment, `&:focus-visible` and `&:disabled` byte-unchanged.
    b. `src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss`, inside `.WinetricksEverythingElse__clear`:
       - Insert the identical nested block after `cursor: pointer;` and before `&:focus-visible`.
       - Keep the comment short. Point to the Retry comment in `Row/index.scss` for the arithmetic, and say that Clear has no disabled arm today, so `:not(:disabled)` keeps any future one out of reach.
       - This comment must avoid the literals listed under the `everythingElse.test.tsx` trap in `<context>`.
    c. `src/frontend/styles/_buttons.scss`, inside `.button.is-text`:
       - Insert a nested block selected by `body.gruvbox_dark &:not(.is-link):not(:disabled)` and declaring `color: var(--neutral-01, #070a0b);`. Place it after `margin-bottom: var(--space-sm);`.
       - Keep that exact order of the two `:not()`s. The Task 2 predicate requires the selector to END in `:not(:disabled)`.
       - The comment above it says:
         - The same 4.35:1 / 5.26:1 arithmetic.
         - `:not(:disabled)` is load-bearing: without it the override outranks the global `.button:disabled` rule below and paints near-black text on `--disabled-button`.
         - `:not(.is-link)` is load-bearing (Planner finding 1). Most `.is-text` render sites also carry `.is-link`, which takes its text from `.button.is-link` and, in the game menu, from `.gameConfigContainer .game-actions .gameTools .link` at (0,4,0) on `--navbar-background`. An override without it would outrank that rule and measure 1.51:1 on gruvbox_dark's `#32302f`.
         - On hover the fill becomes `--primary-hover`, where the override text measures 7.38:1 (base 6.09:1).
       - Leave every other rule in the file byte-unchanged.

    **Then the Row scope-gate amendment (Planner finding 2).**
    1. Re-run the jest command and confirm that the rowStates scope test fails on exactly the Retry override selector. Record it.
    2. In `src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx`, inside the "compiled stylesheet (fixed metrics, scope)" describe:
       - Change the per-selector match in "scopes every rule under the tab root so nothing leaks app-wide" to admit exactly one optional leading theme ancestor: an optional `body.` + class-name + whitespace group, then `\.WinetricksSettings\b`. Keep the test name.
       - Add a comment explaining that a `body.<theme>` ancestor above the tab root narrows the match and cannot leak out of it.
    3. Add one new `it` to that describe, titled "theme-scoped rules are enumerated and the scope pattern can still fail". It asserts two things:
       - The compiled selectors starting with `body.` equal exactly `['body.gruvbox_dark .WinetricksSettings .WinetricksRow__retry:not(:disabled)']`. Adding a theme-scoped rule must then be a conscious edit here, not a free pass.
       - The amended pattern, held in one shared const so the two tests cannot drift, REJECTS both `body.gruvbox_dark .WinetricksRow__retry` and `.WinetricksRow__retry`. This is an in-memory can-fail proof.
    4. Re-run the jest command. All 4 suites must pass.

    **Commit.** Commit exactly these five paths with the message `fix(styles): paint near-black text on the Retry, Clear and .button.is-text accent fills in gruvbox_dark (261011-pjv)`. The body names three things: the 5.26:1 result, the `:not(.is-link)` regression it avoids (1.51:1 on the game menu), and the rowStates scope amendment.
  </action>
  <verify>
    <automated>npx jest src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/everythingElse.test.tsx --selectProjects Frontend 2>&1 | grep -E '^(PASS|FAIL)|Test Suites:|Tests:'</automated>
    <automated>for p in src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss src/frontend/styles/_buttons.scss src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx; do npx prettier --file-info "$p" 2>/dev/null | grep -Eq '"ignored":[[:space:]]*false' || { echo "IGNORED: $p"; exit 1; }; done && npx prettier --check src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss src/frontend/styles/_buttons.scss src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx</automated>
    <automated>git diff --quiet 6bb8e809e -- src/frontend/themes.scss src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss && grep -v '^[[:space:]]*//' src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss | grep -cF 'body.gruvbox_dark &:not(:disabled)' | grep -qx 1 && grep -v '^[[:space:]]*//' src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss | grep -cF 'body.gruvbox_dark &:not(:disabled)' | grep -qx 1 && grep -v '^[[:space:]]*//' src/frontend/styles/_buttons.scss | grep -cF 'body.gruvbox_dark &:not(.is-link):not(:disabled)' | grep -qx 1</automated>
  </verify>
  <done>
    - RED was observed before any SCSS edit: 6 failures in the new describe (3 non-vacuity, 3 gruvbox_dark at 4.35), 27 per-theme passes, and every pre-existing test green. The counts are recorded.
    - The rowStates scope test was observed RED on exactly the Retry override selector, and then amended.
    - GREEN: `Test Suites: 4 passed, 4 total` and no FAIL. The test count is 227 plus the new tests; record the number.
    - All five paths report `"ignored": false`, and `prettier --check` passes over exactly those paths.
    - `themes.scss` and `StickyBar/index.scss` are untouched by this commit. Each of the three stylesheets carries its override exactly once on a non-comment line.
    - One commit contains exactly the five files.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Proofs that the three overrides are load-bearing, cannot reach a disabled button or an .is-link consumer, and do not regress .button.is-text:hover; refresh Apply's stale comment</name>
  <files>src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts, src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss</files>
  <precondition>Task 1's commit exists, and `git diff --quiet HEAD -- src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss` exits 0.</precondition>
  <read_first>
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts: only the describe Task 1 appended (end of file), the Apply predicate `themeOverridesMissingNotDisabled` and its Tests C/D (about L914-926 and L1063-1098 before Task 1's edit), and L462-492 (`allBlocksFor`).
    - src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss L94-113
  </read_first>
  <behavior>
    These tests are added inside the describe Task 1 appended. Every one uses the object-form expect, so a failure names the control and the ratio.
    - Test A, "the gruvbox_dark override is load-bearing on every control", an `it.each` over the 3 controls. The depth-0 BASE `color`, deliberately NOT the override, resolved against the depth-0 `background` in `body.gruvbox_dark` must measure < 4.5 (expected 4.35). Carry the Apply describe's note: if this goes red, gruvbox's tokens changed, so delete the override and this test rather than re-pinning. Option (b), if ever taken, is exactly what turns these red.
    - Test B, "a theme override cannot reach a disabled control", an `it.each` over the 3 controls. The nested selectors that start with `body.` must include the control's `gruvboxOverride`, and `themeOverridesMissingNotDisabled(block)` must equal `[]`. Then, per control:
      - Retry: the `&:disabled` nested rule exists, its depth-0 `opacity` is `['0.5']`, and it declares NO `color` and NO `background`.
      - Clear: there is NO `&:disabled` nested rule.
      - `.button.is-text`: the block has no `&:disabled` of its own. Of `allBlocksFor(read(BUTTONS_SCSS), '.button:disabled')`, exactly one block declares a depth-0 `color`, that colour is `var(--text-secondary)`, and its `background` is `var(--disabled-button)`.
    - Test C, ".button.is-text's override cannot reach an .is-link consumer". A new module-level pure predicate `themeOverridesReachingIsLink(isTextBody)` returns the `body.`-scoped nested selectors that lack `:not(.is-link)`; on the real block it returns `[]`. Also assert that `cssBlock(read(BUTTONS_SCSS), '.button.is-link')` declares its own depth-0 `color`. That is the structural reason `.is-text.is-link` text never came from `--background`, and it is why the exclusion is correct.
    - Test D, "checkers can fail, in memory only" (the tokenCensus sabotage idiom; the file is never mutated):
      - In the Retry block, replacing `&:not(:disabled)` with `&` makes `themeOverridesMissingNotDisabled` return `['body.gruvbox_dark &']`.
      - In the `.button.is-text` block, deleting `:not(:disabled)` makes it return `['body.gruvbox_dark &:not(.is-link)']`.
      - In the `.button.is-text` block, deleting `:not(.is-link)` makes `themeOverridesReachingIsLink` return `['body.gruvbox_dark &:not(:disabled)']`.
    - Test E, "the override does not regress .button.is-text:hover in gruvbox_dark". Resolve the override `color` against the depth-0 `background` of `cssBlock(read(BUTTONS_SCSS), '.button.is-text:hover')` in `body.gruvbox_dark`. It must be >= 4.5 AND >= the base text's ratio on the same fill (expected 7.38 vs 6.09).
    - The Apply describe's existing 15 tests still pass after the predicate generalization below.
  </behavior>
  <action>
    1. Generalize `themeOverridesMissingNotDisabled` IN PLACE. Its current filter is `endsWith('&:not(:disabled)')`, which would flag `.button.is-text`'s `&:not(.is-link):not(:disabled)`.
       - Replace that filter with a regex test. The selector must end with an `&` followed by zero or more `:not(<simple selector without parentheses>)` compounds and then a final `:not(:disabled)`. This is the same shape Task 1 gave `applyTextColourDecl`; share one module-level regex const between the two helpers if it reads cleanly.
       - Update its JSDoc: "a control's block body", not "the Apply block body".
       - The Apply describe's Test D (`['body.gruvbox_dark &']`) must still pass unchanged. It is the regression check.
    2. Add Tests A-E from `<behavior>` inside Task 1's describe, after its existing tests. Reuse the describe's already-read `themesScss`, `globals` and per-control block bodies. Add `themeOverridesReachingIsLink` as a module-level `const` placed directly ABOVE the new describe, never below it, because of the TDZ. Do not mutate any file on disk for a proof: every sabotage is an in-memory `.replace` on a string copy, which also avoids the revert-destroys-work trap recorded in project memory.
    3. Refresh Apply's now-stale comment in `src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss`. L106-107 says that Retry and Clear share this collision and that it is recorded in a follow-up todo. Replace those two lines with whole-line `//` text saying that Retry, Clear and `.button.is-text` now carry the same gruvbox_dark override (quick 261011-pjv), and that `.button.is-text` additionally excludes `.is-link`. Change no declaration in this file; the diff must be comment lines only.
    4. Run the jest command; all 4 suites must pass. Then run `pnpm codecheck`: both `tsc` passes must exit 0.
    5. Commit exactly the two paths, with the message `test(styles): prove the gruvbox_dark accent-text overrides are load-bearing and cannot reach disabled or .is-link buttons (261011-pjv)`.
    6. Then run `graphify update .`. `graphify-out` is gitignored, so there is nothing to commit.
  </action>
  <verify>
    <automated>npx jest src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/everythingElse.test.tsx --selectProjects Frontend 2>&1 | grep -E '^(PASS|FAIL)|Test Suites:|Tests:'</automated>
    <automated>for p in src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss; do npx prettier --file-info "$p" 2>/dev/null | grep -Eq '"ignored":[[:space:]]*false' || { echo "IGNORED: $p"; exit 1; }; done && npx prettier --check src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss</automated>
    <automated>S=src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss; git diff 6bb8e809e -- "$S" | grep -q '^+.*261011-pjv' && test -z "$(git diff -U0 6bb8e809e -- "$S" | grep -E '^[+-][^+-]' | grep -vE '^[+-][[:space:]]*//')" && git diff --quiet 6bb8e809e -- src/frontend/themes.scss && pnpm codecheck</automated>
  </verify>
  <done>
    - `Test Suites: 4 passed, 4 total`. The test count equals Task 1's count plus the new Tests A-E cases. Record it.
    - The Apply describe's 15 tests are still green after the predicate generalization.
    - The StickyBar diff is comment lines only.
    - Prettier passes on both paths, and `pnpm codecheck` exits 0.
    - One commit contains exactly the two files.
  </done>
</task>

<task type="auto">
  <name>Task 3: Close the todo with a Fix section and file the .button.is-text hover and is-link residual</name>
  <files>.planning/todos/completed/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md, .planning/todos/pending/2026-10-11-button-is-text-hover-and-is-link-pairs-miss-4-5-to-1.md</files>
  <precondition>The Task 1 and Task 2 commits exist. Note both short hashes. `grep -q '"planning-gates"' package.json` succeeds (measured at planning: `"planning-gates": "python3 meta/runPlanningGates.py"`).</precondition>
  <read_first>
    - .planning/todos/completed/2026-10-11-winetricks-apply-button-text-is-unreadable-in-nord-light-and-midnightmirage.md: only its frontmatter (L1-13) and its `## Fix` section (from L34). This is the shape to mirror.
    - The gamelib-conventions "Todo triage frontmatter" section, already loaded via `<context>`; do not re-read it.
  </read_first>
  <action>
    **Close the todo.**
    1. Append to `.planning/todos/pending/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md` a section headed `## Fix (2026-10-11, quick 261011-pjv, commit `<Task 1 hash>`)`, with the hash in backticks as the precedent does. Hand-wrap it to the file's ~100-column width and state:
       - (a) Option (a) was chosen and EXTENDED to `.button.is-text`. Option (b), a theme-level gruvbox_dark `--accent`/`--background` change, was NOT chosen and remains a design decision for a later owner. Taking (b) would move all four accent collisions at once: the Apply, Retry, Clear and `.button.is-text` text pair, and the Queued checkbox's 3.91/2.97 non-text pair recorded above. It would then let all four overrides be deleted, and each override's load-bearing test (Apply's Test B, this task's Test A) is built to go red and say so.
       - (b) The change: one nested gruvbox_dark `--neutral-01` override in each of the three rules. Name each rule at its CURRENT line, and note that the cited L232/240/245 and L82/86/88 were stale (Retry L274, Clear L96). Give the `:not(:disabled)` reasoning per control: Retry's disabled arm is cursor and opacity only; Clear has no disabled arm; `.button.is-text` is painted disabled by the global `.button:disabled`. Give the `:not(.is-link)` reasoning: the counts from your own `grep -rn 'is-text' src/frontend` run (the plan measured 28 matches, 23 render sites, 22 carrying `.is-link`, the DownloadManager "Clear List" button as the only pure `.is-text` site) and the 1.51:1 regression it avoids on the game menu.
       - (c) The token-level result. The three controls resolve identically, so one 10-theme row suffices: before 4.35 to after 5.26 in gruvbox_dark, with the other nine themes unchanged at the objective's figures. Add `.button.is-text:hover` in gruvbox_dark: 6.09 before, 7.38 after.
       - (d) The gate: the new describe in `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts`, the observed RED (quote your recorded count), Tests A-E with the Task 2 hash, and the `rowStates.test.tsx` scope amendment, with why it is enumerated and has a can-fail proof.
       - (e) `src/frontend/themes.scss` is byte-unchanged.
       - (f) NOT live-verified. A pixel-sampled gruvbox_dark capture of enabled Retry, enabled Clear and the DownloadManager "Clear List" `.button.is-text` is STILL OWED. The jest census is the desk-level proof, not a substitute.
       - (g) The residual: name the new todo by filename.
    2. In that todo's frontmatter, append `src/frontend/styles/_buttons.scss`, `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` and `src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx` to `files:`. Leave every other key exactly as written. `severity: minor`, `platform: any` and `ready: code` stay bare, lowercase and in that order.
    3. `git mv` the file to `.planning/todos/completed/`, keeping the same filename.

    **File the residual (Planner finding 3).** Create `.planning/todos/pending/2026-10-11-button-is-text-hover-and-is-link-pairs-miss-4-5-to-1.md`.

    Its frontmatter keys, in this order:
    - `created`: the current ISO-8601 UTC timestamp.
    - `title`: `.button.is-text`'s hover and `.is-link` pairs miss 4.5:1 (token-resolved), outside the gruvbox_dark override.
    - `area: ui`
    - `severity: medium`
    - `platform: any`
    - `ready: code`
    - `found_by`: a quoted string naming quick 261011-pjv's planning census, 2026-10-11.
    - `files:` listing `src/frontend/styles/_buttons.scss` and `src/frontend/screens/Game/GamePage/components/MainButton.tsx`.

    The body states:
    - (1) MainButton's install-options button (`link button is-text is-link buttonWithIcon`, MainButton.tsx about L401) keeps `.button.is-text`'s `--accent` fill; `Dropdown/index.scss` sets spacing only. It paints `.button.is-link`'s `--text-default` on that fill. Token-resolved at planning, this fails 4.5 in all 10 themes: midnightMirage 1.01, cyberSpaceOasis 1.71, gruvbox_dark 3.09, high-contrast 1.34, dracula 2.41, nord-dark 1.26, marine 1.95, zombie 1.80, sweet 1.55. nord-light is NOT modelled, because `themes.scss` (about L507) gives it a `.button.is-link` `--navbar-active` override that the planning measurement did not resolve.
    - (2) `.button.is-text:hover` (`--background` on `--primary-hover`) misses in nord-light (3.36) and nord-dark (4.41). gruvbox_dark is 7.38 through the new override.
    - (3) `.settingsWrapper > .button.is-text` (`Settings/index.css:148`) matched no render site at planning, so it may be dead CSS.
    - No fix is chosen. Note that 261011-pjv deliberately excluded `.is-link` so MainButton stays byte-identical, and that a live capture is owed either way.

    Run `pnpm planning-gates`. It took about 5s at planning and exits 0 on a clean tree. Fix any failure in the new todo's own frontmatter; never widen the gate.

    Commit exactly these paths: both sides of the `git mv` rename, plus the new pending todo. The message is `docs(quick-261011-pjv): close the gruvbox_dark 4.35:1 accent-text todo and file the .button.is-text hover and is-link residual`. Do NOT stage `.planning/quick/**`, `.planning/STATE.md` or `.planning/milestone.lock`; the orchestrator commits those.
  </action>
  <verify>
    <automated>C=.planning/todos/completed/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md; N=.planning/todos/pending/2026-10-11-button-is-text-hover-and-is-link-pairs-miss-4-5-to-1.md; test -f "$C" && test ! -e .planning/todos/pending/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md && grep -q '^## Fix (2026-10-11, quick 261011-pjv, commit `' "$C" && sed -n '2,10p' "$C" | grep -E '^(severity|platform|ready):' | tr '\n' ' ' | grep -qx 'severity: minor platform: any ready: code ' && sed -n '2,10p' "$N" | grep -E '^(severity|platform|ready):' | tr '\n' ' ' | grep -qx 'severity: medium platform: any ready: code ' && pnpm planning-gates</automated>
    Prettier: every path this task writes is under `.planning/`. `npx prettier --file-info` reports `.planning/**` as `{ "ignored": true, "inferredParser": null }` (measured at planning for `.planning/todos/completed/`). A `--check` would be vacuous, so it is deliberately omitted per the gamelib-conventions formatter rule. Consistency comes from hand-matching the surrounding todo corpus.
  </verify>
  <done>
    - The todo is in `completed/` with a `## Fix` section covering (a)-(g). It says plainly that option (b) is still open and that the pixel-sampled gruvbox_dark capture is still owed. Its `files:` gains the three paths, and its triage keys are unchanged and in order.
    - The new pending todo carries `severity: medium`, `platform: any` and `ready: code`, in order.
    - `pnpm planning-gates` exits 0.
    - One docs commit contains only the rename and the new todo.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none | Stylesheet token choices and source-text tests. No input, IPC, network, credentials or package installs. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-pjv-01 | Repudiation | Accent-fill census (themeTokens.test.ts) | low | mitigate | Guard against a green that proves nothing. Non-vacuity per control, an observed RED of exact shape (3 + 3 fail, 27 pass) before the SCSS change, and in-memory can-fail proofs (Test D). |
| T-pjv-02 | Tampering | rowStates scope gate amendment | low | mitigate | The relaxation admits only one `body.<class>` ancestor above `.WinetricksSettings`. The theme-scoped selectors are enumerated exactly, and an in-memory proof shows the pattern still rejects unscoped selectors, so the allowance cannot become a free pass. |
| T-pjv-03 | Tampering | `.button.is-text` override blast radius | medium | mitigate | `:not(.is-link)` keeps the 22 `.is-link` render sites out of reach, preventing the measured 1.51:1 game-menu regression. `:not(:disabled)` keeps the global `.button:disabled` paint. Both are pinned by Tests B, C and D. |
| T-pjv-04 | Tampering | Commit staging | low | mitigate | Stage explicit paths only (an untracked `.planning/milestone.lock` exists), and assert branch ancestry before the first commit. |
| T-pjv-SC | Tampering | npm/pip/cargo installs | low | accept | Nothing is installed or added, so the legitimacy gate does not fire. |
</threat_model>

<verification>
- Jest, paths-first form: `themeTokens.test.ts`, `tokenCensus.test.ts`, `rowStates.test.tsx` and `everythingElse.test.tsx` give `Test Suites: 4 passed, 4 total`.
- `git log --oneline 6bb8e809e..HEAD -- src/frontend/themes.scss` prints nothing. Do not diff against `main`: the branch already carries other commits ahead of it.
- `npx prettier --check` passes over the six prettier-visible paths written across Tasks 1-2.
- `pnpm codecheck` exits 0, and `pnpm planning-gates` exits 0.
- `git log --oneline 6bb8e809e..HEAD` shows exactly 3 new commits (fix, test, docs), each carrying `261011-pjv`.
- Optional, standalone and not chained (a `&&` chain shows one red per attempt): `pnpm lint`.
- No live capture and no `tauri dev` in this task. The census is token-resolved only.
</verification>

<success_criteria>
- Enabled Retry, Clear and pure `.button.is-text` resolve to >= 4.5:1 against their accent fill in all 10 themes. The lowest is gruvbox_dark at 5.26 via the override.
- Disabled states, and every `.is-text.is-link` consumer, paint exactly what they painted before.
- The census is proven to see the gruvbox_dark defect (observed RED) and proven able to fail on every guard the overrides rely on.
- `themes.scss` is untouched. Option (b) is recorded as open, not taken.
- The todo is closed and says the pixel-sampled gruvbox_dark capture is still owed. The `.button.is-text` hover and is-link residual is tracked and passes the CI frontmatter gate.
</success_criteria>

<output>
Create `.planning/quick/261011-pjv-close-the-gruvbox-dark-4-35-1-todo-retry/261011-pjv-SUMMARY.md` when done. The orchestrator commits it, so do not commit it yourself. The SUMMARY records:
- The observed RED counts from Task 1: the census failures, and the rowStates scope failure.
- The GREEN test counts after Task 1 and after Task 2.
- The three commit hashes and `git branch --show-current`.
- The `is-text` grep counts from Task 3.
- An `## Open observations` entry stating that a pixel-sampled gruvbox_dark capture of Retry, Clear and the DownloadManager "Clear List" button is owed. If the operator wants the override's non-reach of the game-menu `.is-link` links confirmed visually, the same capture should include a GamePage menu in gruvbox_dark.
</output>
