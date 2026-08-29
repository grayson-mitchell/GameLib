import type { IpcRendererEvent } from 'backend/platform'
import { create } from 'zustand'

export type SteamClientSetupReason = 'install' | 'launch-once'

interface SteamClientSetupState {
  isOpen: boolean
  appName?: string
  reason?: SteamClientSetupReason
  open: (appName: string, reason: SteamClientSetupReason) => void
  close: () => void
}

// Phase 21 (21-10), D-10/D-11: single global store driving the native
// Steam-CLIENT guided-install/prompt-to-launch surface — distinct from
// SteamBottleSetup.ts (the macOS CrossOver BOTTLE flow). Opened EXCLUSIVELY
// in response to the backend `steamClientSetupRequired` push (see
// `handleSteamClientSetupRequiredSignal` below, wired up once in
// GlobalState.tsx) — never by a frontend eligibility check. D-10/D-11's
// backend-owned decision (Steam absent vs. installed-but-never-launched)
// arrives via the `reason` field; the frontend only reflects it.
export const useSteamClientSetup = create<SteamClientSetupState>()((set) => ({
  isOpen: false,
  appName: undefined,
  reason: undefined,
  open: (appName: string, reason: SteamClientSetupReason) =>
    set({ isOpen: true, appName, reason }),
  close: () => set({ isOpen: false })
}))

// Extracted as a standalone, directly-testable function (rather than an
// inline arrow registered in GlobalState.tsx) so unit tests can simulate the
// backend signal firing without mounting the GlobalState class component —
// mirrors SteamBottleSetup.ts's handleSteamBottleSetupRequiredSignal.
export const handleSteamClientSetupRequiredSignal = (
  _e: IpcRendererEvent,
  { appName, reason }: { appName: string; reason: SteamClientSetupReason }
): void => {
  useSteamClientSetup.getState().open(appName, reason)
}
