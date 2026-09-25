---
phase: quick-260925-op0
plan: 01
subsystem: frontend-gamepad
tags: [instrumentation, temporary, phase-38-controller-sitting]
dependency-graph:
  requires: []
  provides: ["[GAMEPAD-ACT] diagnostic log line in gamelib.log for every dispatched controller action"]
  affects: ["src/frontend/helpers/gamepad.ts checkAction()"]
tech-stack:
  added: []
  patterns: ["window.api?.logInfo?.() inside try/catch, matching the permanent [GAMEPAD] connect-line pattern"]
key-files:
  created: []
  modified:
    - src/frontend/helpers/gamepad.ts
decisions: []
metrics:
  duration: "~30 minutes"
  completed: "2026-09-25"
---

# Phase quick-260925-op0 Plan 01: Add temporary GAMEPAD-ACT dispatch probe Summary

Added a TEMPORARY post-switch, pre-dispatch diagnostic probe inside `checkAction()` in
`src/frontend/helpers/gamepad.ts` that emits one `[GAMEPAD-ACT]` line per dispatched controller
action to `gamelib.log`, so the Phase 38 controller sitting can score controller items from
verbatim log artifacts instead of operator recollection.

## What Was Built

**Edit A** (before the `switch (action)` block): captures the pre-switch original action into
`const requestedAction: ValidGamepadAction = action`.

**Edit B** (after the switch closes, before the `if (action === 'mainAction')` dispatch chain):
emits the probe. Full implementation:

```ts
try {
  let line = `[GAMEPAD-ACT] action=${action}`
  if (action !== requestedAction) {
    line += ` from=${requestedAction}`
  }
  line += ` ctrl=${controllerIndex}`
  line += ` tag=${el ? el.tagName : 'none'}`
  if (el) {
    const cls = el.getAttribute('class')
    if (cls) line += ` cls=${cls.slice(0, 60)}`
    const testid = el.getAttribute('data-testid')
    if (testid) line += ` testid=${testid}`
  }
  window.api?.logInfo?.(line)
} catch {
  // diagnostic only -- must never break controller dispatch
}
```

**Verbatim line format as implemented:**

```
[GAMEPAD-ACT] action=<resolved> [from=<requestedAction>] ctrl=<controllerIndex> tag=<TAGNAME|none> [cls=<class, sliced to 60 chars>] [testid=<data-testid>]
```

- `action=` -- always present, the RESOLVED action (post-switch)
- `from=` -- only present when the switch rewrote the action (e.g. `padDown` -> `tab`)
- `ctrl=` -- always present, the controller index
- `tag=` -- always present; `none` when no element is focused
- `cls=` -- only present when the focused element has a non-empty `class` attribute
- `testid=` -- only present when the focused element has a `data-testid` attribute

Routed through `window.api?.logInfo?.()` in the optional-call spelling, the whole emission inside
`try/catch`. This is a true no-op under the three gamepad jest harnesses (none of their fake
`window.api` stubs define `logInfo`) and the `try/catch` is a second layer of defence against
`nintendoLayout.test.ts`'s `fakeFocusedElement` stub, which has no `getAttribute` and would throw
if the read were ever reached.

## Branches That Emit Nothing (by design)

Several branches `return` before reaching the probe. A missing `[GAMEPAD-ACT]` line for these
inputs is correct behaviour, not a missing-input bug:

- **`action === 'guide'`** (Console Mode hash toggle, gamepad.ts ~165-170) -- **ALWAYS** returns
  before the probe. The guide/Home button will NEVER produce a `[GAMEPAD-ACT]` line, even though
  it does act.
- **`action === 'back'`** under `console-launching` / `console-modal-open` body classes
  (gamepad.ts ~174-180).
- Inside the switch: `mainAction` on a text input (VirtualKeyboard `initOrFocus`); `back` under
  `VirtualKeyboardController.isActive()` / `insideDialog()` / `insideDropdown()` / `isSelect()`;
  `altAction` on a game card (play/install) and under VirtualKeyboard; `rightClick` under
  VirtualKeyboard.

## Removal

The probe is marked TEMPORARY in-situ. Comment above the `try` block names the Phase 38
controller sitting it serves, states it is removed in the Phase 38 close-out task, and gives the
single grep token `GAMEPAD-ACT` that finds every line of it (both the comment and the emission
site -- `grep -c 'GAMEPAD-ACT' src/frontend/helpers/gamepad.ts` currently returns `2`).

## Task 2: Gate Battery Results

All gates run and recorded verbatim below. No files were modified by Task 2 (verification only).

| Gate | Result |
|---|---|
| `pnpm codecheck` | PASS, exit 0 (tsc --noEmit clean on both the app and meta configs) |
| `pnpm lint` | PASS, exit 0. `production: PASS \| tests: PASS`. SRC: 1106 warnings (ceiling 1124, under). TESTS: 638 warnings (ceiling 638, exact match -- unaffected by this change since `gamepad.ts` is a source file, not a test file). Zero errors either ceiling. |
| `npx prettier --check src/frontend/helpers/gamepad.ts` | Clean -- "All matched files use Prettier code style!" |
| `nintendoLayout.test.ts` | **35/35 passed** (recorded baseline, matches plan's stated pre-change count) |
| `gamepadRepeatTiming.test.ts` | 2/2 passed (baseline) |
| `gamepadDisconnect.test.ts` | 2/2 passed (baseline) |
| `pnpm planning-gates` | 13/13 planning gates passed |

**Pre-existing, unrelated failures** (named here per plan instruction, not chased, not claimed as
regressions): when the `--selectProjects Frontend` jest invocation ran, it exercised the full
Frontend project (176 suites, 3005 tests) rather than narrowing to just the three named files.
Two suites failed, both pre-existing and unrelated to this change:

- `src/frontend/screens/Game/GamePage/components/__tests__/labelSuiteI18nCensus.test.ts`
- `src/frontend/screens/WebView/__tests__/storeEmbedSingleOpener.test.ts` (a Windows
  path-separator assertion mismatch -- `\` vs `/` in the reported opener path -- unrelated to
  gamepad.ts)

These are exactly the two suites the plan named as expected-red on this tree. To get an
unambiguous per-suite count for the three gamepad suites, each was also run individually
(`npx jest --selectProjects Frontend --verbose <single-file>`), confirming 35/35, 2/2, and 2/2
respectively with no other suite in the run.

Full battery result: `Test Suites: 2 failed, 174 passed, 176 total` / `Tests: 3 failed, 3002
passed, 3005 total` -- the 3 failed tests are all within the two named pre-existing suites.

## Deviations from Plan

None -- plan executed exactly as written. Both tasks completed with no auto-fixes, no
architectural questions, and no scope changes.

## Commits

- `cdf07ee95` -- `feat(quick-260925-op0): add temporary GAMEPAD-ACT dispatch probe` (Task 1;
  Task 2 wrote no files, so it has no commit of its own)

## Self-Check: PASSED

- FOUND: `src/frontend/helpers/gamepad.ts` contains `[GAMEPAD-ACT]`, `window.api?.logInfo?.(`,
  `requestedAction`, and the unmodified `[GAMEPAD] id=` connect line.
- FOUND: commit `cdf07ee95` exists in `git log`.
- FOUND: `git diff --quiet -- src/frontend/helpers/gamepad_layouts/ .planning/phases/` -- no
  changes.
