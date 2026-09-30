---
phase: quick-260930-hav
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
  - .planning/todos/completed/2026-09-25-controller-focus-has-no-perceptible-affordance.md
  - .planning/todos/pending/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md
autonomous: true
requirements: [QUICK-260930-hav]

must_haves:
  truths:
    - "Gamepad-driven focus paints a visible indicator even when the webview does NOT match :focus-visible (Tauri moves focus with a bare el.focus() after untrusted synthetic key events)"
    - "On every targeted surface the focus indicator looks different from hover: focus is a two-tone ring (accent ring plus page-background halo) and, where there is room, an accent-tinted fill; hover keeps its existing subtle treatment"
    - "The indicator is built only from tokens that resolve in every theme block (light and dark); no focus rule consumes --text-hover"
    - "In normal-mode Library, a mouse cursor resting over the grid no longer hides the gamepad-focused card's ring while a controller is active; mouse-only sessions keep pga's 'hover wins while mousing'"
    - "The todo lives in .planning/todos/completed/ with a resolution note that states the live controller sweep across the four surfaces is still outstanding"
  artifacts:
    - path: "src/frontend/themes.scss"
      provides: "Shared focus tokens --focus-ring-color, --focus-ring-halo, --focus-ring-width, --focus-ring-fill in the base body {} block"
      contains: "--focus-ring-color"
    - path: "src/frontend/styles/__tests__/focusIndicator.test.ts"
      provides: "Source-text gate: every targeted surface carries both selector arms, consumes the tokens, and never groups hover with focus"
    - path: "src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts"
      provides: "pga gate rewritten to the split hover/focus contract"
    - path: ".planning/todos/completed/2026-09-25-controller-focus-has-no-perceptible-affordance.md"
      provides: "Moved todo with resolution note and live-sweep checklist"
      contains: "live controller sweep"
  key_links:
    - from: "src/frontend/state/GlobalState.tsx (controller-changed listener, ~line 1773-1779)"
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
(severity major): give controller/keyboard focus a clearly perceptible indicator that is visually
distinct from hover, on Console Mode chips and the quit/cancel pill, the tier-2 filter panel
(FilterFacetRow, facet group headers, FilterMoreGroup "only" buttons, FilterCollectionList__row via
NavItem), and the game-page Steam split-button caret. Resolve the todo's adjacency question about
quick 260925-pga by splitting the game-card hover and focus looks. Then move the todo to completed/.

