import type { IpcRendererEvent } from 'common/types/hostTypes'
import type { Runner } from 'common/types'
import { create } from 'zustand'
import {
  REMOVAL_REFUSAL_KINDS,
  REMOVAL_REFUSAL_OUTCOMES
} from 'common/types/removalRefusal'
import type { RemovalRefusalPayload } from 'common/types/removalRefusal'
import { REMOVAL_REASONS } from 'common/types/safety'

export type QueuedRemovalNotice = RemovalRefusalPayload & { id: number }

interface RemovalRefusedNoticeStore {
  notices: QueuedRemovalNotice[]
  nextId: number
  push: (payload: RemovalRefusalPayload) => void
  dismiss: (id: number) => void
}

// Several refusals can land close together (a multi-item removal, or the user retrying). Past this
// many the oldest is dropped: the newest refusals are the ones still actionable.
const MAX_QUEUED = 5

// Phase 82 (D-13): the queue of removal refusals, written ONLY from the backend
// `removalRefusedNotice` push. Unlike the read-only stores notice there is no "once per launch":
// every refusal is a fresh answer to something the user just clicked.
export const useRemovalRefusedNotice = create<RemovalRefusedNoticeStore>()(
  (set) => ({
    notices: [],
    nextId: 1,
    push: (payload) =>
      set((s) => ({
        notices: [...s.notices, { ...payload, id: s.nextId }].slice(
          -MAX_QUEUED
        ),
        nextId: s.nextId + 1
      })),
    dismiss: (id) =>
      set((s) => ({ notices: s.notices.filter((n) => n.id !== id) }))
  })
)

const KINDS: ReadonlySet<string> = new Set(REMOVAL_REFUSAL_KINDS)
const OUTCOMES: ReadonlySet<string> = new Set(REMOVAL_REFUSAL_OUTCOMES)
// `ok` is a pass, never a refusal: a payload carrying it is malformed and is dropped.
const REASONS: ReadonlySet<string> = new Set(
  REMOVAL_REASONS.filter((r) => r !== 'ok')
)
// Typed over Runner so a new runner fails tsc here instead of being silently dropped.
const RUNNER_RECORD: Record<Runner, true> = {
  legendary: true,
  gog: true,
  sideload: true,
  nile: true,
  steam: true
}
const RUNNER_IDS: ReadonlySet<string> = new Set(Object.keys(RUNNER_RECORD))

const optionalString = (v: unknown): v is string | undefined =>
  v === undefined || typeof v === 'string'

// Standalone so tests can simulate the push without mounting GlobalState.
// T-68-25 precedent: closed-set ids only; anything else is dropped, never coerced.
export const handleRemovalRefusedNoticeSignal = (
  _e: IpcRendererEvent,
  payload: unknown
): void => {
  if (!payload || typeof payload !== 'object') return
  const { kind, outcome, reason, title, appName, runner, otherTitle } =
    payload as Record<string, unknown>
  if (typeof kind !== 'string' || !KINDS.has(kind)) return
  if (typeof outcome !== 'string' || !OUTCOMES.has(outcome)) return
  if (typeof reason !== 'string' || !REASONS.has(reason)) return
  if (!optionalString(title) || !optionalString(appName)) return
  if (!optionalString(otherTitle)) return
  if (
    runner !== undefined &&
    (typeof runner !== 'string' || !RUNNER_IDS.has(runner))
  )
    return
  useRemovalRefusedNotice.getState().push({
    kind: kind as RemovalRefusalPayload['kind'],
    outcome: outcome as RemovalRefusalPayload['outcome'],
    reason: reason as RemovalRefusalPayload['reason'],
    ...(title !== undefined ? { title } : {}),
    ...(appName !== undefined ? { appName } : {}),
    ...(runner !== undefined ? { runner: runner as Runner } : {}),
    ...(otherTitle !== undefined ? { otherTitle } : {})
  })
}
