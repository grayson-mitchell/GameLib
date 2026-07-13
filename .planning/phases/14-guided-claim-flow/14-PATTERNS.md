# Phase 14: Guided Claim Flow - Pattern Map

**Mapped:** 2026-07-07
**Files analyzed:** 15 (7 modified backend, 2 modified frontend, 1 modified common, 1 modified route table, 1 new frontend component, 2 new/extended test files, 1 new backend types addition)
**Analogs found:** 15 / 15 (every file has an in-repo analog — this phase is a recombination of Phases 10-13 patterns, per RESEARCH.md's own framing)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/backend/humble/adapter.ts` (+`humblePostRequest`, +`revealKey()`) | service (adapter/transport) | request-response (write) | same file's `getOrderDetail`/`getGamekeys` (existing GET functions) | role-match (first POST in file; GET functions are the closest same-file analog) |
| `src/backend/humble/electronStores.ts` (+`humbleAuditStore`, +`humbleLocalRedeemedStore`, +`humbleRevealedKeyValueStore`) | model (persistence) | CRUD | same file's `humbleRevealedStore`/`humbleOwnershipOverrideStore`/`humbleGiftedAtStore` | exact |
| `src/backend/humble/classify.ts` (+`keyindex` extraction, +`isLocallyRedeemed` precedence tier) | service (pure transform) | transform | same file's `classifyTpk`/`classifyOrder` | exact |
| `src/backend/humble/dedup.ts` (WR-01 fix: falsy `steam_app_id` handling) | service (pure transform) | transform | same file's `recomputeOwnership` | exact |
| `src/backend/humble/library.ts` (+`revealKey`/`markRedeemed`/`undoRedeemed` orchestration, +direct cache-patch helper) | service (orchestration) | CRUD + event-driven | same file's `setOwnershipOverride`/`clearOwnershipOverride`/`recordGiftLinkOpened` + `recomputeOwnership`'s direct-patch shape | exact |
| `src/backend/humble/ipc_handler.ts` (+`humbleRevealKey`/`humbleMarkRedeemed`/`humbleUndoRedeemed`/`humbleGetRevealedKeyValue` handlers) | controller (IPC handler) | request-response | same file's `humbleSetOwnershipOverride`/`humbleRecordGiftLinkOpened` handlers | exact |
| `src/backend/humble/constants.ts` (+reveal URL path constant, bump `HUMBLE_CLASSIFIER_VERSION`) | config | — | same file (already has `HUMBLE_COOLDOWN_MS`, `HUMBLE_CLASSIFIER_VERSION`) | exact |
| `src/preload/api/humble.ts` (+invokers for the 4 new IPC channels) | service (preload bridge) | request-response | same file's `humbleSetOwnershipOverride`/`humbleRecordGiftLinkOpened` invokers | exact |
| `src/common/types/humble.ts` (+`locallyRedeemedPending?` on `HumbleKey`, +reveal/redeem result discriminated unions) | model (shared types) | — | same file's `HumbleKey`/`AdapterResult` | exact |
| `src/common/types/ipc.ts` (+4 new `AsyncIPCFunctions` entries, +`humbleKeysUpdated` reuse) | config (IPC contract) | request-response | same file's `humbleSetOwnershipOverride`/`humbleRecordGiftLinkOpened` entries | exact |
| `src/backend/humble/user.ts` (optional: extend cookie capture for `csrf_cookie`) | service (auth) | CRUD | same file's `checkCookie`/`finishLogin` `_simpleauth_sess` capture | exact |
| `src/frontend/screens/Humble/Keys/Waiting/index.tsx` (+Claim/Finish button + wizard mount) | component (screen) | request-response | `src/frontend/screens/Humble/Keys/Spares/index.tsx` (adds the one new interactive affordance to a same-shape flat-list tab) | exact |
| `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` (extend with `claimAction` prop, mirrors `giftAction`) | component (row) | — | same file's existing `giftAction` prop pattern | exact |
| `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx` (NEW) | component (modal body) | request-response | `Spares/index.tsx`'s `openGiftDialog` (`showDialogModal` usage) + `MessageBoxModal`'s `message: ReactElement` support | role-match (new stateful component; no existing multi-step wizard in repo) |
| `src/frontend/App.tsx` (no route change expected — reuses existing `humble-keys/spares` child route as C2 navigate target) | route (config) | — | existing `humble-keys` nested route table (lines ~177-197) | exact |

## Pattern Assignments

### `src/backend/humble/adapter.ts` (service, request-response write)

**Analog:** same file's `getOrderDetail`/`getGamekeys` (existing GET functions) — this is the adapter's first POST, so the closest analog is the sibling GET functions' error-mapping/schema-validation shape, not an external file.

**Imports pattern** (lines 1-6):
```typescript
import axios from 'axios'
import { z } from 'zod'

import { logError, logWarning, LogPrefix } from 'backend/logger'
import { AdapterResult, HumbleUserData } from 'common/types/humble'
import { HUMBLE_BASE_URL, HUMBLE_REQUIRED_HEADERS } from './constants'
```

**Transport pattern to extend — `humbleRequest` (GET) sits alongside a new `humblePostRequest`** (lines 135-162, header-building at 99-104):
```typescript
function buildHeaders(cookie: string) {
  return {
    ...HUMBLE_REQUIRED_HEADERS,
    Cookie: `_simpleauth_sess=${cookie}`
  }
}
...
async function humbleRequest(path: string, cookie: string): Promise<HumbleRawResponse> {
  const res = await axios.get(`${HUMBLE_BASE_URL}${path}`, {
    headers: buildHeaders(cookie),
    timeout: REQUEST_TIMEOUT_MS
  })
  // ... string-body JSON coercion tolerance, contentType capture
}
```
The new `revealKey()` needs a POST sibling with the same signature shape (`path, cookie, body -> HumbleRawResponse`), reusing `REQUEST_TIMEOUT_MS` (15_000) and `HUMBLE_REQUIRED_HEADERS`, adding `Content-Type: application/x-www-form-urlencoded` and optionally `csrf-prevention-token`.

**Error handling pattern — `mapAxiosError`** (lines 169-185), reuse verbatim, this is exactly the 401/403/429 -> `session_expired`/`access_denied` split D-78's "definitive failure" hinges on:
```typescript
function mapAxiosError<T>(err: unknown): AdapterResult<T> {
  if (axios.isAxiosError(err)) {
    if (err.response?.status === 401) return { status: 'session_expired' }
    if (err.response?.status === 403) return { status: 'access_denied' }
    if (err.response?.status === 429) return { status: 'access_denied' }
  }
  logError(['Humble adapter: unexpected request failure (see message only, never body/cookie)'], LogPrefix.Backend)
  throw err
}
```

**Schema + call pattern (per-function shape to copy for `revealKey`)** (lines 290-320, `getOrderDetail`):
```typescript
export async function getOrderDetail(cookie: string, gamekey: string): Promise<AdapterResult<OrderDetail>> {
  try {
    const response = await humbleRequest(`/api/v1/order/${encodeURIComponent(gamekey)}?all_tpkds=true`, cookie)
    const parsed = OrderDetailSchema.safeParse(response.data)
    if (!parsed.success) {
      describeSchemaFailure(`/api/v1/order/${gamekey}`, response, parsed.error)
      return { status: 'schema_error', raw: response.data }
    }
    return { status: 'ok', data: parsed.data }
  } catch (err) {
    return mapAxiosError<OrderDetail>(err)
  }
}
```
RESEARCH.md's "Code Examples" section already has a fully worked `revealKey()` draft using this exact shape (zod `.passthrough()` schema, `mapAxiosError`, redacted logging) — use it as the starting point, not a fresh design.

**Redaction discipline** (`describeSchemaFailure`, lines 201-228): never log `res.data`/`parsed.data` verbatim — only status/length/issue-paths. The reveal function must NEVER log the `key` field even at length-only granularity beyond what this helper already does structurally (C4) — RESEARCH.md flags `error_msg` specifically as a field that could echo a key value and must not be logged verbatim.

---

### `src/backend/humble/electronStores.ts` (model, CRUD)

**Analog:** same file's `humbleRevealedStore`/`humbleOwnershipOverrideStore`/`humbleGiftedAtStore` (exact — three near-identical prior stores).

**Full pattern to replicate 3x** (lines 33-65):
```typescript
// D-04/D-30: this store is NEVER cleared by HumbleUser.disconnect() — it
// (and the future audit log) must survive a disconnect/reconnect cycle so a
// previously-revealed key never regresses to UNREVEALED (Pitfall 1). Kept as
// a separate electron-store file on disk from the two stores above for
// exactly that reason — do not merge this into humbleLibraryStore.
const humbleRevealedStore = new CacheStore<{ revealedAt: number }, string>(
  'humble_revealed',
  null
)
```
New stores follow this identical `CacheStore<Shape, KeyType>('file_name', null)` shape, exported via the same `export { ... }` block at the bottom (lines 67-74). **Key difference (Pattern 3 from RESEARCH.md):** the 3 new Phase 14 stores (`humbleAuditStore`, `humbleLocalRedeemedStore`, `humbleRevealedKeyValueStore`) must key by the composite `` `${gamekey}:${machineName}` `` string (still a plain `string` `KeyType` — just construct the composite string at the call site in `library.ts`), NOT `machineName` alone like the 3 existing stores — this is the WR-01-informed fix, a call-site convention rather than a `CacheStore` API change.

All new stores join the disconnect-wipe exemption (D-04) — never add them to whatever list `user.ts`'s `disconnect()` clears.

---

### `src/backend/humble/classify.ts` (service, pure transform)

**Analog:** same file's `classifyTpk`/`classifyOrder` (exact — this phase extends both).

**Precedence function to extend** (lines 21-43):
```typescript
export function classifyTpk(
  tpk: { redeemedKeyValuePresent: boolean; expiration: string | null; isExpired?: boolean },
  isLocallyRevealed: boolean,
  now: Date = new Date()
): HumbleKeyState {
  if (tpk.isExpired || (tpk.expiration && new Date(tpk.expiration).getTime() <= now.getTime())) {
    return 'UNREDEEMABLE'
  }
  if (tpk.redeemedKeyValuePresent) {
    return 'REDEEMED'
  }
  if (isLocallyRevealed) {
    return 'REVEALED'
  }
  return 'UNREVEALED'
}
```
D-77 requires inserting a new `isLocallyRedeemed` parameter/tier ABOVE `isLocallyRevealed` but BELOW `redeemedKeyValuePresent` (server truth still wins) — RESEARCH.md's Pattern 5 has the exact worked diff. Function signature changes from 3 params to 4 (insert before `now`), so every call site (`classify.ts` internal, `classifyOrder`, and `library.ts`'s `fetchAndCommitOrder`) needs the new argument threaded through.

