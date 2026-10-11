---
phase: quick-261011-kqx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
  - src/frontend/screens/Settings/sections/WinetricksSettings/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/LogPanel/index.scss
  - src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss
  - .planning/quick/261011-kqx-winetricks-tab-contrast-misses-in-nord-l/261011-kqx-contrast-table.mjs
  - .planning/todos/completed/2026-10-11-winetricks-tab-contrast-misses-below-the-45-and-3-bars.md
  - .planning/todos/pending/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md
  - .planning/todos/pending/2026-10-11-winetricks-disabled-apply-border-reads-1-36-live-in-midnightmirage-but-6-07-by-token.md
autonomous: true
requirements: [45-12-G7]

estimate:
  tokens: 110000
  raw_tokens: 110000
  tasks: 3
  confidence: low # `gsd-sdk query estimate-calibration` measured at planning: "Unknown command: estimate-calibration", so no factor and no samples

must_haves:
  truths:
    - "Failed-state red text (Row Install failed tag, sticky-bar failed count, log error line) resolves >= 4.5:1 in all 10 themes against its own surface, including the hovered row surface for row text; the danger icon resolves >= 3:1. Worst case gruvbox_dark 4.69 (tag on a hovered row). nord-light: tag 8.16, bar 6.96. midnightMirage: tag 8.46, icon 8.46, bar 5.82"
    - "The unchecked checkbox border, Cancel border, disabled Apply border and search input border resolve >= 3:1 in all 10 themes (worst dracula 4.27 on the bar); nord-light 9.71 / 8.29 / 8.29 / 8.29"
    - "The Queued (checked + disabled) checkbox resolves >= 3:1 at rest in all 10 themes (worst gruvbox_dark 3.91; nord-light 8.88), because it is drawn at full accent with no fill instead of being dimmed by opacity"
    - "The search placeholder resolves >= 4.5:1 in all 10 themes (worst dracula 6.65; nord-light 9.71)"
    - "src/frontend/themes.scss is byte-unchanged; Row/index.scss gains no body.<theme> selector (rowStates.test.tsx scope test); the Apply block gains no unguarded body.* rule (gpn Test C)"
    - "A jest census in themeTokens.test.ts holds every pair above in all 10 themes. It is proven to see the reported defect (the pre-fix pairs fail in the themes the live gate measured them in) and proven able to fail (in-memory sabotage)"
    - "node .planning/quick/261011-kqx-winetricks-tab-contrast-misses-in-nord-l/261011-kqx-contrast-table.mjs prints element / theme / fg / bg / ratio / bar / result for nord-light and midnightMirage (and all 10 themes with --all), shows the color-mix arithmetic, and exits 0"
    - "The todo sits in .planning/todos/completed/ with a ## Fix section. The midnightMirage disabled-Apply-border live miss (1.36 live vs 6.07 token) is a new pending todo (ready: live-gate). The gruvbox_dark hovered-accent observation is appended to the existing gruvbox todo. pnpm planning-gates passes"
  artifacts:
    - path: src/frontend/screens/Settings/sections/WinetricksSettings/index.scss
      provides: "The tab-root custom property --winetricks-danger-text: --danger mixed 40% into --text-default"
      contains: "--winetricks-danger-text"
    - path: src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss
      provides: "Failed tag and danger icon on the derived danger text colour; unchecked box border on --text-secondary; Queued box drawn as an outlined accent check at full opacity"
      contains: "&:disabled[aria-checked='true']"
    - path: src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss
      provides: "Failed count on the derived colour; Cancel and disabled Apply borders on --text-secondary"
      contains: "var(--winetricks-danger-text, var(--danger, #cc3333))"
    - path: src/frontend/screens/Settings/sections/WinetricksSettings/LogPanel/index.scss
      provides: "Error log lines on the derived colour"
      contains: "--winetricks-danger-text"
    - path: src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss
      provides: "Search input border on --text-secondary and an explicit ::placeholder colour"
      contains: "&::placeholder"
    - path: src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
      provides: "Two per-theme WCAG census describes (danger text family; non-text indicators + placeholder), with a color-mix(in srgb) resolver, non-vacuity, pre-fix and sabotage proofs"
      contains: "winetricks-danger-text"
    - path: .planning/quick/261011-kqx-winetricks-tab-contrast-misses-in-nord-l/261011-kqx-contrast-table.mjs
      provides: "Standalone WCAG table with before/after ratios and the mixing arithmetic shown"
      contains: "color-mix"
  key_links:
    - from: src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss
      to: src/frontend/screens/Settings/sections/WinetricksSettings/index.scss
      via: "var(--winetricks-danger-text, ...) resolves against the custom property declared on the .WinetricksSettings root, which every consumer rule is nested under"
      pattern: "--winetricks-danger-text"
    - from: src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
      to: src/frontend/screens/Settings/sections/WinetricksSettings/index.scss
      via: "customProps(cssBlock(indexScss, '.WinetricksSettings')) merged over themeTokens(themesScss, selector), then resolveValue + a color-mix(in srgb) resolver"
      pattern: "WinetricksSettings/index\\.scss"
    - from: src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
      to: src/frontend/themes.scss + src/frontend/styles/_colors.scss
      via: "themeTokens + globalTokens + resolveValue + contrastRatio, the resolver every census in this file uses"
      pattern: "themeTokens\\(themesScss"
---

<objective>
Lift every element the 45-12 G7 live gate measured under its bar in the Winetricks tab (todo `2026-10-11-winetricks-tab-contrast-misses-below-the-45-and-3-bars.md`) to 4.5:1 for text or 3:1 for non-text, in BOTH contract themes. The planner census shows the same pairs also fail in other themes, so the fix holds all 10. Then pin it with a jest census and a standalone WCAG table, and close the todo.

Purpose: D-21's contract (45-UI-SPEC.md L176-186, 45-LIVE-GATE.md G7) requires every text element at >= 4.5:1 and every non-text indicator at >= 3:1. Two of UI-SPEC's own token choices failed that contract when measured: the bare `--danger` alias for Install failed (L150-152), and `--neutral-05` for the unchecked border (L155-159). D-14 reserves red for failure, and the UI-SPEC non-colour rule says colour is never the only signal. Both still hold.

Output: SCSS edits in 5 Winetricks stylesheets, two census describes in `themeTokens.test.ts`, a contrast-table script in this quick dir, the todo moved to `completed/`, one new residual todo, and one appended section on an existing todo.

## Planner census (measured at planning; resolver = the `themeTokens.test.ts` chain, re-implemented in a scratch script)

**The 11 todo rows. Token values are resolved; "live" values are the todo's pixel samples.**

