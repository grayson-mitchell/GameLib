import type { IpcRendererEvent } from 'backend/platform'
import { create } from 'zustand'
import type { EngineState } from 'common/types/engine'

type EngineNotice = 'no-crossover' | 'untested'

interface EngineStore {
  byGame: Record<string, EngineState>
  set: (state: EngineState) => void
  remove: (key: string) => void
  hideNotice: (key: string, notice: EngineNotice) => void
}

// Keyed by runner + appName so a GOG game and a Steam title sharing a numeric
// id never share state (Phase 61 D-12).
export const engineStateKey = (runner: string, appName: string): string =>
  `${runner}:${appName}`

// Phase 59 Plan 11 / Phase 61 Plan 17: per-game engine display state for the
// game page, for every store. Written ONLY from backend data -- the
// `engineStateChanged` push and the page's `getEngineState` fetch. The
// renderer never derives engine state.
export const useEngineState = create<EngineStore>()((set) => ({
  byGame: {},
  set: (state) =>
    set((s) => ({
      byGame: {
        ...s.byGame,
        [engineStateKey(state.runner, state.appName)]: state
      }
    })),
  remove: (key) =>
    set((s) => {
      if (!(key in s.byGame)) return s
      const { [key]: _dropped, ...rest } = s.byGame
      return { byGame: rest }
    }),
  // Optimistic hide so a dismissed note disappears at once; the backend
  // persists the dismissal (dismissEngineNotice).
  hideNotice: (key, notice) =>
    set((s) => {
      const current = s.byGame[key]
      if (!current) return s
      const next =
        notice === 'no-crossover'
          ? { ...current, showNoCrossoverNote: false }
          : { ...current, untestedCrossoverBuild: null }
      return { byGame: { ...s.byGame, [key]: next } }
    })
}))

// Standalone so tests can simulate the push without mounting GlobalState.
// T-61-52: payloads are untrusted shape; reject before storing.
export const handleEngineStateChangedSignal = (
  _e: IpcRendererEvent,
  state: EngineState
): void => {
  if (!state || typeof state !== 'object') return
  if (typeof state.runner !== 'string' || state.runner.length === 0) return
  const name = state.appName
  if (typeof name !== 'string' || name.length < 1 || name.length > 255) return
  if (/[/\\\0]/.test(name) || name.includes('..')) return
  useEngineState.getState().set(state)
}
