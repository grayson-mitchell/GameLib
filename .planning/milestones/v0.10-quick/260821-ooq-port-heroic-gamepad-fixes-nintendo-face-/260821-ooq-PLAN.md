---
phase: quick-260821-ooq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/ConsoleMode/controller.ts
  - src/frontend/screens/ConsoleMode/__tests__/controllerButtonLabels.test.ts
  - src/frontend/helpers/gamepad.ts
  - src/frontend/helpers/__tests__/gamepadDisconnect.test.ts
autonomous: true
requirements: [QUICK-260821-ooq]

must_haves:
  truths:
    - "A Nintendo-layout pad shows 'B' as the confirm/launch hint and 'A' as the back/quit hint in Console Mode -- matching the physical button at the position Chromium maps to buttons[0] / buttons[1]"
    - "Xbox, Steam Deck, PS4 and PS5 layouts keep the labels they had before this change"
    - "Disconnecting the ACTIVE gamepad emits a controller-changed event with an empty controllerId, regardless of that pad's position in the internal controllers array"
    - "Disconnecting a NON-active gamepad emits nothing, so the still-connected active pad keeps its controller hints"
    - "Which button index drives which action is unchanged -- checkStandard still maps buttons[0] to mainAction and buttons[1] to back for every layout"
  artifacts:
    - path: "src/frontend/screens/ConsoleMode/controller.ts"
      provides: "getActionButtonLabel / getBackButtonLabel with a nintendo branch"
      contains: "nintendo"
    - path: "src/frontend/screens/ConsoleMode/__tests__/controllerButtonLabels.test.ts"
      provides: "RED-proven label regression suite for all five ControllerLayout values"
      contains: "getActionButtonLabel"
    - path: "src/frontend/helpers/gamepad.ts"
      provides: "removegamepad comparing gamepad.index against currentController"
      contains: "gamepad.index === currentController"
    - path: "src/frontend/helpers/__tests__/gamepadDisconnect.test.ts"
      provides: "RED-proven behavioural suite driving initGamepad and asserting on the dispatched controller-changed event"
      contains: "controller-changed"
  key_links:
    - from: "src/frontend/screens/ConsoleMode/index.tsx"
      to: "getActionButtonLabel / getBackButtonLabel"
      via: "useGamepadInfo().layout passed straight into both label functions"
      pattern: "get(Action|Back)ButtonLabel\\(controllerLayout\\)"
    - from: "src/frontend/helpers/gamepad.ts removegamepad"
      to: "emitControllerEvent(-1)"
      via: "gamepad.index === currentController comparison"
      pattern: "gamepad\\.index === currentController"
---

<objective>
Port two independent gamepad defects from upstream Heroic.

1. `getActionButtonLabel` / `getBackButtonLabel` in `ConsoleMode/controller.ts` branch only on
   `layout.startsWith('ps')`. `detectControllerLayout()` already returns a distinct `'nintendo'`
   layout, but `'nintendo'` falls through to the Xbox default. Nintendo face buttons are mirrored
   relative to Xbox at the same physical position, and the Chromium standard mapping keys off
   POSITION -- so `buttons[0]` (which drives `mainAction`) is physically labelled **B** on a Switch
   Pro Controller and `buttons[1]` (which drives `back`) is physically **A**. Console Mode currently
   tells a Nintendo user to press "A" to confirm when they must press "B", and vice versa.

2. `removegamepad` in `helpers/gamepad.ts` compares `removedIndex` (a POSITION in the `controllers`
   array, from `findIndex`) against `currentController` (a GAMEPAD INDEX, `gamepad.index`). They
   coincide only by accident. Disconnecting the active pad usually does NOT fire
   `emitControllerEvent(-1)`, so the UI keeps showing hints for a gone controller; and it can fire
   the reset for the WRONG pad, clearing hints while a controller is still live.

Purpose: Console Mode hints stop lying to Nintendo users, and controller-connected state stops
desynchronising on multi-pad disconnects.

Output: Two surgical source edits plus two RED-proven regression suites.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

@src/frontend/screens/ConsoleMode/controller.ts
@src/frontend/helpers/gamepad.ts
@src/frontend/helpers/gamepad_layouts/standard.ts
@src/frontend/screens/ConsoleMode/index.tsx
@src/frontend/screens/ConsoleMode/components/BackHint/index.tsx
@src/frontend/screens/ConsoleMode/__tests__/selectors.test.ts

