# Phase 26: Steam Key Redemption - Pattern Map

**Mapped:** 2026-07-20
**Files analyzed:** 9
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/backend/storeManagers/steam/user.ts` (add `redeemKey` static method + `classifyPurchaseResult` classifier) | service (static-class backend action) | request-response | `SteamUser.submitSteamGuardCode` (same file, :563-603) | exact |
| `src/preload/api/steam.ts` (add `redeemSteamKey` export) | route (IPC preload bridge) | request-response | `steamSubmitGuard` export (same file, :7) | exact |
| `src/backend/main.ts` (add `addHandler('redeemSteamKey', ...)`) | route (IPC handler registration) | request-response | `addHandler('steamSubmitGuard', ...)` (:926-928) | exact |
| `src/common/types/ipc.ts` (add `redeemSteamKey` to `AsyncIPCFunctions`) | config (shared IPC type contract) | request-response | `steamSubmitGuard` entry (:253) | exact |
| `src/common/types/steam.ts` (optional: add `RedeemKeyOutcome`/`RedeemKeyRequest` types) | config (shared type) | transform | `SteamUserData` interface (:7-10) | exact |
| Client-side format validator (pure function, e.g. `src/frontend/helpers/steamKeyValidation.ts` or colocated in the dialog) | utility | transform | No direct analog in codebase — new pure-function pattern (see Research Pattern 4) | no-analog |
| `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx` (add gated nav item under Settings) | component (nav item, conditional render) | request-response | `humble?.isLoggedIn` gated `<SidebarItem>` block (same file, :192-199) | exact |
| `src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx` (new modal) | component (Dialog-based modal) | request-response | `src/frontend/components/UI/ExternalLinkDialog/index.tsx` (full file) | exact |
| `src/frontend/state/ContextProvider.tsx` + `src/frontend/state/GlobalState.tsx` + `src/frontend/types.ts` (add `showRedeemKeyDialog`/`handleRedeemKeyDialog` toggle) | provider (context state toggle) | event-driven | `externalLinkDialogOptions`/`handleExternalLinkDialog` (ContextProvider.tsx :104-105, GlobalState.tsx :562-564, types.ts :164-167) | exact |
| `src/frontend/App.tsx` (mount `<RedeemSteamKeyDialog />`) | component (always-mounted dialog root) | event-driven | `<ExternalLinkDialog />` mount (:103) | exact |
| `src/backend/storeManagers/steam/__tests__/user.test.ts` (add `describe('redeemKey()', ...)`) | test | request-response | Existing `describe('submitSteamGuardCode()', ...)` block (:664) + `jest.mock('steam-user', ...)` setup (:89-108, :154-171) | exact |

## Pattern Assignments

### `src/backend/storeManagers/steam/user.ts` — add `redeemKey()` static method (service, request-response)

**Analog:** `SteamUser.submitSteamGuardCode` in the same file (:563-603), plus `ensureConnected()`/`getClient()`/`isLoggedIn()` seams already in the class.

**Imports pattern** (file top, lines 1-9 — already present, no new imports needed beyond what's already imported):
```typescript
import { safeStorage } from 'electron'
import { existsSync } from 'graceful-fs'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { configStore } from './electronStores'
import { STEAM_INSTALL_PATHS, TOKEN_PREFIX, TOKEN_STORE_KEY } from './constants'
import { platform } from 'process'
import type { SteamUserData } from 'common/types/steam'
import { LoginSession, EAuthTokenPlatformType } from 'steam-session'
import SteamUserLib from 'steam-user'
```

**Connection-gating pattern to copy** (`ensureConnected`/`getClient`, :92-146 — already exists, call it from the new method, do not duplicate):
```typescript
static getClient(): InstanceType<typeof SteamUserLib> | null {
  return this.client
}

