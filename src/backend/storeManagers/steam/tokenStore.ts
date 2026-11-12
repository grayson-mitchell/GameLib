import { logWarning, LogPrefix } from 'backend/logger'
import type { SteamStoresDeps } from './library/installRoot'
import { TOKEN_STORE_KEY } from './constants'

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
 *     or from `./stores` — it talks to a real OS keyring instead.
 *     `setTokenStore` has no env-var-driven auto-selection (REQ-28-07/D-08);
 *     the override is installed only by an explicit call from the sidecar's
 *     own bootstrap path.
 *
 * (c) D-12 (Phase 72): the default store is `UnconfiguredTokenStore`, which
 *     fails closed. There is NO plaintext fallback anywhere: the former
 *     Electron-era store (safeStorage + plaintext-on-unavailable) is deleted.
 *     Until bootstrap installs the keyring or dev-vault store, `setToken`
 *     throws and reads report unreadable.
 *
 * No function in this module reads an Electron-stored token and hands it to
 * a keyring or any other store — there is no migration bridge here
 * (REQ-28-03/D-02). nothing here imports or references a keyring/sidecar transport.
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
   * currently usable. Does NOT indicate whether a token is present.
   *
   * `context` (quick-260905-jx3) is an OPTIONAL trigger label naming what
   * deliberate action caused this probe -- never a secret. It exists because on
   * the sidecar's keyring-backed store this call is NOT free: it reaches
   * `entry.get_password()` and can raise a real Keychain prompt, so the prompt
   * needs to be attributable in the log the same way `readToken()`'s is. An
   * implementer that cannot prompt (`DevVaultTokenStore`)
   * ignores it and keeps its zero-arg body -- an optional parameter widens the
   * signature without changing any implementer's arity. */
  isAvailable(context?: string): Promise<boolean>
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
   *  real failure, not an empty slot. Absent on
   *  `DevVaultTokenStore`, which keeps their existing `''`-only semantics
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
 * For a store WITHOUT `readToken()` (`DevVaultTokenStore`),
 * this falls back to `store.getToken()` and maps a non-empty string to
 * `present` and an empty string to `absent`. That fallback is deliberately
 * byte-equivalent to today's conflating behaviour — those stores cannot fail
 * this way, so there is nothing lost by collapsing their `''` to `absent`.
 *
 * The Tauri/keyring path is the one with the observed 9:1 failure rate and is
 * what this seam fixes.
 */
export async function readTokenOutcome(
  store: TokenStore,
  context?: string
): Promise<TokenReadOutcome> {
  if (store.readToken) return store.readToken(context)
  const token = await store.getToken()
  return token ? { status: 'present', token } : { status: 'absent' }
}

// ── Fail-closed default (D-12, Phase 72) ─────────────────────────────────────

/**
 * The module default until bootstrap installs the real store (keyring or
 * dev-vault). It persists nothing: `setToken` throws, reads report an empty /
 * unreadable store, and `clearToken` only warns. This replaces the Electron-era
 * plaintext-capable store, whose plaintext fallback (store the refresh token
 * unencrypted when `safeStorage` was unavailable) would have run in the sidecar
 * if any handler fired before the bootstrap swap. In the sidecar `safeStorage`
 * is a throwing stub, so that path was never legitimate here.
 */
class UnconfiguredTokenStore implements TokenStore {
  async isAvailable(): Promise<boolean> {
    return false
  }

  async getToken(): Promise<string> {
    return ''
  }

  async readToken(): Promise<TokenReadOutcome> {
    return { status: 'unreadable', reason: 'unavailable' }
  }

  async setToken(): Promise<void> {
    throw new Error('Steam token store not installed')
  }

  async clearToken(): Promise<void> {
    logWarning(
      'clearToken called before the Steam token store was installed; nothing to clear',
      LogPrefix.Steam
    )
  }
}

// ── Per-boot slot — swappable per build, no env-var escape hatch ───────────

