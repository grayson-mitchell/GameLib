---
phase: quick-260814-r2d
plan: 01
subsystem: auth
tags: [keyring, tauri-sidecar, steam, token-store, macos-keychain]

requires: []
provides:
  - "TokenReadOutcome discriminated union (present/absent/unreadable) on the shared TokenStore seam"
  - "SidecarKeyringSlotStore.readToken() as the keyring read primitive, with getToken() reduced to a lossy adapter over it"
  - "ensureConnected()/getCredentials() branching on the three-state outcome instead of the lossy '' collapse"
affects: [steam-auth, tauri-sidecar-keyring]

tech-stack:
  added: []
  patterns:
    - "Optional additive interface member (readToken?()) + a shared fallback helper (readTokenOutcome()) so a widened seam does not force every implementer to change"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/tokenStore.ts
    - src/backend/sidecar/keyringTokenStore.ts
    - src/backend/storeManagers/steam/user.ts
    - src/backend/storeManagers/steam/__tests__/tokenStore.test.ts
    - src/backend/sidecar/__tests__/keyringTokenStore.test.ts
    - src/backend/storeManagers/steam/__tests__/user.test.ts

key-decisions:
  - "A memoized failure now answers unreadable/<original reason>, never absent — the 120s window and prompt-suppression effect are unchanged, only the answer served changes"
  - "getToken()'s '' contract is kept byte-identical for backward compatibility; only readToken()/readTokenOutcome() give the third state to callers that ask for it"
  - "No env-var/in-memory/plaintext fallback added (D-08/REQ-28-07 upheld); an unreadable read yields no token, it fails closed"

requirements-completed:
  - TODO-keyring-read-timeout-reported-as-no-token
  - REQ-28-07-UPHELD
  - REQ-28-02-UPHELD
  - F-34.5-G6-06-PRESERVED

duration: ~55min
completed: 2026-08-14
---

# Quick Task 260814-r2d: Fix keyring read timeout reported as "no token" Summary

**A `keyring_get` timeout or Keychain Deny is now reported as `unreadable` with a reason, never collapsed into the same `''` a genuinely empty slot returns — `ensureConnected()` keeps the signed-in session and logs a distinct retryable warning instead of "no stored refresh token."**

## Performance

- **Tasks:** 3/3 completed
- **Files modified:** 6 (3 source, 3 test)

## Accomplishments

- Added an additive `TokenReadOutcome` (`present`/`absent`/`unreadable`) contract to the `TokenStore` seam and a `readTokenOutcome()` fallback helper, with `ElectronTokenStore`/`DevVaultTokenStore` left byte-identical.
- Made `SidecarKeyringSlotStore.readToken()` the real read primitive: a `keyring:timeout` and a `keyring:unavailable` (Keychain Deny / `PlatformFailure(-128)`) both resolve `unreadable` with a correct `reason`; `getToken()` is now a thin lossy adapter over it.
- Fixed the load-bearing bug: the 120s failure memo (`KEYRING_FAILURE_MEMO_MS`, unchanged) now answers a repeat read with `unreadable/<original reason>` instead of silently downgrading to `absent` — the memo's prompt-suppression effect (zero additional `keyring_get` on a hit) is preserved.
- `SteamUser.ensureConnected()` branches on the three-state outcome: `unreadable` logs a distinct retryable warning (never contains the substring `no stored refresh token`), keeps the session, clears nothing, and returns `false`; `absent` keeps the original warning verbatim; `present` proceeds unchanged.
- `SteamUser.getCredentials()` rewritten in terms of `readTokenOutcome()` so both `absent` and `unreadable` map to `undefined` — signature and every other caller unchanged.

## Task Commits

1. **Task 1: Add the additive TokenReadOutcome contract and the readTokenOutcome() fallback helper** - `904dbd867` (feat)
2. **Task 2: Make readToken() the keyring read primitive and stop the memo answering "absent"** - `7020c22a9` (fix)
3. **Task 3: Stop ensureConnected() reporting an unreadable token as signed-out, and audit the clearToken() callers** - `8dc617b4b` (fix)

_No plan-metadata commit — the orchestrator handles the docs commit per this plan's own `<output>` instruction._

## Files Created/Modified

