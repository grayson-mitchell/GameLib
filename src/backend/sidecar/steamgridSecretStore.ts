/**
 * `SidecarSteamGridDbSecretStore` — the Tauri sidecar's keyring-backed implementation of
 * SteamGridDB's `SteamGridDbSecretStore` seam (Phase 34.6 Plan 02, `34.6-CONTEXT.md` amendment
 * A-03, second and final half; closing REQ-34.6-06 alongside plan 34.6-01's Electron-side half).
 *
 * `steamgrid/secretStore.ts` (plan 01) defines the seam; `ElectronSteamGridDbSecretStore` there
 * delegates to `steamgrid/secureKey.ts`'s `safeStorage`-backed crypto primitives, which are dead
 * under the sidecar (see that module's own header) -- a store that is not this one would persist
 * the key in plaintext.
 * This module is the sidecar's own implementation: it binds the single `steamGridDbApiKey` secret
 * to the `steamgrid-api-key` keyring slot, allowlisted by plan 01 (`keyringTokenStore.ts`), and
 * is built by `createSidecarSteamGridDbSecretStore()` and handed to the boot — the same convention
 * `bootstrap.ts` already uses for Steam's `SidecarKeyringTokenStore` and Humble's
 * `SidecarHumbleSecretStore`.
 *
 * Shape mirrored member-for-member from `humbleSecretStore.ts` (Phase 34.4.1 gap-cycle plan 13):
 * a per-instance `SidecarKeyringSlotStore`, a total-method wrapper class delegating to it,
 * a start function emitting exactly one greppable `logInfo` receipt and dispatching a
 * fire-and-forget one-time plaintext-to-keyring migration, (tests build fresh instances).
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
import {
  RUST_KEYRING_GET,
  RUST_KEYRING_SET
} from 'common/types/sidecarTransport'
import {
  SidecarKeyringSlotStore,
  KEYRING_SLOT_STEAMGRID_API_KEY
} from './keyringTokenStore'
import type {
  SteamGridDbSecretDeps,
  SteamGridDbSecretStore
} from '../steamgrid/secretStore'
import { isEncryptedValue, decryptApiKey } from '../steamgrid/secureKey'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The keyring-backed SteamGridDB secret store. Each instance owns its own `SidecarKeyringSlotStore`
 * for the `steamgrid-api-key` slot (already total on its own, see this module's doc comment): the
 * instance only ever delegates to it, adding no behavior of its own, and two instances share no
 * read cache (D-05, C-WR-2: the former module-scope `SLOT_STORE` is gone).
 */
export class SidecarSteamGridDbSecretStore implements SteamGridDbSecretStore {
  private readonly slot = new SidecarKeyringSlotStore(
    KEYRING_SLOT_STEAMGRID_API_KEY
  )

  /** Drops the slot's read cache (the migration writes around it to prove a real round trip). */
  invalidateCache(): void {
    this.slot.invalidateCache()
  }

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
    const value = await this.slot.getToken()
    return value ? value : undefined
  }

  async setApiKey(value: string): Promise<void> {
    // WR-02 (34.6-REVIEW.md): mirror `ElectronSteamGridDbSecretStore.setApiKey()`
    // (`steamgrid/secretStore.ts`) exactly. Without this the two builds diverged on
    // byte-identical user input: Electron trimmed and treated a whitespace-only value as an
    // explicit CLEAR, while the sidecar stored the untrimmed string -- so a pasted key with a
    // trailing newline persisted differently per build, and the "submit an empty value to clear
    // the key" gesture silently did nothing under Tauri.
    const trimmed = value.trim()
    if (!trimmed) {
      await this.slot.clearToken()
      return
    }
    await this.slot.setToken(trimmed)
  }

  async clearApiKey(): Promise<void> {
    await this.slot.clearToken()
  }
}

/**
 * Builds the keyring-backed SteamGridDB secret store the boot injects (a boot-built instance, no
 * registry). Construction does no I/O and arms nothing; the receipt line and the one-time
 * plaintext migration belong to `startSidecarSteamGridDbSecretStore()` below, which the
 * 'secret-stores' boot step runs after the RPC server is bound (T-28-10 placement).
 */
export function createSidecarSteamGridDbSecretStore(): SidecarSteamGridDbSecretStore {
  return new SidecarSteamGridDbSecretStore()
}

/**
 * Logs a confirmation line to `gamelib.log` and fires (never awaited -- sidecar startup is
 * synchronous) the one-time plaintext migration below, so an existing plaintext or
 * legacy-ciphertext SteamGridDB API key moves into the keyring the first time this runs against
 * it. The log line exists because a store that is not actually the keyring one would persist the
 * key in the clear (A-03): the install must be OBSERVABLE, not assumed. The live gate
 * (`34.6-LIVE-GATE.md` step 3) greps `gamelib.log` for this exact line.
 */
export function startSidecarSteamGridDbSecretStore(
  store: Pick<SidecarSteamGridDbSecretStore, 'invalidateCache'>,
  deps: SteamGridDbSecretDeps
): void {
  logInfo('[bootstrap] steamgrid secret store: keyring', LogPrefix.Backend)
  void migrateSteamGridDbApiKey(store, deps).catch((error) => {
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
export async function migrateSteamGridDbApiKey(
  store: Pick<SidecarSteamGridDbSecretStore, 'invalidateCache'>,
  deps: SteamGridDbSecretDeps
): Promise<void> {
  const stored = deps.config.getSettings().steamGridDbApiKey

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

  // The write went straight to `requestRustInvoke` (bypassing the slot store's own setToken(), which
  // is what normally invalidates its cache) BECAUSE this migration must prove the readback came
  // from a REAL keyring round trip, not a cache — but that same bypass means the store's cache is
  // now stale relative to what the keyring actually holds, and must be invalidated here
  // explicitly (mirrors `migrateOneSecret`'s identical reasoning in `humbleSecretStore.ts`).
  store.invalidateCache()

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

  deps.config.setSetting('steamGridDbApiKey', '', deps.stores.kvs)
}
