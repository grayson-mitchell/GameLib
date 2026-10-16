# Phase 11: Library Sync + 5-State Key Model - Pattern Map

**Mapped:** 2026-07-05
**Files analyzed:** 12 (backend: 7 new/modified, frontend: 5 new/modified)
**Analogs found:** 10 / 12 (2 partial — new UI pattern, no prior grouped-list precedent)

Note: `11-UI-SPEC.md` already exists for this phase (produced by gsd-ui-researcher) and fully
specifies the frontend component inventory, file paths, colors, and copy. This file does not
duplicate that spec — it adds the concrete backend analogs the planner needs plus the specific
source excerpts (with line numbers) the UI-SPEC references only by name.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/backend/humble/classify.ts` (new) | utility (pure function) | transform | `src/backend/humble/adapter.ts` (`AdapterResult` discriminated union style) | partial (no pure-classifier precedent exists; style/error-shape borrowed) |
| `src/backend/humble/library.ts` (new) | service | CRUD + batch (sync) | `src/backend/storeManagers/steam/library.ts` (`init()`/`refresh()`) | exact (cache-then-sync, fail-soft, per-item commit) |
| `src/backend/humble/electronStores.ts` (extend) | config/store | CRUD | `src/backend/storeManagers/steam/electronStores.ts` | exact |
| `src/backend/humble/ipc_handler.ts` (extend) | controller (IPC) | request-response | `src/backend/humble/ipc_handler.ts` (itself, Phase 10 pattern) | exact |
| `src/backend/humble/user.ts` (`disconnect()` extend) | service | event-driven (teardown) | `src/backend/humble/user.ts` `disconnect()` (existing method, in-place extension) | exact |
| `src/backend/humble/constants.ts` (extend) | config | — | `src/backend/humble/constants.ts` (itself) | exact |
| `src/common/types/humble.ts` (extend) | model/types | — | `src/common/types/humble.ts` (itself) + `src/backend/storeManagers/steam/electronStores.ts` (`SteamMetadataCacheEntry` shape) | exact |
| `src/common/types/ipc.ts` (extend, `humble:*` channels) | model/types (IPC contract) | request-response | `src/common/types/ipc.ts` (existing `humble*` entries, lines 247-266, 468) | exact |
| `src/frontend/screens/Humble/Keys/index.tsx` (new) | component (screen) | request-response + streaming (progressive fill) | `src/frontend/screens/Library/components/LibraryHeader/index.tsx` (freshness indicator/refresh button) + `src/frontend/screens/WineManager/index.tsx` (page scaffold) | partial (no grouped-list screen precedent; layout is new per 11-UI-SPEC.md) |
| `src/frontend/screens/Humble/Keys/components/HumbleKeyRow` (new) | component | — | `src/frontend/screens/Library/components/GameCard/index.css` (`.gameCardUpdateBadge`/`.gameCardDelistedBadge`) | role-match (badge chrome reused, row itself is new) |
| `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx` (extend) | component (nav) | — | itself (existing `loggedIn`-gated `SidebarItem` entries) | exact |
| `src/frontend/state/GlobalState.tsx` + `ContextProvider.tsx` (extend `humble` slice) | store/provider | event-driven (IPC push) | itself (existing `humble` slice, `humbleLogin`/`humbleDisconnect`/`handleHumbleAuthState`) + Steam's `pushGameToLibrary` push pattern | exact |

## Pattern Assignments

### `src/backend/humble/library.ts` (service, CRUD + batch sync)

**Analog:** `src/backend/storeManagers/steam/library.ts`

**Cache-then-sync `init()` pattern** (lines 47-97):
```typescript
async init(): Promise<void> {
  const cached = steamLibraryStore.get('games', [])
  if (cached.length) {
    library.clear()
    cached.forEach((g) => {
      library.set(g.app_name, g)
      sendFrontendMessage('pushGameToLibrary', g)
    })
    logInfo(`Steam: loaded ${cached.length} games from cache`, LogPrefix.Steam)
  }
  // ... resume side-effects wrapped in try/catch so a scan failure never
  // blocks startup ...
  if (SteamUser.isLoggedIn()) {
    runOnceWhenOnline(() => this.refresh())
  }
}
```
Phase 11's `library.ts` should expose an equivalent `loadCached()` (sync, reads
`humbleLibraryStore`, pushes a `humbleKeysUpdated` message) called at startup/mount, and a
separate `sync()` (async, network) triggered by D-23's three triggers (startup after health
check, post-login, manual refresh) — mirroring the `init()` vs `refresh()` split exactly.

**Fail-soft cache fallback on fetch failure** (lines 152-186):
```typescript
async refresh(): Promise<ExecResult | null> {
  const connected = await SteamUser.ensureConnected()
  const client = SteamUser.getClient()
  if (!connected || !client || !client.steamID) {
    logWarning('Steam client not ready, skipping library refresh', LogPrefix.Steam)
    return null
  }
  try {
    const result = await client.getUserOwnedApps(client.steamID, { includePlayedFreeGames: true })
    ownedApps = result.apps
  } catch (err) {
    logError(['Steam getUserOwnedApps failed:', err], LogPrefix.Steam)
    // Offline / CM-unreachable fallback — serve cached library (D-09)
    const cached = steamLibraryStore.get('games', [])
    cached.forEach((g) => sendFrontendMessage('pushGameToLibrary', g))
    return { stdout: '', stderr: String(err) }
  }
  // ...
}
```
Phase 11's `sync()` mirrors this exactly for the D-31/D-34 fail-soft path: on
`access_denied`/`schema_error` from `getGamekeys`, do NOT clear `humbleLibraryStore` — leave it
as-is (it already reflects the last-good state per Pitfall 4 of RESEARCH.md), set `syncError` in
the new sync-state store, and push whatever's cached so the frontend renders it with the banner.
`session_expired` must NOT take this path — bail out entirely and let Phase 10's D-08/D-09 expiry
flow own it (see Anti-Patterns in RESEARCH.md, "Treating access_denied and session_expired the
same way").

**Persist-and-timestamp pattern** (lines 237-240):
```typescript
steamLibraryStore.set('games', Array.from(library.values()))
steamSyncStore.set('syncedAt', Date.now())
```
Phase 11 mirrors this with `humbleLibraryStore.set(gamekey, entry)` **per order, on each
resolve** (not batched — D-34) and `humbleSyncStore.set('syncedAt', Date.now())` once per
completed sync attempt (success or partial).

**Error handling pattern:** every network call in `steam/library.ts` is wrapped in try/catch with
`logError`/`logWarning` + `LogPrefix.Steam`; Phase 11 must use `LogPrefix.Backend` (the prefix
already used throughout `humble/adapter.ts` and `humble/user.ts`) for consistency with the rest
of the Humble domain, not `LogPrefix.Steam`.

**New pattern this file must add (no existing analog — write from RESEARCH.md directly):**
the bounded-concurrency pool (RESEARCH.md Pattern 3) and the new/non-terminal/frozen
three-bucket partition (RESEARCH.md Pattern 3 + Pitfall 3) have no precedent anywhere in the
codebase — Steam's `refresh()` fetches the whole owned-apps list in one call, no per-item
concurrency limiting exists yet in this project. Write these as new, small, pure-where-possible
helpers per RESEARCH.md's illustrative code (already vetted against the constraint that `p-limit`
is ESM-only and should not be added as a dependency).

---

### `src/backend/humble/classify.ts` (utility, pure transform — new file, no direct analog)

**Analog (style only):** `src/backend/humble/adapter.ts`'s `AdapterResult<T>` discriminated
union and its treatment of malformed input.

**Discriminated-result style to mirror** (`adapter.ts` lines 12-16 of `common/types/humble.ts`):
```typescript
export type AdapterResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'session_expired' }
  | { status: 'access_denied' }
  | { status: 'schema_error'; raw: unknown }
