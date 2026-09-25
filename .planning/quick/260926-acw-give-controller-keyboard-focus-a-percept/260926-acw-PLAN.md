---
phase: quick-260926-acw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/themes.scss
  - src/frontend/screens/ConsoleMode/index.scss
  - src/frontend/screens/Game/GamePage/index.css
  - src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss
  - src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.scss
  - src/frontend/components/UI/NavShell/components/NavItem/index.scss
  - src/frontend/screens/Library/components/GameCard/index.css
  - src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts
  - src/frontend/styles/__tests__/focusIndicator.test.ts
  - .planning/todos/pending/2026-09-25-controller-focus-has-no-perceptible-affordance.md
autonomous: true
requirements: [QUICK-260926-acw]

must_haves:
  truths:
    - "Gamepad-driven focus paints a visible indicator even when the browser does NOT match :focus-visible (Tauri moves focus with a bare el.focus() after untrusted synthetic events)"
    - "On every targeted surface the focus indicator looks different from the hover state: focus is a two-tone ring (accent ring + page-background halo band) plus an accent fill where the surface has room; hover keeps its existing subtle treatment"
    - "The indicator is built from theme tokens that resolve in all 13 theme blocks (light and dark), never from a token some themes lack"
    - "In normal-mode Library, a resting mouse cursor over the grid no longer hides the gamepad-focused card's ring while a controller is active"
    - "The todo stays in pending/ with ready: live-gate until the operator's live controller sweep confirms"
  artifacts:
    - path: "src/frontend/themes.scss"
      provides: "Shared focus tokens --focus-ring-color, --focus-ring-halo, --focus-ring-width, --focus-ring-fill in the base body {} block"
      contains: "--focus-ring-color"
    - path: "src/frontend/styles/__tests__/focusIndicator.test.ts"
      provides: "Source-text gate: every targeted surface carries both selector arms, consumes the tokens, and does not group hover with focus"
    - path: "src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts"
      provides: "pga gate rewritten to the split hover/focus contract"
  key_links:
    - from: "src/frontend/state/GlobalState.tsx (controller-changed listener, ~line 1776)"
      to: "every targeted focus rule"
      via: "body.controllerLayout class, matched as :focus:is(body.controllerLayout *)"
      pattern: "is\\(body\\.controllerLayout \\*\\)"
    - from: "src/frontend/themes.scss base body {}"
      to: "all surface stylesheets"
      via: "var(--focus-ring-color) / var(--focus-ring-halo) / var(--focus-ring-fill)"
      pattern: "var\\(--focus-ring-"
---

<objective>
Action the todo `.planning/todos/pending/2026-09-25-controller-focus-has-no-perceptible-affordance.md`
(severity major): give controller/keyboard focus a clearly perceptible, hover-distinct indicator on
Console Mode chips and buttons, the tier-2 filter panel rows (FilterFacetRow, facet group headers,
FilterMoreGroup "only" buttons, FilterCollectionList__row via NavItem), and the game-page split-button
caret. Also resolve the todo's "adjacency" note about quick 260925-pga by splitting the game-card
hover and focus looks.

Purpose: during the Phase 38 controller sitting the operator could not see where focus was, and 38-C06
clause (3) had to be discharged on log evidence instead of the operator's eyes.

Output: shared focus tokens, restyled focus rules on the listed surfaces, a split game-card ring, a
cross-surface source-text gate, and the todo moved to `ready: live-gate` (it stays in pending/).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-09-25-controller-focus-has-no-perceptible-affordance.md
@.planning/quick/260925-pga-make-highlighted-game-cards-in-non-conso/260925-pga-SUMMARY.md

<investigation_findings>
These were established at plan time. Use them as given. Do not re-investigate.

