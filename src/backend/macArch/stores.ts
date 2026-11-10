import { TypeCheckedStoreBackend } from '../typed_store'
import { join } from 'node:path'
import type { StoreRegistry } from 'backend/stores/storeRegistry'
import { userDataPath } from 'backend/constants/paths'

export function createMacArchStores(deps: { registry: StoreRegistry }) {
  const { registry } = deps
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
      cwd: join(userDataPath, 'store'),
      name: 'mac-arch',
      clearInvalidConfig: true
    },
    { kind: 'user-state' },
    registry
  )

  return { macArchStore }
}
