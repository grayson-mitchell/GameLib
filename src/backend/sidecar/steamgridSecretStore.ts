/**
 * `SidecarSteamGridDbSecretStore` — the Tauri sidecar's keyring-backed implementation of
 * SteamGridDB's `SteamGridDbSecretStore` seam (Phase 34.6 Plan 02, `34.6-CONTEXT.md` amendment
 * A-03, second and final half; closing REQ-34.6-06 alongside plan 34.6-01's Electron-side half).
 *
 * `steamgrid/secretStore.ts` (plan 01) defines the seam and installs `ElectronSteamGridDbSecretStore`
 * (which delegates to `steamgrid/secureKey.ts`'s `safeStorage`-backed crypto primitives — dead
 * under the sidecar, see that module's own header) as its DEFAULT — a build that fails to install
 * its own implementation silently keeps that default, which under the sidecar means plaintext.
 * This module is the sidecar's own implementation: it binds the single `steamGridDbApiKey` secret
 * to the `steamgrid-api-key` keyring slot, allowlisted by plan 01 (`keyringTokenStore.ts`), and
 * installs itself via `installSidecarSteamGridDbSecretStore()` — the same install-site convention
 * `bootstrap.ts` already uses for Steam's `SidecarKeyringTokenStore` and Humble's
 * `SidecarHumbleSecretStore`.
 *
 * Shape mirrored member-for-member from `humbleSecretStore.ts` (Phase 34.4.1 gap-cycle plan 13):
 * a single module-level `SidecarKeyringSlotStore`, a total-method wrapper class delegating to it,
 * an install function emitting exactly one greppable `logInfo` receipt and dispatching a
 * fire-and-forget one-time plaintext-to-keyring migration, and a test-only cache-reset hook.
 * SteamGridDB has exactly ONE secret (unlike Humble's two), so this module binds a single
 * `SidecarKeyringSlotStore` instance directly rather than a `Record`-keyed map of them.
 *
 * Totality discipline mirrored EXACTLY from `SidecarKeyringSlotStore`/`SidecarHumbleSecretStore`:
 * every method is total (never rejects/throws to its caller), an absent/empty keyring read is the
 * healthy first-run case, and a genuine failure logs exactly one warning naming the failure mode —
 * never the secret value. There is no fallback of any kind here (D-08/REQ-28-07) — a keyring
 * failure is a failure; the one-time plaintext migration (this module) is a distinct,
 * separately-guarded concern layered on top, not a fallback baked into this store's own methods.
 *
 * Import discipline: this module imports the slot-name constant from `keyringTokenStore.ts`
 * rather than retyping the literal `'steamgrid-api-key'` — a drift between the TS literal and
 * Rust's `keyring_account()` allowlist (`src-tauri/src/main.rs`) would otherwise surface only at
 * runtime as `keyring:unknown-slot`, nowhere earlier.
 *
 * The one-time migration reads/writes `GlobalConfig`'s `steamGridDbApiKey` setting directly
 * (SteamGridDB's config value lives in the shared `AppSettings` shape, not a dedicated
 * `electron-store` the way Humble's session/csrf secrets do) and uses `secureKey.ts`'s existing
 * `isEncryptedValue`/`decryptApiKey` to unwrap a pre-existing `sgdb:v1:` ciphertext (e.g. one
 * written by a REAL Electron `safeStorage` on a machine that has run both builds against the same
 * shared `config.json`) before ever handing a value to the keyring — the keyring must never be
 * asked to store ciphertext this sidecar build cannot itself decrypt back out.
 */

