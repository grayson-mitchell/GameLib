import { GamesDBInfo, Runner } from 'common/types'
import { storeCapabilities } from 'common/storeCapabilities'
import { logInfo, LogPrefix } from 'backend/logger'
import { GamesDBData } from 'common/types/gog'
import type { ManagerDeps } from 'backend/services/types'
import { storeMap } from 'common/utils'

/** The one manager the GamesDB lookup drives (66.1, R3). */
export interface GamesDbDeps {
  libraryManagers: Pick<ManagerDeps['libraryManagers'], 'gog'>
}

export async function getInfoFromGamesDB(
  deps: GamesDbDeps,
  title: string,
  appName: string,
  runner: Runner
): Promise<GamesDBInfo | null> {
  logInfo(`Getting GamesDB data for ${title}`, LogPrefix.ExtraGameInfo)

  const storeName = storeMap[runner]
  // A Steam title's own appId already is its Steam ID; this also keeps
  // storeMap.steam = 'steam' (quick 261024-tny) from adding a GOG gamesdb call.
  if (!storeName || storeCapabilities[runner].appNameIsSteamAppId) {
    return { steamID: '' }
  }
  const gamesdb: { data?: GamesDBData } = await deps.libraryManagers.gog
    .getGamesdbData(storeName, appName, true)
    .catch(() => ({ data: undefined }))

  const steamID =
    gamesdb.data?.game.releases.find((entry) => entry.platform_id === 'steam')
      ?.external_id ?? ''

  return {
    steamID
  }
}
