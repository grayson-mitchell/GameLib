import { TypeCheckedStoreBackend } from '../../typed_store'
import CacheStore from '../../cache'
import { GameInfo, GOGAchievement } from 'common/types'
import {
  GOGSessionSyncQueueItem,
  GamesDBData,
  GogInstallInfo
} from 'common/types/gog'

const installedGamesStore = new TypeCheckedStoreBackend(
  'gogInstalledGamesStore',
  {
    cwd: 'gog_store',
    name: 'installed'
  },
  { kind: 'user-state' }
)

const configStore = new TypeCheckedStoreBackend(
  'gogConfigStore',
  {
    cwd: 'gog_store'
  },
  { kind: 'user-state' }
)

const apiInfoCache = new CacheStore<GamesDBData>('gog_api_info', undefined, {
  kind: 'cache'
})
const libraryStore = new CacheStore<GameInfo[], 'games'>('gog_library', null, {
  kind: 'user-state'
})
const achievementStore = new CacheStore<GOGAchievement[]>(
  'gog_achievements',
  null,
  { kind: 'cache' }
)
const syncStore = new TypeCheckedStoreBackend(
  'gogSyncStore',
  {
    cwd: 'gog_store',
    name: 'saveTimestamps',
    clearInvalidConfig: true
  },
  { kind: 'user-state' }
)

const installInfoStore = new CacheStore<GogInstallInfo>(
  'gog_install_info',
  undefined,
  { kind: 'cache' }
)

const privateBranchesStore = new TypeCheckedStoreBackend(
  'gogPrivateBranches',
  {
    cwd: 'gog_store',
    name: 'privateBranches',
    clearInvalidConfig: true
  },
  { kind: 'user-state' }
)

const playtimeSyncQueue = new CacheStore<Array<GOGSessionSyncQueueItem>>(
  'gog_playtime_sync_queue',
  undefined,
  { kind: 'user-state' }
)

export {
  configStore,
  installedGamesStore,
  apiInfoCache,
  libraryStore,
  achievementStore,
  syncStore,
  installInfoStore,
  playtimeSyncQueue,
  privateBranchesStore
}
