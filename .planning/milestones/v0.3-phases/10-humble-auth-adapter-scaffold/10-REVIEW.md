---
phase: 10-humble-auth-adapter-scaffold
reviewed: 2026-07-05T06:48:50Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - public/locales/en/login.json
  - public/locales/en/translation.json
  - src/backend/humble/__tests__/adapter.test.ts
  - src/backend/humble/__tests__/user.test.ts
  - src/backend/humble/adapter.ts
  - src/backend/humble/constants.ts
  - src/backend/humble/electronStores.ts
  - src/backend/humble/ipc_handler.ts
  - src/backend/humble/user.ts
  - src/backend/humble/validation.ts
  - src/backend/main.ts
  - src/common/types/electron_store.ts
  - src/common/types/humble.ts
  - src/common/types/ipc.ts
  - src/frontend/App.tsx
  - src/frontend/assets/humble-logo.svg
  - src/frontend/components/UI/HumbleExpiryToast/index.scss
  - src/frontend/components/UI/HumbleExpiryToast/index.tsx
  - src/frontend/helpers/electronStores.ts
  - src/frontend/screens/Login/index.tsx
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/state/ContextProvider.tsx
  - src/frontend/state/GlobalState.tsx
  - src/frontend/types.ts
  - src/preload/api/humble.ts
  - src/preload/api/index.ts
findings:
  critical: 0
  warning: 9
  info: 9
  total: 18
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-07-05T06:48:50Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

Reviewed the Humble Bundle auth scaffold: adapter (C5 wall), HumbleUser watch/encryption service, dev-only validation gate, IPC surface, and the frontend login/expiry UI. The security-sensitive invariants were verified adversarially and hold:

- **Cookie never logged:** every logger call on the humble paths passes either a static string, a status enum, or an `Error` object; the backend logger (`src/backend/logger/formatter.ts:46`) serializes `Error` instances as `stack ?? message` only, so even a caught `AxiosError` (whose `config.headers` carries the cookie) cannot leak headers into the log. Zod issue messages carry types/paths, never values. Unit tests assert redaction on every path.
- **Cookie never in IPC payloads sent by this code:** `LoginResult`, `HumbleAuthState`, and `HumbleValidationReport` are structurally cookie/gamekey-free; `schema_error.raw` never crosses IPC. (But see WR-09 — the generic frontend store bridge makes the stored value *retrievable* over IPC.)
- **Encrypted storage:** cookie stored only under `sessionCookie` as `humble:v1:` + safeStorage base64; plaintext fallback sets the user-visible `encryptionDegraded` flag.
- **Dev gate:** `humbleRunValidation` registered only behind `!app.isPackaged` (`src/backend/main.ts:884`), outside the always-on `registerHumbleIpcHandlers()`.

No Critical findings. Nine Warnings concern robustness/correctness gaps: the startup health check throws uncaught on any plain network failure, `disconnect()` can skip the credential wipe if a partition-clear step rejects, a cancel/validation race can commit login state after a D-06 silent cancel, and the persisted `expired` flag is write-only. Nine Info items cover dead code, dead i18n keys, and hardening suggestions.

Type-check passes (`tsc --noEmit` clean); both humble test suites pass (48/48).

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Startup health check throws uncaught on any non-401/403 failure (including plain offline)

**File:** `src/backend/humble/user.ts:378-394`, `src/frontend/state/GlobalState.tsx:1059`
**Issue:** `checkHealthAndFlagExpiry()` calls `getGamekeys(cookie)` with no try/catch. `mapAxiosError` (`src/backend/humble/adapter.ts:99-111`) deliberately **rethrows** anything that isn't a 401/403 — including `ECONNREFUSED`/`ENOTFOUND` when the machine starts offline, and 404/429/500 responses. The rejection propagates through the `humbleCheckHealth` IPC handler to the renderer, where `void window.api.humbleCheckHealth()` (GlobalState.tsx:1059) has no `.catch` — producing an unhandled promise rejection plus a spurious `logError` line on **every offline app start** for a logged-in Humble user. It also means the health check silently aborts instead of completing on any transient error.
**Fix:**
```typescript
// user.ts
static async checkHealthAndFlagExpiry(): Promise<void> {
  const cookie = HumbleUser.getCredentials()
  if (!cookie) return
  let result: Awaited<ReturnType<typeof getGamekeys>>
  try {
    result = await getGamekeys(cookie)
  } catch {
    // Transient/network failure — health unknown, do not flag expiry.
    return
  }
  if (result.status === 'session_expired') { /* ...unchanged... */ }
}
```
And/or in GlobalState.tsx: `window.api.humbleCheckHealth().catch(() => {})`.

