# Phase 1: Steam Authentication - Research

**Researched:** 2026-06-26
**Domain:** Electron IPC + steam-session + steam-user + React native form UI
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Use a dedicated `/loginweb/steam` route (matching `/loginweb/gog`, `/loginweb/legendary`, `/loginweb/nile` pattern) — a React screen that owns the native form UI.
- **D-02:** Multi-step flow: step 1 shows username + password fields; step 2 shows a single SteamGuard code input. Step 2 handles both email codes and TOTP from one input field.
- **D-03:** Back button on step 2 returns to step 1 (credentials re-entry, fields clear on back).
- **D-04:** The `/loginweb/steam` screen has two co-equal tabs: "QR Code" and "Username & Password". Neither is default.
- **D-05:** QR code auto-refreshes when the steam-session challenge URL expires (~30s). No manual refresh button.
- **D-06:** Match the existing GOG/Epic/Amazon/Zoom card pattern exactly: Steam logo + "Logged in as [display name]" + [Log out] button. No avatar, no Steam64 ID.
- **D-07:** Steam client detection checks known platform-specific filesystem paths at login-attempt time (Linux: `/usr/bin/steam` or `~/.steam/steam`; macOS: `/Applications/Steam.app`; Windows: `C:\Program Files (x86)\Steam\Steam.exe`).
- **D-08:** When Steam client is not detected: show a prompt with warning text and a [Download Steam] button (`shell.openExternal('https://store.steampowered.com/about/')`). Auth cannot proceed. Steam tile in Login screen remains clickable — gate fires on login attempt.
- **D-09:** Store the steam-session refresh token via `electron-store` + `safeStorage` encryption, following the `configStore` pattern in `src/backend/storeManagers/gog/electronStores.ts`. New `src/backend/storeManagers/steam/electronStores.ts` with a `steamConfigStore`.

### Claude's Discretion

- Error state messaging (network failures, invalid credentials, wrong SteamGuard code) — follow existing GOG/Epic error patterns.
- Loading/pending states during QR generation and credential submission — standard spinner pattern.
- Exact visual layout of the two-tab login screen — match existing aesthetic.

### Deferred Ideas (OUT OF SCOPE)

- Multi-account Steam support
- TOTP toggle UI (email-only SteamGuard at launch)
- Token expiry notification
- Avatar display in account card
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can add a Steam account via QR code scan (Steam mobile app) | steam-session `startWithQR()` → `qrCodeData` event → react-qr-code renders URL as scannable SVG; polling via IPC. See Architecture Patterns §QR Flow. |
| AUTH-02 | User can add a Steam account via username + password + SteamGuard code | steam-session `startWithCredentials()` → SteamGuard event → `submitSteamGuardCode()`. Two-step React form. See Architecture Patterns §Credential Flow. |
| AUTH-03 | User can view and manage Steam accounts in the existing Manage Accounts screen | Steam Runner tile wired into `Login/index.tsx` following GOG/Zoom pattern. Username sourced from `steamConfigStore`. See Code Examples §Login Screen Integration. |
| AUTH-04 | User can remove a Steam account from GamerLib | `SteamUser.logout()` clears configStore + disconnects steam-user client. `steamLogout()` in GlobalState reloads app. See Code Examples §Logout Pattern. |
| AUTH-05 | App detects if Steam client is installed and shows an actionable prompt if not | `checkSteamInstalled` IPC handler checks per-platform filesystem paths. Fires at login-attempt time, not at app start. See Architecture Patterns §Steam Client Detection. |
</phase_requirements>

---

## Summary

Phase 1 implements Steam authentication entirely within the existing Heroic/GamerLib store manager pattern. The implementation differs from GOG/Epic/Amazon/Zoom in one fundamental way: instead of a BrowserView-based OAuth flow, the `/loginweb/steam` route renders a native React form that communicates with `steam-session` via IPC. The WebView component is not involved for Steam auth.

The backend uses `steam-session` to handle the credential and QR flows, then stores the resulting refresh token encrypted via `safeStorage`. A `steam-user` client is initialized post-auth to validate the session and retrieve user details (display name, SteamID). The frontend registers Steam in the same Runner tile pattern used by all existing platforms.

`clearCache()` in `src/backend/utils.ts` currently handles `'gog' | 'legendary' | 'nile' | 'zoom'` — the zoom case is present in the type union but not handled in the function body, meaning Zoom's logout clears its own stores directly. Steam should follow the same pattern: `SteamUser.logout()` clears steam stores directly rather than through `clearCache`.

**Primary recommendation:** Build in the sequence: types → backend auth → IPC handlers → frontend stores → GlobalState → Login screen → SteamLogin screen. The TypeScript `satisfies Record<Runner, LibraryManager>` constraint in `storeManagers/index.ts` is a correctness gate that will catch any implementation gaps at compile time.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| QR challenge URL generation | Backend (Main) | — | steam-session runs in main process; opens TCP/WebSocket to Steam CM servers; renderer cannot import it directly |
| QR code rendering | Frontend (Renderer) | — | React component renders the URL string received via IPC as an SVG QR code |
| Credential submission | Frontend (Renderer) | Backend (Main) | User enters in React form; IPC call carries credentials to main process; main process calls steam-session |
| SteamGuard code step | Frontend (Renderer) | Backend (Main) | Renderer shows step-2 form; main process calls `submitSteamGuardCode()` |
| Refresh token storage | Backend (Main) | — | `safeStorage` and `electron-store` only accessible from main process |
| Steam client detection | Backend (Main) | — | Filesystem checks require Node.js `fs` module; cannot run in renderer |
| User display name retrieval | Backend (Main) | — | steam-user CM connection validates token and returns persona name |
| Login state display | Frontend (Renderer) | — | Reads `steamConfigStore` via `TypeCheckedStoreFrontend` (IPC-bridged reads) |
| Account card (Manage Accounts) | Frontend (Renderer) | — | Existing Runner component with Steam-specific props |