```
`classify.ts`'s `HumbleKeyState` union (`'UNPICKED' | 'UNREVEALED' | 'REVEALED' | 'REDEEMED' |
'UNREDEEMABLE'`) should follow the same string-literal-union style already established here, and
`classifyOrder()` should return an array of typed key records rather than throwing — mirroring
`adapter.ts`'s discipline of "every outcome is a typed value, never a thrown blind cast" (see
`adapter.ts` lines 8-16 JSDoc comment).

**Schema permissiveness precedent to extend, not replace** (`adapter.ts` lines 27-40):
```typescript
const OrderDetailSchema = z
  .object({
    gamekey: z.string().optional(),
    tpkd_dict: z
      .object({ all_tpks: z.array(z.unknown()).optional() })
      .passthrough()
      .optional()
  })
  .passthrough()
```
Per CONTEXT.md's Claude's Discretion note, tighten the `all_tpks` element schema (add
`redeemed_key_value: z.string().nullish()`, `expiration: z.string().nullish()`, etc.) but keep
`.passthrough()` at every level — a schema_error on one order must never fail the whole sync
(RESEARCH.md Pitfall 5 / Pattern 2). Per Open Question 2, `redeemed_key_value` should be typed
`z.string().nullish()` (not `.optional()` alone) to tolerate `null` vs `undefined` ambiguity.

**No prior pure-classification-function precedent exists in the codebase** — this is genuinely
new domain logic. Write `classifyTpk()`/`classifyOrder()` exactly per RESEARCH.md's Pattern 4
illustrative code (precedence: expiration → UNREDEEMABLE beats all; `redeemed_key_value` present
→ REDEEMED beats local flag; local REVEALED flag → REVEALED; else UNREVEALED). Keep it a pure
function — no I/O, no electron-store import inside `classifyTpk()` itself — so it is trivially
unit-testable (see `11-RESEARCH.md` Validation Architecture, `classify.test.ts`).

---

### `src/backend/humble/electronStores.ts` (config/store, extend)

**Analog:** `src/backend/storeManagers/steam/electronStores.ts` (exact structural precedent) and
the existing `src/backend/humble/electronStores.ts` (Phase 10 scaffold, to extend in place).

**Current state of the file to extend** (`humble/electronStores.ts`, full file, 9 lines):
```typescript
import { TypeCheckedStoreBackend } from '../electron_store'

