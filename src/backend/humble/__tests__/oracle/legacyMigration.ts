/**
 * The TypeScript one-time Humble plaintext-to-keyring migration, kept ONLY as the oracle's reference.
 *
 * Phase 94 (D-18, 94-21) moved the migration to Rust (`gamelib_humble::secrets::migrate_plaintext`, started
 * at boot by `start_humble_migration`), and `sidecar/humbleSecretStore.ts` no longer migrates. The secrets
 * goldens under `gamelib-humble/tests/fixtures/golden/secrets` were recorded from this exact code, and
 * `secretsAlerts.oracle.test.ts` still regenerates and compares them, so the code lives on here, under
 * `__tests__`, not in the shipped sidecar. It is deleted with the rest of the oracle by 94-30.
 *
 * Order of operations is the whole design and MUST NOT be reordered (D-GAP-01/T-34.4.1-57): read the
 * configStore plaintext -> write it to the keyring -> read it back -> compare -> only on an EXACT match,
 * delete the configStore key and clear `encryptionDegraded`.
 */

import { logWarning, LogPrefix } from '../../../logger'
import type { RequestRustInvoke } from '../../../host'
import {
  RUST_KEYRING_GET,
  RUST_KEYRING_SET
} from 'common/types/sidecarTransport'
import {
  KEYRING_SLOT_HUMBLE_SESSION,
  KEYRING_SLOT_HUMBLE_CSRF
} from '../../../sidecar/keyringTokenStore'
import type { SidecarHumbleSecretStore } from '../../../sidecar/humbleSecretStore'
import type { HumbleSecretKey } from '../../secretStore'
import type { Stores } from '../../../services/types'
import { HUMBLE_TOKEN_STORE_KEY } from '../../constants'

/** What the migration reads and writes: the humble config store family. */
export interface HumbleMigrationDeps {
  stores: Pick<Stores, 'humble'>
  requestRustInvoke: RequestRustInvoke
}

const MIGRATION_TARGETS: Record<
  HumbleSecretKey,
  { configKey: 'sessionCookie' | 'csrfToken'; slot: string }
> = {
  sessionCookie: {
    configKey: HUMBLE_TOKEN_STORE_KEY,
    slot: KEYRING_SLOT_HUMBLE_SESSION
  },
  csrfToken: { configKey: 'csrfToken', slot: KEYRING_SLOT_HUMBLE_CSRF }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function migrateOneSecret(
  store: Pick<SidecarHumbleSecretStore, 'invalidateCache'>,
  deps: HumbleMigrationDeps,
  key: HumbleSecretKey
): Promise<void> {
  const { configKey, slot } = MIGRATION_TARGETS[key]

  const plaintext = deps.stores.humble.configStore.get_nodefault(configKey)
  if (!plaintext || typeof plaintext !== 'string') return

  try {
    await deps.requestRustInvoke(RUST_KEYRING_SET, [plaintext, slot])
  } catch (error) {
    logWarning(
      `Humble secret migration (${key}): keyring write failed, leaving plaintext in place: ${errorMessage(error)}`,
      LogPrefix.Backend
    )
    return
  }

  // The write bypassed the slot store's own setToken(), so its cache is stale and must be dropped
  // for the read back below to be a real keyring round trip.
  store.invalidateCache(key)

  let readback: unknown
  try {
    readback = await deps.requestRustInvoke(RUST_KEYRING_GET, [slot])
  } catch (error) {
    logWarning(
      `Humble secret migration (${key}): keyring readback failed, leaving plaintext in place: ${errorMessage(error)}`,
      LogPrefix.Backend
    )
    return
  }

  if (readback !== plaintext) {
    logWarning(
      `Humble secret migration (${key}): keyring readback did not match the written value, leaving plaintext in place`,
      LogPrefix.Backend
    )
    return
  }

  deps.stores.humble.configStore.delete(configKey)
  deps.stores.humble.configStore.set('encryptionDegraded', false)
}

/** Runs the migration for both secrets, independently. */
export async function migrateHumbleSecrets(
  store: Pick<SidecarHumbleSecretStore, 'invalidateCache'>,
  deps: HumbleMigrationDeps
): Promise<void> {
  await migrateOneSecret(store, deps, 'sessionCookie')
  await migrateOneSecret(store, deps, 'csrfToken')
}
