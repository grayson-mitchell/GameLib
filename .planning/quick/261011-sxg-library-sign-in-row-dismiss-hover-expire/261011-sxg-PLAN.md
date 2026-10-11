---
phase: quick-261011-sxg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
  - src/frontend/screens/Library/components/LibrarySignInNotice/index.scss
  - .planning/todos/completed/2026-10-11-library-sign-in-row-glyphs-and-button-hover-miss-in-nord-light.md
autonomous: true
requirements: [F-49-R1-6]

estimate:
  tokens: 40000
  tasks: 3
  confidence: medium

must_haves:
  truths:
    - "The hovered dismiss glyph measures >= 3:1 against --navbar-background in all 10 themes, token-resolved (nord-light 1.52 to 5.43; lowest dracula 3.79)"
    - "The expired row's triangle measures >= 3:1 against --navbar-background in all 10 themes; only nord-light carries a theme-scoped override (2.82 to 4.35); the other nine keep var(--status-danger, orange)"
    - "The in-row footer button's hover and focus-visible state is owned by the notice at (0,4,0): colour inherit, transparent, no box-shadow, underline; focus-visible adds a currentColor outline. Its label stays at the row pair, >= 4.87:1 in every theme"
    - "The themeTokens.test.ts gate was observed RED on the pre-fix stylesheet and GREEN after; themes.scss, _buttons.scss, Settings/index.css and index.tsx are byte-unchanged"
    - "The nord-light residual todo sits in .planning/todos/completed/ with one status: key reading RESOLVED 2026-10-11"
  artifacts:
    - path: src/frontend/screens/Library/components/LibrarySignInNotice/index.scss
      provides: "Dismiss hover on the navbar's active chain; nord-light triangle override; owned button hover/focus-visible"
      contains: "body.nord-light &"
    - path: src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
      provides: "Per-theme 3:1 censuses for the hovered dismiss glyph and the triangle, the hover arm in the inherit table, pre-fix verdict reproduction"
      contains: "expiredTriangleColourDecl"
---

<objective>
Close the three nord-light residuals quick 261011-j8z filed on the Library sign-in row, each
measured through the `themeTokens.test.ts` resolver against the banner's `--navbar-background`
(`#4c566a` in nord-light), and gate all ten themes so the nine that pass today cannot regress.

**Hue decisions (measured at planning, all 10 themes, scratch census mirroring the test resolver):**

1. **Dismiss hover** takes `var(--navbar-active, var(--navbar-accent))`, the navbar surface's own
   active/hovered row hue, so the row keeps painting the navbar's chain as j8z decided. Non-text
   floor 3:1: nord-light 5.43, dracula 3.79 (lowest), the rest 4.87 to 18.73. `--navbar-accent`
   alone was rejected: 2.74 in nord-light.
2. **Expired triangle** keeps `var(--status-danger, orange)` and adds a nested `body.nord-light &`
   override to `#ffb3b8` (4.35:1 on `#4c566a`; dracula would be 5.40). This is the NavTabs /
   FilterFocusRow divider precedent: a measured per-theme collision, not a general rule. A global
   token change was rejected because `--status-danger` paints many unmeasured surfaces, and nord-light
   has no light red token (`--danger` `#bf616a` is 1.80 on the banner).
3. **In-row footer button hover and focus-visible** is owned by the notice with a nested
   `&:hover, &:focus-visible` arm inside the `.button.is-footer` rule, compiling to (0,4,0) and
   beating Settings' (0,3,0) whichever chunk loads first. It keeps `color: inherit` and
   `background-color: transparent` (the row pair, >= 4.87 in every theme), sets `box-shadow: none`
   (Settings' 3px `--danger` ring would otherwise still land), and signals hover with
   `text-decoration: underline`. focus-visible adds the dismiss glyph's `outline: 2px solid
   currentColor` idiom. A hue shift was rejected: the only candidate passing 9 themes,
   `--navbar-active`, is 3.79 in dracula against the 4.5 text floor, and a fill from
   `--navbar-active-background` drops the row pair under 4.5 in four themes and is unresolvable
   (color-mix) in midnightMirage.
</objective>

<tasks>

<task id="1" type="auto">
  <name>RED gate: extend the sign-in row census in themeTokens.test.ts</name>
  <files>src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts</files>
  <action>
    Add per-theme 3:1 censuses for the hovered dismiss glyph and the expired triangle (a
    `dividerColourDecl`-style helper prefers a `body.<theme> &` override), add the hover arm to
    SIGN_IN_ROW_FOREGROUNDS, assert `box-shadow: none`, `text-decoration: underline` and the
    focus-visible outline, reproduce the todo's nord-light fails from the literal pre-fix values,
    and grow the sabotage counts. Make `signInNoticeRule` compare selectors with whitespace
    collapsed so a prettier-wrapped selector list is addressable. Run the suite and observe RED.
  </action>
  <verify>npx jest --selectProjects Frontend src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts -t "sign-in row"; npx prettier --check src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts</verify>
</task>

<task id="2" type="auto">
  <name>GREEN: the three states in LibrarySignInNotice/index.scss</name>
  <files>src/frontend/screens/Library/components/LibrarySignInNotice/index.scss</files>
  <action>
    Dismiss hover to `var(--navbar-active, var(--navbar-accent))`; nested `body.nord-light &`
    on the expired triangle at `#ffb3b8`; nested `&:hover, &:focus-visible` and `&:focus-visible`
    arms inside `.button.is-footer`. Update the two comments that recorded the hover residual.
  </action>
  <verify>npx jest --selectProjects Frontend src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts; pnpm codecheck; npx prettier --check src/frontend/screens/Library/components/LibrarySignInNotice/index.scss src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts</verify>
</task>

<task id="3" type="auto">
  <name>Close the todo</name>
  <files>.planning/todos/completed/2026-10-11-library-sign-in-row-glyphs-and-button-hover-miss-in-nord-light.md</files>
  <action>Move the pending todo to completed with `completed:` and a single `status: "RESOLVED 2026-10-11 ..."` key naming the hues and ratios, and the owed live look.</action>
  <verify>pnpm planning-gates</verify>
</task>

</tasks>