---

## Standard Stack

### Core (locked in CLAUDE.md and CONTEXT.md)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| steam-session | 1.9.4 | Obtain Steam refresh token (QR + credentials + SteamGuard flows) | Pure JS; DoctorMcKay; handles all auth flows; steam-user's transitive dep — installs automatically |
| steam-user | 5.3.0 | Connect to Steam CM network; validate token; get display name | Core client-protocol library; main-process only; no native modules |
| electron-store | 8.2.0 | Persist refresh token + user data | Already in project; used by GOG/Zoom; `TypeCheckedStoreBackend` pattern established |
| @types/steam-user | 5.1.1 | TypeScript definitions for steam-user v5.x | DefinitelyTyped; dev dependency only |

### Supporting (already in project, no new install needed)

| Library | Already Present | Role in Phase 1 |
|---------|-----------------|-----------------|
| Electron `safeStorage` | Built-in (Electron 41.1.1) | Encrypt refresh token at rest; same API as `src/backend/steamgrid/secureKey.ts` |
| `@fortawesome/free-brands-svg-icons` | Yes (`^6.7.2`) | `faSteam` icon for Runner tile and login screen header |
| `@mui/material` | Yes (`^5.17.1`) | MUI `Tabs`/`Tab` for the QR/Credentials tab switcher |
| `TabPanel` component | Yes (`src/frontend/components/UI/TabPanel/`) | Tab content switcher; reuse directly |
| axios | Yes (`^1.13.5`) | Not needed for Phase 1 auth; reserved for Phase 2 library metadata |

### New Dependency: react-qr-code

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| react-qr-code | 2.2.0 (current) | Render steam-session challenge URL as SVG QR code | Pure SVG renderer; no network access; no native modules; ~5KB |

**Installation:**
```bash
# New runtime dependencies
npm install steam-user react-qr-code

# New dev dependency (types)
npm install -D @types/steam-user

# steam-session installs automatically as a dependency of steam-user
```

**Version verification (confirmed via `npm view`):**
- `steam-user`: 5.3.0 [VERIFIED: npm registry]
- `steam-session`: 1.9.4 [VERIFIED: npm registry] (transitive; no explicit install)
- `@types/steam-user`: 5.1.1 [VERIFIED: npm registry]
- `react-qr-code`: 2.2.0 [VERIFIED: npm registry]

---

## Package Legitimacy Audit

> slopcheck was not available in this environment. All packages verified manually against npm registry, GitHub source repositories, and official documentation. No packages are marked as suspicious based on manual review.

| Package | Registry | Age | Source Repo | Postinstall | Disposition |
|---------|----------|-----|-------------|-------------|-------------|
| steam-user | npm | ~10 yrs (created 2015-07-21) | github.com/DoctorMcKay/node-steam-user | none | Approved |
| steam-session | npm | ~3 yrs | github.com/DoctorMcKay/node-steam-session | none | Approved |
| @types/steam-user | npm | ~5 yrs | github.com/DefinitelyTyped/DefinitelyTyped | none | Approved |
| react-qr-code | npm | ~5 yrs | github.com/rosskhanas/react-qr-code | none | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none

**Packages flagged as suspicious [SUS]:** none

*slopcheck was unavailable at research time. All packages confirmed via `npm view` (registry existence), source repo inspection (legitimate maintainers), and no postinstall scripts. Planner may optionally add a manual verification checkpoint before `npm install steam-user react-qr-code`.*

---

## Architecture Patterns

### System Architecture Diagram

```
[User: Login screen]
        │
        ▼
[Runner tile: "Steam Login" button]
        │ navigate('/loginweb/steam')
        ▼
[/loginweb/steam route → SteamLogin component] ──────────────────────────┐
        │                                                                  │
        ├─ Tab: QR Code ─────────────────────────────────────────────┐    │
        │       │ mount                                               │    │
        │       │ window.api.steamStartQR()  [IPC invoke]            │    │
        │       │         │                                           │    │
        │       │         ▼ [Main Process]                            │    │
        │       │   steam-session.startWithQR()                       │    │
        │       │         │ qrCodeData event                          │    │
        │       │         │ returns {challengeUrl}                    │    │
        │       │◄────────┘                                           │    │
        │       │ <QRCode value={challengeUrl} /> ────► [User scans]  │    │
        │       │                                                │     │    │
        │       │                                    [Steam mobile]   │    │
        │       │ window.api.steamPollQR()  [IPC poll]                │    │
        │       │         │                                           │    │
        │       │         ▼                                           │    │
        │       │   steam-session authenticated event                  │    │
        │       │         │ refreshToken                              │    │
        │       │         ▼                                           │    │
        │       │   safeStorage.encryptString(token)                  │    │
        │       │   steamConfigStore.set('refreshToken', encrypted)   │    │
        │       │   steam-user.logOn({refreshToken})                  │    │
        │       │   → loggedOn event → getPersonaName()               │    │
        │       │         │                                           │    │
        │       │◄── { status: 'done', username }                     │    │
        │       │                                                │     │    │
        │       └───────────── Auth Success ──────────────────► │     │    │
        │                                                        │     │    │
        ├─ Tab: Username & Password ──────────────────────────── │ ─── │ ──┤
        │       │ Step 1: username + password form               │     │    │
        │       │ window.api.steamStartCredentials(u,p) [IPC]   │     │    │
        │       │         │                                      │     │    │
        │       │         ▼                                      │     │    │
        │       │   steam-session.startWithCredentials()         │     │    │
        │       │         │                                      │     │    │
        │       │    ┌────┴─────────────┐                        │     │    │
        │       │    │ SteamGuard needed│ → IPC event to renderer│     │    │
        │       │    └────┬─────────────┘                        │     │    │
        │       │         │ Step 2: SteamGuard input             │     │    │
        │       │         │ window.api.steamSubmitGuard(code)    │     │    │
        │       │         ▼                                      │     │    │
        │       │   submitSteamGuardCode(code)                   │     │    │
        │       │         │ → refreshToken                       │     │    │
        │       │         │ → [same storage path as QR]          │     │    │
        │       │◄── { status: 'done', username }                │     │    │
        │                                                        │     │    │
        └─────────────────────────────────────────────────────── │ ─── │ ──┘
                                                                 │     │
                                                                 ▼     │
                                             [GlobalState.steamLogin()] │
                                             setState({ steam: {        │
                                               username, library: []    │
                                             }})                        │
                                             handleSuccessfulLogin('steam')
                                             navigate('/login')
                                                                        │
[Login screen: Runner tile shows "Logged in as {username}" + [Log Out]] ◄─┘
```

