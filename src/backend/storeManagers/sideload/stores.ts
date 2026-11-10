import { TypeCheckedStoreBackend } from '../../typed_store'
import type { StoreRegistry } from 'backend/stores/storeRegistry'

export function createSideloadStores(deps: { registry: StoreRegistry }) {
  const { registry } = deps
  const libraryStore = new TypeCheckedStoreBackend(
    'sideloadedStore',
    {
      cwd: 'sideload_apps',
      name: 'library',
      clearInvalidConfig: true
    },
    { kind: 'user-state' },
    registry
  )

  return { libraryStore }
}
