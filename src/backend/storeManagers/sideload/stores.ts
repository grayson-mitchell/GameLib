import { TypeCheckedStoreBackend } from '../../typed_store'
import type { StoreFamilyDeps } from 'backend/stores/storeRoot'

export function createSideloadStores(deps: StoreFamilyDeps) {
  const libraryStore = new TypeCheckedStoreBackend(
    'sideloadedStore',
    {
      cwd: 'sideload_apps',
      name: 'library',
      clearInvalidConfig: true
    },
    { kind: 'user-state' },
    deps
  )

  return { libraryStore }
}
