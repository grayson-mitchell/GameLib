import type { Game } from 'common/types/game_manager'
import type { GameInfo } from 'common/types'

jest.mock('backend/logger')
jest.mock('backend/store_backend')

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
  // Must mirror the REAL contract: `{ info, outcome }`, never a bare null. A mock that
  // returns the old shape passes nothing useful -- it only proves the orchestrator
  // tolerates a shape production never produces.
  getInfoFromPCGamingWiki: jest
    .fn()
    .mockResolvedValue({ info: null, outcome: 'notfound' })
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
import { getInfoFromPCGamingWiki } from '../pcgamingwiki/utils'

const getInfoFromPCGamingWikiMock = getInfoFromPCGamingWiki as jest.Mock

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
      umuId: null,
      // Required for this test to keep isolating the D-13 path. `staleWikiFetch`
      // (see wiki_game_info.ts) treats an entry with NO fetchStatus as stale, so
      // without this the re-fetch below would happen for the WRONG reason and the
      // test would stay green even if the crossoverIndexHas gate broke entirely.
      fetchStatus: { pcgamingwiki: 'ok' as const, howlongtobeat: 'ok' as const }
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
      umuId: null,
      // As above: an entry with no fetchStatus is stale under `staleWikiFetch`, which
      // would re-fetch here and defeat the "stays cached" assertion this test exists
      // to make. A successful fetchStatus keeps the entry fresh for wiki purposes so
      // the D-13 crossover rule is the only thing under test.
      fetchStatus: { pcgamingwiki: 'ok' as const, howlongtobeat: 'ok' as const }
    }
    wikiGameInfoStore.set('Half-Life 2', cached)
    crossoverIndexHasMock.mockReturnValue(false)

    const result = await getWikiGameInfo(makeGame())

    expect(getCodeweaversFromIndexMock).not.toHaveBeenCalled()
    expect(getInfoFromCodeweaversMock).not.toHaveBeenCalled()
    expect(result).toStrictEqual(cached)
  })
})

/**
 * Regression coverage for
 * `.planning/todos/.../2026-08-22-wiki-cache-misses-on-pcgamingwiki-and-hltb-never-self-heal.md`
 * (quick task 260822-rc8).
 *
 * `wikiGameInfoStore` is a 30-day cache. When PCGamingWiki was returning 403 (the default
 * `axios/*` User-Agent, since fixed in `backend/utils.ts`), every game visited during that
 * window cached an empty pcgamingwiki + howlongtobeat pair -- and kept it for the full 30
 * days even after the 403 was fixed, because nothing treated a FAILED lookup as stale.
 *
 * Note on why this is NOT tested via `CacheStore`'s `invalidateCheck`: that hook is ANDed
 * with `minutesSinceUpdate > lifespan` (`backend/cache.ts`), so it is a retention veto on an
 * already-expired entry, not an early-invalidation trigger. It cannot fire inside the 30
 * days at all. The self-heal lives in `getWikiGameInfo`'s cache-hit guard instead, as a
 * third sibling of the existing `staleAppleData` / `staleCrossoverData` flags.
 *
 * `use_in_memory()` matters here: under the bare `jest.mock('backend/store_backend')` automock,
 * `store.has()` returns undefined, so a cache HIT is impossible and every "it re-fetched"
 * assertion below would pass vacuously against a store that never stored anything.
 */
describe('getWikiGameInfo — cached wiki miss self-heals (todo 2026-08-22, task 260822-rc8)', () => {
  // `removeSpecialcharacters` strips none of these characters, so the cache key for
  // makeGame()'s default title is the title verbatim.
  const CACHE_KEY = 'Half-Life 2'

  function seedCache(fetchStatus: unknown) {
    const entry = {
      pcgamingwiki: null,
      applegamingwiki: null,
      codeweavers: null,
      howlongtobeat: null,
      gamesdb: null,
      steamInfo: null,
      umuId: null,
      ...(fetchStatus === undefined ? {} : { fetchStatus })
    }
    wikiGameInfoStore.set(CACHE_KEY, entry as never)
  }

  beforeEach(() => {
    // Windows: isMac/isLinux false, so staleAppleData and staleCrossoverData are both
    // false and the cache-hit guard reduces to the flag under test.
    envMock.isWindows = true
    envMock.isMac = false
    envMock.isLinux = false
    getInfoFromCodeweaversMock.mockReset()
    getCodeweaversFromIndexMock.mockReset()
    crossoverIndexHasMock.mockReset()
    wikiGameInfoStore.use_in_memory()
    wikiGameInfoStore.clear()
    getInfoFromPCGamingWikiMock.mockReset()
    getInfoFromPCGamingWikiMock.mockResolvedValue({
      info: null,
      outcome: 'notfound'
    })
  })

  it('re-fetches when the cached entry recorded a FAILED pcgamingwiki lookup (the 403)', async () => {
    seedCache({ pcgamingwiki: 'error', howlongtobeat: 'skipped' })

    await getWikiGameInfo(makeGame())

    expect(getInfoFromPCGamingWikiMock).toHaveBeenCalled()
  })

  // Pins the `howlongtobeat === 'skipped'` clause on its own. The test above cannot: it
  // seeds pcgamingwiki 'error' too, which re-fetches by itself, so deleting the 'skipped'
  // clause leaves it green. The shape seeded here was unreachable under the old derivation
  // ('skipped' was only assigned when pcgamingwiki errored), which is precisely why the
  // clause needs its own test now that nothing assigns the value at all.
  it("re-fetches a legacy 'skipped' HLTB entry even when pcgamingwiki succeeded", async () => {
    seedCache({ pcgamingwiki: 'ok', howlongtobeat: 'skipped' })

    await getWikiGameInfo(makeGame())

    expect(getInfoFromPCGamingWikiMock).toHaveBeenCalled()
  })

  it('re-fetches when the cached entry predates fetchStatus entirely (old-shape 403-era entry)', async () => {
    seedCache(undefined)

    await getWikiGameInfo(makeGame())

    expect(getInfoFromPCGamingWikiMock).toHaveBeenCalled()
  })

  it('does NOT re-scrape a game genuinely absent from PCGamingWiki (notfound stays cached)', async () => {
    // THE exclusion this fix turns on. Keying staleness on `!cachedResponse.pcgamingwiki`
    // (a null info field) instead of on the OUTCOME would re-scrape every notfound game on
    // every details-page visit, forever -- against the site whose UA policy just blocked us.
    seedCache({ pcgamingwiki: 'notfound', howlongtobeat: 'notfound' })

    await getWikiGameInfo(makeGame())

    expect(getInfoFromPCGamingWikiMock).not.toHaveBeenCalled()
  })

  it('serves a fully-successful cached entry from cache', async () => {
    seedCache({ pcgamingwiki: 'ok', howlongtobeat: 'ok' })

    await getWikiGameInfo(makeGame())

    expect(getInfoFromPCGamingWikiMock).not.toHaveBeenCalled()
  })
})
