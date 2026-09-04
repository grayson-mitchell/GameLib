import axios from 'axios'
import { logError, logInfo, LogPrefix } from 'backend/logger'
import type { Game } from 'common/types/game_manager'
import { pickBestMatch, toSearchTerms } from './titleMatch'

export interface HeroicHowLongToBeatEntry {
  completionist: number
  mainStory: number
  mainExtra: number
  gameId?: number
  gameName?: string
  gameImageUrl?: string
  gameWebLink?: string
}

const HLTB_BASE_URL = 'https://howlongtobeat.com'
const HLTB_SEARCH_INIT_URL = `${HLTB_BASE_URL}/api/search/site/init`
const HLTB_SEARCH_URL = `${HLTB_BASE_URL}/api/search/site`

/**
 * This module uses bare `axios` with a browser User-Agent, NOT the shared `axiosClient` from
 * `backend/wiki_game_info/utils`. That is deliberate and the two policies are opposites:
 * PCGamingWiki asks for a descriptive agent (and 403s the axios default), while HLTB sits
 * behind Cloudflare and refuses anything that does not look like a browser. Unifying the two
 * clients breaks one site or the other -- keep them apart.
 */
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1'
}

/** Raw game shape shared by the `/game/{id}` page props and the search endpoint's `data[]`. */
interface HltbApiGame {
  game_id?: number
  game_name?: string
  game_image?: string
  comp_main?: number
  comp_plus?: number
  comp_100?: number
}

/** Times arrive in seconds; the UI wants whole hours. */
function toHltbEntry(gameData: HltbApiGame): HeroicHowLongToBeatEntry {
  return {
    mainStory: gameData.comp_main ? Math.round(gameData.comp_main / 3600) : 0,
    mainExtra: gameData.comp_plus ? Math.round(gameData.comp_plus / 3600) : 0,
    completionist: gameData.comp_100 ? Math.round(gameData.comp_100 / 3600) : 0,
    gameId: gameData.game_id,
    gameName: gameData.game_name || undefined,
    gameImageUrl: gameData.game_image
      ? `${HLTB_BASE_URL}/games/${gameData.game_image}`
      : undefined,
    gameWebLink: gameData.game_id
      ? `${HLTB_BASE_URL}/game/${gameData.game_id}`
      : undefined
  }
}

async function getGameDataById(
  gameId: string
): Promise<HeroicHowLongToBeatEntry | null> {
  try {
    const gameUrl = `${HLTB_BASE_URL}/game/${gameId}`

    const response = await axios.get(gameUrl, {
      headers: { ...BROWSER_HEADERS, Referer: HLTB_BASE_URL },
      timeout: 10000,
      validateStatus: (status) => status < 500
    })

    if (response.status !== 200) {
      return null
    }

    // Extract game data from Next.js props
    const html = response.data
    const nextDataMatch = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
    )

    if (!nextDataMatch) {
      return null
    }

    const nextData = JSON.parse(nextDataMatch[1])
    const gameData = nextData.props?.pageProps?.game?.data?.game?.[0]

    if (!gameData || !gameData.game_id) {
      return null
    }

    return toHltbEntry(gameData)
  } catch (error) {
    logError(
      [`Error fetching HLTB game data for ID ${gameId}:`, error],
      LogPrefix.ExtraGameInfo
    )
    return null
  }
}

async function getGogHLTBGameData(
  game: Game
): Promise<HeroicHowLongToBeatEntry | null> {
  const { app_name, title } = game.getGameInfo()
  const { storeUrl } = await game.getExtraInfo()
  if (!storeUrl) return null

  try {
    const response = await axios.get(storeUrl, {
      headers: BROWSER_HEADERS,
      timeout: 10000,
      validateStatus: (status) => status < 500
    })

    if (response.status !== 200) {
      return null
    }

    const html = response.data as string
    const mainStory = Math.round(
      parseFloat(
        html.match(
          /<span class="howlongtobeat-box__time"> ?([\d.]+) h ?<\/span><span class="howlongtobeat-box__name">Main<\/span>/
        )![1]
      )
    )
    const mainExtra = Math.round(
      parseFloat(
        html.match(
          /<span class="howlongtobeat-box__time"> ?([\d.]+) h ?<\/span><span class="howlongtobeat-box__name">Main \+ Sides<\/span>/
        )![1]
      )
    )
    const completionist = Math.round(
      parseFloat(
        html.match(
          /<span class="howlongtobeat-box__time"> ?([\d.]+) h ?<\/span><span class="howlongtobeat-box__name">Completionist<\/span>/
        )![1]
      )
    )

    const hltbId = parseInt(
      html.match(
        /<a target="_blank" href="https:\/\/howlongtobeat.com\/game\/(\d+)">HowLongToBeat<\/a>/
      )![1]
    )

    return {
      mainStory,
      mainExtra,
      completionist,
      gameId: hltbId,
      gameName: title,
      gameWebLink: `${HLTB_BASE_URL}/game/${hltbId}`
    }
  } catch (error) {
    logError(
      [`Error fetching HLTB game data for ID ${app_name}:`, error],
      LogPrefix.ExtraGameInfo
    )
    return null
  }
}

interface SearchCredentials {
  token: string
  hpKey: string
  hpVal: string
}

let cachedCredentials: SearchCredentials | null = null

/**
 * HLTB's search is gated by a short-lived handshake: `/api/search/site/init` hands back an
 * auth token plus a honeypot key/value pair that must be echoed in BOTH the request headers
 * and the request body. None of it is documented, and the site has moved this endpoint
 * repeatedly -- assume it will break again and fail soft everywhere.
 */
