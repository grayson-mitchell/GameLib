/**
 * `SidecarHumbleSecretStore` — the Tauri sidecar's keyring-backed implementation of Humble's
 * `HumbleSecretStore` seam (Phase 34.4.1 gap-cycle plan 13, closing F-1 BLOCKING /
 * REQ-34.4.1-02 / REQ-34.4.1-GAP-02).
 *
 * `humble/secretStore.ts` (plan 12) defines the seam and installs `ElectronHumbleSecretStore`
 * (plaintext-under-Tauri, since the sidecar's `safeStorage` stub is hardcoded dead) as its
 * DEFAULT — a build that fails to install its own implementation silently keeps that default.
 * This module is the sidecar's own implementation: it binds `sessionCookie` to the
 * `humble-session` keyring slot and `csrfToken` to the `humble-csrf` slot, both allowlisted by
 * plan 11 (`keyringTokenStore.ts`), and installs itself via `installSidecarHumbleSecretStore()`
 * — the same install-site convention `bootstrap.ts` already uses for Steam's
 * `SidecarKeyringTokenStore`.
 *
 * Totality discipline mirrored EXACTLY from `SidecarKeyringSlotStore` (plan 11): every method
 * is total (never rejects/throws to its caller), a `null` `keyring_get` result is the healthy
 * first-run case (not logged), and a genuine failure logs exactly one warning naming the
 * channel — never the secret value. There is no fallback of any kind here (D-08/REQ-28-07) —
 * a keyring failure is a failure; the one-time plaintext migration (this module, added by this
 * plan's Task 2) is a distinct, separately-guarded concern layered on top, not a fallback
 * baked into this store's own methods.
 *
 * Import discipline: this module imports the slot-name constants from `keyringTokenStore.ts`
 * rather than retyping the literals `'humble-session'`/`'humble-csrf'` — a drift between the TS
 * literal and Rust's `keyring_account()` allowlist (`src-tauri/src/main.rs`) would otherwise
 * surface only at runtime as `keyring:unknown-slot`, nowhere earlier.
 *
 * **Read caching is inherited, not reimplemented (34.4.1 gap cycle 2 plan 26, F-9's read-count
 * half — user-approved scope widening, see `34.4.1-26-SUMMARY.md`).** `SLOT_STORES` below holds
 * exactly ONE `SidecarKeyringSlotStore` per secret, created once at module load and reused for
 * the sidecar's entire lifetime — every `getSecret`/`setSecret`/`isAvailable`/`clearSecrets` call
 * across the whole process, regardless of how many `SidecarHumbleSecretStore` wrapper instances
 * exist, hits the SAME two slot-store instances. `SidecarKeyringSlotStore`'s own cache + in-flight
 * dedupe (see its doc comment) therefore applies here for free: `storeHumbleSecret()`'s
 * `isAvailable()` probe after every write, and every `HumbleUser.getCredentials()`/
 * `getCsrfToken()` call, no longer each cost a fresh Keychain round trip. `clearSecrets()`
 * delegates to both slots' own `clearToken()`, which invalidates BEFORE issuing the delete (see
 * `keyringTokenStore.ts`) — a Humble disconnect through this store cannot resurrect a stale
 * cached session, the same correctness floor `SidecarKeyringSlotStore` documents for itself.
 */

import { logInfo, logWarning, LogPrefix } from '../logger'
import { requestRustInvoke } from './sidecarRpc'
import {
  RUST_KEYRING_GET,
  RUST_KEYRING_SET
} from 'common/types/sidecarTransport'
import {
  SidecarKeyringSlotStore,
  KEYRING_SLOT_HUMBLE_SESSION,
  KEYRING_SLOT_HUMBLE_CSRF
} from './keyringTokenStore'
import {
  setHumbleSecretStore,
  type HumbleSecretStore,
  type HumbleSecretKey
} from '../humble/secretStore'
import { configStore } from '../humble/electronStores'
import { HUMBLE_TOKEN_STORE_KEY } from '../humble/constants'

/** One `SidecarKeyringSlotStore` per secret, bound once at module load. Each instance is
 * already total on its own (see the doc comment above) — this map only ever selects which one
 * a given `HumbleSecretKey` addresses; it adds no behavior of its own. */
const SLOT_STORES: Record<HumbleSecretKey, SidecarKeyringSlotStore> = {
  sessionCookie: new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION),
  csrfToken: new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_CSRF)
}

export class SidecarHumbleSecretStore implements HumbleSecretStore {
  async isAvailable(): Promise<boolean> {
    // Both slots live in the SAME OS Keychain, addressed under the SAME
    // application/service identity (only the account name differs — see
    // `keyring_account()` in `src-tauri/src/main.rs`): a Keychain that is reachable for one
    // slot is reachable for the other. The session slot's own totalized `isAvailable()` stands
    // in for the whole store rather than probing both slots for one boolean.
    return SLOT_STORES.sessionCookie.isAvailable()
  }

  async getSecret(key: HumbleSecretKey): Promise<string> {
    return SLOT_STORES[key].getToken()
  }

  async setSecret(key: HumbleSecretKey, value: string): Promise<void> {
    return SLOT_STORES[key].setToken(value)
  }

  async clearSecrets(): Promise<void> {
    // Both underlying clearToken() calls are already total (never reject) -- Promise.allSettled
    // documents the "clear BOTH independently of each other's outcome" intent explicitly for a
    // future reader, matching the seam's "resolves even if one delete rejects" contract. Each
    // clearToken() call invalidates its OWN cache before issuing its delete (see
    // keyringTokenStore.ts) -- no additional invalidation is needed here.
    await Promise.allSettled([
      SLOT_STORES.sessionCookie.clearToken(),
      SLOT_STORES.csrfToken.clearToken()
    ])
  }
}

