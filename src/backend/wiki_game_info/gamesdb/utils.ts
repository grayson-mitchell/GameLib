import { GamesDBInfo, Runner } from 'common/types'
import { logInfo, LogPrefix } from 'backend/logger'
import { GamesDBData } from 'common/types/gog'
import { libraryManagerMap } from '../../storeManagers'
import { storeMap } from 'common/utils'

export async function getInfoFromGamesDB(
  title: string,
  appName: string,
  runner: Runner
): Promise<GamesDBInfo | null> {
  logInfo(`Getting GamesDB data for ${title}`, LogPrefix.ExtraGameInfo)

  const storeName = storeMap[runner]
  // A Steam title's own appId already is its Steam ID; this also keeps
  // storeMap.steam = 'steam' (quick 261024-tny) from adding a GOG gamesdb call.
  if (!storeName || runner === 'steam') {
    return { steamID: '' }
  }
  const gamesdb: { data?: GamesDBData } = await libraryManagerMap['gog']
    .getGamesdbData(storeName, appName, true)
    .catch(() => ({ data: undefined }))

  const steamID =
    gamesdb.data?.game.releases.find((entry) => entry.platform_id === 'steam')
      ?.external_id ?? ''

  return {
    steamID
  }
}
