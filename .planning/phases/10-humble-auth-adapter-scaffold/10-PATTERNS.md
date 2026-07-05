# Phase 10: Humble Auth + Adapter Scaffold - Pattern Map

**Mapped:** 2026-07-05
**Files analyzed:** 13 (new) + 4 (modified)
**Analogs found:** 15 / 17

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/backend/humble/user.ts` | service (auth) | event-driven + CRUD (store) | `src/backend/storeManagers/steam/user.ts` | exact (encryption/store-write shape); partial (BrowserWindow-cookie flow has no in-repo precedent — synthesize from `legendary/user.ts` partition pattern + research Pattern 1) |
| `src/backend/humble/adapter.ts` | service (HTTP client / C5 wall) | request-response | none exact — synthesize from research Pattern 3 | no analog (closest role-match: `src/backend/storeManagers/steam/games.ts` for axios-call shape, see below) |
| `src/backend/humble/electronStores.ts` | config/store | CRUD | `src/backend/storeManagers/steam/electronStores.ts` | exact |
| `src/backend/humble/constants.ts` | config | — | `src/backend/storeManagers/steam/constants.ts` | exact |
| `src/backend/humble/ipc_handler.ts` (or handlers inlined in `main.ts`) | controller (IPC) | request-response | `src/backend/main.ts` lines 860-874 (Steam `addHandler`/`addListener` block) | exact |
| `src/backend/humble/__tests__/user.test.ts` | test | — | `src/backend/storeManagers/steam/__tests__/user.test.ts` | exact |
| `src/backend/humble/__tests__/adapter.test.ts` | test | — | none exact — synthesize mock-boundary style from `steam/__tests__/user.test.ts` + research Pattern 3 fixtures | no analog |
| `src/common/types/humble.ts` | model (types) | — | `src/common/types/steam.ts` | exact |
| `src/common/types/ipc.ts` (modified — add Humble channels) | model (IPC contract) | — | existing `steamStartQR`/`steamPollQR`/etc. block (lines 214-230) | exact |
| `src/preload/api/humble.ts` | utility (preload bridge) | request-response | `src/preload/api/steam.ts` | exact |
| `src/frontend/screens/Login/index.tsx` (modified — add Humble tile) | component | request-response | Steam `<Runner>` usage block (lines 170-179) | exact |
| `src/frontend/screens/Login/components/Runner` (reused, not modified) | component | — | itself (D-01: reuse as-is) | exact |
| `src/frontend/state/GlobalState.tsx` (modified — add `humble` slice) | store (frontend state) | CRUD | `steam` slice (`steamLogin`/`steamLogout`, lines 79-82, 221-223, 684-710, 1216-1220) | exact (structurally), partial (no `library`/`GameInfo` field — Humble slice is auth-only this phase) |
| `src/frontend/helpers/electronStores.ts` (modified — add `humbleConfigStore` frontend reader) | utility (store reader) | CRUD | `steamConfigStore` (line 156-158) | exact |
| Reconnect/expiry toast surface (no dedicated file yet — planner decides) | component | event-driven | none exact — no toast library in this codebase; closest is `showDialog`/`DialogModalOptions` IPC channel | no analog (flag for planner) |
| `10-VALIDATION.md` (validation gate artifact, D-15) | doc/report | — | `.planning/phases/08-new-steam-surfaces/08-VALIDATION.md` | exact (structural pattern) |
| Dev-only debug trigger (IPC/menu, D-12) | controller (IPC) | request-response | Steam `addHandler` block (same as ipc_handler row) + `src/backend/main.ts` menu-registration patterns (`sendFrontendMessage('openScreen', ...)` block, lines 1441-1449) | role-match |

## Pattern Assignments

### `src/backend/humble/user.ts` (service, event-driven auth + store persistence)

**Analog:** `src/backend/storeManagers/steam/user.ts` (encryption + store-write shape) and `src/backend/storeManagers/legendary/user.ts` (partition wipe shape)

**Imports pattern** (steam/user.ts lines 1-9):
```typescript
import { safeStorage } from 'electron'
import { existsSync } from 'graceful-fs'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { configStore } from './electronStores'
import { STEAM_INSTALL_PATHS, TOKEN_PREFIX, TOKEN_STORE_KEY } from './constants'
import { platform } from 'process'
import type { SteamUserData } from 'common/types/steam'
```
For Humble, swap the last three imports for `HUMBLE_TOKEN_PREFIX`/`HUMBLE_TOKEN_STORE_KEY` from `./constants` and `HumbleUserData` from `common/types/humble`. Add `BrowserWindow, session` from `'electron'` (needed for the login window — not present in steam/user.ts since Steam uses steam-session, not a BrowserWindow).

**Encryption pattern** (steam/user.ts lines 11-48) — copy near-verbatim, this is the exact reusable unit:
```typescript
function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function encryptToken(plain: string): string {
  if (!plain) return ''
  if (!encryptionAvailable()) {
    logWarning(
      'safeStorage unavailable — storing Steam refresh token in plaintext',
      LogPrefix.Steam
    )
    return plain
  }
  const ciphertext = safeStorage.encryptString(plain).toString('base64')
  return `${TOKEN_PREFIX}${ciphertext}`
}