// Phase 10 scope: only configStore. Do NOT add humbleLibraryStore /
// humbleAuditStore here — those are Phase 11/14 scope (see 10-PATTERNS.md).
const configStore = new TypeCheckedStoreBackend('humbleConfigStore', {
  cwd: 'humble_store'
})

export { configStore }
```

**CacheStore instantiation pattern to copy** (`steam/electronStores.ts` lines 1-24):
```typescript
import { TypeCheckedStoreBackend } from '../../electron_store'
import CacheStore from '../../cache'
import { GameInfo, ExtraInfo } from 'common/types'

const configStore = new TypeCheckedStoreBackend('steamConfigStore', { cwd: 'steam_store' })

// ── LIB-01/02/03: Persistent library cache (indefinite lifespan per D-05) ──
const steamLibraryStore = new CacheStore<GameInfo[], 'games'>('steam_library', null)

// ── LIB-04: Per-game metadata cache (indefinite lifespan per D-05) ──────────
const steamMetadataStore = new CacheStore<SteamMetadataCacheEntry>('steam_metadata', null)

// ── Stale-indicator: last successful sync epoch millis (plan 05) ───────────
const steamSyncStore = new CacheStore<number, 'syncedAt'>('steam_sync', null)
```
Phase 11 mirrors this exactly, per RESEARCH.md's "Extending electronStores.ts" code example:
```typescript
import { TypeCheckedStoreBackend } from '../electron_store'
import CacheStore from '../cache'

const configStore = new TypeCheckedStoreBackend('humbleConfigStore', { cwd: 'humble_store' })

// Wiped by HumbleUser.disconnect() alongside configStore.
const humbleLibraryStore = new CacheStore<HumbleOrderCacheEntry, string>('humble_library', null)
const humbleSyncStore = new CacheStore<number, 'syncedAt'>('humble_sync', null)

// D-04/D-30: NEVER cleared by disconnect(). Separate store instance/file on
// disk from the two stores above for exactly that reason.
const humbleRevealedStore = new CacheStore<{ revealedAt: number }, string>('humble_revealed', null)

