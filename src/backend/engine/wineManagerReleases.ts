/**
 * The installed Wine Manager release list (66.1-22i), read from the Rust-owned `wine-downloader-info` store
 * (Phase 87: the wine manager and its store are Rust's; the TS store mirror was deleted in 87-37). The engine's
 * decisions read the list synchronously, so this reads the store's JSON file directly, the file Rust writes:
 * `<userData>/store/wine-downloader-info.json`, key `wine-releases`. A missing, unreadable or mis-shaped file is
 * the empty list, as the cache store was (a cache store discards a shape it does not know). A leaf module:
 * 87-56 deletes the engine TS and this reader with it.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { AppPaths } from 'backend/process/context'

export interface WineManagerRelease {
  version: string
  type: string
  isInstalled: boolean
  installDir: string
}

/** Same store key ('wine-releases') and default ([]) the engine always read. */
export function wineManagerReleasesFrom(deps: {
  paths: Pick<AppPaths, 'userData'>
}): () => WineManagerRelease[] {
  return () => {
    const file = join(deps.paths.userData, 'store', 'wine-downloader-info.json')
    try {
      const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
      const releases = (parsed as Record<string, unknown> | null)?.[
        'wine-releases'
      ]
      return Array.isArray(releases) ? (releases as WineManagerRelease[]) : []
    } catch {
      return []
    }
  }
}
