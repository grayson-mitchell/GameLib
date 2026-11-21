import { isStore } from 'common/storeCapabilities'
import type { Runner, SyncType } from 'common/types'
import type { GOGCloudSavesLocation } from 'common/types/gog'

/**
 * Phase 100 (D-03, D-21): the Cloud saves row's pure helpers and its sync
 * runner. The runner is the try-block body CloudSavesSync's `executeSync` held,
 * moved here with the renderer's `syncSaves` helper injected so this module
 * never imports `frontend/helpers`. It lets a rejection propagate: the row's
 * `useRowAction` owns the failure state and shows fixed text instead of the
 * old error dialog (D-12, D-18).
 */

/** The four existing sync commands, in the order the Sync now menu lists them. */
export const SYNC_TYPES = [
  '--skip-upload',
  '--skip-download',
  '--force-download',
  '--force-upload'
] as const

export type CloudSavesValue = 'unsupported' | 'syncing' | 'auto' | 'manual'

/**
 * Which value the Cloud saves row reads. These are the states that exist
 * today; no last-sync time is recorded anywhere, so none is invented (D-21).
 */
export function cloudSavesValue({
  supported,
  isSyncing,
  autoSync
}: {
  supported: boolean
  isSyncing?: boolean
  autoSync?: boolean
}): CloudSavesValue {
  if (!supported) return 'unsupported'
  if (isSyncing) return 'syncing'
  return autoSync ? 'auto' : 'manual'
}

/** Force download erases local saves and force upload overwrites the cloud's. */
export function needsForceConfirm(syncType: string): boolean {
  return syncType === '--force-download' || syncType === '--force-upload'
}

/**
 * True when the game has no saves folder to sync with: the old `disableItem`.
 * Legendary needs a path, GOG needs at least one location with a path.
 */
export function cloudSavesPathMissing({
  runner,
  savesPath,
  gogSaves
}: {
  runner: Runner
  savesPath: string
  gogSaves: GOGCloudSavesLocation[]
}): boolean {
  return (
    (isStore(runner, 'legendary') && savesPath === '') ||
    (isStore(runner, 'gog') && !gogSaves.some((save) => save.location))
  )
}

interface ExecuteCloudSyncOptions {
  appName: string
  runner: Runner
  syncType: SyncType
  savesPath: string
  gogSaves: GOGCloudSavesLocation[]
  syncSaves: (
    savesPath: string,
    appName: string,
    runner: Runner,
    syncType?: string
  ) => Promise<string>
}

/** Runs one sync. GOG goes through `syncGOGSaves`, the others through `syncSaves`. */
export async function executeCloudSync({
  appName,
  runner,
  syncType,
  savesPath,
  gogSaves,
  syncSaves
}: ExecuteCloudSyncOptions): Promise<void> {
  if (isStore(runner, 'gog')) {
    let locations = gogSaves
    if (!locations.length) {
      locations = (await window.api.getDefaultSavePath(
        appName,
        'gog',
        []
      )) as GOGCloudSavesLocation[]
    }

    await window.api
      .syncGOGSaves(locations, appName, syncType)
      .then((stderr) => {
        window.api.logError(stderr)
      })
    return
  }

  let path = savesPath
  if (!path) {
    path = (await window.api.getDefaultSavePath(
      appName,
      'legendary',
      []
    )) as string
  }

  await syncSaves(path, appName, runner, syncType)
}