### WR-02: disconnect() clears the stored credential LAST — a failed partition wipe leaves the session cookie on disk after a user-confirmed disconnect

**File:** `src/backend/humble/user.ts:398-408`, `src/backend/humble/ipc_handler.ts:24`
**Issue:** `disconnect()` awaits five session-clear calls before `configStore.clear()`. If any of them rejects (Electron API failure), the stored (possibly plaintext-degraded) `sessionCookie` is never removed — while the frontend has already flipped its state to disconnected (GlobalState.tsx:766-769 runs the wipe fire-and-forget and updates state unconditionally). Additionally, `addListener('humbleDisconnect', () => void HumbleUser.disconnect())` discards the promise, so any rejection becomes an unhandled rejection in the main process with no retry or user feedback. On a destructive security action, the credential wipe must be the operation that cannot be skipped.
**Fix:**
```typescript
static async disconnect(): Promise<void> {
  // Remove the credential FIRST — it must go even if partition cleanup fails.
  configStore.clear()
  const ses = session.fromPartition(HUMBLE_LOGIN_PARTITION)
  try {
    await ses.clearStorageData()
    await ses.clearCache()
    await ses.clearAuthCache()
    await ses.clearHostResolverCache()
    await ses.clearData()
  } catch (err) {
    logWarning(['Humble partition wipe partially failed:', err], LogPrefix.Backend)
  }
}
```

### WR-03: Race — finishLogin() commits store writes after a D-06 silent cancel

**File:** `src/backend/humble/user.ts:297-374`
**Issue:** `checkCookie` checks `settled` before invoking `finishLogin`, but `stopLogin()` can settle the watch (`{ status: 'waiting' }`) **while** `finishLogin` is awaiting `getGamekeys`. When the in-flight validation then succeeds, `finishLogin` unconditionally executes `configStore.set(HUMBLE_TOKEN_STORE_KEY, ...)`, `set('isLoggedIn', true)`, `set('expired', false)` (lines 338-341). The promise already resolved `'waiting'`, so the frontend believes the login was cancelled and never applies the state — the backend store now says logged-in while the UI tile shows disconnected until restart. This directly violates the documented D-06 contract ("silent cancel ... no store writes") that the code comment and test suite claim (the existing test only covers the no-cookie case).
**Fix:** Re-check `settled` after the awaited validation, before any store write:
```typescript
private static async finishLogin(
  cookieValue: string,
  settle: (result: LoginResult) => void,
  isSettled: () => boolean
): Promise<'done' | 'rejected' | 'transient'> {
  ...
  if (gamekeys.status !== 'ok') { ... }
  if (isSettled()) return 'transient' // cancelled while validating — store nothing
  const encrypted = encryptCookie(cookieValue)
  ...
}
```
(Pass `() => settled` from `watchForLogin`.)

### WR-04: No HTTP timeout on humbleRequest — a hung request stalls all login validation via validationInFlight

**File:** `src/backend/humble/adapter.ts:84-86`, `src/backend/humble/user.ts:263`
**Issue:** `axios.get` is called with no `timeout` (axios default is 0 = unlimited). While a request hangs (stalled TCP, captive portal, Humble blackholing the request), `validationInFlight` stays `true`, so every poll tick **and** every forced revalidation from navigation events is silently dropped (`user.ts:241`, `247`). Login cannot complete until the OS-level TCP timeout finally errors the request out, which can take minutes. Same exposure for the startup health check and the validation gate.
**Fix:**
```typescript
const res = await axios.get(`${HUMBLE_BASE_URL}${path}`, {
  headers: buildHeaders(cookie),
  timeout: 15_000 // ms — hung transport must become a transient error, not a stall
})
```

### WR-05: Persisted `expired` flag is write-only — stale "Connected" after restart, indefinitely when offline

**File:** `src/frontend/state/GlobalState.tsx:240`, `src/common/types/electron_store.ts:105`, `src/backend/humble/user.ts:384`
**Issue:** The backend persists `expired` (`configStore.set('expired', true/false)`), but no code ever reads it back: GlobalState hardcodes `expired: false` at startup and relies solely on the `humbleCheckHealth` round-trip to re-detect expiry. After a restart with a known-expired session, the tile shows "Connected" and no toast until the network check completes — and combined with WR-01 (health check aborts on any network error), an offline start shows a stale connected state indefinitely. Either the persisted key should be read at startup or it is dead data and should be removed.
**Fix:**
```typescript
// GlobalState.tsx initial state
expired: humbleConfigStore.get_nodefault('expired') ?? false,
```

