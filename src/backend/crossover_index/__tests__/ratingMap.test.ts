import { readFileSync } from 'fs'
import { join } from 'path'
import type { GameInfo } from 'common/types'
import { stripSourceComments as stripComments } from 'backend/testUtils/stripSourceComments'

// ── backend/ipc mock no longer needed here (Phase 34.2 Plan 03, D-06) —
// this suite now imports `crossoverRatingMap.ts` directly, which has no
// `addHandler` call of its own; the module-level registration side effect
// that used to require mocking `backend/ipc` now lives only in
// `ipc_handler.ts`, which this suite never imports.

// ── backend/constants/environment mock — mutable double, mirrors the
// envMock pattern used by wiki_game_info.test.ts / games.test.ts so tests
// can flip isMac per test.
const envMock = { isWindows: false, isMac: true, isLinux: false }
jest.mock('backend/constants/environment', () => envMock)

// ── backend/storeManagers mock — replaces libraryManagerMap with fully
// mocked managers so buildCrossoverRatingMap's enumeration is fully
// test-controlled, without loading any real store manager (and their own
// electron-store/network dependencies).
const getListOfGamesMocks = {
  sideload: jest.fn<GameInfo[], []>(),
  gog: jest.fn<GameInfo[], []>(),
  legendary: jest.fn<GameInfo[], []>(),
  nile: jest.fn<GameInfo[], []>(),
  zoom: jest.fn<GameInfo[], []>(),
  steam: jest.fn<GameInfo[], []>()
}
jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {
    sideload: { getListOfGames: getListOfGamesMocks.sideload },
    gog: { getListOfGames: getListOfGamesMocks.gog },
    legendary: { getListOfGames: getListOfGamesMocks.legendary },
    nile: { getListOfGames: getListOfGamesMocks.nile },
    zoom: { getListOfGames: getListOfGamesMocks.zoom },
    steam: { getListOfGames: getListOfGamesMocks.steam }
  }
}))

// ── ./index mock — the D-16 eligibility predicate + index-first lookup are
// each independently test-controlled here; this file only asserts the
// RESOLVER's own three-state contract, not 19-05's lookup logic (already
// covered by index.test.ts).
// WR-07: the boundary moved. `buildCrossoverRatingMap` no longer calls
// `getCodeweaversFromIndex` per game; it obtains a resolver ONCE (lazily, on
// the first eligible game) and calls that. Two mocks so both halves stay
// separately assertable: whether the index was consulted AT ALL
// (`buildIndexResolverMock`) and what each game resolved to
// (`resolveRatingForMock`).
const isCrossoverIndexEligibleMock = jest.fn<boolean, [GameInfo]>()
const resolveRatingForMock = jest.fn<number | null, [GameInfo]>()
const buildIndexResolverMock = jest.fn()
jest.mock('../index', () => ({
  isCrossoverIndexEligible: (...args: [GameInfo]) =>
    isCrossoverIndexEligibleMock(...args),
  buildIndexResolver: (...args: []) => buildIndexResolverMock(...args)
}))

import { buildCrossoverRatingMap } from '../crossoverRatingMap'

function makeGame(overrides: Partial<GameInfo> = {}): GameInfo {
  return {
    app_name: 'default-app',
    runner: 'steam',
    title: 'Default Game',
    art_cover: '',
    art_square: '',
    install: {},
    is_installed: false,
    canRunOffline: false,
    ...overrides
  }
}

