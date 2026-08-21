---
phase: quick-260821-ooq
plan: 01
subsystem: ui
tags: [gamepad, console-mode, jest, ts-jest, behavioral-testing]

requires: []
provides:
  - Correct Nintendo-layout face-button labels in Console Mode
  - Index-based (not position-based) gamepad disconnect comparison
affects: [console-mode-gamepad-hints, gamepad-connection-lifecycle]

tech-stack:
  added: []
  patterns:
    - "Node-env jest (no jsdom): stub window/navigator/document/requestAnimationFrame directly on globalThis, cast through `as unknown as { ... }` (precedent: declaredUnavailable.test.ts)"
    - "jest.mock factory for a CSS-importing module (virtualKeyboard.ts) to avoid a missing moduleNameMapper"

key-files:
  created:
    - src/frontend/screens/ConsoleMode/__tests__/controllerButtonLabels.test.ts
    - src/frontend/helpers/__tests__/gamepadDisconnect.test.ts
  modified:
    - src/frontend/screens/ConsoleMode/controller.ts
    - src/frontend/helpers/gamepad.ts

key-decisions:
  - "Anti-vacuity proof done via in-place edit + in-place revert on the real source files, never git stash (this repo has twice stranded concurrent session work with it) and never a temp-directory copy (prettier config resolution differs there)"
  - "Did not write a test for the 'untracked pad disconnects while currentController is -1' path -- emitControllerEvent(-1) early-returns when currentController is already -1, so pre-fix and post-fix behavior are identical there; a test would pass both before and after and guard nothing"

patterns-established:
  - "Behavioral gamepad testing harness: globalThis-stubbed window/navigator/document/requestAnimationFrame with a manually-driven rAF queue, one idle frame before any pressed frame (checkAction swallows the first press seen per controllerIndex)"

requirements-completed: [QUICK-260821-ooq]

duration: 45min
completed: 2026-08-21
---

# Quick Task 260821-ooq: Port Heroic gamepad fixes (Nintendo face buttons + disconnect index bug) Summary

**Nintendo Switch Pro Controller now shows correct B/A confirm/back hints in Console Mode, and disconnecting any gamepad compares its real `gamepad.index` (not its array position) against the active controller, fixing both a missed reset and a spurious reset on multi-pad disconnects.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 3/3 completed
- **Files modified:** 4 (2 source, 2 new test files)

## Accomplishments