<interfaces>
<!-- Extracted from the codebase. Use these directly -- do not re-explore. -->

src/frontend/screens/ConsoleMode/controller.ts (no imports; freely importable in jest):
  export type ControllerLayout = 'ps4' | 'ps5' | 'xbox' | 'nintendo' | 'steam-deck'
  export const BTN_ACTION = 0, BTN_BACK = 1, BTN_L1 = 4, BTN_R1 = 5, BTN_R2 = 7
  export const getActionButtonLabel: (layout: ControllerLayout) => string
  export const getBackButtonLabel: (layout: ControllerLayout) => string
  export function detectControllerLayout(id: string): ControllerLayout
    -- the nintendo arm is /nintendo|057e|switch|joy.?con|pro.?controller/i, tested AFTER
       /microsoft|xbox/i, and the function's fallback return is 'xbox'

src/frontend/helpers/gamepad.ts:
  export const initGamepad: () => void        -- all window/navigator access lives INSIDE this
  export const toggleControllerIsDisabled: (value: boolean | undefined) => void
  module-scope mutable state: `let controllerIsDisabled = false`, `let currentController = -1`
  initGamepad-scope state: `let controllers: number[] = []` (gamepad.index values, push order)
  private: connecthandler, addgamepad, disconnecthandler, removegamepad,
           dispatchControllerEvent, emitControllerEvent, updateStatus, checkAction

  emitControllerEvent(controllerIndex: number):
    - early-returns when `currentController === controllerIndex` (so a redundant -1 is silent)
    - on -1: sets currentController = -1 and dispatches CustomEvent('controller-changed',
      { detail: { controllerId: '' } }) on `window`
    - otherwise: requires navigator.getGamepads()[controllerIndex] to be non-null, sets
      currentController, dispatches the event with that pad's `id`, and registers a `once`
      mousemove listener that resets to -1

src/frontend/helpers/gamepad_layouts/standard.ts:
  export function checkStandard(buttons, axes, controllerIndex, checkAction): void
    -- mainButton = buttons[0], backButton = buttons[1], contextMenuButton = buttons[2],
       altButton = buttons[3]; POSITION-based, correct as written, DO NOT TOUCH
</interfaces>

<test_harness_facts>
<!-- Empirically verified during planning. Do not re-derive; these are load-bearing. -->

1. The frontend jest project (`src/frontend/jest.config.js`, displayName "Frontend") runs
   `testEnvironment: 'node'` -- there is NO jsdom, and installing `jest-environment-jsdom`
   is out of scope (package-manager-install carve-out). `resetMocks: true` is set.
   Test files must live under a `__tests__/` directory and end in `.test.ts` / `.test.tsx`.

2. `import '../gamepad'` FAILS at import time under this config with
   `SyntaxError: Unexpected token '.'` -- gamepad.ts imports `./virtualKeyboard`, which does
   `import 'simple-keyboard/build/css/index.css'` at module top level, and there is no
   moduleNameMapper for CSS. VERIFIED. The unblock, also VERIFIED, is a top-of-file
   `jest.mock('../virtualKeyboard', () => ({ VirtualKeyboardController: { ... } }))` factory
   stubbing isButtonFocused, isActive, initOrFocus, destroy, space, backspace and
   typeCharacter. A factory mock prevents the real module (and its CSS import) from ever
   loading. Do NOT add a jest moduleNameMapper -- it is a config change affecting every
   frontend suite and is out of scope.

3. `src/frontend/screens/ConsoleMode/controller.ts` has no imports and is importable as-is.

4. Node 26 provides global `CustomEvent` and `EventTarget`, so `new CustomEvent(...)` inside
   gamepad.ts resolves without a shim.

5. `checkAction` swallows the FIRST press seen for a given controllerIndex: `triggeredAt` is
   `undefined` on the first frame, `undefined !== 0` makes `wasActive` true, and mainAction has
   no repeatDelay, so nothing fires. A test that needs `currentController` set MUST run one
   IDLE frame (all buttons unpressed, which seeds `triggeredAt[idx] = 0`) before the pressed
   frame. VERIFIED -- omitting the idle frame produces a silently empty event log.
