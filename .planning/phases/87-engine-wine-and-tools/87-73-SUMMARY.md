---
phase: 87-engine-wine-and-tools
plan: 73
subsystem: gap-closure-launch-end-and-play-latch
tags: [gap-closure, svc-02, rf2, d-06, wake-lock, play-latch, dialogs, launcher]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: "87-71 re-run 2 contract (item 1 expects the launch to end after the offline refusal)"
provides:
  - "releaseDisplaySleepBlock(deps) in launcher.ts: one release of the display sleep blocker, used on the normal end, the refused engine step, a rejected engine step and a failed Wine check"
  - "launch() dialogs (offline warning, update prompt) settle {status: abort} when dismissed without a button"
  - "releasesPlayClicked covers done and error; releasesPlayClickedForFrame and a GamePage frame subscription release the latch from this game's backend frames"
affects: [87-74, 87-75, 87-76, 87-77, 87-78, 87-79]

actuals:
  tokens: 14500
  tasks: 2
  commits: 2

plan_head_before: 392923b0a435861425c0986ac385f06b4005f5ae
commits: 2
plan_head_after: 3d2967bdf

tech-stack:
  added: []
  patterns:
    - "A dialog that carries its own onClose is closed by that onClose alone (DialogHandler); MessageBoxModal runs onClose before a button's onClick in one click, so the abort is decided in a microtask after the handler ran (launchDialogLifecycle)"

key-files:
  created:
    - src/frontend/helpers/__tests__/launchDialogsSettle.test.ts
  modified:
    - src/backend/launcher.ts
    - src/backend/__tests__/launcher.engineStep.test.ts
    - src/frontend/helpers/library.ts
    - src/frontend/screens/Game/GamePage/playClickedLatch.ts
    - src/frontend/screens/Game/GamePage/__tests__/playClickedLatch.test.ts
    - src/frontend/screens/Game/GamePage/index.tsx

key-decisions:
  - "87-73: the dialogs' onClose must close the dialog itself (by dialogId) because DialogHandler skips its own close when onClose is set, and must not let its abort beat a pressed button, because MessageBoxModal calls onClose before the button's onClick"
  - "87-73: GamePage subscribes to handleGameStatus for the page's life, not from the click, so no frame can precede the listener"

requirements-completed: []

duration: about 35 min
completed: 2026-11-25
---

# Phase 87 Plan 73: Refused Launch End and Play Latch Summary

**A refused, rejected or Wine-check-failed launch now stops and clears the display sleep blocker and sends `done`; the game page's Play latch is released by `done`/`error` and by this game's own backend frames, and `launch()`'s two dialogs settle when dismissed without a button.**

## What was built

**Task 1 (backend, `747741cb5`).** `releaseDisplaySleepBlock(deps)` does nothing when `deps.power.displayId` is null; otherwise it logs `Stopping Display Power Saver Blocker` once, calls `wakeLock.stop(id)` and sets `displayId = null`. It replaces the inline stop at the normal end (which never cleared the id, so the next launch skipped `wakeLock.start`) and is called on the `refused` return (before `done`), on the Wine-check failure return, and in a new catch around `runLaunchEngineStep` (which also sends `done` and closes the log writer before rethrowing the original error). Five cases in `launcher.engineStep.test.ts`; four were red at HEAD (refused, rejection, Wine check, second launch), the normal-end id-clear case too.

**Task 2 (renderer, `3d2967bdf`).**
- `launch()`: both dialogs pass `dialogId` and `onClose` through `launchDialogLifecycle`. A dismissal without a button closes the dialog by id and resolves `{status: 'abort'}`; every button handler calls `choose()` first, so a pressed button keeps its own result.
- `releasesPlayClicked` now releases on `done` and `error` too. `releasesPlayClickedForFrame(frame, appName, runner)` applies it to a backend frame of this game only (a pre-launch `syncing-saves` frame, another game or another runner never releases).
- GamePage subscribes to `window.api.handleGameStatus` for its life and releases the latch from such a frame. `handlePlay`'s `finally` is unchanged; an IPC answer of `{status: 'abort'}` ends it there.

## Which hole RF2 hit

The re-run 1 captures are gone, so this rests on code and tests (as the plan flagged); re-run 2 item 1 is the live proof.

