# Phase 1: Steam Authentication - Pattern Map

**Mapped:** 2026-06-26
**Files analyzed:** 20 (7 new, 13 modified)
**Analogs found:** 20 / 20

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/common/types/steam.ts` | model | — | `src/common/types/zoom.ts` | exact |
| `src/backend/storeManagers/steam/constants.ts` | config | — | `src/backend/storeManagers/zoom/constants.ts` | exact |
| `src/backend/storeManagers/steam/electronStores.ts` | config | — | `src/backend/storeManagers/zoom/electronStores.ts` | exact |
| `src/backend/storeManagers/steam/user.ts` | service | request-response | `src/backend/storeManagers/zoom/user.ts` | role-match |
| `src/backend/storeManagers/steam/__tests__/user.test.ts` | test | — | `src/backend/__tests__/utils.test.ts` | partial |
| `src/frontend/screens/Login/components/SteamLogin/index.tsx` | component | request-response | `src/frontend/screens/Login/components/SIDLogin/index.tsx` | role-match |
| `src/frontend/screens/Login/components/SteamLogin/index.scss` | config | — | `src/frontend/screens/Login/components/SIDLogin/index.css` | exact |
| `src/common/types/electron_store.ts` *(modify)* | model | — | itself (zoom block at lines 79–85) | exact |
| `src/common/types.ts` *(modify)* | model | — | itself (Runner union at line 23) | exact |
| `src/common/types/ipc.ts` *(modify)* | model | — | itself (zoom entries at lines 126, 197, 211) | exact |
| `src/backend/logger/constants.ts` *(modify)* | config | — | itself (Zoom entries at lines 8, 36) | exact |
| `src/backend/storeManagers/index.ts` *(modify)* | config | — | itself (zoom entry at lines 5, 18) | exact |
| `src/backend/main.ts` *(modify)* | middleware | request-response | itself (zoom IPC block at lines 825–834) | exact |
| `src/frontend/App.tsx` *(modify)* | config | — | itself (loginweb/:runner at line 160) | exact |
| `src/frontend/screens/Login/index.tsx` *(modify)* | component | — | itself (zoom Runner block at lines 44, 75, 152–163) | exact |
| `src/frontend/state/GlobalState.tsx` *(modify)* | store | event-driven | itself (zoomLogin/zoomLogout at lines 634–665) | exact |
| `src/frontend/state/ContextProvider.tsx` *(modify)* | store | — | itself (zoom block at lines 28–33) | exact |
| `src/frontend/types.ts` *(modify)* | model | — | itself (zoom at lines 26, 91–97) | exact |
| `src/frontend/helpers/electronStores.ts` *(modify)* | config | — | itself (zoomConfigStore at lines 152–154) | exact |
| `package.json` *(modify)* | config | — | itself (existing dep block) | exact |

---

## Pattern Assignments

### `src/common/types/steam.ts` (model, new)

**Analog:** `src/common/types/zoom.ts`

**Full file to copy and adapt** (`src/common/types/zoom.ts`, lines 1–9):
```typescript
import { LaunchOption } from 'common/types'
// zoom.ts starts with types relevant to that platform.
// steam.ts needs only auth-related types for Phase 1:

export interface SteamCredentials {
  refreshToken: string   // encrypted via safeStorage; decrypted before use
}

export interface SteamUserData {
  username: string       // persona name from steam-user after loggedOn
  steamId?: string       // SteamID64 — optional, used for display
}
```

**No LaunchOption or install types needed in Phase 1** — those are Phase 2 (library). Keep the file minimal.

---

### `src/backend/storeManagers/steam/constants.ts` (config, new)

**Analog:** `src/backend/storeManagers/zoom/constants.ts` (lines 1–7)

```typescript
import { join } from 'path'
import { app } from 'electron'

const zoomSupportPath = join(app.getPath('userData'), 'zoom_store')
export const embedUrl = 'https://www.zoom-platform.com'
export const apiUrl = 'https://www.zoom-platform.com'
export const tokenPath = join(zoomSupportPath, '.zoom.token')
```

**Steam adaptation** — replace URL constants with install detection paths:
```typescript
import { app } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { platform } from 'process'

export const steamSupportPath = join(app.getPath('userData'), 'steam_store')

