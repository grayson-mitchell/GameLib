/**
 * The installed Wine Manager release list, read from an injected store (66.1-22i). A leaf module:
 * type-only imports, so the sidecar flow registrations can use it without loading the engine
 * decision graph (and its path constants).
 */
import type { Stores } from 'backend/services/types'

export interface WineManagerRelease {
  version: string
  type: string
  isInstalled: boolean
  installDir: string
}

/** Same store key ('wine-releases') and default ([]) the engine always read. */
export function wineManagerReleasesFrom(deps: {
  stores: Pick<Stores, 'wineManager'>
}): () => WineManagerRelease[] {
  return () =>
    deps.stores.wineManager.wineDownloaderInfoStore.get(
      'wine-releases',
      []
    ) as unknown as WineManagerRelease[]
}
