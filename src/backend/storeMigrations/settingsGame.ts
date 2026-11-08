/**
 * `settings/game` (GamesConfig/<app>.json) migration chain (Phase 68, D-10).
 *
 * Shape unchanged: the step exists so per-game files carry 'v1' from their
 * next real write, and an older build sees them as newer only after a real
 * shape change. Identity steps never rewrite a file.
 */
import type { Migration } from '../storeVersioning/types'

export const settingsGameChain: readonly Migration[] = [
  { id: 'settings-game-v0-v1', to: 1, identity: true, run: (d) => d }
]