function decryptToken(stored: string): string {
  if (!stored) return ''
  if (!stored.startsWith(TOKEN_PREFIX)) {
    // Legacy plaintext fallback
    return stored
  }
  if (!encryptionAvailable()) return ''
  try {
    const buf = Buffer.from(stored.slice(TOKEN_PREFIX.length), 'base64')
    return safeStorage.decryptString(buf)
  } catch (err) {
    logWarning(['Failed to decrypt Steam refresh token:', err], LogPrefix.Steam)
    return ''
  }
}
```
**Required deviation (flagged in RESEARCH.md Open Question 1 / Pitfall 5):** success criterion 5 requires a **user-visible** warning, not just `logWarning`. Copying this function verbatim under-delivers — add a renderer-facing signal (e.g. write a flag to `humbleConfigStore` like `encryptionDegraded: true` that the Manage Accounts tile reads and displays, or push a `humbleAuthState`-style IPC message). Do not silently inherit the dev-log-only behavior.

**Static class shape / login state machine** (steam/user.ts lines 52-71, 84-94, 130-176) — copy the static-class-with-private-state idiom:
```typescript
export class SteamUser {
  private static client: InstanceType<typeof SteamUserLib> | null = null
  ...
  static isLoggedIn(): boolean {
    return Boolean(configStore.get_nodefault('isLoggedIn'))
  }
  static logout(): void {
    ...
    configStore.clear()
    logInfo('Logging user out from Steam', LogPrefix.Steam)
  }
  static async getUserDetails(): Promise<SteamUserData | undefined> {
    const userData = configStore.get_nodefault('userData')
    return userData
  }
  static async getCredentials(): Promise<{ refreshToken: string } | undefined> {
    const stored = configStore.get_nodefault(TOKEN_STORE_KEY)
    if (!stored || typeof stored !== 'string') return undefined
    const token = decryptToken(stored)
    if (!token) return undefined
    return { refreshToken: token }
  }
}
```
Humble's `HumbleUser` class follows this exact shape: `isLoggedIn()`, `logout()` (disconnect — but see partition-wipe note below), `getUserDetails()`, `getCredentials()` (decrypt `_simpleauth_sess`), plus new methods `startLogin()` (opens BrowserWindow per research Pattern 1), `pollLogin()` (mirrors `pollQRLogin()`'s `{status, username}` shape), `checkHealthAndFlagExpiry()` (D-08), and `reconnect()` (D-11, keeps partition).

**Partition wipe on Disconnect** (legendary/user.ts lines 71-78, and RESEARCH.md "Isolated partition wipe on Disconnect" code example) — copy exactly for HACCT-03/D-07:
```typescript
const ses = session.fromPartition('persist:epicstore')
await ses.clearStorageData()
await ses.clearCache()
await ses.clearAuthCache()
await ses.clearHostResolverCache()
await ses.clearData()
configStore.delete('userInfo')
```
For Humble: `session.fromPartition('humble-login')`, then `humbleConfigStore.clear()` (D-03) — but **do not** clear the audit-log/REVEALED-flag store if/when it exists (D-04 exemption; not applicable yet in Phase 10 since no such store exists).

**Divergence note — reconnect keeps partition (D-11):** Steam and Legendary's `logout()` always tears down everything; Humble needs a *second*, distinct path (`reconnect()`) that reopens the BrowserWindow against the same `humble-login` partition WITHOUT calling `clearStorageData()` etc. This has no in-repo precedent — implement as a new method that mirrors `startLogin()` but skips the partition-clear step.

---

### `src/backend/humble/adapter.ts` (service, C5 HTTP wall, request-response)

**Analog:** No exact in-repo analog (steam/games.ts is a Steam Web/store API axios caller but has no cookie-based session and no 401/403 branching). Use RESEARCH.md Pattern 3 as the primary template — it was synthesized specifically for this file from PITFALLS.md/STACK.md.

**Core pattern** (RESEARCH.md Pattern 3, `.planning/phases/10-humble-auth-adapter-scaffold/10-RESEARCH.md` lines 311-345):
```typescript
import axios from 'axios'
import { z } from 'zod'

