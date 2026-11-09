/**
 * Mac Steam owed-goonline marker (`<appFolder>/mac-steam-offline-owed.json`) on
 * the store engine (quick 261109-vw2). The top-level numeric `version` IS the
 * engine stamp; baseline v1 is the pre-engine `{since, by, pid}` shape, so a
 * legacy unversioned file adopts via the identity step and is not rewritten.
 * Kind is user-state: it is the only record that Mac Steam was taken offline on
 * the user's behalf. No `backend/logger` import (keep this layer logger-free).
 */
import { currentVersionOf } from '../storeMigrations'
import { isReadOnlyPath, prepareStoreFile } from './engine'
import type { VersionCodec } from './types'

export const MAC_STEAM_OFFLINE_OWED_CHAIN =
  'steam/mac-steam-offline-owed' as const

export const macSteamOfflineOwedCodec: VersionCodec = {
  read(data) {
    const raw = data['version']
    if (raw === undefined) return 0
    if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) return raw
    process.stderr.write(
      '[storeVersion] invalid mac steam offline owed version, treating as 0\n'
    )
    return 0
  },
  write: (data, version) => ({ ...data, version })
}

export function ensureMacSteamOfflineOwedMigrated(path: string): void {
  prepareStoreFile(
    path,
    MAC_STEAM_OFFLINE_OWED_CHAIN,
    { kind: 'user-state' },
    macSteamOfflineOwedCodec
  )
}

export function isMacSteamOfflineOwedReadOnly(path: string): boolean {
  return isReadOnlyPath(path)
}

export function macSteamOfflineOwedVersion(): number {
  return currentVersionOf(MAC_STEAM_OFFLINE_OWED_CHAIN)
}
