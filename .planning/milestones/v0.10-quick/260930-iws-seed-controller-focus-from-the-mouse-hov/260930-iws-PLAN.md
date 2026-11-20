---
phase: quick-260930-iws
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/helpers/gamepadHoverSeed.ts
  - src/frontend/helpers/gamepad.ts
  - src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts
  - .planning/todos/pending/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md
  - .planning/todos/completed/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md
  - .planning/todos/completed/2026-09-25-controller-focus-has-no-perceptible-affordance.md
autonomous: true
requirements: [QUICK-260930-iws]

must_haves:
  truths:
    - "On the library route, the first directional controller press after mouse activity, with a game card under the pointer, focuses that card's own link (the element isGameCard()/playable() already key on) and moves nothing else; the next directional press navigates spatially FROM that card"
    - "With the search field focused and a card under the pointer, that handoff press lands on the card -- it does not move focus to the search field's spatial neighbour and does not open the virtual keyboard"
    - "With no card under the pointer, controller behaviour is unchanged: the three existing gamepad harnesses pass unmodified and a new no-hover case dispatches exactly as before"
    - "Nothing runs without controller input: the fix registers no DOM event listener, so typing in the search field with the mouse resting on a card never moves focus"
    - "Mid-session presses (no mouse movement since the last controller input) never re-seed, so focus cannot snap back to the card under a resting pointer"
    - "mainAction (A) and altAction (Y) never act on a merely-hovered card -- only the 8 directional actions seed"
    - "The todo lives in .planning/todos/completed/ with a resolution note stating the live mouse-to-controller handoff check on the library route is still outstanding, and todo A's cross-reference points at the completed path"
  artifacts:
    - path: "src/frontend/helpers/gamepadHoverSeed.ts"
      provides: "Total resolver resolveHoveredCard(doc) -> { card, link } | null over the :hover chain, plus isDirectionalAction(action)"
      exports: ["resolveHoveredCard", "isDirectionalAction", "HoveredCard"]
    - path: "src/frontend/helpers/gamepad.ts"
      provides: "Handoff capture before emitControllerEvent and the land-first seed step before the special-case switch in checkAction"
      contains: "resolveHoveredCard(document)"
    - path: "src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts"
      provides: "Resolver unit cases plus initGamepad() integration cases covering hover+nothing-focused, hover+search-focused, no-hover-unchanged, no-input, mid-session, guards, and A/Y exclusion"
    - path: ".planning/todos/completed/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md"
      provides: "Moved todo with resolution note; live handoff check stated as outstanding"
      contains: "## Resolution (quick 260930-iws)"
  key_links:
    - from: "src/frontend/helpers/gamepad.ts checkAction (just before emitControllerEvent(controllerIndex), ~line 160)"
      to: "module-level currentController, reset to -1 by the one-shot mousemove listener in emitControllerEvent (~lines 701-707)"
      via: "handoff = controller was not the active input source before this press AND the emit made it so"
      pattern: "currentController !== controllerIndex"
    - from: "src/frontend/helpers/gamepad.ts checkAction seed step (before switch (action))"
      to: "src/frontend/helpers/gamepadHoverSeed.ts resolveHoveredCard"
      via: "import; called only on a directional handoff press"
      pattern: "resolveHoveredCard\\(document\\)"
    - from: "seeded link (direct <a> child of .gameCard/.gameListItem, GameCard/index.tsx:559)"
      to: "gamepad.ts isGameCard()/playable()/playGame()/installGame() and GameCard/index.css .gameCard:focus-within ring"
      via: "link.parentElement carries gameCard/gameListItem, so the NEXT A/Y press and the acw focus ring both target the card the operator was looking at"
      pattern: "gameCard|gameListItem"
---

<objective>
Action the todo `2026-09-25-mouse-highlight-does-not-confer-dom-focus.md` (severity medium): on the
library route, after the mouse visually highlights a game card, the next controller input acts on
the search field (or on nothing -- the `[GAMEPAD-ACT]` instrument logged `tag=none`) instead of the
highlighted card. Fix it at controller-dispatch time by seeding DOM focus onto the card that is under
the pointer on the mouse-to-controller handoff press, then close the todo.

