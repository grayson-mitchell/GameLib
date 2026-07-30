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
 */

import { logInfo, LogPrefix } from '../logger'
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
    // future reader, matching the seam's "resolves even if one delete rejects" contract.
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
 */
export function installSidecarHumbleSecretStore(): void {
  setHumbleSecretStore(new SidecarHumbleSecretStore())
  logInfo(
    '[bootstrap] Humble secret store installed: keyring-backed (humble-session/humble-csrf slots)',
    LogPrefix.Backend
  )
}