async function getSearchCredentials(
  forceRefresh = false
): Promise<SearchCredentials | null> {
  if (cachedCredentials && !forceRefresh) return cachedCredentials

  try {
    const response = await axios.get(
      `${HLTB_SEARCH_INIT_URL}?t=${Date.now()}`,
      {
        headers: { ...BROWSER_HEADERS, Referer: `${HLTB_BASE_URL}/` },
        timeout: 10000,
        validateStatus: (status) => status < 500
      }
    )

    const { token, hpKey, hpVal } = response.data ?? {}
    if (response.status !== 200 || !token || !hpKey) {
      cachedCredentials = null
      return null
    }

    cachedCredentials = { token, hpKey, hpVal }
    return cachedCredentials
  } catch (error) {
    logError(
      ['Could not initialise HLTB search session:', error],
      LogPrefix.ExtraGameInfo
    )
    cachedCredentials = null
    return null
  }
}

async function postSearch(
  title: string,
  credentials: SearchCredentials
): Promise<{ status: number; games: HltbApiGame[] }> {
  const body: Record<string, unknown> = {
    searchType: 'games',
    searchTerms: toSearchTerms(title),
    searchPage: 1,
    size: 20,
    searchOptions: {
      games: {
        userId: 0,
        platform: '',
        sortCategory: 'popular',
        rangeCategory: 'main',
        rangeTime: { min: null, max: null },
        gameplay: { perspective: '', flow: '', genre: '', difficulty: '' },
        year: '',
        modifier: ''
      },
      users: { sortCategory: 'postcount' },
      lists: { sortCategory: 'follows' },
      filter: '',
      sort: 0,
      randomizer: 0
    },
    useCache: true
  }
  // The honeypot value goes in the body under its server-chosen key as well as in the
  // headers below; sending only the headers is rejected.
  body[credentials.hpKey] = credentials.hpVal

  const response = await axios.post(HLTB_SEARCH_URL, body, {
    headers: {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/json',
      Referer: `${HLTB_BASE_URL}/`,
      'x-auth-token': credentials.token,
      'x-hp-key': credentials.hpKey,
      'x-hp-val': credentials.hpVal
    },
    timeout: 10000,
    validateStatus: (status) => status < 500
  })

  return { status: response.status, games: response.data?.data ?? [] }
}

/**
 * Resolve HLTB data from a title alone, for games that have no HLTB ID.
 *
 * Returns `null` rather than a best guess whenever the search result set is ambiguous --
 * see `titleMatch.ts`. A wrong match here would silently show the wrong playtime with no way
 * for the user to tell, which is worse than showing nothing.
 */
async function getGameDataByTitle(
  title: string
): Promise<HeroicHowLongToBeatEntry | null> {
  try {
    let credentials = await getSearchCredentials()
    if (!credentials) return null

    let { status, games } = await postSearch(title, credentials)

    // The site itself treats 403 as an expired token and retries once after re-initialising.
    if (status === 403) {
      credentials = await getSearchCredentials(true)
      if (!credentials) return null
      ;({ status, games } = await postSearch(title, credentials))
    }

    if (status !== 200 || games.length === 0) {
      logInfo(
        `HLTB search returned no results for ${title}`,
        LogPrefix.ExtraGameInfo
      )
      return null
    }

    const match = pickBestMatch(
      title,
      games
        .filter((game) => game.game_name)
        .map((game) => ({ title: game.game_name as string, value: game }))
    )

    if (!match) {
      logInfo(
        `HLTB search for ${title} returned ${games.length} result(s), none an unambiguous match -- not guessing`,
        LogPrefix.ExtraGameInfo
      )
      return null
    }

    return toHltbEntry(match)
  } catch (error) {
    logError(
      [`Error searching HLTB for ${title}:`, error],
      LogPrefix.ExtraGameInfo
    )
    return null
  }
}

export async function getHowLongToBeat(
  game: Game,
  hltbId?: string
): Promise<HeroicHowLongToBeatEntry | null> {
  const gameInfo = game.getGameInfo()
  if (gameInfo.runner == 'gog') {
    logInfo(
      `Getting HowLongToBeat data for ${gameInfo.title} ${gameInfo.app_name} - ${gameInfo.runner}`,
      LogPrefix.ExtraGameInfo
    )

    const gameData = await getGogHLTBGameData(game)
    if (gameData) {
      return gameData
    }
    logInfo(
      `HLTB ID ${hltbId} not found for ${gameInfo.title}`,
      LogPrefix.ExtraGameInfo
    )
  } else if (hltbId) {
    logInfo(
      `Getting HowLongToBeat data for ${gameInfo.title}${hltbId ? ` (ID: ${hltbId})` : ''} - ${gameInfo.runner}`,
      LogPrefix.ExtraGameInfo
    )

    const gameData = await getGameDataById(hltbId)
    if (gameData) {
      return gameData
    }
    logInfo(
      `HLTB ID ${hltbId} not found for ${gameInfo.title}`,
      LogPrefix.ExtraGameInfo
    )
  }

  // Third branch: no HLTB ID at all. `hltbId` only ever comes from PCGamingWiki, so before
  // this existed every non-GOG game whose article carried no HLTB ID showed no playtime,
  // permanently -- and re-visiting the page could never fix it. Reached both when the ID is
  // absent and when a stale ID 404s above.
  if (gameInfo.runner !== 'gog' && gameInfo.title) {
    logInfo(
      `No HLTB ID for ${gameInfo.title}, searching by title`,
      LogPrefix.ExtraGameInfo
    )

    const gameData = await getGameDataByTitle(gameInfo.title)
    if (gameData) {
      return gameData
    }
  }

  logInfo(
    `No HLTB data available for ${gameInfo.title}`,
    LogPrefix.ExtraGameInfo
  )
  return null
}
