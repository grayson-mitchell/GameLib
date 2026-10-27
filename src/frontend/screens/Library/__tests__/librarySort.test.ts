import type { GameInfo } from 'common/types'
import {
  DEFAULT_LIBRARY_SORT_PREFS,
  LIBRARY_GROUP_BY_KEY,
  LIBRARY_SORT_DIRECTION_KEY,
  LIBRARY_SORT_FIELD_KEY,
  LEGACY_SORT_DESCENDING_KEY,
  LEGACY_SORT_INSTALLED_KEY,
  defaultDirectionFor,
  lastPlayedMs,
  parseInstallSize,
  readLibrarySortPrefs,
  sortAndGroupLibrary,
  writeLibraryGroupBy,
  writeLibrarySortDirection,
  writeLibrarySortField
} from '../librarySort'

interface FixtureOpts {
  title: string
  app_name?: string
  runner?: string
  is_installed?: boolean
  size?: string
  steamLastPlayed?: number
}

const game = (o: FixtureOpts): GameInfo =>
  ({
    title: o.title,
    app_name: o.app_name ?? o.title,
    runner: o.runner ?? 'gog',
    is_installed: o.is_installed ?? false,
    install: { install_size: o.size },
    extra: { steamLastPlayed: o.steamLastPlayed }
  }) as unknown as GameInfo

const titles = (gs: GameInfo[]) => gs.map((g) => g.title)

const baseOpts = {
  field: 'name' as const,
  direction: 'asc' as const,
  groupBy: 'none' as const,
  installing: [] as string[],
  nonSteamLastPlayedIso: {}
}

describe('parseInstallSize', () => {
  const GiB = 1024 ** 3
  it('parses backend formatted sizes', () => {
    expect(parseInstallSize('4.66 GiB')).toBeCloseTo(4.66 * GiB, 0)
    expect(parseInstallSize('1.5 KiB')).toBe(1536)
    expect(parseInstallSize('512 MiB')).toBe(512 * 1024 ** 2)
    expect(parseInstallSize('2.73 TiB')).toBeCloseTo(2.73 * 1024 ** 4, 0)
    expect(parseInstallSize('10 B')).toBe(10)
  })
  it('is case and whitespace tolerant, 1024 based', () => {
    expect(parseInstallSize('  3 gib ')).toBe(3 * GiB)
    expect(parseInstallSize('1 KB')).toBe(1024)
    expect(parseInstallSize('1 MB')).toBe(1024 ** 2)
    expect(parseInstallSize('1 GB')).toBe(GiB)
    expect(parseInstallSize('1 TB')).toBe(1024 ** 4)
    expect(parseInstallSize('2 Bytes')).toBe(2)
  })
  it('accepts a bare number as bytes', () => {
    expect(parseInstallSize('1048576')).toBe(1048576)
  })
  it('returns undefined for unknowns', () => {
    for (const v of [
      '',
      '0',
      '0 B',
      'abc',
      '12 parsecs',
      '-1 GiB',
      'NaN GiB',
      undefined,
      42,
      null
    ]) {
      expect(parseInstallSize(v)).toBeUndefined()
    }
  })
})

describe('lastPlayedMs', () => {
  it('converts steam seconds to ms', () => {
    expect(
      lastPlayedMs(
        game({ title: 'a', runner: 'steam', steamLastPlayed: 1700000000 }),
        {}
      )
    ).toBe(1700000000000)
  })
  it('steam with 0 or undefined is unknown', () => {
    expect(
      lastPlayedMs(
        game({ title: 'a', runner: 'steam', steamLastPlayed: 0 }),
        {}
      )
    ).toBeUndefined()
    expect(
      lastPlayedMs(game({ title: 'a', runner: 'steam' }), {})
    ).toBeUndefined()
  })
  it('ignores the ISO map for steam', () => {
    const g = game({ title: 'a', runner: 'steam', steamLastPlayed: 100 })
    expect(lastPlayedMs(g, { a: '2026-10-01T10:00:00.000Z' })).toBe(100000)
    const never = game({ title: 'a', runner: 'steam' })
    expect(
      lastPlayedMs(never, { a: '2026-10-01T10:00:00.000Z' })
    ).toBeUndefined()
  })
  it('reads ISO for non-steam', () => {
    const iso = '2026-10-01T10:00:00.000Z'
    expect(lastPlayedMs(game({ title: 'a' }), { a: iso })).toBe(Date.parse(iso))
    expect(lastPlayedMs(game({ title: 'a' }), {})).toBeUndefined()
    expect(lastPlayedMs(game({ title: 'a' }), { a: 'garbage' })).toBeUndefined()
  })
})