/**
 * Installs `SidecarHumbleSecretStore` as the sidecar's active Humble secret store and logs a
 * confirmation line to `gamelib.log`. Plan 12's own doc comment already flagged the risk this
 * line exists to close: a FAILED install silently degrades to the Electron default, which under
 * the sidecar means plaintext (F-1, again) — so the install must be OBSERVABLE, not assumed.
 * The live-gate re-run (plan 20) greps `gamelib.log` for this exact line.
 *
 * Also fires (never awaited — sidecar startup is synchronous) the one-time plaintext migration
 * below, so an existing plaintext Humble credential moves into the keyring the first time this
 * install runs against it.
 */
export function installSidecarHumbleSecretStore(): void {
  setHumbleSecretStore(new SidecarHumbleSecretStore())
  logInfo(
    '[bootstrap] Humble secret store installed: keyring-backed (humble-session/humble-csrf slots)',
    LogPrefix.Backend
  )
  void migrateHumbleSecrets().catch((error) => {
    logWarning(
      `Humble secret migration failed unexpectedly: ${errorMessage(error)}`,
      LogPrefix.Backend
    )
  })
}

// ── One-time plaintext-to-keyring migration (Task 2, D-GAP-01/T-34.4.1-57) ──────────────────────

/** configStore key + keyring slot for each secret's migration. Mirrors `secretStore.ts`'s own
 * (not exported) `STORE_KEYS` map — duplicated deliberately, since that module documents
 * `csrfToken` has no dedicated constant today, only the literal `'csrfToken'`. */
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

/**
 * One-time migration of a single plaintext secret into the keyring. Order of operations is the
 * whole design and MUST NOT be reordered (D-GAP-01/T-34.4.1-57): read the configStore plaintext
 * -> write it to the keyring -> read it back -> compare -> only on an EXACT match, delete the
 * configStore key and clear `encryptionDegraded`. Any failure at any step — a rejecting write, a
 * rejecting readback, or a mismatched readback — LEAVES THE PLAINTEXT IN PLACE, keeps the user
 * signed in, keeps `encryptionDegraded` as-is (already `true` on the Tauri-created shape this
 * migrates), and logs exactly one warning naming the failure mode — never the secret value, never
 * a length, never the readback's actual contents (T-34.4.1-59). Handled independently per secret
 * (this function is called once per `HumbleSecretKey`) so a `csrfToken` failure can never strand a
 * migrated `sessionCookie`.
 *
 * The readback is the liveness proof — an API that resolves successfully without doing the thing
 * is exactly the `navigator.clipboard`-under-Tauri failure shape this project has already been
 * bitten by. A mismatched readback is NEVER rounded up to success.
 */
export async function migrateOneSecret(key: HumbleSecretKey): Promise<void> {
  const { configKey, slot } = MIGRATION_TARGETS[key]

  const plaintext = configStore.get_nodefault(configKey)
  if (!plaintext || typeof plaintext !== 'string') {
    // Absent — healthy "nothing to migrate" case (already migrated on a prior run, or this
    // secret was never stored). No keyring write, no log.
    return
  }

  try {
    await requestRustInvoke(RUST_KEYRING_SET, [plaintext, slot])
  } catch (error) {
    logWarning(
      `Humble secret migration (${key}): keyring write failed, leaving plaintext in place: ${errorMessage(error)}`,
      LogPrefix.Backend
    )
    return
  }

  // The write went straight to `requestRustInvoke` (bypassing SLOT_STORES[key]'s own
  // setToken(), which is what normally invalidates its cache) BECAUSE this migration must prove
  // the readback came from a REAL keyring round trip, not a cache (the "liveness proof" this
  // function's own doc comment describes) -- but that same bypass means the store's cache is
  // now stale relative to what the keyring actually holds, and must be invalidated here
  // explicitly (34.4.1 gap cycle 2 plan 26 regression found by
  // `migrateHumbleSecrets (both secrets, independently)`'s existing round-trip test: without
  // this line, a `getSecret()` called BEFORE migration -- which legitimately caches the
  // pre-migration '' -- would keep resolving that stale cached '' forever after, even though the
  // migration just wrote a real value).
  SLOT_STORES[key].invalidateCache()

  let readback: unknown
  try {
    readback = await requestRustInvoke(RUST_KEYRING_GET, [slot])
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

  configStore.delete(configKey)
  configStore.set('encryptionDegraded', false)
}

/**
 * Runs the one-time migration for both secrets, independently. Called (fire-and-forget) from
 * `installSidecarHumbleSecretStore()` above.
 */
export async function migrateHumbleSecrets(): Promise<void> {
  await migrateOneSecret('sessionCookie')
  await migrateOneSecret('csrfToken')
}

/**
 * Test-only reset hook (34.4.1 gap cycle 2 plan 26). `SLOT_STORES` is a module-level singleton
 * (see this module's own doc comment) that outlives any individual `SidecarHumbleSecretStore`
 * instance and persists for the lifetime of the whole test FILE (this project's Jest config has
 * no `resetModules`) -- creating a fresh `new SidecarHumbleSecretStore()` per test does NOT give
 * a fresh cache. This export is `humbleSecretStore.test.ts`'s isolation seam: called from that
 * file's `beforeEach`, it clears both slots' read cache so each test's own scripted
 * `requestRustInvoke` outcome is actually exercised, never shadowed by an earlier test's cached
 * success. Never called from production code.
 */
export function resetSidecarHumbleSecretStoreCachesForTests(): void {
  SLOT_STORES.sessionCookie.invalidateCache()
  SLOT_STORES.csrfToken.invalidateCache()
}
