import { safeStorage } from 'electron'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { configStore } from './electronStores'
import { TOKEN_PREFIX, TOKEN_STORE_KEY } from './constants'

/**
 * TokenStore — the Steam refresh token seam (D-09, REQ-28-02/REQ-28-03).
 *
 * (a) This module is the ONLY module in the codebase permitted to read or
 *     write `configStore`'s `TOKEN_STORE_KEY`. `user.ts` and every other
 *     caller must go through `getTokenStore()` — never import `configStore`
 *     or `TOKEN_STORE_KEY` directly for token access (D-04/REQ-28-02). This
 *     is enforced structurally: as long as no other module imports
 *     `TOKEN_STORE_KEY`, a non-Electron writer cannot corrupt the shared
 *     store's token entry and silently sign the real Electron user out.
 *
 * (b) A future Tauri sidecar build installs a different `TokenStore`
 *     implementation via `setTokenStore()` (plan 28-04). That implementation
 *     MUST NEVER import `configStore` or `TOKEN_STORE_KEY` from this module
 *     or from `./electronStores` — it talks to a real OS keyring instead.
 *     `setTokenStore` has no env-var-driven auto-selection (REQ-28-07/D-08);
 *     the override is installed only by an explicit call from the sidecar's
 *     own bootstrap path.
 *
 * (c) D-11 divergence: `ElectronTokenStore` intentionally KEEPS a plaintext
 *     fallback (warn-then-store-plaintext on `setToken` when
 *     `safeStorage.isEncryptionAvailable()` is false, and a legacy
 *     non-prefixed plaintext read on `getToken`) — this is shipped Electron
 *     behavior, preserved byte-identical per REQ-28-07. It is a deliberate
 *     divergence from D-06's "sidecar must never persist a plaintext token"
 *     rule, not a bug: the sidecar's future implementation has no such
 *     fallback at all.
 *
 * No function in this module reads an Electron-stored token and hands it to
 * a keyring or any other store — there is no migration bridge here
 * (REQ-28-03/D-02). `ElectronTokenStore` only ever talks to `configStore`;
 * nothing here imports or references a keyring/sidecar transport.
 */

// ── The TokenStore contract ──────────────────────────────────────────────────

export interface TokenStore {
  /** Whether this store's underlying encryption/secure-storage mechanism is
   * currently usable. Does NOT indicate whether a token is present. */
  isAvailable(): Promise<boolean>
  /** Returns the stored refresh token, or `''` when none is stored OR the
   * store is unavailable (D-06 semantics — callers treat both the same). */
  getToken(): Promise<string>
  /** Persists a refresh token. */
  setToken(token: string): Promise<void>
  /** Removes any stored refresh token. */
  clearToken(): Promise<void>
}

// ── Electron implementation — byte-identical to the pre-seam behavior ───────

/**
 * The Electron build's TokenStore. Wraps `safeStorage` + `configStore`
 * exactly as `user.ts` did before this seam existed — the three private
 * methods below are the verbatim bodies of the former
 * `encryptionAvailable`/`encryptToken`/`decryptToken` free functions. A
 * behavior diff here is a REQ-28-07 failure.
 */
export class ElectronTokenStore implements TokenStore {
  private encryptionAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  private encryptToken(plain: string): string {
    if (!plain) return ''
    if (!this.encryptionAvailable()) {
      logWarning(
        'safeStorage unavailable — storing Steam refresh token in plaintext',
        LogPrefix.Steam
      )
      return plain
    }
    const ciphertext = safeStorage.encryptString(plain).toString('base64')
    return `${TOKEN_PREFIX}${ciphertext}`
  }

  private decryptToken(stored: string): string {
    if (!stored) return ''
    if (!stored.startsWith(TOKEN_PREFIX)) {
      // Legacy plaintext fallback
      return stored
    }
    if (!this.encryptionAvailable()) return ''
    try {
      const buf = Buffer.from(stored.slice(TOKEN_PREFIX.length), 'base64')
      return safeStorage.decryptString(buf)
    } catch (err) {
      logWarning(['Failed to decrypt Steam refresh token:', err], LogPrefix.Steam)
      return ''
    }
  }

  async isAvailable(): Promise<boolean> {
    return Promise.resolve(this.encryptionAvailable())
  }

  async getToken(): Promise<string> {
    const stored = configStore.get_nodefault(TOKEN_STORE_KEY)
    if (!stored || typeof stored !== 'string') return ''
    return this.decryptToken(stored)
  }

  async setToken(token: string): Promise<void> {
    configStore.set(TOKEN_STORE_KEY, this.encryptToken(token))
  }

  async clearToken(): Promise<void> {
    configStore.delete(TOKEN_STORE_KEY)
  }
}

// ── Registry — swappable per build, no env-var escape hatch ─────────────────

let activeTokenStore: TokenStore = new ElectronTokenStore()

/**
 * Installs a different TokenStore implementation. Only ever called
 * explicitly by a build's own bootstrap path (e.g. the Tauri sidecar
 * installing its keyring-backed implementation in plan 28-04) — there is
 * deliberately no env-var/config-driven auto-selection here (REQ-28-07/D-08).
 */
export function setTokenStore(next: TokenStore): void {
  logInfo(
    `Steam TokenStore implementation set to ${next.constructor.name}`,
    LogPrefix.Steam
  )
  activeTokenStore = next
}

export function getTokenStore(): TokenStore {
  return activeTokenStore
}