export const STEAM_INSTALL_PATHS: Record<string, string[]> = {
  linux: ['/usr/bin/steam', join(homedir(), '.steam', 'steam')],
  darwin: ['/Applications/Steam.app'],
  win32: ['C:\\Program Files (x86)\\Steam\\Steam.exe']
}

export const STEAM_DOWNLOAD_URL = 'https://store.steampowered.com/about/'

export const TOKEN_STORE_KEY = 'refreshToken'
export const TOKEN_PREFIX = 'steam:v1:'
```

---

### `src/backend/storeManagers/steam/electronStores.ts` (config, new)

**Analog:** `src/backend/storeManagers/zoom/electronStores.ts` (lines 1–22)

```typescript
import { TypeCheckedStoreBackend } from '../../electron_store'
import CacheStore from '../../cache'
import { GameInfo } from 'common/types'
import { ZoomInstallInfo } from 'common/types/zoom'

const installedGamesStore = new TypeCheckedStoreBackend(
  'zoomInstalledGamesStore',
  {
    cwd: 'zoom_store',
    name: 'installed'
  }
)

const configStore = new TypeCheckedStoreBackend('zoomConfigStore', {
  cwd: 'zoom_store'
})

const libraryStore = new CacheStore<GameInfo[], 'games'>('zoom_library', null)
const installInfoStore = new CacheStore<ZoomInstallInfo>('zoom_install_info')

export { configStore, installedGamesStore, libraryStore, installInfoStore }
```

**Steam Phase 1 adaptation** — auth only, no library stores yet:
```typescript
import { TypeCheckedStoreBackend } from '../../electron_store'

const configStore = new TypeCheckedStoreBackend('steamConfigStore', {
  cwd: 'steam_store'
})

export { configStore }
```

**Critical prerequisite:** `steamConfigStore` must be added to `StoreStructure` in `src/common/types/electron_store.ts` BEFORE this file compiles. See modification pattern below.

---

### `src/backend/storeManagers/steam/user.ts` (service, request-response)

**Analog:** `src/backend/storeManagers/zoom/user.ts`

**Imports pattern** (zoom/user.ts lines 1–13):
```typescript
import axios, { AxiosError } from 'axios'
import {
  existsSync,
  unlinkSync,
  writeFileSync,
  readFileSync
} from 'graceful-fs'
import { logError, logInfo, LogPrefix, logWarning } from 'backend/logger'
import { configStore } from './electronStores'
import { isOnline } from '../../online_monitor'
import { ZoomCredentials } from 'common/types/zoom'
import { clearCache } from 'backend/utils'
import { tokenPath, embedUrl, apiUrl } from './constants'
```

**Steam adaptation imports:**
```typescript
import { safeStorage } from 'electron'
import { existsSync } from 'graceful-fs'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { configStore } from './electronStores'
import { STEAM_INSTALL_PATHS, TOKEN_PREFIX } from './constants'
import { platform } from 'process'
import type { SteamUserData } from 'common/types/steam'
// steam-session and steam-user imported at the call sites (not top-level)
// to allow jest.mock() to intercept them in tests
```

**Static class pattern** (zoom/user.ts lines 15–37):
```typescript
export class ZoomUser {
  static async login(url: string): Promise<{
    status: 'done' | 'error'
  }> {
    logInfo('Logging in using Zoom credentials', LogPrefix.Zoom)
    // ...
    configStore.set('isLoggedIn', true)
    return { status: 'done' }
  }

  public static async getUserDetails() { ... }
  public static async getCredentials(): Promise<ZoomCredentials | undefined> { ... }
  public static logout() {
    clearCache('zoom')
    configStore.clear()
    logInfo('Logging user out from Zoom', LogPrefix.Zoom)
  }
  public static async isLoggedIn(): Promise<boolean> {
    return configStore.get('isLoggedIn', false)
  }
}
```

**Steam adaptation** — key differences from Zoom:
- `login()` takes `{ username, password }` or triggers QR flow (separate methods per flow)
- Token stored encrypted via `safeStorage` rather than written to a file
- `isLoggedIn()` is synchronous (`Boolean(configStore.get_nodefault('isLoggedIn'))`) — no network check
- `logout()` calls `configStore.clear()` directly (not `clearCache('steam')`)

**safeStorage encrypt/decrypt pattern** — copy verbatim from `src/backend/steamgrid/secureKey.ts` (lines 1–48):
```typescript
import { safeStorage } from 'electron'
import { logWarning, LogPrefix } from 'backend/logger'