### Recommended Project Structure

```
src/
├── backend/
│   ├── storeManagers/
│   │   ├── steam/
│   │   │   ├── constants.ts      # steamConfigPath, logPrefix, Steam install paths
│   │   │   ├── electronStores.ts # steamConfigStore (TypeCheckedStoreBackend)
│   │   │   └── user.ts           # SteamUser static class
│   │   └── index.ts              # Add steam: new SteamLibraryManager() [Phase 2]
│   └── logger/
│       └── constants.ts          # Add Steam to LogPrefix, RunnerToLogPrefixMap
├── common/
│   ├── types.ts                  # Add 'steam' to Runner union
│   ├── types/
│   │   ├── electron_store.ts     # Add steamConfigStore to StoreStructure
│   │   ├── ipc.ts                # Add authSteam, logoutSteam, getSteamUserInfo, checkSteamInstalled, steamStartQR, steamPollQR, steamStartCredentials, steamSubmitGuard
│   │   └── steam.ts              # New: SteamCredentials, SteamUserData types
│   └── main.ts                   # Register Steam IPC handlers
└── frontend/
    ├── screens/
    │   ├── Login/
    │   │   ├── index.tsx          # Add Steam Runner tile, steamLoginPath export
    │   │   └── components/
    │   │       └── SteamLogin/    # New screen component
    │   │           ├── index.tsx  # Two-tab native form (QR + Credentials)
    │   │           └── index.scss # Styles using existing CSS custom properties
    │   └── App.tsx                # Add loginweb/steam route BEFORE loginweb/:runner
    ├── state/
    │   ├── GlobalState.tsx        # Add steamLogin, steamLogout, loadSteamLibrary, steam state
    │   └── ContextProvider.tsx    # Add steam to initialContext
    ├── helpers/
    │   └── electronStores.ts      # Add steamConfigStore, steamLibraryStore
    └── types.ts                   # Add steam to ContextType; add 'steam' to Category
```

### Critical Routing Note

The existing App.tsx route `{ path: 'loginweb/:runner', lazy: ... WebView }` would capture `/loginweb/steam` and render the browser-based WebView. This is wrong for Steam. The fix is to add a more specific route **before** the generic one:

```typescript
// In src/frontend/App.tsx — add BEFORE the existing loginweb/:runner entry:
{
  path: 'loginweb/steam',
  lazy: makeLazyFunc(import('./screens/Login/components/SteamLogin'))
},
{
  path: 'loginweb/:runner',   // existing — unchanged
  lazy: makeLazyFunc(import('./screens/WebView'))
}
```

React Router v6 matches by specificity, so `loginweb/steam` takes priority over `loginweb/:runner` for the steam path. [VERIFIED: react-router-dom docs, route matching behavior]

### Pattern 1: Backend SteamUser Static Class

Follows `ZoomUser` pattern (no CLI binary), not `GOGUser` (which delegates to `gogdl` CLI). Key difference: token is stored encrypted via `safeStorage`, not as a raw file.

```typescript
// src/backend/storeManagers/steam/user.ts
import { safeStorage } from 'electron'
import SteamSession from 'steam-session'  // [ASSUMED: exact import style]
import SteamUserLib from 'steam-user'     // [ASSUMED: exact import style]
import { logInfo, logError, LogPrefix } from 'backend/logger'
import { configStore } from './electronStores'

const TOKEN_KEY = 'refreshToken'
const TOKEN_PREFIX = 'steam:v1:'

export class SteamUser {
  private static client: SteamUserLib | null = null

  static async login(credentials: SteamLoginCredentials): Promise<{
    status: 'done' | 'error'
    username?: string
  }> {
    // ... steam-session auth flow
    // On success: store encrypted token, connect steam-user, get username
  }

  static async getUserDetails(): Promise<SteamUserData | undefined> {
    // Return stored userData from configStore
  }

  static isLoggedIn(): boolean {
    return Boolean(configStore.get_nodefault('isLoggedIn'))
  }

  static logout(): void {
    this.client?.logOff()
    this.client = null
    configStore.clear()
    logInfo('Logging user out from Steam', LogPrefix.Steam)
  }

  static async getCredentials(): Promise<{ refreshToken: string } | undefined> {
    const encrypted = configStore.get_nodefault('refreshToken')
    if (!encrypted || typeof encrypted !== 'string') return undefined
    try {
      const token = safeStorage.decryptString(
        Buffer.from(encrypted.slice(TOKEN_PREFIX.length), 'base64')
      )
      return { refreshToken: token }
    } catch { return undefined }
  }
}
```

