import { getInfoFromGamesDB } from 'backend/wiki_game_info/gamesdb/utils'
import { getInfoFromProtonDB } from 'backend/wiki_game_info/protondb/utils'
import { getSteamDeckComp } from 'backend/wiki_game_info/steamdeck/utils'
import { wikiGameInfoStore } from './electronStore'
import { removeSpecialcharacters } from '../utils'
import {
  HowLongToBeatOutcome,
  SteamInfo,
  WikiInfo,
  WikiSourceOutcome
} from 'common/types'
import { logError, logInfo, LogPrefix } from 'backend/logger'
import { getInfoFromAppleGamingWiki } from './applegamingwiki/utils'
import { getInfoFromCodeweavers } from './codeweavers/utils'
import { getHowLongToBeat } from './howlongtobeat/utils'
import { getInfoFromPCGamingWiki } from './pcgamingwiki/utils'
import { getUmuId } from './umu/utils'
import { isLinux, isMac } from 'backend/constants/environment'
import type { Game } from 'common/types/game_manager'
import {
  getCodeweaversFromIndex,
  crossoverIndexHas
} from 'backend/crossover_index'

export async function getWikiGameInfo(
  game: Game,
  forceRefresh = false
): Promise<WikiInfo | null> {
  const gameInfo = game.getGameInfo()
  const appName = gameInfo.app_name
  const runner = gameInfo.runner

  try {
    const title = removeSpecialcharacters(gameInfo.title)

    // check if we have a cached response
    const cachedResponse = wikiGameInfoStore.get(title)
    // Self-heal stale caches: entries populated before AppleGamingWiki data was
    // captured (or on a non-Mac session) hold applegamingwiki=null. On macOS the
    // DETAIL-02 compat pill needs that data, so treat a null-applegamingwiki hit
    // as a miss and re-fetch. Once re-fetched it caches a non-null value (real
    // ratings or the "checked, none found" marker) and refreshes on TTL expiry.
    const staleAppleData = isMac && !cachedResponse?.applegamingwiki
    // Self-heal stale caches: entries populated before CodeWeavers data was
    // captured (or on a Windows session) hold codeweavers=null. On Mac/Linux
    // the CrossOver rating pill needs that data, so treat a null-codeweavers
    // hit as a miss and re-fetch (mirrors staleAppleData above). Also treat
    // an old-shaped cache (pre-per-OS-rating, no `macRating` field at all) as
    // stale so it gets re-fetched into the new shape.
    // D-13: additionally, on macOS a cached Phase-16 "checked, none found"
    // miss (macRating === null, not undefined) is treated as stale ONLY when
    // the index (crossoverIndexHas, D-02-gated) now covers this title —
    // targeted, so a genuine miss (or a name-only title under a failed D-02
    // gate) does NOT re-scrape on every details-page visit.
    const staleCrossoverData =
      (isMac || isLinux) &&
      (!cachedResponse?.codeweavers ||
        cachedResponse.codeweavers.macRating === undefined ||
        (isMac &&
          cachedResponse.codeweavers.macRating === null &&
          crossoverIndexHas(gameInfo)))
    // Self-heal stale caches: a FAILED pcgamingwiki lookup (and the HLTB lookup it
    // starves of an ID) used to sit in this 30-day cache until it expired, so the
    // PCGamingWiki 403 fixed in `utils.ts` (the missing descriptive User-Agent) kept
    // presenting for a month per already-cached game even after the fix landed.
    // Third sibling of staleAppleData/staleCrossoverData above, keyed off the
    // `fetchStatus` this cache already persists (set below, typed in common/types.ts).
    //
    // Deliberately keyed on the OUTCOME, never on `!cachedResponse.pcgamingwiki`: a game
    // genuinely absent from PCGamingWiki caches `notfound` alongside a null info field,
    // and treating that null as stale would re-scrape every such game on EVERY
    // details-page visit, forever -- exactly the traffic pattern PCGamingWiki's UA policy
    // exists to discourage. `notfound` is a real answer and stays cached.
    //
    // `howlongtobeat === 'skipped'` is currently implied by `pcgamingwiki === 'error'`
    // (see the outcome derivation below -- 'skipped' is only ever assigned when the
    // pcgamingwiki outcome is 'error'), but is spelled out so a future change to that
    // derivation cannot silently narrow this rule.
    //
    // A cache entry with NO `fetchStatus` at all predates the field -- i.e. it is exactly
    // a 403-era entry. `WikiInfo.fetchStatus`'s own docstring requires this reading:
    // "Treat absent as 'unknown outcome' rather than assuming success." Same shape as
    // staleCrossoverData treating `macRating === undefined` as old-shape stale.
    const staleWikiFetch =
      !!cachedResponse &&
      (!cachedResponse.fetchStatus ||
        cachedResponse.fetchStatus.pcgamingwiki === 'error' ||
        cachedResponse.fetchStatus.howlongtobeat === 'skipped')
    if (
      !forceRefresh &&
      cachedResponse &&
      !staleAppleData &&
      !staleCrossoverData &&
      !staleWikiFetch
    ) {
      logInfo(
        [`Using cached ExtraGameInfo data for ${title}`],
        LogPrefix.ExtraGameInfo
      )
      return cachedResponse
    }

    logInfo(`Getting ExtraGameInfo data for ${title}`, LogPrefix.ExtraGameInfo)

    const [pcgamingwikiResult, gamesdb, applegamingwiki, umuId, codeweavers] =
      await Promise.all([
        getInfoFromPCGamingWiki(title, runner === 'gog' ? appName : undefined),
        getInfoFromGamesDB(title, appName, runner),
        isMac ? getInfoFromAppleGamingWiki(title) : null,
        isLinux ? getUmuId(appName, runner) : null,
        isMac
          ? ((await getCodeweaversFromIndex(gameInfo)) ??
            getInfoFromCodeweavers(title))
          : isLinux
            ? getInfoFromCodeweavers(title)
            : null
      ])

    // Defensive read. `getInfoFromPCGamingWiki` always returns an object, but a bare
    // `.info` here means any future shape drift throws INSIDE this function's try/catch,
    // whose only recovery is `return null` -- i.e. one sub-lookup misbehaving would wipe
    // applegamingwiki, codeweavers, gamesdb and umuId along with it. Treat an unexpected
    // shape as an error outcome, which is what it is.
    const pcgamingwiki = pcgamingwikiResult?.info ?? null
    const pcgamingwikiOutcome: WikiSourceOutcome =
      pcgamingwikiResult?.outcome ?? 'error'

    // Get HowLongToBeat data, using gog.com site for GOG games, and HLTB ID from PCGamingWiki if available
    const howlongtobeat = await getHowLongToBeat(
      game,
      pcgamingwiki?.howLongToBeatID
    )

    // HLTB's outcome is DERIVED, not reported by its own fetcher, because its failure is
    // usually not its own: it takes its ID from the PCGamingWiki result above, so when
    // that errors HLTB never issues a request at all. Calling that `notfound` would
    // blame HLTB for PCGamingWiki's failure and send a future reader to the wrong
    // module. GOG games resolve HLTB by their own path and so are never `skipped`.
    const howlongtobeatOutcome: HowLongToBeatOutcome = howlongtobeat
      ? 'ok'
      : runner !== 'gog' &&
          !pcgamingwiki?.howLongToBeatID &&
          pcgamingwikiOutcome === 'error'
        ? 'skipped'
        : 'notfound'

    let steamInfo = null
    if (isLinux) {
      // For native Steam games, app_name IS the Steam AppID — use it directly
      // and skip the wiki round-trip. Otherwise fall back to wiki resolution:
      // gamesdb is more accurate since we always query by appName,
      // pcgamingwiki is queried by title in most cases.
      const steamID =
        runner === 'steam' ? appName : gamesdb?.steamID || pcgamingwiki?.steamID
      const [protondb, steamdeck] = await Promise.all([
        getInfoFromProtonDB(steamID),
        getSteamDeckComp(steamID)
      ])

      if (protondb || steamdeck) {
        steamInfo = {
          compatibilityLevel: protondb?.level,
          steamDeckCatagory: steamdeck?.category
        } as SteamInfo
      }
    }

    const wikiGameInfo = {
      pcgamingwiki,
      applegamingwiki,
      codeweavers,
      howlongtobeat,
      gamesdb,
      steamInfo,
      umuId,
      fetchStatus: {
        pcgamingwiki: pcgamingwikiOutcome,
        howlongtobeat: howlongtobeatOutcome
      }
    }

    wikiGameInfoStore.set(title, wikiGameInfo)

    return wikiGameInfo
  } catch (error) {
    logError(
      [`Was not able to get ExtraGameInfo data for ${gameInfo.title}`, error],
      LogPrefix.ExtraGameInfo
    )
    return null
  }
}