F1. How gamepad focus moves (this is why the CSS must not rely on :focus-visible alone).
  `src/frontend/helpers/gamepad.ts` sends directional and tab actions to `window.api.gamepadAction`.
  Under Tauri that goes to `src/preload/api/tauriGamepadInput.ts`, which is pure DOM. It dispatches
  UNTRUSTED synthetic `KeyboardEvent`s (`dispatchKey`) and then moves focus with a bare `.focus()`:
  `list[nextIndex]?.focus()` in `doTab`, and `best?.focus()` in `moveFocusDirectionally` (~line 352).
  Neither passes `{ focusVisible: true }`. Console Mode focuses its chips the same way
  (`ConsoleMode/index.tsx` ~331/345/372, `btns[next].focus()`). Chromium and WebKit decide whether a
  script `.focus()` matches `:focus-visible` from the last TRUSTED user interaction. A gamepad press
  is not one, so after any mouse use a gamepad-moved focus will often NOT match `:focus-visible`.
  This is consistent with the sitting: FilterFacetRow already has a 2px accent `:focus-visible` outline,
  yet the operator reported they could not see it. (Inference from browser heuristics plus the sitting
  evidence. Only the live sweep can confirm it.)

F2. A class-based fallback already exists. `src/frontend/state/GlobalState.tsx` ~1773-1779 toggles
  `document.body.classList.toggle('controllerLayout', controllerId !== '')` on the `controller-changed`
  event. `gamepad.ts` fires that event (via `emitControllerEvent`) on the first action from a
  controller, and clears it only on disconnect. `InfoIcon/index.css:15` already keys on
  `body.controllerLayout`. So the canonical focus selector pair for every targeted surface is:
    `X:focus-visible, X:focus:is(body.controllerLayout *)`
  Use the `:is(body.controllerLayout *)` suffix form, NOT a `body.controllerLayout X:focus` prefix.
  Most tier-2 rules are nested inside a `.NavShell__tier2Portal { ... }` wrapper
  (`FilterFacetGroup/index.scss:37`), where a prefix would compile to
  `.NavShell__tier2Portal body.controllerLayout ...` and never match. The suffix form works nested,
  unnested, and in plain `.css` files.
  Rejected alternative: adding `{ focusVisible: true }` to the `.focus()` calls in
  `tauriGamepadInput.ts`. WebKit support is uncertain, it would still leave Console Mode's own
  `.focus()` calls uncovered, and it touches a pinned preload module. Stay CSS-only.

F3. What quick 260925-pga actually changed. The todo's wording is inaccurate: pga did NOT touch
  `:focus-visible`, and it did NOT touch any of the three surfaces this todo names. It unified
  `:hover` and `:focus-within` onto one 3px accent ring for `.gameCard` and `.gameListItem` only
  (`GameCard/index.css` ~36-45 and ~393-397). It also added "hover wins while mousing" suppression:
  `.gameList:hover .gameCard:focus-within:not(:hover)` (~60 and ~232) and
  `.gameListLayout:hover .gameListItem:focus-within:not(:hover)` (~404).
  The adjacency concern IS real on game cards, in two ways:
  (a) Hover and focus are pixel-identical, so the operator cannot tell which one a ring means.
  (b) Worse: when the mouse cursor is merely RESTING anywhere over the grid while the operator drives
  the gamepad, the `.gameList:hover` suppression removes the ring AND the scale from the
  gamepad-focused card. Normal-mode gamepad focus becomes invisible just because the cursor was left
  parked over the grid. That is this todo's defect, produced by pga.
  The operator's pga "hover wins while mousing" choice was made while the two rings looked identical.
  This plan KEEPS that choice for mouse-only sessions by scoping the suppression to
  `body:not(.controllerLayout)`, so it no longer applies when a controller is active. Record this
  scoping as a deviation from pga round 3 in the SUMMARY. pga's own Task 3 human check is still
  pending, and this plan supersedes its steps 1-3 and 5.