</test_harness_facts>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Give the Nintendo layout its own face-button labels</name>
  <files>src/frontend/screens/ConsoleMode/controller.ts, src/frontend/screens/ConsoleMode/__tests__/controllerButtonLabels.test.ts</files>
  <behavior>
    New suite `controllerButtonLabels.test.ts`, imported directly from `../controller`.

    DEFECT GATES -- each of these currently returns the OTHER value, so each is RED against
    the pre-fix source and GREEN after. State this explicitly in the file's header comment.
    - getActionButtonLabel('nintendo') === 'B'   (pre-fix returns 'A')
    - getBackButtonLabel('nintendo')   === 'A'   (pre-fix returns 'B')

    REGRESSION GUARDS -- these pass both before and after; label them as guards, not gates,
    so nobody later mistakes them for defect coverage:
    - getActionButtonLabel('xbox') === 'A' and getBackButtonLabel('xbox') === 'B'
    - getActionButtonLabel('steam-deck') === 'A' and getBackButtonLabel('steam-deck') === 'B'
    - getActionButtonLabel('ps4') === '✕' and getBackButtonLabel('ps4') === '◯'
    - getActionButtonLabel('ps5') === '✕' and getBackButtonLabel('ps5') === '◯'

    REACHABILITY GUARD -- also passes both before and after; it proves the nintendo branch is
    reachable from a real device id rather than dead:
    - detectControllerLayout('Pro Controller (Vendor: 057e Product: 2009)') === 'nintendo'

    EXHAUSTIVENESS -- drive the defect gates and regression guards from an explicitly typed
    `Record<ControllerLayout, { action: string; back: string }>` table so that adding a sixth
    ControllerLayout member fails `tsc` until the table is extended. Iterate that table with
    `it.each` / Object.entries; do not hand-write six disconnected assertions.
  </behavior>
  <action>
    Edit only the two label arrow functions in `src/frontend/screens/ConsoleMode/controller.ts`.
    Add a `'nintendo'` branch that is checked after the existing `layout.startsWith('ps')` test:
    the action label becomes 'B' and the back label becomes 'A'. Every other layout keeps its
    current value. Prefer a small explicit conditional or a layout-keyed lookup over nesting
    more ternaries than the file already reads clearly with.

    Add a short comment above the pair recording WHY the Nintendo values look inverted: the
    Chromium standard mapping is POSITION-based, so `buttons[0]` (mainAction) sits under the
    physical **B** cap on a Switch pad and `buttons[1]` (back) sits under the physical **A** cap.

    Do NOT touch `BTN_ACTION` / `BTN_BACK`, `detectControllerLayout`, `checkStandard`, or any
    file under `gamepad_layouts/`. This is a label-only change -- remapping which index drives
    which action would break every non-Nintendo pad. Do not add new ControllerLayout members,
    Joy-Con detection entries, or CSS `.buttonImage` variants; `ControllerHints/index.tsx`
    renders glyph classes and is not a consumer of these functions.
  </action>
  <verify>
    <automated>npx jest --selectProjects Frontend --runTestsByPath src/frontend/screens/ConsoleMode/__tests__/controllerButtonLabels.test.ts</automated>
    <automated>pnpm codecheck</automated>
  </verify>
  <done>The new suite passes; `git stash`-ing only controller.ts's source edit and re-running the suite fails on exactly the two defect gates; `pnpm codecheck` is clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Compare gamepad index, not array position, on disconnect</name>
  <files>src/frontend/helpers/gamepad.ts, src/frontend/helpers/__tests__/gamepadDisconnect.test.ts</files>
  <behavior>
    New suite `gamepadDisconnect.test.ts`. This is a BEHAVIOURAL suite -- it drives the real
    `initGamepad()` and asserts on the `controller-changed` CustomEvent actually handed to
    `window.dispatchEvent`. Do not write a source-text gate and do not assert on a proxy.

    Harness (build it once as a local factory reused by both cases; every piece below was
    verified during planning):
    - Top-of-file `jest.mock('../virtualKeyboard', ...)` factory per test_harness_facts item 2.
    - Assign onto `globalThis`: a fake `window` with addEventListener (recording listeners into
      a Map keyed by type), a no-op removeEventListener, a dispatchEvent that pushes events
      whose `type` is 'controller-changed' into an `emitted` array, `location: { hash: '#/' }`,
      and `api.requestAppSettings` resolving `{ disableController: false }` plus no-op
      `gamepadAction` / `setFullscreen`; a fake `navigator` whose `getGamepads()` returns a
      mutable `pads` array; a fake `document` with `querySelector: () => null` and
      `body.classList.contains: () => false`; and a `requestAnimationFrame` that pushes the
      callback onto a queue instead of scheduling it, so frames are driven manually one at a
      time (updateStatus re-arms itself on every frame -- never drain the queue in a loop).
    - A pad factory returning `{ index, id, buttons: 17 entries of { pressed, touched, value },
      axes: [0,0,0,0], connected: true, mapping: 'standard', timestamp }`. Keep ids free of
      'Vendor: 28de' so the Steam-Input masking filter treats them as valid, and free of the
      gamecube / 2563.0523 / 0079.0006 / 0583.a009 patterns so `checkStandard` is selected.
    - `jest.resetModules()` before each `require('../gamepad')` so module-scope
      `currentController` starts at -1 for every case.
    - Fire connects/disconnects by invoking the recorded 'gamepadconnected' /
      'gamepaddisconnected' listeners with `{ gamepad }`.

    CASE 1 -- the active pad disconnects and is not reset (VERIFIED RED pre-fix):
      connect a pad at gamepad.index 0, then a pad at gamepad.index 3 (controllers = [0, 3]);
      run one idle frame; set pads so index 3 has buttons[0].pressed and run a second frame,
      asserting one event carrying pad 3's id; then null out index 3 and fire the disconnect.
      Expect a SECOND event whose `detail.controllerId` is ''.
      Pre-fix: removedIndex is 1, currentController is 3, 1 !== 3, so NO second event is
      emitted and the assertion fails on length 1 vs 2. Confirmed by execution.

    CASE 2 -- a non-active pad wrongly triggers the reset (VERIFIED RED pre-fix):
      connect the pad at gamepad.index 5 FIRST, then the pad at gamepad.index 0, so
      controllers = [5, 0]; run one idle frame; press buttons[0] on the index-0 pad and run a
      second frame, asserting one event carrying pad 0's id; then null out index 5 and fire its
      disconnect. Expect NO further event -- the still-connected pad 0 keeps its hints.
      Pre-fix: removedIndex is 0 and currentController is 0, so the guard matches and an
      unwanted `controllerId: ''` reset fires. Confirmed by execution.

    Do NOT write a test for the "untracked pad (Logitech G29) disconnects while
    currentController is -1" path. It was analysed during planning and is NOT observable
    through the event: `emitControllerEvent(-1)` early-returns when `currentController` is
    already -1, so pre-fix and post-fix behaviour are identical. A test there would pass both
    before and after and guard nothing. Record that finding in the file's header comment
    instead of asserting it.
  </behavior>
  <action>
    In `src/frontend/helpers/gamepad.ts`, rewrite the guard inside `removegamepad` (currently at
    lines 550 and 556). Replace the `removedIndex` binding with a boolean capturing whether the
    disconnecting pad was tracked at all -- `controllers.includes(gamepad.index)`, evaluated
    BEFORE the filter -- and change the condition to require both that boolean and
    `gamepad.index === currentController`. Leave the `controllers.filter(...)` line and the
    `emitControllerEvent(-1)` call exactly as they are.

    Update the two adjacent comments so they describe index-vs-position rather than the old
    semantics, and note that the tracked check exists so an ignored device (the Logitech G29
    that `connecthandler` never adds) can never reach the reset.

    Do NOT change `emitControllerEvent`, `connecthandler`, `addgamepad`, `updateStatus`,
    `checkAction`, the Steam Input masked-gamepad filter, or any `gamepad_layouts/` file.
  </action>
  <verify>
    <automated>npx jest --selectProjects Frontend --runTestsByPath src/frontend/helpers/__tests__/gamepadDisconnect.test.ts</automated>
    <automated>pnpm codecheck</automated>
  </verify>
  <done>Both cases pass; reverting only the two edited lines in gamepad.ts and re-running makes BOTH cases fail (case 1 on a missing reset, case 2 on a spurious reset); `pnpm codecheck` is clean.</done>