describe('sortAndGroupLibrary', () => {
  it('name asc/desc, THE stripped, does not mutate', () => {
    const input = [
      game({ title: 'Zed' }),
      game({ title: 'The Witcher' }),
      game({ title: 'Alpha' })
    ]
    const copy = [...input]
    expect(titles(sortAndGroupLibrary(input, baseOpts))).toEqual([
      'Alpha',
      'The Witcher',
      'Zed'
    ])
    expect(
      titles(sortAndGroupLibrary(input, { ...baseOpts, direction: 'desc' }))
    ).toEqual(['Zed', 'The Witcher', 'Alpha'])
    expect(input).toEqual(copy)
  })

  it('normalises steam seconds vs ISO ms', () => {
    const S = 1700000000
    const steam = game({ title: 'Steamy', runner: 'steam', steamLastPlayed: S })
    const gog = game({ title: 'Gogy', runner: 'gog' })
    const o = {
      ...baseOpts,
      field: 'lastPlayed' as const,
      nonSteamLastPlayedIso: { Gogy: new Date((S + 60) * 1000).toISOString() }
    }
    expect(
      titles(sortAndGroupLibrary([steam, gog], { ...o, direction: 'desc' }))
    ).toEqual(['Gogy', 'Steamy'])
    expect(
      titles(sortAndGroupLibrary([steam, gog], { ...o, direction: 'asc' }))
    ).toEqual(['Steamy', 'Gogy'])
  })

  it('unknown lastPlayed last in both directions, title tiebreak asc', () => {
    const gs = [
      game({ title: 'Never B', runner: 'steam' }),
      game({ title: 'Played Z', runner: 'steam', steamLastPlayed: 500 }),
      game({ title: 'Never A', runner: 'steam', steamLastPlayed: 0 }),
      game({ title: 'Played A', runner: 'steam', steamLastPlayed: 500 }),
      game({ title: 'Recent', runner: 'steam', steamLastPlayed: 900 })
    ]
    const o = { ...baseOpts, field: 'lastPlayed' as const }
    expect(
      titles(sortAndGroupLibrary(gs, { ...o, direction: 'desc' }))
    ).toEqual(['Recent', 'Played A', 'Played Z', 'Never A', 'Never B'])
    expect(titles(sortAndGroupLibrary(gs, { ...o, direction: 'asc' }))).toEqual(
      ['Played A', 'Played Z', 'Recent', 'Never A', 'Never B']
    )
  })

  it('install size: unknowns last both directions, uninstalled stale size unknown', () => {
    const gs = [
      game({ title: 'Big', is_installed: true, size: '10 GiB' }),
      game({ title: 'Small', is_installed: true, size: '1 GiB' }),
      game({ title: 'Bad', is_installed: true, size: 'abc' }),
      game({ title: 'Zero', is_installed: true, size: '0 B' }),
      game({ title: 'Stale', is_installed: false, size: '99 GiB' }),
      game({ title: 'Mid2', is_installed: true, size: '5 GiB' }),
      game({ title: 'Mid1', is_installed: true, size: '5 GiB' })
    ]
    const o = { ...baseOpts, field: 'installSize' as const }
    expect(
      titles(sortAndGroupLibrary(gs, { ...o, direction: 'desc' }))
    ).toEqual(['Big', 'Mid1', 'Mid2', 'Small', 'Bad', 'Stale', 'Zero'])
    expect(titles(sortAndGroupLibrary(gs, { ...o, direction: 'asc' }))).toEqual(
      ['Small', 'Mid1', 'Mid2', 'Big', 'Bad', 'Stale', 'Zero']
    )
  })

  it('groups by install status with sort inside each group', () => {
    const gs = [
      game({ title: 'A', is_installed: false }),
      game({ title: 'B', is_installed: true }),
      game({ title: 'C', is_installed: false, app_name: 'c' }),
      game({ title: 'D', is_installed: true })
    ]
    const o = {
      ...baseOpts,
      groupBy: 'installStatus' as const,
      installing: ['c']
    }
    expect(titles(sortAndGroupLibrary(gs, o))).toEqual(['B', 'D', 'C', 'A'])
    expect(
      titles(sortAndGroupLibrary(gs, { ...o, direction: 'desc' }))
    ).toEqual(['D', 'B', 'C', 'A'])
  })

  it('groups by store, unknown runners last by runner id, direction does not reorder groups', () => {
    const gs = [
      game({ title: 'S1', runner: 'steam' }),
      game({ title: 'E1', runner: 'legendary' }),
      game({ title: 'X1', runner: 'sideload' }),
      game({ title: 'G1', runner: 'gog' }),
      game({ title: 'G2', runner: 'gog' }),
      game({ title: 'A1', runner: 'nile' }),
      game({ title: 'Z1', runner: 'zoom' }),
      game({ title: 'Q1', runner: 'aaa-unknown' })
    ]
    const o = { ...baseOpts, groupBy: 'store' as const }
    expect(titles(sortAndGroupLibrary(gs, o))).toEqual([
      'A1',
      'E1',
      'G1',
      'G2',
      'S1',
      'Z1',
      'Q1',
      'X1'
    ])
    expect(
      titles(sortAndGroupLibrary(gs, { ...o, direction: 'desc' }))
    ).toEqual(['A1', 'E1', 'G2', 'G1', 'S1', 'Z1', 'Q1', 'X1'])
  })
})