static async ensureConnected(): Promise<boolean> {
  if (this.client?.steamID) { return true }
  if (!this.isLoggedIn()) return false
  // ... re-logon from persisted refresh token
  return Boolean(this.client?.steamID)
}
```

**Core static-method shape to copy** (`submitSteamGuardCode`, :563-603 — mirror this exact shape: guard clause returning a plain error-status object, never throwing across the boundary, try/catch around the library call, structured `logError` with template-string EResult/message extraction on failure):
```typescript
static async submitSteamGuardCode(
  code: string
): Promise<{ status: 'done' | 'error' }> {
  if (!this.session) {
    logWarning(
      'submitSteamGuardCode called but no active session',
      LogPrefix.Steam
    )
    return { status: 'error' }
  }
  const session = this.session
  const normalized = code.trim().toUpperCase()
  try {
    await session.submitSteamGuardCode(normalized)
    return await SteamUser._waitForCredSession()
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errAny = err as any
    const eresult = errAny?.eresult ?? errAny?.EResult ?? 'unknown'
    logError(
      [`Steam guard code submission failed: EResult=${eresult}, message=${errAny?.message ?? 'none'}`],
      LogPrefix.Steam
    )
    return { status: 'error' }
  }
}
```

**New code needed (from RESEARCH.md Patterns 2-3, source-verified against `node_modules/steam-user`, not the misleading `.d.ts`)** — `redeemKey` REJECTS on every non-OK outcome, attaching `purchaseResultDetails`/`packageList` to the thrown Error:
```typescript
static async redeemKey(
  store: 'steam',
  key: string
): Promise<RedeemKeyResult> {
  const connected = await this.ensureConnected()
  const client = this.getClient()
  if (!connected || !client) {
    return { store, outcome: 'error', message: 'not-connected' }
  }
  try {
    const { purchaseResultDetails, packageList } = await client.redeemKey(key)
    return classifyPurchaseResult(store, purchaseResultDetails, packageList)
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any
    const details = e?.purchaseResultDetails ?? SteamUserLib.EPurchaseResult.Unknown
    const packageList = e?.packageList ?? {}
    return classifyPurchaseResult(store, details, packageList)
  }
}
```

**`EPurchaseResult` classifier — full 8-value taxonomy, verified from `node_modules/steam-user/resources/EPurchaseResult.js`** (use this exact enum; do NOT import `enums/EPurchaseResultDetail.js`, a different 84-value enum with a colliding `53`):
```javascript
{ Unknown: -1, OK: 0, AlreadyOwned: 9, RegionLockedKey: 13, InvalidKey: 14,
  DuplicatedKey: 15, BaseGameRequired: 24, OnCooldown: 53 }
```
| value | bucket |
|---|---|
| OK (0) | success |
| AlreadyOwned (9) | already-owned |
| InvalidKey (14) / DuplicatedKey (15) / RegionLockedKey (13) / BaseGameRequired (24) / Unknown (-1) | invalid |
| OnCooldown (53) | rate-limited |

**Error/log-redaction pattern** — mirror `humble/library.ts:1085-1109`'s `doRevealKey`, status-only:
```typescript
// Source: src/backend/humble/library.ts:1097-1108 (existing code, read this session)
// Status-only (gamekey/machineName/state — never a key VALUE) mirrors the
// exact redaction discipline already used for the sync-side silent-abort gap...
logWarning(
  ['Humble reveal: ineligible (target missing or not UNREVEALED):', gamekey, machineName, `state=${target?.state ?? 'not_found'}`],
  LogPrefix.Backend
)
```
Apply the same discipline to `redeemKey`: never interpolate the raw `key` variable into any `logInfo`/`logWarning`/`logError` call; log only `store`, the classified `outcome`, and `purchaseResultDetails`.

---

### `src/preload/api/steam.ts` — add `redeemSteamKey` export (route, request-response)

**Analog:** `steamSubmitGuard` export in the same file (:7).

**Full existing pattern to copy from** (:1-10):
```typescript
import { frontendListenerSlot, makeHandlerInvoker, makeListenerCaller } from '../ipc'