F4. Existing per-surface state at plan time (line numbers are approximate):
  - `ConsoleMode/index.scss` ~94-130: `.consoleChip` puts `&:hover, &:focus-visible` in one rule
    (1px accent border-color, `outline: none`) and `&:hover.active, &:focus-visible.active` in another.
    ~159-175: a cancel/danger pill puts `&:hover, &:focus-visible` in one rule (fill), also inside
    `&.danger`. Every one of these hover/focus groupings must be split.
  - `FilterFacetGroup/index.scss` ~103-110 (`.FilterFacetGroup .dropdownButton` hover / focus-visible,
    i.e. the collapsible group headers) and ~237-245 (`.FilterFacetRow` hover / focus-visible).
    Hover uses `--navbar-active-background`, which is ALSO the checked-row background
    (`.FilterFacetRow--checked`). So focus must NOT use that background, or a focused row looks the
    same as a checked row.
  - `FilterMoreGroup/index.scss` ~62: `.FilterMoreGroup__only:focus-visible` 2px accent outline.
  - `NavItem/index.scss` ~55: `.NavItem:focus-visible { outline: 2px solid var(--navitem-hover-color) }`,
    where `--navitem-hover-color: var(--text-hover)`. FilterFacetGroup's header comment documents that
    `--text-hover` is undefined in gruvbox_dark and dracula. An undefined custom property with no
    fallback drops the whole declaration, so in those themes FilterCollectionList__row (a NavItem) has
    NO focus outline at all. That is a theme-survival bug fixed by this plan.
  - Game-page caret: `MainButton.tsx` renders `<Dropdown className="SteamInstallCaret"
    buttonClass="button outline">`. Its stylesheet is `GamePage/index.css` ~358-374
    (`.SteamInstallCaret .dropdownButton`), inside the nested GamePage block. `styles/_buttons.scss`
    `.button.outline` has a hover rule (2px border) and NO focus rule.

F5. Theme tokens. The base `body {}` block at the top of `src/frontend/themes.scss` already hosts derived
  accent tokens (`--alphabet-filter-accent-color: var(--accent)`). That is the precedent for putting the
  new tokens there. They must be declared on `body`, the same element the `body.<theme>` blocks set
  `--accent` on, so `var(--accent)` resolves per theme. `:root` would resolve before any theme applied.
  `--accent` is set in every theme. `--body-background` appears 80 times but is not in the base block,
  so give it a fallback chain. Theme-survival rule (sketch-findings-gamelib, navigation-shell.md
  section 3): the navbar is sometimes LIGHTER than the body (dracula, gruvbox_dark, midnightMirage), so
  never assume a dark band. A two-tone ring (accent plus page-background halo) contrasts in every theme,
  because each theme's accent is chosen to contrast its own page background.

F6. Component SCSS files in this repo `@use` nothing from `src/frontend/styles/`. Plain `.css` files
  (GamePage, GameCard) cannot consume a SCSS mixin anyway. So the single shared mechanism is the set of
  CSS custom-property TOKENS, plus the canonical selector pair from F2, which the Task 3 gate enforces.
  Do NOT introduce a SCSS mixin or a new `@use` pattern.
</investigation_findings>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Shared focus tokens, then apply the two-tone indicator to Console Mode, the caret and the tier-2 panel</name>
  <files>src/frontend/themes.scss, src/frontend/screens/ConsoleMode/index.scss, src/frontend/screens/Game/GamePage/index.css, src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss, src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.scss, src/frontend/components/UI/NavShell/components/NavItem/index.scss</files>
  <action>
**1. Tokens (F5, F6).** In `src/frontend/themes.scss`, add four tokens to the base `body {}` block,
directly after the `--alphabet-filter-*` lines:
- `--focus-ring-color: var(--accent, #0080ff)`
- `--focus-ring-halo: var(--body-background, var(--background-darker, #000))`
- `--focus-ring-width: 3px`
- `--focus-ring-fill: color-mix(in srgb, var(--accent, #0080ff) 22%, transparent)`

Put a comment above them that states four things:
- The canonical selector pair from F2, and why the `:is(body.controllerLayout *)` arm exists: Tauri
  gamepad focus is a script `.focus()` after untrusted events, so `:focus-visible` is unreliable.
- That focus is deliberately louder than, and different from, hover. Hover must never consume these
  tokens.
- That the fill is `color-mix` in its own token. A webview without `color-mix` loses only the fill,
  never the ring (the same split pga used).
- That the tokens sit on `body`, not `:root`, so `--accent` resolves per theme.

**2. The indicator recipe.** Use two variants. Pick per surface as listed in steps 3-6.
- OUTSET, for elements with room around them (not clipped):
  - `outline: var(--focus-ring-width) solid var(--focus-ring-color)`
  - `outline-offset: 2px`
  - `box-shadow: 0 0 0 2px var(--focus-ring-halo)`. This fills the offset gap with the page colour,
    which produces the two-tone band.
