import { axiosClient } from 'backend/utils'
import { GameInfo } from 'common/types'

import { crossoverIndexStore } from '../electronStore'
import { CrossoverIndex } from '../schema'

jest.mock('backend/logger')
jest.mock('electron-store')

// ── backend/crossover_index/normalize mock — mutable double so
// NAME_MATCHING_SHIPS can be flipped per test (mirrors the
// backend/constants/environment envMock pattern in games.test.ts). The
// normalizer itself is the real implementation — only the gate flag is
// mocked. The factory is self-contained (no outer-scope const reference)
// because jest.mock() factories run before this file's own top-level
// imports finish resolving (index.ts is required transitively via
// `backend/utils` at the very top of this file) — referencing an
// outer `const` here previously threw "Cannot access before
// initialization" (TDZ). `jest.requireActual` inside the factory is safe
// because it is only evaluated lazily, when '../normalize' is first
// required.
jest.mock('../normalize', () => ({
  ...jest.requireActual('../normalize'),
  NAME_MATCHING_SHIPS: true
}))

// Mutable reference to the mocked module so tests can flip the gate flag
// per-test without re-registering the mock factory.
const normalizeMock: { NAME_MATCHING_SHIPS: boolean } =
  jest.requireMock('../normalize')

// ── backend/crossover_index/fetcher mock — loadIndex replaced so the test
// controls exactly what the "index" is without a network/gunzip round-trip.
const loadIndexMock = jest.fn()
jest.mock('../fetcher', () => ({
  ...jest.requireActual('../fetcher'),
  loadIndex: (...args: unknown[]) => loadIndexMock(...args)
}))

// Imported AFTER the jest.mock calls above so the mocked modules are wired
// in before index.ts's own imports resolve.
import {
  getCodeweaversFromIndex,
  crossoverIndexHas,
  isCrossoverIndexEligible
} from '../index'

function makeIndex(overrides: Partial<CrossoverIndex> = {}): CrossoverIndex {
  return {
    version: 1,
    generatedAt: '2026-07-14T00:00:00.000Z',
    entries: [
      { name: 'Half-Life 2', rating: 5, steamid: '220' },
      { name: "Baldur's Gate 3", rating: 4 }
    ],
    ...overrides
  }
}

function makeGameInfo(overrides: Partial<GameInfo> = {}): GameInfo {
  return {
    runner: 'steam',
    app_name: '220',
    title: 'Half-Life 2',
    ...overrides
  } as GameInfo
}

describe('getCodeweaversFromIndex', () => {
  beforeEach(() => {
    loadIndexMock.mockReset()
    normalizeMock.NAME_MATCHING_SHIPS = true
    crossoverIndexStore.clear()
    jest.restoreAllMocks()
  })

  test('Steam-AppID hit resolves under NAME_MATCHING_SHIPS=true', async () => {
    loadIndexMock.mockResolvedValue(makeIndex())

    const result = await getCodeweaversFromIndex(
      makeGameInfo({ runner: 'steam', app_name: '220', title: 'Half-Life 2' })
    )

    expect(result).toStrictEqual({
      macRating: 5,
      linuxRating: null,
      slug: 'half-life-2'
    })
  })

  test('Steam-AppID hit resolves under NAME_MATCHING_SHIPS=false (never gated)', async () => {
    normalizeMock.NAME_MATCHING_SHIPS = false
    loadIndexMock.mockResolvedValue(makeIndex())

    const result = await getCodeweaversFromIndex(
      makeGameInfo({ runner: 'steam', app_name: '220', title: 'Half-Life 2' })
    )

    expect(result).toStrictEqual({
      macRating: 5,
      linuxRating: null,
      slug: 'half-life-2'
    })
  })

  test('non-Steam name hit resolves when NAME_MATCHING_SHIPS=true', async () => {
    normalizeMock.NAME_MATCHING_SHIPS = true
    loadIndexMock.mockResolvedValue(makeIndex())

    const result = await getCodeweaversFromIndex(
      makeGameInfo({
        runner: 'gog',
        app_name: 'some_gog_id',
        title: "Baldur's Gate 3"
      })
    )

    expect(result).toStrictEqual({
      macRating: 4,
      linuxRating: null,
      slug: 'baldurs-gate-3'
    })
  })

  test('the SAME non-Steam title returns null (byName skipped) when NAME_MATCHING_SHIPS=false', async () => {
    normalizeMock.NAME_MATCHING_SHIPS = false
    loadIndexMock.mockResolvedValue(makeIndex())

    const result = await getCodeweaversFromIndex(
      makeGameInfo({
        runner: 'gog',
        app_name: 'some_gog_id',
        title: "Baldur's Gate 3"
      })
    )

    expect(result).toBeNull()
  })

  test('miss (title not in index) returns null', async () => {
    loadIndexMock.mockResolvedValue(makeIndex())

    const result = await getCodeweaversFromIndex(
      makeGameInfo({
        runner: 'gog',
        app_name: 'other',
        title: 'Definitely Not Indexed'
      })
    )

    expect(result).toBeNull()
  })

  test('index unavailable (loadIndex resolves null) returns null, never throws', async () => {
    loadIndexMock.mockResolvedValue(null)

    const result = await getCodeweaversFromIndex(makeGameInfo())

    expect(result).toBeNull()
  })

  test('performs zero network calls itself (loadIndex is mocked, axiosClient.get never called)', async () => {
    const axiosSpy = jest.spyOn(axiosClient, 'get')
    loadIndexMock.mockResolvedValue(makeIndex())

    await getCodeweaversFromIndex(makeGameInfo())

    expect(axiosSpy).not.toHaveBeenCalled()
  })

  test('hit object has no medal key — exactly macRating/linuxRating/slug', async () => {
    loadIndexMock.mockResolvedValue(makeIndex())

    const result = await getCodeweaversFromIndex(makeGameInfo())

    expect(result && Object.keys(result).sort()).toStrictEqual([
      'linuxRating',
      'macRating',
      'slug'
    ])
  })

  test('a thrown error during lookup logs and returns null (never propagates)', async () => {
    loadIndexMock.mockRejectedValue(new Error('boom'))

    const result = await getCodeweaversFromIndex(makeGameInfo())

    expect(result).toBeNull()
  })
})