Purpose: the operator's visible highlight (CSS `:hover`) and DOM focus diverge; every controller
action reads DOM focus. The todo's Verification section requires: "The NEXT element the controller
acts on should be the visually-highlighted card (or an adjacent card, per normal spatial navigation
from it) -- never the search field or any other element the operator was not looking at."

Output: new `src/frontend/helpers/gamepadHoverSeed.ts`, a seed step wired into `checkAction` in
`src/frontend/helpers/gamepad.ts`, a new jest suite, and the todo moved to `completed/`.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md
@src/frontend/helpers/gamepad.ts
@src/frontend/helpers/__tests__/gamepadRepeatTiming.test.ts

## SHARED-CHECKOUT RULES (mandatory, every task)

This is a shared checkout with concurrent sessions. The executor MUST NOT run `git stash`,
`git reset`, `git checkout`, `git switch`, `git pull`, `git rebase`, `git merge`, or any other
branch-switching or history-rewriting command. `.husky/post-checkout` and `.husky/post-merge` run
`pnpm i`. Do not pass `--no-verify`. Stage by explicit path only -- never `git add -A` / `git add .`
(an unrelated untracked directory, `.planning/quick/260930-hks-migrate-to-gsd-core-1-15-0-and-close-the/`,
belongs to another session and must not be staged). Do not edit `.planning/STATE.md` (the quick
orchestrator owns it).

## Staleness check (done at planning time, 2026-09-30, on 4cfafe7d3)

`git log --oneline -30 -- src/frontend/helpers/ src/frontend/screens/Library/`, `git log --all`
greps for hover/tag=none/mouse/handoff/seed, and a sweep of `.planning/quick/*/` found NO existing
work on this todo. The only nearby commits are 260925-pga (CSS hover/focus ring) and 260926-acw
(`c35d55bdf`, CSS hover/focus split + mouse-only suppression scoping) -- both CSS-only; neither
touches DOM focus. `gamepad.ts` contains no hover handling (its one "hovering" word is a comment
about MUI sliders). The fix does not exist; this plan implements it.

## Mechanism (established from source, not from the todo text)

Dispatch path under Tauri: `gamepad.ts` `checkAction()` -> `emitControllerEvent(controllerIndex)`
(~line 160) -> `el = currentElement()` (~161; `document.querySelector(':focus')`, ~312-320) ->
special-case `switch` (~183-282) -> for directional actions `window.api.gamepadAction({ action })`
-> `src/preload/api/misc.ts:93` -> `src/preload/api/tauriGamepadInput.ts` `moveFocusDirectionally`
(~328-353), which reads `document.activeElement` (body counts as nothing, `activeElement()` ~64-68).
Mouse hover never touches DOM focus anywhere in this chain.

- `tag=none`: DOM focus was on `document.body`, so `el` was undefined. The `!el` branch (~250-253)
  calls `body.focus()`, which establishes nothing (`tauriGamepadInput.activeElement()` maps body to
  null anyway), then dispatches; `moveFocusDirectionally` seeds from the WR-03 viewport-edge origin
  (`viewportOriginFor`, ~240-260) -- for `padLeft`, the element nearest the RIGHT edge near mid-height.
  Navigation therefore starts from a screen edge, never from the hovered card. Body focus after mouse
  use is common in WebKit (WKWebView/WebKitGTK): a mouse click on a link does not focus it and blurs
  the prior focus. The second consecutive `tag=none` two seconds later means the first press did not
  leave durable focus; source alone cannot say why (candidates: the card-visibility placeholder swap
  at `GameCard/index.tsx:508-515`, a pointer click between presses). This plan does NOT claim to
  explain that, and the fix does not depend on it: with a hovered card the handoff press now
  establishes focus on that card directly.
