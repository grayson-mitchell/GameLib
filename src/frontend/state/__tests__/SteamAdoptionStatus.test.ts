import type { IpcRendererEvent } from 'common/types/hostTypes'
import type { SteamAdoptionStatusPayload } from 'common/types/steam'
import {
  handleSteamAdoptionStatusChangedSignal,
  useSteamAdoptionStatus
} from '../SteamAdoptionStatus'

const make = (
  over: Partial<SteamAdoptionStatusPayload> = {}
): SteamAdoptionStatusPayload => ({
  appName: '112100',
  pending: true,
  steamSignedIn: null,
  seq: 1,
  ...over
})
const evt = {} as IpcRendererEvent
const send = (p: unknown) =>
  handleSteamAdoptionStatusChangedSignal(evt, p as SteamAdoptionStatusPayload)
const stored = (appName = '112100') =>
  useSteamAdoptionStatus.getState().byApp[appName]

describe('SteamAdoptionStatus store (D-07, D-03, T-81-30)', () => {
  beforeEach(() => useSteamAdoptionStatus.setState({ byApp: {} }))

  it('stores a valid pushed payload under its appName', () => {
    send(make())
    expect(stored()).toEqual(make())
  })

  it.each([true, false, null])('accepts steamSignedIn %p', (steamSignedIn) => {
    send(make({ steamSignedIn }))
    expect(stored()?.steamSignedIn).toBe(steamSignedIn)
  })

  it.each([
    ['non-numeric appName', make({ appName: 'abc' })],
    ['non-string appName', { ...make(), appName: 112100 }],
    ['eleven-digit appName', make({ appName: '12345678901' })],
    ['non-boolean pending', { ...make(), pending: 'yes' }],
    ['undefined steamSignedIn', { ...make(), steamSignedIn: undefined }],
    ['string steamSignedIn', { ...make(), steamSignedIn: 'false' }],
    ['non-number seq', { ...make(), seq: '1' }],
    ['NaN seq', make({ seq: NaN })],
    ['Infinity seq', make({ seq: Infinity })],
    ['null payload', null],
    ['string payload', 'x']
  ])('drops %s', (_n, payload) => {
    send(payload)
    expect(useSteamAdoptionStatus.getState().byApp).toEqual({})
  })

  it('keeps the newer push: an equal or older seq never replaces the stored one', () => {
    send(make({ seq: 5, pending: false }))
    send(make({ seq: 5, pending: true }))
    send(make({ seq: 4, pending: true }))
    expect(stored()).toEqual(make({ seq: 5, pending: false }))
    send(make({ seq: 6, pending: true, steamSignedIn: false }))
    expect(stored()).toEqual(
      make({ seq: 6, pending: true, steamSignedIn: false })
    )
  })

  it('orders per app: one app newer seq does not block another', () => {
    send(make({ appName: '1', seq: 9 }))
    send(make({ appName: '2', seq: 1 }))
    expect(stored('1')?.seq).toBe(9)
    expect(stored('2')?.seq).toBe(1)
  })
})