/**
 * The boot-owned holder of the active TokenStore (D-05, 66.4-07). It starts
 * on the fail-closed `UnconfiguredTokenStore`; the sidecar's 'secret-stores'
 * step calls `configure()` once with the keyring or dev-vault implementation
 * (T-28-10 ordering). There is deliberately no env-var/config-driven
 * auto-selection here (REQ-28-07/D-08). Readers hold `Pick<TokenStoreSlot,
 * 'current'>`.
 */
export interface TokenStoreSlot {
  configure(next: TokenStore): void
  current(): TokenStore
}

export function createTokenStoreSlot(deps: {
  log: (message: string) => void
}): TokenStoreSlot {
  let active: TokenStore = new UnconfiguredTokenStore()
  return {
    configure(next) {
      deps.log(
        `Steam TokenStore implementation set to ${next.constructor.name}`
      )
      active = next
    },
    current() {
      return active
    }
  }
}

// ── One-time legacy-key cleanup (debug/steam-token-survives-keychain) ───────

/**
 * Removes a pre-Tauri Electron-era `TOKEN_STORE_KEY` value from `configStore`
 * (`steam_store/config.json`), if present. Called unconditionally from the
 * sidecar's `bootstrap.ts`, AFTER both arms of `init()`'s secret-store install
 * block (keyring or dev-vault) have already run — under either arm,
 * the token store slot has already been configured away from the unconfigured
 * default (T-28-10 ordering), so this key is fully dead under the current
 * sidecar: its only reader was the deleted Electron-era store, and `storeWriteHandlers.ts`'s D-04 guard rejects any renderer-driven
 * write to it.
 *
 * The value is a frozen artifact of the pre-rearchitecture Electron build's
 * original `finishAuth()` (`configStore.set(TOKEN_STORE_KEY,
 * encryptToken(refreshToken))`, commit `7b82c5ea0`, 2026-06-27) — written
 * three weeks before the Tauri scaffold and nearly a month before this seam
 * existed to wall the key off. Keychain deletion cannot revoke it (it lives in
 * a different store entirely, and the Keychain remains the sole authoritative
 * credential store — this function never touches it), and nothing in current
 * code retires it on its own; this is that retirement, run once per boot
 * (idempotent: a second boot finds the key already gone and no-ops silently).
 *
 * PRESENCE-ONLY, by design: never calls `get()`/`get_nodefault()` on this key
 * and never decodes, hashes, or measures the value in any way — only `has()`
 * and `delete()`. Returns whether the key was present (and has just been
 * deleted) so the caller can decide whether to log; this function itself
 * never logs, so the caller's single line is the one and only receipt
 * (T-28-04: never log the value — and here, never even log unconditionally,
 * since an absent key must produce zero output).
 *
 * Lives HERE, not in `bootstrap.ts` itself, even though `bootstrap.ts` is the
 * call site: `electronUntouched.test.ts`'s by-construction D-04 binding gate
 * (quick-260909-iz2) forbids `bootstrap.ts` from binding `configStore` or
 * `TOKEN_STORE_KEY` directly from the Steam token surface. This module is
 * already the one place in the codebase permitted to touch those two symbols
 * (see this file's header, item (a)) — exposing a single named function is
 * the sanctioned indirection, not a workaround of the gate.
 *
 * Deliberately does NOT go through `applyStoreWrite`
 * (`sidecar/storeWriteHandlers.ts`): that dispatcher's own D-04 guard rejects
 * every write — including a delete — to this exact key, by design, for
 * renderer-initiated writes. This is a sidecar-initiated boot-time cleanup of
 * a dead key, not a write the guard was ever meant to arbitrate, so it calls
 * `configStore` directly, the same way the deleted Electron-era store did.
 */
export function clearOrphanedElectronToken(deps: SteamStoresDeps): boolean {
  const { configStore } = deps.stores.steam
  if (!configStore.has(TOKEN_STORE_KEY)) return false
  configStore.delete(TOKEN_STORE_KEY)
  return true
}
