import { TypeCheckedStoreBackend } from '../typed_store'
import { join } from 'node:path'
import type { StoreRegistry } from 'backend/stores/storeRegistry'

/**
 * Store for custom game metadata overrides (title, images)
 * These overrides are applied on top of the game info from the store
 */
export interface GameMetadataOverride {
  title?: string
  art_cover?: string
  art_square?: string
}

export function createGameOverridesStores(deps: { registry: StoreRegistry }) {
  const { registry } = deps
  // Read at CALL time, not import time: constants/paths resolves electron's app paths when it is
  // first evaluated, so a static import made importing this module (and so testUtils/testServices)
  // touch the platform shell. The factory is the only consumer.
  type Paths = typeof import('../constants/paths')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { userDataPath } = require('../constants/paths') as Paths
  const gameOverridesStore = new TypeCheckedStoreBackend(
    'gameOverridesStore',
    {
      cwd: join(userDataPath, 'store'),
      name: 'game-overrides',
      clearInvalidConfig: true
    },
    { kind: 'user-state' },
    registry
  )

  return { gameOverridesStore }
}
