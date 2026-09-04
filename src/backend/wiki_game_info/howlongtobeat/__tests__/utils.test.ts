import axios from 'axios'
import type { Game } from 'common/types/game_manager'

jest.mock('backend/logger')
jest.mock('axios')

const mockedAxios = axios as jest.Mocked<typeof axios>

const INIT_OK = {
  status: 200,
  data: { token: 'tok', hpKey: 'ign_abc', hpVal: 'val' }
}

const searchResult = (games: unknown[], status = 200) => ({
  status,
  data: { count: games.length, data: games }
})

const HADES = {
  game_id: 62941,
  game_name: 'Hades',
  game_image: '62941_Hades.jpg',
  comp_main: 84915,
  comp_plus: 174806,
  comp_100: 342890
}

const fakeGame = (runner: string, title: string) =>
  ({
    getGameInfo: () => ({ runner, title, app_name: 'app' }),
    getExtraInfo: async () => ({ storeUrl: '' })
  }) as unknown as Game

// `cachedCredentials` is module-scope state, so every test re-imports the module to get a
// clean session. Without this the first test's token leaks into the rest and the init
// handshake assertions become meaningless.
const freshModule = async () => {
  let mod!: typeof import('../utils')
  await jest.isolateModulesAsync(async () => {
    mod = await import('../utils')
  })
  return mod
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getHowLongToBeat — title fallback', () => {
  it('resolves a non-GOG game that has no HLTB ID, converting seconds to hours', async () => {
    mockedAxios.get.mockResolvedValueOnce(INIT_OK)
    mockedAxios.post.mockResolvedValueOnce(searchResult([HADES]))

    const { getHowLongToBeat } = await freshModule()
    const result = await getHowLongToBeat(fakeGame('steam', 'Hades'))

    expect(result).toEqual({
      mainStory: 24,
      mainExtra: 49,
      completionist: 95,
      gameId: 62941,
      gameName: 'Hades',
      gameImageUrl: 'https://howlongtobeat.com/games/62941_Hades.jpg',
      gameWebLink: 'https://howlongtobeat.com/game/62941'
    })
  })

  it('refuses to guess when the results are ambiguous', async () => {
    mockedAxios.get.mockResolvedValueOnce(INIT_OK)
    mockedAxios.post.mockResolvedValueOnce(
      searchResult([
        { ...HADES, game_id: 1, game_name: 'Doom' },
        { ...HADES, game_id: 2, game_name: 'DOOM' }
      ])
    )

    const { getHowLongToBeat } = await freshModule()
    expect(await getHowLongToBeat(fakeGame('steam', 'Doom'))).toBeNull()
  })

  it('refuses a sequel when the requested title is the base game', async () => {
    mockedAxios.get.mockResolvedValueOnce(INIT_OK)
    mockedAxios.post.mockResolvedValueOnce(
      searchResult([{ ...HADES, game_id: 3, game_name: 'Portal 2' }])
    )

    const { getHowLongToBeat } = await freshModule()
    expect(await getHowLongToBeat(fakeGame('steam', 'Portal'))).toBeNull()
  })

  it('sends the honeypot pair in both the headers and the body', async () => {
    mockedAxios.get.mockResolvedValueOnce(INIT_OK)
    mockedAxios.post.mockResolvedValueOnce(searchResult([HADES]))

    const { getHowLongToBeat } = await freshModule()
    await getHowLongToBeat(fakeGame('steam', 'Hades'))

    const [url, body, config] = mockedAxios.post.mock.calls[0] as [
      string,
      Record<string, unknown>,
      { headers: Record<string, string> }
    ]
    expect(url).toBe('https://howlongtobeat.com/api/search/site')
    expect(body['ign_abc']).toBe('val')
    expect(config.headers['x-auth-token']).toBe('tok')
    expect(config.headers['x-hp-key']).toBe('ign_abc')
    expect(config.headers['x-hp-val']).toBe('val')
  })

  it('re-initialises and retries once when the token has expired (403)', async () => {
    mockedAxios.get.mockResolvedValueOnce(INIT_OK).mockResolvedValueOnce({
      status: 200,
      data: { token: 'tok2', hpKey: 'ign_abc', hpVal: 'val2' }
    })
    mockedAxios.post
      .mockResolvedValueOnce(searchResult([], 403))
      .mockResolvedValueOnce(searchResult([HADES]))

    const { getHowLongToBeat } = await freshModule()
    const result = await getHowLongToBeat(fakeGame('steam', 'Hades'))

    expect(mockedAxios.get).toHaveBeenCalledTimes(2)
    expect(mockedAxios.post).toHaveBeenCalledTimes(2)
    expect(result?.gameId).toBe(62941)
  })

  it('returns null and issues no search when the handshake fails', async () => {
    mockedAxios.get.mockResolvedValueOnce({ status: 500, data: {} })

    const { getHowLongToBeat } = await freshModule()
    expect(await getHowLongToBeat(fakeGame('steam', 'Hades'))).toBeNull()
    expect(mockedAxios.post).not.toHaveBeenCalled()
  })

  it('does not throw when the search request rejects', async () => {
    mockedAxios.get.mockResolvedValueOnce(INIT_OK)
    mockedAxios.post.mockRejectedValueOnce(new Error('ECONNRESET'))

    const { getHowLongToBeat } = await freshModule()
    await expect(
      getHowLongToBeat(fakeGame('steam', 'Hades'))
    ).resolves.toBeNull()
  })

  it('does not throw when the handshake itself rejects', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('ETIMEDOUT'))

    const { getHowLongToBeat } = await freshModule()
    await expect(
      getHowLongToBeat(fakeGame('steam', 'Hades'))
    ).resolves.toBeNull()
  })

  it('reuses the cached session across calls', async () => {
    mockedAxios.get.mockResolvedValueOnce(INIT_OK)
    mockedAxios.post.mockResolvedValue(searchResult([HADES]))

    const { getHowLongToBeat } = await freshModule()
    await getHowLongToBeat(fakeGame('steam', 'Hades'))
    await getHowLongToBeat(fakeGame('epic', 'Hades'))

    expect(mockedAxios.get).toHaveBeenCalledTimes(1)
    expect(mockedAxios.post).toHaveBeenCalledTimes(2)
  })

  // GOG games have their own working path (the store page embeds HLTB numbers), so the
  // search must not fire for them -- that is what keeps this change additive.
  //
  // The handshake and search are stubbed to SUCCEED on purpose. Leaving them unstubbed made
  // this test vacuous: the un-mocked `axios.get` threw inside the fallback's own try/catch,
  // so `post` went uncalled whether the runner guard existed or not, and deleting the guard
  // left the test green.
  it('never searches for a GOG game', async () => {
    mockedAxios.get.mockResolvedValue(INIT_OK)
    mockedAxios.post.mockResolvedValue(searchResult([HADES]))

    const { getHowLongToBeat } = await freshModule()
    await getHowLongToBeat(fakeGame('gog', 'Hades'))

    expect(mockedAxios.post).not.toHaveBeenCalled()
  })

  it('falls back to a title search when a stale HLTB ID 404s', async () => {
    // /game/{id} page fetch returns 404 ...
    mockedAxios.get.mockResolvedValueOnce({ status: 404, data: '' })
    // ... then the handshake succeeds and the search resolves it.
    mockedAxios.get.mockResolvedValueOnce(INIT_OK)
    mockedAxios.post.mockResolvedValueOnce(searchResult([HADES]))

    const { getHowLongToBeat } = await freshModule()
    const result = await getHowLongToBeat(fakeGame('steam', 'Hades'), '99999')

    expect(result?.gameId).toBe(62941)
  })
})
