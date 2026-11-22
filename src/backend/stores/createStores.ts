/**
 * The stores contract (66.1 plan 25, A3): one factory per store family, all built against the
 * boot's registry. Nothing here runs at import; the boot's 'stores' step is the only
 * construction path, and the registry it passes is the one the name-keyed RPC handlers resolve
 * stores through.
 */
import { createKvsStores } from 'backend/constants/key_value_stores'
import { createCrossoverIndexStores } from 'backend/crossover_index/stores'
import { createDownloadManagerStores } from 'backend/downloadmanager/stores'
import { createHumbleStores } from 'backend/humble/stores'
import { createMacArchStores } from 'backend/macArch/stores'
import { createStoreSearchStores } from 'backend/storeSearch/stores'
import { createRunsForMeStores } from 'backend/runsForMe/stores'
import { createGogStores } from 'backend/storeManagers/gog/stores'
import { createLegendaryStores } from 'backend/storeManagers/legendary/stores'
import { createNileStores } from 'backend/storeManagers/nile/stores'
import { createSideloadStores } from 'backend/storeManagers/sideload/stores'
import { createSteamStores } from 'backend/storeManagers/steam/stores'
import { createWikiGameInfoStores } from 'backend/wiki_game_info/stores'
import { createWineManagerStores } from 'backend/wine/manager/stores'
import type { Stores } from 'backend/services/types'
import { createEngineStores } from 'backend/engine/engineNoticeStore'
import { createPciIdCaches } from 'backend/utils/systeminfo/gpu/pci_ids'
import type { StoreFamilyDeps } from './storeRoot'

export function createStores(deps: StoreFamilyDeps): Stores {
  return {
    kvs: createKvsStores(deps),
    crossoverIndex: createCrossoverIndexStores(deps),
    storeSearch: createStoreSearchStores(deps),
    downloadManager: createDownloadManagerStores(deps),
    humble: createHumbleStores(deps),
    macArch: createMacArchStores(deps),
    runsForMe: createRunsForMeStores(deps),
    gog: createGogStores(deps),
    legendary: createLegendaryStores(deps),
    nile: createNileStores(deps),
    sideload: createSideloadStores(deps),
    steam: createSteamStores(deps),
    wikiGameInfo: createWikiGameInfoStores(deps),
    wineManager: createWineManagerStores(deps),
    engine: createEngineStores(deps),
    systemInfo: createPciIdCaches(deps)
  }
}
