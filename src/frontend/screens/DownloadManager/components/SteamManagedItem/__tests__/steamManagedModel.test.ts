import type { GameStatus } from 'common/types'
import { steamManagedPercent, steamManagedRows } from '../steamManagedModel'

const entry = (over: Partial<GameStatus>): GameStatus => ({
  appName: '552620',
  runner: 'steam',
  status: 'installing',
  managedBySteam: true,
  ...over
})

describe('steamManagedRows', () => {
  it('lists a steam install the Steam client is downloading', () => {
    const rows = steamManagedRows([entry({})])
    expect(rows.map((r) => r.appName)).toEqual(['552620'])
  })

  it('skips a GameLib-driven install (no managedBySteam flag): it has a queue row', () => {
    expect(steamManagedRows([entry({ managedBySteam: undefined })])).toEqual([])
  })

  it('skips other runners and non-installing statuses', () => {
    expect(
      steamManagedRows([
        entry({ runner: 'gog' }),
        entry({ appName: '1', status: 'done' }),
        entry({ appName: '2', status: 'updating' })
      ])
    ).toEqual([])
  })

  it('keeps library-status order across several rows', () => {
    const rows = steamManagedRows([
      entry({ appName: 'b' }),
      entry({ appName: 'a' })
    ])
    expect(rows.map((r) => r.appName)).toEqual(['b', 'a'])
  })
})

describe('steamManagedPercent', () => {
  it.each([
    [undefined, 0],
    [Number.NaN, 0],
    [-5, 0],
    [39.4, 39],
    [120, 100]
  ])('%p -> %p', (input, expected) => {
    expect(steamManagedPercent(input)).toBe(expected)
  })
})
