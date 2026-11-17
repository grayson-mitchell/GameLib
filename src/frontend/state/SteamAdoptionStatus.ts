import type { IpcRendererEvent } from 'common/types/hostTypes'
import { create } from 'zustand'
import type { SteamAdoptionStatusPayload } from 'common/types/steam'

interface SteamAdoptionStatusStore {
  /** The newest accepted push per appName. */
  byApp: Record<string, SteamAdoptionStatusPayload>
  set: (payload: SteamAdoptionStatusPayload) => void
}

// Phase 81 (D-07, D-03): the live adoption status of each Steam game. Written ONLY from the
// backend `steamAdoptionStatusChanged` push; the frontend never derives adoption. Consumed by
// AdoptionNote, which merges it with its own query answer (newer seq wins).
export const useSteamAdoptionStatus = create<SteamAdoptionStatusStore>()(
  (set) => ({
    byApp: {},
    set: (payload) =>
      set((state) => ({
        byApp: { ...state.byApp, [payload.appName]: payload }
      }))
  })
)

// Standalone so tests can simulate the push without mounting GlobalState.
// T-81-30: a malformed payload is dropped, and a seq that is not newer than the stored one for
// that app never replaces it.
export const handleSteamAdoptionStatusChangedSignal = (
  _e: IpcRendererEvent,
  payload: SteamAdoptionStatusPayload
): void => {
  if (!payload || typeof payload !== 'object') return
  if (typeof payload.appName !== 'string') return
  if (!/^[0-9]{1,10}$/.test(payload.appName)) return
  if (typeof payload.pending !== 'boolean') return
  if (
    payload.steamSignedIn !== null &&
    typeof payload.steamSignedIn !== 'boolean'
  ) {
    return
  }
  if (typeof payload.seq !== 'number' || !Number.isFinite(payload.seq)) return
  const current = useSteamAdoptionStatus.getState().byApp[payload.appName]
  if (current && payload.seq <= current.seq) return
  useSteamAdoptionStatus.getState().set(payload)
}
