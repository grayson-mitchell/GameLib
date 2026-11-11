import { TypeCheckedStoreBackend } from '../typed_store'
import type { StoreFamilyDeps } from 'backend/stores/storeRoot'

export function createKvsStores(deps: StoreFamilyDeps) {
  const configStore = new TypeCheckedStoreBackend(
    'configStore',
    {
      cwd: 'store'
    },
    { kind: 'user-state' },
    deps
  )
  const tsStore = new TypeCheckedStoreBackend(
    'timestampStore',
    {
      cwd: 'store',
      name: 'timestamp'
    },
    { kind: 'user-state' },
    deps
  )

  return { configStore, tsStore }
}