export { configStore, humbleLibraryStore, humbleSyncStore, humbleRevealedStore }
```

**`CacheStore` API to use** (`src/backend/cache.ts`, full 118-line file, key methods lines 49-108):
`get(key, fallback?)`, `set(key, value)` (auto-timestamps), `delete(key)`, `clear()`, `has(key)`,
`entries()` (returns `[key, value][]` excluding internal `__timestamp.*` keys — useful for the
new/non-terminal/frozen partition scan in `library.ts`), `commit()` (only relevant if
`use_in_memory()` batch mode is used — not needed for Phase 11's per-order commit style).
`max_value_lifespan` must be passed as `null` (indefinite) for all three new stores, matching
Steam's `steamLibraryStore`/`steamSyncStore` — HSYNC-01's "cache-aggressive" requirement.

---

### `src/backend/humble/ipc_handler.ts` (controller, request-response, extend)

**Analog:** the file itself (Phase 10 pattern, to extend in place — full 36-line file already
read above).

**Handler registration pattern to copy** (lines 19-36):
```typescript
export function registerHumbleIpcHandlers(): void {
  addHandler('humbleStartLogin', async () => HumbleUser.startLogin())
  addHandler('humbleGetUserInfo', () => HumbleUser.getUserDetails())
  addHandler('humbleCheckHealth', () => HumbleUser.checkHealthAndFlagExpiry())
  // ...
  addListener('humbleDisconnect', () => {
    HumbleUser.disconnect().catch((err) =>
      logWarning(['Humble disconnect failed:', err], LogPrefix.Backend)
    )
  })
}
```
Add `humble:sync`-style handlers the same way — `addHandler('humbleSync', async () =>
HumbleLibrary.sync())`, `addHandler('humbleGetKeys', () => HumbleLibrary.getKeys())`,
`addHandler('humbleGetSyncState', () => HumbleLibrary.getSyncState())` — each a thin delegation
to the new `library.ts` module, with the same "never let a promise rejection become an unhandled
rejection in main" discipline shown in the `humbleDisconnect` listener above (`.catch()` +
`logWarning` for any fire-and-forget listener; `addHandler` calls that return a Promise are
awaited by the IPC layer itself, per existing `humbleStartLogin`/`humbleReconnect`/
`humbleCheckHealth` precedent).

**Anti-pattern to avoid (RESEARCH.md, WR-09 finding):** do NOT expose
`humbleLibraryStore`/`humbleRevealedStore` via the generic frontend `storeGet` bridge (the
mechanism Phase 10's WR-09 flagged for `humbleConfigStore`). Every read must go through a
dedicated typed handler here that returns a display-safe projection (no raw
`redeemed_key_value`, only a derived boolean).

---

### `src/backend/humble/user.ts` (`disconnect()`, extend in place)

**Analog:** the method itself — extend, don't rebuild (lines 440-472, full method already read
above).

**Existing disconnect structure to extend**:
```typescript
static async disconnect(): Promise<void> {
  configStore.clear()
  // ... best-effort partition wipe steps, each individually try/caught ...
  // D-04: does NOT touch any audit-log/REVEALED-flag store — none exists
  // yet in Phase 10; this is forward policy for Phase 11/14.
}
```
Phase 11 must add, right after `configStore.clear()` (or alongside the partition wipe steps):
```typescript
humbleLibraryStore.clear()
humbleSyncStore.clear()
// D-04/D-30: humbleRevealedStore is intentionally NOT cleared here — it
// survives disconnect. See src/backend/humble/electronStores.ts.
```
Update the existing comment at the end of the method (currently "none exists yet in Phase 10;
this is forward policy for Phase 11/14") to reflect that the store now exists and is
deliberately skipped — do not delete the comment, extend it, per the file's own established
practice of leaving forward-looking rationale comments in place (see RESEARCH.md Pitfall 1's
explicit instruction to mirror this exact comment style).

---

### `src/common/types/humble.ts` (model/types, extend)

**Analog:** the file itself (Phase 10 scaffold, 74 lines, already read above) — same
discriminated-union and JSDoc-per-type style to continue.

**Existing style to match** (lines 12-16, 22-24, 31-35):
```typescript
export type AdapterResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'session_expired' }
  | { status: 'access_denied' }
  | { status: 'schema_error'; raw: unknown }

export interface HumbleUserData {
  username: string
}

