---
phase: 01-steam-authentication
fixed_at: 2026-06-27T00:00:00Z
review_path: .planning/phases/01-steam-authentication/01-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-06-27
**Source review:** `.planning/phases/01-steam-authentication/01-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (2 Critical, 6 Warning)
- Fixed: 8
- Skipped: 0

## Fixed Issues

### CR-01: Old QR session `timeout`/`error` handlers corrupt new session state

**Files modified:** `src/backend/storeManagers/steam/user.ts`
**Commit:** 1d147b8
**Applied fix:** Added `if (this.session) { this.session.cancelLoginAttempt(); this.session = null }` at the top of both `startQRLogin()` and `startCredentialLogin()`, before creating the new `LoginSession`. This ensures the previous session's listeners can no longer fire against the new session state.

---

### CR-02: `submitSteamGuardCode` has no `timeout` handler — promise hangs forever

**Files modified:** `src/backend/storeManagers/steam/user.ts`
**Commit:** a76e86a
**Applied fix:** Added `session.on('timeout', ...)` handler (mirroring `startCredentialLogin`) inside the `submitSteamGuardCode` Promise that resolves with `{ status: 'error' }` and logs a warning. The `.on()` was subsequently upgraded to `.once()` by WR-02.

---

### WR-01: `steam-session` is not an explicit dependency in `package.json`

**Files modified:** `package.json`
**Commit:** 1493cfe
**Applied fix:** Added `"steam-session": "^1.9.4"` to the `dependencies` block, between `sanitize-html` and `steam-shortcut-editor`, making the direct import explicit and preventing silent breakage if `steam-user` ever drops its transitive dependency.

---

### WR-02: Session event listeners registered with `.on()` instead of `.once()`

**Files modified:** `src/backend/storeManagers/steam/user.ts`
**Commit:** 4a04376
**Applied fix:** Replaced all 11 single-use event registrations with `.once()`:
- `finishAuth`: `client.once('loggedOn', ...)` and `client.once('error', ...)`
- `startQRLogin`: `session.once('authenticated', ...)`, `session.once('timeout', ...)`, `session.once('error', ...)`
- `startCredentialLogin`: `session.once('authenticated', ...)`, `session.once('error', ...)`, `session.once('timeout', ...)`
- `submitSteamGuardCode`: `session.once('authenticated', ...)`, `session.once('error', ...)`, `session.once('timeout', ...)`

---

### WR-03: `startQRFlow` registers timers after an async gap — leaks on unmount

**Files modified:** `src/frontend/screens/Login/components/SteamLogin/index.tsx`
**Commit:** 9fb7f18
**Applied fix:** Added `isCancelled: () => boolean = () => false` parameter to `startQRFlow`. Added `if (isCancelled()) return` immediately after the `await window.api.steamStartQR()` call. Updated the `useEffect` that triggers the QR flow to track `let cancelled = false`, pass `() => cancelled` into `startQRFlow`, and set `cancelled = true` in the cleanup function alongside `clearPollInterval()` and `clearQrRefreshTimer()`.

---

### WR-04: Credential and guard login passes form input as persona name

**Files modified:** `src/frontend/screens/Login/components/SteamLogin/index.tsx`
**Commit:** e7663be
**Applied fix:** In both `handleCredentialSubmit` and `handleGuardSubmit`, replaced `steam.login({ status: 'done', username })` with a `getSteamUserInfo()` call followed by `steam.login({ status: 'done', username: userInfo?.username })`. This uses the persona name returned by `finishAuth` (via `getPersonas()`) instead of the raw account name typed into the form.

---

### WR-05: `TOKEN_STORE_KEY` constant is exported but never used

**Files modified:** `src/backend/storeManagers/steam/user.ts`
**Commit:** ee390d9
**Applied fix:** Added `TOKEN_STORE_KEY` to the import from `./constants`. Replaced both hardcoded `'refreshToken'` store key literals with `TOKEN_STORE_KEY`:
- `configStore.get_nodefault(TOKEN_STORE_KEY)` in `getCredentials()`
- `configStore.set(TOKEN_STORE_KEY, encrypted)` in `finishAuth()`

---

### WR-06: Weak test assertion for "no active session" case

**Files modified:** `src/backend/storeManagers/steam/__tests__/user.test.ts`
**Commit:** 73e6b7b
**Applied fix:** Replaced `expect(['done', 'error']).toContain(result.status)` with `expect(result.status).toBe('error')`. Removed the stale comment claiming "session may still be held from before logout" — `logout()` explicitly sets `this.session = null`, so the code path is deterministic.

---

_Fixed: 2026-06-27_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