export const steamStartQR = makeHandlerInvoker('steamStartQR')
export const steamPollQR = makeHandlerInvoker('steamPollQR')
export const steamPollCredential = makeHandlerInvoker('steamPollCredential')
export const steamStartCredentials = makeHandlerInvoker('steamStartCredentials')
export const steamSubmitGuard = makeHandlerInvoker('steamSubmitGuard')
```
**New line to add:**
```typescript
export const redeemSteamKey = makeHandlerInvoker('redeemSteamKey')
```

---

### `src/backend/main.ts` — add `addHandler('redeemSteamKey', ...)` (route, request-response)

**Analog:** `addHandler('steamSubmitGuard', ...)` and its neighbors (:920-933).

**Exact pattern to copy from** (:920-933):
```typescript
addHandler('steamStartQR', async () => SteamUser.startQRLogin())
addHandler('steamPollQR', async () => SteamUser.pollQRLogin())
addHandler('steamPollCredential', async () => SteamUser.pollCredentialLogin())
addHandler('steamStartCredentials', async (event, { username, password }) =>
  SteamUser.startCredentialLogin(username, password)
)
addHandler('steamSubmitGuard', async (event, code) =>
  SteamUser.submitSteamGuardCode(code)
)
```
**New handler to add (same block, near :928):**
```typescript
addHandler('redeemSteamKey', async (event, { store, key }) =>
  SteamUser.redeemKey(store, key)
)
```

**Library refresh reuse (D-07/SPEC REQ4 — do NOT call `recomputeOwnership()` directly)** — the existing `refreshLibrary` handler (:1065-1101) already does the right thing when called with `library: 'steam'` from the frontend after a successful redeem:
```typescript
// Source: src/backend/main.ts:1065-1094 (existing code, read this session)
addHandler('refreshLibrary', async (e, library?) => {
  if (library !== undefined && library !== 'all') {
    await libraryManagerMap[library].refresh()
  } else { /* ... */ }
  // Phase 12 (Plan 04, D-47): a Steam-inclusive refresh ... triggers the
  // Humble ownership recompute from this composition root, so
  // storeManagers/steam/library.ts stays completely Humble-unaware (the
  // one-way Humble→Steam dependency direction is preserved).
  if (library === undefined || library === 'all' || library === 'steam') {
    try {
      HumbleLibrary.recomputeOwnership()
    } catch (err) { /* logWarning */ }
  }
})
```
**Anti-pattern:** Do not import `HumbleLibrary.recomputeOwnership()` into `user.ts` or call it from the redeem wrapper — it is Humble-domain code and the codebase deliberately keeps the Humble→Steam dependency one-way (comment at :1076-1079). The frontend must call the existing `refreshLibrary({ library: 'steam' })` IPC path instead.

---

### `src/common/types/ipc.ts` — add `redeemSteamKey` to `AsyncIPCFunctions` (config, transform)

**Analog:** `steamSubmitGuard` entry (:253), and the block it lives in (:237-256).

**Exact pattern to copy from:**
```typescript
steamStartQR: () => Promise<{
  status: 'done' | 'error'
  challengeUrl?: string
}>
steamPollQR: () => Promise<{
  status: 'done' | 'waiting' | 'error'
  username?: string
}>
steamSubmitGuard: (code: string) => Promise<{ status: 'done' | 'error' }>
getSteamUserInfo: () => Promise<SteamUserData | undefined>
```
**New entry to add (same shape, discriminated result type):**
```typescript
redeemSteamKey: (payload: {
  store: 'steam'
  key: string
}) => Promise<RedeemKeyResult>
```

---

### `src/common/types/steam.ts` — add `RedeemKeyResult`/`RedeemKeyOutcome` types (config, transform)

**Analog:** `SteamUserData` interface in the same file (:7-10) — same file, same "small exported interface with inline comments explaining each field's origin" convention.

```typescript
// Source: src/common/types/steam.ts:7-10 (existing code, read this session)
export interface SteamUserData {
  username: string // persona name from steam-user after loggedOn
  steamId?: string // SteamID64 — optional, used for display
}
```
Follow this exact shape for the new discriminated result type (store field is REQ6's store-aware-ready parameter, defaulted to `'steam'` by callers, not by the type):
```typescript
export type RedeemKeyOutcome =
  | 'success'
  | 'already-owned'
  | 'invalid'
  | 'rate-limited'
  | 'error'

