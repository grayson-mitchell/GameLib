import type { SteamSetupDownloadProgress } from 'common/types/steam'
import { applySetupDownloadEvent, setupRowsInOrder } from '../setupModel'

const running = (
  kind: SteamSetupDownloadProgress['kind'],
  bytes = 5,
  percent = 10
): SteamSetupDownloadProgress => ({ kind, state: 'running', bytes, percent })

describe('applySetupDownloadEvent', () => {
  it('stores a running event under its kind', () => {
    const ev = running('steam-client')
    expect(applySetupDownloadEvent({}, ev)).toEqual({ 'steam-client': ev })
  })

  it('a running event for an existing kind replaces it', () => {
    const first = applySetupDownloadEvent({}, running('steam-client', 5, 10))
    const second = applySetupDownloadEvent(
      first,
      running('steam-client', 9, 20)
    )
    expect(second['steam-client']).toEqual(running('steam-client', 9, 20))
  })

  it.each(['done', 'error'] as const)(
    'a %s event deletes that kind',
    (state) => {
      const map = applySetupDownloadEvent({}, running('steam-bottle'))
      const next = applySetupDownloadEvent(map, {
        kind: 'steam-bottle',
        state,
        bytes: 1,
        percent: 100
      })
      expect(next).toEqual({})
    }
  )

  it('a done event for an absent kind is a no-op returning an equal map', () => {
    const map = applySetupDownloadEvent({}, running('steam-client'))
    const next = applySetupDownloadEvent(map, {
      kind: 'steam-bottle',
      state: 'done',
      bytes: 1,
      percent: 100
    })
    expect(next).toEqual(map)
  })

  it('does not mutate its input', () => {
    const map = applySetupDownloadEvent({}, running('steam-client'))
    const frozen = Object.freeze({ ...map })
    expect(() =>
      applySetupDownloadEvent(frozen, running('steam-bottle'))
    ).not.toThrow()
  })
})

describe('setupRowsInOrder', () => {
  it('orders steam-client before steam-bottle regardless of insertion order', () => {
    let map = applySetupDownloadEvent({}, running('steam-bottle'))
    map = applySetupDownloadEvent(map, running('steam-client'))
    expect(setupRowsInOrder(map).map((r) => r.kind)).toEqual([
      'steam-client',
      'steam-bottle'
    ])
  })

  it('returns only running rows', () => {
    const map = {
      'steam-client': {
        kind: 'steam-client',
        state: 'done',
        bytes: 1,
        percent: 100
      },
      'steam-bottle': running('steam-bottle')
    } as const
    expect(setupRowsInOrder(map).map((r) => r.kind)).toEqual(['steam-bottle'])
  })

  it('returns [] for an empty map', () => {
    expect(setupRowsInOrder({})).toEqual([])
  })
})