Purpose: during the Phase 38 controller sitting the operator could not see where focus was ("just
mash down until focus regained"), and 38-C06 clause (3) had to be discharged on log evidence rather
than the operator's eyes.

Output: shared focus tokens, restyled focus rules on the listed surfaces, a split game-card ring, a
cross-surface source-text gate, and the todo moved to completed/ with a resolution note.

Supersession note: `.planning/quick/260926-acw-give-controller-keyboard-focus-a-percept/260926-acw-PLAN.md`
planned this same fix on 2026-09-26 and was never executed (only its plan commit `21ee6feaa` exists;
no SUMMARY, no code commits). This plan reuses its investigation, re-verified on 2026-09-30 against
HEAD `6afb8e773` (none of the target stylesheets has changed since pga). The one deliberate
difference: this plan moves the todo to completed/ (per the operator's request) instead of leaving it
in pending/ at `ready: live-gate`. Record the supersession in the SUMMARY. Do not edit the acw plan.
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
Established and re-verified at plan time. Use as given; do not re-investigate beyond the line-number
confirmations each task asks for.

F1. How gamepad focus moves, and why :focus-visible alone is unreliable.
  `src/frontend/helpers/gamepad.ts` (~line 297) sends directional/tab actions to
  `window.api.gamepadAction`. Under Tauri, `src/preload/api/misc.ts:93` routes that to
  `src/preload/api/tauriGamepadInput.ts`, which is pure DOM: it dispatches UNTRUSTED synthetic
  `KeyboardEvent`s (`dispatchKey`) and then moves focus with a bare `.focus()` —
  `list[nextIndex]?.focus()` in `doTab` (~138) and `best?.focus()` in `moveFocusDirectionally` (~352).
  Neither passes `{ focusVisible: true }`. Console Mode focuses its own cards/chips the same way
  (`ConsoleMode/index.tsx` ~331/345/372). Chromium (WebView2) and WebKit (WKWebView) decide whether a
  script `.focus()` matches `:focus-visible` from the last TRUSTED interaction: after any mouse
  click, a gamepad-moved focus usually does NOT match. The sitting is consistent with this:
  `.FilterFacetRow:focus-visible` already paints a 2px accent outline, yet the operator could not see
  it. (Inference from the heuristic plus sitting evidence; only the live sweep confirms it.)

F2. The fix mechanism: a class-based arm that already exists. `src/frontend/state/GlobalState.tsx`
  ~1773-1779 runs `document.body.classList.toggle('controllerLayout', controllerId !== '')` on the
  `controller-changed` event, which `gamepad.ts` emits (`emitControllerEvent`, ~160) on gamepad
  actions and clears only on disconnect (~664). `InfoIcon/index.css:15` already keys on
  `body.controllerLayout`. The canonical focus selector pair for every targeted surface is therefore
  `X:focus-visible, X:focus:is(body.controllerLayout *)`. Use the `:is(body.controllerLayout *)`
  SUFFIX form, never a `body.controllerLayout X:focus` prefix: most tier-2 rules are nested inside a
  `.NavShell__tier2Portal { ... }` wrapper, where a prefix compiles to
  `.NavShell__tier2Portal body.controllerLayout ...` and never matches. The suffix form works nested,
  unnested, and in plain .css.
  Rejected: adding `{ focusVisible: true }` to the `.focus()` calls in `tauriGamepadInput.ts`. WKWebView
  support for that FocusOptions member is uncertain across the macOS versions in use, it would leave
  Console Mode's own `.focus()` calls uncovered, and it changes a preload module with its own gates.
  Stay CSS-only. Accepted side effect: while a controller is active, a mouse-clicked element also
  shows the focus ring (it matches `:focus`). That makes "what looks focused" more truthful, not less.

F3. What quick 260925-pga actually changed (the todo's description is inaccurate). pga did NOT touch
  `:focus-visible` and did NOT touch any of the three surfaces this todo names. It unified `:hover` and
  `:focus-within` onto one 3px accent ring for `.gameCard` and `.gameListItem` only
  (`GameCard/index.css` ~36-45 and ~393-397), and added "hover wins while mousing" suppression:
  `.gameList:hover .gameCard:focus-within:not(:hover)` (~60 ring, ~232 scale) and
  `.gameListLayout:hover .gameListItem:focus-within:not(:hover)` (~404).
  Decision (answering the todo's adjacency question): YES, focus should now diverge from hover. The
  compounding is real on game cards in two ways: (a) hover and focus are pixel-identical, so a ring
  does not say which it means; (b) worse, when the cursor merely RESTS anywhere over the grid while the
  operator drives the gamepad, the `.gameList:hover` suppression removes the ring AND the scale from
  the gamepad-focused card — gamepad focus becomes invisible because the cursor was parked. The
  operator's pga "hover wins while mousing" choice was made while the rings looked identical; this plan
  KEEPS it for mouse-only sessions by scoping the suppression to `body:not(.controllerLayout)`. Record
  this as a deviation from pga round 3 in the SUMMARY.

F4. Per-surface state at plan time (line numbers approximate — confirm with grep before editing):
  - `ConsoleMode/index.scss` ~94-135: `.consoleChip` groups `&:hover, &:focus-visible` in one rule
    (1px accent `border-color`, `outline: none`) and `&:hover.active, &:focus-visible.active` in
    another. ~145-175: `.consoleQuitButton` groups `&:hover, &:focus-visible` (fill, `outline: none`),
    and again inside its `&.danger` block. Every one of these groupings must be split.
    `.consoleCard` (~238) is class-driven via `.focused`, already loud, and pga's gate cross-checks it —
    leave it alone. `.consoleGridScroller` `outline: none` (~209) is a scroll container, not a target.
  - `FilterFacetGroup/index.scss` ~102-110 (`.FilterFacetGroup .dropdownButton` hover / focus-visible,
    the collapsible headers) and ~237-245 (`.FilterFacetRow` hover / focus-visible). Hover uses
    `--navbar-active-background`, which is ALSO the checked-row background (`.FilterFacetRow--checked`),
    so focus must NOT use that background or a focused row looks like a checked row.
  - `FilterMoreGroup/index.scss` ~62: `.FilterMoreGroup__only:focus-visible` 2px accent outline.
  - `NavItem/index.scss` ~29 declares `--navitem-hover-color: var(--text-hover)`, and ~55
    `&:focus-visible { outline: 2px solid var(--navitem-hover-color) }`. FilterFacetGroup's header
    comment documents that `--text-hover` is undefined in gruvbox_dark and dracula; an undefined custom
    property with no fallback drops the whole declaration, so FilterCollectionList__row (a NavItem,
    `FilterCollectionList/index.tsx` ~79-108) has NO focus outline at all in those themes. This plan
    fixes that.
  - Caret: `MainButton.tsx` renders `Dropdown className="SteamInstallCaret" buttonClass="button
    outline"`. Its styles are `GamePage/index.css` ~358-374 (`.SteamInstallCaret .dropdownButton`,
    inside the nested GamePage block). `styles/_buttons.scss` `.button.outline` has a hover rule and NO
    focus rule; there is no global focus ring anywhere in `src/frontend/styles/` or `App.css`.
    MainButton.tsx itself needs no change.

F5. Theme tokens. The base `body {}` block at the top of `src/frontend/themes.scss` already hosts
  derived accent tokens (`--alphabet-filter-accent-color: var(--accent)`, ~line 24). New tokens go
  there — on `body`, the same element the `body.<theme>` blocks set `--accent` on, so `var(--accent)`
  resolves per theme (`:root` would resolve before any theme applies). `--body-background` is not in
  the base block, so give it a fallback chain. Theme-survival rule (sketch-findings-gamelib,
  `references/navigation-shell.md` section 3): the navbar is sometimes LIGHTER than the body, so never
  assume a dark band. A two-tone ring (accent plus page-background halo) contrasts in every theme,
  because each theme's accent is chosen against its own page background.

F6. Component stylesheets `@use` nothing from `src/frontend/styles/`, and plain .css files (GamePage,
  GameCard) cannot consume a SCSS mixin. The shared mechanism is therefore CSS custom-property TOKENS
  plus the canonical selector pair from F2, enforced by the Task 3 gate. Do NOT introduce a SCSS
  mixin, a new `@use`, or a blanket global `*:focus` rule (a global rule would restyle hundreds of MUI
  and third-party surfaces this quick task cannot verify).

F7. Todo bookkeeping. No gate references this todo's path: `meta/runPlanningGates.py` and
  `.planning/todos/todo-frontmatter-gate.py` scan `pending/` generically and have no pending-count
  floor; `completed/` is exempt from the frontmatter gate. Path references that exist:
  `.planning/todos/pending/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md` (Todo B, live —
  update its path), and the historical `260925-r8j` PLAN/SUMMARY and `260926-acw` PLAN (records of
  what was true then — do NOT rewrite).
</investigation_findings>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Shared focus tokens, then the two-tone indicator on Console Mode, the caret and the tier-2 panel</name>
  <files>src/frontend/themes.scss, src/frontend/screens/ConsoleMode/index.scss, src/frontend/screens/Game/GamePage/index.css, src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss, src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.scss, src/frontend/components/UI/NavShell/components/NavItem/index.scss</files>
  <action>
**1. Tokens (F5, F6).** In `src/frontend/themes.scss`, add four tokens to the base `body {}` block
directly after the `--alphabet-filter-*` lines:
- `--focus-ring-color: var(--accent, #0080ff)`
- `--focus-ring-halo: var(--body-background, var(--background-darker, #000))`
- `--focus-ring-width: 3px`
- `--focus-ring-fill: color-mix(in srgb, var(--accent, #0080ff) 22%, transparent)`

Above them, a comment stating: the canonical selector pair from F2 and why the
`:is(body.controllerLayout *)` arm exists (Tauri gamepad focus is a script `.focus()` after untrusted
events, so `:focus-visible` is unreliable); that focus is deliberately louder than and different from
hover, and hover rules must never consume these tokens; that the fill is `color-mix` in its own token
so a webview without `color-mix` loses only the fill, never the ring; that the tokens sit on `body`,
not `:root`, so `--accent` resolves per theme; and a cross-reference to quick 260930-hav.

**2. The indicator recipe — two variants, chosen per surface below.**
- OUTSET (elements with room around them, not clipped): `outline: var(--focus-ring-width) solid
  var(--focus-ring-color)`, `outline-offset: 2px`, `box-shadow: 0 0 0 2px var(--focus-ring-halo)`
  (fills the offset gap with page colour, giving the two-tone band).
- INSET (rows inside the scroll-clipped tier-2 panel): `outline: var(--focus-ring-width) solid
  var(--focus-ring-color)`, `outline-offset: calc(-1 * var(--focus-ring-width))`,
  `box-shadow: inset 0 0 0 calc(var(--focus-ring-width) + 2px) var(--focus-ring-halo)`,
  `background: var(--focus-ring-fill)`.
Every focus rule uses exactly the pair `X:focus-visible, X:focus:is(body.controllerLayout *)`; in SCSS
nesting write it as `&:focus-visible, &:focus:is(body.controllerLayout *)`.

**3. Console Mode (`ConsoleMode/index.scss`, F4).**
- `.consoleChip`: split the grouped rules. Hover keeps exactly today's body (1px accent `border-color`,
  `outline: none`). Focus gets OUTSET plus `background: var(--focus-ring-fill)`.
- Split `&:hover.active, &:focus-visible.active` the same way: `.active` hover keeps its current body;
  `.active` focus keeps the current `.active` fill and border and adds the OUTSET ring and halo, with
  selector pair `&.active:focus-visible, &.active:focus:is(body.controllerLayout *)`.
- `.consoleQuitButton` and its `&.danger` block: hover keeps the current fill; focus keeps the same fill
  and adds the OUTSET ring and halo (the ring is what distinguishes it from hover).
- `outline: none` stays on hover arms only; remove it from every focus arm. Leave `.consoleCard`,
  `.consoleGridScroller` untouched.

**4. Caret (`GamePage/index.css`, F4).** Next to `.SteamInstallCaret .dropdownButton`, inside the same
nesting, add a rule for `.SteamInstallCaret .dropdownButton:focus-visible, .SteamInstallCaret
.dropdownButton:focus:is(body.controllerLayout *)` with OUTSET plus `background:
var(--focus-ring-fill)`, and a one-line comment pointing at the themes.scss token comment. Do not touch
`_buttons.scss` or `MainButton.tsx`; `.button.outline`'s hover stays the subtle hover.

**5. Tier-2 panel (`FilterFacetGroup/index.scss`, `FilterMoreGroup/index.scss`).** Replace the bodies of
`.FilterFacetGroup .dropdownButton:focus-visible`, `.FilterFacetRow:focus-visible` and
`.FilterMoreGroup__only:focus-visible` with INSET, widening each selector to the canonical pair. Keep
each rule inside its existing `.NavShell__tier2Portal` wrapper and keep its existing
ancestor-specificity prefix (the files' comments document specificity hazards). The focus fill is
`--focus-ring-fill`, deliberately NOT `--navbar-active-background`, so a focused row differs from both
a hovered and a checked row. For a row that is both checked and focused: the
`.FilterFacetGroup .FilterFacetRow--checked` rule may win `background` on order/specificity — order or
raise the focus rule so its ring and halo stay visible on a checked row (the checked background may
remain; the ring must not be lost). Hover rules are unchanged. Update the header comment at
FilterFacetGroup ~73-78 that says hover and focus reuse one treatment, so it no longer claims that.

**6. NavItem (`NavItem/index.scss`, F4).** In the tier-2 `.NavItem` block, replace the `&:focus-visible`
rule (outline via `--navitem-hover-color`) with the canonical pair and INSET. This fixes
FilterCollectionList__row and the gruvbox_dark/dracula drop. Do not change `--navitem-hover-color`
itself (other rules may use it). Leave NavTabs' tier-1 focus rule alone; list it in the SUMMARY and the
todo resolution note as a remaining surface.

Before each edit, confirm the approximate line numbers from F4 with Grep; they were accurate at
`6afb8e773`.
  </action>
  <verify>
    <automated>cd /c/Users/grays/Projects/GameLib && npx prettier --check src/frontend/themes.scss src/frontend/screens/ConsoleMode/index.scss src/frontend/screens/Game/GamePage/index.css src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.scss src/frontend/components/UI/NavShell/components/NavItem/index.scss && node -e "const s=require('sass');for(const f of process.argv.slice(1)){s.compile(f);console.log('ok',f)}" src/frontend/themes.scss src/frontend/screens/ConsoleMode/index.scss src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.scss src/frontend/components/UI/NavShell/components/NavItem/index.scss && node -e "const s=require('sass');const css=s.compile('src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss').css;if(/\.NavShell__tier2Portal\s+body/.test(css)){console.error('prefix-form selector leaked');process.exit(1)}if(!/\.FilterFacetRow:focus:is\(body\.controllerLayout \*\)/.test(css)){console.error('FilterFacetRow gamepad arm missing');process.exit(1)}console.log('compiled selectors ok')" && grep -v '^\s*//' src/frontend/themes.scss | grep -c -- "--focus-ring-color:"</automated>
  </verify>
  <done>
- The four tokens exist in the base `body {}` block with the rationale comment.
- Every surface in steps 3-6 has a focus rule using the canonical selector pair and the tokens.
- No targeted surface groups `:hover` with `:focus`/`:focus-visible` in one selector list.
- All five SCSS files compile; compiled FilterFacetGroup CSS carries the suffix-form arm and no prefix
  leak.
- prettier is clean on all six paths.
  </done>
</task>

<task type="auto">
  <name>Task 2: Split the game-card hover and focus looks, and stop a resting cursor hiding gamepad focus (pga adjacency, F3)</name>
  <files>src/frontend/screens/Library/components/GameCard/index.css, src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts</files>
  <action>
In `GameCard/index.css` (confirm line numbers with Grep first):

**1. Split the `.gameCard:hover, .gameCard:focus-within` ring rule (~36-45) into two rules.**
- `.gameCard:hover` becomes SUBTLE: `outline: 2px solid var(--accent, #0080ff)`, `outline-offset: -1px`,
  keep the drop-shadow layer `0 10px 30px rgba(0, 0, 0, 0.6)`, no accent glow, keep `z-index: 2`.
- `.gameCard:focus-within` becomes LOUD: `outline: var(--focus-ring-width, 3px) solid
  var(--focus-ring-color, var(--accent, #0080ff))`, `outline-offset: 2px`, `box-shadow` layers in this
  order — halo `0 0 0 2px var(--focus-ring-halo, #000)`, the drop shadow `0 10px 30px rgba(0, 0, 0,
  0.6)`, then pga's existing `color-mix` accent glow — and `z-index: 3` so a focused card sits above a
  hovered neighbour. The `color-mix` glow stays in `box-shadow` only (degradation costs only the glow).
- Leave the shared `.gameCard:hover, .gameCard:focus-within { transform: scale(1.05) }` rule as is.

**2. Split `.gameListItem:hover, .gameListItem:focus-within` (~393-397).** Hover: `outline: 2px solid
var(--accent, #0080ff)`, `outline-offset: -2px`. Focus-within: the INSET recipe from Task 1 using the
tokens (ring, inset halo box-shadow, `background: var(--focus-ring-fill)`), since rows are
non-overlapping strips.

**3. Scope all three stale-focus suppression rules to mouse-only sessions (F3)** by prefixing
`body:not(.controllerLayout)`: `.gameList:hover .gameCard:focus-within:not(:hover)` (ring rule ~60 and
scale rule ~232) and `.gameListLayout:hover .gameListItem:focus-within:not(:hover)` (~404). The
ring-restoring suppression must also reset the new focus-only values: `outline: none`, the base
`box-shadow: 0px 0px 12px 4px #00000055` (NOT `none`, per pga), and `z-index: auto`. The list-item
suppression must also reset `background` and `box-shadow` to resting values (check the base
`.gameListItem` rule; if it declares none, use `background: none` and `box-shadow: none`).

**4. Rewrite the comments** above each changed rule to say: hover and focus are deliberately different
now (pga round 2 gave hover a ring; this keeps it, subtler); why the suppression is now scoped to
`body:not(.controllerLayout)` (a cursor left resting over the grid used to erase gamepad focus; the
operator's "hover wins while mousing" choice is kept for mouse-only sessions); and a cross-reference to
260930-hav.

In `gameCardFocusRing.test.ts`, update the assertions encoding the old contract:
- Replace "hover and focus share ONE rule" with its inverse: no selector list contains both
  `.gameCard:hover` and `.gameCard:focus-within` EXCEPT the scale rule; `.gameListItem` has no
  exception.
- Assert the focus rules consume `var(--focus-ring-color`.
- Assert each suppression selector begins with `body:not(.controllerLayout)`.
- Keep the existing assertions (no bare hex outside a `var()` fallback slot, hairline gone, box-shadow
  restored not cleared, scale restored, console-mode cross-file guard), adjusting regexes to the split
  shape. Note: the focus `box-shadow` halo fallback `#000` sits inside a `var()` fallback slot, which the
  no-bare-hex assertion already permits — confirm the regex treats it that way.
- Rewrite the file docstring to state the current contract and name 260930-hav.
  </action>
  <verify>
    <automated>cd /c/Users/grays/Projects/GameLib && npx prettier --check src/frontend/screens/Library/components/GameCard/index.css src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts && npx jest src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts</automated>
  </verify>
  <done>
- `.gameCard` and `.gameListItem` have separate hover (subtle) and focus-within (loud, token-driven,
  two-tone) rules; only the scale rule is shared.
- All three suppression rules are scoped to `body:not(.controllerLayout)`.
- The rewritten pga gate passes and asserts the split contract.
- prettier is clean on both paths.
  </done>
</task>

<task type="auto">
  <name>Task 3: Cross-surface source-text gate, full battery, and move the todo to completed/</name>
  <files>src/frontend/styles/__tests__/focusIndicator.test.ts, .planning/todos/pending/2026-09-25-controller-focus-has-no-perceptible-affordance.md, .planning/todos/completed/2026-09-25-controller-focus-has-no-perceptible-affordance.md, .planning/todos/pending/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md</files>
  <action>
**1. Create the gate** `src/frontend/styles/__tests__/focusIndicator.test.ts`, following
`GameCard/__tests__/gameCardFocusRing.test.ts`: `readFileSync` plus `stripSourceComments` from
`backend/testUtils/stripSourceComments`, node test environment. Confirm whether `stripSourceComments`
strips SCSS `//` line comments; if not, strip them locally with a small helper so comment prose cannot
satisfy or break an assertion. Compile SCSS sources with `require('sass').compile(path).css` so
assertions run on real, nesting-resolved selectors; read `GamePage/index.css` raw (comment-stripped).
Assertions:
- (a) `themes.scss`: the first base `body {` block declares all four `--focus-ring-*` tokens;
  `--focus-ring-color` references `var(--accent`; `--focus-ring-halo` has a fallback chain.
- (b) Every targeted selector has both arms, `X:focus-visible` and `X:focus:is(body.controllerLayout *)`:
  `.consoleChip`, `.consoleChip.active`, `.consoleQuitButton`, `.consoleQuitButton.danger`,
  `.SteamInstallCaret .dropdownButton`, `.FilterFacetGroup .dropdownButton`, `.FilterFacetRow`,
  `.FilterMoreGroup__only`, `.NavItem`.
- (c) Each of those focus rules' declaration blocks contains `var(--focus-ring-color)`.
- (d) No compiled selector list for those surfaces contains both a `:hover` selector and a `:focus`
  selector for the same class (the hover/focus split).
- (e) No compiled selector in the NavShell files has `body.controllerLayout` preceded by another
  compound (the F2 prefix-nesting trap).
- (f) No targeted focus block contains `var(--text-hover)` (the gruvbox_dark/dracula drop).
Docstring: two short paragraphs explaining F1 and F2, plus an honest statement of what the gate cannot
see — it proves the rules exist and are shaped right, not that the ring is perceptible; perceptibility
is the live sweep's job.

**2. Run the battery**: both jest gates, `pnpm codecheck`, `pnpm lint`. Fix any failure before touching
the todo.

**3. Move the todo** with `git mv .planning/todos/pending/2026-09-25-controller-focus-has-no-perceptible-affordance.md
.planning/todos/completed/2026-09-25-controller-focus-has-no-perceptible-affordance.md`. Leave the
frontmatter as it is (completed/ is exempt from the frontmatter gate; do not invent new keys). Append a
`## Resolution (quick 260930-hav)` section, short and factual, containing:
- One paragraph on the desk fix: shared `--focus-ring-*` tokens; the two-tone ring on the listed
  surfaces; the `:focus:is(body.controllerLayout *)` arm and why (F1/F2 in two sentences); the NavItem
  `--text-hover` theme drop fixed.
- The corrected pga finding (F3): pga did not touch `:focus-visible` or these three surfaces; the real
  compounding was identical hover/focus looks plus the resting-cursor suppression on game cards, now
  split and scoped to `body:not(.controllerLayout)`.
- Remaining surfaces NOT swept, carrying the same F1 exposure: NavTabs tier-1, `FormControl`,
  `_buttons.scss` variants, Settings footer buttons, and other `:focus-visible`-only rules across
  `src/frontend`.
- An explicit sentence: "Outstanding verification: the live controller sweep across the four surfaces
  (Console Mode chips, tier-2 filter panel rows, the game-page split-button caret, and general
  navigation) has NOT been performed; this todo is closed on desk evidence only." Follow it with a
  numbered live-sweep checklist: (1) Console Mode chips including an active chip; (2) Console Mode
  quit/cancel and danger pills; (3) tier-2 Games filter panel — a group header, a facet row, a checked
  facet row, a collection row, a "More" "only" button; (4) game-page Steam install caret; (5) Library
  grid and list with the mouse cursor RESTING over the grid while navigating by gamepad; (6) hover one
  card while another is focused — the two must look different; (7) repeat 1, 3 and 5 on midnightMirage,
  gruvbox_dark, dracula-classic and nord-light.
- A pointer to the superseded, never-executed `260926-acw` plan.

**4. Update Todo B** (`.planning/todos/pending/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md`):
change its cross-reference path from `pending/` to `completed/` for this todo, and add one sentence:
with `controllerLayout` active a clicked element now shows the focus ring, which makes "what looks
focused" more truthful, but Todo B's defect (mouse hover does not move DOM focus) is separate and
unaddressed. Do not change Todo B's frontmatter or fix its defect. Do NOT edit the historical
`260925-r8j` or `260926-acw` files that mention the old path.

**5. Run `pnpm planning-gates`**, then confirm nothing outside historical quick-task records still points
at the pending/ path.
  </action>
  <verify>
    <automated>cd /c/Users/grays/Projects/GameLib && npx prettier --check src/frontend/styles/__tests__/focusIndicator.test.ts .planning/todos/completed/2026-09-25-controller-focus-has-no-perceptible-affordance.md .planning/todos/pending/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md && npx jest src/frontend/styles/__tests__/focusIndicator.test.ts src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts && pnpm codecheck && pnpm lint && pnpm planning-gates && test ! -e .planning/todos/pending/2026-09-25-controller-focus-has-no-perceptible-affordance.md && grep -c "live controller sweep" .planning/todos/completed/2026-09-25-controller-focus-has-no-perceptible-affordance.md && ! grep -rl "pending/2026-09-25-controller-focus-has-no-perceptible-affordance" .planning/todos src meta</automated>
  </verify>
  <done>
- The new gate passes with all six assertion groups; the pga gate still passes.
- codecheck, lint and planning-gates pass.
- The todo exists only in completed/, with the resolution note stating the live sweep is outstanding
  and carrying the checklist.
- Todo B points at the completed/ path; historical quick-task records are untouched.
- prettier is clean on all three written paths.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | CSS, source-text tests and planning docs only. No input handling, IPC, network or auth surface changes. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-hav-01 | Spoofing (UI) | focus indicator styles | accept | A cosmetic misstyle cannot cross a trust boundary; the gate plus the live sweep cover correctness. |
| T-hav-02 | Repudiation | todo closure | mitigate | Resolution note states explicitly that the live sweep is outstanding, so closure is not read as live proof. |
| T-hav-SC | Tampering | package installs | n/a | No installs. `sass` is already a devDependency (package.json:177). |
</threat_model>

<verification>
Desk-level only: prettier on every written path, sass compile of every touched SCSS file, the two jest
gates, `pnpm codecheck`, `pnpm lint`, `pnpm planning-gates`.

The live controller sweep is the operator's and this plan does not perform it. The executor MUST NOT
claim the indicator is perceptible. The SUMMARY must state: "Live verification pending: the todo was
moved to completed/ on desk evidence; its resolution note carries the live-sweep checklist."

The SUMMARY must also record: the F1 finding (gamepad focus is script `.focus()` after untrusted events,
so `:focus-visible` is unreliable; `controllerLayout` arm chosen over `focusVisible: true`); the F3
correction to the todo's pga claim; the `body:not(.controllerLayout)` scoping as a deviation from pga
round 3; that pga's pending Task 3 check is superseded for the hover/focus look; and that
`260926-acw` is superseded by this plan.
</verification>

<success_criteria>
- Focus and hover are visually distinct on all targeted surfaces.
- Focus paints under gamepad-driven script focus through the `controllerLayout` arm.
- The tokens resolve in every theme; no focus rule depends on `--text-hover`.
- A resting cursor no longer hides gamepad focus on game cards while a controller is active.
- All gates pass.
- The todo is in completed/ with a resolution note naming the outstanding live sweep.
</success_criteria>

<output>
Create `.planning/quick/260930-hav-distinct-perceptible-controller-focus-af/260930-hav-SUMMARY.md` when done.
</output>
