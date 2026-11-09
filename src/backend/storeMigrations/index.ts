/**
 * Per-store migration registry (Phase 68). Pure: no fs, no logger.
 *
 * Keyed by chain key, `<directory basename>/<file name without .json>`
 * (e.g. `store/config`, `steam_store/config`, `store_cache/steam_library`).
 * Phase 68 ships no conf-store shape change, so every conf store sits at the
 * baseline version 1 with the implicit identity adoption step.
 */

import type { Migration, VersionCodec } from '../storeVersioning/types'
import { settingsGameChain } from './settingsGame'
import { settingsGlobalChain } from './settingsGlobal'

export const STORE_MIGRATIONS: Readonly<Record<string, readonly Migration[]>> =
  {
    'settings/global': settingsGlobalChain,
    'settings/game': settingsGameChain,
    // baseline v1 = the pre-engine hand-rolled `version: 1`; codec in
    // storeVersioning/sharedRedistLedgerFile.ts
    'steam_bridge/shared-redists': [],
    // baseline v1 = the pre-engine `{since, by, pid}`; codec in
    // storeVersioning/macSteamOfflineOwedFile.ts
    'steam/mac-steam-offline-owed': [],
    // baseline v1 = the pre-engine `{kind, id, wineserverBin, dxvk?}`; codec in
    // storeVersioning/engineMarkerFile.ts
    'engine/gamelib-engine-marker': []
  }

const testOverrides = new Map<string, readonly Migration[] | undefined>()

/** Test-only: override (or with `undefined`, clear) a chain. */
export function __setMigrationsForTest(
  chainKey: string,
  chain: readonly Migration[] | undefined
): void {
  if (chain === undefined) testOverrides.delete(chainKey)
  else testOverrides.set(chainKey, chain)
}

function chainOf(chainKey: string): readonly Migration[] {
  if (testOverrides.has(chainKey)) return testOverrides.get(chainKey) ?? []
  return STORE_MIGRATIONS[chainKey] ?? []
}

export function currentVersionOf(chainKey: string): number {
  return Math.max(1, ...chainOf(chainKey).map((m) => m.to))
}

const ADOPT_V1: Migration = {
  id: 'adopt-v1',
  to: 1,
  identity: true,
  run: (d) => d
}

export function pendingChain(
  chainKey: string,
  fromVersion: number
): Migration[] {
  const chain = chainOf(chainKey)
  const steps = chain
    .filter((m) => m.to > fromVersion)
    .sort((a, b) => a.to - b.to)
  const declaresV1 = chain.some((m) => m.to === 1)
  if (fromVersion < 1 && !declaresV1) return [ADOPT_V1, ...steps]
  return steps
}

type Internal = { gamelib?: { schemaVersion?: unknown } }

export const storeVersionCodec: VersionCodec = {
  read(data) {
    const internal = data.__internal__ as Internal | undefined
    const raw = internal?.gamelib?.schemaVersion
    if (raw === undefined) return 0
    if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) return raw
    process.stderr.write(
      '[storeVersion] invalid schemaVersion value, treating as 0\n'
    )
    return 0
  },
  write(data, version) {
    const internal = (data.__internal__ ?? {}) as Record<string, unknown>
    const gamelib = (internal.gamelib ?? {}) as Record<string, unknown>
    return {
      ...data,
      __internal__: {
        ...internal,
        gamelib: { ...gamelib, schemaVersion: version }
      }
    }
  }
}