export interface RedeemKeyResult {
  store: 'steam'
  outcome: RedeemKeyOutcome
  packageList?: Record<string, string> // packageID -> display name, from redeemKey()
  message?: string
}
```

---

### Client-side format validator (utility, transform) — NO ANALOG, new pure function

**Source (RESEARCH.md Pattern 4 — no existing precedent in this codebase; Humble's keys are opaque API-revealed strings, never user-typed, so there is no prior validator to copy):**
```typescript
// New code for this phase
function normalizeKey(raw: string): string {
  return raw.trim().toUpperCase()
}

function isObviouslyMalformed(raw: string): boolean {
  const normalized = normalizeKey(raw)
  if (normalized.length === 0) return true
  if (normalized.length < 10 || normalized.length > 40) return true
  if (!/^[A-Z0-9-]+$/.test(normalized)) return true
  return false
}
```
**Anti-pattern to avoid:** Do NOT write `/^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/` — directly contradicts D-09/SPEC REQ3's "must not over-reject" constraint.

---

### `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx` — gated nav item (component, request-response)

**Analog:** the `humble?.isLoggedIn` gated `<SidebarItem>` block in the same file (:192-199).

**Imports pattern already present** (:1-30, add `faKey` is already imported at :14; add a new context field + handler destructure):
```typescript
import ContextProvider from 'frontend/state/ContextProvider'
import SidebarItem from '../SidebarItem'
```
```typescript
const {
  amazon, epic, gog, steam, zoom, humble, platform,
  refreshLibrary, handleExternalLinkDialog
} = useContext(ContextProvider)
```

**Exact conditional-render pattern to copy** (:192-199 — login-gated `<SidebarItem>`, no other wrapper):
```typescript
{humble?.isLoggedIn && (
  <SidebarItem
    url="/humble-keys"
    icon={faKey}
    label={t('sidebar.humbleKeys', 'Humble Keys')}
    dataTour="sidebar-humble-keys"
  />
)}
```
**New item to add, placed after the Settings `<SidebarItemWithSubmenu>` block (D-01, ~after :267), gated on `steam.username` (D-02 — per SPEC REQ1, `SteamUser.isLoggedIn()` surfaces to the renderer as the truthy `steam.username` context field, same gate `loggedIn` at :58-63 already uses for Steam):**
```typescript
{steam.username && (
  <SidebarItem
    elementType="button"
    onClick={() => handleRedeemKeyDialog(true)}
    icon={faKey}
    label={t('sidebar.redeemSteamKey', 'Redeem a Steam key')}
    dataTour="sidebar-redeem-steam-key"
  />
)}
```
Note: `elementType="button"` (not a `url` link) matches the Discord/Patreon/Ko-fi button-style `<SidebarItem>` usage at :316-344, since D-03 opens a modal rather than navigating.

---

### `src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx` — new modal (component, request-response)

**Analog:** `src/frontend/components/UI/ExternalLinkDialog/index.tsx` (full file, 57 lines) — the CONTEXT.md-referenced `DialogHandler` is NOT the right analog (see Anti-Pattern below); this is the corrected reuse target per RESEARCH.md Pattern 5.

**Full pattern to copy from:**
```typescript
// Source: src/frontend/components/UI/ExternalLinkDialog/index.tsx (existing code, read this session)
import { useContext, useState } from 'react'
import { Dialog, DialogContent, DialogFooter } from '../Dialog'
import ContextProvider from '../../../state/ContextProvider'
import { useTranslation } from 'react-i18next'