const HUMBLE_BASE_URL = 'https://www.humblebundle.com'
const REQUIRED_HEADERS = {
  'X-Requested-By': 'hb_android_app',
  Accept: 'application/json'
}

const GamekeysSchema = z.array(z.string())

export type AdapterResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'session_expired' }   // 401
  | { status: 'access_denied' }     // 403 — C5 backoff path, not re-login
  | { status: 'schema_error'; raw: unknown }

export async function getGamekeys(cookie: string): Promise<AdapterResult<string[]>> {
  try {
    const res = await axios.get(`${HUMBLE_BASE_URL}/api/v1/user/order`, {
      headers: { ...REQUIRED_HEADERS, Cookie: `_simpleauth_sess=${cookie}` }
    })
    const parsed = GamekeysSchema.safeParse(res.data)
    if (!parsed.success) return { status: 'schema_error', raw: res.data }
    return { status: 'ok', data: parsed.data }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.response?.status === 401) return { status: 'session_expired' }
      if (err.response?.status === 403) return { status: 'access_denied' }
    }
    throw err
  }
}
```
**Error/logging discipline (Pitfall 4, C4):** never log the cookie value or full response body — this is new discipline not present in any Steam analog (Steam's tokens are also never logged, but the `logWarning`/`logError` calls in `steam/user.ts` are the model for *how* to log — message string + `LogPrefix`, never raw secret interpolation). Mirror `logWarning(['message:', err], LogPrefix.Steam)` shape but never pass cookie/response-body values into these calls.

**Validation gate hook (D-12/D-13):** `adapter.ts` must expose functions callable individually (`getGamekeys`, `getOrderDetail(gamekey)`, `getAccountIdentity()`) so the dev-only debug trigger can call each and assemble the `10-VALIDATION.md` report — do not wrap them in an opaque "sync everything" function this phase.

---

### `src/backend/humble/electronStores.ts` (config store, CRUD)

**Analog:** `src/backend/storeManagers/steam/electronStores.ts`

**Full pattern** (lines 1-7, 44):
```typescript
import { TypeCheckedStoreBackend } from '../../electron_store'

const configStore = new TypeCheckedStoreBackend('humbleConfigStore', {
  cwd: 'humble_store'
})