- Search field acted on: DOM focus stayed on the SearchBar `<input>` from earlier typing/clicking
  (or `onClear`'s refocus, `SearchBar/index.tsx:75`). A d-pad press dispatches the synthetic arrow
  keydown on the input and `moveFocusDirectionally` moves from the INPUT's rect to its spatial
  neighbour; `mainAction` hits `isTextInput()` and opens the virtual keyboard on the input.
- Reconciliation with 260925-pga / 260926-acw: pga's rule
  `body:not(.controllerLayout) .gameList:hover .gameCard:focus-within:not(:hover)`
  (`GameCard/index.css` ~76, ~250; list ~439-441) hides a stale DOM-focused card B's ring while the
  pointer is over the grid, so in mouse mode the operator sees ONLY hovered card A. On the handoff
  press, `emitControllerEvent` -> `controller-changed` -> `GlobalState.tsx` ~1773-1781 turns on
  `body.controllerLayout`, B's ring reappears and navigation moves from B (or the input, or the
  viewport edge) -- never from A. acw split hover (subtle) from focus (loud `.gameCard:focus-within`
  ring, ~45) and scoped pga's suppression to mouse-only. With this fix, A receives DOM focus at the
  handoff, so acw's focus ring lands on the card the operator was looking at and no stale ring
  survives anywhere. No CSS change is needed.
- Handoff signal already exists: `currentController` is set by `emitControllerEvent` and reset to -1
  by its one-shot `mousemove` listener (~701-707). So `currentController !== controllerIndex`
  immediately before the emit means exactly "the mouse moved since the last controller input, or
  this is the first controller input since launch".

## Planner decisions (Claude's discretion -- no CONTEXT.md for quick tasks)

- **P-1 Where: at controller-dispatch time, not focus-follows-mouse.** Moving DOM focus on hover would
  steal focus from the search input while typing and would contradict pga/acw's deliberate
  hover/focus split. Nothing changes until a controller press arrives.
