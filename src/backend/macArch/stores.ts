import { TypeCheckedStoreBackend } from '../typed_store'
import { join } from 'node:path'
import type { StoreFamilyDeps } from 'backend/stores/storeRoot'

export function createMacArchStores(deps: StoreFamilyDeps) {
  /**
   * Persisted macOS arch verdicts for non-Steam runners (quick 261029-t39). One
   * whole-record `verdicts` map keyed `${runner}:${appName}`; read and written as
   * a unit because electron-store treats dots as path separators and appNames
   * can contain dots. Backend-only: the frontend receives `mac_arch` through the
   * GOG/Epic library stores, so it is not in `StoreStructure`'s snapshot lists; it still joins the registry, as it did
   * when the module was imported by the sidecar's handlers.
   */
  const macArchStore = new TypeCheckedStoreBackend(
    'macArchStore',
    {
      cwd: join(deps.root.userData, 'store'),
      name: 'mac-arch',
      clearInvalidConfig: true
    },
    { kind: 'user-state' },
    deps
  )

  return { macArchStore }
}
