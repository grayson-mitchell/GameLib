import type {
  EngineNoticeDismissal,
  EngineOption,
  EngineState
} from '../engine'

// Phase 61 Plan 13 (D-12): one store-agnostic engine domain. A game is identified by
// runner + appName; Steam is dispatched to its adapter by the sidecar.
export interface EngineAsync {
  getEngineState: (args: {
    runner: string
    appName: string
  }) => Promise<EngineState | null>
  listEngineOptions: (
    args: { runner: string; appName: string } | { appName: 'default' }
  ) => Promise<EngineOption[]>
  // D-09: the global default engine
  getDefaultEngine: () => Promise<{
    effectiveEngineId: string
    engineSource: 'stored' | 'derived'
    legacyLabel: string | null
  }>
  // D-17: the per-game bottle name for the install dialogs
  getPerGameBottleName: (args: {
    runner: string
    appName: string
  }) => Promise<string | null>
  dismissEngineNotice: (args: EngineNoticeDismissal) => Promise<{ ok: boolean }>
}

export interface EngineFrontendMessages {
  // The per-title engine display state changed
  engineStateChanged: (payload: EngineState) => void
}