export { configStore }
```
Do not add `humbleLibraryStore`/`humbleAuditStore` yet (steam/electronStores.ts's `CacheStore`-based `steamLibraryStore`/`steamMetadataStore`/`steamSyncStore`, lines 10-23, are Phase 11+ scope per RESEARCH.md's explicit "no library.ts yet" boundary). Only `configStore` belongs in Phase 10.

---

### `src/backend/humble/constants.ts` (config)

**Analog:** `src/backend/storeManagers/steam/constants.ts` (full file, 17 lines) — copy the `TOKEN_STORE_KEY`/`TOKEN_PREFIX` shape exactly:
```typescript
export const TOKEN_STORE_KEY = 'refreshToken'
export const TOKEN_PREFIX = 'steam:v1:'
```
Humble equivalents: `HUMBLE_TOKEN_STORE_KEY = 'sessionCookie'`, `HUMBLE_TOKEN_PREFIX = 'humble:v1:'` (matches RESEARCH.md Pattern 2's `HUMBLE_TOKEN_PREFIX`), plus `HUMBLE_LOGIN_PARTITION = 'humble-login'` and `HUMBLE_REQUIRED_HEADERS` (no Steam analog — new, from research Pattern 3).

---

### `src/backend/humble/ipc_handler.ts` / IPC registration (controller, request-response)

**Analog:** `src/backend/main.ts` lines 860-874 (Steam block)
```typescript
addHandler('steamStartQR', async () => SteamUser.startQRLogin())
addHandler('steamPollQR', async () => SteamUser.pollQRLogin())
addHandler('steamPollCredential', async () => SteamUser.pollCredentialLogin())
addHandler(
  'steamStartCredentials',
  async (event, { username, password }) =>
    SteamUser.startCredentialLogin(username, password)
)
addHandler('steamSubmitGuard', async (event, code) =>
  SteamUser.submitSteamGuardCode(code)
)
addHandler('getSteamUserInfo', async () => SteamUser.getUserDetails())
addHandler('checkSteamInstalled', async () => SteamUser.isSteamClientInstalled())
addHandler('getSteamSyncedAt', () => steamSyncStore.get('syncedAt') ?? null)
addListener('logoutSteam', () => SteamUser.logout())
```
**IMPORTANT — codebase convention correction (also flagged in RESEARCH.md Pattern 4):** channel names are unprefixed camelCase, NOT colon-namespaced. Name Humble channels `humbleStartLogin`, `humblePollLogin`, `humbleGetUserInfo`, `humbleDisconnect`, `humbleReconnect`, `humbleGetAuthState` — never `humble:login`.

Steam's handlers are registered inline in `main.ts` (no separate `ipc_handler.ts` file exists for Steam) — this is a real deviation from RESEARCH.md's suggested file layout. Planner's discretion: either follow research's `humble/ipc_handler.ts` file (cleaner for a 5+ handler domain) and import+call it once from `main.ts`, or inline directly like Steam. Given Humble's larger surface (login, poll, disconnect, reconnect, health-check, debug-trigger), a separate `ipc_handler.ts` that exports a `registerHumbleIpcHandlers()` function called once from `main.ts` is recommended and does not conflict with the codebase's `addHandler`/`addListener` primitives.

---

### `src/preload/api/humble.ts` (utility, preload bridge, request-response)

**Analog:** `src/preload/api/steam.ts` (full file, 11 lines):
```typescript
import { makeHandlerInvoker, makeListenerCaller } from '../ipc'