| # | theme | element | live | token pre | token post | bar |
|---|---|---|---|---|---|---|
| 1 | nord-light | Install failed tag text | 3.56 | 3.55 | 8.16 (6.75 on a hovered row) | 4.5 |
| 2 | nord-light | bar `1 failed` | 3.03 | 3.03 | 6.96 | 4.5 |
| 3 | nord-light | unchecked checkbox border | 1.95 | 1.95 | 9.71 | 3 |
| 4 | nord-light | queued (locked) checkbox | 2.87 | 2.52 (accent at opacity 0.5) | 8.88 | 3 |
| 5 | nord-light | search placeholder | 2.04 | 2.04 (UA `darkgray` #a9a9a9) | 9.71 | 4.5 |
| 6 | nord-light | Cancel / Apply borders | 1.66 | 1.66 | 8.29 | 3 |
| 7 | nord-light | Cancel remaining DISABLED text | 3.10 | 3.09 | 3.09 (untouched) | record-only |
| 8 | midnightMirage | Install failed tag text | 2.84 | 2.84 | 8.46 (6.93 hovered) | 4.5 |
| 9 | midnightMirage | danger icon | 2.84 | 2.84 | 8.46 | 3 |
| 10 | midnightMirage | bar `1 failed` | 1.95 | 1.95 | 5.82 | 4.5 |
| 11 | midnightMirage | disabled Apply border | 1.36 | **6.07, NOT reproduced** | 10.49 | 3 |

**Row 11 cannot be closed from the desk.** The token pair, `#a8aeaf` on `#272f31`, already passes at 6.07. Nothing found at planning dims it:
- No global `button:disabled`, `[disabled]`, `filter` or opacity rule reaches `.WinetricksStickyBar__apply`. Searched `src/frontend` `*.css` / `*.scss`.
- nord-light sampled the same border at exactly `A8AEAF`.

The plan changes the token anyway (post 10.49). It does NOT claim row 11 fixed; it files a `ready: live-gate` residual. The leading hypothesis is a 1px border anti-aliased at a fractional backing scale (memory `wkwebview-1px-border-vanishes-on-fractional-grid-track`). That is unverified.

**All-10 census.** The bare `--danger` alias fails 4.5 on the row surface in 7 of 10 themes:

| theme | ratio |
|---|---|
| midnightMirage | 2.84 |
| gruvbox_dark | 2.00 |
| high-contrast | 4.07 |
| nord-light | 3.55 |
| nord-dark | 4.17 |
| marine | 3.45 |
| zombie | 3.22 |

On the bar surface (`--input-background`) it fails in 9 of 10. Only cyberSpaceOasis passes. marine and zombie declare no `--danger` at all, so `var(--danger, #cc3333)` lands on its fallback there. Neither does the base `body {}` block, so memory `status-tokens-are-raw-success-danger-are-theme-adaptive` is stale on that point.

At opacity 0.5 the Queued accent composite fails 3:1 in 5 of 10 themes:

| theme | ratio |
|---|---|
| nord-light | 2.52 |
| gruvbox_dark | 1.97 |
| dracula | 2.57 |
| marine | 2.73 |
| zombie | 2.87 |

gruvbox_dark's accent `#b57614` is only 3.91 at FULL strength, so any opacity below about 0.8 fails there. `--neutral-05` fails only in nord-light. The UA placeholder grey fails only in nord-light.

## Colour strategy (decided at planning, with reasons)

1. **Danger text: a Winetricks-scoped derived colour, not a `themes.scss` change.** The tab root declares `--winetricks-danger-text` as `color-mix(in srgb, var(--danger, #cc3333) 40%, var(--text-default, #caf3fd))`. The four consumers (Row tag, Row icon, StickyBar failed count, LogPanel error line) read `var(--winetricks-danger-text, var(--danger, #cc3333))`.
   - **Why `--text-default` as the mix partner:** it is each theme's own high-contrast pole. It is dark in nord-light (`#20242c`) and light in the 9 dark themes, so one rule darkens or lightens as each theme needs, with no per-theme hex.
   - **Why 40%:** gruvbox_dark binds. Its dark `#9e2c28` on a hovered row gives 4.69 at 40%, 4.28 at 45% and 3.90 at 50%.
   - **Arithmetic, nord-light:** 0.40 × #bf616a (191,97,106) + 0.60 × #20242c (32,36,44) = (95.6, 60.4, 68.8) → #603c45.
   - **Arithmetic, midnightMirage:** 0.40 × #a62b2b (166,43,43) + 0.60 × #caf3fd (202,243,253) = (187.6, 163.0, 169.0) → #bca3a9.
   - **Accepted trade-off:** the red is paler, and in midnightMirage it becomes a dusty rose, because its text pole is cyan. Colour is never the sole signal (D-14 / UI-SPEC non-colour rule: icon plus the word "failed").
   - **Why not `themes.scss`:** `rg -n -e 'var\(--danger[,)]' src/frontend -g '!**/__tests__/**' -g '!themes.scss'` finds 28 uses in 17 files, 24 of them in 14 files OUTSIDE this tab. Many are fills and outlines, not text:
     - `StoreEmbedControls/index.css:80` background
     - `SteamGridDBPicker/index.scss:35` 10% tint background
     - `DownloadManagerItem/index.css:25` and `index.tsx:254` SVG fill
     - `ConsoleMode/index.scss:202` border, plus its `:206`/`:212` hover-background fallback
     - `styles/_buttons.scss:99` and `Settings/index.css:167` focus box-shadows
     - `Login/components/Runner/index.css:124` outline

     A theme-level change repaints all of them in at least 2 themes, and nothing in this task measures them. `RedeemSteamKeyDialog/index.css:11-23` records the same refusal ("inventing an unreviewed replacement colour is worse").
   - **Why the gpn mechanism does not extend:** the gruvbox_dark Retry/Clear miss is still OPEN (pending todo, two un-chosen options). The closed sibling is quick 261011-gpn (Apply). It used a `body.<theme> &:not(:disabled)` override because ONE theme collided. Here `--danger` fails in 7-9 themes. Also, `Row/index.scss` cannot host a `body.<theme>` selector at all: `rowStates.test.tsx:378-386` requires every compiled Row selector to start with `.WinetricksSettings`.
2. **Non-text borders: `--neutral-05` → `--text-secondary`, in one general rule.** This covers the unchecked box, Cancel, disabled Apply and the search input. `--text-secondary` is each theme's own secondary-text token: >= 6.65 at rest on the row surface, >= 4.27 on the bar, in all 10 themes.
   - In 6 of the 9 dark themes it is `#b1b1b1`, within a hair of `#a8aeaf`, so those barely change.
   - It is the colour the disabled-Apply comment already claims ("an outline in the secondary text colour"), which the old border never honoured.
   - A nord-light-only override would fit gpn's precedent for the bar and the search input. It is ruled out for the Row box by the scope test above, and a split mechanism across files is worse than one rule.
   - The search input border is census-found: same token, same 1.66 / 1.95 failure in nord-light. The EverythingElse comment ties it to "the unchecked-checkbox border step".
3. **Queued checkbox: outlined accent check at full opacity, not an opacity dim.**
   - `&:disabled[aria-checked='true']` sets `opacity: 1`. The box `background` becomes `transparent`, and the tick (`::after`) takes `border-color: var(--accent, #0080ff)`. The box edge stays accent from the checked rule.
   - It still reads as "checked, disabled, dimmer than Selected" (no fill), and holds the theme's full accent (>= 3.91 in all 10).
   - This changes UI-SPEC's mechanism ("opacity reduced", L504) because no opacity value can meet the spec's own 3:1 contract in gruvbox_dark. Reversibility: reversible (CSS only).
   - Unchecked-but-locked boxes keep the 0.5 dim. They are an inactive control, outside both the G7 cells and WCAG 1.4.11.
4. **Placeholder: an explicit `&::placeholder { color: var(--text-secondary, #a8aeaf); opacity: 1; }`.** The UA grey is not a theme token. themes.scss's `body.nord-light .searchBarInput::placeholder` is the precedent for setting it.

**Non-text pairs are measured at rest; text pairs at rest AND on the hovered row.** G7 holds hover TEXT to 4.5 and makes hover FILL record-only. Out of scope, but recorded: gruvbox_dark's accent on a hovered row (10% `#eae8e5` over `#282828` = `#3b3b3b`) is 2.96. That is under 3 for BOTH Selected and Queued boxes, and pre-existing for Selected. Task 3 appends it to the open gruvbox todo, whose option (b) (a lighter gruvbox accent) would lift both.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/todos/pending/2026-10-11-winetricks-tab-contrast-misses-below-the-45-and-3-bars.md
@.planning/quick/261011-gpn-fix-the-winetricks-apply-enabled-button-/261011-gpn-SUMMARY.md

Load `Skill("gamelib-conventions")` before writing any `<verify>`-adjacent formatter step or the new pending todo. Two rules apply:
- **Formatter rule:** `--file-info` first, then `npx prettier --check` over the exact written paths.
- **Todo triage frontmatter:** `severity:`, `platform:`, `ready:`, bare, lowercase, in that order, immediately after `area:`.

**Grounded at planning (do not re-derive):**
- Branch `quick-261002-b63`, HEAD `a4fd8505d`.
- `.planning/milestone.lock` is untracked and must never be staged. Stage explicit paths only, never `git add -A` or `.`.
- Baseline jest run, paths FIRST and `--selectProjects Frontend` LAST: `pnpm jest src/frontend/screens/Settings/sections/WinetricksSettings src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts --selectProjects Frontend` measured `Test Suites: 14 passed, 14 total` / `Tests: 336 passed, 336 total`. If `Test Suites:` ever reads more than 14 + 0 new suites, the paths were swallowed by `--selectProjects` and the whole Frontend project ran.
- `npx prettier --file-info` reports `{ "ignored": false, ... }` for all six `src/` paths this plan writes (scss / typescript parsers). It reports `{ "ignored": true, "inferredParser": null }` for anything under `.planning/`. `npx prettier --check` over the six `src/` paths is green at HEAD.
- No `src/frontend` file is added, deleted or moved, and none of the six is in `meta/i18nGateScope.json` / `meta/i18nForkTouchedFiles.json`, so the Meta jest project is not implicated. Nothing here spawns a child process, so fake-HOME isolation does not apply.

**themeTokens.test.ts map (1291 lines; every helper is a module-private `const`, so new describes MUST be appended at the END of the file, or a describe-time call to a later `const` hits the TDZ):**

| Lines | What |
|---|---|
| L30-31 | `read()` (strips block comments and WHOLE-line `//` comments only) |
| L33 | `THEMES_SCSS` |
| L57-68 | `themeSelectors` (10 themes) |
| L122-138 | `cssBlock` (first exact `selector {` match) |
| L417 | `COLORS_SCSS` |
| L422 | `customProps` (depth-0 custom props) |
| L450 | `globalTokens` |
| L468 | `allBlocksFor` |
| L493 | `themeTokens` |
| L504 | `resolveValue` (returns any non-`var()` literal unchanged, so a `color-mix(...)` string comes back as-is) |
| L524 | `NAMED_COLOURS` |
| L531 | `toRgb` |
| L550 | `relativeLuminance` (0.03928 threshold) |
| L558 | `contrastRatio` |
| L669 | `declsAtDepthZero` |
| L697 | `isOpaqueColour` |
| L778 | `nestedRules` |
| L902 | `WINETRICKS_STICKY_BAR_SCSS` (already exists; reuse it) |
| L964-1099 | the gpn Apply describe. Copy its shape: non-vacuity, `it.each(themeSelectors)` with object-form expect, a literal pre-fix pair test, an in-memory string sabotage. Its Test C needs every depth-0 `body.*` nested rule in the Apply block to end with `&:not(:disabled)`, and the `&:disabled` body to keep `background: transparent` and exactly one `color`. |
| L1101-1291 | the sign-in describe (the `signInNoticeRule` path-walker at L1111 is a model for walking nested rules by exact selector) |

**Stylesheet facts the census depends on (HEAD `a4fd8505d`):**

*Row/index.scss*
- `.WinetricksRow` (L23) paints `color: var(--text-default, #caf3fd)` and NO background of its own.
- Its `&:hover` paints `background: color-mix(in srgb, currentColor 10%, transparent)`, so the hovered surface = 10% `--text-default` over the dialog surface.
- The dialog paints `var(--modal-background)` (`components/UI/Dialog/components/Dialog.tsx:53`). All 10 themes declare both `--modal-background` and `--body-background`; they differ only in high-contrast. The census holds row pairs against BOTH.
- The danger consumers are at L134 (`.WinetricksRow__icon` → `&--errored`) and L245 (`.WinetricksRow__tag` → `&--errored`).
- `.WinetricksRow__box` border is at L118.
- `.WinetricksRow__checkbox` has `&:disabled { opacity: 0.5 }` at L84-87 and the checked rule (accent fill and border, `::after` tick in `--background`) at L92-108.
- Retry's `&:disabled` opacity at L276 is out of scope.

*StickyBar/index.scss*
- `.WinetricksStickyBar` background is `var(--input-background, #272f31)` (L24).
- `__failed` is at L43-52 (danger at L46).
- The disabled Apply border is L113.
- Cancel's border is L121; its `&:disabled` sets opacity 0.6 at L125-128, which makes it record-only.

*LogPanel/index.scss*
- `.WinetricksLogPanel` background is `var(--input-background, #272f31)` (L20).
- `.log-error` is at L79-81.
- `logPanel.test.tsx:204-206` reads the RAW file (no comment stripping). It asserts the literal `--danger` occurs EXACTLY once, inside the `log-error` rule. The new consumer keeps exactly one occurrence, its fallback arm. `--winetricks-danger-text` does not contain the substring `--danger`, because only one hyphen precedes `danger`. No comment in this file may write that literal.

*EverythingElseGroup/index.scss*
- `.WinetricksEverythingElse__search` (wrapper) background is `var(--input-background, #272f31)`.
- `.WinetricksEverythingElse__input` (L37-55) background is `var(--body-background, #070a0b)`, with the border at L46 and no placeholder rule.
- `everythingElse.test.tsx:368-386` pins the sticky / top / `var(--input-background, #272f31)` literals and forbids `max-height` and overflow scrolling.

*WinetricksSettings/index.scss*
- The `.WinetricksSettings {` root block begins at L21 and is the FIRST match for that needle.
- Its header comment promises every `var()` carries a fallback. D-21's `tokenCensus.test.ts` enforces that, and bans `--navbar-*`, `--text-hover`, raw `--status-*` and `--border-color`.

**Comment rules for every SCSS edit (all three are load-bearing):**
- WHOLE-line `//` comments only, never a trailing comment on a declaration line. `read()` strips whole lines only, so a trailing comment would glue onto the next statement.
- Never write the pre-fix declarations verbatim in a comment. Name the token instead.
- Never write the two-hyphen danger alias in a LogPanel comment.

Mark every new comment block NOT LIVE-VERIFIED: contrast arithmetic only; a capture is owed at the next 45-12 re-run.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Danger-text census (RED in 9 of 10 themes), then the tab-root derived colour and its four consumers (GREEN)</name>
  <files>src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts, src/frontend/screens/Settings/sections/WinetricksSettings/index.scss, src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss, src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss, src/frontend/screens/Settings/sections/WinetricksSettings/LogPanel/index.scss</files>
  <precondition>`git merge-base --is-ancestor a4fd8505d HEAD` exits 0, and `git diff --quiet HEAD -- src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/screens/Settings/sections/WinetricksSettings` exits 0. Record `git branch --show-current` for the SUMMARY.</precondition>
  <read_first>
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts: only the ranges in the `<context>` map (L1-35, L57-68, L114-139, L417-566, L663-705, L775-806, L900-1099, L1101-1130).
    - src/frontend/screens/Settings/sections/WinetricksSettings/index.scss: L1-30 (header and the start of the root block).
    - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss: the whole file (279 lines).
    - src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss: L1-52.
    - src/frontend/screens/Settings/sections/WinetricksSettings/LogPanel/index.scss: L1-20 and L75-82.
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/logPanel.test.tsx: L190-212.
  </read_first>
  <behavior>
    - New describe appended at the END of `themeTokens.test.ts`, titled "Winetricks failed-state danger text contrast in every theme (45-12 G7, 261011-kqx)".
    - Test "non-vacuity" checks:
      - `globals.size > 0`.
      - The `.WinetricksSettings` root block of `WinetricksSettings/index.scss` declares exactly one `--winetricks-danger-text`, whose (whitespace-collapsed) value begins `color-mix(` and contains `var(--danger` and `var(--text-default`.
      - Each of the four consumers has exactly one depth-0 `color` that begins `var(--winetricks-danger-text,` and whose fallback arm contains `var(--danger`. The consumers are: Row `.WinetricksRow__tag` → `&--errored`; Row `.WinetricksRow__icon` → `&--errored`; StickyBar `.WinetricksStickyBar .WinetricksStickyBar__failed`; LogPanel `.WinetricksLogPanel .log-error`.
      - The `.WinetricksRow` depth-0 `color` resolves non-null.
      - Its `&:hover` depth-0 `background` equals exactly `color-mix(in srgb, currentColor 10%, transparent)`.
      - The StickyBar and LogPanel surfaces (depth-0 `background` of `.WinetricksStickyBar` and `.WinetricksLogPanel`) match `var(--input-background`.
    - Test "colour-mix arithmetic":
      - `color-mix(in srgb, #ff0000 40%, #0000ff)` resolves to `#660099`.
      - With no percentage given, `#ff0000` and `#0000ff` resolve to `#800080`.
      - The whitespace-collapsed prettier-wrapped form `color-mix( in srgb, #ff0000 40%, #0000ff )` resolves identically.
      - A `transparent` or `currentColor` argument throws rather than mis-resolving.
    - `it.each(themeSelectors)` "%s paints failed-state danger text >= 4.5:1 and the danger icon >= 3:1". It expects `{ theme, failures }` to equal `{ theme, failures: [] }`, where `failures` lists each miss as `<label> <fg> on <bg> (<surface>) = <ratio> < <bar>`. Pairs:
      - Tag: 4.5, against `var(--modal-background)` and `var(--body-background)` AND both hovered surfaces.
      - Icon: 3, rest surfaces only.
      - Failed count: 4.5, against the sticky-bar background.
      - Log error line: 4.5, against the log-panel background.
    - Test "pre-fix pair fails where the live gate measured it". The literal pre-fix foreground `var(--danger, #cc3333)` must resolve < 4.5 in nord-light and in midnightMirage, against both the rest row surface and `var(--input-background)`. Planning values: 3.55 / 3.03 and 2.84 / 1.95.
    - Test "checker can fail, in memory only":
      - First assert the literal `40%` occurs exactly once in the root block text.
      - Replace it with `100%` in a STRING copy of `index.scss`.
      - The census function must then return a non-empty failure list for both nord-light and midnightMirage.
    - **RED, before any SCSS edit:** non-vacuity fails; 9 of the 10 per-theme cases fail (all but cyberSpaceOasis); sabotage fails (no `40%` in a root block that has no token yet). That is 11 failed. The arithmetic and pre-fix tests pass. Record the actual count.
    - **GREEN:** all 14 new tests pass and the full verify run reads `Test Suites: 14 passed` and `Tests: 350 passed` (336 + 14). Record the actual numbers.
  </behavior>
  <action>
    **RED first (per D-21: the census reads the authored declarations, never a copy).** Append to the END of `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts`:

    (1) **Module constants.** `WINETRICKS_INDEX_SCSS`, `WINETRICKS_ROW_SCSS` and `WINETRICKS_LOG_PANEL_SCSS` hold the repo-relative paths. Reuse the existing `WINETRICKS_STICKY_BAR_SCSS`.

    (2) **`mixSrgb(a, b, weightA)`.** Takes two hex strings, mixes each channel as `weightA·a + (1−weightA)·b` through `toRgb`, rounds each channel to an integer, and returns a 6-digit lowercase hex. One helper serves both color-mix and opacity / hover compositing over an opaque surface.

    (3) **`resolveColour(value, scope, globals)`.**
    - Calls `resolveValue`. A null result stays null.
    - A result that does not begin with `color-mix(` is returned as-is.
    - Otherwise it parses the expression: strip the outer `color-mix(` and `)`, then trim; split on TOP-LEVEL commas only (track paren depth, because `var()` fallbacks contain commas). The first argument must be exactly `in srgb`; throw otherwise.
    - Each of the two colour arguments is a colour expression plus an optional trailing `NN%`. Resolve each through `resolveColour` recursively, and throw if it is not a hex or named colour `toRgb` accepts (this is what rejects `transparent` / `currentColor`).
    - Weights follow CSS: one percentage given means the other is 100 − p; none means 50/50; both means normalise by their sum.
    - Return `mixSrgb`.

    (4) **`winetricksScope(themesScss, selector, indexScss)`.** A new Map of `themeTokens(themesScss, selector)`, overlaid with `customProps(cssBlock(indexScss, '.WinetricksSettings'))`. The tab root is a descendant of `body`, so its custom properties win.

    (5) **`nestedRule(body, selector)`.** Returns the body of the depth-0 nested rule whose selector equals the given string exactly, via `nestedRules`. It throws, naming the selector, when absent.

    (6) **`rowSurfaces(rowScss, scope, globals)`.**
    - Rest: `var(--modal-background)` and `var(--body-background)`, resolved non-null.
    - Hovered: for each rest surface, `mixSrgb(rowColour, surface, p)`. `rowColour` is the resolved `.WinetricksRow` depth-0 `color`. `p` is the percentage parsed from that rule's `&:hover` background with `/currentColor\s+(\d+)%/`, divided by 100.
    - Each surface is returned with a label (`modal`, `body`, `hovered modal`, `hovered body`).

    (7) **`dangerTextFailures({ indexScss, rowScss, stickyBarScss, logPanelScss, themesScss, globals, selector })`.** Returns the failure strings for one theme across the four pairs in `<behavior>`. Every foreground goes through `resolveColour(…, winetricksScope(…))`. An unresolvable value is itself a failure entry ("unresolved"), never a skip.

    Then write the describe with the five tests in `<behavior>`. Use the object-form expect so a failure prints the theme and every miss. Above the describe, add a JSDoc covering:
    - the todo, and the G7 live values 3.56 / 3.03 nord-light and 2.84 / 2.84 / 1.95 midnightMirage;
    - why the census lives here (the resolver is module-private, the gpn precedent);
    - that row text is held on hovered surfaces because G7 holds hover TEXT to 4.5;
    - that no CSS engine runs, so a live capture still adjudicates.

    Run the jest verify command BEFORE touching any SCSS and confirm the RED shape. If the per-theme cases PASS on the unmodified files, the census is reading the wrong declaration: fix the test, not the SCSS.

    **GREEN (per D-14: red stays reserved for failure, made legible; the colour stays paired with the icon and the word "failed").**
    - (a) `WinetricksSettings/index.scss`: make the FIRST declaration of the `.WinetricksSettings` root block the custom property `--winetricks-danger-text`, with value `color-mix(in srgb, var(--danger, #cc3333) 40%, var(--text-default, #caf3fd))`. Prettier may wrap it; leave prettier's form. Put a whole-line comment block above it giving:
      - the measured reason (the bare alias resolves under 4.5 on the row surface in 7 of 10 themes and on the bar in 9 of 10; nord-light 3.55, midnightMirage 2.84);
      - why `--text-default` is the mix partner (each theme's own high-contrast pole);
      - why 40% (gruvbox_dark binds at 4.69 on a hovered row; 45% gives 4.28);
      - why not `themes.scss` (24 other uses in 14 files, including fills and outlines, which this census does not measure);
      - the paler-red trade-off and the D-14 non-colour pairing;
      - NOT LIVE-VERIFIED.
    - (b) Change the depth-0 `color` declaration to `var(--winetricks-danger-text, var(--danger, #cc3333))` in each of the four consumers that today read the danger alias directly: Row L134 (icon `&--errored`), Row L245 (tag `&--errored`), StickyBar L46 (`__failed`) and LogPanel L80 (`.log-error`).
      - Update the StickyBar `__failed` comment (L44-45) and the LogPanel header sentence (L10-11) to say red comes from the tab's derived danger colour.
      - In LogPanel, keep it true that the error rule is the only rule that reaches for the alias. Do not write the two-hyphen alias literal anywhere in a LogPanel comment.
    - Touch nothing else in these files. Do not edit `src/frontend/themes.scss`.

    Re-run the jest verify command (GREEN). Run the prettier verify. If `--check` flags a file, run `npx prettier --write` on exactly that path and re-check. Run eslint and codecheck.

    Commit exactly the five paths:
    - Subject: `fix(winetricks): derive a theme-adaptive danger text colour so failed-state reds clear 4.5:1 in every theme (261011-kqx)`
    - Body: name the RED/GREEN counts, the 40% mix with the gruvbox_dark binding value, and that `themes.scss` is untouched.
  </action>
  <verify>
    <automated>pnpm jest src/frontend/screens/Settings/sections/WinetricksSettings src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts --selectProjects Frontend</automated>
    <automated>for p in src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/index.scss src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss src/frontend/screens/Settings/sections/WinetricksSettings/LogPanel/index.scss; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || { echo "prettier ignores $p"; exit 1; }; done && npx prettier --check src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/index.scss src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss src/frontend/screens/Settings/sections/WinetricksSettings/LogPanel/index.scss</automated>
    <automated>npx eslint src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts && pnpm codecheck</automated>
    <automated>git diff --quiet a4fd8505d -- src/frontend/themes.scss && ! grep -hv '^[[:space:]]*//' src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss src/frontend/screens/Settings/sections/WinetricksSettings/LogPanel/index.scss | grep -q 'color: var(--danger, #cc3333);' && test "$(grep -hv '^[[:space:]]*//' src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss src/frontend/screens/Settings/sections/WinetricksSettings/LogPanel/index.scss | grep -o 'var(--winetricks-danger-text, var(--danger, #cc3333))' | wc -l | tr -d ' ')" = 4</automated>
  </verify>
  <done>
    - RED recorded (expected 11 failed in the new describe) before any SCSS edit.
    - GREEN: `Test Suites: 14 passed, 14 total`, with the `Tests:` line recorded (expected 350). `logPanel.test.tsx`, `rowStates.test.tsx`, `tokenCensus.test.ts` and gpn's Apply describe all green.
    - Prettier, eslint and codecheck are green. `themes.scss` is unchanged.
    - Exactly four consumers read the derived colour. One commit, five paths.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Non-text indicator and placeholder census (RED in 5 themes), then text-secondary borders, the outlined Queued check, and an explicit placeholder colour (GREEN)</name>
  <files>src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts, src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss, src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss, src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss</files>
  <precondition>Task 1's commit is HEAD: `git log -1 --format=%s` contains `(261011-kqx)`, and the four files start clean (`git diff --quiet HEAD -- <the four paths>`).</precondition>
  <read_first>
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts: Task 1's appended describe and helpers only.
    - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss: L52-120.
    - src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss: L54-130.
    - src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss: L28-62.
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx: L362-390 (the compiled-selector scope test).
    - .planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-UI-SPEC.md: L146-160 and L504 (the token and Queued wording this task supersedes).
  </read_first>
  <behavior>
    - New describe appended at the END of the file (after Task 1's), titled "Winetricks checkbox, button and search indicators and the search placeholder in every theme (45-12 G7, 261011-kqx)". It reuses Task 1's helpers.
    - Test "non-vacuity":
      - Row `.WinetricksRow__checkbox` contains a nested `&:disabled[aria-checked='true']` rule whose depth-0 `opacity` is `1`. Inside it, a nested `.WinetricksRow__box` has depth-0 `background: transparent` and a nested `&::after` with a `border-color` matching `var(--accent`.
      - The checked rule `&[aria-checked='true'] .WinetricksRow__box` keeps `border-color` matching `var(--accent`.
      - EverythingElse `.WinetricksEverythingElse__input` has a nested `&::placeholder` with exactly one `color` and `opacity: 1`.
      - Each of the four border declarations resolves non-null.
    - `it.each(themeSelectors)` "%s holds every indicator at >= 3:1 and the placeholder at >= 4.5:1". It expects `{ theme, failures }` to equal `{ theme, failures: [] }`. Pairs, all at rest (non-text) except where noted:
      - (i) Unchecked box border vs the two rest row surfaces, 3. The colour is the `.WinetricksRow__box` `border` shorthand's colour: the substring from its first `var(`.
      - (ii) Queued box vs the two rest row surfaces, 3. Colour and alpha come from `queuedIndicator(rowScss)`: if the queued rule exists, the tick `border-color` at that rule's opacity; otherwise the checked rule's `background` composited at the `&:disabled` opacity. Composite with `mixSrgb(colour, surface, alpha)`.
      - (iii) Cancel border vs the sticky-bar background, 3. The colour is from the `border` shorthand of `.WinetricksStickyBar .WinetricksStickyBar__cancel`.
      - (iv) Disabled Apply border vs the sticky-bar background, 3. The colour is the `&:disabled` `border-color` of the Apply block.
      - (v) Search input border vs the wrapper `.WinetricksEverythingElse__search` background AND vs the input's own background, 3.
      - (vi) Placeholder vs the input's own background, 4.5 (text). The colour is the `&::placeholder` `color`, falling back to a named constant `UA_PLACEHOLDER = '#a9a9a9'` (WebKit / Chromium UA `darkgray`) when no rule exists.
    - Test "pre-fix pairs fail where the live gate measured them". In nord-light, each literal pre-fix value resolves under its bar:
      - `var(--neutral-05, #a8aeaf)` on the rest row surface (1.95) and on `var(--input-background)` (1.66);
      - `var(--accent, #0080ff)` at alpha 0.5 on the rest row surface (2.52);
      - `#a9a9a9` on `var(--body-background)` (2.04).
    - Test "checker can fail, in memory only":
      - Assert the literal `opacity: 1` occurs exactly once in the Row source.
      - Replace it with `opacity: 0.5` in a STRING copy.
      - The census function must then return non-empty failures for nord-light and gruvbox_dark.
    - **RED, before any SCSS edit:** non-vacuity fails (no queued rule, no placeholder rule); 5 per-theme cases fail (nord-light, gruvbox_dark, dracula, marine, zombie); sabotage fails (no `opacity: 1`). That is 7 failed. cyberSpaceOasis's pre-fix Queued composite sits at 3.03, so integer channel rounding could tip it to a sixth failure. Record the actual count.
    - **GREEN:** all 13 new tests pass, `Test Suites: 14 passed`, `Tests: 363 passed` (350 + 13). Record actuals.
  </behavior>
  <action>
    <!-- planner-discipline-allow: neutral-05 -->
    **RED first.** Append the second describe as `<behavior>` states, with helpers `borderColourDecl(ruleBody)`, `queuedIndicator(rowScss)` and `indicatorFailures({ rowScss, stickyBarScss, everythingElseScss, indexScss, themesScss, globals, selector })`.

    `borderColourDecl(ruleBody)`:
    - Prefer a depth-0 `border-color`.
    - Else take the depth-0 `border` shorthand and return the substring from its first `var(`.
    - Throw if neither exists.

    Reach rules through `cssBlock` plus Task 1's `nestedRule`, by exact selector. The JSDoc gives:
    - the six G7 rows this covers, with live values;
    - that non-text pairs are held at rest, because G7 makes hover FILL record-only;
    - that Queued is held at its composited colour, so an opacity dim is measured, not ignored.

    Run the jest verify command and confirm the RED shape BEFORE any SCSS edit.

    **GREEN (per D-21's 3:1 non-text contract).**
    - (a) `Row/index.scss`:
      - `.WinetricksRow__box` (L118): the border colour moves from `--neutral-05` to `var(--text-secondary, #a8aeaf)`, keeping `1px solid`.
      - Rewrite the comment at L89-91. It should say: the global neutral step measured 1.95:1 in nord-light (live 45-12 G7); the theme's own secondary-text token holds >= 6.65:1 at rest in all 10 themes; it is still not the generic border-colour token.
      - Inside `.WinetricksRow__checkbox`, AFTER the existing `&[aria-checked='true'] .WinetricksRow__box` block, add a nested `&:disabled[aria-checked='true']` rule with:
        - depth-0 `opacity: 1`;
        - a nested `.WinetricksRow__box` with `background: transparent`;
        - inside that, a nested `&::after` with `border-color: var(--accent, #0080ff)`.

        Compiled, this is `.WinetricksSettings .WinetricksRow__checkbox:disabled[aria-checked='true'] .WinetricksRow__box`, so it keeps the `.WinetricksSettings` prefix that `rowStates.test.tsx` requires and outranks the checked rule.
      - Leave the generic `&:disabled { cursor: not-allowed; opacity: 0.5 }` for unchecked locked boxes.
      - Comment above the new rule: UI-SPEC's Queued state asks for checked, disabled, dimmed. An opacity dim cannot hold 3:1: 0.5 measured 2.87 live in nord-light and resolves under 3 in 5 of 10 themes, and gruvbox_dark's accent is 3.91 even at full strength. The dim is carried by dropping the fill, which keeps the edge and tick at full accent and stays distinct from Selected. Unchecked locked boxes keep the 0.5 dim, as an inactive control outside G7 and WCAG 1.4.11. NOT LIVE-VERIFIED.
    - (b) `StickyBar/index.scss`:
      - Cancel `border` (L121) and the Apply `&:disabled` `border-color` (L113) move from `--neutral-05` to `var(--text-secondary, #a8aeaf)`.
      - Add NO `body.*` rule anywhere in the Apply block (gpn Test C).
      - Update the Apply comment's disabled sentence: the outline now really is the secondary text colour.
      - Add a whole-line comment by the Cancel rule. It should say: the neutral step measured 1.66:1 on nord-light's bar; `--text-secondary` holds >= 4.27:1 in all 10 (dracula lowest); Cancel stays a neutral outline (UI-SPEC: not accent, not danger); midnightMirage's live 1.36:1 disabled-Apply border is NOT reproduced by token resolution (6.07 before this change) and is tracked as a live-gate residual.
    - (c) `EverythingElseGroup/index.scss`, `.WinetricksEverythingElse__input`:
      - The border (L46) moves to `var(--text-secondary, #a8aeaf)`. Update the L44-45 comment to name the secondary-text token as the shared step with the checkbox.
      - Add a nested `&::placeholder` with `color: var(--text-secondary, #a8aeaf)` and `opacity: 1`, placed before `&:focus-visible`.
      - Comment: the UA placeholder grey is not a theme token and measured 2.04:1 on nord-light's input fill; `opacity: 1` because some engines dim placeholders by default; `body.nord-light .searchBarInput::placeholder` in `themes.scss` is the precedent.
      - Do not add `max-height` or any overflow rule (`everythingElse.test.tsx`).

    Re-run jest (GREEN), then prettier (`--write` only on a flagged path, then re-check), eslint and codecheck. Commit exactly the four paths with the subject `fix(winetricks): lift checkbox, button and search borders, the Queued check and the search placeholder to their contrast floors (261011-kqx)`. The body names the RED/GREEN counts and the Queued mechanism change against UI-SPEC L504.
  </action>
  <verify>
    <automated>pnpm jest src/frontend/screens/Settings/sections/WinetricksSettings src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts --selectProjects Frontend</automated>
    <automated>for p in src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || { echo "prettier ignores $p"; exit 1; }; done && npx prettier --check src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss</automated>
    <automated>npx eslint src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts && pnpm codecheck</automated>
    <automated>git diff --quiet a4fd8505d -- src/frontend/themes.scss && ! grep -hv '^[[:space:]]*//' src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss | grep -q 'neutral-05' && grep -q "&:disabled\[aria-checked='true'\]" src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss && grep -q '&::placeholder' src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss</automated>
  </verify>
  <done>
    - RED recorded (expected 7 failed) before any SCSS edit.
    - GREEN: `Test Suites: 14 passed, 14 total`, with the `Tests:` line recorded (expected 363). `rowStates.test.tsx` (scope), `everythingElse.test.tsx` and gpn Test C are green.
    - No non-comment `neutral-05` remains in the three files, and `themes.scss` is unchanged.
    - One commit, four paths.
  </done>
</task>

<task type="auto">
  <name>Task 3: Standalone WCAG table script (before/after, arithmetic shown), full verification battery, close the todo and file the residuals</name>
  <files>.planning/quick/261011-kqx-winetricks-tab-contrast-misses-in-nord-l/261011-kqx-contrast-table.mjs, .planning/todos/completed/2026-10-11-winetricks-tab-contrast-misses-below-the-45-and-3-bars.md, .planning/todos/pending/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md, .planning/todos/pending/2026-10-11-winetricks-disabled-apply-border-reads-1-36-live-in-midnightmirage-but-6-07-by-token.md</files>
  <precondition>Tasks 1 and 2 are committed: `git log -2 --format=%s` shows two `(261011-kqx)` subjects. `ls .planning/todos/completed` succeeds (the directory exists; jj1 closed into it in `6c56101d9`).</precondition>
  <read_first>
    - .planning/todos/pending/2026-10-11-winetricks-tab-contrast-misses-below-the-45-and-3-bars.md (the whole file; it is short).
    - .planning/todos/completed/2026-10-11-winetricks-apply-button-text-is-unreadable-in-nord-light-and-midnightmirage.md: from its `## Fix (` heading to the end (the closure shape to follow).
    - .planning/todos/pending/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md (the whole file).
  </read_first>
  <action>
    **(1) Write `261011-kqx-contrast-table.mjs` in the quick dir.**
    - A Node ESM script using built-ins only (`node:fs`, `node:path`, `node:process`), run from the repo root. Precedent: `.planning/phases/34.10-…/34.10-run4-contract-check.mjs`.
    - If `src/frontend/themes.scss` is absent under `process.cwd()`, exit 2 with "run from the repo root". It spawns nothing and touches no HOME.

    It independently re-implements the jest resolver, so the two can be compared:
    - **Comment stripping:** block comments, then whole-line `//` lines.
    - **Theme scope:** depth-0 custom properties of the base `body {` block, overlaid by every exact `body.<theme> {` block, overlaid by the depth-0 custom properties of `WinetricksSettings/index.scss`'s `.WinetricksSettings {` root block.
    - **Globals:** first occurrence of each `--x:` in `src/frontend/styles/_colors.scss`.
    - **`var()` resolution:** fallbacks plus a cycle guard.
    - **Colours accepted:** hex 3 / 6 / 8 (8 only with alpha `ff`) and `white` / `black` / `gray`. Anything else exits 2, naming the value.
    - **`color-mix(in srgb, A p%, B)`:** depth-aware comma split, CSS weight rules, channels rounded to integers. Every resolution prints a derivation line, e.g. `--winetricks-danger-text [nord-light] = 0.40 × #bf616a (191,97,106) + 0.60 × #20242c (32,36,44) = (95.6, 60.4, 68.8) → #603c45`.
    - **Compositing:** the same arithmetic for hovered row surfaces (10% `.WinetricksRow` colour) and opacity composites, also printing their derivation lines.
    - **WCAG 2.x luminance:** threshold 0.03928, matching `themeTokens.test.ts`; ratio `(Lhi+0.05)/(Llo+0.05)`.

    **A ROWS table:** the 11 todo rows plus 2 census-found rows (log error line; search input border vs its wrapper). Each row carries:
    - the todo theme, or `census`;
    - element label and source file;
    - the AFTER authored foreground declaration text and the literal BEFORE one;
    - the surface declaration(s);
    - the bar (`4.5`, `3` or `record-only`);
    - modifiers: hovered surfaces for row text; alpha before / after for Queued (0.5 → 1) and Cancel-disabled text (0.6 → 0.6).

    **Drift guard:** each AFTER declaration, whitespace-normalised (collapse runs; no space after `(` or before `)`), must occur in its normalised, comment-stripped source. A miss exits 2, naming the row and file.

    **Output:**
    - The default is themes nord-light and midnightMirage; `--all` prints the 10 themes in `themeTokens.test.ts` order.
    - For each theme, print the derivation lines, then a table: `element | theme | fg | bg | before | ratio | bar | result`.
      - Print the binding (lowest-ratio) surface, naming it in the `bg` cell.
      - `result` is PASS, FAIL, or `record` for record-only rows.
    - **Before-check, in the two contract themes only:** each todo row's BEFORE ratio must fail its bar, printed `REPRODUCED`. The exception is row 11, which prints `NOT REPRODUCED (live 1.36, token 6.07)` and does not count as a failure. Any other row not reproducing exits 1 with "script does not see the reported defect".

    **Exit codes:** 0 iff every non-record row PASSes and the before-check holds; 1 on any FAIL; 2 on a structural error.

    Run it both ways from the repo root. Both must exit 0, and the default run's nord-light / midnightMirage numbers must match the plan's census table to 2 decimals. Paste the default-run output into the SUMMARY.

    **(2) Full battery.** Run all of these and record each result in the SUMMARY:
    - the jest command (expected 14 suites, 363 tests);
    - `pnpm codecheck`;
    - `pnpm lint` (standalone);
    - the prettier check over all six `src/` paths;
    - `git diff --quiet a4fd8505d -- src/frontend/themes.scss`;
    - `graphify update .` (graphify-out is gitignored, so nothing to commit).

    **(3) Close the todo.** `git mv .planning/todos/pending/2026-10-11-winetricks-tab-contrast-misses-below-the-45-and-3-bars.md .planning/todos/completed/`, then edit the moved file.
    - Frontmatter is unchanged, except that `files:` gains three paths: `WinetricksSettings/index.scss`, `WinetricksSettings/LogPanel/index.scss` and `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts`. `themes.scss` stays listed.
    - Append `## Fix (2026-10-11, quick 261011-kqx, commits ` followed by the two code-commit short hashes in backticks and a closing `)`. It contains:
      - the colour strategy and its reasons, from this plan's objective, including the `--danger` caller census and why gpn's per-theme override does not extend;
      - the 11-row table (live / token pre / token post / bar / verdict), with row 7 left untouched as record-only and row 11 marked NOT REPRODUCED → residual todo;
      - the two census-found rows;
      - the Queued mechanism change and both UI-SPEC token deviations (L150-159, L504), each superseded by D-21's own measured contract;
      - the jest gate and its proofs, and the script path with both invocations;
      - a statement that `themes.scss` was deliberately not edited;
      - NOT LIVE-VERIFIED: name the G7 cells the next 45-12 re-run must re-sample in both themes (failed tag, danger icon, bar failed count, unchecked box, Queued box, placeholder, Cancel and disabled-Apply borders).

    **(4) Append to the gruvbox todo.** Add a section to `.planning/todos/pending/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md`, headed `## Also measured by quick 261011-kqx (token-resolved)`:
    - gruvbox_dark's `--accent` `#b57614` paints the Selected box fill and, after 261011-kqx, the Queued box's edge and tick.
    - It is 3.91:1 at rest on `#282828`, but 2.96:1 on a hovered row (0.10 × #eae8e5 + 0.90 × #282828 = #3b3b3b), under the 3:1 non-text floor. This is pre-existing for Selected and was not a G7 cell.
    - Option (b), a lighter gruvbox accent, would lift both this and the 4.35:1 text pair; a darker accent would worsen this one.
    - Leave its frontmatter unchanged; `Row/index.scss` is already in `files:`.

    **(5) Create the residual todo** `.planning/todos/pending/2026-10-11-winetricks-disabled-apply-border-reads-1-36-live-in-midnightmirage-but-6-07-by-token.md`.
    - Frontmatter, in this order:
      - `created:` the current ISO timestamp;
      - `title:` "Winetricks disabled Apply border measured 1.36:1 live in midnightMirage but resolves 6.07:1 by token";
      - `area: ui`;
      - `severity: minor`, `platform: macos`, `ready: live-gate`;
      - `found_by:` "quick 261011-kqx token census vs 45-12 G7 live capture, 2026-10-11";
      - `files:` listing the StickyBar path.
    - Body:
      - the live sample (`3D4345` on `272F31`, 1.36, from the source todo's captures);
      - the token values: `#a8aeaf` on `#272f31` = 6.07 before 261011-kqx, `--text-secondary` `#a5edfd` = 10.49 after;
      - that nord-light sampled the same border at exactly `A8AEAF`;
      - that no dimming rule was found (state what was searched);
      - the unverified hypothesis (a 1px border anti-aliased at a fractional backing scale, memory `wkwebview-1px-border-vanishes-on-fractional-grid-track`);
      - what the next 45-12 re-run must capture: the disabled Apply edge in midnightMirage with the backing scale recorded, and whether the 1px edge renders at all.

    **(6) Run the gates and commit.** Run the planning gates. Commit exactly these paths (the `git mv` stages the pending-side deletion):
    - the script;
    - the completed todo;
    - the deleted pending path;
    - the appended gruvbox todo;
    - the new residual todo.

    Use the subject `docs(quick-261011-kqx): add the contrast table script and close the Winetricks contrast-misses todo`.
  </action>
  <verify>
    <automated>node .planning/quick/261011-kqx-winetricks-tab-contrast-misses-in-nord-l/261011-kqx-contrast-table.mjs && node .planning/quick/261011-kqx-winetricks-tab-contrast-misses-in-nord-l/261011-kqx-contrast-table.mjs --all</automated>
    <automated>pnpm jest src/frontend/screens/Settings/sections/WinetricksSettings src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts --selectProjects Frontend && pnpm codecheck && git diff --quiet a4fd8505d -- src/frontend/themes.scss</automated>
    <automated>test -f .planning/todos/completed/2026-10-11-winetricks-tab-contrast-misses-below-the-45-and-3-bars.md && test ! -e .planning/todos/pending/2026-10-11-winetricks-tab-contrast-misses-below-the-45-and-3-bars.md && grep -q '^## Fix (2026-10-11, quick 261011-kqx, commits ' .planning/todos/completed/2026-10-11-winetricks-tab-contrast-misses-below-the-45-and-3-bars.md && grep -q '^## Also measured by quick 261011-kqx' .planning/todos/pending/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md && sed -n '2,10p' .planning/todos/pending/2026-10-11-winetricks-disabled-apply-border-reads-1-36-live-in-midnightmirage-but-6-07-by-token.md | grep -E '^(severity|platform|ready):' | tr '\n' ' ' | grep -qx 'severity: minor platform: macos ready: live-gate ' && pnpm planning-gates</automated>
    <automated>npx prettier --file-info .planning/quick/261011-kqx-winetricks-tab-contrast-misses-in-nord-l/261011-kqx-contrast-table.mjs | grep -Eq '"ignored":[[:space:]]*true' && echo "prettier ignores .planning/ -- --check deliberately omitted (vacuous); files hand-matched to the surrounding corpus"</automated>
  </verify>
  <done>
    - Both script runs exit 0. The default run prints REPRODUCED for rows 1-6 and 8-10, NOT REPRODUCED for row 11, and PASS for every non-record row; its output is in the SUMMARY.
    - The full battery is green and recorded.
    - The todo is in `completed/` with its `## Fix` section; the gruvbox todo carries the appended section; the residual todo passes `pnpm planning-gates` (12/12).
    - One docs commit. `.planning/milestone.lock` is still untracked.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none | Stylesheet token choices, a source-text jest census, and a read-only local script over repo files. No input crosses a trust boundary, no network, no IPC, no new endpoint or schema. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261011-kqx-01 | Tampering | sabotage tests in themeTokens.test.ts | low | mitigate | Sabotage mutates a STRING copy only, never the file on disk (the tokenCensus.test.ts idiom). Each sabotage first asserts its target literal occurs exactly once, so it cannot silently no-op. |
| T-261011-kqx-02 | Information disclosure | 261011-kqx-contrast-table.mjs | low | accept | Reads only repo stylesheets and prints colour values. No env, no HOME, no network, no child process. |
| T-261011-kqx-03 | Repudiation | todo closure evidence | low | mitigate | The closure cites both code-commit hashes, states NOT LIVE-VERIFIED, and files row 11 as a residual instead of claiming it fixed. |
| T-261011-kqx-SC | Tampering | npm/pip/cargo installs | low | accept | This plan installs no packages; the legitimacy gate has nothing to inspect. |
</threat_model>

<verification>
- The jest run over the WinetricksSettings dir plus themeTokens.test.ts: 14 suites, 363 tests, all green. That includes both new census describes, gpn's Apply describe (Test C), `rowStates.test.tsx` (compiled-selector scope), `logPanel.test.tsx` (single danger-alias literal) and `tokenCensus.test.ts` (D-21 fallbacks / banned tokens).
- Both runs of the contrast-table script exit 0, with the before-check reproducing 9 of the 10 reproducible todo rows' failures from tokens (row 7 is record-only; row 11 is the documented exception).
- `pnpm codecheck`, `pnpm lint`, scoped `npx prettier --check` over the six `src/` paths and `pnpm planning-gates` are green.
- `git diff --quiet a4fd8505d -- src/frontend/themes.scss` exits 0.
</verification>

<success_criteria>
- Every todo row except the record-only row 7 and the unreproduced row 11 resolves at or above its bar in its measured theme. Row 7 is recorded unchanged; row 11 is tracked as a live-gate residual.
- Every pair holds in all 10 themes under a jest gate that would have caught the 45-12 G7 misses.
- No theme-level token changed. The colour logic is Winetricks-scoped and theme-adaptive, with no per-theme hex.
- Three commits: two `fix(winetricks): … (261011-kqx)` and one `docs(quick-261011-kqx): …`. No `.planning/milestone.lock` staged.
</success_criteria>

<output>
Create `.planning/quick/261011-kqx-winetricks-tab-contrast-misses-in-nord-l/261011-kqx-SUMMARY.md` when done. Include:
- the RED and GREEN `Tests:` lines for Tasks 1 and 2;
- the contrast-table script's default-run output verbatim;
- the full-battery results table;
- all three commit hashes and the branch;
- an `## Open observations` section naming the owed live captures, the row-11 residual and the gruvbox hovered-accent note.
</output>