### WR-06: Successful login is dropped if the /loginweb/humble route unmounts before the result lands — and the backend never pushes humbleAuthState on success

**File:** `src/frontend/screens/WebView/index.tsx:197-203`, `src/backend/humble/user.ts:372`
**Issue:** `runHumbleLoginWatch` guards with `if (!mounted) return` before `humble.login(result)`. If the watch settles `'done'` (backend has already persisted `sessionCookie`/`isLoggedIn`) but the user navigates away before the promise callback runs, the frontend context is never updated: the backend is logged in while the Login tile shows disconnected until app reload. `sendFrontendMessage('humbleAuthState', ...)` is only emitted on expiry, never on login success, so there is no convergence path.
**Fix:** In `finishLogin` (user.ts), after the store writes, push the authoritative state so the renderer converges regardless of route lifecycle:
```typescript
sendFrontendMessage('humbleAuthState', {
  isLoggedIn: true,
  username,
  expired: false
})
```
And have GlobalState's existing `handleHumbleAuthState` listener absorb it (it already does).

### WR-07: encryptionDegraded flag is sticky — never cleared when a later login encrypts successfully

**File:** `src/backend/humble/user.ts:95-110`
**Issue:** `encryptCookie` sets `configStore.set('encryptionDegraded', true)` on the plaintext path but the encryption-available path never resets it. A user who once logged in with safeStorage unavailable and later re-logs in on a fixed system (keychain unlocked, kwallet installed, etc.) keeps seeing the reduced-encryption warning — and the store keeps reporting a degraded state that is no longer true — until they fully disconnect (`configStore.clear()`).
**Fix:**
```typescript
const ciphertext = safeStorage.encryptString(plain).toString('base64')
configStore.set('encryptionDegraded', false) // healthy path clears the flag
return `${HUMBLE_TOKEN_PREFIX}${ciphertext}`
```

### WR-08: i18n humble keys added to the wrong/unreachable namespace; `humble_connected` missing from the consumed file

**File:** `public/locales/en/login.json:21-27`, `public/locales/en/translation.json:601-607`, `src/frontend/screens/Login/index.tsx:224`
**Issue:** All components resolve `t('login.humble_*')` through the **default `translation` namespace** (nested `"login"` object in translation.json — i18next default nsSeparator is `:`); the `login` namespace file (login.json) is only consumed by SIDLogin via `useTranslation('login')`. Consequences: (1) the seven humble keys added to login.json are unreachable dead duplicates; (2) the two files have already drifted — `humble_connected` (actually used at Login/index.tsx:224) exists **only** in login.json and is missing from translation.json, so the "Connected" label can never be translated to any non-English locale; (3) `humble_connecting` exists in translation.json (line 602) but is referenced nowhere in `src/`.
**Fix:** Add `"humble_connected": "Connected"` to translation.json's `login` block; delete the seven `humble_*` keys from login.json; delete or wire up `humble_connecting`.

### WR-09: Stored session cookie is retrievable by the renderer via the generic store IPC bridge

