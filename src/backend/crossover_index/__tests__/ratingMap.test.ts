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
const isCrossoverIndexEligibleMock = jest.fn<boolean, [GameInfo]>()
const getCodeweaversFromIndexMock = jest.fn()
jest.mock('../index', () => ({
  isCrossoverIndexEligible: (...args: [GameInfo]) =>
    isCrossoverIndexEligibleMock(...args),
  getCodeweaversFromIndex: (...args: [GameInfo]) =>
    getCodeweaversFromIndexMock(...args)
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
    getCodeweaversFromIndexMock.mockReset()
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
    expect(getCodeweaversFromIndexMock).not.toHaveBeenCalled()
  })

  it('marks an eligible Steam game with no index record as PRESENT null (looked up, absent)', async () => {
    getListOfGamesMocks.steam.mockReturnValue([
      makeGame({ app_name: '440', runner: 'steam', title: 'Team Fortress 2' })
    ])
    isCrossoverIndexEligibleMock.mockReturnValue(true)
    getCodeweaversFromIndexMock.mockResolvedValue(null)

    const map = await buildCrossoverRatingMap()

    expect(Object.prototype.hasOwnProperty.call(map, '440')).toBe(true)
    expect(map['440']).toBeNull()
  })

  it('marks an eligible Steam game with a matched record as PRESENT with its macRating number', async () => {
    getListOfGamesMocks.steam.mockReturnValue([
      makeGame({ app_name: '620', runner: 'steam', title: 'Portal 2' })
    ])
    isCrossoverIndexEligibleMock.mockReturnValue(true)
    getCodeweaversFromIndexMock.mockResolvedValue({
      macRating: 5,
      linuxRating: null,
      slug: 'portal-2'
    })

    const map = await buildCrossoverRatingMap()

    expect(map['620']).toBe(5)
  })

  it('treats a matched record with a null macRating as PRESENT null too', async () => {
    getListOfGamesMocks.steam.mockReturnValue([
      makeGame({ app_name: '999', runner: 'steam', title: 'Some Game' })
    ])
    isCrossoverIndexEligibleMock.mockReturnValue(true)
    getCodeweaversFromIndexMock.mockResolvedValue({
      macRating: null,
      linuxRating: 5,
      slug: 'some-game'
    })

    const map = await buildCrossoverRatingMap()

    expect(Object.prototype.hasOwnProperty.call(map, '999')).toBe(true)
    expect(map['999']).toBeNull()
  })

  it('is empty on non-macOS regardless of eligibility, and never even consults the index', async () => {
    envMock.isMac = false
    envMock.isWindows = true
    getListOfGamesMocks.steam.mockReturnValue([
      makeGame({ app_name: '440', runner: 'steam' })
    ])
    isCrossoverIndexEligibleMock.mockReturnValue(true)
    getCodeweaversFromIndexMock.mockResolvedValue({
      macRating: 5,
      linuxRating: null,
      slug: 'x'
    })

    const map = await buildCrossoverRatingMap()

    expect(map).toEqual({})
    expect(isCrossoverIndexEligibleMock).not.toHaveBeenCalled()
    expect(getCodeweaversFromIndexMock).not.toHaveBeenCalled()
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
    getCodeweaversFromIndexMock.mockResolvedValue(null)

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
