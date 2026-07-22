---
phase: 28-tauri-keyring-real-safestorage-via-the-keyring-crate
reviewed: 2026-07-22T02:32:03Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - src-tauri/Cargo.toml
  - src-tauri/src/main.rs
  - src/backend/sidecar/__tests__/electronUntouched.test.ts
  - src/backend/sidecar/__tests__/keyringTokenStore.test.ts
  - src/backend/sidecar/__tests__/rustInvokeChannel.test.ts
  - src/backend/sidecar/__tests__/skeletonFlows.test.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/sidecar/electronStub.ts
  - src/backend/sidecar/keyringTokenStore.ts
  - src/backend/sidecar/sidecarRpc.ts
  - src/backend/storeManagers/steam/__tests__/tokenStore.test.ts
  - src/backend/storeManagers/steam/__tests__/user.test.ts
  - src/backend/storeManagers/steam/tokenStore.ts
  - src/backend/storeManagers/steam/user.ts
  - src/common/types/sidecarTransport.ts
findings:
  critical: 0
  warning: 5
  info: 2
  total: 7
status: issues_found
---

# Phase 28: Code Review Report

**Reviewed:** 2026-07-22T02:32:03Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed the sidecar→Rust `rustInvoke` channel, the real macOS-Keychain-backed `TokenStore`
seam, the "honest" `safeStorage` stub, and the test-safety remediation that followed this
phase's data-destroying test incident (commit `92c29a5e`).

**No Critical findings.** The core security properties this phase set out to build hold up
under adversarial reading:

- The test-data-destruction remediation is sound. `electronUntouched.test.ts` contains zero
  `.set()`/`.delete()`/`.clear()` calls against the real `configStore` anywhere in the file
  (verified by grep, not just by reading), and `fileStore.ts`'s `persist()` is only invoked
  from `set`/`delete`/`clear`/the `store` setter — never from construction or `get` — so merely
  importing/reading the real store in this suite cannot create or mutate the on-disk file
  either. `skeletonFlows.test.ts`'s `jest.mock('os', ...)` homedir override is a top-level
  `jest.mock()` call (hoisted above all imports by babel-plugin-jest-hoist) and `pathShim.ts`'s
  `resolveAppDataDir()` calls `homedir()` fresh on every invocation rather than caching it at
  import time — so the override cannot be bypassed by import ordering. This is a real fix, not
  a cosmetic one.