export interface HumbleAuthState {
  isLoggedIn: boolean
  username?: string
  expired?: boolean
}
```
Add `HumbleKeyState` (string-literal union, 5 members), `HumbleKey` (the per-row display shape:
`gamekey`, `state`, `title`, `platform`, `expiration: string | null`, `origin` label — never a raw
key value, per RESEARCH.md's Anti-Pattern on `redeemed_key_value`), `HumbleOrderCacheEntry` (the
`humbleLibraryStore` value shape — must include an `allTerminal: boolean` flag per Pitfall 3's
explicit-membership partition requirement, not just an implicit `every()` check), and
`HumbleSyncState` (`{ syncedAt: number | null; syncError: 'none' | 'denied' | 'network' |
'partial'; cooldownUntil?: number }`).

**Cache-entry-shape precedent to follow** (`steam/electronStores.ts` lines 25-42,
`SteamMetadataCacheEntry`):
```typescript
export interface SteamMetadataCacheEntry {
  art_cover: string
  art_square: string
  extra: ExtraInfo
  is_mac_native?: boolean
  is_linux_native?: boolean
  is_delisted?: boolean
  platformsCaptured?: boolean
}
```
Note the convention: booleans that gate cache-invalidation/self-healing logic are optional
(`?`) so `undefined` vs `false` can be distinguished across a schema migration — apply the same
convention to `HumbleOrderCacheEntry.allTerminal` if a migration concern exists, otherwise a
required boolean is fine since this is a new store with no pre-existing shape to migrate from.

---

### `src/common/types/ipc.ts` (extend `AsyncIPCFunctions`/`FrontendMessages`)

**Analog:** the file's existing Humble entries (already present, lines 247-266 and 468).

**`AsyncIPCFunctions` entries to mirror** (lines 247-266):
```typescript
humbleStartLogin: () => Promise<{ status: 'done' | 'waiting' | 'error'; username?: string }>
humbleGetUserInfo: () => Promise<HumbleUserData | undefined>
humbleCheckHealth: () => Promise<void>
humbleRunValidation: () => Promise<HumbleValidationReport>
```
Add `humbleSync: () => Promise<{ status: 'ok' | 'partial' | 'failed' }>`, `humbleGetKeys: () =>
Promise<HumbleKey[]>`, `humbleGetSyncState: () => Promise<HumbleSyncState>` in this same block,
importing `HumbleKey`/`HumbleSyncState` from `common/types/humble` alongside the existing
`HumbleUserData`/`HumbleValidationReport` imports (see line 58's import block).

**`FrontendMessages` entry to mirror** (line 468, with its JSDoc comment style):
```typescript
// Plan 02 (Phase 10): pushed by HumbleUser.checkHealthAndFlagExpiry() on a
// startup/401 expiry detection. MUST NOT include the session cookie
// (Pitfall 4 / T-10-05) — HumbleAuthState is structurally cookie-free.
humbleAuthState: (state: HumbleAuthState) => void
```
Add `humbleKeysUpdated: (keys: HumbleKey[]) => void` and `humbleSyncProgress: (progress: {
done: number; total: number }) => void` (D-26 progressive fill) in the same style — one-line
JSDoc explaining what fires it and any redaction constraint.

---

## Frontend Patterns

Full visual/layout/copy contract is in `11-UI-SPEC.md` — this section supplies the concrete
source excerpts that spec references only by name, plus the state-wiring analog it does not
cover.

### `src/frontend/screens/Humble/Keys/index.tsx` (new screen)

**Analog (freshness indicator + refresh button):** `src/frontend/screens/Library/components/LibraryHeader/index.tsx`

**`formatRelativeTime` + sync-state read pattern** (lines 17-44):
```typescript
function formatRelativeTime(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  const hours = Math.floor(ms / 3600000)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.floor(ms / 86400000)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}
// ...
const [syncedAt, setSyncedAt] = useState<number | null>(null)
useEffect(() => {
  window.api.getSteamSyncedAt().then((ts) => setSyncedAt(ts))
}, [])
```
Per RESEARCH.md's "Don't Hand-Roll" table, extract this into a shared helper if reused rather
than copy-pasting a second private `formatRelativeTime` — but if extraction is out of scope for
this phase's plan boundaries, copying it verbatim (same 4-line-bucket logic) is the fallback,
matching existing project precedent of small private formatters per screen.

**Refresh button + spinner pattern** (lines 59-64, 93-110):
```typescript
const isSteamSyncing = refreshing && refreshingInTheBackground
// ...
<button
  className={classNames('steamRefreshButton', { spinning: refreshing })}
  title={t('steam.refresh', 'Refresh Steam Library')}
  disabled={refreshing}
  onClick={() => window.api.refreshLibrary('steam')}
>
  <FontAwesomeIcon icon={faSyncAlt} className={classNames({ 'fa-spin': refreshing })} />
