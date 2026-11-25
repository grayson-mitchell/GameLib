/**
 * `SidecarHumbleSecretStore` — the Tauri sidecar's keyring-backed implementation of Humble's
 * `HumbleSecretStore` seam (Phase 34.4.1 gap-cycle plan 13, closing F-1 BLOCKING /
 * REQ-34.4.1-02 / REQ-34.4.1-GAP-02).
 *
 * `humble/secretStore.ts` (plan 12) defines the seam; the boot (66.3-17) builds this store
 * (or the dev vault) once and requires it at `createHumbleServices()` construction -- the
 * plaintext-under-Tauri Electron default is deleted.
 * This module is the sidecar's own implementation: it binds `sessionCookie` to the
 * `humble-session` keyring slot and `csrfToken` to the `humble-csrf` slot, both allowlisted by
 * plan 11 (`keyringTokenStore.ts`), and is built by `createSidecarHumbleSecretStore()` and handed to the boot
 * — the same convention `bootstrap.ts` already uses for Steam's
 * `SidecarKeyringTokenStore`.
 *
 * Totality discipline mirrored EXACTLY from `SidecarKeyringSlotStore` (plan 11): every method
 * is total (never rejects/throws to its caller), a `null` `keyring_get` result is the healthy
 * first-run case (not logged), and a genuine failure logs exactly one warning naming the
 * channel — never the secret value. There is no fallback of any kind here (D-08/REQ-28-07) —
 * a keyring failure is a failure; the one-time plaintext migration (this module, added by this
 * plan's Task 2, now Rust's since Phase 94) is a distinct, separately-guarded concern layered on top, not a
 * fallback baked into this store's own methods.
 *
 * Import discipline: this module imports the slot-name constants from `keyringTokenStore.ts`
 * rather than retyping the literals `'humble-session'`/`'humble-csrf'` — a drift between the TS
 * literal and Rust's `keyring_account()` allowlist (`src-tauri/src/main.rs`) would otherwise
 * surface only at runtime as `keyring:unknown-slot`, nowhere earlier.
 *
 * **Read caching is inherited, not reimplemented (34.4.1 gap cycle 2 plan 26, F-9's read-count
 * half — user-approved scope widening, see `34.4.1-26-SUMMARY.md`).** `slotStores` below holds
 * exactly ONE `SidecarKeyringSlotStore` per secret per store INSTANCE. The boot builds exactly one
 * instance (66.3-17), so every `getSecret`/`setSecret`/`isAvailable`/`clearSecrets` call across the
 * whole process hits the SAME two slot-store instances. `SidecarKeyringSlotStore`'s own cache + in-flight
 * dedupe (see its doc comment) therefore applies here for free: `storeHumbleSecret()`'s
 * `isAvailable()` probe after every write, and every `HumbleUser.getCredentials()`/
 * `getCsrfToken()` call, no longer each cost a fresh Keychain round trip. `clearSecrets()`
 * delegates to both slots' own `clearToken()`, which invalidates BEFORE issuing the delete (see
 * `keyringTokenStore.ts`) — a Humble disconnect through this store cannot resurrect a stale
 * cached session, the same correctness floor `SidecarKeyringSlotStore` documents for itself.
 */

import { logInfo, LogPrefix } from '../logger'
import type { RequestRustInvoke } from '../host'
import {
  SidecarKeyringSlotStore,
  KEYRING_SLOT_HUMBLE_SESSION,
  KEYRING_SLOT_HUMBLE_CSRF
} from './keyringTokenStore'
import type { HumbleSecretStore, HumbleSecretKey } from '../humble/secretStore'
import type { TokenReadOutcome } from '../storeManagers/steam/tokenStore'

export class SidecarHumbleSecretStore implements HumbleSecretStore {
  /** One `SidecarKeyringSlotStore` per secret, owned by THIS instance (D-05, C-WR-2: the former
   * module-level `SLOT_STORES` is gone). Each is already total on its own (see the doc comment
   * above) -- this map only ever selects which one a given `HumbleSecretKey` addresses; it adds no
   * behavior of its own. */
  private readonly slotStores: Record<HumbleSecretKey, SidecarKeyringSlotStore>

  constructor(requestRustInvoke: RequestRustInvoke) {
    this.slotStores = {
      sessionCookie: new SidecarKeyringSlotStore(
        KEYRING_SLOT_HUMBLE_SESSION,
        requestRustInvoke
      ),
      csrfToken: new SidecarKeyringSlotStore(
        KEYRING_SLOT_HUMBLE_CSRF,
        requestRustInvoke
      )
    }
  }