**`classifyOrder`'s injected-predicate call convention** (lines 286-290, the pattern the new `isLocallyRedeemed` predicate must follow):
```typescript
const state = classifyTpk(
  { redeemedKeyValuePresent, expiration, isExpired },
  isRevealed(machineName),
  now
)
```
`isRevealed` itself is injected by the caller (`library.ts`) reading `humbleRevealedStore.has(machineName)` — the new `isLocallyRedeemed` predicate follows the identical injection shape, reading the new `humbleLocalRedeemedStore` (composite-keyed, per Pattern 3 above — so the predicate needs both `gamekey` and `machineName` in scope, unlike `isRevealed`'s machineName-only lookup).

**`keyindex` field addition** — mirrors how Phase 12 added `steamAppId` (lines 306-311 of the same file):
```typescript
const rawAppId = tpk.steam_app_id
const steamAppId =
  platform === 'steam' &&
  (typeof rawAppId === 'string' || typeof rawAppId === 'number')
    ? String(rawAppId)
    : undefined
```
Per RESEARCH.md's recommendation, `keyindex` should NOT be added to the public `HumbleKey` push type this way — instead keep it in an internal-only lookup map/side-channel that `library.ts`'s reveal handler reads directly (never serialized to `humbleKeysUpdated`).

**`OrderDetailTpkSchema` addition** (in `adapter.ts`, lines 46-56): add `keyindex: z.union([z.string(), z.number()]).nullish()` to the existing `.passthrough()` object, same tolerant-field convention as every other field in that schema.

---

### `src/backend/humble/dedup.ts` (service, pure transform — WR-01 fix)

**Analog:** same file's `recomputeOwnership` (exact).

**Current exact-match branch to fix** (lines 146-156):
```typescript
let ownedElsewhere = false
let matchConfidence: HumbleKey['matchConfidence'] = 'none'
if (key.steamAppId !== undefined) {
  if (steamGames.some((g) => g.app_name === key.steamAppId)) {
    ownedElsewhere = true
    matchConfidence = 'exact'
  }
} else if (steamGames.some((g) => fuzzyMatch(key.title, g.title))) {
  ownedElsewhere = true
  matchConfidence = 'fuzzy'
}
```
WR-01 (per CONTEXT D-71): a **falsy but present** `steam_app_id` (e.g. `''` or `0` stringified) currently satisfies `key.steamAppId !== undefined` and skips BOTH match tiers (falls into the exact-match branch, finds no match, but never falls through to fuzzy). The fix should treat an empty-string/`'0'`/falsy `steamAppId` the same as `undefined` for branch selection — check `if (key.steamAppId)` (truthy) rather than `!== undefined`, or add an explicit falsy guard before the `if/else if`. Keep the rest of the function (fuzzy matching, override-clearing at lines 157-160) unchanged.

---

### `src/backend/humble/library.ts` (service, orchestration — CRUD + event-driven)

**Analog:** same file's `setOwnershipOverride`/`clearOwnershipOverride`/`recordGiftLinkOpened` (exact — simplest existing single-key mutators) and `recomputeOwnership` (exact — the direct cache-patch precedent).

**Simple mutator + re-push pattern** (lines 339-351):
```typescript
function setOwnershipOverride(machineName: string): void {
  humbleOwnershipOverrideStore.set(machineName, { overriddenAt: Date.now() })
  recomputeOwnership()
}

function clearOwnershipOverride(machineName: string): void {
  humbleOwnershipOverrideStore.delete(machineName)
  recomputeOwnership()
}
```

**Direct cache-projection patch precedent — `recomputeOwnership`** (lines 308-331), the shape `patchCachedState`/`revealKey`/`markRedeemed`/`undoRedeemed` must all follow (read-modify-write `humbleLibraryStore` entry, then `sendFrontendMessage`):
```typescript
function recomputeOwnership(): void {
  if (!SteamUser.isLoggedIn()) return
  const steamGames = steamLibraryStore.get('games', [])
  if (steamGames.length === 0) return

  for (const [gamekey, entry] of humbleLibraryStore.entries()) {
    const mutatedKeys = dedupRecomputeOwnership(
      entry.keys,
      steamGames,
      (machineName) => humbleOwnershipOverrideStore.has(machineName)
    )
    humbleLibraryStore.set(gamekey, { ...entry, keys: mutatedKeys })
  }
  sendFrontendMessage('humbleKeysUpdated', getKeys())
}
```
RESEARCH.md's Pattern 4 has the exact single-key variant to copy (`patchCachedState(gamekey, machineName, newState)` — find entry by gamekey, find key index by machineName, replace, write back, push).

**Write-ahead + adapter-call + outcome-branch orchestration** — no existing function in this file does all of this yet (this is the phase's core new logic), but RESEARCH.md's "Pattern 2" code example is the fully worked target shape (already grounded in this file's own `sync()`/`runSync()` cookie-fetch + `HumbleUser.getCredentials()` convention, lines 445-446):
```typescript
const cookie = HumbleUser.getCredentials()
if (!cookie) {
  return { status: 'failed' }
}
```

**Cooldown reuse (D-79)** — the existing D-33 cooldown check in `runSync()` (lines 450-465) is the pattern to reuse for reveal denials, not rebuild:
```typescript
const currentState = getSyncState()
if (currentState.cooldownUntil && currentState.cooldownUntil > Date.now()) {
  logWarning(['Humble sync: skipped — denial cooldown active until', new Date(currentState.cooldownUntil).toISOString()], LogPrefix.Backend)
  return { status: 'failed' }
}
```
and the cooldown-setting shape on `access_denied` (lines 492-505):
```typescript
if (!isStale()) {
  setSyncState({ syncError: 'denied', cooldownUntil: Date.now() + HUMBLE_COOLDOWN_MS })
}
```

**Exported surface convention** (lines 658-668) — add the new functions to this same object literal:
```typescript
export const HumbleLibrary = {
  loadCached, sync, getKeys, getSyncState,
  recomputeOwnership, setOwnershipOverride, clearOwnershipOverride,
  recordGiftLinkOpened, getAllGiftedAt
}
```

---

### `src/backend/humble/ipc_handler.ts` (controller, request-response)

**Analog:** same file's `humbleSetOwnershipOverride`/`humbleRecordGiftLinkOpened` handlers (exact — this is the D-69 server-side-re-validation shape the reveal handler must copy verbatim).

**Full pattern to replicate for `humbleRevealKey`/`humbleMarkRedeemed`/`humbleUndoRedeemed`** (lines 64-83, `humbleRecordGiftLinkOpened` — closest match since it also checks `ownedElsewhere`):
```typescript
addHandler('humbleRecordGiftLinkOpened', async (e, machineName) => {
  const targetKey = HumbleLibrary.getKeys().find(
    (key) => key.machineName === machineName
  )
  if (
    !targetKey ||
    !targetKey.ownedElsewhere ||
    targetKey.state !== 'UNREVEALED'
  ) {
    logWarning(
      ['Rejected humbleRecordGiftLinkOpened for ineligible machineName:', machineName],
      LogPrefix.Backend
    )
    return
  }
  HumbleLibrary.recordGiftLinkOpened(machineName)
})
```
The reveal handler is the C2 guard's authoritative enforcement point: it must invert this check — reject (route to `owned_blocked`) when `targetKey.ownedElsewhere === true` (D-69/D-70, both exact and fuzzy block equally), rather than requiring it like the gift handler does. Per RESEARCH.md's Pattern 3, the new handlers should accept BOTH `gamekey` AND `machineName` as IPC params (not machineName alone like the two existing handlers) to support composite-keyed lookups — this is a deliberate divergence from the exact copy, called out explicitly so the planner doesn't silently narrow the new channels to the old single-param shape.

**File-level structure/registration point** (lines 20-96) — `registerHumbleIpcHandlers()` is the single place all 4 new handlers get added, same `addHandler`/`addListener` import (line 1) and same one-function-registers-everything convention. No new registration call site needed elsewhere — `main.ts` already calls this function once at startup.

---

### `src/preload/api/humble.ts` (service, preload bridge)

**Analog:** same file's `humbleSetOwnershipOverride`/`humbleRecordGiftLinkOpened` (exact).

**Full file pattern** (lines 22-31):
```typescript
export const humbleSetOwnershipOverride = makeHandlerInvoker(
  'humbleSetOwnershipOverride'
)
export const humbleClearOwnershipOverride = makeHandlerInvoker(
  'humbleClearOwnershipOverride'
)
export const humbleRecordGiftLinkOpened = makeHandlerInvoker(
  'humbleRecordGiftLinkOpened'
)
export const humbleGetGiftedAt = makeHandlerInvoker('humbleGetGiftedAt')
```
The 4 new channels (`humbleRevealKey`, `humbleMarkRedeemed`, `humbleUndoRedeemed`, `humbleGetRevealedKeyValue`) are each one `makeHandlerInvoker('channelName')` line added to this same file, no new import needed (`makeHandlerInvoker` already imported at line 2).

---

### `src/common/types/humble.ts` / `src/common/types/ipc.ts` (model, shared contracts)

**Analog:** same files' `AdapterResult`/`HumbleKey` and the `humbleSetOwnershipOverride: (machineName: string) => Promise<void>` IPC entries (exact).

**Result-union pattern to mirror** (`humble.ts` lines 9-13):
```typescript
export type AdapterResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'session_expired' }
  | { status: 'access_denied' }
  | { status: 'schema_error'; raw: unknown }
```
New discriminated unions for reveal/redeem outcomes (e.g. `RevealOutcome = { status: 'revealed'; key: string } | { status: 'owned_blocked' } | { status: 'failed' } | { status: 'ambiguous' } | { status: 'ineligible' }`) follow this same tagged-union convention — a `status` string literal discriminant field, never a boolean flag.

**`HumbleKey` extension point** (lines 95-128) — add `locallyRedeemedPending?: boolean` as one more optional field, following the exact style of the existing `steamAppId?: string` doc-commented optional field (lines 107-114). Do NOT add `keyindex` or a raw key value here (RESEARCH.md anti-pattern, C4/blast-radius).

**IPC contract entries to mirror** (`ipc.ts`, the `humbleSetOwnershipOverride`/`humbleRecordGiftLinkOpened` lines): each new handler needs a matching `AsyncIPCFunctions` (or equivalent interface) entry with the exact param/return signature the handler implements, e.g.:
```typescript
humbleSetOwnershipOverride: (machineName: string) => Promise<void>
...
humbleRecordGiftLinkOpened: (machineName: string) => Promise<void>
```

---

### `src/frontend/screens/Humble/Keys/Waiting/index.tsx` (component, request-response)

**Analog:** `src/frontend/screens/Humble/Keys/Spares/index.tsx` (exact — same flat-list tab shape, same one-new-interactive-affordance pattern, same `showDialogModal` usage this phase needs).

**Full existing structure to extend (not replace)**:
```typescript
import { useContext } from 'react'
import { useTranslation } from 'react-i18next'

import ContextProvider from 'frontend/state/ContextProvider'
import { selectKeysWaiting } from 'common/humble/viewFilters'
import { getUrgencyTier } from 'common/humble/urgencyBadge'
import HumbleKeyRow from '../components/HumbleKeyRow'

export default function HumbleKeysWaiting() {
  const { t } = useTranslation()
  const { humble } = useContext(ContextProvider)
  const keys = selectKeysWaiting(humble?.keys ?? [])
  return (
    <div className="humbleKeysTabPanel">
      ...
      {keys.map((key) => (
        <HumbleKeyRow key={`${key.gamekey}:${key.machineName}`} humbleKey={key} urgencyTier={...} />
      ))}
    </div>
  )
}
```
Per D-65/D-67, add a `claimAction` prop to each `HumbleKeyRow` (mirrors `Spares/index.tsx`'s `giftAction` prop exactly — see below) that opens `showDialogModal({ message: <HumbleClaimWizard .../> })`. Needs `const { humble, showDialogModal } = useContext(ContextProvider)` (destructure `showDialogModal` too, exactly as `Spares/index.tsx` line 22 does) and local `useState` for wizard-open/modal-target-key state (or let the wizard component own all step state per D-65/RESEARCH.md's stateful-component recommendation).

**Dialog-opening pattern to copy verbatim** (`Spares/index.tsx` lines 41-68, `openGiftDialog`):
```typescript
function openGiftDialog(key: HumbleKey) {
  showDialogModal({
    showDialog: true,
    title: t('humbleKeys.giftConfirmTitle', 'Gift this key?'),
    message: t('humbleKeys.giftConfirmBody', "..."),
    buttons: [
      { text: t('button.cancel', 'Cancel'), onClick: () => showDialogModal({ showDialog: false }) },
      { text: t('humbleKeys.giftConfirmAction', 'Open Humble'), onClick: () => { ... showDialogModal({ showDialog: false }) } }
    ]
  })
}
```
For the claim wizard, `message` becomes a `ReactElement` (`<HumbleClaimWizard .../>`) instead of a plain string, and `buttons: []` (the wizard renders its own step-appropriate actions inside `message`, per RESEARCH.md's Pattern 6 example) rather than the two-button confirm/cancel shape gift uses.

---

### `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` (component — extend, don't replace)

**Analog:** same file's existing `giftAction` prop (exact — D-60 already established the "optional action prop, rendered only when supplied, one tab is the sole caller" convention this phase's `claimAction` prop must follow).

**Prop-shape + conditional-render pattern to mirror** (lines 11-17, 109-131):
```typescript
type Props = {
  humbleKey: HumbleKey
  urgencyTier?: UrgencyTier
  /** D-60: Giftable Spares only — omitted (undefined) everywhere else. */
  giftAction?: { giftedAt: number | null; onGift: () => void }
}
...
{giftAction &&
  (giftAction.giftedAt !== null ? (
    <span className="humbleKeyGiftedAnnotation">
      {t('humbleKeys.giftedAnnotation', 'Opened Humble gift page {{date}}', { date: new Date(giftAction.giftedAt).toLocaleDateString() })}
    </span>
  ) : (
    <button type="button" className="humbleKeyGiftButton" onClick={giftAction.onGift}>
      {t('humbleKeys.giftOnHumble', 'Gift on Humble')}
      <FontAwesomeIcon icon={faExternalLinkAlt} />
    </button>
  ))}
```
A new `claimAction?: { revealedAt: number | null; onClick: () => void }`-shaped prop follows this exact ternary-annotation-vs-button convention: "Claim" button when `revealedAt === null`, "Finish activation" button + a `humbleKeyRevealedAnnotation` (mirrors `humbleKeyGiftedAnnotation`, D-75) when not. D-22's "strictly read-only, two sanctioned exceptions" comment (lines 19-25) needs updating to name this THIRD sanctioned exception explicitly — flag this for the planner so the comment doesn't go stale.

---

### `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx` (NEW component, modal body)

**Analog:** no exact prior analog (first multi-step wizard in the codebase) — closest role-match is `Spares/index.tsx`'s dialog usage + the `MessageBoxModal` component's `ReactElement` support.

**`message` prop typing that makes this possible** (`src/frontend/types.ts` line 158):
```typescript
message?: string | React.ReactElement
```

**Confirmed rendering behavior** (`src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.tsx` lines 12-14, 39-42, 63-77):
```typescript
interface MessageBoxModalProps {
  title: string
  message: string | ReactElement
  onClose: () => void
  buttons: Array<ButtonOptions>
  type: DialogType
  className?: string
}
...
const message = useMemo(() => {
  if (typeof props.message === 'string') return decodeHTML(props.message)
  else return props.message
}, [props.message])
...
const getContent = () => {
  switch (props.type) {
    case 'ERROR': /* ... */
    default:
      return props.message
  }
}
```
Confirms a stateful React component can be passed directly as `message` and is rendered as-is (not string-decoded) for any non-`'ERROR'` dialog type. RESEARCH.md's "Pattern 6" mount example is the target call site shape:
```typescript
showDialogModal({
  showDialog: true,
  title: t('humbleKeys.claimWizardTitle', 'Claim this key'),
  message: <HumbleClaimWizard humbleKey={key} onDone={() => showDialogModal({ showDialog: false })} />,
  buttons: []
})
```

**IPC calls the wizard's internal steps need** (all existing preload functions, no new primitives beyond the 4 new handlers in `src/preload/api/humble.ts`):
```typescript
window.api.clipboardWriteText(revealedKey)          // existing (misc.ts)
window.api.openExternalUrl(`https://store.steampowered.com/account/registerkey?key=${encodeURIComponent(revealedKey)}`)  // existing (misc.ts)
```
Both are already consumed elsewhere in the app (`Spares/index.tsx` uses `openExternalUrl` for the static gift URL; Epic SID login uses clipboard) — no new IPC wiring needed for these two, only new call sites inside the new component.

---

### `src/frontend/App.tsx` (route config — likely no change needed)

**Analog:** existing `humble-keys` nested route table (lines 177-197):
```typescript
{
  path: 'humble-keys',
  lazy: makeLazyFunc(import('./screens/Humble/Keys')),
  children: [
    { index: true, element: <Navigate to="waiting" replace /> },
    { path: 'waiting', lazy: makeLazyFunc(import('./screens/Humble/Keys/Waiting')) },
    { path: 'spares', lazy: makeLazyFunc(import('./screens/Humble/Keys/Spares')) },
    { path: 'all', lazy: makeLazyFunc(import('./screens/Humble/Keys/All')) }
  ]
}
```
D-69's C2 block navigates to `/humble-keys/spares` — this child route already exists; the wizard's `navigate('/humble-keys/spares')` call needs no new route entry. Only touch this file if the planner decides the wizard itself needs a dedicated route (RESEARCH.md's recommendation is a modal, not a route, so this file likely needs zero changes).

---

## Shared Patterns

### Server-side re-validation of renderer-supplied identity (C2's enforcement mechanism)
**Source:** `src/backend/humble/ipc_handler.ts` lines 39-57 (`humbleSetOwnershipOverride`) and lines 64-83 (`humbleRecordGiftLinkOpened`)
**Apply to:** `humbleRevealKey`, `humbleMarkRedeemed`, `humbleUndoRedeemed` handlers
```typescript
addHandler('humbleSetOwnershipOverride', async (e, machineName) => {
  const targetKey = HumbleLibrary.getKeys().find((key) => key.machineName === machineName)
  if (!targetKey || targetKey.matchConfidence !== 'fuzzy') {
    logWarning(['Rejected ... for non-fuzzy machineName:', machineName], LogPrefix.Backend)
    return
  }
  HumbleLibrary.setOwnershipOverride(machineName)
})
```
Every write handler re-looks-up the target key server-side and checks its own precondition before mutating — never trusts the renderer's button-gating. This is D-69's literal mechanism (SC2 "hard block, not advisory").

### Write-ahead persistence before an irreversible external call
**Source:** `src/backend/humble/electronStores.ts` lines 28-36 (`humbleRevealedStore`'s own doc comment) + D-30 precedent
**Apply to:** the reveal orchestration in `library.ts` — persist the REVEALED flag AND the audit "attempt" record to disk BEFORE calling `adapter.ts`'s `revealKey()`, so a crash between "Humble accepted" and "we recorded that" can never silently regress state (SC4, PITFALLS.md Pitfall 1/8).

### Direct cache-projection patch outside any sync
**Source:** `src/backend/humble/library.ts` lines 308-331 (`recomputeOwnership`)
```typescript
for (const [gamekey, entry] of humbleLibraryStore.entries()) {
  const mutatedKeys = dedupRecomputeOwnership(entry.keys, steamGames, isOverridden)
  humbleLibraryStore.set(gamekey, { ...entry, keys: mutatedKeys })
}
sendFrontendMessage('humbleKeysUpdated', getKeys())
```
**Apply to:** every reveal/redeem/undo success path — `HumbleKey.state` only ever changes via `classifyOrder()` (full sync) otherwise; a single-key action outside a sync must read-modify-write the one affected entry and re-push `humbleKeysUpdated`, exactly like this function already does for ownership overlays.

### 403/429 cooldown reuse (D-79, no new cooldown machinery)
**Source:** `src/backend/humble/library.ts` lines 450-465 (check) and lines 492-505 (set) + `src/backend/humble/constants.ts` line 29 (`HUMBLE_COOLDOWN_MS`)
```typescript
const currentState = getSyncState()
if (currentState.cooldownUntil && currentState.cooldownUntil > Date.now()) {
  return { status: 'failed' }
}
...
setSyncState({ syncError: 'denied', cooldownUntil: Date.now() + HUMBLE_COOLDOWN_MS })
```
**Apply to:** a reveal handler that gets `access_denied` from `adapter.ts` should set/check the SAME `humbleSyncStore` cooldown state — no second cooldown store or duration constant.

### Redacted logging discipline (C4 — key values are secrets in logs, never on-screen)
**Source:** `src/backend/humble/adapter.ts` lines 178-184 (`mapAxiosError`), lines 201-228 (`describeSchemaFailure`)
**Apply to:** `revealKey()` and every log line in the reveal/redeem/undo orchestration — status/length/field-NAMES only, never a response body, cookie, or key value. Per D-73 this line is drawn at logs/IPC-debug, NOT the user's own modal screen (the modal deliberately shows the plaintext key).

### `showDialogModal` for confirmation + wizard UI
**Source:** `src/frontend/screens/Humble/Keys/Spares/index.tsx` lines 41-68 (`openGiftDialog`) + `src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.tsx` lines 39-42, 63-77
**Apply to:** the Claim button's dialog-opening call site in `Waiting/index.tsx`, and the `message: ReactElement` mechanism `HumbleClaimWizard` relies on.

### i18n via `t()` in the consumed namespace, semantic classNames
**Source:** every frontend file read above (e.g. `t('humbleKeys.giftOnHumble', 'Gift on Humble')`, `className="humbleKeyGiftButton"`)
**Apply to:** every new user-facing string in `HumbleClaimWizard` and the extended `HumbleKeyRow`/`Waiting` — follow the `humbleKeys.<camelCaseKey>` key convention and `humbleKey<PascalSuffix>`/`humbleKeys<PascalSuffix>` className convention already established.

## No Analog Found

None — every file this phase touches has at least a role-match analog already shipped in Phases 10-13. The one genuinely novel piece of engineering is the reveal/redeem HTTP contract itself (`adapter.ts`'s `revealKey()` body/headers), which has no in-repo precedent because this is the codebase's first write-style Humble call — RESEARCH.md's "Reveal Endpoint Contract" section (cross-verified against two external community tools) is the reference for that piece, not a codebase analog.

## Metadata

**Analog search scope:** `src/backend/humble/`, `src/frontend/screens/Humble/Keys/`, `src/preload/api/humble.ts`, `src/common/types/humble.ts`, `src/common/types/ipc.ts`, `src/common/humble/viewFilters.ts`, `src/frontend/App.tsx`, `src/frontend/components/UI/DialogHandler/`, `src/frontend/types.ts`
**Files scanned:** 19 (11 backend, 5 frontend screen/component, 2 common types, 1 preload)
**Pattern extraction date:** 2026-07-07
