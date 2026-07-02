---
phase: 01-steam-authentication
reviewed: 2026-06-27T00:00:00Z
depth: standard
files_reviewed: 32
files_reviewed_list:
  - package.json
  - src/backend/logger/constants.ts
  - src/backend/main.ts
  - src/backend/save_sync.ts
  - src/backend/storeManagers/index.ts
  - src/backend/storeManagers/steam/__tests__/user.test.ts
  - src/backend/storeManagers/steam/constants.ts
  - src/backend/storeManagers/steam/electronStores.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/user.ts
  - src/backend/tray_icon/tray_icon.ts
  - src/backend/utils.ts
  - src/backend/wiki_game_info/umu/utils.ts
  - src/common/types.ts
  - src/common/types/electron_store.ts
  - src/common/types/ipc.ts
  - src/common/types/steam.ts
  - src/common/utils.ts
  - src/frontend/App.tsx
  - src/frontend/components/UI/LibraryFilters/index.tsx
  - src/frontend/helpers/electronStores.ts
  - src/frontend/screens/Library/LibraryContext.tsx
  - src/frontend/screens/Library/index.tsx
  - src/frontend/screens/Login/components/SteamLogin/index.scss
  - src/frontend/screens/Login/components/SteamLogin/index.tsx
  - src/frontend/screens/Login/index.tsx
  - src/frontend/state/ContextProvider.tsx
  - src/frontend/state/GlobalState.tsx
  - src/frontend/types.ts
  - src/preload/api/index.ts
  - src/preload/api/steam.ts
findings:
  critical: 2
  warning: 6
  info: 2
  total: 10
status: issues_found
---

# Phase 01: Steam Authentication — Code Review Report

**Reviewed:** 2026-06-27
**Depth:** standard
**Files Reviewed:** 32
**Status:** issues_found

## Summary

This phase adds Steam as a first-class auth platform to the Heroic fork. The architecture
is well-structured: a static `SteamUser` class handles the auth state machine, `safeStorage`
encrypts the refresh token, IPC wiring follows existing platform patterns, and the frontend
login component covers the QR and credential flows. The unit test suite is thorough for the
happy paths.

Two blockers were found: a backend session-lifecycle bug that causes `submitSteamGuardCode`
to hang the UI indefinitely on session timeout, and a shared-state race where old QR session
event handlers corrupt the newly-started session's state. Six warnings cover missing event
cleanup, a fragile transitive dependency, a stale constant, a React async-gap timer leak, and
an inconsistency in what username is displayed after credential login.

---

## Critical Issues

### CR-01: Old QR session `timeout`/`error` handlers corrupt new session state

**File:** `src/backend/storeManagers/steam/user.ts:183-207`

**Issue:** `startQRLogin()` creates a new `LoginSession` and overwrites `this.session`, but
it never removes the event listeners attached to the *previous* session. Those listeners
close over `this` (the static class), so they still mutate `this.qrSessionState` when the
old session emits `timeout` or `error`.

Concrete reproduction: the frontend auto-refresh triggers a second call to `steamStartQR`
after 30 seconds. `this.qrSessionState` is reset to `{ status: 'waiting' }` for the new
session. Milliseconds later, the old session fires its `timeout` event (it expired), and its
still-attached handler sets `this.qrSessionState = { status: 'error' }`. The next
`pollQRLogin()` returns `error`, the frontend interprets this as the *new* session failing,
and immediately calls `startQRFlow()` a third time. This creates a cascade of spurious
refreshes and can make the QR tab unrecoverable.

**Fix:** Cancel the previous session before starting a new one, or remove its listeners:

```typescript
static async startQRLogin(): Promise<{...}> {
  try {
    // Tear down previous session before replacing it
    if (this.session) {
      this.session.cancelLoginAttempt()  // steam-session API
      this.session = null
    }

    const session = new LoginSession(EAuthTokenPlatformType.SteamClient)
    this.session = session
    this.qrSessionState = { status: 'waiting' }
    // ... rest unchanged
```

The same pattern applies to `startCredentialLogin` — replace `this.session` only after
cancelling the previous one.

---

### CR-02: `submitSteamGuardCode` has no `timeout` handler — promise hangs forever

**File:** `src/backend/storeManagers/steam/user.ts:291-303`

**Issue:** The inner Promise created after `await session.submitSteamGuardCode(code)` only
registers `authenticated` and `error` handlers:

```typescript
return new Promise<{ status: 'done' | 'error' }>((resolve) => {
  session.on('authenticated', async () => { ... resolve({ status: 'done' }) })
  session.on('error', (err: Error) => { ... resolve({ status: 'error' }) })
  // ← no 'timeout' handler
})
```

`startCredentialLogin` (line 265) correctly adds a `timeout` handler that calls
`resolve({ status: 'error' })`. `submitSteamGuardCode` omits it. If the `steam-session`
instance times out between code submission and authentication completion, the Promise never
settles. The IPC handler never returns, `window.api.steamSubmitGuard(guardCode)` in the
frontend hangs indefinitely, and the "Verifying..." loading state is permanent with no
user-accessible recovery path except killing the application.

