import { TypeCheckedStoreBackend } from '../typed_store'
import { join } from 'node:path'
import type { StoreFamilyDeps } from 'backend/stores/storeRoot'

/**
 * Store for custom game metadata overrides (title, images)
 * These overrides are applied on top of the game info from the store
 */
export interface GameMetadataOverride {
  title?: string
  art_cover?: string
  art_square?: string
}

export function createGameOverridesStores(deps: StoreFamilyDeps) {
  const gameOverridesStore = new TypeCheckedStoreBackend(
    'gameOverridesStore',
    {
      cwd: join(deps.root.userData, 'store'),
      name: 'game-overrides',
      clearInvalidConfig: true
    },
    { kind: 'user-state' },
    deps
  )

  return { gameOverridesStore }
}