**Source:** Pattern derived from direct inspection of `src/backend/storeManagers/zoom/user.ts` and `src/backend/steamgrid/secureKey.ts` [VERIFIED: codebase]

### Pattern 2: electronStores for Steam

```typescript
// src/backend/storeManagers/steam/electronStores.ts
import { TypeCheckedStoreBackend } from '../../electron_store'

const configStore = new TypeCheckedStoreBackend('steamConfigStore', {
  cwd: 'steam_store'
})

export { configStore }
```

**Critical:** The name `'steamConfigStore'` must be added to `StoreStructure` in `src/common/types/electron_store.ts` or TypeScript compilation will fail. [VERIFIED: codebase — `TypeCheckedStoreBackend<Name extends ValidStoreName>` constraints to `keyof StoreStructure`]

```typescript
// In src/common/types/electron_store.ts — add to StoreStructure interface:
steamConfigStore: {
  isLoggedIn: boolean
  refreshToken?: string   // stored as safeStorage-encrypted base64 string
  userData?: SteamUserData
}
```

### Pattern 3: safeStorage Encrypt/Decrypt

Exact pattern from `src/backend/steamgrid/secureKey.ts` [VERIFIED: codebase]:

```typescript
import { safeStorage } from 'electron'

const PREFIX = 'steam:v1:'

function encryptToken(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) return plain  // fallback
  const ciphertext = safeStorage.encryptString(plain).toString('base64')
  return `${PREFIX}${ciphertext}`
}

function decryptToken(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored  // legacy plaintext
  if (!safeStorage.isEncryptionAvailable()) return ''
  const buf = Buffer.from(stored.slice(PREFIX.length), 'base64')
  return safeStorage.decryptString(buf)
}
```

### Pattern 4: IPC Handler Registration

Location: `src/backend/main.ts`, grouped with other auth handlers around line 817. [VERIFIED: codebase]

```typescript
// New Steam IPC handlers — add after existing authZoom block (~line 833):
addHandler('steamStartQR', async () => {
  return SteamUser.startQRLogin()
})
addHandler('steamPollQR', async () => {
  return SteamUser.pollQRLogin()
})
addHandler('steamStartCredentials', async (event, { username, password }) => {
  return SteamUser.startCredentialLogin(username, password)
})
addHandler('steamSubmitGuard', async (event, code) => {
  return SteamUser.submitSteamGuardCode(code)
})
addHandler('getSteamUserInfo', async () => SteamUser.getUserDetails())
addHandler('checkSteamInstalled', async () => SteamUser.isSteamClientInstalled())
addListener('logoutSteam', () => SteamUser.logout())
```

### Pattern 5: GlobalState Login/Logout Methods

Follows `zoomLogin`/`zoomLogout` pattern from `src/frontend/state/GlobalState.tsx` lines 634–665 [VERIFIED: codebase]:

```typescript
steamLogin = async (result: { status: string; username?: string }) => {
  if (result.status === 'done') {
    this.setState({
      steam: {
        library: [],
        username: result.username
      }
    })
    this.handleSuccessfulLogin('steam')
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
  window.location.reload()
}
```

### Pattern 6: Login Screen Integration

Exact pattern from `src/frontend/screens/Login/index.tsx` [VERIFIED: codebase]:

```typescript
// Add to imports:
export const steamLoginPath = '/loginweb/steam'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSteam } from '@fortawesome/free-brands-svg-icons'

// Add to context destructure:
const { epic, gog, amazon, zoom, steam, refreshLibrary } = useContext(ContextProvider)

// Add state:
const [isSteamLoggedIn, setIsSteamLoggedIn] = useState(Boolean(steam?.username))

// Add to useEffect dependencies:
}, [epic.username, gog.username, amazon.user_id, zoom.username, steam?.username, t])

// Add Runner in runnerGroup div (after zoom Runner):
<Runner
  class="steam"
  buttonText="Steam Login"
  icon={() => <FontAwesomeIcon icon={faSteam} />}
  loginUrl={steamLoginPath}
  isLoggedIn={isSteamLoggedIn}
  user={steam?.username}
  logoutAction={steam?.logout}
  disabled={oldMac}
/>
```

Note: Steam tile is NOT gated behind an `enabled` flag like Zoom. It always renders. [VERIFIED: CONTEXT.md D-08]

### Pattern 7: Steam Client Detection

```typescript
// In src/backend/storeManagers/steam/user.ts or constants.ts
import { existsSync } from 'graceful-fs'
import { homedir } from 'os'
import { platform } from 'process'

export function isSteamClientInstalled(): boolean {
  switch (platform) {
    case 'linux':
      return existsSync('/usr/bin/steam') ||
             existsSync(`${homedir()}/.steam/steam`)
    case 'darwin':
      return existsSync('/Applications/Steam.app')
    case 'win32':
      return existsSync('C:\\Program Files (x86)\\Steam\\Steam.exe')
    default:
      return false
  }
}
```

Detection runs at login-attempt time (inside `SteamLogin/index.tsx` on mount via `window.api.checkSteamInstalled()`), not at app startup. [VERIFIED: CONTEXT.md D-07, D-08]

### Anti-Patterns to Avoid

