import type { IpcRendererEvent } from 'backend/platform'
import { create } from 'zustand'

interface SteamBridgeSetupState {
  isOpen: boolean
  appName?: string
  reason?: string
  fallbackAvailable: boolean
  // D-51-09 (Task 3): which Steam API symbol(s) the bridge's scan verdict
  // found missing, surfaced verbatim to the user by SteamBridgeSetup.tsx.
  // Always an array -- [] (never undefined) when the opening signal carries
  // none, so the component's `.length > 0` check needs no extra guard.
  missingSymbols: string[]
  open: (
    appName: string,
    opts?: {
      reason?: string
      fallbackAvailable?: boolean
      missingSymbols?: string[]
    }
  ) => void
  close: () => void
}

// Phase 24 (24-09), R7/D-05: single global store driving the EXPLICIT
// bridge-failure dialog. Opened EXCLUSIVELY in response to the backend
// `steamBridgeSetupRequired` push (see `handleSteamBridgeSetupRequiredSignal`
// below, wired up once in GlobalState.tsx) — never by a frontend eligibility
// check. Mirrors SteamBottleSetup.ts's shape exactly (D-07 precedent), a
// third guided-setup surface rather than a new invocation shape.
//
// `fallbackAvailable` defaults to `true` when the backend signal omits it —
// D-05 requires the dialog to always offer a way out (fall back or cancel),
// never a silent dead-end, so "unknown" must resolve to "offer the
// fallback", not to hiding it.
export const useSteamBridgeSetup = create<SteamBridgeSetupState>()((set) => ({
  isOpen: false,
  appName: undefined,
  reason: undefined,
  fallbackAvailable: true,
  missingSymbols: [],
  open: (appName, opts = {}) =>
    set({
      isOpen: true,
      appName,
      reason: opts.reason,
      fallbackAvailable: opts.fallbackAvailable ?? true,
      missingSymbols: opts.missingSymbols ?? []
    }),
  close: () => set({ isOpen: false, appName: undefined, missingSymbols: [] })
}))

// Extracted as a standalone, directly-testable function (rather than an
// inline arrow registered in GlobalState.tsx) so unit tests can simulate the
// backend signal firing without mounting the GlobalState class component —
// this project's frontend jest config has no jsdom (see jest.config.js
// docstring), so class-component instantiation/mounting isn't feasible here.
// Mirrors SteamBottleSetup.ts's handleSteamBottleSetupRequiredSignal.
export const handleSteamBridgeSetupRequiredSignal = (
  _e: IpcRendererEvent,
  {
    appName,
    reason,
    fallbackAvailable,
    missingSymbols
  }: {
    appName: string
    reason?: string
    fallbackAvailable?: boolean
    missingSymbols?: string[]
  }
): void => {
  useSteamBridgeSetup
    .getState()
    .open(appName, { reason, fallbackAvailable, missingSymbols })
}