**Fix:** Add the missing `timeout` handler, mirroring `startCredentialLogin`:

```typescript
return new Promise<{ status: 'done' | 'error' }>((resolve) => {
  session.on('authenticated', async () => {
    try {
      await this.finishAuth(session.refreshToken)
      resolve({ status: 'done' })
    } catch (err) {
      logError(['Steam guard submit auth finalization failed:', err], LogPrefix.Steam)
      resolve({ status: 'error' })
    }
  })

  session.on('error', (err: Error) => {
    logError(['Steam guard submit session error:', err], LogPrefix.Steam)
    resolve({ status: 'error' })
  })

  session.on('timeout', () => {             // ← add this
    logWarning('Steam guard session timed out', LogPrefix.Steam)
    resolve({ status: 'error' })
  })
})
```

---

## Warnings

### WR-01: `steam-session` is not an explicit dependency in `package.json`

**File:** `package.json` (entire file) / `src/backend/storeManagers/steam/user.ts:8`

**Issue:** `steam-session` is imported directly:
```typescript
import { LoginSession, EAuthTokenPlatformType } from 'steam-session'
```
but it does not appear in `package.json` `dependencies`. It is available at runtime only
because `.npmrc` sets `node-linker=hoisted`, which hoists `steam-user`'s transitive
dependency (`steam-user` depends on `steam-session`) into the flat `node_modules` tree. This
is a phantom dependency: if `steam-user` ever drops or changes its dependency on
`steam-session`, this import silently breaks with no indication in `package.json`. The
CLAUDE.md tech stack table explicitly calls out `steam-session@1.9.4` as a direct
dependency.

**Fix:** Add `steam-session` explicitly:
```json
"steam-session": "^1.9.4"
```
in the `dependencies` block of `package.json`.

---

### WR-02: Session event listeners registered with `.on()` instead of `.once()`

**File:** `src/backend/storeManagers/steam/user.ts:183, 250, 292`

**Issue:** All three auth paths (`startQRLogin`, `startCredentialLogin`,
`submitSteamGuardCode`) attach handlers to session events using `.on()`:

```typescript
session.on('authenticated', async () => { ... })
session.on('error', (err: Error) => { ... })
session.on('timeout', () => { ... })
```

If a `steam-session` instance emits `authenticated` or `error` more than once (edge case but
not contractually excluded), `finishAuth` is called multiple times concurrently. Multiple
concurrent `finishAuth` calls race to create `SteamUserLib` clients, each calling
`this.client.logOff()` on the previous one, leaving the first(s) in a never-resolving state
while the last one wins. Multiple concurrent writes to `configStore` are also possible.

The client event listeners in `finishAuth` (`client.on('loggedOn', ...)` at line 124 and
`client.on('error', ...)` at line 161) have the same issue.

**Fix:** Replace `.on()` with `.once()` for all these single-use event registrations:
```typescript
session.once('authenticated', async () => { ... })
session.once('error', (err: Error) => { ... })
session.once('timeout', () => { ... })
// and in finishAuth:
client.once('loggedOn', async () => { ... })
client.once('error', (err: Error) => { ... })
```

---

### WR-03: `startQRFlow` registers timers after an async gap — leaks on unmount

**File:** `src/frontend/screens/Login/components/SteamLogin/index.tsx:75-113`

**Issue:** `startQRFlow` calls `clearPollInterval()` and `clearQrRefreshTimer()` at the top
(lines 78-79), then immediately `await`s the IPC call:

```typescript
async function startQRFlow() {
  setStep('qr-generating')
  clearPollInterval()       // refs set to null
  clearQrRefreshTimer()     // refs set to null

  const result = await window.api.steamStartQR()  // async gap

  // ... only HERE are the timers created:
  pollIntervalRef.current = setInterval(async () => { ... }, 2000)
  qrRefreshTimerRef.current = setTimeout(async () => { ... }, 30000)
}
```

If the component unmounts during the async gap (e.g., user navigates away while the IPC
call is in flight), the `useEffect` cleanup fires. It calls `clearPollInterval()` and
`clearQrRefreshTimer()` — but both refs are `null` at that moment, so nothing is cleared.
When the IPC call resolves after unmount, the callback continues executing and writes new
values to `pollIntervalRef.current` and `qrRefreshTimerRef.current`. These interval/timeout
callbacks continue firing, calling `window.api.steamPollQR()` and eventually invoking
`steam.login()` and `navigate()` on an unmounted component.

**Fix:** Track a cancelled flag in the `useEffect` for the tab/step change, and check it
after the await:

```typescript
useEffect(() => {
  let cancelled = false

  if (step === 'tab' && activeTab === 'qr') {
    const run = async () => {
      // pass `cancelled` into startQRFlow or check after
      await startQRFlow(() => cancelled)
    }
    run()
  }

  return () => { cancelled = true; clearPollInterval(); clearQrRefreshTimer() }
}, [step, activeTab])
```

Inside `startQRFlow`, check `if (isCancelled()) return` immediately after the `await`.

---

### WR-04: Credential and guard login passes the form input as the persona name

**File:** `src/frontend/screens/Login/components/SteamLogin/index.tsx:159, 176`

