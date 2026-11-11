/**
 * HumbleSecretStore — Humble's credential encryption seam (Phase 34.4.1 Plan
 * 12, gap-cycle closure for F-1/S-10, REQ-34.4.1-02/REQ-34.4.1-GAP-02).
 *
 * **T-34.4.1-56**: the decision this module carries -- the Humble session
 * secret moves off a world-readable JSON file and behind the OS keyring,
 * because under the Tauri sidecar the `safeStorage` import below is a dead
 * stub. Stated as a formal id here, beside the reduction, because
 * `seam-parity-sweep.py` requires an id CO-LOCATED with the seam terms; prose
 * alone reads as SILENTLY-DROPPED (S-11). Keep this comment under
 * `FILE_HEADER_SEARCH_WINDOW` (3000 chars) or the sweep stops reading it.
 *
 * `humble/user.ts` used to call `safeStorage` directly. Under the Tauri
 * sidecar, `safeStorage` resolves to `platform/index.ts`'s hardcoded-dead stub
 * (`isEncryptionAvailable` always `false`; `encryptString`/`decryptString`
 * throw) -- so every Humble session was silently persisted in PLAINTEXT under
 * Tauri (F-1). This module is the seam that lets a future implementation
 * (plan 13's OS-keyring-backed store) replace the storage mechanism WITHOUT
 * `user.ts` needing further edits, mirroring
 * `storeManagers/steam/tokenStore.ts`'s `TokenStore` shape exactly, widened
 * by a secret key.
 *
 * **The Electron implementation is gone (66.3-17).** It was the verbatim pre-seam
`encryptionAvailable`/`encryptCookie`/`decryptCookie` bodies over the shim's `safeStorage`, kept
as this module's DEFAULT; under the sidecar that default meant plaintext (F-1), reachable by
any build that failed to install a store. The store is now chosen once at boot (the keyring-backed
`SidecarHumbleSecretStore`, or the dev vault when `GAMELIB_DEV_SECRET_VAULT=1`) and required at
`createHumbleServices()` construction, so no code path can read a placeholder store.

Store-shaped, not value-transform-shaped, is load-bearing: plan 13's
 * keyring implementation OWNS where the secret lives (an OS Keychain entry
 * reached via a `rustInvoke` round-trip), so a seam that only encoded a
 * value for someone else to write into `configStore` could not express it.
 *
 * The user-visible "encryption degraded" flag is deliberately OUT of this
 * module -- it is a UI concern driven from `user.ts` off `isAvailable()`,
 * and coupling it here would give the keyring implementation a `configStore`
 * key it has no business writing.
 *
 * Dual-build constraint: this module must never import anything from the
 * sidecar transport package -- its RPC module runs a Node `readline`/stdio
 * loop that does not exist in the Electron main process.
 */

import type { TokenReadOutcome } from 'backend/storeManagers/steam/tokenStore'

/** The two secrets `user.ts` persists today. A closed union, not a free
 * string -- the TS-side counterpart of Rust's keyring slot allowlist
 * (T-28-03's reasoning, applied one layer up): it stops a future caller
 * inventing a third secret without thinking about where it lands. */
export type HumbleSecretKey = 'sessionCookie' | 'csrfToken'

export interface HumbleSecretStore {
  /** Whether this store's underlying encryption/secure-storage mechanism is
   * currently usable. Does NOT indicate whether a secret is present.
   *
   * `context` (quick-260905-jx3) is an OPTIONAL, never-secret trigger label,
   * forwarded to `SidecarKeyringSlotStore.isAvailable()` by the sidecar
   * implementation because that call can raise a real Keychain prompt and the
   * prompt must be attributable afterwards. A store that cannot prompt ignores
   * it. */
  isAvailable(context?: string): Promise<boolean>
  /** Returns the stored secret, or `''` when none is stored, the store is
   * unavailable, or decryption failed. */
  getSecret(key: HumbleSecretKey): Promise<string>
  /** OPTIONAL (Phase 49, 49-06, D-15). A three-state read: unlike `getSecret`, it
   * distinguishes an empty slot (`absent`) from a read that failed (`unreadable`).
   * `context` is a never-secret trigger label (the `isAvailable(context?)`
   * precedent, quick-260905-jx3) carried into the keyring log lines so the
   * Keychain prompt this read can raise is attributable. An implementation that
   * cannot prompt may omit the method. */
  readSecret?(key: HumbleSecretKey, context?: string): Promise<TokenReadOutcome>
  /** Persists a secret. */
  setSecret(key: HumbleSecretKey, value: string): Promise<void>
  /** Removes both stored secrets. Never throws. */
  clearSecrets(): Promise<void>
}
