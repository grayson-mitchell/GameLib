import { TypeCheckedStoreBackend } from '../typed_store'
import type { StoreRegistry } from 'backend/stores/storeRegistry'

export function createKvsStores(deps: { registry: StoreRegistry }) {
  const { registry } = deps
  const configStore = new TypeCheckedStoreBackend(
    'configStore',
    {
      cwd: 'store'
    },
    { kind: 'user-state' },
    registry
  )
  const tsStore = new TypeCheckedStoreBackend(
    'timestampStore',
    {
      cwd: 'store',
      name: 'timestamp'
    },
    { kind: 'user-state' },
    registry
  )

  return { configStore, tsStore }
}
