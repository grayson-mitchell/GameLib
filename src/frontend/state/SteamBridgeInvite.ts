import type { IpcRendererEvent } from 'backend/platform'
import { create } from 'zustand'
import type { BridgeFriend, BridgeInviteResult } from 'common/types/steam'

type SteamBridgeInviteLoad = 'idle' | 'loading' | 'ready' | 'unavailable'
export type SteamBridgeInviteRow = 'pending' | BridgeInviteResult

interface SteamBridgeInviteState {
  isOpen: boolean
  appId?: string
  ackId?: string
  title?: string
  load: SteamBridgeInviteLoad
  friends: BridgeFriend[]
  rows: Record<number, SteamBridgeInviteRow>
  open: (payload: { appId: string; ackId?: string }) => void
  close: () => void
  invite: (ordinal: number) => Promise<void>
}

const CLOSED = {
  isOpen: false,
  appId: undefined,
  ackId: undefined,
  title: undefined,
  load: 'idle' as SteamBridgeInviteLoad,
  friends: [] as BridgeFriend[],
  rows: {} as Record<number, SteamBridgeInviteRow>
}

// Online first, then "playing this game" first within online, then by name.
export const sortFriends = (friends: BridgeFriend[]): BridgeFriend[] =>
  [...friends].sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1
    if (a.playingThisApp !== b.playingThisApp) return a.playingThisApp ? -1 : 1
    return a.name.localeCompare(b.name)
  })

// Phase 58 Plan 32 (M-01): the friend picker store. Opened exclusively by the
// backend `steamBridgeInviteRequest` push (the game's own invite control);
// the one subscriber is GlobalState.tsx. Friend names are state for rendering
// only: nothing in this file logs them.
// 58-36: the push's ackId is kept so the dialog can echo it back once it is on
// screen (dialogDisplayed); the backend then logs display=confirmed or unconfirmed.
export const useSteamBridgeInvite = create<SteamBridgeInviteState>()(
  (set, get) => ({
    ...CLOSED,
    open: ({ appId, ackId }) => {
      set({ ...CLOSED, isOpen: true, appId, ackId, load: 'loading' })
      const stillCurrent = () => get().isOpen && get().appId === appId

      window.api
        .getGameInfo(appId, 'steam')
        .then((info) => {
          if (stillCurrent() && info?.title) set({ title: info.title })
        })
        .catch(() => undefined)

      window.api
        .steamBridgeListFriends(appId)
        .then((res) => {
          if (!stillCurrent()) return
          if (res.ok) set({ load: 'ready', friends: sortFriends(res.friends) })
          else set({ load: 'unavailable' })
        })
        .catch(() => {
          if (stillCurrent()) set({ load: 'unavailable' })
        })
    },
    close: () => set({ ...CLOSED }),
    invite: async (ordinal) => {
      const appId = get().appId
      if (!appId) return
      set({ rows: { ...get().rows, [ordinal]: 'pending' } })
      let result: BridgeInviteResult
      try {
        result = await window.api.steamBridgeInviteFriend(appId, ordinal)
      } catch {
        result = 'error'
      }
      if (get().appId !== appId) return
      set({ rows: { ...get().rows, [ordinal]: result } })
    }
  })
)

// Standalone so tests can simulate the push without mounting GlobalState.
export const handleSteamBridgeInviteRequestSignal = (
  _e: IpcRendererEvent,
  payload: { appId: string; ackId?: string }
): void => {
  useSteamBridgeInvite.getState().open(payload)
}