describe('defaultDirectionFor', () => {
  it('maps each field to its natural default', () => {
    expect(defaultDirectionFor('name')).toBe('asc')
    expect(defaultDirectionFor('lastPlayed')).toBe('desc')
    expect(defaultDirectionFor('installSize')).toBe('desc')
  })
})

describe('readLibrarySortPrefs', () => {
  const fake = (entries: Record<string, string>) => {
    const m = new Map(Object.entries(entries))
    return { getItem: (k: string) => m.get(k) ?? null }
  }
  it('defaults on empty storage', () => {
    expect(readLibrarySortPrefs(fake({}))).toEqual(DEFAULT_LIBRARY_SORT_PREFS)
    expect(DEFAULT_LIBRARY_SORT_PREFS).toEqual({
      field: 'name',
      direction: 'asc',
      groupBy: 'installStatus'
    })
  })
  it('migrates legacy keys', () => {
    expect(
      readLibrarySortPrefs(fake({ [LEGACY_SORT_DESCENDING_KEY]: 'true' }))
        .direction
    ).toBe('desc')
    expect(
      readLibrarySortPrefs(fake({ [LEGACY_SORT_DESCENDING_KEY]: 'false' }))
        .direction
    ).toBe('asc')
    expect(
      readLibrarySortPrefs(fake({ [LEGACY_SORT_INSTALLED_KEY]: 'false' }))
        .groupBy
    ).toBe('none')
    expect(
      readLibrarySortPrefs(fake({ [LEGACY_SORT_INSTALLED_KEY]: 'true' }))
        .groupBy
    ).toBe('installStatus')
    expect(
      readLibrarySortPrefs(fake({ [LEGACY_SORT_DESCENDING_KEY]: 'true' })).field
    ).toBe('name')
  })
  it('new keys win over legacy', () => {
    const p = readLibrarySortPrefs(
      fake({
        [LIBRARY_SORT_FIELD_KEY]: 'installSize',
        [LIBRARY_SORT_DIRECTION_KEY]: 'asc',
        [LIBRARY_GROUP_BY_KEY]: 'store',
        [LEGACY_SORT_DESCENDING_KEY]: 'true',
        [LEGACY_SORT_INSTALLED_KEY]: 'false'
      })
    )
    expect(p).toEqual({
      field: 'installSize',
      direction: 'asc',
      groupBy: 'store'
    })
  })
  it('invalid new values default per axis, not legacy', () => {
    const p = readLibrarySortPrefs(
      fake({
        [LIBRARY_SORT_FIELD_KEY]: 'popularity',
        [LIBRARY_SORT_DIRECTION_KEY]: '',
        [LIBRARY_GROUP_BY_KEY]: 'x',
        [LEGACY_SORT_DESCENDING_KEY]: 'true',
        [LEGACY_SORT_INSTALLED_KEY]: 'false'
      })
    )
    expect(p).toEqual(DEFAULT_LIBRARY_SORT_PREFS)
  })
  it('garbage legacy and throwing getItem give defaults', () => {
    expect(
      readLibrarySortPrefs(
        fake({
          [LEGACY_SORT_DESCENDING_KEY]: 'yes',
          [LEGACY_SORT_INSTALLED_KEY]: '{'
        })
      )
    ).toEqual(DEFAULT_LIBRARY_SORT_PREFS)
    expect(
      readLibrarySortPrefs({
        getItem: () => {
          throw new Error('boom')
        }
      })
    ).toEqual(DEFAULT_LIBRARY_SORT_PREFS)
  })
})

describe('write helpers', () => {
  it('write plain strings under new keys only', () => {
    const setItem = jest.fn()
    writeLibrarySortField({ setItem }, 'lastPlayed')
    writeLibrarySortDirection({ setItem }, 'desc')
    writeLibraryGroupBy({ setItem }, 'store')
    expect(setItem.mock.calls).toEqual([
      [LIBRARY_SORT_FIELD_KEY, 'lastPlayed'],
      [LIBRARY_SORT_DIRECTION_KEY, 'desc'],
      [LIBRARY_GROUP_BY_KEY, 'store']
    ])
  })
  it('swallow a throwing setItem', () => {
    const setItem = () => {
      throw new Error('quota')
    }
    expect(() => writeLibrarySortField({ setItem }, 'name')).not.toThrow()
    expect(() => writeLibrarySortDirection({ setItem }, 'asc')).not.toThrow()
    expect(() => writeLibraryGroupBy({ setItem }, 'none')).not.toThrow()
  })
})
