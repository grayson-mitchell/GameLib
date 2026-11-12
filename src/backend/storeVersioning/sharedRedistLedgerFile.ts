/**
 * Per-bottle shared-redist ledger (`<bottle>/gamelib-shared-redists.json`) on
 * the store engine (quick 261109-uv4). The top-level numeric `version` IS the
 * engine stamp: baseline v1 is the pre-engine hand-rolled `version: 1`, so
 * adopting an existing ledger rewrites nothing. Modelled on settingsFiles.ts.
 * No `backend/logger` import (keep the storeVersioning layer logger-free).
 */
import type { StoreVersioning } from './engine'
import type { VersionCodec } from './types'

/** Fixed chain key; engine state is keyed by path, so it serves every bottle. */
export const SHARED_REDIST_LEDGER_CHAIN = 'steam_bridge/shared-redists' as const

export const sharedRedistLedgerCodec: VersionCodec = {
  read(data) {
    const raw = data['version']
    if (raw === undefined) return 0
    if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) return raw
    process.stderr.write(
      '[storeVersion] invalid shared redist ledger version, treating as 0\n'
    )
    return 0
  },
  write: (data, version) => ({ ...data, version })
}

export function ensureSharedRedistLedgerMigrated(
  versioning: StoreVersioning,
  path: string
): void {
  versioning.prepareStoreFile(
    path,
    SHARED_REDIST_LEDGER_CHAIN,
    { kind: 'user-state' },
    sharedRedistLedgerCodec
  )
}

export function isSharedRedistLedgerReadOnly(
  versioning: StoreVersioning,
  path: string
): boolean {
  return versioning.isReadOnlyPath(path)
}

export function sharedRedistLedgerVersion(versioning: StoreVersioning): number {
  return versioning.currentVersionOf(SHARED_REDIST_LEDGER_CHAIN)
}