export const steamStartQR = makeHandlerInvoker('steamStartQR')
export const steamPollQR = makeHandlerInvoker('steamPollQR')
export const steamPollCredential = makeHandlerInvoker('steamPollCredential')
export const steamStartCredentials = makeHandlerInvoker('steamStartCredentials')
export const steamSubmitGuard = makeHandlerInvoker('steamSubmitGuard')
export const getSteamUserInfo = makeHandlerInvoker('getSteamUserInfo')
export const checkSteamInstalled = makeHandlerInvoker('checkSteamInstalled')
export const getSteamSyncedAt = makeHandlerInvoker('getSteamSyncedAt')
export const logoutSteam = makeListenerCaller('logoutSteam')
```
Copy exactly, one line per Humble channel, `makeHandlerInvoker` for request-response, `makeListenerCaller` for fire-and-forget (disconnect). Must also register the new export module in `src/preload/api/index.ts` (check current aggregation pattern there before assuming auto-registration).

---

### `src/common/types/ipc.ts` (modified — add Humble channel signatures)

**Analog:** existing Steam block, lines 214-230:
```typescript
steamStartQR: () => Promise<{ status: 'done' | 'error'; challengeUrl?: string }>
steamPollQR: () => Promise<{
  status: 'done' | 'waiting' | 'error'
  username?: string
}>
...
getSteamUserInfo: () => Promise<SteamUserData | undefined>
checkSteamInstalled: () => Promise<boolean>
getSteamSyncedAt: () => Promise<number | null>
```
Add Humble equivalents to the same `AsyncIPCFunctions` interface block; add `logoutHumble`/`humbleDisconnect` alongside `logoutSteam` (line 128) in the sync/listener section. Do NOT add a colon-namespaced channel (Pitfall 6).

**FrontendMessages push pattern (for D-09 expiry signal)** — analog is the existing `FrontendMessages` interface (lines 388-432), e.g.:
```typescript
'connectivity-changed': (status: {
  status: ConnectivityStatus
  retryIn: number
}) => void
```
Add `humbleAuthState: (state: { isLoggedIn: boolean; username?: string; expired?: boolean }) => void` to this interface — never include the cookie. Push via `sendFrontendMessage('humbleAuthState', {...})` from `user.ts`'s health-check/401-detection path (mirrors `sendFrontendMessage('refreshLibrary')` at `main.ts:723` and `sendFrontendMessage('metadataChanged', ...)` at `main.ts:1408`).

---

### `src/frontend/screens/Login/index.tsx` (modified — add Humble Runner tile)

**Analog:** Steam `<Runner>` usage, lines 170-179:
```typescript
<Runner
  class="steam"
  buttonText={t('login.steam', 'Steam Login')}
  icon={() => <SteamLogo />}
  loginUrl={steamLoginPath}
  isLoggedIn={isSteamLoggedIn}
  user={steam?.username ?? undefined}
  logoutAction={steam?.logout ?? (() => Promise.resolve())}
  disabled={oldMac}
/>
```
**Divergence (D-05/D-07):** Steam's `loginUrl={steamLoginPath}` navigates to a `/loginweb/:runner` React Route (WebView-based login). Humble's `Connect` action does NOT navigate anywhere — clicking it must call `window.api.humbleStartLogin()` directly (which opens a main-process `BrowserWindow`, not a renderer route). This means the `Runner` component's `loginUrl`/`navigate(props.loginUrl)` behavior (see `Runner/index.tsx` lines 36-42) does not fit Humble's flow as-is.

**Resolution options for planner:**
1. Reuse `Runner` exactly as D-01 states, but pass a `loginUrl` that points to a **new minimal route** (e.g. `/humble-connect`) whose only job is to call `humbleStartLogin()` on mount and then `navigate('/login')` back — this preserves `Runner`'s existing `navigate(props.loginUrl)` call untouched.
2. OR extend `Runner`'s props with an optional `onLoginClick` callback that bypasses navigation when provided (a small, additive change) — this is a mild deviation from "reuse Runner directly" (D-01) and should be flagged to the user/planner as a scope note if chosen.
Research/CONTEXT.md does not resolve this — it is implementation-level discretion within D-01's boundary. Recommend option 1 (zero changes to `Runner`) unless the planner finds it awkward for expired-tile-state text (see below).

**Expired-tile state (D-09):** No existing Runner instance has a 3rd state (connected/disconnected/expired) — all current Runners are binary (`isLoggedIn` boolean). Humble needs a visual "Session expired — Reconnect" state. No in-repo analog; `Runner`'s `buttonText`/`isLoggedIn` props would need a conditional wrapper in `Login/index.tsx` (e.g. `buttonText={isHumbleExpired ? t('login.humble_reconnect', 'Reconnect') : t('login.humble', 'Humble Bundle Login')}`), or introduce a distinct Runner variant. Flag as no-analog; implement additively.

---

### `src/frontend/state/GlobalState.tsx` (modified — add `humble` slice)

**Analog:** `steam` slice — declaration (lines 79-82), init (lines 221-223), login/logout methods (lines 684-710), context assembly (lines 1216-1220):
```typescript
steam: {
  library: GameInfo[]
  username?: string | null
}
...
steam: {
  library: [],
  username: steamConfigStore.get_nodefault('userData')?.username
}
...
steamLogin = async (result: { status: string; username?: string }) => {
  if (result.status === 'done') {
    this.setState({
      steam: {
        library: [],
        username: result.username
      }
    })
    this.refreshLibrary({ runInBackground: true, library: 'steam' })
  }
  return result.status
}