- **Don't import steam-user in renderer:** steam-user opens CM server connections via TCP/WebSocket. Only import in main process. All renderer access goes through IPC. [VERIFIED: codebase architecture pattern]
- **Don't store raw password:** Steam Web API ToS prohibits it. Store only refresh token. [VERIFIED: PITFALLS.md, Steam ToS]
- **Don't copy GOG WebView auth flow for Steam:** GOG uses `gogdl auth` CLI + OAuth redirect. Steam uses native protocol with no CLI binary. Follow Zoom pattern. [VERIFIED: codebase — gog/user.ts vs zoom/user.ts]
- **Don't use `clearCache('steam')`:** The `clearCache` function in `backend/utils.ts` handles `'gog' | 'legendary' | 'nile'` but not `'zoom'` (present in type but not in function body). Steam should clear its own stores in `SteamUser.logout()` directly. [VERIFIED: codebase — utils.ts lines 370–399]
- **Don't route `/loginweb/steam` through WebView:** The existing `loginweb/:runner` catch-all maps to WebView which uses a webview tag for OAuth flows. Steam's native form needs its own route entry before the catch-all. [VERIFIED: App.tsx router]
- **Don't add steam tile behind `enabled` feature flag:** Zoom is gated behind `experimentalFeatures.zoomPlatform`. Steam is a first-class platform — the Runner tile is always visible. [VERIFIED: CONTEXT.md, Login/index.tsx pattern]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| QR code generation from URL string | Custom canvas/SVG drawing | `react-qr-code` v2 | Handles error correction levels, sizing, accessibility; correct PNG/SVG output |
| Encrypt refresh token at rest | AES implementation, node-keytar | `electron safeStorage` + prefix pattern | Already in project (secureKey.ts); uses OS keychain; no native module |
| Steam CM protocol auth | Custom TCP client | `steam-session` v1.9.4 | Handles SteamGuard, TOTP, QR, machine auth, token rotation |
| Steam persona name lookup | Direct Steam Web API call | `steam-user` v5.3.0 | Returns name from CM connection; works for private profiles; already authenticated |
| Filesystem-backed auth token | Custom file write/read | `electron-store` via `TypeCheckedStoreBackend` | Pattern established; TypeScript-typed; already used by all store managers |

**Key insight:** The temptation to implement any of these from scratch is high because each sounds simple. Each hides significant edge cases (token rotation, TOTP timing windows, OS keychain availability, QR error correction, CM server rotation) that are already handled by the chosen libraries.

---

## Common Pitfalls

### Pitfall 1: Missing `steamConfigStore` from `StoreStructure`

**What goes wrong:** `TypeCheckedStoreBackend('steamConfigStore', ...)` fails TypeScript compilation with `Type '"steamConfigStore"' does not satisfy the constraint 'ValidStoreName'`. This is because `ValidStoreName = keyof StoreStructure` and `'steamConfigStore'` is not a key yet.

**Why it happens:** `src/common/types/electron_store.ts` defines the exact set of allowed store names. Every new store must be registered here.

**How to avoid:** Add `steamConfigStore: { ... }` to `StoreStructure` in the types file BEFORE creating the backend store. Do this in the same step as adding the Runner type.

**Warning signs:** TypeScript error on `new TypeCheckedStoreBackend('steamConfigStore', ...)`.

---

### Pitfall 2: `/loginweb/steam` Silently Renders WebView

**What goes wrong:** The existing `{ path: 'loginweb/:runner', ... WebView }` route captures `/loginweb/steam` if no more specific route is added first. React Router v6 does NOT warn about this — the WebView just renders with `runner === 'steam'`, finds no entry in the `urls` map, and renders with `startUrl = undefined`, showing a blank/broken webview.

**Why it happens:** The router catch-all is designed to handle all runners; the Steam login flow intentionally diverges.

**How to avoid:** Add `{ path: 'loginweb/steam', lazy: ... SteamLogin }` BEFORE the `loginweb/:runner` entry in `App.tsx`. Test by navigating to `/loginweb/steam` in development and confirming the native form renders, not a webview.

**Warning signs:** Login screen navigates to `/loginweb/steam` but shows a blank webview or "Loading Website" spinner instead of the native form.

---

### Pitfall 3: `Runner` Union Missing `'steam'` Causes Runtime Undefined

**What goes wrong:** If `'steam'` is added to `libraryManagerMap` but forgotten in the `Runner` type (or vice versa), the TypeScript `satisfies Record<Runner, LibraryManager>` constraint silently passes or fails in unexpected ways. Worse: if the type is updated but not every switch statement, runtime `default` cases fire for Steam games.

**Why it happens:** `Runner` is defined in two places — the union at line 23 of `common/types.ts` AND `GameInfo.runner` inline union at line 183. Both must be updated.

**How to avoid:** After adding `'steam'` to the `Runner` union, immediately run `npm run codecheck` (TypeScript `--noEmit`). Fix every compile error before proceeding. Check `src/backend/logger/constants.ts` (RunnerToLogPrefixMap) and `src/frontend/types.ts` (`Category` union) which also need updating.

**Warning signs:** `RunnerToLogPrefixMap` TypeScript error; `libraryManagerMap['steam']` returning `undefined` at runtime.

---

### Pitfall 4: SteamGuard Login Loop → IP Ban

**What goes wrong:** Submitting a stale TOTP code (from the previous 30-second window) causes Steam to reject it. If the app retries immediately without waiting for the next time window, Steam's rate limit triggers: error 84 (RateLimitExceeded), which bans the IP for up to 24 hours — including the user's actual Steam client.

**Why it happens:** TOTP codes are time-based. A code used in the previous window is rejected but looks like a user input error to naive retry logic.

**How to avoid:** When `steamGuardRequired` event fires with `lastCodeWrong === true`: disable the Verify button for 30 seconds before re-enabling. Display a countdown or "Please wait before retrying" message. Never auto-retry with the same code. [VERIFIED: PITFALLS.md, steam-user documentation]

**Warning signs:** Steam error 84 in logs; user reports Steam not working after using GamerLib login.

---

### Pitfall 5: steam-user in Renderer Process

