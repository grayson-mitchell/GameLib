import { safeStorage } from 'backend/platform'
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

/** Why a read could not be completed. Mirrors `classifyKeyringFailure()`'s
 *  existing two-way split in `keyringTokenStore.ts` — do not invent a third. */
export type TokenUnreadableReason = 'timeout' | 'unavailable'

/**
 * The three distinct outcomes of a token read (quick-260814-r2d). `getToken()`
 * on `TokenStore` cannot express this — `''` does double duty for both "no
 * token stored" and "could not read the store right now" and a caller cannot
 * tell them apart. `readToken()`/`readTokenOutcome()` below make the third
 * state explicit for callers that need to act on it differently (never treat
 * `unreadable` as a signed-out signal).
 */
export type TokenReadOutcome =
  | { status: 'present'; token: string }
  | { status: 'absent' }
  | { status: 'unreadable'; reason: TokenUnreadableReason }

export interface TokenStore {
  /** Whether this store's underlying encryption/secure-storage mechanism is
   * currently usable. Does NOT indicate whether a token is present. */
  isAvailable(): Promise<boolean>
  /** Returns the stored refresh token, or `''` when none is stored OR the
   * store is unavailable (D-06 semantics — callers treat both the same).
   * KEPT verbatim for backward compatibility with `humbleSecretStore.ts`'s
   * `getSecret()` and every existing caller — this method's contract does not
   * change. A caller that needs to distinguish "nothing stored" from "could
   * not read right now" must use `readToken()`/`readTokenOutcome()` instead. */
  getToken(): Promise<string>
  /** Persists a refresh token. */
  setToken(token: string): Promise<void>
  /** Removes any stored refresh token. */
  clearToken(): Promise<void>
  /** OPTIONAL, additive (quick-260814-r2d). Implemented only by stores whose
   *  read can FAIL as distinct from returning nothing — e.g. the Tauri
   *  sidecar's keyring-backed store, where a Keychain timeout or a Deny is a
   *  real failure, not an empty slot. Absent on `ElectronTokenStore` and
   *  `DevVaultTokenStore`, which keep their existing `''`-only semantics
   *  untouched (REQ-28-07 — their bodies are not modified by this seam).
   *
   *  `context` (quick-260817-d61) is an OPTIONAL trigger label — what
   *  deliberate Steam action, if any, caused this read — forwarded verbatim
   *  to the implementation for log annotation only. Never a secret, never
   *  interpreted by this module. An implementation that ignores it is exactly
   *  as correct as one that logs it; the parameter exists so the keyring
   *  implementation CAN log it without a second, divergent read path. */
  readToken?(context?: string): Promise<TokenReadOutcome>
}

/**
 * The single entry point every caller that cares about the third state uses.
 * Delegates to `store.readToken()` when the store implements it (the keyring
 * path), so the outcome — including a genuine `unreadable` — is returned
 * verbatim and `store.getToken()` is not called at all in that case.
 *
 * For a store WITHOUT `readToken()` (`ElectronTokenStore`, `DevVaultTokenStore`),
 * this falls back to `store.getToken()` and maps a non-empty string to
 * `present` and an empty string to `absent`. That fallback is deliberately
 * byte-equivalent to today's conflating behaviour — those stores cannot fail
 * this way, so there is nothing lost by collapsing their `''` to `absent`.
 *
 * Honest caveat: `ElectronTokenStore.getToken()` also returns `''` on a
 * decrypt failure, so under this fallback path that case still maps to
 * `absent`, not `unreadable`. That is unchanged, pre-existing behaviour,
 * deliberately left alone here — changing it would breach REQ-28-07's
 * byte-identical guarantee on `ElectronTokenStore`. The Tauri/keyring path is
 * the one with the observed 9:1 failure rate and is what this seam fixes.
 */
export async function readTokenOutcome(
  store: TokenStore,
  context?: string
): Promise<TokenReadOutcome> {
  if (store.readToken) return store.readToken(context)
  const token = await store.getToken()
  return token ? { status: 'present', token } : { status: 'absent' }
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
      logWarning(
        ['Failed to decrypt Steam refresh token:', err],
        LogPrefix.Steam
      )
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
