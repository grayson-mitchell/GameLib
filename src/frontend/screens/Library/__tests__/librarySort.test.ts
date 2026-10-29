import type { GameInfo } from 'common/types'
import {
  DEFAULT_LIBRARY_SORT_PREFS,
  LIBRARY_GROUP_BY_KEY,
  LEGACY_SORT_INSTALLED_KEY,
  LIBRARY_SORT_DIRECTION_KEY,
  LIBRARY_SORT_FIELD_KEY,
  LEGACY_SORT_DESCENDING_KEY,
  LIBRARY_SORT_FIELDS,
  buildWikiMetacriticByTitle,
  defaultDirectionFor,
  lastPlayedMs,
  metacriticScoreOf,
  parseInstallSize,
  readLibrarySortPrefs,
  sortAndGroupLibrary,
  sortLibrary,
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

describe('sortLibrary', () => {
  it('name asc/desc, THE stripped, does not mutate', () => {
    const input = [
      game({ title: 'Zed' }),
      game({ title: 'The Witcher' }),
      game({ title: 'Alpha' })
    ]
    const copy = [...input]
    expect(titles(sortLibrary(input, baseOpts))).toEqual([
      'Alpha',
      'The Witcher',
      'Zed'
    ])
    expect(
      titles(sortLibrary(input, { ...baseOpts, direction: 'desc' }))
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
      titles(sortLibrary([steam, gog], { ...o, direction: 'desc' }))
    ).toEqual(['Gogy', 'Steamy'])
    expect(
      titles(sortLibrary([steam, gog], { ...o, direction: 'asc' }))
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
    expect(titles(sortLibrary(gs, { ...o, direction: 'desc' }))).toEqual([
      'Recent',
      'Played A',
      'Played Z',
      'Never A',
      'Never B'
    ])
    expect(titles(sortLibrary(gs, { ...o, direction: 'asc' }))).toEqual([
      'Played A',
      'Played Z',
      'Recent',
      'Never A',
      'Never B'
    ])
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
    expect(titles(sortLibrary(gs, { ...o, direction: 'desc' }))).toEqual([
      'Big',
      'Mid1',
      'Mid2',
      'Small',
      'Bad',
      'Stale',
      'Zero'
    ])
    expect(titles(sortLibrary(gs, { ...o, direction: 'asc' }))).toEqual([
      'Small',
      'Mid1',
      'Mid2',
      'Big',
      'Bad',
      'Stale',
      'Zero'
    ])
  })

  it('identical titles break ties by runner then app_name, independent of input order and direction (IN-03)', () => {
    const steam = game({ title: 'Portal', app_name: '400', runner: 'steam' })
    const gog = game({ title: 'Portal', app_name: 'portal', runner: 'gog' })
    const gogB = game({ title: 'Portal', app_name: 'portal2', runner: 'gog' })
    const ids = (gs: GameInfo[]) => gs.map((g) => `${g.runner}:${g.app_name}`)
    const expected = ['gog:portal', 'gog:portal2', 'steam:400']
    for (const input of [
      [steam, gog, gogB],
      [gogB, steam, gog]
    ]) {
      for (const direction of ['asc', 'desc'] as const) {
        expect(ids(sortLibrary(input, { ...baseOpts, direction }))).toEqual(
          expected
        )
        expect(
          ids(
            sortLibrary(input, {
              ...baseOpts,
              field: 'lastPlayed',
              direction
            })
          )
        ).toEqual(expected)
      }
    }
  })

  it('is the pure sort order: no install-status or store clustering', () => {
    const gs = [
      game({ title: 'Beta (installed)', is_installed: true, runner: 'steam' }),
      game({ title: 'Alpha (not installed)', is_installed: false }),
      game({ title: 'Gamma', is_installed: true, runner: 'legendary' })
    ]
    expect(titles(sortLibrary(gs, baseOpts))).toEqual([
      'Alpha (not installed)',
      'Beta (installed)',
      'Gamma'
    ])
  })
})

describe('defaultDirectionFor', () => {
  it('maps each field to its natural default', () => {
    expect(defaultDirectionFor('name')).toBe('asc')
    expect(defaultDirectionFor('lastPlayed')).toBe('desc')
    expect(defaultDirectionFor('installSize')).toBe('desc')
    expect(defaultDirectionFor('metacritic')).toBe('desc')
  })
})

describe('readLibrarySortPrefs', () => {
  const fake = (entries: Record<string, string>) => {
    const m = new Map(Object.entries(entries))
    return { getItem: (k: string) => m.get(k) ?? null }
  }
  it('accepts a stored metacritic field (quick 261029-sbi)', () => {
    expect(
      readLibrarySortPrefs(fake({ [LIBRARY_SORT_FIELD_KEY]: 'metacritic' }))
        .field
    ).toBe('metacritic')
  })
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
      readLibrarySortPrefs(fake({ [LEGACY_SORT_DESCENDING_KEY]: 'true' })).field
    ).toBe('name')
  })
  it('new keys win over legacy', () => {
    const p = readLibrarySortPrefs(
      fake({
        [LIBRARY_SORT_FIELD_KEY]: 'installSize',
        [LIBRARY_SORT_DIRECTION_KEY]: 'asc',
        [LEGACY_SORT_DESCENDING_KEY]: 'true'
      })
    )
    expect(p).toEqual({
      field: 'installSize',
      direction: 'asc',
      groupBy: 'installStatus'
    })
  })
  it('invalid new values default per axis, not legacy', () => {
    const p = readLibrarySortPrefs(
      fake({
        [LIBRARY_SORT_FIELD_KEY]: 'popularity',
        [LIBRARY_SORT_DIRECTION_KEY]: '',
        [LEGACY_SORT_DESCENDING_KEY]: 'true'
      })
    )
    expect(p).toEqual(DEFAULT_LIBRARY_SORT_PREFS)
  })
  it('garbage legacy and throwing getItem give defaults', () => {
    expect(
      readLibrarySortPrefs(
        fake({
          [LEGACY_SORT_DESCENDING_KEY]: 'yes'
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

describe('group-by prefs (quick 261029-uas)', () => {
  const fake = (entries: Record<string, string>) => {
    const m = new Map(Object.entries(entries))
    return { getItem: (k: string) => m.get(k) ?? null }
  }
  it('reads libraryGroupBy, falls back on invalid', () => {
    expect(
      readLibrarySortPrefs(fake({ [LIBRARY_GROUP_BY_KEY]: 'store' })).groupBy
    ).toBe('store')
    expect(
      readLibrarySortPrefs(fake({ [LIBRARY_GROUP_BY_KEY]: 'none' })).groupBy
    ).toBe('none')
    expect(
      readLibrarySortPrefs(fake({ [LIBRARY_GROUP_BY_KEY]: 'x' })).groupBy
    ).toBe('installStatus')
  })
  it('migrates legacy sortInstalled; libraryGroupBy wins', () => {
    expect(
      readLibrarySortPrefs(fake({ [LEGACY_SORT_INSTALLED_KEY]: 'false' }))
        .groupBy
    ).toBe('none')
    expect(
      readLibrarySortPrefs(fake({ [LEGACY_SORT_INSTALLED_KEY]: 'true' }))
        .groupBy
    ).toBe('installStatus')
    expect(
      readLibrarySortPrefs(
        fake({
          [LIBRARY_GROUP_BY_KEY]: 'store',
          [LEGACY_SORT_INSTALLED_KEY]: 'false'
        })
      ).groupBy
    ).toBe('store')
  })
  it('writeLibraryGroupBy writes the key and swallows errors', () => {
    const setItem = jest.fn()
    writeLibraryGroupBy({ setItem }, 'store')
    expect(setItem.mock.calls).toEqual([[LIBRARY_GROUP_BY_KEY, 'store']])
    const bad = () => {
      throw new Error('quota')
    }
    expect(() => writeLibraryGroupBy({ setItem: bad }, 'none')).not.toThrow()
  })
})

describe('sortAndGroupLibrary (quick 261029-uas)', () => {
  const o = {
    ...baseOpts,
    groupBy: 'none' as const,
    installing: [] as string[]
  }
  it('none equals sortLibrary', () => {
    const gs = [
      game({ title: 'B', is_installed: true }),
      game({ title: 'A' }),
      game({ title: 'C', runner: 'steam' })
    ]
    expect(sortAndGroupLibrary(gs, o)).toEqual(sortLibrary(gs, baseOpts))
  })
  it('installStatus: installed, installing, rest, sort kept (metacritic desc)', () => {
    const scored = (
      title: string,
      score: number,
      extra: Partial<FixtureOpts> = {}
    ) =>
      ({
        ...game({ title, ...extra }),
        metacritic_score: score
      }) as unknown as GameInfo
    const gs = [
      scored('A', 50),
      scored('B', 90, { is_installed: true }),
      scored('C', 80, { app_name: 'c' }),
      scored('D', 95, { is_installed: true }),
      scored('E', 99)
    ]
    const out = sortAndGroupLibrary(gs, {
      ...o,
      field: 'metacritic',
      direction: 'desc',
      groupBy: 'installStatus',
      installing: ['c']
    })
    expect(titles(out)).toEqual(['D', 'B', 'C', 'E', 'A'])
  })
  it('store: named by display name, unnamed by runner id', () => {
    const gs = [
      game({ title: 'S1', runner: 'steam' }),
      game({ title: 'E1', runner: 'legendary' }),
      game({ title: 'X1', runner: 'sideload' }),
      game({ title: 'G1', runner: 'gog' }),
      game({ title: 'G2', runner: 'gog' }),
      game({ title: 'A1', runner: 'nile' }),
      game({ title: 'Q1', runner: 'aaa-unknown' })
    ]
    const s = { ...o, groupBy: 'store' as const }
    expect(titles(sortAndGroupLibrary(gs, s))).toEqual([
      'A1',
      'E1',
      'G1',
      'G2',
      'S1',
      'Q1',
      'X1'
    ])
    expect(
      titles(sortAndGroupLibrary(gs, { ...s, direction: 'desc' }))
    ).toEqual(['A1', 'E1', 'G2', 'G1', 'S1', 'Q1', 'X1'])
  })
})

describe('write helpers', () => {
  it('write plain strings under new keys only', () => {
    const setItem = jest.fn()
    writeLibrarySortField({ setItem }, 'lastPlayed')
    writeLibrarySortDirection({ setItem }, 'desc')
    expect(setItem.mock.calls).toEqual([
      [LIBRARY_SORT_FIELD_KEY, 'lastPlayed'],
      [LIBRARY_SORT_DIRECTION_KEY, 'desc']
    ])
  })
  it('swallow a throwing setItem', () => {
    const setItem = () => {
      throw new Error('quota')
    }
    expect(() => writeLibrarySortField({ setItem }, 'name')).not.toThrow()
    expect(() => writeLibrarySortDirection({ setItem }, 'asc')).not.toThrow()
  })
})

describe('metacritic sort (quick 261029-sbi)', () => {
  const scored = (title: string, score?: number, runner = 'gog'): GameInfo =>
    ({ ...game({ title, runner }), metacritic_score: score }) as GameInfo

  it('offers the four fields in order', () => {
    expect(LIBRARY_SORT_FIELDS).toEqual([
      'name',
      'lastPlayed',
      'installSize',
      'metacritic'
    ])
  })

  it('metacriticScoreOf: Steam score wins over the wiki, wiki fills in otherwise, invalid is unknown', () => {
    expect(metacriticScoreOf(scored('A', 90, 'steam'), { A: 70 })).toBe(90)
    expect(metacriticScoreOf(scored('B'), { B: 81 })).toBe(81)
    expect(metacriticScoreOf(scored('C', 0), {})).toBeUndefined()
  })

  it('desc puts highest first, unknown last; asc keeps unknown last', () => {
    const input = [
      scored('A', 70),
      scored('B'),
      scored('C', 90),
      scored('D', 70)
    ]
    const o = { ...baseOpts, field: 'metacritic' as const }
    expect(titles(sortLibrary(input, { ...o, direction: 'desc' }))).toEqual([
      'C',
      'A',
      'D',
      'B'
    ])
    expect(titles(sortLibrary(input, { ...o, direction: 'asc' }))).toEqual([
      'A',
      'D',
      'C',
      'B'
    ])
  })

  it('uses wikiMetacriticByTitle when given', () => {
    const input = [scored('A'), scored('B')]
    expect(
      titles(
        sortLibrary(input, {
          ...baseOpts,
          field: 'metacritic',
          direction: 'desc',
          wikiMetacriticByTitle: { B: 60 }
        })
      )
    ).toEqual(['B', 'A'])
  })

  describe('buildWikiMetacriticByTitle', () => {
    it('reads pcgamingwiki.metacritic.score via the shared parser, keyed by raw title', () => {
      const entries: Record<string, unknown> = {
        'A: B': { pcgamingwiki: { metacritic: { score: '88' } } },
        N: null,
        W: {},
        E: { pcgamingwiki: { metacritic: { score: '' } } }
      }
      const games = ['A: B', 'N', 'W', 'E', 'Missing'].map((t) => scored(t))
      expect(buildWikiMetacriticByTitle(games, (t) => entries[t])).toEqual({
        'A: B': 88
      })
    })
  })
})
