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
 * Bounded negative-result memo window for `getToken()` (34.5 gap cycle 3 plan 25, closing
 * F-34.5-G6-06; extended 15s -> 120s by 34.5 gap cycle 4 plan 35, closing Routing item 3). Every
 * one of the five runner sign-out flows (Epic/GOG/Amazon/Zoom/Steam) calls
 * `window.location.reload()` for its own unrelated reason, which remounts `GlobalState` and
 * unconditionally re-runs Humble's `getCredentials()`/`getCsrfToken()` health check
 * (`GlobalState.tsx`'s mount effect) -- without this memo, a read that timed out on ONE reload is
 * retried, uncached, on the VERY NEXT reload (from any of the five, not just the one whose sign-out
 * happened to precede it in a log), reproducing the same doomed-to-timeout Keychain prompt again
 * before the user has even finished reacting to the first one.
 *
 * **Why 15s was wrong and 120s is the replacement.** The original 15s figure was derived as "~2x
 * `KEYRING_READ_TIMEOUT`'s 8s" -- a plausible-sounding arithmetic relationship that turned out to
 * be wrong against live human timing. A 2026-08-01 live session recorded two sequential Keychain
 * approval prompts for the SAME `steam-refresh-token` slot **101 seconds apart** (19:22:57 and
 * 19:24:38) -- a 15s memo had long since expired by the time the second caller arrived, so the
 * second read was issued uncached and re-triggered the identical doomed-to-timeout prompt.
 * 120_000ms exceeds that observed 101-second interval, and is comfortably more than twice
 * `KEYRING_READ_TIMEOUT`'s own new 45s bound (`src-tauri/src/main.rs`, raised by this same plan) --
 * pinned by a test in this module's test file that parses that constant directly out of `main.rs`
 * rather than hardcoding 45 a second time here.
 *
 * **Accepted cost, stated honestly:** a slot whose underlying read genuinely becomes available
 * again inside the 120s memo window will not be re-read until the window elapses -- a legitimate
 * retry can be delayed by up to two minutes. This is accepted because the alternative is the
 * observed repeat-prompt behaviour this plan closes, and because a SUCCESSFUL read is still cached
 * permanently (see `cachedToken` below) and is completely unaffected by this window -- this is a
 * memo, not a lockout (see `SidecarKeyringSlotStore`'s own doc comment, T-34.5-G6-15).
 */
const KEYRING_FAILURE_MEMO_MS = 120_000

/**
 * Classifies a `getToken()` failure as `'timeout'` or `'unavailable'` for the memo bookkeeping log
 * line below (34.5 gap cycle 4 plan 35, Routing item 3 -- "the failure memo distinguishes a
 * `keyring:timeout` from a `keyring:unavailable` in its log output"). Covers both the Rust-side
 * `keyring:timeout` string (`keyring_get`'s own classification, `src-tauri/src/main.rs`) and the
 * sidecar transport's own `rustInvoke timed out after ...` rejection (`RUST_INVOKE_TIMEOUT_MS`,
 * `src/backend/sidecar/sidecarRpc.ts`) -- both are a timeout from this caller's perspective even
 * though they originate at different layers. Every other rejection (`keyring:unavailable:...`,
 * `keyring:bad-args`, `keyring:unknown-slot`) classifies as `'unavailable'`.
 */
function classifyKeyringFailure(error: unknown): 'timeout' | 'unavailable' {
  const message = errorMessage(error)
  return /timeout|timed out/i.test(message) ? 'timeout' : 'unavailable'
}

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
 *
 * **Process-lifetime read cache + in-flight dedupe (34.4.1 gap cycle 2 plan 26, F-9's read-count
 * half — user-approved scope widening beyond this plan's original `files_modified`, see
 * `34.4.1-26-SUMMARY.md`).** `getToken()`/`isAvailable()` were previously an unconditional
 * `requestRustInvoke` PER CALL — every `HumbleUser`/Steam call site was a fresh Keychain hit, and
 * `deferred-items.md`'s live observation records 20+ macOS Keychain prompts on a single boot as
 * a direct consequence. Both methods now cache their last SUCCESSFUL result on this instance and
 * share one in-flight `Promise` across concurrent callers, so N callers reading the same slot in
 * the same tick issue at most one real `requestRustInvoke` — not N.
 *
 * **This is an in-memory cache of a successfully-decrypted secret, not a fallback (D-08/REQ-28-07
 * is unaffected — there is still no env-var/plaintext/degraded-mode path; a failed read is never
 * cached as if it were a value, and every failure still logs and still resolves the same
 * '' / false this class always resolved).** The tradeoff is explicit: a secret that was read
 * from the Keychain now also lives in this process's memory for as long as the cache is valid,
 * where before it existed only for the duration of a single `requestRustInvoke` round trip. This
 * process is the same one already holding the decrypted value in the caller's own memory
 * immediately after every `getToken()` resolves (Electron/Tauri sidecar processes do not
 * currently defend against a same-process memory read), so this does not introduce a NEW class
 * of exposure — it extends how long an ALREADY-exposed value remains resident. See this plan's
 * SUMMARY threat-model cross-check for the full reasoning.
 *
 * **Bounded negative-result memo (34.5 gap cycle 3 plan 25, F-34.5-G6-06; window extended 15s ->
 * 120s by 34.5 gap cycle 4 plan 35, Routing item 3).** `getToken()` also memoizes a FAILED read for
 * `KEYRING_FAILURE_MEMO_MS` (120s, comfortably more than 2x `KEYRING_READ_TIMEOUT`'s new 45s bound
 * — see that constant's own doc comment for the live-timing arithmetic). This is layered ALONGSIDE
 * the pre-existing in-flight dedupe field declared just above, not a replacement for it: that field
 * collapses CONCURRENT callers in the same tick to one request; the failure memo bounds SEQUENTIAL
 * repeat reads of a request that already finished and failed, which the in-flight field cannot
 * touch once it has cleared in its own `finally`. A memoized failure is returned exactly as any
 * other failure is — `''`, with the ORIGINAL `getToken() failed: ...` warning logged once at the
 * time it actually occurred, plus one additional `keyring failure memoized slot=... class=...
 * ms=...` line naming the timeout-vs-unavailable classification and the memo window — never
 * re-logged from the memo hit itself — and is NEVER treated as a value; it holds no secret at all,
 * unlike `cachedToken`. This does not conflict with the "NOT cached" comment on `fetchToken()`'s
 * catch below, which is about not caching a failure as if it were a confirmed value forever — a
 * time-bounded memo of "this recently failed" is a different, narrower claim that expires and lets
 * a later retry through.
 *
 * **Correctness floor (binding, load-bearing):** the cache — now including the failure memo above —
 * is invalidated at the START of `setToken()`/`clearToken()`, before the underlying keyring call is
 * even issued — a cached value (or a memoized failure) must never survive a write or a delete.
 * `clearToken()` is Humble's disconnect / Steam's sign-out path; a stale cached session token
 * surviving a disconnect would resurrect a logged-out session, which is a strictly worse bug than
 * the read-count problem this cache exists to fix
 * (this phase's own headline defect, F-6, is exactly this class of "disconnect didn't disconnect"
 * failure on the cookie side — this cache must not reintroduce it on the token side). On a
 * SUCCESSFUL write/delete, the cache is repopulated with the now-known-correct value (the token
 * just written, or `''` for a confirmed delete) rather than left empty — this avoids forcing an
 * immediate extra round trip while staying exactly as correct as invalidate-then-refetch would
 * have been. On a FAILED write/delete, the cache is left invalidated (empty), never guessed.
 */
export class SidecarKeyringSlotStore implements TokenStore {
  constructor(private readonly slot: string) {}

  /** Last successful `getToken()` result. `undefined` means "not cached" — deliberately NOT
   * `''` for that state, so a real empty-string-but-cached result (a confirmed no-entry/cleared
   * slot) is distinguishable from "never read". Never populated from a failed read. */
  private cachedToken: { value: string } | undefined
  /** The in-flight `getToken()` fetch, shared by every concurrent caller until it settles. */
  private pendingToken: Promise<string> | undefined
  /** `Date.now()` of the most recent FAILED `getToken()` read, or `undefined` if none is
   * memoized (never failed yet, the memo expired, or the cache was invalidated by a write/delete).
   * Holds a timestamp only — never a secret, never a value — see `KEYRING_FAILURE_MEMO_MS`'s doc
   * comment for why this exists and why it is time-bounded rather than permanent. */
  private failedTokenAt: number | undefined

  /** Last successful `isAvailable()` result. Same `undefined`-means-uncached convention as
   * `cachedToken` above. */
  private cachedAvailable: { value: boolean } | undefined
  /** The in-flight `isAvailable()` probe, shared by every concurrent caller until it settles. */
  private pendingAvailable: Promise<boolean> | undefined

  async isAvailable(): Promise<boolean> {
    if (this.cachedAvailable) return this.cachedAvailable.value
    if (this.pendingAvailable) return this.pendingAvailable
    this.pendingAvailable = this.fetchAvailable()
    try {
      return await this.pendingAvailable
    } finally {
      this.pendingAvailable = undefined
    }
  }

  private async fetchAvailable(): Promise<boolean> {
    try {
      const result = await requestRustInvoke(RUST_KEYRING_AVAILABLE, [this.slot])
      const value = result === true
      // Only a SUCCESSFUL probe is cached -- including a successful "false" (D-06's honest
      // unavailable, not an error). A rejection is never cached as a value (see the method
      // below).
      this.cachedAvailable = { value }
      return value
    } catch (error) {
      logWarning(
        `SidecarKeyringSlotStore(${this.slot}).isAvailable(): ${RUST_KEYRING_AVAILABLE} failed: ${errorMessage(error)}`,
        LogPrefix.Steam
      )
      return false
    }
  }

  async getToken(): Promise<string> {
    if (this.cachedToken) return this.cachedToken.value
    if (this.pendingToken) return this.pendingToken
    // Bounded negative-result memo (F-34.5-G6-06): a read that failed within the last
    // KEYRING_FAILURE_MEMO_MS is returned directly as the same failure, WITHOUT issuing a second
    // keyring_get -- and therefore without a second Keychain prompt. This is checked only after
    // both the success cache and the in-flight dedupe above have already missed, so it never
    // shadows a fresher successful read or an already-in-flight request.
    if (
      this.failedTokenAt !== undefined &&
      Date.now() - this.failedTokenAt < KEYRING_FAILURE_MEMO_MS
    ) {
      return ''
    }
    this.pendingToken = this.fetchToken()
    try {
      return await this.pendingToken
    } finally {
      this.pendingToken = undefined
    }
  }

  private async fetchToken(): Promise<string> {
    let result: unknown
    try {
      result = await requestRustInvoke(RUST_KEYRING_GET, [this.slot])
    } catch (error) {
      logWarning(
        `SidecarKeyringSlotStore(${this.slot}).getToken(): ${RUST_KEYRING_GET} failed: ${errorMessage(error)}`,
        LogPrefix.Steam
      )
      // NOT cached as a VALUE -- a failed/unavailable read must not poison subsequent reads
      // forever (a later retry, once the Keychain is reachable again, must actually try again).
      // It IS memoized as a FAILURE for a bounded window (see KEYRING_FAILURE_MEMO_MS) so the
      // very next sequential caller -- e.g. the next runner's window.location.reload() remounting
      // GlobalState a moment later -- does not repeat an identical doomed-to-timeout read and
      // trigger a second Keychain prompt for a decision the user has not finished making on the
      // first. This timestamp is never surfaced to a caller and never mistaken for a token value.
      this.failedTokenAt = Date.now()
      // A second, memo-specific log line (34.5 gap cycle 4 plan 35, Routing item 3) -- distinct
      // from the warning just above -- naming the timeout/unavailable classification and the
      // window this failure is now memoized for. This is the line a live run greps to prove the
      // memo engaged; its absence on what should have been a second prompt would falsify the fix.
      logWarning(
        `keyring failure memoized slot=${this.slot} class=${classifyKeyringFailure(error)} ms=${KEYRING_FAILURE_MEMO_MS}`,
        LogPrefix.Steam
      )
      return ''
    }
    // `null` == no entry yet (healthy first-run case) -- NOT an error, not logged, and still
    // cached: a confirmed "nothing stored" is exactly as valid a cache entry as a confirmed
    // secret is, and re-probing it on every call is the read-count problem this cache exists
    // to close.
    const value = typeof result === 'string' ? result : ''
    this.cachedToken = { value }
    // A SUCCESSFUL read clears any stale failure memo -- there is nothing left to bound once a
    // real value (or a confirmed no-entry) is cached above and short-circuits future calls first.
    this.failedTokenAt = undefined
    return value
  }

  async setToken(token: string): Promise<void> {
    // Invalidate BEFORE issuing the write -- no cached value (stale OR being-replaced) may be
    // visible to a concurrent getToken() while this write is in flight.
    this.invalidateCache()
    try {
      await requestRustInvoke(RUST_KEYRING_SET, [token, this.slot])
      // The write succeeded -- we now know the correct value without another round trip.
      this.cachedToken = { value: token }
    } catch (error) {
      logWarning(
        `SidecarKeyringSlotStore(${this.slot}).setToken(): ${RUST_KEYRING_SET} failed: ${errorMessage(error)}`,
        LogPrefix.Steam
      )
      // Left invalidated -- a failed write's target value is never cached as if it landed.
    }
  }

  async clearToken(): Promise<void> {
    // Invalidate BEFORE issuing the delete -- see setToken()'s identical reasoning. This is the
    // disconnect/sign-out path; a cached value surviving past this call is the exact failure
    // class this plan's own threat-model cross-check calls out as worse than the bug being
    // fixed.
    this.invalidateCache()
    try {
      await requestRustInvoke(RUST_KEYRING_DELETE, [this.slot])
      // The delete succeeded -- the slot is now confirmed empty.
      this.cachedToken = { value: '' }
    } catch (error) {
      logWarning(
        `SidecarKeyringSlotStore(${this.slot}).clearToken(): ${RUST_KEYRING_DELETE} failed: ${errorMessage(error)}`,
        LogPrefix.Steam
      )
      // Left invalidated -- a failed delete must not be assumed to have succeeded.
    }
  }

  /** Clears both cached values (token + availability) AND the failure memo (F-34.5-G6-06) so the
   * next call of either method issues a fresh `requestRustInvoke`. Called internally by
   * `setToken`/`clearToken` above -- this is the correctness-floor extension: a memoized failure
   * must never survive a write or a delete any more than a cached value may, since a caller
   * reading immediately after a sign-out must always reach the keyring fresh, never a stale memo.
   * Also public so a test (or a future singleton-holding caller, e.g. `humbleSecretStore.ts`'s
   * `SLOT_STORES`) can force invalidation without reaching into private state. Does NOT touch an
   * in-flight `pendingToken`/`pendingAvailable` promise — that request was already sent and will
   * resolve (and cache) independently; there is no way to un-send it, and this mirrors the same
   * best-effort reasoning `bounded_keyring_read`'s "abandoned, not cancelled" doc comment uses
   * on the Rust side for exactly the same class of already-in-flight operation. */
  invalidateCache(): void {
    this.cachedToken = undefined
    this.cachedAvailable = undefined
    this.failedTokenAt = undefined
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