- INSET, for rows inside the scroll-clipped tier-2 panel:
  - `outline: var(--focus-ring-width) solid var(--focus-ring-color)`
  - `outline-offset: calc(-1 * var(--focus-ring-width))`
  - `box-shadow: inset 0 0 0 calc(var(--focus-ring-width) + 2px) var(--focus-ring-halo)`
  - `background: var(--focus-ring-fill)`

Every focus rule uses exactly the selector pair `X:focus-visible, X:focus:is(body.controllerLayout *)`.
In SCSS nesting, write it as `&:focus-visible, &:focus:is(body.controllerLayout *)`.

**3. Console Mode (`ConsoleMode/index.scss`, F4).**
- `.consoleChip`: split the grouped hover/focus rules.
  - Hover keeps exactly what it has today: the 1px accent `border-color` and `outline: none`.
  - Focus gets OUTSET plus `background: var(--focus-ring-fill)`.
  - Split `&:hover.active, &:focus-visible.active` the same way. `.active` hover keeps its current
    body. `.active` focus keeps the current `.active` fill and border, and adds the OUTSET ring and
    halo. Its selector pair is `&.active:focus-visible, &.active:focus:is(body.controllerLayout *)`.
- The cancel/danger pill (~159-175), including its `&.danger` nested rule: hover keeps the current
  fill. Focus keeps the same fill and adds the OUTSET ring and halo. The ring is what makes it differ
  from hover.
- Leave `.consoleCard.focused` untouched. It is class-driven, already loud, and pga's gate cross-checks
  it.
- Remove `outline: none` from every focus arm. It stays on hover arms only.

**4. Caret (`GamePage/index.css`, F4).** Add a new rule next to `.SteamInstallCaret .dropdownButton`,
inside the same nesting, for `.SteamInstallCaret .dropdownButton:focus-visible,
.SteamInstallCaret .dropdownButton:focus:is(body.controllerLayout *)`. Give it OUTSET plus
`background: var(--focus-ring-fill)`. Do not touch `_buttons.scss`: the `.button.outline` hover (2px
border) stays as the subtle hover. Add a short comment pointing at the themes.scss token comment.

**5. Tier-2 panel (`FilterFacetGroup/index.scss`, `FilterMoreGroup/index.scss`).**
- Replace the bodies of the `.FilterFacetGroup .dropdownButton:focus-visible`,
  `.FilterFacetRow:focus-visible` and `.FilterMoreGroup__only:focus-visible` rules with INSET, and
  widen each selector to the canonical pair.
- Keep each rule inside its existing `.NavShell__tier2Portal` wrapper, and keep each rule's existing
  ancestor-specificity prefix, because the files' comments document specificity hazards. The focus
  fill is `--focus-ring-fill` (accent-tinted), deliberately NOT `--navbar-active-background`. That
  keeps a focused row distinguishable from both a hovered row and a checked row (F4).
- Where a checked row is also focused, the `.FilterFacetGroup .FilterFacetRow--checked` rule sits
  later in the file at the same or higher specificity, so its `background` may win. Order the rules so
  the focus rule's `background` wins, or raise the focus rule's specificity to match. The ring and
  halo are what must stay visible on a checked row.
- Hover rules are unchanged.