const CIPHERTEXT_PREFIX = 'sgdb:v1:'   // → use 'steam:v1:' for Steam

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function encryptApiKey(plain: string): string {
  if (!plain) return ''
  if (!encryptionAvailable()) {
    logWarning(
      'safeStorage unavailable, storing SteamGridDB API key in plaintext',
      LogPrefix.Backend
    )
    return plain
  }
  const ciphertext = safeStorage.encryptString(plain).toString('base64')
  return `${CIPHERTEXT_PREFIX}${ciphertext}`
}

export function decryptApiKey(stored: string): string {
  if (!stored) return ''
  if (!isEncryptedValue(stored)) {
    return stored  // legacy plaintext fallback
  }
  if (!encryptionAvailable()) return ''
  try {
    const buf = Buffer.from(stored.slice(CIPHERTEXT_PREFIX.length), 'base64')
    return safeStorage.decryptString(buf)
  } catch (error) {
    logWarning(['Failed to decrypt SteamGridDB API key:', error], LogPrefix.Backend)
    return ''
  }
}
```

**Steam client detection pattern** (adapted from RESEARCH.md Pattern 7):
```typescript
export function isSteamClientInstalled(): boolean {
  const paths = STEAM_INSTALL_PATHS[platform] ?? []
  return paths.some((p) => existsSync(p))
}
```

---

### `src/backend/storeManagers/steam/__tests__/user.test.ts` (test, new)

**Analog:** `src/backend/__tests__/utils.test.ts` (lines 1–10)

**Jest mock setup pattern:**
```typescript
import { app } from 'electron'
import { logError } from '../logger'
import * as utils from '../utils'

jest.mock('electron')
jest.mock('../logger')
jest.mock('../dialog/dialog')
```

**Steam test mock setup:**
```typescript
jest.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: jest.fn(() => true),
    encryptString: jest.fn((s: string) => Buffer.from(s)),
    decryptString: jest.fn((b: Buffer) => b.toString())
  },
  app: { getPath: jest.fn(() => '/tmp/test') }
}))
jest.mock('steam-session')
jest.mock('steam-user')
jest.mock('graceful-fs', () => ({ existsSync: jest.fn() }))
jest.mock('backend/logger')

describe('SteamUser', () => {
  beforeEach(() => jest.clearAllMocks())

  test('isLoggedIn() returns false when store has no value', () => { ... })
  test('logout() clears configStore', () => { ... })
  test('isSteamClientInstalled() checks correct path for platform', () => { ... })
  // ... AUTH-01 through AUTH-05 coverage
})
```

**Note:** No store manager `__tests__` directory exists yet. Create `src/backend/storeManagers/steam/__tests__/` alongside `user.ts`.

---

### `src/frontend/screens/Login/components/SteamLogin/index.tsx` (component, request-response)

**Primary analog:** `src/frontend/screens/Login/components/SIDLogin/index.tsx`
**Secondary analog (tabs):** `src/frontend/screens/WineManager/index.tsx` (lines 8, 96–103, 220–239)

**Imports pattern** (SIDLogin/index.tsx lines 1–11):
```typescript
import { useContext, useState } from 'react'
import Info from '@mui/icons-material/Info'
import { Button, Paper, Stack, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import './index.css'
import ContextProvider from 'frontend/state/ContextProvider'
```

**Steam adaptation imports:**
```typescript
import { useState, useEffect } from 'react'
import { Tab, Tabs } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSyncAlt, faTriangleExclamation, faCircleExclamation, faCheckCircle } from '@fortawesome/free-solid-svg-icons'
import { useNavigate } from 'react-router-dom'
import QRCode from 'react-qr-code'
import TabPanel from 'frontend/components/UI/TabPanel'
import './index.scss'
```

**State shape pattern** (SIDLogin/index.tsx lines 21–26):
```typescript
const [input, setInput] = useState('')
const [status, setStatus] = useState({
  loading: false,
  error: false
})
```

**Steam multi-step state shape:**
```typescript
type Step = 'checking' | 'not-installed' | 'tab' | 'qr-generating' |
            'qr-active' | 'qr-confirmed' | 'credentials-1' | 'credentials-2'
