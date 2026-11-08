import type { IpcRendererEvent } from 'backend/platform'
import { create } from 'zustand'
import { READ_ONLY_AREAS, READ_ONLY_REASONS } from 'common/types/readOnlyStores'
import type { ReadOnlyStoresNoticePayload } from 'common/types/readOnlyStores'

type Entries = ReadOnlyStoresNoticePayload['entries']

interface ReadOnlyStoresNoticeStore {
  entries: Entries
  visible: boolean
  dismissed: boolean
  set: (entries: Entries) => void
  dismiss: () => void
}

// Phase 68 (D-05/D-15): the read-only stores list, written ONLY from the
// backend `readOnlyStoresNotice` push. Shown at most once per launch: after
// `dismiss()` a later push updates `entries` but never re-shows the notice.
export const useReadOnlyStoresNotice = create<ReadOnlyStoresNoticeStore>()(
  (set) => ({
    entries: [],
    visible: false,
    dismissed: false,
    set: (entries) =>
      set((s) => ({ entries, visible: !s.dismissed && entries.length > 0 })),
    dismiss: () => set({ visible: false, dismissed: true })
  })
)

const AREAS: ReadonlySet<string> = new Set(READ_ONLY_AREAS)
const REASONS: ReadonlySet<string> = new Set(READ_ONLY_REASONS)

// Standalone so tests can simulate the push without mounting GlobalState.
// T-68-25: closed-set ids only; anything else is dropped.
export const handleReadOnlyStoresNoticeSignal = (
  _e: IpcRendererEvent,
  payload: unknown
): void => {
  if (!payload || typeof payload !== 'object') return
  const raw = (payload as { entries?: unknown }).entries
  if (!Array.isArray(raw)) return
  const seen = new Set<string>()
  const entries: Entries = []
  for (const item of raw as unknown[]) {
    if (!item || typeof item !== 'object') continue
    const { area, reason } = item as { area?: unknown; reason?: unknown }
    if (typeof area !== 'string' || typeof reason !== 'string') continue
    if (!AREAS.has(area) || !REASONS.has(reason)) continue
    const key = `${area}:${reason}`
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({
      area: area as Entries[number]['area'],
      reason: reason as Entries[number]['reason']
    })
  }
  useReadOnlyStoresNotice.getState().set(entries)
}