</task>

<task type="auto">
  <name>Task 3: Prove the anti-vacuity claims and clear the lint gate</name>
  <files>src/frontend/screens/ConsoleMode/__tests__/controllerButtonLabels.test.ts, src/frontend/helpers/__tests__/gamepadDisconnect.test.ts</files>
  <action>
    Anti-vacuity proof. For each of the four defect gates (2 label gates, 2 disconnect cases),
    temporarily restore the pre-fix source line, re-run that suite, and record the observed
    failure text in the SUMMARY. Restore the fix immediately afterwards. Do this with an
    in-place edit and an in-place revert -- do NOT use `git stash` (this repo has twice had a
    concurrent session's work stranded by an executor stash) and do NOT copy files to a temp
    directory to check them (config resolution differs outside the repo). Verify with
    `git diff --stat` that the working tree is back to the intended state before moving on.

    Lint gate. `pnpm codecheck` is `tsc --noEmit` only and says NOTHING about lint, which is a
    separate CI workflow. Run `pnpm lint` and `pnpm prettier` and fix anything the new test
    files trip. Note that ts-jest here is TRANSPILE-ONLY, so a green jest run is not evidence
    of type soundness -- `pnpm codecheck` is the only such evidence.

    Full-suite check. Run the whole Frontend project to confirm no existing suite regressed,
    in particular the ConsoleMode suites that share the `__tests__` directory.
  </action>
  <verify>
    <automated>pnpm lint</automated>
    <automated>pnpm prettier</automated>
    <automated>pnpm codecheck</automated>
    <automated>npx jest --selectProjects Frontend</automated>
    <automated>git diff --stat -- src/frontend/helpers/gamepad.ts src/frontend/screens/ConsoleMode/controller.ts</automated>
  </verify>
  <done>All four defect gates have a recorded pre-fix failure message in the SUMMARY; lint, prettier and codecheck are clean; the full Frontend jest project is green; the working tree contains exactly the two intended source edits plus the two new test files.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| OS/browser -> renderer | `navigator.getGamepads()` returns attacker-influenceable `id` strings from arbitrary connected HID devices |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ooq-01 | Information disclosure | `dispatchControllerEvent(gamepad.id)` in `src/frontend/helpers/gamepad.ts` | accept | Pre-existing behaviour, unchanged by this plan. The device id is already dispatched today; the fix only changes WHEN a reset fires. No new data crosses the boundary. |
| T-ooq-02 | Denial of service | `detectControllerLayout` regex set in `src/frontend/screens/ConsoleMode/controller.ts` | accept | All arms are linear, anchor-free alternations over a short device id with no nested quantifiers, so no ReDoS amplification is reachable. Unchanged by this plan. |
| T-ooq-SC | Tampering | npm/pip/cargo installs | mitigate | Not applicable -- this plan installs NO packages. The `jest-environment-jsdom` route was considered and rejected precisely to keep the package-legitimacy surface at zero. If an executor finds itself reaching for an install, STOP and escalate. |
</threat_model>

<verification>
- `getActionButtonLabel('nintendo')` returns 'B' and `getBackButtonLabel('nintendo')` returns 'A'.
- `getActionButtonLabel` / `getBackButtonLabel` return unchanged values for 'xbox', 'steam-deck', 'ps4' and 'ps5'.
- `removegamepad` compares `gamepad.index` against `currentController` and additionally requires the pad to have been tracked.
- Disconnecting the active pad at a gamepad index that differs from its array position emits `controller-changed` with an empty `controllerId`.
- Disconnecting a non-active pad whose array position happens to equal `currentController` emits nothing.
- `checkStandard` and every file under `src/frontend/helpers/gamepad_layouts/` are byte-identical to HEAD.
- `pnpm codecheck`, `pnpm lint`, `pnpm prettier` and the full Frontend jest project are all clean.
</verification>

<success_criteria>
Both Heroic defects are fixed with two-line-scale source edits, each covered by a regression
test whose failure against the known-bad source has been observed and recorded. No new npm
dependency, no jest config change, no change to button-index-to-action mapping, and no new
ControllerLayout member.
</success_criteria>

<output>
Create `.planning/quick/260821-ooq-port-heroic-gamepad-fixes-nintendo-face-/260821-ooq-SUMMARY.md` when done
</output>
