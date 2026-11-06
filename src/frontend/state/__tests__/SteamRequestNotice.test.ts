import type { IpcRendererEvent } from 'backend/platform'
import type { SteamRequestNoticePayload } from 'common/types/steam'
import {
  handleSteamRequestNoticeSignal,
  useSteamRequestNotice
} from '../SteamRequestNotice'

const make = (
  over: Partial<SteamRequestNoticePayload> = {}
): SteamRequestNoticePayload => ({
  appId: '730',
  title: 'CS:GO',
  kind: 'install-not-started',
  seq: 1,
  ...over
})
const evt = {} as IpcRendererEvent
const send = (p: unknown) =>
  handleSteamRequestNoticeSignal(evt, p as SteamRequestNoticePayload)

describe('SteamRequestNotice store', () => {
  beforeEach(() => useSteamRequestNotice.setState({ latest: null }))

  it('stores a valid pushed payload', () => {
    send(make())
    expect(useSteamRequestNotice.getState().latest).toEqual(make())
  })

  it.each([
    ['non-numeric appId', make({ appId: 'abc' })],
    ['unknown kind', { ...make(), kind: 'boom' }],
    ['non-number seq', { ...make(), seq: '1' }],
    ['non-string title', { ...make(), title: 5 }],
    ['null payload', null]
  ])('ignores %s', (_n, payload) => {
    send(payload)
    expect(useSteamRequestNotice.getState().latest).toBeNull()
  })

  it('does not replace with a lower or equal seq', () => {
    send(make({ seq: 5, title: 'New' }))
    send(make({ seq: 5, title: 'Same' }))
    send(make({ seq: 2, title: 'Old' }))
    expect(useSteamRequestNotice.getState().latest?.title).toBe('New')
    send(make({ seq: 6, title: 'Newer' }))
    expect(useSteamRequestNotice.getState().latest?.title).toBe('Newer')
  })
})