steamLogout = async () => {
  window.api.logoutSteam()
  this.setState({
    steam: {
      library: [],
      username: null
    }
  })
  console.log('Logging out from steam')
  window.location.reload()
}
...
steam: {
  library: steam.library,
  username: steam.username,
  login: this.steamLogin,
  logout: this.steamLogout
}
```
**Divergence:** Humble's slice has no `library: GameInfo[]` field this phase (Humble is not a Runner; no library sync yet). Shape becomes:
```typescript
humble: {
  username?: string | null
  expired?: boolean
}
```
`humbleLogin`/`humbleDisconnect` methods follow the same `setState` + IPC-call shape but skip `refreshLibrary()` entirely (no library exists yet). Add a listener for the `humbleAuthState` push message (new `FrontendMessages` entry above) that updates `expired` — this has no Steam analog (Steam has no expiry-push concept) but should mirror how `connectivity-changed` is subscribed to in this same file (`window.api.onConnectivityChanged`-style listener registration — check `ContextProvider.tsx`/`GlobalState.tsx` around line 1088 for the exact subscribe call before implementing).

---

### `src/frontend/helpers/electronStores.ts` (modified — add `humbleConfigStore` reader)

**Analog:** `steamConfigStore` frontend reader, lines 156-158:
```typescript
const steamConfigStore = new TypeCheckedStoreFrontend('steamConfigStore', {
  cwd: 'steam_store'
})
```
Copy exactly: `const humbleConfigStore = new TypeCheckedStoreFrontend('humbleConfigStore', { cwd: 'humble_store' })`, then add to the file's final export block (mirrors line 203-204 `steamConfigStore, gameOverridesStore`).

---

### `src/backend/humble/__tests__/user.test.ts` (test)

**Analog:** `src/backend/storeManagers/steam/__tests__/user.test.ts` (full file, 981 lines) — copy the mock-boundary structure exactly:
```typescript
jest.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: mockIsEncryptionAvailable,
    encryptString: mockEncryptString,
    decryptString: mockDecryptString
  },
  app: { getPath: jest.fn(() => '/tmp/test') }
}))

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend', ... }
}))