**6. NavItem (`NavItem/index.scss`, F4).** In the `.NavShell__tier2 .NavItem` block, replace
`&:focus-visible { outline: 2px solid var(--navitem-hover-color); outline-offset: -2px }` with the
canonical pair and INSET. This fixes FilterCollectionList__row, which is a NavItem, and the drop in
gruvbox_dark and dracula caused by the undefined `--text-hover`. Do not change `--navitem-hover-color`
itself, because other rules may use it. Leave NavTabs' tier-1 `&:focus-visible` (which also uses
`--text-hover`) alone, and list it in the SUMMARY as a remaining surface.
  </action>
  <verify>
    <automated>cd /c/Users/grays/Projects/GameLib && npx prettier --check src/frontend/themes.scss src/frontend/screens/ConsoleMode/index.scss src/frontend/screens/Game/GamePage/index.css src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.scss src/frontend/components/UI/NavShell/components/NavItem/index.scss && node -e "const s=require('sass');for(const f of process.argv.slice(1)){s.compile(f);console.log('ok',f)}" src/frontend/themes.scss src/frontend/screens/ConsoleMode/index.scss src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.scss src/frontend/components/UI/NavShell/components/NavItem/index.scss && node -e "const s=require('sass');const css=s.compile('src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss').css;if(/body\.controllerLayout\s+\S*\.NavShell|\.NavShell__tier2Portal\s+body/.test(css)){console.error('prefix-form selector leaked');process.exit(1)}if(!/\.FilterFacetRow:focus:is\(body\.controllerLayout \*\)/.test(css)){console.error('FilterFacetRow gamepad arm missing');process.exit(1)}console.log('compiled selectors ok')" && grep -c -- "--focus-ring-color:" src/frontend/themes.scss</automated>
  </verify>
  <done>
- The four tokens exist in the base `body {}` block, with the rationale comment.
- Every surface in steps 3-6 has a focus rule using the canonical selector pair and the tokens.
- No targeted surface groups `:hover` with `:focus`/`:focus-visible` in one selector list.
- All five SCSS files compile. The compiled FilterFacetGroup CSS contains the suffix-form gamepad arm
  and no prefix-form leak.
- prettier is clean on all six paths.
  </done>
</task>

<task type="auto">
  <name>Task 2: Split the game-card hover and focus looks, and stop a resting cursor from hiding gamepad focus (pga adjacency, F3)</name>
  <files>src/frontend/screens/Library/components/GameCard/index.css, src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts</files>
  <action>
In `GameCard/index.css`:

**1. Split the `.gameCard:hover, .gameCard:focus-within` ring rule (~36-45) into two rules.**
- `.gameCard:hover` becomes SUBTLE:
  - `outline: 2px solid var(--accent, #0080ff)`
  - `outline-offset: -1px`
  - keep the drop-shadow layer `0 10px 30px rgba(0, 0, 0, 0.6)`
  - no accent glow
  - keep `z-index: 2`
- `.gameCard:focus-within` becomes LOUD:
  - `outline: var(--focus-ring-width, 3px) solid var(--focus-ring-color, var(--accent, #0080ff))`
  - `outline-offset: 2px`
  - `box-shadow` layers in this order: halo `0 0 0 2px var(--focus-ring-halo, #000)`, then the drop
    shadow `0 10px 30px rgba(0, 0, 0, 0.6)`, then the existing `color-mix` accent glow
  - `z-index: 3`, so a focused card sits above a hovered neighbour
- Keep the `color-mix` glow in `box-shadow` only, as pga does. Degradation then costs only the glow.
- Leave the shared `.gameCard:hover, .gameCard:focus-within { transform: scale(1.05) }` rule as is.

**2. Split `.gameListItem:hover, .gameListItem:focus-within` (~393-397) the same way.**
- Hover: `outline: 2px solid var(--accent, #0080ff)`, `outline-offset: -2px`.
- Focus-within: the INSET recipe from Task 1 using the tokens: ring, `inset` halo box-shadow, and
  `background: var(--focus-ring-fill)`. The rows are non-overlapping strips, so inset is right.

**3. Scope all three stale-focus suppression rules to mouse-only sessions (F3).** Prefix them with
`body:not(.controllerLayout)`:
- `.gameList:hover .gameCard:focus-within:not(:hover)` — ring rule at ~60 and scale rule at ~232
- `.gameListLayout:hover .gameListItem:focus-within:not(:hover)` at ~404

The ring-restoring suppression rule must also reset the new focus-only values: `outline: none`, the
base `box-shadow: 0px 0px 12px 4px #00000055` (NOT `none`, per pga), and `z-index: auto`. The list-item
suppression must also reset `background` and `box-shadow` to their resting values. Check the base
`.gameListItem` rule for the resting background; if it declares none, use `background: none` and
`box-shadow: none`.

