import CacheStore from 'backend/cache'
import { TypeCheckedStoreBackend } from 'backend/typed_store'
import { GameInfo } from 'common/types'
import { NileInstallInfo } from 'common/types/nile'
import type { StoreRegistry } from 'backend/stores/storeRegistry'

export function createNileStores(deps: { registry: StoreRegistry }) {
  const { registry } = deps
  const installStore = new CacheStore<NileInstallInfo>(
    'nile_install_info',
    undefined,
    { kind: 'cache' }
  )
  const libraryStore = new CacheStore<GameInfo[], 'library'>(
    'nile_library',
    null,
    { kind: 'user-state' }
  )
  const configStore = new TypeCheckedStoreBackend(
    'nileConfigStore',
    {
      cwd: 'nile_store'
    },
    { kind: 'user-state' },
    registry
  )

  return { installStore, libraryStore, configStore }
}