**What goes wrong:** Importing `steam-user` in a renderer module (anything under `src/frontend/`) causes it to attempt TCP connections to Steam CM servers from the renderer's Electron sandbox, where outbound connections are blocked. The import itself may also fail because steam-user expects Node.js built-ins not available in the renderer.

**Why it happens:** Developers follow GOG's `gog/library.ts` pattern, which also imports network libraries, not realizing GOG's library manager only runs in the main process through `libraryManagerMap` dispatching.

**How to avoid:** All steam-user and steam-session imports are in `src/backend/`. Renderer communicates via `window.api.*` (IPC). The `window.api` preload bridge never exposes steam-user directly.

**Warning signs:** `Cannot find module 'net'` or `Cannot read properties of undefined` errors in renderer console.

---

### Pitfall 6: Refresh Token Stored in Plaintext

**What goes wrong:** If `safeStorage.isEncryptionAvailable()` returns false (headless Linux without a keyring) and the code falls back to storing the raw token, it's stored in an electron-store JSON file on disk unencrypted. More critically, if the store shape allows storing raw credentials, it may tempt future code to store the password.

**Why it happens:** Simple path: `configStore.set('refreshToken', token)` without prefix/encrypt wrapper.

**How to avoid:** Always use the `encryptToken`/`decryptToken` wrapper (see Pattern 3 above). Log a warning when plaintext fallback is used (same as `secureKey.ts` pattern). Never set a key named `password` or `credentials.password` in the store.

**Warning signs:** Config store JSON file on disk showing a readable JWT string as a value.

---

## Code Examples

### steam-session QR Code Flow

```typescript
// Source: github.com/DoctorMcKay/node-steam-session README [CITED]
// [ASSUMED: exact event names — verify against steam-session 1.9.4 changelog]
import { LoginSession, EAuthTokenPlatformType } from 'steam-session'

const session = new LoginSession(EAuthTokenPlatformType.SteamClient)

session.on('remoteInteraction', () => {
  // QR code scanned by mobile app — waiting for approval
})

const startResult = await session.startWithQR()
// startResult.qrChallengeUrl is the URL to encode as QR

session.on('authenticated', async () => {
  const refreshToken = session.refreshToken  // JWT string
  // store encrypted token
})

session.on('timeout', () => {
  // QR expired — generate a new session
})
```

### steam-session Credentials + SteamGuard Flow

```typescript
// Source: github.com/DoctorMcKay/node-steam-session README [CITED]
// [ASSUMED: exact event shape — verify against steam-session 1.9.4]
const session = new LoginSession(EAuthTokenPlatformType.SteamClient)

await session.startWithCredentials({
  accountName: username,
  password: password
})

session.on('steamGuardRequired', (details) => {
  // details.type: EAuthSessionGuardType.EmailCode | DeviceCode
  // details.emailDomain for email type
  // Emit IPC event to renderer: show step 2 (SteamGuard input)
})

// After user submits code:
await session.submitSteamGuardCode(guardCode)

session.on('authenticated', async () => {
  const refreshToken = session.refreshToken
  // store encrypted token
})
```

### steam-user logOn with Refresh Token

```typescript
// Source: github.com/DoctorMcKay/node-steam-user README [CITED]
// [ASSUMED: exact constructor options — verify against steam-user 5.3.0 docs]
import SteamUserLib from 'steam-user'

const client = new SteamUserLib({ enablePicsCache: false })  // Phase 1: auth only
client.logOn({ refreshToken: decryptedToken })

client.on('loggedOn', () => {
  const username = client.steamID?.getSteamID64() // or persona name after setPersona
  // configStore.set('isLoggedIn', true)
  // configStore.set('userData', { username, steamId })
})

client.on('error', (err) => {
  logError(['steam-user login error:', err], LogPrefix.Steam)
})
```

### react-qr-code Component Usage

```tsx
// Source: github.com/rosskhanas/react-qr-code README [CITED]
import QRCode from 'react-qr-code'

// In SteamLogin/index.tsx QR tab panel:
{challengeUrl && (
  <div style={{ background: '#ffffff', padding: '8px', display: 'inline-block', borderRadius: 'var(--space-3xs)' }}>
    <QRCode
      value={challengeUrl}
      size={200}
      fgColor="#000000"
      bgColor="#ffffff"
      aria-label="Steam QR code for mobile login"
      role="img"
    />
  </div>
)}
```

### Frontend electron-store (Renderer Side)

```typescript
// Source: src/frontend/helpers/electronStores.ts pattern [VERIFIED: codebase]
// Add to src/frontend/helpers/electronStores.ts:
const steamConfigStore = new TypeCheckedStoreFrontend('steamConfigStore', {
  cwd: 'steam_store'
})

// Usage in GlobalState.tsx initial state:
steam: {
  library: [],
  username: steamConfigStore.get_nodefault('userData')?.username
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact for Phase 1 |
|--------------|------------------|--------------|-------------------|
| `loginKey` (deprecated Steam auth) | Refresh token (JWT) | steam-session v1.x | Use refresh token only; `loginKey` never implemented |
| Browser OAuth for all stores | Native CM protocol for Steam | Phase 1 design decision | No WebView for Steam; cleaner than GOG/Epic pattern |
| node-keytar for secure storage | Electron `safeStorage` | Electron 15+ | safeStorage already used in project (secureKey.ts); no new native module |
| Direct binary launch (Legendary/GOG) | `steam://` protocol delegation | Architectural decision | Steam games NEVER direct-launched; Phase 3 uses shell.openExternal |

