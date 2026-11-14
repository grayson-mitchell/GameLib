import type { GameInfoCore } from 'common/types'

/**
 * Phase 70 (D-01, D-04, D-13): a sideloaded (non-store) game. The browser and
 * launch-presentation fields are sideload-only.
 */
export interface SideloadGameInfo extends GameInfoCore {
  runner: 'sideload'
  browserUrl?: string
  customUserAgent?: string
  launchFullScreen?: boolean
}
