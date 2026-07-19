---
phase: 01-steam-authentication
plan: 02
subsystem: auth
tags: [steam, typescript, electron-store, steam-session, steam-user, safeStorage, ipc, preload]

requires:
  - "01-01 (type + dependency foundation: LogPrefix.Steam, steamConfigStore in StoreStructure, SteamUserData, IPC types)"

provides:
  - "SteamUser static class with isSteamClientInstalled, isLoggedIn, logout, getCredentials, getUserDetails"
  - "QR login flow: startQRLogin + pollQRLogin"
  - "Credential + SteamGuard flow: startCredentialLogin + submitSteamGuardCode"
  - "Encrypted refresh token storage via safeStorage + steam:v1: prefix"
  - "7 IPC handlers registered in main.ts (steamStartQR, steamPollQR, steamStartCredentials, steamSubmitGuard, getSteamUserInfo, checkSteamInstalled, logoutSteam)"
  - "window.api.steam* preload bridge via src/preload/api/steam.ts"

affects:
  - 01-03 (steam login UI — can now call all window.api.steam* methods)

tech-stack:
  added: []
  patterns:
    - "SteamUser static class pattern follows ZoomUser (no CLI binary, token-based auth)"
    - "safeStorage encrypt/decrypt follows secureKey.ts pattern with steam:v1: prefix"
    - "QR session state tracked in qrSessionState field; pollQRLogin() is pure status read"
    - "guard_required detected from startWithCredentials() actionRequired: boolean (not a steamGuardRequired event)"
    - "finishAuth(): shared success path — encrypt token, logOn steam-user, getPersonas, store userData"
    - "Preload bridge follows zoom.ts pattern: makeHandlerInvoker + makeListenerCaller"

key-files:
  created:
    - src/backend/storeManagers/steam/constants.ts
    - src/backend/storeManagers/steam/electronStores.ts
    - src/backend/storeManagers/steam/user.ts
    - src/backend/storeManagers/steam/__tests__/user.test.ts
    - src/preload/api/steam.ts
  modified:
    - src/backend/main.ts
    - src/preload/api/index.ts

key-decisions:
  - "No steamGuardRequired event in steam-session 1.9.4 — guard detected from startWithCredentials() return value (actionRequired: boolean)"
  - "startWithQR() returns { qrChallengeUrl } (not challengeUrl) — RESEARCH.md A1 confirmed correct property name"
  - "getPersonas returns { personas: { [steamId64]: { player_name: '...' } } } — player_name field confirmed from steam-user components/friends.js"
  - "steam-session exports named: import { LoginSession, EAuthTokenPlatformType } from 'steam-session'"
  - "steam-user: export = SteamUser — import SteamUserLib from 'steam-user' with esModuleInterop"
  - "test mock reset issue: jest config resetMocks: true clears all implementations; fixed by re-establishing all mock impls in global beforeEach"
  - "backend/logger auto-mock fails in nested test paths (fs-extra native module error); fixed with jest.mock factory"

metrics:
  duration: "8 min"
  completed: "2026-06-27"
---

# Phase 1 Plan 02: Backend SteamUser Auth Core, IPC Handlers, and Preload Bridge Summary

**SteamUser static class with QR + credential + SteamGuard auth flows, safeStorage-encrypted token storage, 34 unit tests passing, 7 IPC handlers registered, and window.api.steam* preload bridge wired**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-27T00:20:52Z
- **Completed:** 2026-06-27T00:28:xx
- **Tasks:** 3 executed
- **Files modified/created:** 7

## Accomplishments

- Created `src/backend/storeManagers/steam/constants.ts` with STEAM_INSTALL_PATHS (linux/darwin/win32), TOKEN_PREFIX='steam:v1:', TOKEN_STORE_KEY, STEAM_DOWNLOAD_URL
- Created `src/backend/storeManagers/steam/electronStores.ts` with steamConfigStore via TypeCheckedStoreBackend('steamConfigStore', { cwd: 'steam_store' })
- Created `src/backend/storeManagers/steam/user.ts` — SteamUser static class:
  - `isSteamClientInstalled()`: checks STEAM_INSTALL_PATHS[platform] via existsSync
  - `encryptToken`/`decryptToken`: safeStorage.encryptString/decryptString with 'steam:v1:' prefix, plaintext fallback with warning
  - `isLoggedIn()`: synchronous configStore.get_nodefault('isLoggedIn') read
  - `logout()`: logOff() if client connected, clear configStore, null session and client
  - `getUserDetails()`: returns configStore.get_nodefault('userData')
  - `getCredentials()`: decrypts stored token or returns undefined
  - `startQRLogin()`: creates LoginSession, startWithQR(), returns { status, challengeUrl: response.qrChallengeUrl }
  - `pollQRLogin()`: returns current qrSessionState (waiting/done/error)
  - `startCredentialLogin(u, p)`: guard_required if actionRequired, else waits for authenticated
  - `submitSteamGuardCode(code)`: calls session.submitSteamGuardCode, awaits authenticated
  - `finishAuth(refreshToken)`: shared path — encrypts+stores token, creates steam-user client, logOn, getPersonas, stores userData
