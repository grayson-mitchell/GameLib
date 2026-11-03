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
 */
let nextDialogKey = 0

export function reduceDialogRequest(
  state: DialogQueueState,
  { showDialog = true, ...options }: DialogModalOptions
): DialogQueueState {
  if (!showDialog) {
    const [next, ...rest] = state.queue
    return next
      ? { current: next, queue: rest }
      : { current: { showDialog: false }, queue: [] }
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
