import type { GameInfo } from '../../types'

export interface GogFrontendMessages {
  pushGameToLibrary: (info: GameInfo) => void
}