  /** Drops one slot's read cache (the migration writes around it to prove a real round trip). */
  invalidateCache(key: HumbleSecretKey): void {
    this.slotStores[key].invalidateCache()
  }

  async isAvailable(context?: string): Promise<boolean> {
    // Both slots live in the SAME OS Keychain, addressed under the SAME
    // application/service identity (only the account name differs — see
    // `keyring_account()` in `src-tauri/src/main.rs`): a Keychain that is reachable for one
    // slot is reachable for the other. The session slot's own totalized `isAvailable()` stands
    // in for the whole store rather than probing both slots for one boolean.
    // Forwarded so the Keychain prompt this can raise is attributable to a caller rather than
    // logged as `trigger=unspecified` (quick-260905-jx3). The default names THIS seam, not the
    // slot, so a log line still says something useful when a caller passes nothing.
    return this.slotStores.sessionCookie.isAvailable(
      context ?? 'humble-secret-store-availability'
    )
  }

  async getSecret(key: HumbleSecretKey): Promise<string> {
    return this.slotStores[key].getToken()
  }

  /**
   * Phase 49 (49-06, D-15): the three-state read the boot sign-in probe uses.
   * `context` is a never-secret trigger label forwarded to
   * `SidecarKeyringSlotStore.readToken(context)`, which already stamps
   * `trigger=<context>` on its issue/cache/join/memo lines, so the Keychain
   * prompt this read can raise is attributable. No Humble file imports a
   * Steam gate module for it; the label is a plain string.
   *
   * Sidecar exit contract: this method adds no timer, watcher, socket or child.
   * The in-flight `keyring_get` invoke is bounded by Rust's 45 s
   * `KEYRING_READ_TIMEOUT` and the 60 s `RUST_INVOKE_TIMEOUT_MS`, whose timer is
   * already `unref()`'d (`sidecarRpc.ts`); the pass's bound-abort path is
   * `boundedSignInProbe` resolving `unknown` at `SIGN_IN_PROBE_BOUND_MS`.
   */
  async readSecret(
    key: HumbleSecretKey,
    context?: string
  ): Promise<TokenReadOutcome> {
    return this.slotStores[key].readToken(context)
  }

  async setSecret(key: HumbleSecretKey, value: string): Promise<void> {
    return this.slotStores[key].setToken(value)
  }

  async clearSecrets(): Promise<void> {
    // Both underlying clearToken() calls are already total (never reject) -- Promise.allSettled
    // documents the "clear BOTH independently of each other's outcome" intent explicitly for a
    // future reader, matching the seam's "resolves even if one delete rejects" contract. Each
    // clearToken() call invalidates its OWN cache before issuing its delete (see
    // keyringTokenStore.ts) -- no additional invalidation is needed here.
    await Promise.allSettled([
      this.slotStores.sessionCookie.clearToken(),
      this.slotStores.csrfToken.clearToken()
    ])
  }
}

/**
 * Builds the keyring-backed Humble secret store the boot injects into `createHumbleServices()`
 * (a boot-built instance, no registry). Construction does no I/O and arms nothing; the receipt
 * line belongs to `startSidecarHumbleSecretStore()` below, which the 'secret-stores' boot step runs
 * after the RPC server is bound (T-28-10 placement).
 */
export function createSidecarHumbleSecretStore(
  requestRustInvoke: RequestRustInvoke
): SidecarHumbleSecretStore {
  return new SidecarHumbleSecretStore(requestRustInvoke)
}

/**
 * Logs a confirmation line to `gamelib.log`: the keyring-backed Humble secret store is the one in use.
 * Plan 12's own doc comment flagged the risk this line exists to close: a store that is not actually
 * the keyring one would persist the session in plaintext (F-1, again) -- so the choice must be
 * OBSERVABLE, not assumed. The live-gate re-run (plan 20) greps `gamelib.log` for this exact line.
 *
 * The one-time plaintext-to-keyring migration is NOT run here any more (Phase 94, D-18): Rust owns it
 * (`start_humble_migration` in `src-tauri/src/humble_secrets.rs`, bounded boot work holding a
 * `humble-migration` shutdown registrant), so there is one migrator at every commit. This store keeps
 * serving reads until the Humble user and library move to Rust (94-29); both read the same Keychain
 * items.
 */
export function startSidecarHumbleSecretStore(): void {
  logInfo(
    '[bootstrap] Humble secret store installed: keyring-backed (humble-session/humble-csrf slots)',
    LogPrefix.Backend
  )
}
