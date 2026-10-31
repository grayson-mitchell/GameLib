/**
 * Store tests for the Phase 58 Plan 32 friend picker. No jsdom: the store and
 * the push handler are exercised directly with a stubbed window.api.
 */
import type { BridgeFriend } from 'common/types/steam'
import type { IpcRendererEvent } from 'backend/platform'
import {
  useSteamBridgeInvite,
  sortFriends,
  handleSteamBridgeInviteRequestSignal
} from '../SteamBridgeInvite'

const api = {
  getGameInfo: jest.fn(),
  steamBridgeListFriends: jest.fn(),
  steamBridgeInviteFriend: jest.fn()
}
const flush = () => new Promise((r) => setImmediate(r))

const f = (
  ordinal: number,
  name: string,
  online: boolean,
  playingThisApp: boolean
): BridgeFriend => ({ ordinal, name, online, playingThisApp })

beforeEach(() => {
  ;(globalThis as unknown as { window: unknown }).window = { api }
  api.getGameInfo.mockResolvedValue({ title: 'Schedule I: Free Sample' })
  api.steamBridgeListFriends.mockResolvedValue({ ok: true, friends: [] })
  api.steamBridgeInviteFriend.mockResolvedValue('sent')
})
afterEach(() => useSteamBridgeInvite.getState().close())

describe('sortFriends', () => {
  it('online first, then playing-this-game first, then by name', () => {
    const sorted = sortFriends([
      f(1, 'Zed', false, false),
      f(2, 'Bob', true, false),
      f(3, 'Cy', true, true),
      f(4, 'Amy', true, false)
    ])
    expect(sorted.map((x) => x.ordinal)).toEqual([3, 4, 2, 1])
  })
})

describe('useSteamBridgeInvite', () => {
  it('open() lists friends once, sorted, and resolves the title', async () => {
    api.steamBridgeListFriends.mockResolvedValue({
      ok: true,
      friends: [f(1, 'Off', false, false), f(2, 'On', true, false)]
    })
    handleSteamBridgeInviteRequestSignal({} as IpcRendererEvent, {
      appId: '3205720'
    })
    expect(useSteamBridgeInvite.getState().isOpen).toBe(true)
    expect(useSteamBridgeInvite.getState().load).toBe('loading')
    await flush()
    const s = useSteamBridgeInvite.getState()
    expect(api.steamBridgeListFriends).toHaveBeenCalledTimes(1)
    expect(api.steamBridgeListFriends).toHaveBeenCalledWith('3205720')
    expect(s.load).toBe('ready')
    expect(s.friends.map((x) => x.ordinal)).toEqual([2, 1])
    expect(s.title).toBe('Schedule I: Free Sample')
  })

  it('a second open replaces the appId; a stale list is dropped', async () => {
    useSteamBridgeInvite.getState().open({ appId: '1' })
    useSteamBridgeInvite.getState().open({ appId: '2' })
    expect(useSteamBridgeInvite.getState().appId).toBe('2')
    await flush()
    expect(useSteamBridgeInvite.getState().appId).toBe('2')
  })

  it('close() resets everything', async () => {
    useSteamBridgeInvite.getState().open({ appId: '1' })
    await flush()
    useSteamBridgeInvite.getState().close()
    const s = useSteamBridgeInvite.getState()
    expect(s.isOpen).toBe(false)
    expect(s.appId).toBeUndefined()
    expect(s.friends).toEqual([])
    expect(s.rows).toEqual({})
  })

  it('list failure or rejection shows unavailable', async () => {
    api.steamBridgeListFriends.mockResolvedValue({
      ok: false,
      reason: 'no-helper'
    })
    useSteamBridgeInvite.getState().open({ appId: '1' })
    await flush()
    expect(useSteamBridgeInvite.getState().load).toBe('unavailable')
    api.steamBridgeListFriends.mockRejectedValue(new Error('x'))
    useSteamBridgeInvite.getState().open({ appId: '1' })
    await flush()
    expect(useSteamBridgeInvite.getState().load).toBe('unavailable')
  })

  it('invite() records the closed result word per row', async () => {
    useSteamBridgeInvite.getState().open({ appId: '9' })
    const p = useSteamBridgeInvite.getState().invite(4)
    expect(useSteamBridgeInvite.getState().rows[4]).toBe('pending')
    await p
    expect(api.steamBridgeInviteFriend).toHaveBeenCalledWith('9', 4)
    expect(useSteamBridgeInvite.getState().rows[4]).toBe('sent')
    api.steamBridgeInviteFriend.mockResolvedValue('expired')
    await useSteamBridgeInvite.getState().invite(5)
    expect(useSteamBridgeInvite.getState().rows[5]).toBe('expired')
    api.steamBridgeInviteFriend.mockRejectedValue(new Error('boom'))
    await useSteamBridgeInvite.getState().invite(6)
    expect(useSteamBridgeInvite.getState().rows[6]).toBe('error')
  })
})
