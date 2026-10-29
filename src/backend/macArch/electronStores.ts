import { TypeCheckedStoreBackend } from '../electron_store'
import { join } from 'node:path'
import { userDataPath } from 'backend/constants/paths'

/**
 * Persisted macOS arch verdicts for non-Steam runners (quick 261029-t39). One
 * whole-record `verdicts` map keyed `${runner}:${appName}`; read and written as
 * a unit because electron-store treats dots as path separators and appNames
 * can contain dots. Backend-only: the frontend receives `mac_arch` through the
 * GOG/Epic library stores, so this is not registered in storeRegistration.
 */
export const macArchStore = new TypeCheckedStoreBackend('macArchStore', {
  cwd: join(userDataPath, 'store'),
  name: 'mac-arch',
  clearInvalidConfig: true
})