const [step, setStep] = useState<Step>('checking')
const [challengeUrl, setChallengeUrl] = useState<string | null>(null)
const [username, setUsername] = useState('')
const [password, setPassword] = useState('')
const [guardCode, setGuardCode] = useState('')
const [error, setError] = useState<string | null>(null)
const [loading, setLoading] = useState(false)
const [activeTab, setActiveTab] = useState<'qr' | 'credentials'>('qr')
```

**Loading + error button pattern** (SIDLogin/index.tsx lines 59–67, 147–153):
```typescript
function getButtonLabel() {
  if (loading) {
    return t('button.loading', 'Loading')
  } else if (error) {
    return t('button.error', 'Error, try a different Code')
  } else {
    return t('button.login', 'Login')
  }
}
// ...
<button
  onClick={async () => handleLogin(input)}
  className="button is-primary"
  disabled={loading || input.length < 30 || error}
>
  {getButtonLabel()}
</button>
```

**MUI Tabs pattern** (WineManager/index.tsx lines 8, 96–103, 222–239):
```typescript
import { Tab, Tabs } from '@mui/material'

const handleChangeTab = (
  _e: React.SyntheticEvent,
  repo: WineManagerUISettings
) => {
  setRepository(repo)
  // ...
}

// In JSX:
<div className="tabsWrapper">
  <Tabs
    className="tabs"
    value={repository.value}
    onChange={(e, value) => { ... }}
    variant="scrollable"
    scrollButtons="auto"
  >
    {repositories.map(({ type, value }) => (
      <Tab value={value} label={type} key={value} />
    ))}
  </Tabs>
</div>
```

**Steam tab adaption:**
```tsx
<Tabs
  value={activeTab}
  onChange={(_e, val) => setActiveTab(val)}
>
  <Tab value="qr" label="QR Code" id="tab-qr" aria-controls="tabpanel-qr" />
  <Tab value="credentials" label="Username & Password" id="tab-credentials" aria-controls="tabpanel-credentials" />
</Tabs>
<TabPanel value={activeTab} index="qr">
  {/* QR content */}
</TabPanel>
<TabPanel value={activeTab} index="credentials">
  {/* Credentials content */}
</TabPanel>
```

**TabPanel component** (`src/frontend/components/UI/TabPanel/index.tsx`, lines 1–24):
```typescript
type TabPanelProps = HTMLProps<HTMLDivElement> & {
  children?: React.ReactNode
  index: string
  value: string
}
// Renders children only when value === index
// Sets role="tabpanel", id="tabpanel-{index}", aria-labelledby="tab-{index}"
```

**Input pattern** (SIDLogin/index.tsx lines 132–142):
```tsx
<input
  type="text"
  className="sid-input"
  value={input}
  onChange={(e) => setInput(e.target.value)}
/>
```

**Steam SteamGuard input adaptation:**
```tsx
<input
  type="text"
  className="sid-input"
  inputMode="numeric"
  maxLength={5}
  value={guardCode}
  aria-label="Steam Guard code"
  aria-describedby="steamguard-instructions"
  onChange={(e) => setGuardCode(e.target.value)}
/>
```

**QR code component usage** (from RESEARCH.md Code Examples):
```tsx
<div style={{
  background: '#ffffff',
  padding: '8px',
  display: 'inline-block',
  borderRadius: 'var(--space-3xs)'
}}>
  <QRCode
    value={challengeUrl}
    size={200}
    fgColor="#000000"
    bgColor="#ffffff"
    aria-label="Steam QR code for mobile login"
    role="img"
  />
</div>
```

**Auth callback pattern** (SIDLogin/index.tsx lines 35–57):
```typescript
const handleLogin = async (sid: string) => {
  window.api.logInfo('Called Epic Login')
  setStatus({ loading: true, error: false })
  await epic.login(sid).then(async (res) => {
    if (res === 'done') {
      await window.api.getUserInfo()
      setStatus({ loading: false, error: false })
      backdropClick()
    } else {
      setStatus({ loading: false, error: true })
      setTimeout(() => {
        setStatus({ loading: false, error: false })
      }, 2500)
    }
  })
}
```

**Steam adaptation** — on success navigate to `/login` (no backdropClick; it's a full-screen route):
```typescript
const navigate = useNavigate()