**File:** `src/frontend/helpers/electronStores.ts:160-162`, `src/common/types/electron_store.ts:95-106`
**Issue:** Registering `humbleConfigStore` as a `TypeCheckedStoreFrontend` means any renderer code can execute `window.api.storeGet('humbleConfigStore', 'sessionCookie')` and receive the stored value over IPC — the `humble:v1:` ciphertext normally, but the **plaintext session cookie** in degraded-encryption mode. The reviewed code never does this (GlobalState reads only `isLoggedIn`/`userData`/`encryptionDegraded`), and the pattern mirrors the pre-existing steam/gog config stores, but it materially weakens the "cookie never crosses IPC" invariant: a compromised renderer (XSS via themes/custom CSS, malicious metadata) can exfiltrate the session with one call. Only three keys are actually needed by the renderer.
**Fix:** Have the `storeGet` backend handler deny reads of `sessionCookie` (and steam's `refreshToken`) by key, or expose the three UI-safe fields through a dedicated typed IPC call (`humbleGetAuthState`) instead of registering the whole config store frontend-side.

## Info

### IN-01: `HumbleUser.isLoggedIn()` is dead code

**File:** `src/backend/humble/user.ts:147-149`
**Issue:** No production caller (only unit tests). The IPC surface uses `getUserDetails()`; the frontend reads the store directly.
**Fix:** Remove, or wire it into a `humbleIsLoggedIn` handler if Phase 11 needs it.

### IN-02: `HUMBLE_LOGIN_URL` constant unused; URL duplicated as a literal in WebView

**File:** `src/backend/humble/constants.ts:14`, `src/frontend/screens/WebView/index.tsx:77`
**Issue:** The exported constant has zero imports; WebView re-declares `const humbleLoginUrl = 'https://www.humblebundle.com/login'`. Two sources of truth for the login URL.
**Fix:** Move the constant to `src/common/` and import it in WebView, or delete the backend constant.

### IN-03: `humbleGetUserInfo` IPC channel is dead surface

**File:** `src/backend/humble/ipc_handler.ts:20`, `src/preload/api/humble.ts:8`
**Issue:** No frontend code invokes `humbleGetUserInfo` — GlobalState reads `userData` from the store bridge instead. Dead channel + preload export.
**Fix:** Remove, or (per WR-09) use it as the sanctioned read path and drop the frontend store registration.

### IN-04: gamekey interpolated into URL path without encoding

**File:** `src/backend/humble/adapter.ts:177`
**Issue:** `humbleRequest(\`/api/v1/order/${gamekey}\`, ...)` — gamekey is schema-validated as a string but comes from an external API; a value containing `/`, `?`, or `#` would silently address a different path.
**Fix:** `humbleRequest(\`/api/v1/order/${encodeURIComponent(gamekey)}\`, cookie)`

### IN-05: `LoginResult` advertises a `'error'` status that is never produced

**File:** `src/backend/humble/user.ts:75-78`, `src/common/types/ipc.ts:247-255`
**Issue:** `humbleStartLogin`/`humbleReconnect` are typed `'done' | 'waiting' | 'error'`, but no code path ever settles `'error'` — dead union member that consumers (WebView) must still nominally handle.
**Fix:** Drop `'error'` from the type or add an error settle path for unrecoverable watch failures.

### IN-06: runHumbleValidation lets adapter throws escape as a raw IPC rejection

**File:** `src/backend/humble/validation.ts:54,60,73`
**Issue:** `getAccountIdentity`/`getGamekeys`/`getOrderDetail` rethrow network/unmapped errors (adapter.ts:110); the dev-only validation gate does not catch them, so a network blip rejects the `humbleRunValidation` invoke instead of returning a structured `fail` report. Dev-only impact.
**Fix:** Wrap each call in try/catch and record a `not_attempted`/fail endpoint result.

### IN-07: UA fallback branch strips the Electron token but not the app-name token

**File:** `src/backend/humble/user.ts:67-71`
**Issue:** The defensive branch returns `fallback.replace(/ Electron\/\S+/, '')`, leaving `GameLib/x.y.z` in the UA — itself an embedded-browser signal to Google SSO. Acknowledged in the comment, but the app token regex is one more replace away.
**Fix:** `.replace(/ Electron\/\S+/, '').replace(new RegExp(\` ${app.getName()}\\/\\S+\`), '')` (or strip both tokens generically).

### IN-08: `schema_error.raw` carries the full untrusted response body but no caller consumes it

**File:** `src/backend/humble/adapter.ts:164,181,198`, `src/common/types/humble.ts:16`
**Issue:** Every `schema_error` result embeds the raw body. All current callers ignore it. It is a latent redaction hazard: any future caller that logs or IPC-forwards the whole `AdapterResult` would ship the untrusted body (and on an auth-interstitial page, potentially session-adjacent markup).
**Fix:** Drop `raw` until Phase 11 has a concrete consumer, or replace with the already-redacted diagnostics (contentType/bodyLength).

### IN-09: webview element reuse across `/loginweb/:runner` param changes can attempt a forbidden partition change

**File:** `src/frontend/screens/WebView/index.tsx:467-481`
**Issue:** `key={store}` is `undefined` on all login routes, so navigating between two `/loginweb/:runner` params reuses the same `<webview>` element; Electron throws if `partition` changes after first navigation. The `humbleLoginUserAgent` empty-render guard (line 453) accidentally forces a remount on the *into-humble* direction, and the only cross-login navigation shipped (the expiry toast) targets humble — so this is currently unreachable in practice, but the protection is coincidental.
**Fix:** `key={store ?? runner}` so any partition-affecting param change recreates the element.

---

_Reviewed: 2026-07-05T06:48:50Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