</button>
```
11-UI-SPEC.md's "Manual refresh button" section explicitly directs cloning this
structure/behavior for `.humbleKeys` (icon-only `faSyncAlt`, spin while syncing, disabled during
403 cooldown). Reuse `classNames` the same way; gate `disabled` on both `refreshing` (D-23) and
the new cooldown state (D-33), not `refreshing` alone.

**Stale/banner indicator pattern** (lines 61-64, 86-92):
```typescript
const showStaleIndicator = connectivity.status !== 'online' && syncedAt !== null
const staleTime = syncedAt !== null ? formatRelativeTime(Date.now() - syncedAt) : ''
// ...
{showStaleIndicator && (
  <span className="steamStaleIndicator">
    {t('steam.lastSynced', 'Steam library last synced {{time}} ago', { time: staleTime })}
  </span>
)}
```
Phase 11's freshness indicator (D-32) is **always** shown (not gated on offline connectivity like
Steam's), per 11-UI-SPEC.md's Page Layout — the conditional-render pattern still applies but the
condition is `syncedAt !== null` alone, dropping the `connectivity.status !== 'online'` check.

**Analog (page scaffold: loading state, lazy-loaded item component):** `src/frontend/screens/WineManager/index.tsx`
```typescript
const WineItem = lazy(async () => import('frontend/screens/WineManager/components/WineItem'))
// ...
const [wineVersions, setWineVersions] = useState<WineVersionInfo[]>(getWineVersions(repository.type))
```
Use the same `React.lazy` pattern for `HumbleKeyGroup`/`HumbleKeyRow` if list size warrants
code-splitting (optional — WineManager does this because `WineItem` is heavy; `HumbleKeyRow` is
much lighter per 11-UI-SPEC.md's "strictly read-only" contract, so plain imports are also
acceptable).

**No analog exists** for the state-grouped flat list itself (grouping by 5-state enum,
expiring-soonest-first sort within group) — this is a new UI pattern for the project. Build it
per `11-UI-SPEC.md`'s Page Layout and Component Inventory sections directly; do not force-fit an
existing list component (`GameCard`'s grid layout, `Discounts`' paginated grid) onto this
flat/grouped shape.

### `HumbleKeyRow` / state badge

**Analog:** `src/frontend/screens/Library/components/GameCard/index.css`, `.gameCardUpdateBadge`
(lines 53-67) and `.gameCardDelistedBadge` (lines 202-209+):
```css
.gameCard .gameCardUpdateBadge {
  position: absolute;
  font-weight: var(--semibold);
  background: var(--status-info);
  padding: var(--space-3xs) var(--space-2xs);
  border-radius: var(--space-3xs);
  color: var(--neutral-01);
  font-size: var(--text-sm);
}
```
11-UI-SPEC.md's 5-State Badge Color Mapping table already assigns each state's `background`
token (`--status-default`/`--status-info`/`--status-warning`/`--status-success`/
`--status-danger`) — reuse this exact padding/border-radius/font-size/color declaration set,
swapping only `background` per state via a `.humbleKeyStateBadge--{state}` modifier class, per
the UI-SPEC's Component Inventory row for `HumbleKeyStateBadge`.

### Fail-soft banner

**Analog:** `src/frontend/components/UI/WarningMessage/index.tsx` (full 19-line file, read
above):
```tsx
export default function WarningMessage({ children, className }: Props) {
  return (
    <div className={['WarningMessage', className].filter(Boolean).join(' ')}>
      <FontAwesomeIcon icon={faExclamationTriangle} color="yellow" />
      <div>{children}</div>
    </div>
  )
}
```
Reuse this component directly with a new `humbleSyncBanner` className passed in (per
11-UI-SPEC.md's Color section, this modifier overrides `background`/`color` to orange/dark —
`WarningMessage` already accepts an optional `className` for exactly this kind of override, no
component change needed).

### `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx` (extend)

**Analog:** the file itself — existing `loggedIn`-gated conditional item pattern (lines 259-266):
```tsx
{loggedIn && (
  <SidebarItem
    url="/login"
    icon={faUserAlt}
    label={t('userselector.manageaccounts', 'Manage Accounts')}
    dataTour="sidebar-manage-accounts"
  />
)}
```
And the platform-conditional pattern used for Wine Manager (lines 250-257):
```tsx
{!isWin && (
  <SidebarItem
    url="/wine-manager"
    icon={faWineGlass}
    label={t('wine.manager.link', 'Wine Manager')}
    dataTour="sidebar-wine"
  />
)}
```
Per `11-UI-SPEC.md`'s explicit code block, add immediately after the Stores
`SidebarItemWithSubmenu` block (around line 173) and before the `/discounts` item (line 174):
```tsx
{humble?.isLoggedIn && (
  <SidebarItem
    url="/humble-keys"
    icon={faKey}
    label={t('sidebar.humbleKeys', 'Humble Keys')}
    dataTour="sidebar-humble-keys"
  />
)}
```
Requires importing `faKey` into the existing FontAwesome import block (lines 1-14) and pulling
`humble` out of the `useContext(ContextProvider)` destructure (line 37-45, which currently only
pulls `amazon, epic, gog, zoom, platform, refreshLibrary, handleExternalLinkDialog`).

### `src/frontend/state/GlobalState.tsx` + `ContextProvider.tsx` (extend `humble` slice)

**Analog:** the existing `humble` slice itself (already Phase 10 scope, to extend not rebuild).

**State initialization pattern** (`GlobalState.tsx` lines 232-246):
```typescript
humble: {
  isLoggedIn: humbleConfigStore.get_nodefault('isLoggedIn'),
  username: humbleConfigStore.get_nodefault('userData')?.username,
  expired: humbleConfigStore.get_nodefault('expired') ?? false,
  encryptionDegraded: humbleConfigStore.get_nodefault('encryptionDegraded')
},
```
Add `keys: HumbleKey[]`, `syncedAt: number | null`, `syncError: HumbleSyncState['syncError']`,
`syncing: boolean` fields here — seeded to safe defaults (`[]`, `null`, `'none'`, `false`), NOT
read from `humbleConfigStore` (the new data lives in `humbleLibraryStore`/`humbleSyncStore`,
fetched via the new `humbleGetKeys`/`humbleGetSyncState` IPC calls on mount, not synchronously
read from a config store the way `configStore.get_nodefault` is used for auth flags).

**IPC push listener pattern** (`GlobalState.tsx` lines 1042-1054):
```typescript
window.api.handleHumbleAuthState((e, humbleState) => {
  this.setState((prevState: StateProps) => ({
    humble: {
      ...prevState.humble,
      isLoggedIn: humbleState.isLoggedIn,
      username: humbleState.username ?? prevState.humble.username,
      expired: !!humbleState.expired
    }
  }))
})
```
Add an equivalent `window.api.handleHumbleKeysUpdated((e, keys) => this.setState(prevState => ({
humble: { ...prevState.humble, keys } })))` and `handleHumbleSyncProgress` listener alongside
this one, using the identical spread-and-merge `setState` shape.

**Startup trigger pattern** (`GlobalState.tsx` lines 1056-1064):
```typescript
if (this.state.humble.isLoggedIn) {
  void window.api.humbleCheckHealth()
}
```
Per D-23, the sync trigger must run **after** this health check resolves (not in parallel) —
chain it: `if (this.state.humble.isLoggedIn) { void window.api.humbleCheckHealth().then(() =>
window.api.humbleSync()) }`, since a session already known-expired must not attempt a sync
(RESEARCH.md Anti-Pattern: "library.ts should not attempt a sync at all if the session is
already known-expired").

**Default/empty shape in `ContextProvider.tsx`** (lines 39-42):
```typescript
humble: {
  login: async () => Promise.resolve(''),
  logout: async () => Promise.resolve()
},
```
Extend with `keys: [], syncedAt: null, syncError: 'none', syncing: false` defaults, matching the
existing pattern of every other slice's context-default shape in this file (e.g. `steam: {
library: [], login: ..., logout: ... }` at lines 34-38).

## Shared Patterns

### C5 discipline / typed adapter results
**Source:** `src/backend/humble/adapter.ts` lines 8-16 (JSDoc), `common/types/humble.ts` lines
12-16 (`AdapterResult<T>`)
**Apply to:** `library.ts`, `classify.ts` — every call into `adapter.ts` must be handled via the
existing 4-way status switch (`ok`/`session_expired`/`access_denied`/`schema_error`); never
introduce a 5th ad-hoc error path.

### Redacted logging discipline
**Source:** `src/backend/humble/adapter.ts` lines 121-162 (`describeSchemaFailure`), `user.ts`
throughout (every `logWarning`/`logError` call passes status/message only, never a cookie or
response body)
**Apply to:** `library.ts`, `classify.ts` — any new logging (e.g. "sync aborted", "order
schema_error, keeping cached entry") must log gamekey identifiers and status strings only, never
a raw order/tpk object or key value (RESEARCH.md Security Domain V7).

### `CacheStore` two-store split (library cache vs. survives-disconnect flag)
**Source:** `src/backend/storeManagers/steam/electronStores.ts` (CacheStore usage precedent) +
`src/backend/humble/user.ts` lines 469-470 (forward-policy comment) + RESEARCH.md Pitfall 1
**Apply to:** `electronStores.ts` (creates the split), `user.ts` `disconnect()` (must clear
`humbleLibraryStore`/`humbleSyncStore` but explicitly skip `humbleRevealedStore`), `classify.ts`
(reads `humbleRevealedStore` as the only carried-forward local state — never merges the previous
library-cache record forward, per Pitfall 5).

### IPC handler registration via `addHandler`/`addListener`
**Source:** `src/backend/humble/ipc_handler.ts` (full file, exact pattern to extend)
**Apply to:** all new `humble:*`-domain channels — register in `registerHumbleIpcHandlers()`,
never inline in `main.ts` (the one exception, `humbleRunValidation`, is dev-only and explicitly
NOT part of this pattern per the file's own header comment).

### i18n consumed-namespace discipline (Phase 10 WR-08 lesson)
**Source:** `11-CONTEXT.md` D-31/Claude's Discretion note, `11-UI-SPEC.md` Copywriting Contract
(new `humbleKeys.*` namespace)
**Apply to:** `src/frontend/screens/Humble/Keys/index.tsx` and its child components — every new
string uses a `humbleKeys.*` key in `public/locales/en/translation.json`, consumed only by this
screen, mirroring the existing `steam.*` (consumed by `LibraryHeader`) and `login.*` (consumed by
`screens/Login`) namespace-per-consumer convention.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Bounded-concurrency pool helper inside `library.ts` | utility | batch | No prior concurrency-limiting code exists in this codebase; Steam's `refresh()` fetches its whole owned-apps list in a single unbounded call. Build per RESEARCH.md Pattern 3's illustrative `runBounded()` code — no npm dependency (see RESEARCH.md "Don't Hand-Roll" / Alternatives Considered on `p-limit`'s ESM-only constraint). |
| Three-bucket gamekey partition (new/non-terminal/frozen) inside `library.ts` | utility | transform | No prior "skip-terminal" cache partitioning exists anywhere in the codebase (Steam always refetches everything). Build per RESEARCH.md Pitfall 3's explicit-membership-check guidance — do not rely on `Array.every()` alone. |
| State-grouped flat list layout (`HumbleKeys` screen body) | component | request-response + streaming | No existing screen groups a flat list by a 5-value enum with per-group sort. `Discounts` uses a paginated grid; `GameCard` uses a flat grid, no grouping. Build per `11-UI-SPEC.md`'s Page Layout section directly — that document is the authoritative visual/behavioral spec for this component, this PATTERNS.md defers to it. |

## Metadata

**Analog search scope:** `src/backend/humble/`, `src/backend/storeManagers/steam/`,
`src/backend/cache.ts`, `src/common/types/`, `src/frontend/state/`,
`src/frontend/components/UI/Sidebar/`, `src/frontend/components/UI/WarningMessage/`,
`src/frontend/screens/Library/components/`, `src/frontend/screens/WineManager/`,
`src/frontend/screens/Discounts/`
**Files scanned (read in full or targeted range):** `humble/adapter.ts`, `humble/user.ts`,
`humble/electronStores.ts`, `humble/ipc_handler.ts`, `humble/constants.ts`,
`common/types/humble.ts`, `common/types/ipc.ts` (targeted ranges), `storeManagers/steam/
electronStores.ts`, `storeManagers/steam/library.ts` (targeted ranges), `backend/cache.ts`,
`frontend/state/GlobalState.tsx` (targeted ranges), `frontend/state/ContextProvider.tsx`
(targeted ranges), `Sidebar/components/SidebarLinks/index.tsx`, `Library/components/
LibraryHeader/index.tsx`, `Library/components/GameCard/index.css` (targeted ranges), `UI/
WarningMessage/index.tsx`, `WineManager/index.tsx` (targeted range)
**Pattern extraction date:** 2026-07-05
