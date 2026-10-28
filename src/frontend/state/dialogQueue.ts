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
 */
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
  const request: DialogModalOptions = { showDialog, ...options }
  if (state.current.showDialog) {
    return { current: state.current, queue: [...state.queue, request] }
  }
  return { current: request, queue: state.queue }
}