**4. Rewrite the comments** above each changed rule. They should say three things:
- Hover and focus are deliberately different now. The pga round-2 reversal gave hover a ring; this
  keeps it, but subtler.
- Why the suppression is now `body:not(.controllerLayout)`: a cursor left resting over the grid used to
  erase gamepad focus. The operator's "hover wins while mousing" choice is kept for mouse-only
  sessions.
- A cross-reference to 260926-acw.

In `gameCardFocusRing.test.ts`, update the assertions that encode the old contract:
- Replace "hover and focus share ONE rule" with its inverse. Assert that no selector list in the file
  contains both `.gameCard:hover` and `.gameCard:focus-within` EXCEPT the scale rule. Do the same for
  `.gameListItem`, which has no exception.
- Assert that the focus rules consume `var(--focus-ring-color`.
- Assert that each suppression selector begins with `body:not(.controllerLayout)`.
- Keep the existing assertions: no bare hex outside a `var()` fallback, the hairline is gone, the
  box-shadow is restored and not cleared, the scale is restored, and the console-mode cross-file guard.
  Adjust their regexes to the split rule shape.
- Rewrite the file docstring to state the current contract and name 260926-acw.
  </action>
  <verify>
    <automated>cd /c/Users/grays/Projects/GameLib && npx prettier --check src/frontend/screens/Library/components/GameCard/index.css src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts && npx jest src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts</automated>
  </verify>
  <done>
- `.gameCard` and `.gameListItem` have separate hover (subtle) and focus-within (loud, token-driven,
  two-tone) rules.
- All three suppression rules are scoped to `body:not(.controllerLayout)`.
- The rewritten pga gate passes and asserts the split contract.
- prettier is clean.
  </done>
</task>

<task type="auto">
  <name>Task 3: Cross-surface source-text gate, and the todo moved to ready: live-gate</name>
  <files>src/frontend/styles/__tests__/focusIndicator.test.ts, .planning/todos/pending/2026-09-25-controller-focus-has-no-perceptible-affordance.md</files>
  <action>
**1. Create the gate.** Create `src/frontend/styles/__tests__/focusIndicator.test.ts`, following the
pattern of `GameCard/__tests__/gameCardFocusRing.test.ts`: `readFileSync` plus `stripSourceComments`
from `backend/testUtils/stripSourceComments`, in a node environment.
- Confirm that `stripSourceComments` strips `//` SCSS line comments. If it does not, strip them locally
  in the test with a small helper, so comment prose cannot satisfy or break an assertion.
- Compile SCSS sources with `require('sass').compile(path).css`, so assertions run against real
  selectors after nesting has been resolved. Read `GamePage/index.css` raw.

Assertions:
- (a) `themes.scss`: the base `body {` block (the first one, before `body.alphabet-filter-button--active`)
  declares all four `--focus-ring-*` tokens. `--focus-ring-color` references `var(--accent`.
  `--focus-ring-halo` has a fallback chain.
- (b) Every targeted selector has both arms: `X:focus-visible` and `X:focus:is(body.controllerLayout *)`.
  The targeted selectors are `.consoleChip`, `.consoleChip.active`, the cancel pill and its `.danger`
  variant (use the class names found in Task 1), `.SteamInstallCaret .dropdownButton`,
  `.FilterFacetGroup .dropdownButton`, `.FilterFacetRow`, `.FilterMoreGroup__only` and `.NavItem`.
- (c) Each of those focus rules' declaration blocks contains `var(--focus-ring-color)`.
- (d) No compiled selector list for those surfaces contains both a `:hover` selector and a `:focus`
  selector for the same class. This is the hover/focus split.
- (e) No compiled selector anywhere in the NavShell files has `body.controllerLayout` after another
  class. This catches the prefix-nesting trap from F2.
- (f) No targeted focus block contains `var(--text-hover)`. This is the gruvbox_dark/dracula drop.

Write the file docstring to explain F1 and F2 in two short paragraphs. Also state honestly what this
gate cannot see: it proves the rules exist and are shaped right, not that the ring is perceptible.
Perceptibility is the live sweep's job.

**2. Update the todo.** Edit `.planning/todos/pending/2026-09-25-controller-focus-has-no-perceptible-affordance.md`.
- Change `ready: code` to `ready: live-gate`. Keep `severity: major` and `platform: any`, in the same
  order.
