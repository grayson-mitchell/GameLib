/**
 * Per-bottle engine marker (`<bottle>/.gamelib-engine.json`) on the store
 * engine (quick 261109-w52). The top-level numeric `version` IS the engine
 * stamp and is distinct from the nested `dxvk.version` release string.
 * Baseline v1 is the pre-engine `{kind, id, wineserverBin, dxvk?}` shape, so a
 * legacy unversioned marker adopts via the identity step and is not rewritten.
 * Kind is user-state: it is the only record of which DXVK DLLs the engine
 * switch logic installed. No `backend/logger` import (keep this layer
 * logger-free).
 */
import type { StoreVersioning } from './engine'
import type { VersionCodec } from './types'

export const ENGINE_MARKER_CHAIN = 'engine/gamelib-engine-marker' as const

export const engineMarkerCodec: VersionCodec = {
  read(data) {
    const raw = data['version']
    if (raw === undefined) return 0
    if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) return raw
    process.stderr.write(
      '[storeVersion] invalid engine marker version, treating as 0\n'
    )
    return 0
  },
  write: (data, version) => ({ ...data, version })
}

export function ensureEngineMarkerMigrated(
  versioning: StoreVersioning,
  path: string
): void {
  versioning.prepareStoreFile(
    path,
    ENGINE_MARKER_CHAIN,
    { kind: 'user-state' },
    engineMarkerCodec
  )
}

export function isEngineMarkerReadOnly(
  versioning: StoreVersioning,
  path: string
): boolean {
  return versioning.isReadOnlyPath(path)
}

export function engineMarkerVersion(versioning: StoreVersioning): number {
  return versioning.currentVersionOf(ENGINE_MARKER_CHAIN)
}
