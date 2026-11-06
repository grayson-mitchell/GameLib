import type { GameInfo } from '../../types'

// ts-prune-ignore-next
export interface GogFrontendMessages {
  pushGameToLibrary: (info: GameInfo) => void
}