| Candidate hole | Proven by | Result |
| -------------- | --------- | ------ |
| A `launch()` dialog promise never settles when its dialog is dismissed without a button | `launchDialogsSettle.test.ts` "settles {status: abort} when closed without a button" (both dialogs): at HEAD the promise stayed pending (5 s jest timeout), and the dialogs carried no `onClose` | **Hit by code path, closed.** Reachable on both dialogs (X or Escape). |
| The status effect misses a `launching` that a `done` followed at once | `playClickedLatch.test.ts` "the rendered status alone cannot see it": renders show `installed` before and after, so the status-only rule leaves the latch set; the frame replay releases it | **Real, closed.** Rendered status goes through store state and effects, so both frames can pass between renders. It only strands the latch when the launch IPC has not resolved. |
| The backend never sends `done` | Task 1 refused, rejected and Wine-check cases: all three sent `done` already except the rejected engine step, which sent none and left the blocker | **Hit for a rejected engine step (no `done`); the refused and Wine-check paths did send `done` but leaked the blocker.** Closed. |

I cannot say from the code alone which of the three the operator's run took; the first and third were each reachable and are closed, and the second is closed as defence. The dialogs' `onClose` is the one change with a trap worth knowing: DialogHandler does not close a dialog that has its own `onClose`, and MessageBoxModal runs `onClose` before the button's `onClick`, so a plain `onClose: () => res(abort)` would both leave the dialog open and beat "Play Anyway". `launchDialogsSettle.test.ts` pins both (a press keeps its result; a dismissal closes the dialog by id).

## Task commits

1. Task 1 (tracer): `747741cb5` (fix)
2. Task 2: `3d2967bdf` (fix)
3. Plan metadata: the commit that carries this SUMMARY

`commits: 2` is measured from the ledger base `392923b0a`. No other session committed in that window.

## Verification

- `pnpm exec jest` over `launcher.engineStep.test.ts` and `launcher_launchSingleFlight.test.ts`: 23 passed.
- `pnpm exec jest` over `launchDialogsSettle`, `playClickedLatch`, `launchOptionPicker`, `libraryLaunchSteamUpdatePrompt`: 32 passed.
- `pnpm codecheck`: clean. `npx prettier --check` over all 7 paths: clean, all reported `ignored: false`. ESLint over the five renderer files: 0 errors, 13 warnings, all pre-existing patterns in untouched lines of `GamePage/index.tsx`.
- Acceptance: `releaseDisplaySleepBlock(` count 5 (>= 4); `displayId = null` count 1 (>= 1); `onClose` in `library.ts` count 7 (>= 2).
- Tracer feedback gate: the tracer `<verify>` ran green end to end before Task 2 started (`gate` not `blocking-human`).

## Deviations from Plan

**1. [Rule 2 - Missing critical] The rejected-engine-step catch also closes the log writer.**
- **Found during:** Task 1
- **Issue:** the refused and Wine-check returns close `logWriter`; a rejection left it open for the life of the process.
- **Fix:** the catch awaits `logWriter.close().catch(() => undefined)` before rethrowing. The original error still propagates.
- **Files modified:** `src/backend/launcher.ts`. **Commit:** `747741cb5`.

**2. [Rule 1 - Bug] A bare `onClose: () => res(abort)` would have broken Play Anyway and left the dialog open.**
- **Found during:** Task 2 (reading DialogHandler and MessageBoxModal; the plan's action said to pass `onClose` that resolves abort)
- **Issue:** MessageBoxModal calls `onClose` before the pressed button's `onClick`, so the abort would win over every button; DialogHandler also skips its own close when `onClose` is set.
- **Fix:** `launchDialogLifecycle` closes the dialog by `dialogId` and decides the abort in a microtask, after the button handler has called `choose()`.
- **Files modified:** `src/frontend/helpers/library.ts`. **Commit:** `3d2967bdf`.

**3. [Process] Scope.** STATE.md: only `state.record-metric` and `state.add-decision` ran, as the plan and the live Phase 88.1 session require. `requirements.mark-complete` for SVC-02 was not run (its live half is proven only at 87-79).

**Total deviations:** 2 auto-fixed (Rule 1, Rule 2), 1 process note. **Impact:** none on scope; the dialog fix is the reason the renderer half works at all.

## Known Stubs

None.

## Threat Flags

None. T-87-141 (blocker held after a launch ended) and T-87-142 (Play stuck on launching) are mitigated as planned and each path has a test.

## Issues Encountered

None.

## Next Phase Readiness

87-74 onward can proceed. The live proof is re-run 2 item 1 (87-79): the log must show `Stopping Display Power Saver Blocker` after the refusal, and the Play button must return to Play without leaving the page.

## Self-Check: PASSED

- FOUND: `src/frontend/helpers/__tests__/launchDialogsSettle.test.ts`, `src/backend/launcher.ts`
- FOUND: `747741cb5`, `3d2967bdf` (ancestors of HEAD)