import { logInfo, logWarning, LogPrefix } from '../logger'
import { requestRustInvoke } from './sidecarRpc'
import { RUST_KEYRING_GET, RUST_KEYRING_SET } from 'common/types/sidecarTransport'
import {
  SidecarKeyringSlotStore,
  KEYRING_SLOT_STEAMGRID_API_KEY
} from './keyringTokenStore'
import {
  setSteamGridDbSecretStore,
  type SteamGridDbSecretStore
} from '../steamgrid/secretStore'
import { isEncryptedValue, decryptApiKey } from '../steamgrid/secureKey'
import { GlobalConfig } from '../config'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The single `SidecarKeyringSlotStore` bound once at module load, addressing the
 * `steamgrid-api-key` slot. Already total on its own (see this module's own doc comment above) —
 * `SidecarSteamGridDbSecretStore` only ever delegates to it, adding no behavior of its own. */
const SLOT_STORE = new SidecarKeyringSlotStore(KEYRING_SLOT_STEAMGRID_API_KEY)

export class SidecarSteamGridDbSecretStore implements SteamGridDbSecretStore {
  isAvailable(): boolean {
    // The seam's interface (plan 34.6-01) declares this member SYNCHRONOUS, but a genuine
    // keyring availability probe (`SidecarKeyringSlotStore.isAvailable()`) is asynchronous — so
    // this optimistically reports true; a real unavailability surfaces honestly on the next
    // getApiKey()/setApiKey()/clearApiKey() call instead (each already resolves to its own
    // failure-safe empty/no-op result rather than throwing). No caller in this codebase branches
    // on this value yet (plan 34.6-09, which ports the channel that will, is the first).
    return true
  }

  async getApiKey(): Promise<string | undefined> {
    const value = await SLOT_STORE.getToken()
    return value ? value : undefined
  }

  async setApiKey(value: string): Promise<void> {
    await SLOT_STORE.setToken(value)
  }

  async clearApiKey(): Promise<void> {
    await SLOT_STORE.clearToken()
  }
}

/**
 * Installs `SidecarSteamGridDbSecretStore` as the sidecar's active SteamGridDB secret store and
 * logs a confirmation line to `gamelib.log`. This module's own doc comment already flagged the
 * risk this line exists to close: a FAILED install silently degrades to the Electron default,
 * which under the sidecar means plaintext (A-03, again) — so the install must be OBSERVABLE, not
 * assumed. The live gate (`34.6-LIVE-GATE.md` step 3) greps `gamelib.log` for this exact line.
 *
 * Also fires (never awaited — sidecar startup is synchronous) the one-time plaintext migration
 * below, so an existing plaintext or legacy-ciphertext SteamGridDB API key moves into the keyring
 * the first time this install runs against it.
 */
export function installSidecarSteamGridDbSecretStore(): void {
  setSteamGridDbSecretStore(new SidecarSteamGridDbSecretStore())
  logInfo('[bootstrap] steamgrid secret store: keyring', LogPrefix.Backend)
  void migrateSteamGridDbApiKey().catch((error) => {
    logWarning(
      `SteamGridDB API key migration failed unexpectedly: ${errorMessage(error)}`,
      LogPrefix.Backend
    )
  })
}

// ── One-time plaintext-to-keyring migration (A-03) ──────────────────────────────────────────────

/**
 * One-time migration of the SteamGridDB API key into the keyring. Order of operations is copied
 * from `humbleSecretStore.ts`'s `migrateOneSecret` and MUST NOT be reordered: read the
 * `GlobalConfig` value -> return early if absent/non-string -> if `sgdb:v1:`-prefixed, decrypt it
 * first and return early if that yields an empty string (ciphertext this sidecar build cannot
 * read) -> write the plaintext to the keyring -> read it back -> compare -> only on an EXACT
 * match, clear the `GlobalConfig` setting. Any failure at any step — a rejecting write, a
 * rejecting readback, a mismatched readback, or undecryptable ciphertext — LEAVES THE EXISTING
 * VALUE IN PLACE and logs exactly one warning naming the failure mode — never the secret value,
 * never a length, never the readback's actual contents.
 *
 * The readback is the liveness proof — an API that resolves successfully without doing the thing
 * is exactly the `navigator.clipboard`-under-Tauri failure shape this project has already been
 * bitten by. A mismatched readback is NEVER rounded up to success.
 */
export async function migrateSteamGridDbApiKey(): Promise<void> {
  const stored = GlobalConfig.get().getSettings().steamGridDbApiKey

  if (!stored || typeof stored !== 'string') {
    // Absent — healthy "nothing to migrate" case (already migrated on a prior run, or no
    // SteamGridDB key was ever configured). No keyring write, no log.
    return
  }

  let plaintext = stored
  if (isEncryptedValue(stored)) {
    // A pre-existing `sgdb:v1:` ciphertext. Never write ciphertext into the keyring — decrypt it
    // first with the SAME primitive `ElectronSteamGridDbSecretStore` uses. Under the sidecar this
    // correctly yields '' (the `safeStorage` stub reports encryption unavailable), which this
    // treats as "cannot decrypt, leave it alone" rather than "no key was ever set".
    const decrypted = decryptApiKey(stored)
    if (!decrypted) {
      logWarning(
        'SteamGridDB API key migration: stored value is ciphertext this sidecar build cannot decrypt, leaving it in place',
        LogPrefix.Backend
      )
      return
    }
    plaintext = decrypted
  }

  try {
    await requestRustInvoke(RUST_KEYRING_SET, [
      plaintext,
      KEYRING_SLOT_STEAMGRID_API_KEY
    ])
  } catch (error) {
    logWarning(
      `SteamGridDB API key migration: keyring write failed, leaving the existing value in place: ${errorMessage(error)}`,
      LogPrefix.Backend
    )
    return
  }

  // The write went straight to `requestRustInvoke` (bypassing SLOT_STORE's own setToken(), which
  // is what normally invalidates its cache) BECAUSE this migration must prove the readback came
  // from a REAL keyring round trip, not a cache — but that same bypass means the store's cache is
  // now stale relative to what the keyring actually holds, and must be invalidated here
  // explicitly (mirrors `migrateOneSecret`'s identical reasoning in `humbleSecretStore.ts`).
  SLOT_STORE.invalidateCache()

  let readback: unknown
  try {
    readback = await requestRustInvoke(RUST_KEYRING_GET, [
      KEYRING_SLOT_STEAMGRID_API_KEY
    ])
  } catch (error) {
    logWarning(
      `SteamGridDB API key migration: keyring readback failed, leaving the existing value in place: ${errorMessage(error)}`,
      LogPrefix.Backend
    )
    return
  }

  if (readback !== plaintext) {
    logWarning(
      'SteamGridDB API key migration: keyring readback did not match the written value, leaving the existing value in place',
      LogPrefix.Backend
    )
    return
  }

  GlobalConfig.get().setSetting('steamGridDbApiKey', '')
}

/**
 * Test-only reset hook, mirroring `resetSidecarHumbleSecretStoreCachesForTests`. `SLOT_STORE` is
 * a module-level singleton that outlives any individual `SidecarSteamGridDbSecretStore` instance
 * and persists for the lifetime of the whole test FILE (this project's Jest config has no
 * `resetModules`) — creating a fresh `new SidecarSteamGridDbSecretStore()` per test does NOT give
 * a fresh cache. This export is `steamgridSecretStore.test.ts`'s isolation seam: called from that
 * file's `beforeEach`, it clears the slot's read cache so each test's own scripted
 * `requestRustInvoke` outcome is actually exercised, never shadowed by an earlier test's cached
 * success. Never called from production code.
 */
export function resetSidecarSteamGridDbSecretStoreCachesForTests(): void {
  SLOT_STORE.invalidateCache()
}
