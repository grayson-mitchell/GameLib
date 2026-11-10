/**
 * TEMPORARY (66.1, A3 expand/contract): identity facades that only GROUP today's singletons
 * and functions into the per-boot `BootServices` shapes. Nothing is constructed here, so the
 * behaviour is unchanged; consumers convert once onto the slices and each owner plan later
 * swaps its facade for the real factory.
 *
 * Deletion schedule: command runner (plan 05), spawnAsync and quit (plan 06), tools and spawn
 * shims (plan 22f), managers and launcher (plan 23), stores (plan 25). The file is deleted by
 * plan 25 with the last one.
 *
 * Everything is inside a function: no top-level `let`/`const` binding for the ratchet.
 */
import * as kvs from 'backend/constants/key_value_stores'
import * as crossoverIndex from 'backend/crossover_index/stores'
import * as downloadManager from 'backend/downloadmanager/stores'
import * as gameOverrides from 'backend/game_overrides/stores'
import * as humble from 'backend/humble/stores'
import * as loggerStores from 'backend/logger/stores'
import * as macArch from 'backend/macArch/stores'
import * as migration from 'backend/migration/stores'
import * as runsForMe from 'backend/runsForMe/stores'
import * as gog from 'backend/storeManagers/gog/stores'
import * as legendary from 'backend/storeManagers/legendary/stores'
import * as nile from 'backend/storeManagers/nile/stores'
import * as sideload from 'backend/storeManagers/sideload/stores'
import * as steam from 'backend/storeManagers/steam/stores'
import * as wikiGameInfo from 'backend/wiki_game_info/stores'
import * as wineManager from 'backend/wine/manager/stores'
import type { Stores } from './types'

export function buildStoresFacade(): Stores {
  return {
    kvs,
    crossoverIndex,
    downloadManager,
    gameOverrides,
    humble,
    logger: loggerStores,
    macArch,
    migration,
    runsForMe,
    gog,
    legendary,
    nile,
    sideload,
    steam,
    wikiGameInfo,
    wineManager
  }
}