- Created `src/backend/storeManagers/steam/__tests__/user.test.ts`: 34 unit tests, all passing (AUTH-01..05)
- Updated `src/backend/main.ts`: import SteamUser, 7 handlers registered after zoom block
- Created `src/preload/api/steam.ts`: 7 bridge functions matching ipc.ts keys
- Updated `src/preload/api/index.ts`: import * as Steam, spread ...Steam

## Task Commits

1. **Tasks 1+2: Steam constants, configStore, SteamUser class + auth flows + unit tests** — `7b82c5e` (feat)
2. **Task 3: IPC handlers in main.ts and preload bridge** — `33313f9` (feat)

## Deviations from Plan

### API Corrections (from [ASSUMED] in RESEARCH.md)

**1. [Rule 1 - API Correction] No steamGuardRequired event in steam-session 1.9.4**
- **Found during:** Task 2 — verified against node_modules/steam-session/dist/LoginSession.d.ts
- **Expected (ASSUMED):** steam-session emits `steamGuardRequired` event when SteamGuard is needed
- **Actual API:** `startWithCredentials()` returns `StartSessionResponse { actionRequired: boolean, validActions?: [...] }`. If `actionRequired: true`, SteamGuard is required
- **Fix:** `startCredentialLogin()` checks `response.actionRequired` and returns `{ status: 'guard_required' }` directly
- **Correction tracked as:** RESEARCH.md A2 — Assumption WRONG

**2. [Rule 1 - API Correction] qrChallengeUrl property confirmed on StartSessionResponse**
- **Found during:** Task 2 — verified against node_modules/steam-session/dist/interfaces-external.d.ts
- **Expected (ASSUMED):** `startWithQR()` returns object with `qrChallengeUrl` property
- **Actual API:** Confirmed. `StartSessionResponse.qrChallengeUrl?: string` — property name matches assumption
- **Correction tracked as:** RESEARCH.md A1 — Assumption CONFIRMED

**3. [Rule 1 - API Correction] getPersonas returns { personas: Record<string, any> } where player_name is the display name**
- **Found during:** Task 2 — verified against steam-user components/friends.js and @types/steam-user
- **Expected (ASSUMED):** RESEARCH.md mentioned `persona_name` as possible field
- **Actual API:** `getPersonas()` returns `{ personas: { [steamId64]: { player_name: '...' } } }` — field is `player_name` (confirmed in steam-user source)
- **Correction tracked as:** RESEARCH.md A3 — Assumption PARTIALLY CORRECT, field is `player_name` not `persona_name`

**4. [Rule 1 - Test Infrastructure] jest resetMocks: true clears mock implementations**
- **Found during:** Task 1 — test suite failed with auth flow tests returning 'error'
- **Issue:** jest.config.js has `resetMocks: true` which clears all mock implementations before each test, including `jest.fn(() => mockSessionInstance)` constructor mocks
- **Fix:** Added comprehensive mock re-establishment in global `beforeEach` — re-sets LoginSession constructor, session.on handler capture, SteamUserLib constructor, steamUserInstance handlers and methods
- **Impact:** All 34 tests pass after fix

**5. [Rule 1 - Test Infrastructure] backend/logger auto-mock fails in nested test path**
- **Found during:** Task 1 — test suite failed to run with `TypeError: Cannot read properties of undefined (reading 'native')` from fs-extra
- **Issue:** `jest.mock('backend/logger')` without factory triggers auto-mock which loads the full module chain (backend/logger → utils.ts → gog/user.ts → storeManagers/index.ts → shortcuts → fs-extra → native module crash)
- **Fix:** Changed to `jest.mock('backend/logger', () => ({ logInfo, logError, logWarning, LogPrefix }))` factory to prevent module loading

---

**Total deviations:** 5 (3 API corrections, 2 test infrastructure fixes — all auto-fixed under Rules 1-2)

## Known Stubs

None. All methods are fully implemented.

## Threat Flags

No new network endpoints, auth paths, or schema changes beyond the plan's threat model. All T-01 mitigations implemented:
- T-01-DISC-TOKEN: encryptToken with steam:v1: prefix applied in finishAuth
- T-01-DISC-PWD: password never passed to configStore.set (verified by test assertion)
- T-01-EOP: steam-session/steam-user only in src/backend/ (verified: no frontend imports)
- T-01-SPOOF-TOTP: submitSteamGuardCode returns { status: 'error' } without retry on failure
- T-01-TAMPER: IPC handlers receive primitives only; no HTML rendering in backend

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/backend/storeManagers/steam/constants.ts | FOUND |
| src/backend/storeManagers/steam/electronStores.ts | FOUND |
| src/backend/storeManagers/steam/user.ts | FOUND |
| src/backend/storeManagers/steam/__tests__/user.test.ts | FOUND |
| src/preload/api/steam.ts | FOUND |
| Commit 7b82c5e (Tasks 1+2) | FOUND |
| Commit 33313f9 (Task 3) | FOUND |
