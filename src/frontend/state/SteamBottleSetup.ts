import type { IpcRendererEvent } from 'backend/platform'
import { create } from 'zustand'
import { Runner } from 'common/types'

interface SteamBottleSetupState {
  isOpen: boolean
  appName?: string
  open: (appName: string) => void
  close: () => void
}

// Phase 17 (17-06), D-07: single global store driving the guided
// bottle-setup surface. Opened EXCLUSIVELY in response to the backend
// `steamBottleSetupRequired` push (see `handleSteamBottleSetupRequiredSignal`
// below, wired up once in GlobalState.tsx) — never by a frontend eligibility
// check on raw `gameInfo.is_mac_native`. D-11-safe eligibility (platformsCaptured
// -aware) lives entirely in the backend's `isBottleEligible`; the frontend
// only reflects that decision.
export const useSteamBottleSetup = create<SteamBottleSetupState>()((set) => ({
  isOpen: false,
  appName: undefined,
  open: (appName: string) => set({ isOpen: true, appName }),
  close: () => set({ isOpen: false })
}))

// Extracted as a standalone, directly-testable function (rather than an
// inline arrow registered in GlobalState.tsx) so unit tests can simulate the
// backend signal firing without mounting the GlobalState class component —
// this project's frontend jest config has no jsdom (see jest.config.js
// docstring), so class-component instantiation/mounting isn't feasible here.
export const handleSteamBottleSetupRequiredSignal = (
  _e: IpcRendererEvent,
  { appName }: { appName: string }
): void => {
  useSteamBottleSetup.getState().open(appName)
}

// Phase 17 (17-11), GAP 3 gap-closure: the single source-of-truth predicate
// for "is a guided bottle-setup surface active for THIS game right now" —
// consumed by both the toast (SteamBottleSetup.tsx, via isOpen directly) and
// the game page (MainButton/GameStatus, via GameContext's is.settingUpBottle).
// Keeping this as one exported pure function (rather than re-deriving the
// condition separately on each consumer) is what prevents the button/status/
// toast desync this plan closes.
export const isSteamBottleSetupActiveFor = (
  state: { isOpen: boolean; appName?: string },
  appName: string,
  runner: Runner
): boolean => {
  return state.isOpen && state.appName === appName && runner === 'steam'
}