const mockConfigStore = {
  get: jest.fn(),
  get_nodefault: jest.fn(),
  set: jest.fn(),
  clear: jest.fn()
}
jest.mock('../electronStores', () => ({ configStore: mockConfigStore }))
```
For Humble's `user.test.ts`, extend the `electron` mock to also cover `BrowserWindow` and `session.fromPartition` (not needed by Steam's tests since Steam uses steam-session, not a BrowserWindow):
```typescript
jest.mock('electron', () => ({
  safeStorage: { /* as above */ },
  BrowserWindow: jest.fn(() => mockBrowserWindowInstance),
  session: { fromPartition: jest.fn(() => mockSessionInstance) }
}))
```
Test groups to mirror (per RESEARCH.md's Wave 0 Gaps and Phase Requirements → Test Map): `login()` (D-06 silent-cancel-on-close), `encrypt`/`decrypt` (Pitfall 5 user-visible-warning behavior — this is a NEW test not present in Steam's suite, since Steam has no user-facing warning to test), `health check` (D-08 401 detection), `reconnect` (D-11 partition-kept assertion — assert `session.fromPartition` is called but `clearStorageData` is NOT), `disconnect` (D-07 full partition wipe — assert all 5 `clearX` calls per legendary's pattern).

**Password/secret-never-stored test pattern** (steam/user.test.ts lines 329-341) — copy directly, replace "password" with "cookie" assertions:
```typescript
test('configStore.set is never called with password or credentials keys', async () => {
  SteamUser.logout()
  const setCalls = mockConfigStore.set.mock.calls
  for (const [key] of setCalls) {
    expect(key).not.toBe('password')
    expect(key).not.toBe('credentials')
    expect(key).not.toMatch(/password/i)
  }
})
```
Humble equivalent: assert no `configStore.set`/`logInfo`/`logError`/`logWarning` call ever contains the raw `_simpleauth_sess` cookie value (Pitfall 4 — new test, no Steam precedent needed since Steam's cookie-analog is the refresh token and its test suite already does this check for tokens).

---

### `src/backend/humble/__tests__/adapter.test.ts` (test)

**Analog:** No exact in-repo analog. Nearest structural precedent is `steam/__tests__/games.test.ts`'s axios-mocking style (referenced in 08-VALIDATION.md as the CONSOLE-01 Gap B test, `is_delisted` detection from `success:false` responses) — mock `axios.get`/`axios.isAxiosError`, assert on response-shape branches. Build fixtures for: valid gamekeys array (200 + zod-valid), 401 → `session_expired`, 403 → `access_denied`, malformed body → `schema_error`. Also assert `X-Requested-By: hb_android_app` header is present on every outgoing call (per RESEARCH.md Wave 0 Gaps).

---

### `10-VALIDATION.md` (validation gate artifact, D-15)

**Analog:** `.planning/phases/08-new-steam-surfaces/08-VALIDATION.md` — structural pattern only (frontmatter + tables), not content:
```yaml
---
phase: 8
slug: new-steam-surfaces
status: approved
nyquist_compliant: false
wave_0_complete: true
created: 2026-07-04
---
```
followed by `## Test Infrastructure`, `## Per-Task Verification Map` (table with Task/Requirement/Test Type/Command/Status columns), `## Manual-Only Verifications`, `## Validation Sign-Off`. Phase 10's `10-VALIDATION.md` is a distinct artifact type (D-12/D-13's live-API pass/fail report), so it should follow this table-and-frontmatter *shape* but its content is the redacted endpoint/status-code/schema-parse report described in D-15 — not a copy of Phase 8's specific rows.

---

## Shared Patterns

### safeStorage encryption + TOKEN_PREFIX sentinel
**Source:** `src/backend/storeManagers/steam/user.ts` lines 11-48
**Apply to:** `src/backend/humble/user.ts` (cookie encryption)
**Required change:** add user-visible warning path per success criterion 5 (see Pitfall 5/Open Question 1) — do not copy the log-only behavior verbatim.

### Isolated session partition wipe
**Source:** `src/backend/storeManagers/legendary/user.ts` lines 71-78
**Apply to:** `src/backend/humble/user.ts` disconnect path (full wipe) — reconnect path must skip this (D-11), which has no precedent in `legendary/user.ts` (Epic has no reconnect-keep-session concept).

