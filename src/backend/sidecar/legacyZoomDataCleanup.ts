/**
 * One-shot removal of the data an older GameLib build kept for the Zoom Platform store.
 *
 * The Zoom store was removed from GameLib (quick-261029-toq). User decision: delete what it left
 * on disk. `<userData>/zoom_store` held the Zoom session token (`.zoom.token`, the file commit
 * `4f0b981e5` re-moded to 0600), `installed.json` and `config.json`. Zoom also wrote two
 * CacheStore files OUTSIDE that folder: `store_cache/zoom_library.json` and
 * `store_cache/zoom_install_info.json`. Games installed into user-chosen directories are NOT
 * touched: they are the user's files, and no code path should guess at them.
 *
 * Sidecar exit contract: this creates no timer, watcher, socket or child handle. Its only
 * in-flight work is three bounded local fs ops on the libuv threadpool, which finish in
 * milliseconds, so it leaves no unbounded work at boot. It never rejects.
 *
 * No "already cleaned" marker: after the first success every later boot is three ENOENT no-ops.
 */
import { promises as fsPromises } from 'graceful-fs'
import { join } from 'node:path'
import { logInfo, logWarning, LogPrefix } from '../logger'

export const LEGACY_ZOOM_PATHS: readonly string[] = [
  'zoom_store',
  'store_cache/zoom_library.json',
  'store_cache/zoom_install_info.json'
]

interface CleanupDeps {
  rm: (path: string, options: { recursive: boolean }) => Promise<void>
}

export async function removeLegacyZoomData(
  userDataPath: string,
  deps: CleanupDeps = { rm: (path, options) => fsPromises.rm(path, options) }
): Promise<void> {
  try {
    for (const rel of LEGACY_ZOOM_PATHS) {
      const target = join(userDataPath, rel)
      try {
        // No `force`: a missing path must reject with ENOENT so a real removal is observable.
        await deps.rm(target, { recursive: true })
        logInfo(`[legacyZoomDataCleanup] removed ${target}`, LogPrefix.Backend)
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
          continue
        }
        logWarning(
          `[legacyZoomDataCleanup] could not remove ${target}: ${String(error)}`,
          LogPrefix.Backend
        )
      }
    }
  } catch (error) {
    logWarning(
      `[legacyZoomDataCleanup] failed: ${String(error)}`,
      LogPrefix.Backend
    )
  }
}