- `src/backend/storeManagers/steam/tokenStore.ts` - Added `TokenUnreadableReason`/`TokenReadOutcome`, optional `readToken?()` on `TokenStore`, and `readTokenOutcome(store)` fallback helper
- `src/backend/sidecar/keyringTokenStore.ts` - Added `readToken()` as the primitive (three distinct outcomes with correct `reason`), added `failedTokenReason` field so a memo hit carries the original classification, reduced `getToken()` to a thin adapter
- `src/backend/storeManagers/steam/user.ts` - `ensureConnected()` and `getCredentials()` now route through `readTokenOutcome(getTokenStore())` and branch on all three states
- `src/backend/storeManagers/steam/__tests__/tokenStore.test.ts` - 4 new tests for `readTokenOutcome()`'s delegation/fallback behaviour
- `src/backend/sidecar/__tests__/keyringTokenStore.test.ts` - 7 new tests for `readToken()`/`readTokenOutcome()` (nested inside the existing `SidecarKeyringTokenStore` describe so they inherit its `beforeEach` mock wiring)
- `src/backend/storeManagers/steam/__tests__/user.test.ts` - 5 new tests using a fake `TokenStore` installed through the real `setTokenStore()` seam, restored to `ElectronTokenStore` in `afterEach`

## Decisions Made

- Kept `getToken()`'s documented `''`-means-none-or-unavailable contract completely unchanged — `humbleSecretStore.ts`'s `getSecret()` and every pre-existing caller compiles and behaves identically, verified by the full `humbleSecretStore.test.ts`/`electronUntouched.test.ts` suites passing unmodified.
- Did not raise `KEYRING_READ_TIMEOUT` (still 45s, `src-tauri/src/main.rs:1182`) and did not touch `src-tauri/` at all — confirmed by `git diff --stat` below.
- Left `KEYRING_FAILURE_MEMO_MS` at `120_000` — only what the memo answers changed, not the window.

## Deviations from Plan

None — plan executed exactly as written. One structural correction was needed during Task 2's test authoring (not a deviation from the plan's *instructions*, but a self-caught test-harness bug): my first attempt placed the new `readToken()`/`readTokenOutcome()` test suite as a **sibling** `describe()` block after the outer `describe('SidecarKeyringTokenStore', ...)` closed, so it did not inherit that describe's `beforeEach` (which re-wires `mockRequestRustInvoke`'s implementation and resets `program`/`callLog` — `resetMocks: true` wipes the mock's implementation before every test). This produced a false, uninformative failure pattern (every assertion reporting `absent`/empty `callLog`, unrelated to the real present/absent/unreadable logic under test) rather than a genuine RED proof. Caught immediately by inspecting the failure shape, fixed by nesting the new `describe()` inside the outer one before writing the real RED transcript captured below. No test assertions were weakened to work around this — the fix was structural (test placement), not a change to what was being asserted.

## Known Stubs

None.

## Threat Flags

None — this plan's changes stay within the `<threat_model>` boundaries and dispositions already recorded in the plan (T-r2d-01 through T-r2d-04, T-r2d-SC). No new network endpoint, auth path, file-access pattern, or schema change was introduced.

---

## 1. Verbatim RED jest output for behaviours this plan CHANGES (captured before their fix)

### Task 2 — three fix-proving assertions (timeout, Deny/unavailable, memo hit)

