import type { IpcRendererEvent } from 'common/types/hostTypes'
import { create } from 'zustand'

// Not exported: used only within this module (ts-prune / `pnpm find-deadcode`
// flagged the previously-exported form as a used-in-module finding -- there
// is no external consumer, so the export served no purpose).
type SteamClientSetupReason = 'install' | 'launch-once'

interface SteamClientSetupState {
  isOpen: boolean
  appName?: string
  reason?: SteamClientSetupReason
  open: (appName: string, reason: SteamClientSetupReason) => void
  close: () => void
}

// Phase 21 (21-10), D-10/D-11: single global store driving the native
// Steam-CLIENT guided-install/prompt-to-launch surface — distinct from
// SteamBottleSetup.ts (the macOS CrossOver BOTTLE flow). Opened by the
// backend `steamClientSetupRequired` push (see
// `handleSteamClientSetupRequiredSignal` below, wired up once in
// the old GlobalState class) OR by Console Mode's hand-off
// (`handOffSteamClientSetupToDesktop`, consoleSteamTarget.ts), which reopens
// it with the appName and reason the backend's own recheck just reported.
// The decision stays backend-owned and is never made by a frontend
// eligibility check. D-10/D-11's backend-owned decision (Steam absent vs.
// installed-but-never-launched) arrives via the `reason` field; the frontend
// only reflects it. Under `/console` nothing renders this store, so the
// overlay closes a push-opened session it did not hand off
// (`releaseUnclaimedSteamClientSetup`).
export const useSteamClientSetup = create<SteamClientSetupState>()((set) => ({
  isOpen: false,
  appName: undefined,
  reason: undefined,
  open: (appName: string, reason: SteamClientSetupReason) =>
    set({ isOpen: true, appName, reason }),
  close: () => set({ isOpen: false })
}))

// Extracted as a standalone, directly-testable function (rather than an
// inline arrow registered in the old GlobalState class) so unit tests can simulate the
// backend signal firing without mounting the GlobalState class component —
// mirrors SteamBottleSetup.ts's handleSteamBottleSetupRequiredSignal.
export const handleSteamClientSetupRequiredSignal = (
  _e: IpcRendererEvent,
  { appName, reason }: { appName: string; reason: SteamClientSetupReason }
): void => {
  useSteamClientSetup.getState().open(appName, reason)
}
