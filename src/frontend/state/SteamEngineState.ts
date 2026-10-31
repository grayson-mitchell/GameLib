import type { IpcRendererEvent } from 'backend/platform'
import { create } from 'zustand'
import type { SteamEngineState } from 'common/types/steam'

type EngineNotice = 'no-crossover' | 'untested'

interface SteamEngineStore {
  byAppId: Record<string, SteamEngineState>
  set: (state: SteamEngineState) => void
  hideNotice: (appId: string, notice: EngineNotice) => void
}

// Phase 59 Plan 11: per-title engine display state for the game page.
// Written ONLY from backend data -- the `steamEngineStateChanged` push and the
// page's `getSteamEngineState` fetch. The renderer never derives engine state.
export const useSteamEngineState = create<SteamEngineStore>()((set) => ({
  byAppId: {},
  set: (state) =>
    set((s) => ({ byAppId: { ...s.byAppId, [state.appId]: state } })),
  // Optimistic hide so a dismissed note disappears at once; the backend
  // persists the dismissal (dismissSteamEngineNotice).
  hideNotice: (appId, notice) =>
    set((s) => {
      const current = s.byAppId[appId]
      if (!current) return s
      const next =
        notice === 'no-crossover'
          ? { ...current, showNoCrossoverNote: false }
          : { ...current, untestedCrossoverBuild: null }
      return { byAppId: { ...s.byAppId, [appId]: next } }
    })
}))

// Standalone so tests can simulate the push without mounting GlobalState.
// T-59-49: payloads without a numeric appId are ignored.
export const handleSteamEngineStateChangedSignal = (
  _e: IpcRendererEvent,
  state: SteamEngineState
): void => {
  if (!state || typeof state.appId !== 'string') return
  if (!/^[0-9]{1,10}$/.test(state.appId)) return
  useSteamEngineState.getState().set(state)
}
