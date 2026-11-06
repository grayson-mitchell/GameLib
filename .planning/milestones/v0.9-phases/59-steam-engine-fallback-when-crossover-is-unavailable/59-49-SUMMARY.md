---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 49
subsystem: frontend-dialogs
tags: [gap-closure, CR-01, WR-01, IN-01, dialog-queue, launch-option-picker]
requires: [59-45]
provides:
  - "dialogId: same-identity in-place update and targeted close in reduceDialogRequest"
  - "launch-option picker countdown updates in place; no stale duplicate pickers"
key-files:
  created:
    - src/frontend/helpers/__tests__/launchOptionPicker.test.ts
  modified:
    - src/frontend/types.ts
    - src/frontend/state/dialogQueue.ts
    - src/frontend/state/__tests__/dialogQueue.test.ts
    - src/frontend/components/UI/DialogHandler/index.tsx
    - src/frontend/helpers/library.ts
    - src/frontend/screens/Humble/Keys/index.tsx
requirements-completed: [CR-01, WR-01, IN-01]
completed: 2026-11-03
---

# Phase 59 Plan 49: Picker in-place update and targeted close Summary

The launch-option picker countdown now updates the open dialog in place via a per-invocation `dialogId`, and closes can name the dialog they close, so a double close no longer drops a queued dialog.

## What changed

- `reduceDialogRequest`: an open request with the `dialogId` of the current or a queued dialog merges into it, keeping its `dialogKey` and never queueing. A close carrying `dialogKey` or `dialogId` closes only that dialog (promote if current, remove if queued, otherwise return state unchanged). Untargeted closes are unchanged.
- `DialogHandler`: default onClose closes by `dialogKey`; the `[dialog] closed` line is logged on both the default and custom-onClose branches; the effect line is now `[dialog] current` (state, not visibility).
- `library.ts`: picker gets `launch-option-picker:${appName}:${counter}` id on every countdown request; autoSelect and custom onClose close with that id; the option button and the Offline Warning OK / Play Anyway no longer close.
- `Humble/Keys`: Cancel is a no-op `onClick`, Open Humble no longer closes (line 300 untouched).

## TDD

RED commit c3027b70c, run against the unchanged library.ts: all four tests failed (CR-01 countdown title stayed `(10s)` because copies were queued; CR-01 pick and auto-select left a dialog shown; WR-01 queued dialog dropped). GREEN after the fix: all pass.

## Commits

- 2422da4e5 fix: reducer, types, DialogHandler, reducer tests (Task 1)
- c3027b70c test: failing picker regression (Task 2 RED)
- 0800783d7 fix: picker and caller changes (Task 2 GREEN)

## Verification

dialogQueue, launchOptionPicker, handleStopInstallation, buttonActions, ackWhenVisible suites pass; prettier, eslint (0 errors; one pre-existing `mountedRef` warning at Humble Keys line 241) and `pnpm codecheck` green.

## Deviations from Plan

None - plan executed as written. The plan's `$P` verify snippets were run as zsh arrays; same checks.

## Pre-existing, out of scope

The picker's custom `onClose` settles the promise with `done` before the clicked option's launch; left unchanged as instructed.

## Self-Check: PASSED