Command: `npx jest src/backend/sidecar/__tests__/keyringTokenStore.test.ts -t "readToken() / readTokenOutcome"` run against the pre-fix `SidecarKeyringSlotStore` (Task 1 committed, Task 2's `readToken()` not yet implemented):

```
readToken() / readTokenOutcome() — timeout-vs-absent (quick-260814-r2d)
  ✕ resolves { status: "unreadable", reason: "timeout" } when keyring_get rejects with keyring:timeout (2 ms)
  ✕ resolves { status: "unreadable", reason: "unavailable" } when keyring_get rejects with keyring:unavailable:Platform secure storage failure
  ✓ resolves { status: "absent" } when keyring_get resolves null (the healthy first-run case)
  ✓ resolves { status: "present", token } when keyring_get resolves a non-empty string
  ✕ a memo hit resolves { status: "unreadable" } carrying the ORIGINAL failure reason, and issues ZERO additional keyring_get
  ✓ a failed read issues no keyring_delete and no keyring_set: the callLog contains only the one keyring_get
  ✓ getToken() still resolves "" for both absent and unreadable outcomes

  ● readToken() / readTokenOutcome() ... › resolves { status: "unreadable", reason: "timeout" } when keyring_get rejects with keyring:timeout

    expect(received).resolves.toEqual(expected) // deep equality

    - Expected  - 2
    + Received  + 1

      Object {
    -   "reason": "timeout",
    -   "status": "unreadable",
    +   "status": "absent",
      }

  ● readToken() / readTokenOutcome() ... › resolves { status: "unreadable", reason: "unavailable" } when keyring_get rejects with keyring:unavailable:Platform secure storage failure

    expect(received).resolves.toEqual(expected) // deep equality

    - Expected  - 2
    + Received  + 1

      Object {
    -   "reason": "unavailable",
    -   "status": "unreadable",
    +   "status": "absent",
      }

  ● readToken() / readTokenOutcome() ... › a memo hit resolves { status: "unreadable" } carrying the ORIGINAL failure reason, and issues ZERO additional keyring_get

    expect(received).resolves.toEqual(expected) // deep equality

    - Expected  - 2
    + Received  + 1

      Object {
    -   "reason": "timeout",
    -   "status": "unreadable",
    +   "status": "absent",
      }

Test Suites: 1 failed, 1 total
Tests:       3 failed, 45 skipped, 4 passed, 52 total
```

All three failures show the exact expected-vs-actual diff the plan predicted: `{ status: 'unreadable', reason: '<x>' }` expected, `{ status: 'absent' }` received — the pre-fix fallback path (routing through today's conflating `getToken()`) collapsing every failure into the same answer a genuinely empty slot returns.

**Regression guards that passed pre-fix (as expected, not weakened):** `null` → `absent`; non-empty string → `present`; failed read issues no `keyring_delete`/`keyring_set`; `getToken()` still resolves `''` for both `absent` and `unreadable`. All four assertions are unmodified from how they read in the final, post-fix commit.

### Task 3 — the unreadable-is-not-logged-out assertion

Command: `npx jest src/backend/storeManagers/steam/__tests__/user.test.ts -t "unreadable read is not logged-out"` run against the pre-fix `user.ts` (Tasks 1–2 committed, Task 3's `ensureConnected()`/`getCredentials()` branching not yet implemented):

```
ensureConnected() — unreadable read is not logged-out (quick-260814-r2d)
  ✕ does NOT log "no stored refresh token" on an unreadable read, and DOES log a distinct retryable warning naming the reason (11 ms)
  ✓ an unreadable read calls neither clearToken() on the store nor configStore.delete for isLoggedIn/userData — the session survives
  ✓ the absent branch still logs the original "no stored refresh token" warning and returns false
  ✓ the present branch still reaches the connect path with the token (1 ms)
  ✓ getCredentials() still maps present to { refreshToken } and both absent/unreadable to undefined

  ● SteamUser › ensureConnected() — unreadable read is not logged-out (quick-260814-r2d) › does NOT log "no stored refresh token" on an unreadable read, and DOES log a distinct retryable warning naming the reason

    expect(received).toBe(expected) // Object.is equality

    Expected: false
    Received: true

      1109 |       expect(
      1110 |         warningLines.some((l) => l.includes('no stored refresh token'))
    > 1111 |       ).toBe(false)
           |         ^
      1112 |       expect(
      1113 |         warningLines.some(
      1114 |           (l) => /retry/i.test(l) && /timeout/.test(l)

Test Suites: 1 failed, 1 total
Tests:       1 failed, 69 skipped, 4 passed, 74 total
```

The old code's `getCredentials()`-based branch treats the fake store's `getToken()` returning `''` (the pre-fix collapse of `unreadable`) exactly like a genuinely empty slot, so it logs `no stored refresh token` — the assertion that it should NOT log that string failed with `Expected: false, Received: true`, a real behavioural diff.

**Regression guards that passed pre-fix (as expected, not weakened):** the unreadable read calls neither `clearToken()` nor `configStore.delete` (today's code already clears nothing on this path); the `absent` branch still logs the original warning; the `present` branch still reaches the connect path; `getCredentials()` still maps `present`/`absent`/`unreadable` the same way pre- and post-fix (the mapping logic itself doesn't change — only what feeds it does).

None of the seven regression-guard assertions across Tasks 2 and 3 were altered, weakened, or rewritten to force a red. They were written once, against the post-fix expected shape, and happened to already hold pre-fix because the behaviours they cover were not the ones this plan changes.

## 2. clearToken() / clearSecrets() / SteamUser.logout caller audit

Re-derived independently via grep (not trusted from the plan's own reading) before writing the Task 3 code:

```
$ grep -rn "clearToken(" src/ --include="*.ts" --include="*.tsx" | grep -v "__tests__"
src/frontend/state/SteamSignOut.ts:11: * awaits `getTokenStore().clearToken()`, which may be an RPC round-trip to
src/backend/sidecar/devSecretVault.ts:184:  async clearToken(): Promise<void> {
src/backend/sidecar/keyringTokenStore.ts:150: * is invalidated at the START of `setToken()`/`clearToken()`, before the underlying keyring call is
src/backend/sidecar/keyringTokenStore.ts:152: * `clearToken()` is Humble's disconnect / Steam's sign-out path; a stale cached session token
src/backend/sidecar/keyringTokenStore.ts:381:  async clearToken(): Promise<void> {
src/backend/sidecar/keyringTokenStore.ts:395:        `SidecarKeyringSlotStore(${this.slot}).clearToken(): ${RUST_KEYRING_DELETE} ok`,
src/backend/sidecar/keyringTokenStore.ts:400:        `SidecarKeyringSlotStore(${this.slot}).clearToken(): ${RUST_KEYRING_DELETE} failed: ${errorMessage(error)}`,
src/backend/sidecar/humbleSecretStore.ts:37: * delegates to both slots' own `clearToken()`, which invalidates BEFORE issuing the delete (see
src/backend/sidecar/humbleSecretStore.ts:85:    // Both underlying clearToken() calls are already total (never reject) -- Promise.allSettled
src/backend/sidecar/humbleSecretStore.ts:88:    // clearToken() call invalidates its OWN cache before issuing its delete (see
src/backend/sidecar/humbleSecretStore.ts:91:      SLOT_STORES.sessionCookie.clearToken(),
src/backend/sidecar/humbleSecretStore.ts:92:      SLOT_STORES.csrfToken.clearToken()
src/backend/storeManagers/steam/user.ts:236:   * TokenStore seam (getTokenStore().clearToken()) — never a direct
src/backend/storeManagers/steam/user.ts:243:   * clearToken() may be an async RPC round-trip to Rust in the sidecar build,
src/backend/storeManagers/steam/user.ts:276:    await getTokenStore().clearToken()
src/backend/storeManagers/steam/tokenStore.ts:73:  clearToken(): Promise<void>
src/backend/storeManagers/steam/tokenStore.ts:171:  async clearToken(): Promise<void> {

$ grep -rn "clearSecrets(" src/ --include="*.ts" --include="*.tsx" | grep -v "__tests__"
src/backend/humble/user.ts:961:    // replacement for it. getHumbleSecretStore().clearSecrets() is already
src/backend/humble/user.ts:966:      await getHumbleSecretStore().clearSecrets()
src/backend/humble/secretStore.ts:83:  clearSecrets(): Promise<void>
src/backend/humble/secretStore.ts:150:  async clearSecrets(): Promise<void> {
src/backend/sidecar/devSecretVault.ts:207:  async clearSecrets(): Promise<void> {
src/backend/sidecar/humbleSecretStore.ts:36: * `getCsrfToken()` call, no longer each cost a fresh Keychain round trip. `clearSecrets()`
src/backend/sidecar/humbleSecretStore.ts:84:  async clearSecrets(): Promise<void> {

$ grep -rn "SteamUser\.logout\|SteamUser\s*\.\s*logout" src/ --include="*.ts" --include="*.tsx" | grep -v "__tests__"
src/frontend/state/SteamSignOut.ts:9,10,27: (doc comments only)
src/backend/main.ts:916,920: addListener('logoutSteam', async () => SteamUser.logout())
src/backend/sidecar/steamAuthFlowRegistration.ts:34,39,176,184: (doc comments + SteamUser.logout().catch(...))
```

**Finding — the ONLY caller of `getTokenStore().clearToken()` for the Steam refresh token** is `SteamUser.logout()` at `user.ts:276`. `clearToken()` elsewhere in the grep output is either (a) the Humble sidecar's own `clearSecrets()` delegating to its *own* independent slots (`humble-session`/`humble-csrf`, `humbleSecretStore.ts`) — a wholly separate secret from the Steam refresh token this plan concerns — or (b) documentation/comment references.

`SteamUser.logout()` itself is reachable from **two** listener registrations, both firing on the same `logoutSteam` IPC channel and neither auto-triggered by a failed read:

1. `src/backend/main.ts:920` — `addListener('logoutSteam', async () => SteamUser.logout())` (Electron build's registration).
2. `src/backend/sidecar/steamAuthFlowRegistration.ts:184` — `ipcMain.on('logoutSteam', () => { SteamUser.logout().catch(...) })` (Tauri sidecar's registration of the same channel).

This is a small, honest correction to the plan's own reading, which named only `main.ts:920` — the grep additionally surfaces the Tauri-side listener at `steamAuthFlowRegistration.ts:184`, registered for the identical `logoutSteam` channel. It does not change the conclusion: both listeners are fired only by the frontend's `logoutSteam` `send`, itself dispatched only from `src/frontend/state/SteamSignOut.ts`'s `performSteamLogout()` (line 146), which `GlobalState.tsx`'s `steamLogout` assigns to the user-facing sign-out action (`GlobalState.tsx:790`, `logout: this.steamLogout` at line 1707). **No code path clears the Steam refresh token as a consequence of a failed read** — the 19:14:25 delete in the todo's timeline was the user reacting to the false logged-out state produced by fault 1 (now fixed), not an automatic clear triggered by the read failure itself.

## 3. Final verification results

**Full jest suite** (`npx jest`), run after all three tasks were committed:

```
Test Suites: 249 passed, 249 total
Tests:       1 skipped, 4859 passed, 4860 total
Snapshots:   0 total
Time:        22.651 s, estimated 24 s
Ran all test suites in 5 projects.
```

Zero regressions. One test (`src/backend/sidecar/__tests__/enrichmentFlows.test.ts`, `REQ-34.2-07 getAnticheatInfo ... with no data file at all`) failed on an earlier full-suite run but passed both in isolation (`-t` filter, before and after this plan's changes) and on a clean re-run of the full suite immediately after — confirmed as a pre-existing flake unrelated to this plan (no file this plan touches is in that test's import graph). Not counted as a regression.

**`npx tsc --noEmit`:** exits 0, no output.

**Plan's own `<verification>` gates**, run after Task 3:

```
$ grep -n "readToken" src/backend/storeManagers/steam/tokenStore.ts src/backend/sidecar/keyringTokenStore.ts src/backend/storeManagers/steam/user.ts
[present in all three files — the seam (tokenStore.ts), the implementation (keyringTokenStore.ts), and the consumer (user.ts)]

$ grep -v '^ \*' src/backend/sidecar/keyringTokenStore.ts | grep -c "configStore\|TOKEN_STORE_KEY"
0

$ grep -n "KEYRING_FAILURE_MEMO_MS = " src/backend/sidecar/keyringTokenStore.ts
59:const KEYRING_FAILURE_MEMO_MS = 120_000

$ grep -n "KEYRING_READ_TIMEOUT: Duration" src-tauri/src/main.rs
1182:const KEYRING_READ_TIMEOUT: Duration = Duration::from_secs(45);

$ git diff --stat 904dbd867~1..8dc617b4b
 .../sidecar/__tests__/keyringTokenStore.test.ts    | 287 ++++++++++++++++++---
 src/backend/sidecar/keyringTokenStore.ts           |  71 ++++-
 .../steam/__tests__/tokenStore.test.ts             |  59 ++++-
 .../storeManagers/steam/__tests__/user.test.ts     | 142 ++++++++++
 src/backend/storeManagers/steam/tokenStore.ts      |  57 +++-
 src/backend/storeManagers/steam/user.ts            |  48 +++-
 6 files changed, 604 insertions(+), 60 deletions(-)
```

No change to `src-tauri/`, `humbleSecretStore.ts`, or `devSecretVault.ts` — confirmed.

## Self-Check: PASSED

- `src/backend/storeManagers/steam/tokenStore.ts` — FOUND, contains `readTokenOutcome`
- `src/backend/sidecar/keyringTokenStore.ts` — FOUND, contains `readToken(`
- `src/backend/storeManagers/steam/user.ts` — FOUND, contains `readTokenOutcome(`
- `src/backend/sidecar/__tests__/keyringTokenStore.test.ts` — FOUND, contains the timeout-vs-absent regression suite
- `src/backend/storeManagers/steam/__tests__/user.test.ts` — FOUND, contains the unreadable-is-not-logged-out regression suite
- Commit `904dbd867` — FOUND in `git log --oneline --all`
- Commit `7020c22a9` — FOUND in `git log --oneline --all`
- Commit `8dc617b4b` — FOUND in `git log --oneline --all`
