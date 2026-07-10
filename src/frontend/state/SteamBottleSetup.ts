import type { IpcRendererEvent } from 'electron'
import { create } from 'zustand'

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