describe('buildCrossoverRatingMap', () => {
  beforeEach(() => {
    Object.values(getListOfGamesMocks).forEach((mock) =>
      mock.mockReturnValue([])
    )
    isCrossoverIndexEligibleMock.mockReset()
    resolveRatingForMock.mockReset()
    buildIndexResolverMock.mockReset()
    buildIndexResolverMock.mockResolvedValue(resolveRatingForMock)
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
  })

  it('leaves an ineligible non-Steam game KEY-ABSENT (never looked up)', async () => {
    getListOfGamesMocks.gog.mockReturnValue([
      makeGame({ app_name: 'gog-1', runner: 'gog', title: 'Gog Game' })
    ])
    isCrossoverIndexEligibleMock.mockReturnValue(false)

    const map = await buildCrossoverRatingMap()

    // toEqual alone would not catch a resolver that emits `null` where it
    // must omit the key entirely — assert absence explicitly (D-16).
    expect(Object.prototype.hasOwnProperty.call(map, 'gog-1')).toBe(false)
    expect(resolveRatingForMock).not.toHaveBeenCalled()
    // Stronger than before: with nothing eligible the index is never even
    // LOADED, which the WR-07 lazy-once hoist has to preserve.
    expect(buildIndexResolverMock).not.toHaveBeenCalled()
  })

  it('marks an eligible Steam game with no index record as PRESENT null (looked up, absent)', async () => {
    getListOfGamesMocks.steam.mockReturnValue([
      makeGame({ app_name: '440', runner: 'steam', title: 'Team Fortress 2' })
    ])
    isCrossoverIndexEligibleMock.mockReturnValue(true)
    resolveRatingForMock.mockReturnValue(null)

    const map = await buildCrossoverRatingMap()

    expect(Object.prototype.hasOwnProperty.call(map, '440')).toBe(true)
    expect(map['440']).toBeNull()
  })

  it('marks an eligible Steam game with a matched record as PRESENT with its macRating number', async () => {
    getListOfGamesMocks.steam.mockReturnValue([
      makeGame({ app_name: '620', runner: 'steam', title: 'Portal 2' })
    ])
    isCrossoverIndexEligibleMock.mockReturnValue(true)
    resolveRatingForMock.mockReturnValue(5)

    const map = await buildCrossoverRatingMap()

    expect(map['620']).toBe(5)
  })

  // WR-07 note: this test used to feed a record with `macRating: null` and
  // assert the `?? null` coalescing. That distinction no longer exists at this
  // boundary — `buildIndexResolver` hands back `number | null` directly, and
  // the record-shape logic it exercised now lives in `resolveRating`, covered
  // by `index.test.ts`. Rather than leave a duplicate of the test above, it
  // now pins the property that replaced it: the resolver's value is used
  // VERBATIM per game, mixed values in a single pass, resolver built once.
  it('uses the resolver value verbatim per game, mixing numbers and nulls in one pass', async () => {
    getListOfGamesMocks.steam.mockReturnValue([
      makeGame({ app_name: 'a', runner: 'steam', title: 'A' }),
      makeGame({ app_name: 'b', runner: 'steam', title: 'B' }),
      makeGame({ app_name: 'c', runner: 'steam', title: 'C' })
    ])
    isCrossoverIndexEligibleMock.mockReturnValue(true)
    resolveRatingForMock
      .mockReturnValueOnce(5)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(1)

    const map = await buildCrossoverRatingMap()

    expect(map).toEqual({ a: 5, b: null, c: 1 })
    expect(resolveRatingForMock).toHaveBeenCalledTimes(3)
    expect(buildIndexResolverMock).toHaveBeenCalledTimes(1)
  })

  it('is empty on non-macOS regardless of eligibility, and never even consults the index', async () => {
    envMock.isMac = false
    envMock.isWindows = true
    getListOfGamesMocks.steam.mockReturnValue([
      makeGame({ app_name: '440', runner: 'steam' })
    ])
    isCrossoverIndexEligibleMock.mockReturnValue(true)
    resolveRatingForMock.mockReturnValue(5)

    const map = await buildCrossoverRatingMap()

    expect(map).toEqual({})
    expect(isCrossoverIndexEligibleMock).not.toHaveBeenCalled()
    expect(resolveRatingForMock).not.toHaveBeenCalled()
    expect(buildIndexResolverMock).not.toHaveBeenCalled()
  })

  it('iterates every runner in libraryManagerMap, keyed by app_name', async () => {
    getListOfGamesMocks.gog.mockReturnValue([
      makeGame({ app_name: 'gog-eligible', runner: 'gog', title: 'GOG Hit' })
    ])
    getListOfGamesMocks.steam.mockReturnValue([
      makeGame({
        app_name: 'steam-eligible',
        runner: 'steam',
        title: 'Steam Hit'
      })
    ])
    isCrossoverIndexEligibleMock.mockReturnValue(true)
    resolveRatingForMock.mockReturnValue(null)

    const map = await buildCrossoverRatingMap()

    expect(Object.keys(map).sort()).toEqual(
      ['gog-eligible', 'steam-eligible'].sort()
    )
  })

  // ── D-06 anti-remerge guard — fails loudly if a future edit re-merges the
  // addHandler registration back into this file, silently reopening the
  // side-effect-import trap this plan closed.
  it('never re-merges the addHandler("getCrossoverIndex", ...) registration into this module', () => {
    const source = readFileSync(
      join(__dirname, '..', 'crossoverRatingMap.ts'),
      'utf-8'
    )
    // Comment-stripping delegates to the shared
    // `backend/testUtils/stripSourceComments` util, imported above as
    // `stripComments`.
    const stripped = stripComments(source)

    expect(stripped).not.toMatch(/addHandler/)
  })
})