**Issue:** After a successful credential login or guard code submission, `steam.login()` is
called with the raw form `username` state value:

```typescript
// handleCredentialSubmit (line 159):
await steam.login({ status: 'done', username })

// handleGuardSubmit (line 176):
await steam.login({ status: 'done', username })
```

`username` is the Steam account name the user typed (e.g., `"gameguy123"`). The QR flow
correctly uses the persona name returned by the backend:

```typescript
// pollQRLogin (line 98):
await steam.login({ status: 'done', username: poll.username })
```

`poll.username` comes from `finishAuth` → `getPersonas()` and is the user's Steam display
name (e.g., `"The Gaming Legend"`). After a credential login, the tray icon, login page, and
library will show `"gameguy123"` instead of the actual persona name. The correct persona name
is already available via the existing `getSteamUserInfo` IPC call.

**Fix:** After a successful credential or guard login, fetch the persona name from the
backend before calling `steam.login()`:

```typescript
if (result.status === 'done') {
  const userInfo = await window.api.getSteamUserInfo()
  await steam.login({ status: 'done', username: userInfo?.username })
  navigate('/login')
}
```

---

### WR-05: `TOKEN_STORE_KEY` constant is exported but never used

**File:** `src/backend/storeManagers/steam/constants.ts:15`

**Issue:** The constant `TOKEN_STORE_KEY = 'refreshToken'` is exported but never imported
anywhere. `user.ts` hardcodes the string `'refreshToken'` directly in two places (lines 100
and 149):

```typescript
const stored = configStore.get_nodefault('refreshToken')   // line 100
configStore.set('refreshToken', encrypted)                  // line 149
```

This means the constant and the actual key used in the store are disconnected. A future
rename of the key (e.g., for versioning or migration) would require updating both locations
manually, with no compiler error if `TOKEN_STORE_KEY` is updated but the literal is not.

**Fix:** Remove the unused export from `constants.ts` or—better—import and use it in
`user.ts`:

```typescript
import { STEAM_INSTALL_PATHS, TOKEN_PREFIX, TOKEN_STORE_KEY } from './constants'

// in getCredentials():
const stored = configStore.get_nodefault(TOKEN_STORE_KEY)

// in finishAuth():
configStore.set(TOKEN_STORE_KEY, encrypted)
```

---

### WR-06: Weak test assertion for "no active session" case in `submitSteamGuardCode`

**File:** `src/backend/storeManagers/steam/__tests__/user.test.ts:489-497`

**Issue:** The test "returns `{ status: 'error' }` when no active session" asserts:

```typescript
expect(['done', 'error']).toContain(result.status)
```

This assertion is vacuously true for any valid status value. After `SteamUser.logout()` sets
`this.session = null`, the code path is:

```typescript
if (!this.session) {
  logWarning('submitSteamGuardCode called but no active session', LogPrefix.Steam)
  return { status: 'error' }
}
```

The test comment "Since session may still be held from before logout" is incorrect — `logout()`
explicitly sets `this.session = null`. The test should assert the specific expected behavior:

```typescript
// Before fix:
expect(['done', 'error']).toContain(result.status)

// After fix:
expect(result.status).toBe('error')
```

This matters because a broken implementation that returns `{ status: 'done' }` when there is
no session would pass the current assertion.

---

## Info

### IN-01: `console.log` debug artifacts in `GlobalState.tsx`

**File:** `src/frontend/state/GlobalState.tsx:547, 574, 605, 607, 617, 640, 673, 677, 698`

**Issue:** The new Steam login/logout methods follow the same pattern as the existing
platform methods (epic, gog, amazon, zoom) which all include `console.log` calls:

```typescript
steamLogin = async (result: ...) => {
  console.log('logging steam')        // line 677
  ...
}

steamLogout = async () => {
  ...
  console.log('Logging out from steam')  // line 698
  ...
}
```

These are present across all platforms and appear to be an existing pattern. They leak
authentication flow timing to any open DevTools session in production builds.

**Fix:** Replace with `logInfo(...)` via `window.api.logInfo(...)` (which is what other log
calls in this class use), or remove them. The existing callers (epic, gog, etc.) have the
same issue and should be cleaned up consistently.

---

### IN-02: `storeMap` in `common/utils.ts` maps `steam` to `undefined`

**File:** `src/common/utils.ts:9`

**Issue:**
```typescript
export const storeMap: { [key in Runner]: string | undefined } = {
  ...
  steam: undefined
}
```

Any code path that calls `storeMap['steam']` and does not guard for `undefined` will
silently receive `undefined`. `sideload` already uses the same pattern, so this is
intentional. However, it differs from the CLAUDE.md design note which does not document why
Steam should not have a store identifier string (it could be `'steam'`). If any future
caller expects a non-undefined value (e.g., for UMU lookups or achievement URL construction),
this will silently produce `undefined` without a type error.

**Fix:** Document the reason in a comment, or set it to `'steam'` if a store identifier is
needed:

```typescript
steam: undefined // Steam games are launched via steam:// protocol; no web store URL needed
```

---

_Reviewed: 2026-06-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
