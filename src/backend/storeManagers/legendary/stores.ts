import CacheStore from '../../cache'
import { TypeCheckedStoreBackend } from 'backend/typed_store'
import { ExtraInfo, GameInfo } from 'common/types'
import { GameOverride, LegendaryInstallInfo } from 'common/types/legendary'
import type { StoreRegistry } from 'backend/stores/storeRegistry'

export function createLegendaryStores(deps: { registry: StoreRegistry }) {
  const { registry } = deps
  const installStore = new CacheStore<LegendaryInstallInfo>(
    'legendary_install_info',
    undefined,
    { kind: 'cache' }
  )
  const libraryStore = new CacheStore<GameInfo[], 'library'>(
    'legendary_library',
    null,
    { kind: 'user-state' }
  )
  /**
   * Store for the games override
   * Lasts for 7 days
   * @type {CacheStore<GameOverride, 'gamesOverride'>}
   * @memberof module:storeManagers/legendary
   * @inner
   * @instance
   **/
  const gamesOverrideStore: CacheStore<GameOverride, 'gamesOverride'> =
    new CacheStore<GameOverride, 'gamesOverride'>(
      'legendary_games_override',
      60 * 24 * 7,
      { kind: 'cache' }
    )
  const gameInfoStore = new CacheStore<ExtraInfo>(
    'legendary_gameinfo',
    undefined,
    { kind: 'cache' }
  )
  /**
   * Epic's persisted sign-in verdict (`expired`) — Phase 49 D-05.
   *
   * Deliberately NOT named `configStore`: `legendary/user.ts` already imports the
   * GLOBAL `configStore`, and this store lives in its own `legendary_store`
   * directory, distinct from `legendaryConfigPath` (legendary's own data dir), so
   * legendary can never see or delete it.
   */
  const legendaryConfigStore = new TypeCheckedStoreBackend(
    'legendaryConfigStore',
    { cwd: 'legendary_store' },
    { kind: 'user-state' },
    registry
  )

  return {
    installStore,
    libraryStore,
    gamesOverrideStore,
    gameInfoStore,
    legendaryConfigStore
  }
}
