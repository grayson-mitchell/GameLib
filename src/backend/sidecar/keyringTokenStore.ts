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
 * Compile-time keyring slot names (34.4.1 gap cycle plan 11, D-GAP-01). **MUST match the
 * Rust-side allowlist in `keyring_account()` (`src-tauri/src/main.rs`) verbatim** — a slot name
 * that does not appear there collapses to `keyring:unknown-slot`. Exported as constants (not
 * retyped literals) so plan 13/14 import the name rather than risk drift between the two sides
 * of the seam.
 *
 * Humble needs TWO slots because it holds two independent secrets (the `_simpleauth_sess`
 * session cookie and the csrf snapshot, today two separate keys in Humble's own config store)
 * — packing both into one slot would make a partial write corrupt both.
 */
export const KEYRING_SLOT_STEAM_REFRESH_TOKEN = 'steam-refresh-token'
export const KEYRING_SLOT_HUMBLE_SESSION = 'humble-session'
export const KEYRING_SLOT_HUMBLE_CSRF = 'humble-csrf'

/**
 * `SidecarKeyringSlotStore` — a slot-parameterized `TokenStore` implementation over the Rust
 * keyring bridge (Phase 28 Plan 04, D-06/D-04; made multi-slot by the 34.4.1 gap cycle plan 11,
 * D-GAP-01). The slot passed at construction selects which allowlisted Keychain account this
 * instance addresses (`keyring_account()` in `src-tauri/src/main.rs`) — it is NEVER a free-form
 * account string; T-28-03 stays enforced entirely on the Rust side.
 *
 * Every method is total: none rejects or throws to its caller. Reads and availability probes
 * collapse any failure into `''`/`false` (D-06's honest-unavailable → clean signed-out);
 * writes/deletes collapse any failure into a resolved void. Each failure path logs exactly
 * one warning naming the channel and the error string — never the secret value (T-28-04).
 *
 * A `null` result from `keyring_get` is the healthy first-run case (Keychain reachable, no
 * entry stored yet) and is NOT logged or treated as unavailable — only a REJECTION from
 * `requestRustInvoke` (Rust's `keyring:unavailable:...`/`keyring:bad-args`/`keyring:unknown-slot`
 * errors, or a 60s `rustInvoke` timeout) is classified as unavailable/failed (RESEARCH.md
 * Pitfall 1).
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
 *
 * Wire shape (Task 1, 34.4.1-11): `keyring_get`/`keyring_delete`/`keyring_available` send the
 * slot as `args[0]`; `keyring_set` sends the secret as `args[0]` and the slot as `args[1]` —
 * these positions match the Rust arms exactly, and there is no default here (unlike the
 * Rust-side `keyring_slot_arg`'s absent-arg default) because this class always has a slot bound
 * at construction.
 */
export class SidecarKeyringSlotStore implements TokenStore {
  constructor(private readonly slot: string) {}

  async isAvailable(): Promise<boolean> {
    try {
      const result = await requestRustInvoke(RUST_KEYRING_AVAILABLE, [this.slot])
      return result === true
    } catch (error) {
      logWarning(
        `SidecarKeyringSlotStore(${this.slot}).isAvailable(): ${RUST_KEYRING_AVAILABLE} failed: ${errorMessage(error)}`,
        LogPrefix.Steam
      )
      return false
    }
  }

  async getToken(): Promise<string> {
    let result: unknown
    try {
      result = await requestRustInvoke(RUST_KEYRING_GET, [this.slot])
    } catch (error) {
      logWarning(
        `SidecarKeyringSlotStore(${this.slot}).getToken(): ${RUST_KEYRING_GET} failed: ${errorMessage(error)}`,
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
      await requestRustInvoke(RUST_KEYRING_SET, [token, this.slot])
    } catch (error) {
      logWarning(
        `SidecarKeyringSlotStore(${this.slot}).setToken(): ${RUST_KEYRING_SET} failed: ${errorMessage(error)}`,
        LogPrefix.Steam
      )
    }
  }

  async clearToken(): Promise<void> {
    try {
      await requestRustInvoke(RUST_KEYRING_DELETE, [this.slot])
    } catch (error) {
      logWarning(
        `SidecarKeyringSlotStore(${this.slot}).clearToken(): ${RUST_KEYRING_DELETE} failed: ${errorMessage(error)}`,
        LogPrefix.Steam
      )
    }
  }
}

/**
 * `SidecarKeyringTokenStore` — the Tauri sidecar's Steam `TokenStore` implementation (Phase 28
 * Plan 04). Preserved verbatim as its own exported class with its original no-argument
 * construction (`bootstrap.ts` calls `new SidecarKeyringTokenStore()` unedited), now implemented
 * as a thin binding of `SidecarKeyringSlotStore` to the `steam-refresh-token` slot.
 *
 * **Phase 30 D-03 — the two-token divergence is ACCEPTED.** Signing in under Tauri does
 * NOT sign you in under Electron: the sidecar stores its refresh token in a keyring-native
 * macOS Keychain entry (this class, via its Rust invoke bridge), while the Electron build
 * stores Chromium OSCrypt ciphertext in its own shared configuration store (see
 * `backend/storeManagers/steam/tokenStore.ts`'s `ElectronTokenStore`). This is the correct, by-construction
 * consequence of Phase 28 D-01 (the sidecar's `TokenStore` implementation is Keychain-
 * native, not OSCrypt-compatible) — it is not a bug, and convergence would require
 * hand-rolling OSCrypt in the sidecar, which Phase 28 D-01 already rejected. See
 * `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md`'s "Accepted Constraints"
 * section (entry added by Phase 30 Plan 04) for the cross-referenced record.
 */
export class SidecarKeyringTokenStore extends SidecarKeyringSlotStore {
  constructor() {
    super(KEYRING_SLOT_STEAM_REFRESH_TOKEN)
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