export default function ExternalLinkDialog() {
  const { t } = useTranslation()
  const [showDialog, setShowDialog] = useState(false)
  const { externalLinkDialogOptions, handleExternalLinkDialog } =
    useContext(ContextProvider)

  function onClose() {
    setShowDialog(false)
    handleExternalLinkDialog({ showDialog: false, linkCallback: undefined })
  }

  return externalLinkDialogOptions.showDialog ? (
    <Dialog onClose={onClose} showCloseButton={false}>
      <DialogContent>{/* ... */}</DialogContent>
      <DialogFooter>
        <button onClick={onContinue} className={`button is-primary`}>
          {t('button.continue', 'Continue')}
        </button>
        <button className={`button is-secondary`} onClick={onClose}>
          {t('button.cancel', 'Cancel')}
        </button>
      </DialogFooter>
    </Dialog>
  ) : null
}
```
**For `RedeemSteamKeyDialog`:** follow this exact shape (`ContextProvider`-toggled boolean, local `useState`, `Dialog`/`DialogContent`/`DialogFooter`), but additionally hold local state for the key input text and the inline outcome (D-06/D-08 — outcome shown in place, modal stays open on any result):
```typescript
const [key, setKey] = useState('')
const [outcome, setOutcome] = useState<RedeemKeyOutcome | null>(null)
const [packageName, setPackageName] = useState<string | undefined>()

async function onRedeem() {
  if (isObviouslyMalformed(key)) {
    setOutcome('error') // or a dedicated 'malformed' local UI state — no IPC call (SPEC REQ3)
    return
  }
  const result = await window.api.redeemSteamKey({ store: 'steam', key: normalizeKey(key) })
  setOutcome(result.outcome)
  if (result.outcome === 'success') {
    setPackageName(Object.values(result.packageList ?? {})[0])
    await window.api.refreshLibrary({ library: 'steam' }) // NOT recomputeOwnership() directly
  }
}
```
**Anti-pattern to avoid (corrects CONTEXT.md D-04's `DialogHandler` reference):** `src/frontend/components/UI/DialogHandler/index.tsx` is a fixed, backend-driven generic message-box (title/message/type/buttons) subscribed to a single `showDialog` IPC channel — it has no slot for a stateful text input or inline switching outcome UI. Do not build the redeem modal on top of it.

---

### `src/frontend/state/ContextProvider.tsx` + `GlobalState.tsx` + `types.ts` — dialog toggle (provider, event-driven)

**Analog:** `externalLinkDialogOptions`/`handleExternalLinkDialog` triad across the three files.

**`types.ts` interface pattern** (:164-167):
```typescript
export interface ExternalLinkDialogOptions {
  showDialog: boolean
  linkCallback?: () => void
}
```
And its context-shape entries (:134-135):
```typescript
externalLinkDialogOptions: ExternalLinkDialogOptions
handleExternalLinkDialog: (options: ExternalLinkDialogOptions) => void
```

**`ContextProvider.tsx` default-value pattern** (:104-105):
```typescript
externalLinkDialogOptions: { showDialog: false },
handleExternalLinkDialog: () => null,
```

**`GlobalState.tsx` setter pattern** (:562-564):
```typescript
handleExternalLinkDialog = (value: ExternalLinkDialogOptions) => {
  this.setState({ externalLinkDialogOptions: value })
}
```

**New code needed, same shape in all three files** — a simple boolean toggle is sufficient (D-04's modal owns its own input/outcome state internally, per the Dialog analog above; the context only needs open/closed):
```typescript
// types.ts
showRedeemKeyDialog: boolean
handleRedeemKeyDialog: (show: boolean) => void

// ContextProvider.tsx
showRedeemKeyDialog: false,
handleRedeemKeyDialog: () => null,

// GlobalState.tsx
handleRedeemKeyDialog = (show: boolean) => {
  this.setState({ showRedeemKeyDialog: show })
}
```

---

### `src/frontend/App.tsx` — mount `<RedeemSteamKeyDialog />` (component, event-driven)

**Analog:** the always-mounted dialog list (:96-108), specifically `<ExternalLinkDialog />` at :103.

**Exact pattern to copy from:**
```typescript
// Source: src/frontend/App.tsx:14-15 (imports), :96-108 (mount list)
import DialogHandler from './components/UI/DialogHandler'
import ExternalLinkDialog from './components/UI/ExternalLinkDialog'
// ...
<main className="content">
  <DialogHandler />
  <InstallGameWrapper />
  <SteamBottleSetup />
  <SteamClientSetup />
  <SteamInstallLocationPicker />
  <SettingsModalWrapper />
  <ExternalLinkDialog />
  <LogFileUploadDialog />
  <UploadedLogFilesList />
  <Outlet />
  <AnalyticsDialog />
  <HumbleExpiryToast />