describe('crossoverIndexHas', () => {
  beforeEach(() => {
    normalizeMock.NAME_MATCHING_SHIPS = true
    crossoverIndexStore.clear()
  })

  test('returns false when the store is empty', () => {
    expect(crossoverIndexHas(makeGameInfo())).toBe(false)
  })

  test('returns true for a Steam-AppID hit regardless of NAME_MATCHING_SHIPS', () => {
    normalizeMock.NAME_MATCHING_SHIPS = false
    crossoverIndexStore.set('index', {
      data: makeIndex(),
      fetchedAt: Date.now()
    })

    expect(
      crossoverIndexHas(
        makeGameInfo({ runner: 'steam', app_name: '220', title: 'Half-Life 2' })
      )
    ).toBe(true)
  })

  test('returns true for a non-Steam name match only when NAME_MATCHING_SHIPS=true', () => {
    crossoverIndexStore.set('index', {
      data: makeIndex(),
      fetchedAt: Date.now()
    })
    normalizeMock.NAME_MATCHING_SHIPS = true

    expect(
      crossoverIndexHas(
        makeGameInfo({
          runner: 'gog',
          app_name: 'x',
          title: "Baldur's Gate 3"
        })
      )
    ).toBe(true)
  })

  test('returns false for the same non-Steam title when NAME_MATCHING_SHIPS=false', () => {
    crossoverIndexStore.set('index', {
      data: makeIndex(),
      fetchedAt: Date.now()
    })
    normalizeMock.NAME_MATCHING_SHIPS = false

    expect(
      crossoverIndexHas(
        makeGameInfo({
          runner: 'gog',
          app_name: 'x',
          title: "Baldur's Gate 3"
        })
      )
    ).toBe(false)
  })
})

describe('isCrossoverIndexEligible', () => {
  test('a steam-runner game is eligible under NAME_MATCHING_SHIPS=true', () => {
    normalizeMock.NAME_MATCHING_SHIPS = true
    expect(isCrossoverIndexEligible(makeGameInfo({ runner: 'steam' }))).toBe(
      true
    )
  })

  test('a steam-runner game is eligible under NAME_MATCHING_SHIPS=false', () => {
    normalizeMock.NAME_MATCHING_SHIPS = false
    expect(isCrossoverIndexEligible(makeGameInfo({ runner: 'steam' }))).toBe(
      true
    )
  })

  test('a non-steam game returns NAME_MATCHING_SHIPS=true', () => {
    normalizeMock.NAME_MATCHING_SHIPS = true
    expect(isCrossoverIndexEligible(makeGameInfo({ runner: 'gog' }))).toBe(
      true
    )
  })

  test('a non-steam game returns NAME_MATCHING_SHIPS=false', () => {
    normalizeMock.NAME_MATCHING_SHIPS = false
    expect(isCrossoverIndexEligible(makeGameInfo({ runner: 'gog' }))).toBe(
      false
    )
  })
})