**Deprecated/outdated:**
- `loginKey` Steam auth: Removed from steam-user v4+. Never implement. [VERIFIED: STACK.md, steam-user changelog]
- Browser-based Steam OpenID for library access: Returns only SteamID64, not usable for library API. [VERIFIED: STACK.md]
- steamworks.js / greenworks: SDK for game developers with AppId requirement. [VERIFIED: STACK.md]

---

## Open Questions

1. **steam-session event model: is session per-request or persistent?**
   - What we know: `LoginSession` is created per auth attempt; `refreshToken` extracted from `session.refreshToken` after `authenticated` event
   - What's unclear: Whether the same `LoginSession` instance can be reused across the QR polling interval and credential retry, or if a new instance is created per attempt
   - Recommendation: Create a new `LoginSession` for each auth attempt; persist only the `refreshToken` JWT. [ASSUMED — verify against steam-session 1.9.4 source]

2. **steam-user persona name availability at `loggedOn` time**
   - What we know: `steam-user` client emits `loggedOn` after authenticating; persona names require a separate call or may require `setPersona()` and waiting for the `user` event
   - What's unclear: Whether `client.users[steamid]?.player_name` is populated immediately after `loggedOn` or requires a subscribe/cache update
   - Recommendation: After `loggedOn`, call `client.getPersonas([client.steamID])` to explicitly fetch persona name. Store result as username. [ASSUMED — verify against steam-user 5.3.0 docs]

3. **`clearCache` type union — add `'steam'`?**
   - What we know: The function signature is `library?: 'gog' | 'legendary' | 'nile' | 'zoom'`. Zoom is listed but no handler body exists for it.
   - What's unclear: Whether Phase 1 should extend this union and add a steam handler, or handle it in `SteamUser.logout()` directly
   - Recommendation: Handle steam library clearing in `SteamUser.logout()` directly (simpler; consistent with Zoom pattern). Extending `clearCache` can happen in Phase 2 when the library store is added.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | steam-user, steam-session | Yes | v26.2.0 (>=22 required) | — |
| npm | Package install | Yes | bundled with Node | — |
| Steam client (on dev machine) | Manual QA of auth flows | Unknown | — | Use real Steam account on machine with Steam installed |
| `electron safeStorage` | Token encryption | Yes (Electron 41.1.1) | built-in | Plaintext fallback with log warning |
| TypeScript >=5 | Compilation | Yes (^5.8.3 in project) | confirmed | — |

**Missing dependencies with no fallback:**
- Steam client on the developer's machine is required for end-to-end manual testing of auth flows (QR scan + credential login). This is not a build dependency but a test dependency.

**Missing dependencies with fallback:**
- `safeStorage` unavailability on headless Linux (no keyring): fallback to plaintext with warning (same as `secureKey.ts` pattern).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 with ts-jest |
| Config file | `src/backend/jest.config.js` (Jest projects entry in root `jest.config.js`) |
| Quick run command | `npm test -- --testPathPattern=steam` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | QR challenge URL is generated and returned from IPC handler | Unit (mock steam-session) | `npm test -- --testPathPattern=steam/user` | ❌ Wave 0 |
| AUTH-02 | Credential login calls steam-session and returns status | Unit (mock steam-session) | `npm test -- --testPathPattern=steam/user` | ❌ Wave 0 |
| AUTH-02 | SteamGuard code submission calls submitSteamGuardCode | Unit (mock steam-session) | `npm test -- --testPathPattern=steam/user` | ❌ Wave 0 |
| AUTH-03 | `SteamUser.isLoggedIn()` returns correct value from configStore | Unit | `npm test -- --testPathPattern=steam/user` | ❌ Wave 0 |
| AUTH-04 | `SteamUser.logout()` clears configStore and disconnects client | Unit (mock steam-user) | `npm test -- --testPathPattern=steam/user` | ❌ Wave 0 |
| AUTH-05 | `isSteamClientInstalled()` returns true/false for correct paths | Unit (mock graceful-fs `existsSync`) | `npm test -- --testPathPattern=steam/user` | ❌ Wave 0 |
| AUTH-05 | Steam client not found triggers warning state in SteamLogin | Manual QA | — | Manual only |
| AUTH-01/02 | Full QR scan + credential login with real Steam | Integration (manual) | — | Manual only |

**Manual QA required items:**
- QR code scan with Steam mobile app (requires real Steam session)
- SteamGuard email code delivery and code entry
- App behavior when Steam client is not installed (UI state check)
- Login persistence across app restart (token loaded from store on startup)

### Sampling Rate