- No refresh-token material leaks into logs, error strings, or Rust `eprintln!` diagnostics on
  any path checked (`dispatch_rust_channel`'s failure branches log `channel`/`{e:?}` only, never
  `args`; `SidecarKeyringTokenStore`'s warnings log the channel and error message only).
- `ElectronTokenStore` is verified byte-identical to the pre-phase inline
  `encryptionAvailable`/`encryptToken`/`decryptToken` logic in `user.ts` (diffed directly
  against commit `cdd71a9c` — the three private methods are the extracted, unmodified bodies of
  the former free functions, and every call site's control flow is preserved).
- The Deny-path classification concern (Priority Area 6) does not manifest as a bug: no code in
  `dispatch_rust_channel` or `SidecarKeyringTokenStore` branches on a specific
  non-`NoEntry` `keyring::Error` variant, so `PlatformFailure` (Deny) and any other unavailable
  state are already treated identically — "is it `NoEntry`, or is it anything else" — matching
  D-06. No retry loop exists anywhere in the reviewed code.

The Warning-level findings below are about an **incomplete migration**: `SteamUser.logout()`
was not routed through the new `TokenStore` seam the way `getCredentials()`/`finishAuth()`/the
QR `authenticated` handler were, plus a few smaller transport/test-hardening gaps. None of these
are reachable today (the sidecar has no registered `logout` channel and the login flow itself is
explicitly deferred per D-02/D-03), but they are real gaps a future phase will hit as soon as the
login/logout channel is ported, and none of them are called out as known/deferred anywhere in
this phase's planning docs.

## Warnings

### WR-01: `SteamUser.logout()` was not migrated onto the `TokenStore` seam

**File:** `src/backend/storeManagers/steam/user.ts:148-174` (specifically line 172,
`configStore.clear()`)
**Issue:** `getCredentials()`, `finishAuth()`, and the QR `authenticated` handler were all
migrated this phase to read/write the refresh token through `getTokenStore()` (D-09). `logout()`
was not: it still calls `configStore.clear()` directly and never calls
`getTokenStore().clearToken()`.

For the Electron build this is harmless today (the token lives inside `configStore` under
`TOKEN_STORE_KEY`, so `clear()` incidentally wipes it too). For the sidecar build, once the login
channel is ported, this becomes two real bugs at once:

1. **Stale credential survives logout.** `SidecarKeyringTokenStore` stores the refresh token in
   the OS Keychain, not in `configStore`. `logout()`'s `configStore.clear()` would clear
   `isLoggedIn`/`userData` but leave the real Keychain entry (`com.gamelib.launcher` /
   `steam-refresh-token`) untouched — a user who clicks "Log out" would see a signed-out UI while
   a valid refresh token remains recoverable via `getTokenStore().getToken()`.
2. **Blanket wipe of the shared store, from the sidecar.** If `logout()` ever becomes reachable
   from the Tauri build (a near-certainty once login is ported, since logout is the natural
   companion feature), `configStore.clear()` deletes the *entire* shared store —
   `isLoggedIn`/`userData`/`refreshToken` and anything else keyed there — not just the Steam
   token. That is a strictly larger blast radius against the exact file D-04 exists to protect
   than the single-key write D-04's proof suite (`electronUntouched.test.ts`) checks for. The
   existing D-04 proof only asserts `SidecarKeyringTokenStore`'s four methods don't touch
   `configStore` — it does not (and structurally cannot, since `logout()` lives in `user.ts`, not
   `keyringTokenStore.ts`) catch this.

Not reachable today: `steamFlowRegistration.ts`/`handlers.ts` register no `logout`/`steamLogout`
channel in the sidecar's `handlerRegistry`, so this file's `logout()` cannot currently be invoked
from a Tauri build. Flagging now because nothing in `28-CONTEXT.md`/`28-RESEARCH.md`/
`deferred-items.md` records this as a known gap, so the next phase that ports the login channel
has no signal that `logout()` needs the same seam treatment as the other three call sites.

**Fix:**
```ts
static logout(): void {
  if (this.client) {
    try {
      this.client.logOff()
    } catch (err) {
      logWarning(['Steam client logOff error during logout:', err], LogPrefix.Steam)
    }
    this.client = null
  }
  this.connectingPromise = null
  this.session = null
  this.qrSessionState = { status: 'waiting' }
  const pendingCbs = SteamUser._credSettleCallbacks
  SteamUser._credSettleCallbacks = []
  SteamUser.credSessionState = { status: 'error' }
  for (const cb of pendingCbs) cb({ status: 'error' })
  // Clear the token through the seam FIRST (works for both builds), then the
  // remaining shared, non-token state.
  void getTokenStore().clearToken()
  configStore.delete('isLoggedIn')
  configStore.delete('userData')
  logInfo('Logging user out from Steam', LogPrefix.Steam)
}
```
(Replacing the blanket `configStore.clear()` with targeted `delete()` calls also avoids
clobbering any future unrelated key added to the same store.)

### WR-02: `isAvailable()` has the same user-facing side effect as an actual token read

**File:** `src/backend/sidecar/keyringTokenStore.ts:37-48`,
`src-tauri/src/main.rs:258-274` (`"keyring_available"` arm)
**Issue:** `keyring_available` is implemented as `entry.get_password()`, discarding the result —
it is not a lighter-weight capability probe. Per `28-PROOF.md` Finding 2 (hardware-confirmed this
phase), macOS only challenges a process for a Keychain item it does not already own; a rebuilt or
otherwise "foreign" binary triggers a real authorization prompt on that read. Today nothing calls
`isAvailable()` in production code (grepped; only `getToken`/`setToken`/`clearToken` are called
from `user.ts`), so this is latent. But the method's name and its doc comment ("Whether this
store's underlying encryption/secure-storage mechanism is currently usable") strongly invite a
future caller — e.g. a settings screen polling Keychain health, or a pre-flight check before
showing a login button — to treat it as side-effect-free. It is not: calling it can pop the same
Deny/Approve prompt a real read would, and calling it in a poll loop would re-prompt repeatedly.
**Fix:** Document this loudly on `isAvailable()`'s doc comment (both the interface in
`tokenStore.ts` and the implementation in `keyringTokenStore.ts`) — "calling this may trigger a
Keychain authorization prompt; do not poll it" — or, if a future consumer needs a truly passive
check, give Rust a distinct arm that inspects `Entry::new(...).is_ok()` without calling
`get_password()`/`set_password()` at all.

### WR-03: `RUST_INVOKE_CHANNELS` and `dispatch_rust_channel`'s match arms have no shared source of truth

**File:** `src/common/types/sidecarTransport.ts:150-155`, `src-tauri/src/main.rs:206-277`
**Issue:** The TypeScript allowlist and the Rust dispatcher are two independently maintained
lists that must stay in lockstep by convention only (the TS comment says so explicitly: "Must be
kept in sync with Rust's `dispatch_rust_channel` match arms"). They agree today (4 keyring
channels on both sides), and a mismatch fails closed on either side (TS rejects
non-allowlisted channels before emitting a frame; Rust's `_ => Err(...)` catches anything TS
lets through that Rust doesn't recognize) — so this is not a security gap. It is a maintainability
one: a future channel added to one side and forgotten on the other silently degrades to "always
rejects," discoverable only at runtime.
**Fix:** No urgent action; consider a small `cargo build`-time or CI check that greps both files
for the channel name set and fails if they diverge, before this list grows past four entries.

### WR-04: Test-quality — `electronUntouched.test.ts`'s comment-stripping gate doesn't handle inline comments

**File:** `src/backend/sidecar/__tests__/electronUntouched.test.ts:309-316`
**Issue:** `stripComments()` filters out lines that *start with* (after leading whitespace)
`//`, `*`, or `/*`. It does not strip trailing `//` comments on an otherwise-live line, nor a
`/* ... */` block that begins mid-line. A future edit like
`someRealCall(); // this module used to reach configStore` would leave `configStore` in the
stripped text on a line that is not actually a real reference, producing a false-positive gate
failure (safe direction — it can only make the gate over-strict, never silently pass a real
regression) but a maintenance nuisance the next person to touch this file will have to debug.
**Fix:** Either restrict future comments in these two source-gated files to leading `//`/`/** */`
forms only (document the constraint next to the gate), or strengthen `stripComments()` to also
strip trailing `//...` and non-line-initial `/* ... */` spans.

### WR-05: `isValidRequest()` still accepts `'openExternal'` as an inbound kind it can never legitimately receive

**File:** `src/backend/sidecar/sidecarRpc.ts:71-82`
**Issue:** `SidecarRpcKind` includes `'rustInvoke'`, which `isValidRequest()`'s accepted-kind set
deliberately excludes with a comment explaining the direction guard (T-28-03b). `'openExternal'`
is the same kind of direction-asymmetric frame (sidecar → shell only, per this file's own
`requestOpenExternal()` and the module's docstring: "the shell never sends one inbound"), but
`isValidRequest()` still lists it (line 78: `request.kind === 'openExternal'`) as a valid inbound
kind. Because `handleFrame()`'s subsequent dispatch only special-cases `'invoke'`/`'send'`, an
inbound `'openExternal'` frame that passes `isValidRequest()` falls through to the same
"unrecognized frame kind" `stderr` branch a rejected frame would have hit anyway — so there is no
functional gap today, only an inconsistency between the code and its own stated invariant, and a
(very unlikely, since the shell is a trusted local sibling process) window where this frame kind
is validated-and-then-ignored instead of rejected-and-logged at the earlier, clearer checkpoint.
**Fix:** Drop `'openExternal'` from `isValidRequest()`'s accepted set too (mirroring how
`'rustInvoke'` is already excluded), so both direction-asymmetric kinds are rejected at the same
checkpoint for the same stated reason.

## Info

### IN-01: Test-safety remediation (commit `92c29a5e`) verified sound

Not a defect — recorded per this review's explicit priority instructions. Checked directly, not
assumed:
- `grep -n "steamConfigStore\.\(set\|delete\|clear\)\|configStore\.\(set\|delete\|clear\)"` against
  `electronUntouched.test.ts` returns zero matches — the file is structurally read-only.
- `fileStore.ts`'s `persist()` (the only thing that writes bytes to disk) is called exclusively
  from `set()`/`delete()`/`clear()`/the `store` setter, never from the constructor or `get()` —
  so even module import + read-only access in this suite cannot create a store file where none
  existed.
- `skeletonFlows.test.ts`'s `jest.mock('os', () => ({ ...actual, homedir: () => <tmp dir> }))` is
  a top-level statement, hoisted above every `import` in the file (Jest's
  babel-plugin-jest-hoist), and `pathShim.ts`'s `resolveAppDataDir()` calls `homedir()` fresh on
  every call rather than caching a module-scope constant — so there is no import-ordering path
  that could resolve the real `~/Library/Application Support/GameLib` directory from this file.
- `bootstrap.test.ts` (out of this phase's file scope, pre-existing) was spot-checked and does
  **not** override `jest.mock('electron', ...)`/`jest.mock('electron-store', ...)` at all, so it
  falls through to the backend-wide tmpdir-backed manual mock (`src/backend/__mocks__/
  electron.ts`) by default and never touches the real store either — confirming the incident was
  specific to the two files this phase's remediation already targeted.

### IN-02: Unbounded worker-thread spawn per `rustInvoke` frame

**File:** `src-tauri/src/main.rs:441` (`thread::spawn(move || { ... dispatch_rust_channel ... })`)
**Issue:** Every inbound `rustInvoke` frame spawns a new OS thread with no concurrency cap. The
sidecar is a trusted local child process the shell itself spawned, so this isn't an externally
reachable DoS today, but a bug in a future `rustInvoke` consumer (e.g. a retry loop, or the
polling pattern WR-02 warns against) could exhaust OS threads. Worth a bound (a small thread pool
or a simple in-flight counter) if this channel gains more consumers than the current single
keyring caller.

---

_Reviewed: 2026-07-22T02:32:03Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
