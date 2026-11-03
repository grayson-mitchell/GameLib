import type { DialogModalOptions } from 'frontend/types'

export interface DialogQueueState {
  current: DialogModalOptions
  queue: DialogModalOptions[]
}

/**
 * The renderer shows one dialog at a time. A request made while one is open
 * used to overwrite it, which silently dropped the earlier dialog (the
 * bridge-notice display=unconfirmed candidate cause). A request with
 * `showDialog: false` closes the current dialog and promotes the next queued
 * one; any other request opens at once when nothing is open, else queues.
 *
 * G28: every accepted request is stamped with a distinct `dialogKey`. A
 * promoted dialog used to reuse the closed one's mounted `Dialog`, whose
 * `open` state was already false, so it never became visible and every later
 * request queued behind an invisible dialog. DialogHandler keys the modal by it.
 *
 * CR-01: the launch-option picker re-sends itself every second for its
 * countdown. Each copy was queued, and once G28 remounted promoted dialogs
 * those copies became live duplicate pickers. A request with the `dialogId`
 * of an open or queued dialog now updates it in place, keeping its
 * `dialogKey`, and is never queued.
 *
 * WR-01: a button's onClose and its own onClick both closed, so the second
 * close dropped the dialog the first had promoted. A close may now name the
 * dialog it closes (`dialogKey` or `dialogId`); a close for a dialog that is
 * not current only removes it from the queue, or is a no-op. An untargeted
 * close behaves as before.
 */
let nextDialogKey = 0

export function reduceDialogRequest(
  state: DialogQueueState,
  { showDialog = true, ...options }: DialogModalOptions
): DialogQueueState {
  if (!showDialog) {
    const { dialogKey, dialogId } = options
    if (dialogKey !== undefined || dialogId !== undefined) {
      const matches = (d: DialogModalOptions) =>
        (dialogKey !== undefined && d.dialogKey === dialogKey) ||
        (dialogId !== undefined && d.dialogId === dialogId)
      if (!(state.current.showDialog && matches(state.current))) {
        if (!state.queue.some(matches)) return state
        return { ...state, queue: state.queue.filter((d) => !matches(d)) }
      }
    }
    const [next, ...rest] = state.queue
    return next
      ? { current: next, queue: rest }
      : { current: { showDialog: false }, queue: [] }
  }
  const { dialogId } = options
  if (dialogId !== undefined) {
    if (state.current.showDialog && state.current.dialogId === dialogId) {
      return {
        current: {
          ...state.current,
          ...options,
          showDialog: true,
          dialogKey: state.current.dialogKey
        },
        queue: state.queue
      }
    }
    const idx = state.queue.findIndex((d) => d.dialogId === dialogId)
    if (idx >= 0) {
      const queue = [...state.queue]
      queue[idx] = {
        ...queue[idx],
        ...options,
        showDialog: true,
        dialogKey: queue[idx].dialogKey
      }
      return { current: state.current, queue }
    }
  }
  const request: DialogModalOptions = {
    showDialog,
    ...options,
    dialogKey: ++nextDialogKey
  }
  if (state.current.showDialog) {
    return { current: state.current, queue: [...state.queue, request] }
  }
  return { current: request, queue: state.queue }
}