- **Per task commit:** `npm test -- --testPathPattern=steam --passWithNoTests`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green (`npm test`) + manual QA of AUTH-01 and AUTH-02 with real Steam credentials before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/backend/storeManagers/steam/__tests__/user.test.ts` — covers AUTH-01 through AUTH-05
- [ ] Mocks needed: `jest.mock('steam-session')`, `jest.mock('steam-user')`, `jest.mock('electron')` (for `safeStorage`), `jest.mock('graceful-fs')`

*(No existing test infrastructure for store managers; the test pattern is established in `src/backend/__tests__/utils.test.ts`)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | steam-session handles credential validation; refresh token lifecycle per §Pitfall 4 |
| V3 Session Management | Yes | Refresh token (~200 day JWT); decode `exp` field; re-auth prompt when near expiry |
| V4 Access Control | No | Single-user launcher; no multi-user or role-based access |
| V5 Input Validation | Yes | Username/password inputs sanitized before IPC call; SteamGuard code restricted to 5 characters via `maxLength={5}` and `inputMode="numeric"` |
| V6 Cryptography | Yes | `safeStorage` for token at rest — never hand-roll encryption |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Password stored in electron-store | Information Disclosure | Never store password; store only encrypted refresh token |
| TOTP replay in login loop | Spoofing | Check `lastCodeWrong` event; enforce 30s wait before retry |
| steam-user in renderer (sandbox escape attempt) | Elevation of Privilege | Import steam-user only in main process; all renderer access via IPC |
| Malformed IPC payloads (username/password XSS) | Tampering | IPC handlers receive primitives; no HTML rendering of user input in backend |
| Unencrypted token on disk | Information Disclosure | `safeStorage.encryptString()` + prefix wrapper; plaintext fallback logs warning |

---

## Sources

### Primary (HIGH confidence — verified via codebase inspection)

- `src/backend/storeManagers/gog/user.ts` — `GOGUser` static class: login(), getUserDetails(), getCredentials(), isLoggedIn(), logout() signatures
- `src/backend/storeManagers/zoom/user.ts` — `ZoomUser` static class: closest reference for Steam (no CLI binary, token-based auth)
- `src/backend/storeManagers/gog/electronStores.ts` — `TypeCheckedStoreBackend` instantiation pattern
- `src/common/types/electron_store.ts` — `StoreStructure` interface, `ValidStoreName` constraint
- `src/common/types.ts` — `Runner` union (line 23), `GameInfo.runner` (line 183)
- `src/backend/main.ts` — IPC handler registration pattern (lines 817–833)
- `src/backend/logger/constants.ts` — `LogPrefix`, `RunnerToLogPrefixMap`
- `src/backend/utils.ts` — `clearCache()` type union (lines 370–399)
- `src/backend/steamgrid/secureKey.ts` — `safeStorage` encrypt/decrypt pattern
- `src/frontend/App.tsx` — Router configuration, `loginweb/:runner` catch-all (line 160)
- `src/frontend/screens/Login/index.tsx` — Runner component integration pattern
- `src/frontend/screens/Login/components/Runner/index.tsx` — `RunnerProps` interface
- `src/frontend/screens/WebView/index.tsx` — WebView auth callback pattern (confirms Steam must NOT use this)
- `src/frontend/state/GlobalState.tsx` — `zoomLogin`/`zoomLogout` pattern (lines 634–665), `handleSuccessfulLogin` (line 529)
- `src/frontend/state/ContextProvider.tsx` — `initialContext` structure
- `src/frontend/types.ts` — `ContextType` interface, `Category` union
- `src/frontend/helpers/electronStores.ts` — `TypeCheckedStoreFrontend` renderer-side store pattern
- `package.json` — confirmed existing deps (@node-steam/vdf, electron-store, axios, @fortawesome/free-brands-svg-icons, @mui/material)

### Secondary (HIGH confidence — npm registry verification)

- `npm view steam-user` → 5.3.0, DoctorMcKay, github.com/DoctorMcKay/node-steam-user, no postinstall
- `npm view steam-session` → 1.9.4, DoctorMcKay, no postinstall
- `npm view @types/steam-user` → 5.1.1, DefinitelyTyped, no postinstall
- `npm view react-qr-code` → 2.2.0, rosskhanas, github.com/rosskhanas/react-qr-code, no postinstall

### Cited (MEDIUM confidence — official documentation referenced)

- [github.com/DoctorMcKay/node-steam-session](https://github.com/DoctorMcKay/node-steam-session) — QR flow and credential flow API
- [github.com/DoctorMcKay/node-steam-user](https://github.com/DoctorMcKay/node-steam-user) — logOn(), loggedOn event, persona name retrieval
- [github.com/rosskhanas/react-qr-code](https://github.com/rosskhanas/react-qr-code) — QRCode component props
- [Electron safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage) — isEncryptionAvailable(), encryptString(), decryptString()
- `.planning/research/STACK.md` — verified library choice rationale
- `.planning/research/ARCHITECTURE.md` — store manager pattern, build order
- `.planning/research/PITFALLS.md` — critical auth pitfalls
- `.planning/phases/01-steam-authentication/01-CONTEXT.md` — locked decisions D-01 through D-09
- `.planning/phases/01-steam-authentication/01-UI-SPEC.md` — component inventory, interaction states, copywriting contract

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | steam-session `startWithQR()` returns an object with `qrChallengeUrl` property and emits `authenticated` event with `session.refreshToken` available | Standard Stack, Code Examples | Wrong event names or property paths mean QR flow breaks; verify against steam-session 1.9.4 source |
| A2 | steam-session `startWithCredentials()` emits a `steamGuardRequired` event with a `type` property distinguishing email vs TOTP | Code Examples | Wrong event name means SteamGuard step cannot be triggered; verify against steam-session source |
| A3 | steam-user v5 persona name is retrievable via `client.getPersonas([steamID])` call after `loggedOn` | Code Examples §steam-user logOn | If wrong API, username stored as empty string; verify against steam-user 5.3.0 docs/README |
| A4 | `EAuthTokenPlatformType.SteamClient` is the correct platform type for a third-party launcher using steam-session | Code Examples | Wrong platform type could affect token scope; verify against steam-session README |
| A5 | react-qr-code `<QRCode>` component accepts `fgColor`, `bgColor`, and `size` props as documented in UI spec | Code Examples §react-qr-code | Incorrect props cause compile error or wrong rendering; verify against react-qr-code 2.2.0 docs |

**All other claims are verified via direct codebase inspection or npm registry confirmation.**

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all packages npm-verified; codebase confirms existing deps
- Architecture: HIGH — findings from direct source code inspection of all referenced files
- Steam-session/steam-user API details: MEDIUM — based on GitHub README (cited); exact event names tagged [ASSUMED]
- Pitfalls: HIGH — derived from codebase patterns and prior research docs

**Research date:** 2026-06-26
**Valid until:** 2026-07-26 (steam-session/steam-user are actively maintained; API unlikely to change in 30 days)