</main>
```
**New line to add:** import `RedeemSteamKeyDialog` and mount it alongside `<ExternalLinkDialog />` (e.g. immediately after it) — same always-mounted, self-gating (`showDialog ? <Dialog> : null`) convention as every other entry in this list.

---

### `src/backend/storeManagers/steam/__tests__/user.test.ts` — add `describe('redeemKey()', ...)` (test, request-response)

**Analog:** the existing `describe('submitSteamGuardCode()', ...)` block (:664) and the `mockSteamUserInstance`/`jest.mock('steam-user', ...)` setup (:89-108, re-armed in `beforeEach` at :154-171).

**Mock scaffolding pattern to extend (already exists, add `redeemKey: jest.fn()` to the instance mock):**
```typescript
// Source: src/backend/storeManagers/steam/__tests__/user.test.ts:92-108 (existing code, read this session)
const mockSteamUserInstance = {
  logOn: jest.fn(),
  logOff: jest.fn(),
  steamID: { getSteamID64: () => '76561197900000000' } as any,
  getPersonas: jest.fn().mockResolvedValue({
    personas: { '76561197900000000': { player_name: 'TestUser' } }
  }),
  on: jest.fn((event: string, cb: (...args: any[]) => any) => {
    steamUserOnHandlers[event] = cb
  }),
  once: jest.fn((event: string, cb: (...args: any[]) => any) => {
    steamUserOnHandlers[event] = cb
  })
  // ADD: redeemKey: jest.fn()
}
const MockSteamUserLib = jest.fn(() => mockSteamUserInstance)
jest.mock('steam-user', () => MockSteamUserLib)
```
**`beforeEach` re-arm pattern to follow (:154-171 — resetMocks:true clears implementations every test, must be re-set here):**
```typescript
MockSteamUserLib.mockImplementation(() => mockSteamUserInstance)
mockSteamUserInstance.getPersonas.mockResolvedValue({ /* ... */ })
mockSteamUserInstance.logOff.mockImplementation(() => {})
// ADD: mockSteamUserInstance.redeemKey.mockReset()
```
**Test-case shape to copy** (mirrors `submitSteamGuardCode()`'s describe block structure — one test per outcome bucket, resolve for success, reject-with-Error-properties for every non-success `EPurchaseResult` value per RESEARCH.md Pattern 2/Pitfall 1):
```typescript
describe('redeemKey()', () => {
  test('OK: resolves and classifies as success', async () => {
    mockSteamUserInstance.redeemKey.mockResolvedValue({
      purchaseResultDetails: 0, // EPurchaseResult.OK
      packageList: { 123: 'Some Game' }
    })
    // ... assert ensureConnected() gating, result.outcome === 'success'
  })

  test('AlreadyOwned (9): rejects and classifies as already-owned', async () => {
    const err = Object.assign(new Error('AlreadyOwned'), {
      purchaseResultDetails: 9,
      packageList: {}
    })
    mockSteamUserInstance.redeemKey.mockRejectedValue(err)
    // ... assert result.outcome === 'already-owned'
  })

  // repeat table-driven for InvalidKey(14)/DuplicatedKey(15)/RegionLockedKey(13)/
  // BaseGameRequired(24) -> 'invalid', OnCooldown(53) -> 'rate-limited', Unknown(-1) -> 'invalid'

  test('never logs the raw key value', () => {
    // assert no logInfo/logWarning/logError call arguments contain the literal key string
  })
})
```

---

## Shared Patterns

### Static-class backend action wrapper
**Source:** `src/backend/storeManagers/steam/user.ts` — every Steam action is a `static async` method on `SteamUser`, gated first on connection/session state, wrapped in try/catch, returning a plain JSON-serializable result object (never throwing across the IPC boundary).
**Apply to:** `SteamUser.redeemKey()`.

### `makeHandlerInvoker` + `addHandler` IPC wiring
**Source:** `src/preload/api/steam.ts` (preload export) + `src/backend/main.ts:920-933` (handler registration) + `src/common/types/ipc.ts:237-256` (`AsyncIPCFunctions` contract).
**Apply to:** `redeemSteamKey` — three-file lockstep addition (preload export, main.ts handler, ipc.ts type entry), same pattern as every other `steamXxx` IPC method.

### Log-redaction discipline (never log raw secret values)
**Source:** `src/backend/humble/library.ts:1085-1109` (`doRevealKey`) — status-only logging (gamekey/state/outcome-class), never the key VALUE.
**Apply to:** `SteamUser.redeemKey()` and any modal-side debug logging — never interpolate the raw `key`/`normalizeKey(key)` string into a log call.

### `ContextProvider`-toggled standalone Dialog (not `DialogHandler`)
**Source:** `src/frontend/components/UI/ExternalLinkDialog/index.tsx` + `ContextProvider.tsx`/`GlobalState.tsx`/`types.ts`'s `externalLinkDialogOptions`/`handleExternalLinkDialog` triad + `App.tsx`'s always-mounted dialog list.
**Apply to:** `RedeemSteamKeyDialog` — corrects CONTEXT.md's `DialogHandler` reference; `DialogHandler` is a fixed backend-driven message-box unsuited to a stateful form.

### Login-gated conditional `<SidebarItem>` render
**Source:** `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx:192-199` (`humble?.isLoggedIn &&`).
**Apply to:** the new Steam-redeem `<SidebarItem>`, gated on `steam.username` (D-02), matching the same `loggedIn` composite check pattern already used at :58-63.

### Existing `refreshLibrary` IPC path for post-mutation ownership sync (NOT a new backend function)
**Source:** `src/backend/main.ts:1065-1101` — `addHandler('refreshLibrary', ...)`, already triggers `HumbleLibrary.recomputeOwnership()` as a side effect when called with `library: 'steam'`.
**Apply to:** the redeem modal's success path — call `window.api.refreshLibrary({ library: 'steam' })`, never a new `SteamUser.recheckOwnership()`/direct `recomputeOwnership()` call (which would violate the codebase's one-way Humble→Steam dependency direction, per the comment at main.ts:1076-1079).

### `jest.mock('steam-user', ...)` backend test scaffolding
**Source:** `src/backend/storeManagers/steam/__tests__/user.test.ts:89-108` (mock definition) + `:154-171` (`beforeEach` re-arm, required because `resetMocks: true` in jest config clears implementations every test).
**Apply to:** new `redeemKey()` test cases — add `redeemKey: jest.fn()` to `mockSteamUserInstance`, re-arm/reset it in `beforeEach`, use `mockResolvedValue`/`mockRejectedValue` (with `Object.assign(new Error(...), { purchaseResultDetails, packageList })` for the reject path) to drive each of the 8 `EPurchaseResult` values.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Client-side key format validator (`isObviouslyMalformed`/`normalizeKey`) | utility | transform | No existing user-typed-key validator in the codebase — Humble's keys are opaque, API-revealed strings, never manually entered. Use RESEARCH.md Pattern 4 verbatim (light-touch length/charset check, explicitly NOT a 5-5-5 regex). |

## Metadata

**Analog search scope:** `src/backend/storeManagers/steam/` (user.ts, __tests__/user.test.ts), `src/preload/api/steam.ts`, `src/backend/main.ts`, `src/common/types/ipc.ts`, `src/common/types/steam.ts`, `src/frontend/components/UI/Sidebar/components/SidebarLinks/`, `src/frontend/components/UI/ExternalLinkDialog/`, `src/frontend/components/UI/DialogHandler/`, `src/frontend/state/ContextProvider.tsx`, `src/frontend/state/GlobalState.tsx`, `src/frontend/types.ts`, `src/frontend/App.tsx`, `src/backend/humble/library.ts` (redaction precedent only)
**Files scanned:** 13 (all read this session; graphify used to orient on `SteamUser`'s dependency graph before raw reads)
**Pattern extraction date:** 2026-07-20
