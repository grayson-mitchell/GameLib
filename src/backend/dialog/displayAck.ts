import { randomUUID } from 'crypto'

/**
 * Correlates an in-app dialog frame with the renderer's "it is on screen" ack.
 *
 * The backend can only know a frame was handed to the transport. The renderer
 * sends `dialogDisplayed(ackId)` once DialogHandler has rendered the dialog
 * with the document visible; this module turns that ack, or its absence after
 * a bounded time, into a settled result.
 *
 * Sidecar exit contract: the timer is unref()'d and bounded, so it can never
 * keep the process alive, and there is no work in flight at boot (a timer only
 * exists between a dispatch and its ack/timeout).
 */

const DIALOG_ACK_TIMEOUT_MS = 15_000

type DialogDisplayResult =
  | { confirmed: true; elapsedMs: number }
  | { confirmed: false; timeoutMs: number }

interface Pending {
  timer: ReturnType<typeof setTimeout>
  startedAt: number
  settle: (result: DialogDisplayResult) => void
}

export interface DisplayAcks {
  newId(): string
  track(
    ackId: string,
    settle: (result: DialogDisplayResult) => void,
    timeoutMs?: number
  ): void
  /** Returns whether the id was being tracked. A repeated or unknown ack is ignored. */
  acknowledge(ackId: unknown): boolean
  pendingCount(): number
}

/**
 * The pending-ack table of one boot's dialogs (66.4-18, D-05). An ack resolves only the entry
 * its own instance tracked, so two boots (or two tests) never settle each other's dialogs. It
 * hangs off the `dialogs` host service, which every in-app dialog path already holds.
 */
export function createDisplayAcks(): DisplayAcks {
  const pending = new Map<string, Pending>()
  return {
    newId: () => randomUUID(),
    track(ackId, settle, timeoutMs = DIALOG_ACK_TIMEOUT_MS) {
      const timer = setTimeout(() => {
        if (pending.delete(ackId)) settle({ confirmed: false, timeoutMs })
      }, timeoutMs)
      timer.unref()
      pending.set(ackId, { timer, startedAt: Date.now(), settle })
    },
    acknowledge(ackId) {
      if (typeof ackId !== 'string') return false
      const entry = pending.get(ackId)
      if (!entry) return false
      pending.delete(ackId)
      clearTimeout(entry.timer)
      entry.settle({ confirmed: true, elapsedMs: Date.now() - entry.startedAt })
      return true
    },
    pendingCount: () => pending.size
  }
}
