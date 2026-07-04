import {
  crossoverLinkIDRegEx,
  crossoverRatingRegEx,
  wineRatingRegEx
} from './constants'
import { logError, logInfo, LogPrefix } from 'backend/logger'
import { AppleGamingWikiInfo } from 'common/types'
import { axiosClient } from 'backend/utils'

/**
 * AppleGamingWiki sits behind Cloudflare, which 403s requests without a
 * browser-like User-Agent (axios' default `axios/x.y` is blocked). Send a
 * browser UA so the MediaWiki API responds with JSON instead of a challenge
 * page. Mirrors the same workaround used for HowLongToBeat.
 */
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * "Checked, no rating found" marker. Returned (instead of null) when the game
 * has no AppleGamingWiki page so the result is CACHEABLE — otherwise a null
 * would be treated as a cache miss and re-fetched on every visit. Distinct from
 * a genuine fetch error, which still returns null so it retries next time.
 */
const EMPTY_APPLEGAMINGWIKI_INFO: AppleGamingWikiInfo = {
  crossoverRating: '',
  wineRating: '',
  crossoverLink: ''
}

export async function getInfoFromAppleGamingWiki(
  title: string
): Promise<AppleGamingWikiInfo | null> {
  try {
    // applegamingwiki does not like "-" and mostly replaces it with ":"
    title = title.replace(' -', ':')

    logInfo(
      `Getting AppleGamingWiki data for ${title}`,
      LogPrefix.ExtraGameInfo
    )

    const id = await getPageID(title)

    if (!id) {
      return EMPTY_APPLEGAMINGWIKI_INFO
    }

    const wikitext = await getWikiText(id)

    return {
      crossoverRating: wikitext?.match(crossoverRatingRegEx)?.[1] ?? '',
      wineRating: wikitext?.match(wineRatingRegEx)?.[1] ?? '',
      crossoverLink: wikitext?.match(crossoverLinkIDRegEx)?.[1] ?? ''
    }
  } catch (error) {
    logError(
      [`Was not able to get AppleGamingWiki data for ${title}`, error],
      LogPrefix.ExtraGameInfo
    )
    return null
  }
}

async function getPageID(title: string): Promise<string> {
  const { data } = await axiosClient.get(
    `https://www.applegamingwiki.com/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      title
    )}&format=json`,
    { headers: { 'User-Agent': BROWSER_USER_AGENT } }
  )

  return data.query.search[0]?.pageid
}

async function getWikiText(id: string): Promise<string | null> {
  const { data } = await axiosClient.get(
    `https://www.applegamingwiki.com/w/api.php?action=parse&format=json&pageid=${id}&redirects=true&prop=wikitext`,
    { headers: { 'User-Agent': BROWSER_USER_AGENT } }
  )

  if (!data.parse.wikitext || !data.parse.wikitext['*']) {
    return null
  }

  return data.parse.wikitext['*']
}
