import type { IpcRendererEvent } from 'backend/platform'
import { create } from 'zustand'
import type {
  SteamGoOfflineAction,
  SteamGoOfflinePayload
} from 'common/types/steam'

type SteamGoOfflineStatus = 'idle' | 'busy' | 'still-online' | 'ready'

interface SteamGoOfflineNoticeState {
  isOpen: boolean
  action?: SteamGoOfflineAction
  appName?: string
  status: SteamGoOfflineStatus
  open: (payload: SteamGoOfflinePayload) => void
  close: () => void
  setStatus: (status: SteamGoOfflineStatus) => void
}

// Phase 54 Plan 07: single global store driving the guided Go Offline dialog.
// Opened exclusively by the backend `steamGoOfflineRequired` push (user.ts
// acquireAuthenticated, Plan 03) when the go-offline wrap did not see Mac
// Steam log off; the one subscriber is GlobalState.tsx. The frontend never
// decides this itself, and nothing here logs on.
export const useSteamGoOfflineNotice = create<SteamGoOfflineNoticeState>()(
  (set) => ({
    isOpen: false,
    action: undefined,
    appName: undefined,
    status: 'idle',
    open: ({ action, appName }) =>
      set({ isOpen: true, action, appName, status: 'idle' }),
    close: () =>
      set({
        isOpen: false,
        action: undefined,
        appName: undefined,
        status: 'idle'
      }),
    setStatus: (status) => set({ status })
  })
)

// Standalone so tests can simulate the signal without mounting GlobalState
// (no jsdom). Mirrors handleSteamBridgeRouteNoticeSignal.
export const handleSteamGoOfflineRequiredSignal = (
  _e: IpcRendererEvent,
  payload: SteamGoOfflinePayload
): void => {
  useSteamGoOfflineNotice.getState().open(payload)
}
