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
 * sidecar, `safeStorage` resolves to `electronStub.ts`'s hardcoded-dead stub
 * (`isEncryptionAvailable` always `false`; `encryptString`/`decryptString`
 * throw) -- so every Humble session was silently persisted in PLAINTEXT under
 * Tauri (F-1). This module is the seam that lets a future implementation
 * (plan 13's OS-keyring-backed store) replace the storage mechanism WITHOUT
 * `user.ts` needing further edits, mirroring
 * `storeManagers/steam/tokenStore.ts`'s `TokenStore` shape exactly, widened
 * by a secret key.
 *
 * **This plan is a pure refactor.** The Electron implementation below is the
 * verbatim `encryptionAvailable`/`encryptCookie`/`decryptCookie` bodies moved
 * out of `user.ts`, reading/writing the SAME `configStore` keys under the
 * SAME prefix -- Electron's on-disk `humble_store/config.json` is unchanged
 * in every field. It is installed as this module's DEFAULT (unlike
 * `loginWindowSeam.ts`, whose holder starts `null` because Electron never
 * calls its setter) -- the Electron implementation is real code that must
 * run under Electron. Consequence worth stating: a sidecar that fails to
 * install its own implementation via `setHumbleSecretStore()` degrades to
 * THIS module's default (plaintext under Tauri, since `safeStorage` here is
 * still the dead stub), not to no storage at all -- plan 13 must prove the
 * install actually happened, not assume it.
 *
 * Store-shaped, not value-transform-shaped, is load-bearing: plan 13's
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

import { safeStorage } from 'electron'

import { logWarning, LogPrefix } from 'backend/logger'

import { configStore } from './electronStores'
import { HUMBLE_TOKEN_PREFIX, HUMBLE_TOKEN_STORE_KEY } from './constants'

/** The two secrets `user.ts` persists today. A closed union, not a free
 * string -- the TS-side counterpart of Rust's keyring slot allowlist
 * (T-28-03's reasoning, applied one layer up): it stops a future caller
 * inventing a third secret without thinking about where it lands. */
export type HumbleSecretKey = 'sessionCookie' | 'csrfToken'

// The configStore key each HumbleSecretKey maps to. sessionCookie shares the
// existing HUMBLE_TOKEN_STORE_KEY constant (== 'sessionCookie'); csrfToken has
// no dedicated constant today (user.ts always used the literal 'csrfToken'),
// so this map is the ONE place that fact is recorded.
const STORE_KEYS: Record<HumbleSecretKey, 'sessionCookie' | 'csrfToken'> = {
  sessionCookie: HUMBLE_TOKEN_STORE_KEY,
  csrfToken: 'csrfToken'
}

export interface HumbleSecretStore {
  /** Whether this store's underlying encryption/secure-storage mechanism is
   * currently usable. Does NOT indicate whether a secret is present. */
  isAvailable(): Promise<boolean>
  /** Returns the stored secret, or `''` when none is stored, the store is
   * unavailable, or decryption failed. */
  getSecret(key: HumbleSecretKey): Promise<string>
  /** Persists a secret. */
  setSecret(key: HumbleSecretKey, value: string): Promise<void>
  /** Removes both stored secrets. Never throws. */
  clearSecrets(): Promise<void>
}

// ── Electron implementation — byte-identical to the pre-seam behavior ───────

/**
 * The Electron build's HumbleSecretStore. Wraps `safeStorage` + `configStore`
 * exactly as `user.ts` did before this seam existed -- the three private
 * methods below are the verbatim bodies of the former
 * `encryptionAvailable`/`encryptCookie`/`decryptCookie` free functions. A
 * behavior diff here is a REQ-34.4.1-02 failure.
 */
export class ElectronHumbleSecretStore implements HumbleSecretStore {
  private encryptionAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  private encryptValue(plain: string): string {
    if (!plain) return ''
    if (!this.encryptionAvailable()) {
      logWarning(
        'safeStorage unavailable — storing Humble session in plaintext (degraded encryption)',
        LogPrefix.Backend
      )
      return plain
    }
    const ciphertext = safeStorage.encryptString(plain).toString('base64')
    return `${HUMBLE_TOKEN_PREFIX}${ciphertext}`
  }

  private decryptValue(stored: string): string {
    if (!stored) return ''
    if (!stored.startsWith(HUMBLE_TOKEN_PREFIX)) {
      // Legacy/plaintext fallback (degraded-encryption path above)
      return stored
    }
    if (!this.encryptionAvailable()) return ''
    try {
      const buf = Buffer.from(stored.slice(HUMBLE_TOKEN_PREFIX.length), 'base64')
      return safeStorage.decryptString(buf)
    } catch (err) {
      logWarning(
        ['Failed to decrypt Humble session cookie:', err],
        LogPrefix.Backend
      )
      return ''
    }
  }

  async isAvailable(): Promise<boolean> {
    return Promise.resolve(this.encryptionAvailable())
  }

  async getSecret(key: HumbleSecretKey): Promise<string> {
    const stored = configStore.get_nodefault(STORE_KEYS[key])
    if (!stored || typeof stored !== 'string') return ''
    return this.decryptValue(stored)
  }

  async setSecret(key: HumbleSecretKey, value: string): Promise<void> {
    configStore.set(STORE_KEYS[key], this.encryptValue(value))
  }

  async clearSecrets(): Promise<void> {
    configStore.delete(STORE_KEYS.sessionCookie)
    configStore.delete(STORE_KEYS.csrfToken)
  }
}

// ── Registry — swappable per build, no env-var escape hatch ─────────────────

let activeSecretStore: HumbleSecretStore = new ElectronHumbleSecretStore()

/**
 * Installs a different HumbleSecretStore implementation. Only ever called
 * explicitly by a build's own bootstrap path (e.g. the Tauri sidecar
 * installing its keyring-backed implementation in plan 13) -- there is
 * deliberately no env-var/config-driven auto-selection here
 * (Phase 28 REQ-28-07/D-08's rule, applied here).
 */
export function setHumbleSecretStore(next: HumbleSecretStore): void {
  activeSecretStore = next
}

export function getHumbleSecretStore(): HumbleSecretStore {
  return activeSecretStore
}