const handleSuccess = (username: string) => {
  // Call GlobalState.steamLogin via context
  await steam.login({ status: 'done', username })
  navigate('/login')
}
```

---

### `src/frontend/screens/Login/components/SteamLogin/index.scss` (config, new)

**Analog:** `src/frontend/screens/Login/components/SIDLogin/index.css` (lines 1–112)

**Input styling to copy verbatim** (lines 93–104):
```css
.sid-modal > .sid-input {
  color: var(--text-secondary);
  font-size: var(--text-md);
  padding: var(--space-2xs);
  background-color: var(--input-background);
  border: none;
  height: 40px;
  width: 60%;
  border-radius: var(--space-3xs);
  margin-bottom: var(--space-md);
  box-shadow: 0px 4px 4px rgb(0 0 0 / 25%);
  font-family: var(--primary-font-family);
}
```

**Login page wrapper** (`src/frontend/screens/Login/index.scss` lines 21–47):
```css
.loginContentWrapper {
  width: min(500px, 95%);
  /* ... */
  background-color: var(--body-background);
  padding: var(--wrapper-padding);
  border-radius: 10px;
}
```

**Steam screen uses same outer wrapper but with `min(480px, 95%)` width** per UI spec. Add:
```scss
.steamLoginPanel {
  width: min(480px, 95%);
  padding: var(--space-lg);
  background: var(--body-background);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.steamNotFound {
  border: 2px solid var(--status-warning);
  border-radius: var(--space-3xs);
  padding: var(--space-lg);
}

.steamError {
  color: var(--danger);
  font-size: var(--text-sm);
  margin-top: var(--space-xs);
}

.steamQrContainer {
  display: flex;
  justify-content: center;
  padding: var(--space-md) 0;
}
```

---

## Shared Patterns (Apply to Multiple Files)

### safeStorage Encrypt/Decrypt
**Source:** `src/backend/steamgrid/secureKey.ts` (lines 1–48)
**Apply to:** `src/backend/storeManagers/steam/user.ts`

Copy the three-function pattern (`encryptionAvailable`, `encryptApiKey`, `decryptApiKey`) and rename for Steam context:
- Change `CIPHERTEXT_PREFIX = 'sgdb:v1:'` → `'steam:v1:'`
- Change `LogPrefix.Backend` → `LogPrefix.Steam` in warning messages
- Expose as `encryptToken(plain: string): string` and `decryptToken(stored: string): string`

### LogPrefix Pattern
**Source:** `src/backend/logger/constants.ts` (lines 3–37)
**Apply to:** `src/backend/logger/constants.ts` (modify), all new backend files

Add to `LogPrefix` object (line 8, after `Zoom: 'Zoom'`):
```typescript
Steam: 'Steam',
```

Add to `RunnerToLogPrefixMap` (line 36, after `zoom: LogPrefix.Zoom`):
```typescript
steam: LogPrefix.Steam
```

All new steam backend files use `LogPrefix.Steam` as the second argument to `logInfo`, `logError`, `logWarning`.

### IPC Handler Registration
**Source:** `src/backend/main.ts` (lines 825–834)
**Apply to:** `src/backend/main.ts` (modify)

Exact pattern to follow — the zoom block:
```typescript
addHandler('authZoom', async (event, url) => {
  const login = await ZoomUser.login(url)
  if (login.status === 'done') {
    await ZoomUser.getUserDetails()
  }
  return login
})

addListener('logoutZoom', () => ZoomUser.logout())
addHandler('getZoomUserInfo', async () => ZoomUser.getUserDetails())
```

Add Steam block immediately after line 834 (after `getZoomUserInfo` handler):
```typescript
addHandler('steamStartQR', async () => SteamUser.startQRLogin())
addHandler('steamPollQR', async () => SteamUser.pollQRLogin())
addHandler('steamStartCredentials', async (event, { username, password }) =>
  SteamUser.startCredentialLogin(username, password)
)
addHandler('steamSubmitGuard', async (event, code) =>
  SteamUser.submitSteamGuardCode(code)
)
addHandler('getSteamUserInfo', async () => SteamUser.getUserDetails())
addHandler('checkSteamInstalled', async () => SteamUser.isSteamClientInstalled())
addListener('logoutSteam', () => SteamUser.logout())
```

### GlobalState Login/Logout Pattern
**Source:** `src/frontend/state/GlobalState.tsx` (lines 634–665)
**Apply to:** `src/frontend/state/GlobalState.tsx` (modify)

Copy `zoomLogin`/`zoomLogout` verbatim and adapt:
```typescript
zoomLogin = async (url: string) => {
  console.log('logging zoom')
  const response = await window.api.authZoom(url)

  if (response.status === 'done') {
    const userInfo = await window.api.getZoomUserInfo()
    this.setState({
      zoom: {
        library: [],
        username: userInfo?.username,
        enabled: true
      }
    })
    this.handleSuccessfulLogin('zoom')
  }
  return response.status
}

zoomLogout = async () => {
  window.api.logoutZoom()
  this.setState({
    zoom: {
      library: [],
      username: null,
      enabled: true
    }
  })
  console.log('Logging out from zoom')
  window.location.reload()
}
```

**Steam adaptation:**
- `steamLogin` receives `{ status, username }` directly (no separate `getSteamUserInfo` call needed — username returned from auth flow)
- Steam state shape has no `enabled` flag (Steam is always first-class)
- `handleSuccessfulLogin('steam')` triggers library refresh for the `'steam'` runner

---

## Modification Patterns (Existing Files)

### `src/common/types/electron_store.ts` — Add steamConfigStore

**Where to insert:** After `zoomConfigStore` block (lines 79–85):
```typescript
  zoomConfigStore: {
    credentials?: ZoomCredentials
    isLoggedIn: boolean
    username?: string
  }
```

**Add immediately after:**
```typescript
  steamConfigStore: {
    isLoggedIn: boolean
    refreshToken?: string   // safeStorage-encrypted base64 string with 'steam:v1:' prefix
    userData?: SteamUserData
  }
```

**Also add import** at top of file (after line 21 `import { ZoomCredentials } from './zoom'`):
```typescript
import { SteamUserData } from './steam'
```

### `src/common/types.ts` — Add 'steam' to Runner

**Where to edit:** Line 23:
```typescript
export type Runner = 'legendary' | 'gog' | 'sideload' | 'nile' | 'zoom'
```
**Change to:**
```typescript
export type Runner = 'legendary' | 'gog' | 'sideload' | 'nile' | 'zoom' | 'steam'
```

**Also update `GameInfo.runner`** — the research notes it appears at line 183 as an inline union. Run `grep -n "runner:" src/common/types.ts` to confirm the exact line and add `| 'steam'` there too.

### `src/common/types/ipc.ts` — Add Steam IPC types

**Pattern source:** Zoom entries at lines 126, 197, 211:
```typescript
// SyncIPCFunctions (line 126):
logoutZoom: () => void

// AsyncIPCFunctions (line 197):
getZoomUserInfo: () => Promise<{ username: string } | undefined>

// AsyncIPCFunctions (line 211):
authZoom: (url: string) => Promise<{ status: 'done' | 'error' }>
```

**Add to SyncIPCFunctions** (after `logoutZoom`):
```typescript
logoutSteam: () => void
```

**Add to AsyncIPCFunctions** (after `authZoom`):
```typescript
steamStartQR: () => Promise<{ status: 'done' | 'error'; challengeUrl?: string }>
steamPollQR: () => Promise<{ status: 'done' | 'waiting' | 'error'; username?: string }>
steamStartCredentials: (credentials: { username: string; password: string }) =>
  Promise<{ status: 'done' | 'guard_required' | 'error' }>
steamSubmitGuard: (code: string) => Promise<{ status: 'done' | 'error' }>
getSteamUserInfo: () => Promise<SteamUserData | undefined>
checkSteamInstalled: () => Promise<boolean>
```

**Add import** at top of `ipc.ts` (after the zoom import if one exists):
```typescript
import type { SteamUserData } from './steam'
```

### `src/backend/logger/constants.ts` — Add LogPrefix.Steam

**Where to edit:** Lines 3–24 (LogPrefix object) and lines 31–37 (RunnerToLogPrefixMap):
```typescript
const LogPrefix = {
  // ... existing entries ...
  Zoom: 'Zoom',           // line 8 — add Steam after this
  Steam: 'Steam',         // NEW
  // ... rest ...
}

const RunnerToLogPrefixMap: Record<Runner, LogPrefix> = {
  legendary: LogPrefix.Legendary,
  gog: LogPrefix.Gog,
  nile: LogPrefix.Nile,
  sideload: LogPrefix.Sideload,
  zoom: LogPrefix.Zoom,
  steam: LogPrefix.Steam  // NEW
}
```

**Note:** `MaxLogPrefixLength` is computed automatically via `Math.max(...Object.values(LogPrefix).map(...))` — no manual update needed.

### `src/backend/storeManagers/index.ts` — Register Steam

**Where to edit:** Lines 1–19 (import block and `libraryManagerMap`):
```typescript
import ZoomLibraryManager from 'backend/storeManagers/zoom/library'
// Add after:
import SteamLibraryManager from 'backend/storeManagers/steam/library'   // Phase 2 stub

export const libraryManagerMap = {
  sideload: new SideloadLibraryManager(),
  gog: new GOGLibraryManager(),
  legendary: new LegendaryLibraryManager(),
  nile: new NileLibraryManager(),
  zoom: new ZoomLibraryManager()
} satisfies Record<Runner, LibraryManager>
```

**Steam Phase 1 note:** The `satisfies Record<Runner, LibraryManager>` constraint requires a `steam` entry the moment `'steam'` is added to the `Runner` union. A Phase 1 stub class that implements the `LibraryManager` interface with no-op methods is sufficient. Alternatively, add the stub inline. The planner must address this — it is a compile-time gate.

### `src/frontend/App.tsx` — Add /loginweb/steam Route

**Where to insert:** BEFORE line 160 (the existing `loginweb/:runner` catch-all):
```typescript
// BEFORE this existing entry (line 160):
{
  path: 'loginweb/:runner',
  lazy: makeLazyFunc(import('./screens/WebView'))
},

// INSERT before it:
{
  path: 'loginweb/steam',
  lazy: makeLazyFunc(import('./screens/Login/components/SteamLogin'))
},
```

**Critical:** More-specific route must appear first. React Router v6 matches by position for routes at the same depth; the param-based route `loginweb/:runner` will match `loginweb/steam` if listed first.

### `src/frontend/screens/Login/index.tsx` — Add Steam Runner

**Where to edit:** Three locations:

1. **Exports block** (lines 20–23) — add `steamLoginPath`:
```typescript
export const epicLoginPath = '/loginweb/legendary'
export const gogLoginPath = '/loginweb/gog'
export const amazonLoginPath = '/loginweb/nile'
export const zoomLoginPath = '/loginweb/zoom'
export const steamLoginPath = '/loginweb/steam'   // ADD
```

2. **State initialization** (lines 39–44) — add `isSteamLoggedIn`:
```typescript
const [isZoomLoggedIn, setIsZoomLoggedIn] = useState(Boolean(zoom.username))
const [isSteamLoggedIn, setIsSteamLoggedIn] = useState(Boolean(steam?.username))  // ADD
```

3. **useEffect** (line 75–76) — extend dependencies and setter:
```typescript
// Existing:
setIsZoomLoggedIn(Boolean(zoom.username))
// Add:
setIsSteamLoggedIn(Boolean(steam?.username))
```
And extend the dependency array: `[..., steam?.username, t]`

4. **runnerGroup div** (after lines 152–163 zoom Runner block) — add Steam Runner:
```tsx
<Runner
  class="steam"
  buttonText={t('login.steam', 'Steam Login')}
  icon={() => <FontAwesomeIcon icon={faSteam} />}
  loginUrl={steamLoginPath}
  isLoggedIn={isSteamLoggedIn}
  user={steam?.username}
  logoutAction={steam?.logout ?? (() => Promise.resolve())}
  disabled={oldMac}
/>
```

**Note:** Steam Runner is NOT wrapped in `{zoom.enabled && ...}` guard — it always renders per CONTEXT.md D-08.

**Add imports:**
```typescript
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSteam } from '@fortawesome/free-brands-svg-icons'
```

### `src/frontend/state/GlobalState.tsx` — Add Steam State

**StateProps interface** (lines 58–116) — add steam shape alongside zoom:
```typescript
zoom: {
  library: GameInfo[]
  username?: string
  enabled: boolean
}
// Add:
steam: {
  library: GameInfo[]
  username?: string | null
}
```

**Initial state** (lines 195–213) — add steam alongside zoom:
```typescript
zoom: {
  library: this.loadZoomLibrary(),
  username: zoomConfigStore.get_nodefault('username'),
  enabled: !!globalSettings?.experimentalFeatures?.zoomPlatform
},
// Add:
steam: {
  library: [],  // Phase 1: no library sync
  username: steamConfigStore.get_nodefault('userData')?.username
},
```

**Add import** at top (lines 27–40) alongside other config stores:
```typescript
import {
  // ...existing imports...
  zoomConfigStore,
  steamConfigStore   // ADD
} from '../helpers/electronStores'
```

### `src/frontend/state/ContextProvider.tsx` — Add steam to initialContext

**Where to edit:** Lines 28–33 (zoom block):
```typescript
zoom: {
  library: [],
  login: async () => Promise.resolve(''),
  logout: async () => Promise.resolve(),
  enabled: false
},
```

**Add after:**
```typescript
steam: {
  library: [],
  login: async () => Promise.resolve(''),
  logout: async () => Promise.resolve()
},
```

### `src/frontend/types.ts` — Add steam to ContextType and Category

**Category union** (lines 21–27):
```typescript
export type Category =
  | 'all'
  | 'legendary'
  | 'gog'
  | 'sideload'
  | 'nile'
  | 'zoom'
  | 'steam'   // ADD
