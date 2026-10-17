import type { IpcRendererEvent } from 'backend/platform'
import type { SteamBottleLaunchWaitingCause } from 'common/types/steam'
import { create } from 'zustand'

interface BottleLaunchWaitingEntry {
  detectedCause: SteamBottleLaunchWaitingCause | null
}

interface BottleLaunchWaitingState {
  entries: Record<string, BottleLaunchWaitingEntry>
  set: (
    appName: string,
    detectedCause: SteamBottleLaunchWaitingCause | null
  ) => void
  clear: (appName: string) => void
}

// D-51-16 (folded todo 2026-10-16-steam-bottle-play-gives-no-feedback-while-
// steam-is-blocked.md): keyed by appName (the game's Steam appId) because a
// user can have more than one bottled-Steam launch outstanding, each with
// its own classification. Mirrors SteamBridgeSetup.ts's shape -- a standalone
// zustand store plus a directly-testable signal handler, rather than state
// owned by GlobalState.tsx's class component (no jsdom in this project's
// frontend jest config; see SteamBridgeSetup.test.ts's own docstring).
export const useBottleLaunchWaiting = create<BottleLaunchWaitingState>()(
  (set) => ({
    entries: {},
    set: (appName, detectedCause) =>
      set((state) => ({
        entries: { ...state.entries, [appName]: { detectedCause } }
      })),
    clear: (appName) =>
      set((state) => {
        if (!(appName in state.entries)) return state
        const nextEntries = { ...state.entries }
        delete nextEntries[appName]
        return { entries: nextEntries }
      })
  })
)

// Extracted as a standalone function (SteamBridgeSetup.ts precedent) so unit
// tests can simulate the backend's `steamBottleLaunchWaiting` push without
// mounting GlobalState.tsx.
export const handleSteamBottleLaunchWaitingSignal = (
  _e: IpcRendererEvent,
  {
    appName,
    detectedCause
  }: {
    appName: string
    detectedCause: SteamBottleLaunchWaitingCause | null
  }
): void => {
  useBottleLaunchWaiting.getState().set(appName, detectedCause)
}

// D-51-16: the fixed display order for the "Likely causes:" list -- NOT
// reordered to bubble `detected` to the front (GameStatus.tsx renders the
// detected cause as its own separate "Most likely:" line and filters it out
// of this list itself). Taking `detected` as a parameter at all is
// deliberate even though the return value does not vary with it yet: a
// single named function is the one place a future reordering rule would
// go, rather than every call site re-deriving the order ad hoc.
const CANONICAL_WAITING_CAUSE_ORDER: SteamBottleLaunchWaitingCause[] = [
  'self-update',
  'login',
  'other-session'
]

export function resolveWaitingCauseOrder(
  _detected: SteamBottleLaunchWaitingCause | null
): SteamBottleLaunchWaitingCause[] {
  return CANONICAL_WAITING_CAUSE_ORDER
}
