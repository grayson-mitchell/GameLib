import type { Game } from 'common/types/game_manager'
import type { GameInfo } from 'common/types'

jest.mock('backend/logger')
jest.mock('electron-store')

// ── backend/constants/environment mock — mutable double, defaults to
// non-mac/non-linux (Windows). Mirrors the envMock pattern in
// steam/__tests__/games.test.ts so each test flips isMac/isLinux explicitly.
const envMock = { isWindows: true, isMac: false, isLinux: false }
jest.mock('backend/constants/environment', () => envMock)

jest.mock('backend/wiki_game_info/gamesdb/utils', () => ({
  getInfoFromGamesDB: jest.fn().mockResolvedValue(null)
}))
jest.mock('backend/wiki_game_info/protondb/utils', () => ({
  getInfoFromProtonDB: jest.fn().mockResolvedValue(null)
}))
jest.mock('backend/wiki_game_info/steamdeck/utils', () => ({
  getSteamDeckComp: jest.fn().mockResolvedValue(null)
}))
jest.mock('../applegamingwiki/utils', () => ({
  getInfoFromAppleGamingWiki: jest.fn().mockResolvedValue(null)
}))
jest.mock('../pcgamingwiki/utils', () => ({
  getInfoFromPCGamingWiki: jest.fn().mockResolvedValue(null)
}))
jest.mock('../howlongtobeat/utils', () => ({
  getHowLongToBeat: jest.fn().mockResolvedValue(null)
}))
jest.mock('../umu/utils', () => ({
  getUmuId: jest.fn().mockResolvedValue(null)
}))

const getInfoFromCodeweaversMock = jest.fn()
jest.mock('../codeweavers/utils', () => ({
  getInfoFromCodeweavers: (...args: unknown[]) =>
    getInfoFromCodeweaversMock(...args)
}))

const getCodeweaversFromIndexMock = jest.fn()
const crossoverIndexHasMock = jest.fn()
jest.mock('backend/crossover_index', () => ({
  getCodeweaversFromIndex: (...args: unknown[]) =>
    getCodeweaversFromIndexMock(...args),
  crossoverIndexHas: (...args: unknown[]) => crossoverIndexHasMock(...args)
}))

// Imported AFTER the jest.mock calls above.
import { getWikiGameInfo } from '../wiki_game_info'
import { wikiGameInfoStore } from '../electronStore'

function makeGame(overrides: Partial<GameInfo> = {}): Game {
  const gameInfo: GameInfo = {
    runner: 'steam',
    app_name: '220',
    title: 'Half-Life 2',
    art_cover: '',
    art_square: '',
    install: {},
    is_installed: false
  } as GameInfo

  return {
    getGameInfo: () => ({ ...gameInfo, ...overrides })
  } as Game
}

describe('getWikiGameInfo — D-10/D-11/D-13 index-first CrossOver wiring', () => {
  beforeEach(() => {
    envMock.isWindows = true
    envMock.isMac = false
    envMock.isLinux = false
    getInfoFromCodeweaversMock.mockReset()
    getCodeweaversFromIndexMock.mockReset()
    crossoverIndexHasMock.mockReset()
    wikiGameInfoStore.clear()
  })

  test('macOS index hit: codeweavers slot resolves from the index, scrape (getInfoFromCodeweavers) is never called', async () => {
    envMock.isMac = true
    getCodeweaversFromIndexMock.mockResolvedValue({
      macRating: 5,
      linuxRating: null,
      slug: 'half-life-2'
    })

    const result = await getWikiGameInfo(makeGame())

    expect(result?.codeweavers).toStrictEqual({
      macRating: 5,
      linuxRating: null,
      slug: 'half-life-2'
    })
    expect(getInfoFromCodeweaversMock).not.toHaveBeenCalled()
  })

  test('macOS index miss: falls through to the lazy scrape', async () => {
    envMock.isMac = true
    getCodeweaversFromIndexMock.mockResolvedValue(null)
    getInfoFromCodeweaversMock.mockResolvedValue({
      macRating: 3,
      linuxRating: null,
      slug: 'half-life-2'
    })

    const result = await getWikiGameInfo(makeGame())

    expect(getCodeweaversFromIndexMock).toHaveBeenCalled()
    expect(getInfoFromCodeweaversMock).toHaveBeenCalledWith('Half-Life 2')
    expect(result?.codeweavers).toStrictEqual({
      macRating: 3,
      linuxRating: null,
      slug: 'half-life-2'
    })
  })

  test('Linux: getCodeweaversFromIndex is never called; codeweavers resolves via the unchanged scrape path', async () => {
    envMock.isLinux = true
    getInfoFromCodeweaversMock.mockResolvedValue({
      macRating: null,
      linuxRating: 4,
      slug: 'half-life-2'
    })

    const result = await getWikiGameInfo(makeGame())

    expect(getCodeweaversFromIndexMock).not.toHaveBeenCalled()
    expect(getInfoFromCodeweaversMock).toHaveBeenCalledWith('Half-Life 2')
    expect(result?.codeweavers).toStrictEqual({
      macRating: null,
      linuxRating: 4,
      slug: 'half-life-2'
    })
  })

  test('Windows (neither mac nor linux): codeweavers slot stays null, neither path runs', async () => {
    const result = await getWikiGameInfo(makeGame())

    expect(getCodeweaversFromIndexMock).not.toHaveBeenCalled()
    expect(getInfoFromCodeweaversMock).not.toHaveBeenCalled()
    expect(result?.codeweavers).toBeNull()
  })

  test('D-13 self-heal: a cached macRating===null miss re-fetches on macOS when crossoverIndexHas is true', async () => {
    envMock.isMac = true
    wikiGameInfoStore.set('Half-Life 2', {
      pcgamingwiki: null,
      applegamingwiki: {
        crossoverRating: '',
        wineRating: '',
        crossoverLink: ''
      },
      codeweavers: { macRating: null, linuxRating: null, slug: 'half-life-2' },
      howlongtobeat: null,
      gamesdb: null,
      steamInfo: null,
      umuId: null
    })
    crossoverIndexHasMock.mockReturnValue(true)
    getCodeweaversFromIndexMock.mockResolvedValue({
      macRating: 5,
      linuxRating: null,
      slug: 'half-life-2'
    })

    const result = await getWikiGameInfo(makeGame())

    expect(crossoverIndexHasMock).toHaveBeenCalled()
    expect(getCodeweaversFromIndexMock).toHaveBeenCalled()
    expect(result?.codeweavers).toStrictEqual({
      macRating: 5,
      linuxRating: null,
      slug: 'half-life-2'
    })
  })

  test('D-13 no re-scrape loop: a cached macRating===null miss stays cached on macOS when crossoverIndexHas is false', async () => {
    envMock.isMac = true
    const cached = {
      pcgamingwiki: null,
      applegamingwiki: {
        crossoverRating: '',
        wineRating: '',
        crossoverLink: ''
      },
      codeweavers: { macRating: null, linuxRating: null, slug: 'half-life-2' },
      howlongtobeat: null,
      gamesdb: null,
      steamInfo: null,
      umuId: null
    }
    wikiGameInfoStore.set('Half-Life 2', cached)
    crossoverIndexHasMock.mockReturnValue(false)

    const result = await getWikiGameInfo(makeGame())

    expect(getCodeweaversFromIndexMock).not.toHaveBeenCalled()
    expect(getInfoFromCodeweaversMock).not.toHaveBeenCalled()
    expect(result).toStrictEqual(cached)
  })
})
