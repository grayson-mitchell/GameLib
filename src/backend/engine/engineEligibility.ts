/**
 * Phase 61: the one eligibility test for the engine layer, shared by the launch step
 * (launchEngine.ts) and the Wine tools resolver (toolSettings.ts) so the two cannot disagree on
 * which games the engine controls. A leaf: no spawning, nothing runs at import.
 */
import type { Game } from 'common/types/game_manager'
import { hasCapability } from 'common/storeCapabilities'
import { engineKeyFor } from './gameKey'
import type { EngineKey } from './gameKey'

/**
 * The game's engine key when the engine layer applies; null for a native game, a Browser install,
 * a non-macOS host, a bottle-runtime store (Steam) or an unusable key.
 */
export function engineKeyIfEligible(
  game: Game,
  onMac: boolean
): EngineKey | null {
  if (!onMac || game.isNative()) return null
  const info = game.getGameInfo()
  if (info.install?.platform === 'Browser') return null
  if (hasCapability(info.runner, 'usesBottleRuntime')) return null
  return engineKeyFor(info.runner, info.app_name)
}