- `getActionButtonLabel('nintendo')` now returns `'B'` and `getBackButtonLabel('nintendo')` now returns `'A'` (previously fell through to the Xbox default: `'A'`/`'B'`, backwards for a Nintendo pad because Chromium's mapping is position-based, not glyph-based)
- `removegamepad` now compares `gamepad.index === currentController` (guarded by `controllers.includes(gamepad.index)`) instead of comparing an array-position `findIndex` result against a gamepad-index value
- Two new regression suites, both RED-proven against the pre-fix source (anti-vacuity proof captured below)

## Task Commits

1. **Task 1: Give the Nintendo layout its own face-button labels** - `c60eb9776` (fix)
2. **Task 2: Compare gamepad index, not array position, on disconnect** - `a1eddb5c3` (fix)
3. **Task 3: Prove the anti-vacuity claims and clear the lint gate** - `a4d34a2ea` (style; prettier reformat + eslint rule-name correction of the Task 2 test file, no source changes)

_No metadata commit for docs artifacts yet -- orchestrator handles that separately per the execution constraints._

## Files Created/Modified

- `src/frontend/screens/ConsoleMode/controller.ts` - Added a `'nintendo'` branch to `getActionButtonLabel`/`getBackButtonLabel`, checked after the existing `layout.startsWith('ps')` test; `BTN_ACTION`/`BTN_BACK`/`detectControllerLayout` untouched
- `src/frontend/screens/ConsoleMode/__tests__/controllerButtonLabels.test.ts` - Exhaustive `Record<ControllerLayout, {action,back}>`-driven suite (`it.each`) covering both defect gates, all four regression guards, and a reachability guard for `detectControllerLayout`
- `src/frontend/helpers/gamepad.ts` - `removegamepad` now binds `wasTracked = controllers.includes(gamepad.index)` before filtering, and requires both `wasTracked && gamepad.index === currentController` to fire `emitControllerEvent(-1)`; `checkStandard` and all `gamepad_layouts/` files untouched
- `src/frontend/helpers/__tests__/gamepadDisconnect.test.ts` - Behavioral suite driving the real `initGamepad()` against a globalThis-stubbed window/navigator/document/requestAnimationFrame harness, asserting on the actual `controller-changed` CustomEvent for both defect cases

## Decisions Made

- Followed the plan's prescribed harness exactly: `jest.mock('../virtualKeyboard', ...)` factory (avoids the CSS-import crash), `jest.resetModules()` before each `require('../gamepad')` (fresh module-scope `currentController` per case), and a manually-driven `requestAnimationFrame` queue (never drained in a loop) so frames are stepped one at a time
- Test pad ids kept free of `Vendor: 28de`, `gamecube`/`0337`, `2563.*0523`, `0079.*0006`, `0583.*a009`, and `046d.*c24f` patterns so the Steam-Input masking filter, layout-detection dispatch, and Logitech-G29 ignore rule in `gamepad.ts` never interfere with the two cases under test
- Deferred (not fixed) two out-of-scope discoveries -- see `deferred-items.md` in this directory

## Deviations from Plan

None of the four Deviation Rules (1-4) were triggered. The one adjustment was a self-correction within Task 3's own scope: the first draft of `gamepadDisconnect.test.ts` used an incorrect eslint-disable comment (`no-var-requires` instead of the actual rule name `no-require-imports`), caught by the plan's own `pnpm lint` verify step and fixed in the same task before commit -- not a deviation from the plan, just the plan's own gate doing its job.

## Anti-Vacuity Proof (Task 3, all four defect gates)

Each gate was proven RED against the pre-fix source via an in-place edit + in-place revert (never `git stash`, never a temp-directory copy). `git diff --stat` confirmed a clean revert back to the committed state after each check.

**Gate 1 -- `getActionButtonLabel('nintendo')` should be `'B'`**
Reverted `controller.ts`'s action function to the pre-fix `layout.startsWith('ps') ? '✕' : 'A'` (no nintendo branch). Result:
```
✕ nintendo layout: action={"action": "B", "back": "A"} back=%p (2 ms)
  Expected: "B"
  Received: "A"
Tests: 1 failed, 5 passed, 6 total
```

**Gate 2 -- `getBackButtonLabel('nintendo')` should be `'A'`**
Restored the action fix, reverted the back function to the pre-fix `layout.startsWith('ps') ? '◯' : 'B'`. Result:
```
✕ nintendo layout: action={"action": "B", "back": "A"} back=%p (1 ms)
  Expected: "A"
  Received: "B"
Tests: 1 failed, 5 passed, 6 total
```
Both label defect gates fail as predicted on the pre-fix source. Fix restored; `git diff --stat -- controller.ts` confirmed empty after restoration.

**Gate 3 -- disconnecting the ACTIVE pad emits a reset even when its `gamepad.index` differs from its array position**
Reverted `removegamepad` to the pre-fix `const removedIndex = controllers.findIndex(...)` / `if (removedIndex === currentController)`. Result:
```
✕ CASE 1 -- disconnecting the ACTIVE pad emits a reset ...
  Expected length: 2
  Received length: 1
  Received array:  [{"detail": {"controllerId": "Test Pad 3 (Vendor: 1234 Product: 5678)"}, "type": "controller-changed"}]
```
Matches the plan's prediction exactly: `removedIndex` is `1` (array position of index-3 pad within `[0, 3]`), `currentController` is `3`, `1 !== 3`, so the reset never fires.

**Gate 4 -- disconnecting a NON-active pad whose array position equals `currentController` emits nothing further**
Same reverted source as Gate 3. Result:
```
✕ CASE 2 -- disconnecting a NON-active pad whose array position equals currentController emits nothing further
  Expected length: 1
  Received length: 2
  Received array:  [{"detail": {"controllerId": "Test Pad 0 (Vendor: 1234 Product: 5678)"}, "type": "controller-changed"}, {"detail": {"controllerId": ""}, "type": "controller-changed"}]
```
Matches the plan's prediction: `removedIndex` is `0` (array position of index-5 pad within `[5, 0]`), `currentController` is `0`, `0 === 0`, so an unwanted reset fires even though the still-connected pad-0 should keep its hints.

Both disconnect defect gates fail as predicted on the pre-fix source. Fix restored; `git diff --stat -- gamepad.ts` confirmed empty after restoration.

**Conclusion: all four defect gates are non-vacuous.** Each fails against the known-bad pre-fix source with the exact failure mode the plan predicted, and passes against the fix.

## Verification Gate Results

- `npx jest --selectProjects Frontend --runTestsByPath .../controllerButtonLabels.test.ts` -- 6/6 pass
- `npx jest --selectProjects Frontend --runTestsByPath .../gamepadDisconnect.test.ts` -- 2/2 pass
- `pnpm codecheck` (`tsc --noEmit`) -- clean, zero errors, run after every task
- `pnpm lint` scoped to this plan's four files (`npx eslint <files>`) -- 0 errors, 3 pre-existing warnings on unrelated lines in `gamepad.ts` (floating-promise warnings on `window.api.requestAppSettings().then(...)` and `window.api.gamepadAction(...)` calls that predate this plan and were not touched)
- `pnpm lint` (whole repo) -- 9 pre-existing errors in `meta/hardcodedStringGate.ts` (unrelated file, confirmed untouched by this plan's commits via `git diff --stat`), logged to `deferred-items.md`, not fixed
- `pnpm prettier` scoped to this plan's four files -- clean after one `--write` pass on `gamepadDisconnect.test.ts`; re-ran jest + codecheck after the reformat to confirm nothing broke
- `npx jest --selectProjects Frontend` (full project) -- 1855/1856 tests pass; the one failure (`steamInstallOptionsEntry.test.ts` D4, a pinned source-class-count gate on `GameSubMenu/index.tsx`) is pre-existing and unrelated -- this plan's commits never touch `GameSubMenu/index.tsx` or that test file, confirmed via `git diff --stat` across both fix commits. Logged to `deferred-items.md`.
- `git diff --stat -- gamepad.ts controller.ts` -- empty both times, confirming the anti-vacuity in-place revert cycles left no residue

## Known Stubs

None.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes were introduced. `T-ooq-01`, `T-ooq-02`, and `T-ooq-SC` from the plan's threat register all remain in their `accept`/`mitigate: not applicable` disposition -- no new npm package was installed.

## Issues Encountered

- `pnpm prettier` (whole-repo `prettier --check .`) is slow on this repo (multi-minute run against the full tree); ran it in the background and cross-verified with a scoped `npx prettier --check` against this plan's four files, which returned promptly and caught the one formatting issue (fixed with `--write` in place, then re-verified with jest + codecheck).

## Next Phase Readiness

Both Heroic-ported defects are closed with narrow, RED-proven fixes. No new `ControllerLayout` member, no npm install, no change to button-index-to-action mapping. `deferred-items.md` in this directory records two pre-existing, out-of-scope items (a lint-error batch in `meta/hardcodedStringGate.ts` and a stale pinned class-count in `steamInstallOptionsEntry.test.ts`) for whoever owns those gates to re-baseline.

---
*Quick task: 260821-ooq*
*Completed: 2026-08-21*

## Self-Check: PASSED

All created/modified files confirmed present on disk; all three task commit hashes (`c60eb9776`, `a1eddb5c3`, `a4d34a2ea`) confirmed present in `git log`.
