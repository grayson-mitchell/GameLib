---
phase: quick-261110-nwy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/components/UI/NoticeStack/index.scss
  - src/frontend/components/UI/SteamEngineLaunchNotice/index.scss
  - src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/launchNoticeThemeTokens.test.ts
autonomous: true
requirements: [TODO-2026-11-05-deeper-theming-of-launch-notice-toast]

must_haves:
  truths:
    - "The toast surface is each theme's own popover surface (--background), not the near-universal body colour, so it looks different in dracula, gruvbox_dark, sweet, nord-light and the rest"
    - "The toast has a 1px frame in the theme's own InfoBox/input tint (--input-background), and the leading stripe is still 3px --status-warning"
    - "The title uses the heading font (--primary-font-family) and the theme's title colour (--text-title, falling back to --text-default)"
    - "The per-cause icon takes the theme highlight (--accent). The stripe and the countdown bar still carry the warning (--status-warning)"
    - "The dismiss x uses the theme's action-icon tokens at rest and on hover, with an accent-tinted hover fill"
    - "No behaviour change: class names, TSX, timers and animations are untouched"
  artifacts:
    - path: "src/frontend/components/UI/NoticeStack/index.scss"
      provides: "Themed shared toast surface + frame; warning stripe kept"
      contains: "var(--input-background"
    - path: "src/frontend/components/UI/SteamEngineLaunchNotice/index.scss"
      provides: "Themed title / body / icon / dismiss; warning bar kept"
      contains: "var(--text-title"
    - path: "src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/launchNoticeThemeTokens.test.ts"
      provides: "Source gate pinning the token mapping and the warning semantics"
  key_links:
    - from: "src/frontend/components/UI/NoticeStack/index.scss .noticeStackToast"
      to: "src/frontend/themes.scss body.<theme> --background / --input-background"
      via: "CSS custom properties resolved on body.<theme>"
      pattern: "var\\(--background,"
    - from: "src/frontend/components/UI/SteamEngineLaunchNotice/index.scss"
      to: "src/frontend/styles/_typography.scss --primary-font-family"
      via: "font-family on .steamEngineLaunchNoticeTitle"
      pattern: "--primary-font-family"
---

<objective>
Make the Steam launch notice toast take on each theme's own surface, highlight, text colours
and heading font, the way the app's other themed surfaces do, while the stripe and countdown
bar still read as a warning. SCSS only. No behaviour change.

Purpose: closes `.planning/todos/pending/2026-11-05-deeper-theming-of-launch-notice-toast.md`.
Today the toast reads only generic tokens. In dracula, gruvbox_dark and nord-light,
`--background-darker` IS `--body-background` (themes.scss L287, L378, L420), so the surface
matches the page and only the shadow separates them.

Output: two restyled SCSS files and one source-gate test.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-11-05-deeper-theming-of-launch-notice-toast.md
@.claude/skills/sketch-findings-gamelib/references/notices-and-toasts.md
@src/frontend/components/UI/NoticeStack/index.scss
@src/frontend/components/UI/SteamEngineLaunchNotice/index.scss

<token_evidence>
<!-- Gathered at planning time from src/frontend/themes.scss, styles/_colors.scss and
styles/_typography.scss. Use it directly. Do not re-survey the themes. -->

The 10 shipped themes (themes.scss `^body\.`): midnightMirage, cyberSpaceOasis, gruvbox_dark,
high-contrast, dracula, nord-light, nord-dark, marine, zombie, sweet.

Precedents for themed surfaces:
- Popover (`UI/PopoverComponent/index.scss`): `background-color: var(--background)`,
  `color: var(--text-default)`, frame `var(--border-color)`.
- InfoBox (`UI/InfoBox/index.css`): surface `var(--input-background)`; emphasis
  `strong { color: var(--accent); font-family: var(--secondary-font-family); font-weight: var(--medium) }`.