```

**ContextType interface** (after zoom block at lines 91–97):
```typescript
zoom: {
  library: GameInfo[]
  username?: string
  login: (url: string) => Promise<string>
  logout: () => Promise<void>
  enabled: boolean
}
// Add:
steam: {
  library: GameInfo[]
  username?: string | null
  login: (result: { status: string; username?: string }) => Promise<string>
  logout: () => Promise<void>
}
```

### `src/frontend/helpers/electronStores.ts` — Add steamConfigStore

**Pattern:** Copy zoom block (lines 152–154):
```typescript
const zoomConfigStore = new TypeCheckedStoreFrontend('zoomConfigStore', {
  cwd: 'zoom_store'
})
```

**Add after:**
```typescript
const steamConfigStore = new TypeCheckedStoreFrontend('steamConfigStore', {
  cwd: 'steam_store'
})
```

**Add to exports** (lines 184–200):
```typescript
export {
  // ...existing...
  zoomConfigStore,
  steamConfigStore   // ADD
}
```

### `package.json` — Add Dependencies

**Where to edit:** `dependencies` block (add alongside existing runtime deps):
```json
"steam-user": "5.3.0",
"react-qr-code": "2.2.0"
```

**Where to edit:** `devDependencies` block:
```json
"@types/steam-user": "5.1.1"
```

`steam-session` installs automatically as a transitive dependency of `steam-user` — no explicit entry needed.

---

## No Analog Found

All files have analogs. However, two items require external library documentation rather than codebase examples:

| File / Pattern | Aspect | Reason | Resolution |
|----------------|---------|--------|-----------|
| `src/backend/storeManagers/steam/user.ts` | `steam-session` API (`startWithQR`, `startWithCredentials`, `steamGuardRequired` event shape) | No steam-session usage exists in codebase | Use RESEARCH.md Code Examples §steam-session QR and Credentials flows; tag as [ASSUMED] pending verification |
| `src/backend/storeManagers/steam/user.ts` | `steam-user` persona name API (`getPersonas` call after `loggedOn`) | No steam-user usage exists in codebase | Use RESEARCH.md Code Examples §steam-user logOn; tag as [ASSUMED] |
| `src/frontend/screens/Login/components/SteamLogin/index.tsx` | `react-qr-code` component props | No existing QR library in project | Use RESEARCH.md Code Examples §react-qr-code (props: `value`, `size`, `fgColor`, `bgColor`) |

---

## Analog Search Scope

**Directories searched:** `src/backend/storeManagers/`, `src/frontend/screens/Login/`, `src/frontend/state/`, `src/frontend/helpers/`, `src/common/types/`, `src/backend/logger/`, `src/backend/steamgrid/`, `src/backend/main.ts`, `src/frontend/App.tsx`, `src/frontend/types.ts`, `src/frontend/components/UI/TabPanel/`, `src/frontend/screens/WineManager/`

**Files scanned:** 22 source files read, 5 grep searches

**Pattern extraction date:** 2026-06-26
