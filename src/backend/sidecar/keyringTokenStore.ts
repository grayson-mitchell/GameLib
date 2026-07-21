import { logWarning, LogPrefix } from 'backend/logger'
import type { TokenStore } from 'backend/storeManagers/steam/tokenStore'
import { requestRustInvoke } from './sidecarRpc'
import {
  RUST_KEYRING_GET,
  RUST_KEYRING_SET,
  RUST_KEYRING_DELETE,
  RUST_KEYRING_AVAILABLE
} from 'common/types/sidecarTransport'

/**
 * `SidecarKeyringTokenStore` — the Tauri sidecar's `TokenStore` implementation (Phase 28
 * Plan 04, D-06/D-04).
 *
 * Every method is total: none rejects or throws to its caller. Reads and availability probes
 * collapse any failure into `''`/`false` (D-06's honest-unavailable → clean signed-out);
 * writes/deletes collapse any failure into a resolved void. Each failure path logs exactly
 * one warning naming the channel and the error string — never the token value (T-28-04).
 *
 * A `null` result from `keyring_get` is the healthy first-run case (Keychain reachable, no
 * entry stored yet) and is NOT logged or treated as unavailable — only a REJECTION from
 * `requestRustInvoke` (Rust's `keyring:unavailable:...`/`keyring:bad-args` errors, or a 60s
 * `rustInvoke` timeout) is classified as unavailable/failed (RESEARCH.md Pitfall 1).
 *
 * This module implements D-06 (honest-unavailable → clean signed-out) and D-04 (it
 * structurally cannot corrupt Electron's session): it MUST NOT import the shared Electron
 * config store or the Steam token's storage-key/prefix constants (see
 * `backend/storeManagers/steam/tokenStore.ts` and `./electronStores`) under any circumstance.
 * That absence is REQ-28-02's by-construction enforcement, grep-gated at the phase level by
 * plan 28-05 and asserted structurally by this module's own test file
 * (`keyringTokenStore.test.ts`).
 *
 * No env-var, in-memory, or plaintext fallback exists here (D-08/REQ-28-07) — a Keychain
 * failure is a failure, full stop; there is no dev escape hatch.
 */
export class SidecarKeyringTokenStore implements TokenStore {
  async isAvailable(): Promise<boolean> {
    try {
      const result = await requestRustInvoke(RUST_KEYRING_AVAILABLE, [])
      return result === true
    } catch (error) {
      logWarning(
        `SidecarKeyringTokenStore.isAvailable(): ${RUST_KEYRING_AVAILABLE} failed: ${errorMessage(error)}`,
        LogPrefix.Steam
      )
      return false
    }
  }

  async getToken(): Promise<string> {
    let result: unknown
    try {
      result = await requestRustInvoke(RUST_KEYRING_GET, [])
    } catch (error) {
      logWarning(
        `SidecarKeyringTokenStore.getToken(): ${RUST_KEYRING_GET} failed: ${errorMessage(error)}`,
        LogPrefix.Steam
      )
      return ''
    }
    // `null` == no entry yet (healthy first-run case) -- NOT an error, not logged.
    if (typeof result !== 'string') return ''
    return result
  }

  async setToken(token: string): Promise<void> {
    try {
      await requestRustInvoke(RUST_KEYRING_SET, [token])
    } catch (error) {
      logWarning(
        `SidecarKeyringTokenStore.setToken(): ${RUST_KEYRING_SET} failed: ${errorMessage(error)}`,
        LogPrefix.Steam
      )
    }
  }

  async clearToken(): Promise<void> {
    try {
      await requestRustInvoke(RUST_KEYRING_DELETE, [])
    } catch (error) {
      logWarning(
        `SidecarKeyringTokenStore.clearToken(): ${RUST_KEYRING_DELETE} failed: ${errorMessage(error)}`,
        LogPrefix.Steam
      )
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
