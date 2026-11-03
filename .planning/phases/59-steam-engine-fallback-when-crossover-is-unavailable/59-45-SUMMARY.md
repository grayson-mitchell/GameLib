---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 45
subsystem: frontend-dialogs
tags: [dialog-queue, react, gap-closure, G28]
requires: []
provides:
  - "Per-request dialogKey; DialogHandler remounts MessageBoxModal per dialog"
  - "Renderer [dialog] shown/closed log lines"
affects: [src/frontend/state/dialogQueue.ts, src/frontend/components/UI/DialogHandler/index.tsx]
key-files:
  modified:
    - src/frontend/types.ts
    - src/frontend/state/dialogQueue.ts
    - src/frontend/state/__tests__/dialogQueue.test.ts
    - src/frontend/components/UI/DialogHandler/index.tsx
requirements-completed: [G28]
completed: 2026-11-03
---

# Phase 59 Plan 45: G28 queued dialog never visible Summary

A dialog promoted from the queue now mounts fresh via a per-request `dialogKey`, so its `Dialog` no longer inherits the closed predecessor's `open=false`.

## G28 diagnosis

Evidence (`~/Library/Logs/GameLib/gamelib.log.old`, lines 150-184):

| Time | Notice | Frame received | Result |
| ---- | ------ | -------------- | ------ |
| 19:31:45 | engine-restore-failed, dispatched, display=pending (l.150) | `replacesOpenDialog=false` (l.152) | `display=confirmed elapsedMs=303` (l.156) |
| 19:31:48 | engine-restore-failed dispatched (l.161) | `replacesOpenDialog=true visibility=visible hasFocus=true` (l.163) | `display=unconfirmed timeout=15000` at 19:32:03 (l.166) |
| 19:32:09 | engine-download-failed dispatched (l.173) | `replacesOpenDialog=true` (l.175) | `display=unconfirmed` 19:32:24 (l.182) |
| 19:32:10 | engine-download-failed dispatched (l.179) | `replacesOpenDialog=true` (l.181) | `display=unconfirmed` 19:32:25 (l.184) |

Ruled out: frame not sent (dialog-frame-sent=true each time); frame not received (a `[dialog] showDialog frame received` line follows each); document hidden (visibility=visible, hasFocus=true). Ruled in: queued behind an open dialog (replacesOpenDialog=true on all three), and the queued dialog never became visible. The 19:31:48 case is explained by the first dialog still being open. At 19:32:09-10 the operator had closed it (Play was clickable), yet the state still believed one was open.

Code trace of promotion:
- `DialogHandler/index.tsx:128` renders `MessageBoxModal` while `dialogModalOptions.showDialog` is true.
- `Dialog.tsx:70` holds `useState(true)`; `Dialog.tsx:84-87` `close()` calls `setOpen(false)` then `onClose()`.
- `onClose` dispatches `{showDialog:false}`; `dialogQueue.ts` `reduceDialogRequest` promotes `queue[0]` with `showDialog: true`.
- The render condition therefore stays true and no `key` is set, so React reuses the same `MessageBoxModal`/`Dialog` instance. It is NOT re-mounted, `open` stays false, and the MUI dialog stays closed while state believes a dialog is open. Every later request queues behind this invisible one, and the ack (sent only when a queued dialog is current and rendered) never fires well, so the notice is `unconfirmed`. This contradicts the Phase 40 comment (`Dialog.tsx:73-79`) that `Dialog` unmounts on close, which holds only when no queued dialog is promoted.

Cause: `DialogHandler/index.tsx:129` renders `MessageBoxModal` with no per-dialog key (reproduced by three `G28:` tests that failed before the fix).

## Deviations from Plan

None - plan executed as written.

## Commits

- fb11c53b8 test(59-45): failing G28 tests (RED)
- ea0726772 fix(59-45): dialogKey + keyed remount + shown/closed logs (GREEN)

Live confirmation (a second engine notice shown after the first is closed) still needs an operator session; the new `[dialog] shown/closed` log lines will prove it.

## Self-Check: PASSED