- **P-2 How the hovered card is found: query `:hover` at dispatch time, not a pointer-tracking
  listener.** The operator's visible highlight IS the CSS `:hover` state (`.gameCard:hover`,
  `GameCard/index.css:38`), so `document.querySelectorAll(':hover')` resolves exactly the highlighted
  card by construction. A listener-tracked "last hovered" goes stale on wheel scroll under a resting
  pointer, on the pointer leaving the window, and on the card-visibility placeholder swap, and needs
  its own clearing rules. The query registers no DOM event listener, so there is nothing to tear down
  (`initGamepad` has no teardown path) and nothing can run without a controller press. (This is
  frontend code; CLAUDE.md's sidecar exit contract does not apply, stated for the record.) `:hover`
  in `querySelectorAll` is a standard dynamic pseudo-class supported by WKWebView, WebView2 and
  WebKitGTK. Order is document order, so the LAST match is the deepest hovered element.
- **P-3 Semantic: land-first.** On the handoff press the directional action is CONSUMED: focus lands
  on the hovered card and nothing else moves; the next press navigates from it. Justification against
  the todo's Verification section: (a) it satisfies the primary clause literally ("the NEXT element
  the controller acts on should be the visually-highlighted card"); (b) at the handoff the card's
  look changes from acw's subtle hover to the loud focus ring, so the operator sees the transfer
  before anything moves, rather than focus jumping off the card they were looking at; (c) cheaper
  failure mode -- if the pointer happens to rest on a card the operator is not watching, a landed
  focus is visible and one press from correction, whereas navigate-from-it would put focus on a card
  neither looked at. Alternative considered and rejected: seed then navigate in the same press
  (also allowed by the todo's parenthetical, but loses (b) and (c)).
- **P-4 Scope: the 8 directional actions only** (`padUp/Down/Left/Right`,
  `leftStickUp/Down/Left/Right` -- the same set as the `!el` branch, `gamepad.ts` ~242-249).
  A/Y are excluded: Y on a card plays or installs it (`playGame()`/`installGame()`), and letting a
  consequential action fire on an element the controller never focused is a new hazard. After one
  directional handoff press the card IS focused, so A/Y then act on it -- two presses, safe. Note
  for the record: any directional controller press already moved focus off the search field before
  this fix (`moveFocusDirectionally` from the input), so seeding does not add a new way to leave the
  search field -- stick drift included.
- **P-5 Guards (no seed):** the virtual keyboard is active (it owns directional input); the focused
  element is inside an overlay (`insideDialog()` / `insideDropdown()` / `isInMuiPopover()`, existing
  closure helpers); focus is already inside the hovered card (`card.contains(focused)` -- the acw ring
  is already on the card the operator sees); the emit did not make this controller current (a
  `getGamepads()[idx]` null bail-out would otherwise make every press a handoff and let focus
  ping-pong back to the hovered card).
- **P-6 Totality:** `checkAction`'s only caller (`updateStatus`) wraps it in a try/catch that
  SWALLOWS errors, so a throw in the seed step would silently drop the press (the exact shape the
  repeat-timing suite's header warns about). The resolver returns null on any failure (including a
  document with no `querySelectorAll`, which is what all three existing harnesses provide), resolves
  the hovered card BEFORE any other DOM probing, and the whole seed step sits in its own try/catch
  that falls through to the unchanged path.
- **P-7 `focus({ preventScroll: true })`:** the hovered card is under the pointer, so it is on
  screen; preventing scroll avoids a scroll moving a different card under a resting pointer.

## Test harness facts (measured at planning time)

- Frontend jest project is `testEnvironment: 'node'` with NO jsdom (`src/frontend/jest.config.js`
  header); `window`/`document`/`navigator`/`requestAnimationFrame` are stubbed on `globalThis`, and
  `resetMocks: true` is set -- create every `jest.fn` inside the harness builder or the test body,
  never at module scope.
- Follow `gamepadRepeatTiming.test.ts`: `jest.resetModules()` + `require('../gamepad')` per test
  (fresh `currentController = -1`), one priming frame with nothing pressed before any press, one
  `runFrame()` drains one rAF callback. Standard-layout indices (`gamepad_layouts/standard.ts`):
  0 = A (mainAction), 3 = Y (altAction), 12 up, 13 down, 14 left, 15 right.
- Baseline: `npx jest` over the four existing gamepad suites = 4 suites / 40 tests passing. Put the
  paths FIRST: `--selectProjects` is variadic and swallows following paths (measured: it silently
  ran all 179 suites). The trailer `Ran all test suites matching` proves the filter applied. The
  full suite has 2 pre-existing failing suites (one is `storeEmbedSingleOpener.test.ts`) --
  unrelated, not in scope, not run by this plan.
- `.planning/` is prettier-ignored (`npx prettier --file-info` -> `ignored: true`); `src/` files are
  not (`inferredParser: typescript`). Only the three `src/` paths get `prettier --check`.
- `pnpm planning-gates` on this Windows machine still CRASHES at baseline (11/12;
  `planning-frontmatter-gate.py:365` `subprocess.run` with no `encoding=` writes cp1252 ->
  `UnicodeEncodeError` on a U+2192 arrow; recorded in 260930-hav `deferred-items.md`, NOT fixed on
  main). `PYTHONUTF8=1 pnpm planning-gates` gives 12/12 on the clean baseline, measured. Use the
  UTF-8 form as the real signal and do not claim the plain invocation passes.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: End-to-end "handoff press lands on the hovered card" -- resolver, checkAction wiring, integration test</name>
  <files>src/frontend/helpers/gamepadHoverSeed.ts, src/frontend/helpers/gamepad.ts, src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts</files>
  <behavior>
    - R1: resolveHoveredCard over a :hover chain whose deepest element sits inside a `.gameCard` wrapper returns { card: wrapper, link: the wrapper's direct-child A element }
    - R2: a :hover chain with no `.gameCard`/`.gameListItem` ancestor returns null
    - R3: a document with no querySelectorAll, and one whose querySelectorAll throws, both return null (total, never throws)
    - R4: a hovered `.gameCard` wrapper with no direct-child A (the not-yet-visible placeholder at GameCard/index.tsx:508-515) returns null
    - I1: first padLeft press (handoff), nothing focused, card hovered -> link.focus called once with { preventScroll: true }; window.api.gamepadAction NOT called; after a release frame, a second padLeft press -> gamepadAction called once with action padLeft
    - I2: no card hovered (empty :hover list), nothing focused -> padLeft press calls gamepadAction with padLeft exactly as before and focuses nothing
    - I3: no controller input -- search input focused, card hovered, several frames with nothing pressed plus a fired mousemove -> link.focus never called and the focused element is still the search input
  </behavior>
  <action>
RED first: write `src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts` covering R1-R4 and I1-I3,
run it, and confirm it FAILS (module missing / seed absent) before writing production code; record the
red run in the SUMMARY.

Harness (node env, no jsdom -- follow `gamepadRepeatTiming.test.ts`'s `buildHarness`/`runFrame`/
`cleanupGlobals` shape and its trailing `export {}` module-scope note):
- Mock `../virtualKeyboard` like the repeat-timing suite, but make `isActive` read a module-level
  mutable flag named with the `mock` prefix (e.g. `mockVkActive`, default false, reset in beforeEach)
  so the hoisted factory may reference it.
- Fake window: its listener registry must honour the `{ once: true }` option (remove after first
  call) and expose a `fireMouseMove()` helper; `dispatchEvent` returns true; `location.hash` '#/';
  `api.requestAppSettings` resolves `{ disableController: false }`; `api.gamepadAction` is a jest.fn
  resolving undefined.
- Fake document: `body.classList.contains` returns false; `querySelector(sel)` returns the harness's
  mutable `focused` element when sel is ':focus', else null; `querySelectorAll(sel)` returns the
  harness's mutable `hoverChain` array when sel is ':hover', else an empty array.
- Fake element factory: tagName, optional `type`, `classList.contains`, `parentElement`, `children`
  (array; appending a child sets its parentElement), `closest(selector)` (split on commas, class
  selectors only, walk self then parents), `contains(other)` (walk other's parent chain, inclusive),
  `focus` (jest.fn that sets harness `focused` to this element), `click` (jest.fn), and a zero-rect
  `getBoundingClientRect`. Build a card as a DIV with class `gameCard` whose children are a status
  SPAN and an A (the link), mirroring GameCard/index.tsx:535-559. `hoverChain` is ancestors-first,
  deepest-last (document order).
- Use `jest.resetModules()` + `require('../gamepad')` per integration test, the priming frame, and
  button index 14 (left) / 13 (down) from `gamepad_layouts/standard.ts`.

GREEN -- create `src/frontend/helpers/gamepadHoverSeed.ts` (pure DOM, no electron or Tauri import):
- `export type HoveredCard` with `card: Element` and `link: HTMLElement`.
- `export function isDirectionalAction(action: ValidGamepadAction): boolean` -- true for exactly
  padUp, padDown, padLeft, padRight, leftStickUp, leftStickDown, leftStickLeft, leftStickRight
  (per P-4; `ValidGamepadAction` from 'common/types').
- `export function resolveHoveredCard(doc: Pick<Document, 'querySelectorAll'>): HoveredCard | null`
  -- per P-2/P-6: if querySelectorAll is not a function return null; take the LAST element of
  `doc.querySelectorAll(':hover')`; `closest('.gameCard, .gameListItem')` (mirrors wrapperClasses,
  GameCard/index.tsx:494); link = the first element of the wrapper's `children` whose tagName,
  upper-cased, is 'A'; return null when any step yields nothing; wrap the body in try/catch
  returning null. It registers no DOM event listener of any kind.
- Header comment: states P-2's reasoning (why `:hover` at dispatch rather than tracking pointer
  events), that the returned link is the element `isGameCard()`/`playable()` in gamepad.ts key on,
  and cites the todo by FILENAME ONLY (`2026-09-25-mouse-highlight-does-not-confer-dom-focus.md`,
  no directory -- Task 3 moves it).

Wire into `src/frontend/helpers/gamepad.ts` `checkAction`, inside the `if (!wasActive || shouldRepeat)`
block:
- Immediately BEFORE the existing `emitControllerEvent(controllerIndex)` call, capture into a local
  const whether `currentController !== controllerIndex`. After the emit, the press is a handoff only
  if that capture was true AND `currentController === controllerIndex` now (P-5, emit bail-out guard).
- After the existing `guide` and `back` early-return guards and BEFORE `switch (action)`, add the seed
  step, entered only when the press is a handoff and `isDirectionalAction(action)`. Inside its own
  try/catch whose catch falls through (P-6): `resolveHoveredCard(document)`; if null, fall through;
  otherwise call `link.focus({ preventScroll: true })` (P-7) and `return`, consuming the press (P-3).
  (Task 2 adds the P-5 guards between the resolve and the focus call.)
- A short comment above the seed step naming the mechanism in one or two sentences, the land-first
  decision (P-3), directional-only scope (P-4), and the filename-only todo citation.
- Do NOT change `tauriGamepadInput.ts`, the `!el` recovery branch, `currentElement()`, or any
  existing listener. The count of listener registrations in gamepad.ts stays 5
  (focus, blur, mousemove, gamepadconnected, gamepaddisconnected).
  </action>
  <verify>
    <automated>cd /c/Users/grays/Projects/GameLib && npx jest src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts src/frontend/helpers/__tests__/gamepadRepeatTiming.test.ts src/frontend/helpers/__tests__/gamepadDisconnect.test.ts src/frontend/helpers/__tests__/nintendoLayout.test.ts src/preload/__tests__/gamepadActionRouting.test.ts > "$TEMP/iws-t1-jest.txt" 2>&1; tail -6 "$TEMP/iws-t1-jest.txt"; grep -q "Ran all test suites matching" "$TEMP/iws-t1-jest.txt" && grep -q "Test Suites: 5 passed, 5 total" "$TEMP/iws-t1-jest.txt" && npx prettier --check src/frontend/helpers/gamepadHoverSeed.ts src/frontend/helpers/gamepad.ts src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts && test "$(grep -v '^\s*//' src/frontend/helpers/gamepad.ts | grep -c 'addEventListener(')" -eq 5 && ! (grep -vE '^\s*(//|\*|/\*)' src/frontend/helpers/gamepadHoverSeed.ts | grep -q 'addEventListener') && grep -q "resolveHoveredCard(document)" src/frontend/helpers/gamepad.ts && pnpm codecheck && pnpm lint</automated>
  </verify>
  <done>Red run recorded; the new suite and the four existing gamepad suites pass (5/5 suites, the three existing frontend harnesses unmodified); prettier clean on the three src paths; codecheck and lint pass; gamepad.ts still has exactly 5 listener registrations and the new helper has none.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Expansion -- guards and the full handoff matrix (search field, stale card, mid-session, overlays, VK, A/Y, list layout)</name>
  <files>src/frontend/helpers/gamepad.ts, src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts</files>
  <behavior>
    - I4: search INPUT (type text) focused + card hovered + handoff padDown -> the card's link is focused, gamepadAction NOT called, virtual keyboard not opened; the next padDown press calls gamepadAction with padDown
    - I5: stale card B's link focused + card A hovered + handoff -> A's link focused, B's link.focus not called
    - I6: focus already inside the hovered card (its link; and separately its inner settings BUTTON) + handoff -> no focus call; gamepadAction called
    - I7: after I1's seed, set focused to another element C with NO mousemove and the pointer still over A -> next press does not reseed and calls gamepadAction; then fireMouseMove() -> the next press reseeds A
    - I8: mockVkActive true + card hovered + handoff -> no seed; gamepadAction called
    - I9: focused element inside a `.MuiDialog-root` ancestor, and separately inside a `.dropdown` ancestor, + card hovered + handoff -> no seed
    - I10: nothing focused, card hovered, handoff mainAction (index 0) and altAction (index 3) -> link.focus and link.click never called
    - R5: a hovered `.gameListItem` wrapper resolves to its direct-child A
    - R6: a deepest hovered element nested inside the card but not the link (e.g. an SVG inside an `.icons` BUTTON) still resolves to the card's link
  </behavior>
  <action>
RED first: add I4-I10 and R5-R6 to `src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts` and run
it; I5/I6/I8/I9 must fail against Task 1's unguarded seed step (I6 in particular: focus inside the
hovered card is re-seeded without the containment guard). Record which cases went red. If a case
passes before the guard it is meant to prove exists, strengthen it until it discriminates -- do not
keep a vacuous case.

GREEN -- in `src/frontend/helpers/gamepad.ts`, inside Task 1's seed step, between the resolve and
the focus call, add the P-5 guards in this order, each falling through to the unchanged path:
`VirtualKeyboardController.isActive()`; `insideDialog() || insideDropdown() || isInMuiPopover()`
(existing closure helpers -- they call `el.closest`, which is safe because the resolve already
returned a card, and the step's try/catch covers any throw); then compute the focused element with
`currentElement()` and fall through if it is non-null and `card.contains(focused)`. The resolve MUST
stay first so that, with no card hovered, no other DOM probing happens (nintendoLayout's opt-in
`fakeFocusedElement` has no `closest`, and its harness has no `querySelectorAll`).

Extend the seed-step comment by one line naming the guards and why focus-inside-the-card is left
alone (acw's `.gameCard:focus-within` ring is already on the card the operator sees). Do not add
mainAction/altAction to the seed scope (P-4); I10 pins that.
  </action>
  <verify>
    <automated>cd /c/Users/grays/Projects/GameLib && npx jest src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts src/frontend/helpers/__tests__/gamepadRepeatTiming.test.ts src/frontend/helpers/__tests__/gamepadDisconnect.test.ts src/frontend/helpers/__tests__/nintendoLayout.test.ts src/preload/__tests__/gamepadActionRouting.test.ts > "$TEMP/iws-t2-jest.txt" 2>&1; tail -6 "$TEMP/iws-t2-jest.txt"; grep -q "Ran all test suites matching" "$TEMP/iws-t2-jest.txt" && grep -q "Test Suites: 5 passed, 5 total" "$TEMP/iws-t2-jest.txt" && npx prettier --check src/frontend/helpers/gamepad.ts src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts && test "$(grep -v '^\s*//' src/frontend/helpers/gamepad.ts | grep -c 'addEventListener(')" -eq 5 && git diff --quiet HEAD -- src/frontend/helpers/__tests__/gamepadRepeatTiming.test.ts src/frontend/helpers/__tests__/gamepadDisconnect.test.ts src/frontend/helpers/__tests__/nintendoLayout.test.ts src/preload/api/tauriGamepadInput.ts && pnpm codecheck && pnpm lint</automated>
  </verify>
  <done>Red cases recorded; all 5 suites pass with the full matrix (I1-I10, R1-R6); the three existing harnesses and tauriGamepadInput.ts are byte-unchanged; prettier clean on the two src paths; codecheck and lint pass; listener count still 5.</done>
</task>

<task type="auto">
  <name>Task 3: Close the todo -- git mv to completed/ with a resolution note, repoint todo A's cross-reference</name>
  <files>.planning/todos/pending/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md, .planning/todos/completed/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md, .planning/todos/completed/2026-09-25-controller-focus-has-no-perceptible-affordance.md</files>
  <action>
<!-- planner-discipline-allow: pending/2026-09-25-mouse-highlight-does-not-confer-dom-focus -->
1. Move the todo with history preserved:
`git mv .planning/todos/pending/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md .planning/todos/completed/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md`.

2. In the moved file's frontmatter: keep `severity: medium` and `platform: any`; change `ready:` to
`live-gate` (the remaining work is a live check -- same treatment todo A received in 260930-hav);
append `src/frontend/helpers/gamepadHoverSeed.ts` and
`src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts` to `files:`. Leave the existing body
sections untouched (they are the historical record).

3. Append a `## Resolution (quick 260930-iws)` section to the moved file stating, in prose: the
mechanism (both outcomes: `tag=none` = body focus falling to the viewport-edge origin; search field =
navigation/VK originating from the still-focused input; hover never moved DOM focus), with the honest
limit that the second consecutive `tag=none` is not explained from source; the fix (on the
mouse-to-controller handoff press -- first controller input since the mouse moved -- a directional
press with a game card under the pointer lands focus on that card's link and moves nothing else; the
next press navigates from it; resolved via `:hover` at dispatch time, no listener); the scope limits
(directional only, A/Y excluded, no seed while the virtual keyboard is active, inside an overlay, or
when focus is already inside the hovered card; no change with no card under the pointer); how it
reconciles with 260925-pga and 260926-acw (no CSS change; the acw focus ring now lands on the card
the operator was looking at); the commits and the test file. Then state in bold that the **live
mouse-to-controller handoff check on the library route (the Verification section above) has NOT been
performed**, that moving this todo to completed/ does not change that, and that the Verification
section remains the authoritative checklist -- noting the `[GAMEPAD-ACT]` probe was removed in
`5a4dffc0e`, so a live sitting must observe focus by eye or re-add a temporary probe.

4. In `.planning/todos/completed/2026-09-25-controller-focus-has-no-perceptible-affordance.md`, in
the `## Cross-reference` section (~line 64), change the Todo B path from the pending directory to
`.planning/todos/completed/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md`, and append one
sentence to that paragraph: Todo B was desk-fixed by quick 260930-iws (the controller handoff press
seeds focus from the hovered card) and moved to completed/; its live handoff check is still
outstanding. Do not rewrite the existing sentence about acw ("unaddressed by this fix" still refers
to acw and remains true).

5. Do not edit `.planning/STATE.md` (its Pending Todos list at ~1110-1111 still cites both todos'
pending paths; that is the orchestrator's call, not this task's) and do not touch historical
references in other quick PLAN/SUMMARY files.

6. Best-effort, non-gating: run `graphify update .` (graphify-out/ is gitignored).
  </action>
  <verify>
    <automated>cd /c/Users/grays/Projects/GameLib && test ! -e .planning/todos/pending/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md && test -f .planning/todos/completed/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md && test "$(grep -c '^## Resolution (quick 260930-iws)' .planning/todos/completed/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md)" -eq 1 && grep -q "live mouse-to-controller handoff check" .planning/todos/completed/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md && grep -q "^ready: live-gate$" .planning/todos/completed/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md && grep -q "completed/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md" .planning/todos/completed/2026-09-25-controller-focus-has-no-perceptible-affordance.md && ! grep -rl "pending/2026-09-25-mouse-highlight-does-not-confer-dom-focus" .planning/todos src meta && git diff --cached --name-status -M -- .planning/todos | grep -q "^R" && PYTHONUTF8=1 pnpm planning-gates 2>&1 | tail -3 | grep -q "12/12 planning gates passed"</automated>
  </verify>
  <done>The todo is a staged rename into completed/ with `ready: live-gate`, the resolution section, and the explicit outstanding-live-check statement; todo A points at the completed path; no live reference to the pending path remains under .planning/todos, src or meta; `PYTHONUTF8=1 pnpm planning-gates` reports 12/12. The SUMMARY states that plain `pnpm planning-gates` still crashes on this Windows machine (pre-existing cp1252 `UnicodeEncodeError` in planning-frontmatter-gate.py, 11/12 at baseline) and that the pass claim is for the UTF-8 invocation only.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| physical gamepad -> renderer dispatcher | Controller input selects which element receives focus/activation; the new step adds pointer position (`:hover`) as a second input into that choice |
| renderer dispatcher -> consequential card actions | A/Y on a focused card open, launch or install a game (`playGame()`/`installGame()`) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-iws-01 | Elevation of Privilege | gamepad.ts seed step | medium | mitigate | Directional-only scope (P-4): a Y/A press can never launch/install a merely-hovered card; pinned by test I10 |
| T-iws-02 | Denial of Service | gamepad.ts checkAction / updateStatus try/catch | medium | mitigate | Resolver is total and resolves before any other probing; seed step has its own fall-through try/catch so a throw never silently drops the press (P-6); proven by the three existing harnesses passing unmodified |
| T-iws-03 | Tampering | focus state while typing | low | mitigate | No listener registered; seeding runs only on a controller handoff press; test I3 plus the listener-count gate |
| T-iws-04 | Denial of Service | focus ping-pong mid-session | low | mitigate | Handoff requires the emit to have made this controller current, and mid-session presses never reseed; test I7 |
| T-iws-SC | Tampering | npm/pip/cargo installs | low | accept | No package installs in this plan |
</threat_model>

<verification>
- 5 jest suites pass (new suite + three existing frontend gamepad harnesses unmodified + preload gamepadActionRouting), with the `Ran all test suites matching` trailer present.
- `npx prettier --check` clean over the exact three `src/` paths written.
- `pnpm codecheck` and `pnpm lint` pass.
- `PYTHONUTF8=1 pnpm planning-gates` 12/12; plain invocation's pre-existing Windows crash stated, not claimed as a pass.
- Live check NOT performed and recorded as outstanding in the moved todo.
</verification>

<success_criteria>
- A directional handoff press with a card under the pointer lands focus on that card (search field focused or nothing focused), and the next press navigates from it.
- No behaviour change with no card under the pointer, without controller input, mid-session, with the virtual keyboard active, inside an overlay, or for A/Y.
- Todo moved to completed/ with an honest resolution note; todo A's cross-reference updated; STATE.md untouched.
</success_criteria>

<output>
Create `.planning/quick/260930-iws-seed-controller-focus-from-the-mouse-hov/260930-iws-SUMMARY.md` when done.
</output>
