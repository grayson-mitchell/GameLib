import CacheStore from 'backend/cache'
import { TypeCheckedStoreBackend } from 'backend/typed_store'
import { GameInfo } from 'common/types'
import { NileInstallInfo } from 'common/types/nile'
import type { StoreFamilyDeps } from 'backend/stores/storeRoot'

export function createNileStores(deps: StoreFamilyDeps) {
  const installStore = new CacheStore<NileInstallInfo>(
    'nile_install_info',
    undefined,
    { root: deps.root, kind: 'cache' }
  )
  const libraryStore = new CacheStore<GameInfo[], 'library'>(
    'nile_library',
    null,
    { root: deps.root, kind: 'user-state' }
  )
  const configStore = new TypeCheckedStoreBackend(
    'nileConfigStore',
    {
      cwd: 'nile_store'
    },
    { kind: 'user-state' },
    deps
  )

  return { installStore, libraryStore, configStore }
}
