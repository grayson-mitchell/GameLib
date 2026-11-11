import type { IpcRendererEvent } from 'common/types/hostTypes'
import { create } from 'zustand'
import type { SteamRequestNoticePayload } from 'common/types/steam'

interface SteamRequestNoticeStore {
  latest: SteamRequestNoticePayload | null
  set: (payload: SteamRequestNoticePayload) => void
}

// quick 261106-pvk: the newest "Steam never started your request" notice.
// Written ONLY from the backend `steamRequestNotice` push; the frontend never
// derives it. Consumed by SteamEngineLaunchNotice's request slot.
export const useSteamRequestNotice = create<SteamRequestNoticeStore>()(
  (set) => ({
    latest: null,
    set: (payload) => set({ latest: payload })
  })
)

// Closed set (T-pvk-01): the renderer maps each kind to a catalogue string.
const REQUEST_KINDS: ReadonlySet<string> = new Set([
  'install-not-started',
  'uninstall-not-started',
  'uninstall-refused-running',
  'uninstall-steam-error',
  'uninstall-check-failed',
  'uninstall-failed'
])

// Standalone so tests can simulate the push without mounting GlobalState.
// T-pvk-01: malformed payloads are dropped; an older/equal seq never replaces
// a newer one.
export const handleSteamRequestNoticeSignal = (
  _e: IpcRendererEvent,
  payload: SteamRequestNoticePayload
): void => {
  if (!payload || typeof payload !== 'object') return
  if (typeof payload.appId !== 'string') return
  if (!/^[0-9]{1,10}$/.test(payload.appId)) return
  if (!REQUEST_KINDS.has(payload.kind)) return
  // quick 261107-td5: the steam-error notice interpolates the code.
  if (payload.kind === 'uninstall-steam-error') {
    if (!Number.isInteger(payload.code)) return
  }
  if (typeof payload.seq !== 'number' || !Number.isFinite(payload.seq)) return
  if (typeof payload.title !== 'string') return
  const current = useSteamRequestNotice.getState().latest
  if (current && payload.seq <= current.seq) return
  useSteamRequestNotice.getState().set(payload)
}
