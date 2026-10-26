/**
 * Quick 261027-ch9: pure display decision for the game page's GameLib row
 * (zero React imports, jsdom-free, same pattern as `bridgeRouteDisplay.ts`).
 *
 * Locked rules: the row shows only for a bundled or local known-fix (the
 * backend never reports the remote layer), and it is a tick, not a rating.
 */
import type { GamelibFixStatus } from 'common/types'

export interface GamelibFixDisplay {
  visible: boolean
  launchNotice: string | null
}

export function resolveGamelibFixDisplay(
  status: GamelibFixStatus | null | undefined
): GamelibFixDisplay {
  if (status?.origin !== 'local' && status?.origin !== 'bundled') {
    return { visible: false, launchNotice: null }
  }
  const notice =
    typeof status.launchNotice === 'string' ? status.launchNotice.trim() : ''
  return { visible: true, launchNotice: notice || null }
}