### IPC registration via `addHandler`/`addListener`, camelCase channel names
**Source:** `src/backend/main.ts` lines 860-874; `src/common/types/ipc.ts` lines 214-230; `src/preload/api/steam.ts` (full file)
**Apply to:** All Humble IPC surfaces — `humble/ipc_handler.ts`, `common/types/ipc.ts` additions, `preload/api/humble.ts`.

### electron-store TypeCheckedStoreBackend/Frontend pairing
**Source:** `src/backend/storeManagers/steam/electronStores.ts` (backend) + `src/frontend/helpers/electronStores.ts` lines 156-158 (frontend reader)
**Apply to:** `src/backend/humble/electronStores.ts` + `src/frontend/helpers/electronStores.ts` addition.

### Static-class auth service with private in-memory session state
**Source:** `src/backend/storeManagers/steam/user.ts` (class `SteamUser`, lines 52-176)
**Apply to:** `src/backend/humble/user.ts` (class `HumbleUser`).

### Logger discipline — message string + LogPrefix, never raw secret interpolation
**Source:** every `logWarning`/`logError` call in `steam/user.ts` (e.g. lines 24-27, 111-114, 137-140)
**Apply to:** `adapter.ts` and `user.ts` — extend with the explicit Pitfall 4 rule (never log cookie or full response body), which is stricter than any existing Steam log call needs to be (Steam's refresh token is likewise never logged, but no explicit test enforces it the way Humble's should per RESEARCH.md Wave 0 Gaps).

## No Analog Found

| File / Concern | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/backend/humble/adapter.ts` core HTTP+zod+401/403 logic | service | request-response | No existing adapter in this codebase combines cookie-auth + zod validation + 401/403 branching; must be built from RESEARCH.md Pattern 3 (synthesized, not copied from an in-repo file) |
| BrowserWindow login window + cookie-detection polling (D-05) | service | event-driven | No existing runner uses a dedicated BrowserWindow + isolated partition for login; Epic/GOG/Amazon/Zoom/Steam all use the `/loginweb/:runner` WebView route or steam-session's own transport. Build from RESEARCH.md Pattern 1 |
| Reconnect-toast / expired-tile visual state (D-09) | component | event-driven | No toast/notification library exists in this codebase (`grep` for notistack/toast found nothing); closest existing signal mechanism is the `showDialog` IPC channel + `DialogModalOptions` (blocking modal, not a dismissible toast). Planner must decide: build a minimal toast primitive, or repurpose `showDialog` non-blocking-style, or extend `Runner`/`Login/index.tsx` with an inline banner |
| Dev-only debug trigger surface (D-12) | controller | request-response | No existing "dev-only" IPC/menu trigger pattern in this codebase to copy; nearest analog is the general `addHandler`/menu-registration mechanism (`main.ts` menu items around line 1441+), but nothing gates a handler as "dev-only" today — planner has full discretion per CONTEXT.md |
| `humbleLibraryStore`/`humbleAuditStore` (explicitly NOT Phase 10 scope) | store | CRUD | Deferred to Phase 11/14 per RESEARCH.md project-structure note; listed here only to confirm it should NOT be created this phase |

## Metadata

**Analog search scope:** `src/backend/storeManagers/{steam,legendary}/`, `src/backend/main.ts`, `src/common/types/`, `src/preload/api/`, `src/frontend/screens/Login/`, `src/frontend/state/`, `src/frontend/helpers/electronStores.ts`, `.planning/phases/08-new-steam-surfaces/08-VALIDATION.md`
**Files scanned:** 14 read in full/targeted (steam/user.ts, steam/electronStores.ts, steam/constants.ts, steam/__tests__/user.test.ts, legendary/user.ts, main.ts [targeted], common/types/ipc.ts [targeted], common/types/steam.ts, preload/api/steam.ts, Login/index.tsx, Runner/index.tsx, SteamLogin/index.tsx, GlobalState.tsx [targeted], frontend/helpers/electronStores.ts [targeted])
**Pattern extraction date:** 2026-07-05