- Headings (`styles/_typography.scss` L96): `h1..h6, .subtitle { font-family: var(--primary-font-family) }`
  (Rubik). Body text is `--secondary-font-family` (Cabin). No theme overrides either font.
- Game titles / chips: `--text-title` (`styles/_pillChip.scss` uses `var(--text-title, #eae8e5)`).

Per-theme values (`--background` | `--input-background` | `--text-title` | `--action-icon` | `--action-icon-hover`):
- midnightMirage: neutral-02 #161c1e | background-lighter #272f31 | (unset -> text-default) | neutral-05 | text-hover
- cyberSpaceOasis: #151f3d | background-darker #0d0f1c | #ffffff | text-default | brand-text-01
- gruvbox_dark: #1d2021 | #32302f | #f9f5d7 | #f9f5d7 | #b16286
- high-contrast: #121212 | #262937 | #00ddff | (UNSET) | accent
- dracula: #090b1c | #44475a | #8be9fd | text-default | accent
- nord-light: background-light #eceff4 | #d8dee9 | #20242c | #748aa0 | accent
- nord-dark: #191c22 | #2e3440 | brand-text-01 | #748aa0 | accent-overlay
- marine: #031b22 | #063442 | (unset) | text-default | accent
- zombie: #1d1f1f | #323232 | (unset) | text-default | accent
- sweet: #110111 | #360a36 | #e9eaeb | #ab92a8 | accent-overlay

