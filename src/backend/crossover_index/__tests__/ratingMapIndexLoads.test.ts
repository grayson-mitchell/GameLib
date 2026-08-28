/**
 * WR-07 gate (34.2-REVIEW.md round 1): `buildCrossoverRatingMap` must load
 * the CrossOver index ONCE per run, not once per game.
 *
 * Deliberately a SEPARATE suite from `ratingMap.test.ts`: that file mocks
 * `../index` wholesale to test the D-16 three-state contract in isolation,
 * which makes the real `getCodeweaversFromIndex` -> `loadIndex` call chain
 * -- the exact thing this gate measures -- invisible to it. Here `../index`
 * is REAL and only `../fetcher` is mocked, so the assertion is about the
 * genuine call graph.
 *
 * Why call COUNT and not wall-clock: a timing assertion would be flaky and
 * would not say what went wrong. The count is the property WR-07 named.
 */
import type { GameInfo } from 'common/types'
import type { CrossoverIndex } from '../schema'

jest.mock('backend/logger')
jest.mock('backend/store_backend')

const envMock = { isWindows: false, isMac: true, isLinux: false }
jest.mock('backend/constants/environment', () => envMock)

const loadIndexMock = jest.fn()
jest.mock('../fetcher', () => ({
  ...jest.requireActual('../fetcher'),
  loadIndex: (...args: unknown[]) => loadIndexMock(...args)
}))

const getListOfGamesMock = jest.fn<GameInfo[], []>()
jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {
    steam: { getListOfGames: getListOfGamesMock }
  }
}))

import { buildCrossoverRatingMap } from '../crossoverRatingMap'

const GAME_COUNT = 50

function makeIndex(): CrossoverIndex {
  return {
    version: 1,
    generatedAt: '2026-08-22T00:00:00.000Z',
    entries: [{ name: 'Game 0', steamid: '0', rating: 4 }]
  } as CrossoverIndex
}

function makeGames(count: number): GameInfo[] {
  return Array.from(
    { length: count },
    (_, i) =>
      ({
        app_name: String(i),
        runner: 'steam',
        title: `Game ${i}`,
        art_cover: '',
        art_square: '',
        install: {},
        is_installed: false,
        canRunOffline: true
      }) as unknown as GameInfo
  )
}

describe('buildCrossoverRatingMap index loading (WR-07)', () => {
  beforeEach(() => {
    loadIndexMock.mockReset()
    getListOfGamesMock.mockReset()
    envMock.isMac = true
  })

  test(`loads the index ONCE for a ${GAME_COUNT}-game library, not once per game`, async () => {
    loadIndexMock.mockResolvedValue(makeIndex())
    getListOfGamesMock.mockReturnValue(makeGames(GAME_COUNT))

    await buildCrossoverRatingMap()

    expect(loadIndexMock).toHaveBeenCalledTimes(1)
  })

  test('still resolves every eligible game to the right three-state value', async () => {
    loadIndexMock.mockResolvedValue(makeIndex())
    getListOfGamesMock.mockReturnValue(makeGames(3))

    const map = await buildCrossoverRatingMap()

    // Anti-vacuity: a load-once fix that resolved NOTHING would also pass the
    // count assertion above. app_name '0' joins entry steamid '0'.
    expect(map['0']).toBe(4)
    expect(map['1']).toBeNull()
    expect(map['2']).toBeNull()
  })

  test('a null index (total load failure) yields key-present nulls, not a throw', async () => {
    loadIndexMock.mockResolvedValue(null)
    getListOfGamesMock.mockReturnValue(makeGames(2))

    const map = await buildCrossoverRatingMap()

    expect(loadIndexMock).toHaveBeenCalledTimes(1)
    expect(map).toEqual({ '0': null, '1': null })
  })

  test('non-macOS short-circuits before loading the index at all', async () => {
    envMock.isMac = false
    getListOfGamesMock.mockReturnValue(makeGames(10))

    const map = await buildCrossoverRatingMap()

    expect(map).toEqual({})
    expect(loadIndexMock).not.toHaveBeenCalled()
  })
})
