import { TypeCheckedStoreBackend } from '../typed_store'
import { join } from 'node:path'
import { userDataPath } from 'backend/constants/paths'
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