Each theme designs `--text-default` and `--text-secondary` to read on its own `--background`
(the Popover already pairs them). `--accent` is defined in every theme plus `_colors.scss`
(#8bffff). Spot checks against `--background`: gruvbox #b57614 on #1d2021 is about 4.4:1;
nord-light #30444a on #eceff4 reads dark-on-light. Both clear the 3:1 non-text floor for a 16px
glyph.

Do NOT use `--navbar-background` / `--navbar-active` for the toast. In nord-light the navbar is
dark (#4c566a) while `--text-default` is dark (#20242c), so the text would vanish.
`--status-warning` is #f8ae79 (_colors) and nord-light overrides it to #b86901. It is already
per-theme, so the stripe and bar keep it as they are.
</token_evidence>

<shared_surface_note>
`.noticeStackToast` (NoticeStack/index.scss) is the ONE surface for every notice in the stack:
SteamEngineLaunchNotice, HumbleExpiryToast and ReadOnlyStoresNotice (sketch 006 L1, one region).
The surface, frame and stripe changes go there ON PURPOSE, so all three toasts stay visually
one family. Do NOT scope the surface to the Steam toast only. Mixed surfaces in one stack would
be a regression. The Humble/ReadOnly inner sheets are NOT touched.
`noticeStackStylesheetGate.test.ts` only polices `position`/anchor properties, so adding
`border` / `background` / `color` to `.noticeStackToast` does not trip it. Keep it green.
</shared_surface_note>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Map the toast parts onto per-theme tokens (two SCSS files)</name>
  <files>src/frontend/components/UI/NoticeStack/index.scss, src/frontend/components/UI/SteamEngineLaunchNotice/index.scss</files>
  <action>
SCSS only. Do not rename any class. Do not touch any TSX, keyframe, animation, timer,
`position`/anchor or layout property. Use theme variables only. The shadow `rgba` stays the one
allowed literal colour (multi-theme survival rule).

In `NoticeStack/index.scss`, rule `.noticeStackToast`:
1. Surface. Replace `background: var(--background-darker, var(--body-background))` with
   `background: var(--background, var(--background-darker, var(--body-background)))`.
   `--background` is the Popover surface token. It differs from `--body-background` in every
   theme, including dracula (#090b1c vs #282a35) and gruvbox (#1d2021 vs #282828).
2. Frame. Add `border: 1px solid var(--input-background, var(--border-color));` (InfoBox tint,
   per-theme). Place it immediately BEFORE the existing `border-inline-start: 3px solid
   var(--status-warning);`. Source order matters: the shorthand must come first or it wipes the
   warning stripe.
3. Keep `color: var(--text-default)`, the stripe, the radius and the shadow unchanged. Update the
   header comment to say the surface/frame follow the Popover/InfoBox tokens (quick 261110-nwy).
   Do not edit `.claude/skills/sketch-findings-gamelib/references/notices-and-toasts.md`
   (outside this plan). Note in the SUMMARY that its token table is now stale.

In `SteamEngineLaunchNotice/index.scss`:
4. `.steamEngineLaunchNoticeIcon`: `color: var(--accent)` (theme highlight, InfoBox `strong`
   precedent). The warning is carried by the stripe and the countdown bar, which is what the
   todo requires to stay warning-coloured.
5. `.steamEngineLaunchNoticeTitle`: add `font-family: var(--primary-font-family);` (heading
   font, `_typography.scss` h1..h6 precedent) and
   `color: var(--text-title, var(--text-default));`. Keep `font-weight: var(--bold)`.
6. `.steamEngineLaunchNoticeBody`: keep `color: var(--text-secondary)` and add
   `font-family: var(--secondary-font-family);` so the body/title pairing is explicit.
7. `.steamEngineLaunchNoticeDismiss`:
   - rest `color: var(--action-icon, var(--text-secondary))`. The fallback is required:
     high-contrast leaves `--action-icon` unset.
   - `&:hover` `color: var(--action-icon-hover, var(--text-default))` and
     `background: color-mix(in srgb, var(--accent) 16%, transparent)`, replacing the
     text-default 12% mix. This mirrors `--focus-ring-fill`'s accent mix in themes.scss.
   - leave `&:focus-visible` (2px `--accent` outline) as is.
8. `.steamEngineLaunchNoticeBar`: unchanged (`background: var(--status-warning)`, 0.7 / 0.25
   opacity). Update the file header comment: name the mapping in one line and say that the
   stripe and bar stay `--status-warning` on purpose.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx prettier --check src/frontend/components/UI/NoticeStack/index.scss src/frontend/components/UI/SteamEngineLaunchNotice/index.scss && npx jest --selectProjects Frontend src/frontend/components/UI/NoticeStack src/frontend/components/UI/SteamEngineLaunchNotice src/frontend/components/UI/HumbleExpiryToast src/frontend/components/UI/ReadOnlyStoresNotice</automated>
  </verify>
  <done>Both sheets carry the mapping above. `.noticeStackToast` lists `border:` before `border-inline-start:`. The stripe and bar still use `--status-warning`. The only literal colours are the shadow rgba. Prettier is clean, and the existing NoticeStack, Steam, Humble and ReadOnly jest suites pass unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Source gate pinning the token mapping and warning semantics</name>
  <files>src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/launchNoticeThemeTokens.test.ts</files>
  <behavior>
    - `.noticeStackToast` background starts with `var(--background,`
    - `.noticeStackToast` has `border:` using `var(--input-background` that appears BEFORE `border-inline-start:`, and `border-inline-start` still uses `var(--status-warning)`
    - `.steamEngineLaunchNoticeBar` background is `var(--status-warning)` (warning bar kept)
    - `.steamEngineLaunchNoticeTitle` uses `var(--primary-font-family)` and `var(--text-title, var(--text-default))`
    - `.steamEngineLaunchNoticeIcon` colour is `var(--accent)`
    - `.steamEngineLaunchNoticeDismiss` colour is `var(--action-icon, ` with a fallback (high-contrast has no --action-icon)
    - neither sheet contains a hex colour literal or `rgb(`; `rgba(` appears only inside `box-shadow`
  </behavior>
  <action>
Create a node-environment jest source gate. The Frontend project runs `testEnvironment: 'node'`
and has no CSS engine, so this proves the source, not the render. Say so in the file's header
comment, citing quick 261110-nwy and the todo. Read both sheets with `readFileSync`, resolving
from `REPO_ROOT` the same way `NoticeStack/__tests__/noticeStackStylesheetGate.test.ts` does
(`path.resolve(__dirname, '../../../../../..')`). Pipe them through
`stripSourceComments` from `backend/testUtils/stripSourceComments` so comments cannot satisfy or
trip a check. Extract a rule body with a small brace-counted helper keyed on the exact selector
text (e.g. `.noticeStackToast {`). Assert each behaviour bullet with plain `toContain` / `toMatch`
/ index comparisons. Add one self-test that mutates the real source by string replacement (e.g.
swap `var(--status-warning)` in the bar rule for `var(--accent)`), first asserting the
replacement changed the text, then asserting the warning check would fail. This mirrors the
self-test idiom in noticeStackStylesheetGate.test.ts. Run it against Task 1's sheets. It should
pass. Temporarily reverting one mapping locally should make it fail; do not commit that.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx prettier --check src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/launchNoticeThemeTokens.test.ts && npx eslint src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/launchNoticeThemeTokens.test.ts && npx jest --selectProjects Frontend src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/launchNoticeThemeTokens.test.ts</automated>
  </verify>
  <done>The new gate passes. Its self-test proves the warning-bar check bites. Prettier and eslint are clean on the new file.</done>
</task>

</tasks>

<human_verify>
OPERATOR ONLY, after the executor finishes. The executor must NOT attempt this. Record it in
the SUMMARY as pending and leave the todo's `ready: live-gate` until the operator reports.

Live check in `pnpm tauri:dev` (not `tauri:dev:run`):
1. Trigger the engine notice: temporarily rename `/Applications/CrossOver.app` (e.g. to
   `CrossOver.app.off`), launch a bridged Steam game from GameLib, and the notice appears. Rename
   CrossOver back right afterwards.
2. With the notice up (hover pauses the 8s countdown), switch Settings > Interface theme
   through all 10: midnightMirage, cyberSpaceOasis, gruvbox_dark, high-contrast, dracula,
   nord-light, nord-dark, marine, zombie, sweet.
   expected: in each theme the surface is visibly distinct from the page behind it (especially
   dracula, gruvbox_dark, nord-light), the 1px frame is in the theme's own tint, the title is in
   the heading font and the theme's title colour, the body is legible, the icon shows the theme
   accent, the x is visible at rest and accent-filled on hover, and the left stripe and bottom
   bar still read as an orange/amber warning.
3. If a Humble expiry or read-only-stores notice can be shown, confirm it shares the new surface
   and frame and still looks right. Those notices get the shared surface change on purpose.
</human_verify>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none | Stylesheet-only change. No input, IPC, network or process surface is touched. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261110-01 | Spoofing (UI) | toast warning semantics | mitigate | Stripe and bar stay `--status-warning`. Task 2's gate fails if the bar or stripe stops using it, so a notice cannot stop reading as a warning. |
| T-261110-02 | Denial of service (legibility) | dismiss x in high-contrast | mitigate | `var(--action-icon, var(--text-secondary))` fallback, because high-contrast leaves `--action-icon` unset. Pinned by Task 2. |
</threat_model>

<verification>
- Both tasks' automated verify commands pass.
- `git diff --stat` touches only the three files in `files_modified`. No TSX changes.
</verification>

<success_criteria>
- Every toast part is mapped: surface `--background`, frame `--input-background`, stripe
  `--status-warning`, title `--primary-font-family` + `--text-title`, body `--text-secondary` +
  `--secondary-font-family`, icon `--accent`, x `--action-icon`/`--action-icon-hover` + accent
  hover fill, bar `--status-warning`.
- The existing notice suites and the new gate are green, and prettier is clean on all three paths.
- The operator's live 10-theme check is recorded as pending in the SUMMARY, with the
  CrossOver-rename trigger.
</success_criteria>

<output>
Create `.planning/quick/261110-nwy-deeper-theming-of-the-steam-launch-notic/261110-nwy-SUMMARY.md` when done.
</output>
