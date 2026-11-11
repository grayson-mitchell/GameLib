import { TypeCheckedStoreBackend } from '../typed_store'
import { join } from 'node:path'
import type { StoreFamilyDeps } from 'backend/stores/storeRoot'

export function createRunsForMeStores(deps: StoreFamilyDeps) {
  /**
   * Per-game "Runs for me" override state (quick 261029-mkz). One whole-record
   * `games` map keyed `${appName}_${runner}`; read and written as a unit because
   * electron-store treats dots as path separators and appNames contain dots.
   */
  const runsForMeStore = new TypeCheckedStoreBackend(
    'runsForMeStore',
    {
      cwd: join(deps.root.userData, 'store'),
      name: 'runs-for-me',
      clearInvalidConfig: true
    },
    { kind: 'user-state' },
    deps
  )

  return { runsForMeStore }
}