- Append a `## Desk fix landed (quick 260926-acw)` section with:
  - The corrected pga finding (F3): pga did not touch `:focus-visible` or these three surfaces, and
    the real compounding was the resting-cursor suppression.
  - The F1/F2 mechanism.
  - The list of restyled surfaces.
  - Remaining surfaces NOT swept: NavTabs tier-1, `FormControl`, `_buttons.scss` variants, Settings
    footer buttons, and other `:focus-visible`-only rules across `src/frontend`. All of these carry the
    same F1 exposure.
  - A numbered live-sweep checklist for the operator, run on the Mac with a controller:
    1. Console Mode chips, including an active chip.
    2. Console Mode cancel and danger pills.
    3. Tier-2 Games filter panel: collapsible group headers, a facet row, a checked facet row, a
       collection row, and a "More" "only" button.
    4. Game page Steam install caret.
    5. Library grid and list with the mouse cursor RESTING over the grid while navigating with the
       gamepad.
    6. Hover versus focus visibly different, checked by hovering one card while another is focused.
    7. Repeat steps 1, 3 and 5 on midnightMirage, gruvbox_dark, dracula-classic and nord-light
       (light theme).
- Do NOT move the todo to `completed/`. It moves only after that sweep passes.
- Keep the cross-reference to Todo B (`2026-09-25-mouse-highlight-does-not-confer-dom-focus.md`)
  as-is, and add one sentence to it. The sentence: with controllerLayout active, a clicked element now
  shows the focus ring, which makes "what looks focused" more truthful. Todo B's defect is still
  separate and unaddressed.
  </action>
  <verify>
    <automated>cd /c/Users/grays/Projects/GameLib && npx prettier --check src/frontend/styles/__tests__/focusIndicator.test.ts .planning/todos/pending/2026-09-25-controller-focus-has-no-perceptible-affordance.md && npx jest src/frontend/styles/__tests__/focusIndicator.test.ts src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts && pnpm codecheck && pnpm lint && pnpm planning-gates && grep -c "^ready: live-gate$" .planning/todos/pending/2026-09-25-controller-focus-has-no-perceptible-affordance.md</automated>
  </verify>
  <done>
- The new gate passes, and all six assertion groups are present.
- The pga gate still passes.
- codecheck, lint and planning-gates pass.
- The todo is in pending/ with `ready: live-gate` and the desk-fix section, including the live-sweep
  checklist.
- prettier is clean on both paths.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | CSS and source-text tests only. No input handling, IPC, network or auth surface changes. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-acw-01 | Spoofing (UI) | focus indicator styles | accept | A cosmetic misstyle cannot cross a trust boundary. The gate plus the live sweep cover correctness. |
| T-acw-SC | Tampering | package installs | n/a | No installs. `sass` is already a devDependency (package.json:177). |
</threat_model>

<verification>
Desk-level only:
- prettier on every written path
- sass compile of every touched SCSS file
- the two jest gates
- `pnpm codecheck`, `pnpm lint` and `pnpm planning-gates`

The live controller sweep is the operator's, and this plan does not perform it. The executor MUST NOT
claim the focus indicator is perceptible, or that the todo is resolved. The SUMMARY must state:
"Live verification pending: the todo remains in pending/ with ready: live-gate; see its live-sweep
checklist."

The SUMMARY must also record:
- the F3 correction to the todo's pga claim
- the `body:not(.controllerLayout)` scoping, as a deviation from pga round 3
- that pga's pending Task 3 check steps 1-3 and 5 are superseded by this plan's split
</verification>

<success_criteria>
- Focus and hover are visually distinct on all targeted surfaces.
- Focus paints under gamepad-driven script focus through the `controllerLayout` arm.
- The tokens resolve in every theme.
- The resting-cursor suppression no longer hides gamepad focus.
- The gates pass.
- The todo is updated to `live-gate` and remains open.
</success_criteria>

<output>
Create `.planning/quick/260926-acw-give-controller-keyboard-focus-a-percept/260926-acw-SUMMARY.md` when done.
</output>
