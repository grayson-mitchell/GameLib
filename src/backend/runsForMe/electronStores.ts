import { TypeCheckedStoreBackend } from '../electron_store'
import { join } from 'node:path'
import { userDataPath } from 'backend/constants/paths'

/**
 * Per-game "Runs for me" override state (quick 261029-mkz). One whole-record
 * `games` map keyed `${appName}_${runner}`; read and written as a unit because
 * electron-store treats dots as path separators and appNames contain dots.
 */
export const runsForMeStore = new TypeCheckedStoreBackend('runsForMeStore', {
  cwd: join(userDataPath, 'store'),
  name: 'runs-for-me',
  clearInvalidConfig: true
})
