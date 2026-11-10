import { TypeCheckedStoreBackend } from '../typed_store'
import { join } from 'node:path'
import type { StoreRegistry } from 'backend/stores/storeRegistry'

export function createRunsForMeStores(deps: { registry: StoreRegistry }) {
  const { registry } = deps
  // Read at CALL time, not import time: constants/paths resolves electron's app paths when it is
  // first evaluated, so a static import made importing this module (and so testUtils/testServices)
  // touch the platform shell. The factory is the only consumer.
  type Paths = typeof import('../constants/paths')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { userDataPath } = require('../constants/paths') as Paths
  /**
   * Per-game "Runs for me" override state (quick 261029-mkz). One whole-record
   * `games` map keyed `${appName}_${runner}`; read and written as a unit because
   * electron-store treats dots as path separators and appNames contain dots.
   */
  const runsForMeStore = new TypeCheckedStoreBackend(
    'runsForMeStore',
    {
      cwd: join(userDataPath, 'store'),
      name: 'runs-for-me',
      clearInvalidConfig: true
    },
    { kind: 'user-state' },
    registry
  )

  return { runsForMeStore }
}
