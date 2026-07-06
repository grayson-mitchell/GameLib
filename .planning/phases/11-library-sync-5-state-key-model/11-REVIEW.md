---
phase: 11-library-sync-5-state-key-model
reviewed: 2026-07-06T08:50:11Z
depth: standard
files_reviewed: 32
files_reviewed_list:
  - public/locales/en/translation.json
  - src/backend/__tests__/cache.test.ts
  - src/backend/cache.ts
  - src/backend/humble/__tests__/adapter.test.ts
  - src/backend/humble/__tests__/classify.test.ts
  - src/backend/humble/__tests__/expirationDisplay.test.ts
  - src/backend/humble/__tests__/fixtures/tpks.ts
  - src/backend/humble/__tests__/groupKeys.test.ts
  - src/backend/humble/__tests__/library.realstore.test.ts
  - src/backend/humble/__tests__/library.test.ts
  - src/backend/humble/__tests__/user.test.ts
  - src/backend/humble/adapter.ts
  - src/backend/humble/classify.ts
  - src/backend/humble/constants.ts
  - src/backend/humble/electronStores.ts
  - src/backend/humble/ipc_handler.ts
  - src/backend/humble/library.ts
  - src/backend/humble/user.ts
  - src/common/humble/expirationDisplay.ts
  - src/common/humble/groupKeys.ts
  - src/common/types/humble.ts
  - src/common/types/ipc.ts
  - src/frontend/App.tsx
  - src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleKeyGroup/index.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
  - src/frontend/screens/Humble/Keys/index.css
  - src/frontend/screens/Humble/Keys/index.tsx
  - src/frontend/state/ContextProvider.tsx
  - src/frontend/state/GlobalState.tsx
  - src/frontend/types.ts
  - src/preload/api/humble.ts
findings:
  critical: 1
  warning: 10
  info: 7
  total: 18
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-07-06T08:50:11Z
**Depth:** standard
**Files Reviewed:** 32
**Status:** issues_found

## Summary

Reviewed the Phase 11 Humble library-sync + 5-state key classification implementation (backend sync orchestration, pure classification, stores, IPC surface, Keys screen, global renderer state) plus all supporting tests.

**Security invariants verified as HOLDING:**

- **Cookie / `redeemed_key_val` never reach a log line.** All logging in `adapter.ts`, `classify.ts`, `library.ts`, and `user.ts` is structural (field names, counts, gamekey, status, zod issue paths). Caught error objects that could embed the Cookie header (AxiosError carries it in `err.config.headers`) are safe in practice because `src/backend/logger/formatter.ts:46` stringifies `Error` instances as `stack ?? message` only — the config object is never serialized. Tests assert non-leakage on every path exercised.
- **All Humble HTTP goes through `adapter.ts`.** `library.ts` and `user.ts` call only `getGamekeys`/`getOrderDetail`/`getAccountIdentity`; no stray axios/fetch usage in reviewed files.
- **`humbleRevealedStore` survives disconnect while library/sync stores are wiped** — in the *sequential* case (`user.ts:445-451` + explicit exclusion comment, asserted by `user.test.ts:633-639`). However, the wipe is defeated by an in-flight sync race — see **CR-01**, which is the one blocking finding.

The remaining findings are robustness gaps (a documented "never throws" contract that can in fact throw and reach the renderer as an unhandled rejection, an overflow throw in `extractExpiration`, an unbounded login poll loop) and smaller UI/quality defects.

## Critical Issues

### CR-01: Disconnect does not fence the in-flight sync — wiped library/sync stores are silently repopulated, enabling stale/cross-account key inventory

**File:** `src/backend/humble/user.ts:440-482` (disconnect), `src/backend/humble/library.ts:126-133, 465-479` (commits)

**Issue:** `HumbleUser.disconnect()` clears `configStore`, `humbleLibraryStore`, and `humbleSyncStore`, but does nothing to cancel or invalidate a sync that is already running. `runSync()` captured the cookie in a local variable at start (`library.ts:312`), so after disconnect:

1. In-flight and still-to-be-dispatched `fetchAndCommitOrder` workers keep making authenticated Humble requests with the removed credential and keep calling `humbleLibraryStore.set(gamekey, entry)` — **repopulating the store the disconnect just wiped**.
2. The sync's terminal `setSyncState({ syncedAt: Date.now(), ... })` repopulates `humbleSyncStore`.
3. Each commit pushes `humbleKeysUpdated` to the renderer, overwriting the `keys: []` the renderer just set in `GlobalState.humbleDisconnect`.

The window is realistic: syncs of a modest library (25+ orders at concurrency 3, 15s timeout per request) run for seconds to minutes, and disconnect is user-triggered at any time. Consequence: the HSYNC-02/D-04 invariant "a stale key inventory must never survive a disconnect" is violated, and if a *different* Humble account logs in afterwards, the previous account's cached orders (whose gamekeys are not in the new account's order list, so they are never re-fetched or pruned) are flattened into `getKeys()` and displayed to the new user — cross-account inventory bleed on a shared machine.

**Fix:** Add a generation/epoch fence in `library.ts` and bump it from `disconnect()` before the wipe:

```ts
// library.ts
let storeGeneration = 0
function invalidate(): void {
  storeGeneration += 1
}
export const HumbleLibrary = { loadCached, sync, getKeys, getSyncState, invalidate }

async function runSync(): Promise<SyncOutcome> {
  const generation = storeGeneration
  ...
  // in fetchAndCommitOrder's commit path and in the terminal setSyncState:
  if (generation !== storeGeneration) {
    return { gamekey, outcome: 'transient' } // disconnected mid-sync: drop, never commit
  }
  humbleLibraryStore.set(gamekey, entry)
```

```ts
// user.ts disconnect(), before the wipes:
HumbleLibrary.invalidate()
configStore.clear()
humbleLibraryStore.clear()
humbleSyncStore.clear()
```

Also skip the `humbleKeysUpdated`/`humbleSyncStateChanged` pushes when the generation is stale. (Alternatively: track and await/abort `syncInFlight` from `disconnect()`, but the fence is simpler and also stops the post-disconnect network traffic at the next dispatch.)

## Warnings

### WR-01: `humbleSync` violates its "never throws" IPC contract — unexpected rejections reach fire-and-forget renderer callers as unhandled promise rejections

**File:** `src/backend/humble/library.ts:297-309, 405-418`; `src/common/types/ipc.ts:269-272`; `src/frontend/state/GlobalState.tsx:766, 1128`; `src/frontend/screens/Humble/Keys/index.tsx:126`

**Issue:** `common/types/ipc.ts` documents `humbleSync: ... Returns the overall outcome — never throws`. But `runSync()` only guards the two adapter calls. The `runBounded` worker callback (`library.ts:408-417`) also runs `sendFrontendMessage`, `getKeys()` (which has already thrown in production once — the `__timestamp` pseudo-entry bug), and `setSyncState` (electron-store disk write, can throw on I/O errors). Any throw there rejects `Promise.all` → `runSync()` rejects → `sync()` returns the rejected promise (the `.finally` does not swallow it). Every renderer call site is fire-and-forget with no `.catch`: `void window.api.humbleSync()` (GlobalState:766), `.then(() => window.api.humbleSync())` (GlobalState:1128), `onClick={() => window.api.humbleSync()}` (Keys screen:126). Result: an unhandled rejection in the renderer and a sync whose outcome is never recorded (`syncError` untouched). WR-02 below is a concrete payload-triggerable instance.

**Fix:** Enforce the contract at the boundary:

```ts
async function sync(): Promise<SyncOutcome> {
  if (syncInFlight) return syncInFlight
  syncInFlight = runSync()
    .catch((err) => {
      logError(['Humble sync: unexpected failure:', err], LogPrefix.Backend)
      setSyncState({ syncError: 'network' })
      return { status: 'failed' as const }
    })
    .finally(() => {
      syncInFlight = null
      emitSyncState()
    })
  return syncInFlight
}
```

### WR-02: `extractExpiration` can throw despite its "Never throws" contract — a drifted `num_days_until_expired` crashes the whole sync

**File:** `src/backend/humble/classify.ts:205-208`, reached unguarded via `describeMissingExpirationTpks` at `classify.ts:541` from `library.ts:181`

**Issue:** The doc comment states "Never throws — a malformed value simply yields null." But the relative-days branch does `new Date(now.getTime() + days * MS_PER_DAY).toISOString()` with only `Number.isFinite(days) && days > 0` as a guard. Any `days > ~1e8` overflows the ECMAScript time range, producing an invalid Date whose `.toISOString()` throws `RangeError: Invalid time value` (verified). Inside `classifyOrder` the per-tpk `try/catch` silently swallows it (dropping the key), but `describeMissingExpirationTpks` calls `extractExpiration` with **no** try/catch, and `library.ts:181` calls it outside `fetchAndCommitOrder`'s try block — so a single hostile/drifted tpk value rejects the worker, the pool, and the entire `sync()` promise (the WR-01 path). This directly contradicts the module's shape-drift-tolerance design (Pitfall 2 / T-11-05).

**Fix:**

```ts
if (typeof days === 'number' && Number.isFinite(days) && days > 0) {
  const candidate = new Date(now.getTime() + days * MS_PER_DAY)
  if (!Number.isNaN(candidate.getTime())) {
    return candidate.toISOString()
  }
}
return null
```

### WR-03: Login watch has no timeout and survives renderer reloads — indefinite cookie poll + Humble validation loop (C5 pressure)

**File:** `src/backend/humble/user.ts:197-304`

**Issue:** `watchForLogin()` polls the partition cookie every 1.5s forever until `stopLogin()` or a successful validation. The only teardown signal is the renderer sending `humbleStopLogin` on route unmount. Several in-app flows call `window.location.reload()` (epic/gog/amazon/zoom/steam logout in `GlobalState.tsx`), and a renderer crash/reload is always possible — in those cases the unmount cleanup never fires and the main-process watch is orphaned. Once the anonymous `_simpleauth_sess` cookie exists, the orphaned watch re-validates it against the gamekeys endpoint roughly every 3s (the throttle window) **indefinitely** — a sustained, unbounded request loop against Humble that contradicts the C5 never-hammer discipline (a resulting 429 maps to `access_denied` → 'rejected' → 3s throttle → retry, forever). It also keeps the promise from `humbleStartLogin` pending forever.

**Fix:** Add a watch deadline (e.g. 10-15 minutes) that settles `{ status: 'waiting' }` and clears the interval:

```ts
const WATCH_TIMEOUT_MS = 10 * 60_000
const timeout = setTimeout(() => settle({ status: 'waiting' }), WATCH_TIMEOUT_MS)
// and clearTimeout(timeout) inside settle()
```

Optionally re-arm the deadline on `notifyLoginNavigated()` so an actively-navigating user is never cut off.

### WR-04: `gamekey` interpolated into the request path without URL encoding

**File:** `src/backend/humble/adapter.ts:302-304`

**Issue:** `getOrderDetail` builds `` `/api/v1/order/${gamekey}?all_tpkds=true` ``. `gamekey` is schema-validated only as `z.string()` from the order-list response. A drifted/hostile value containing `/`, `?`, `#`, or whitespace silently changes the request target or truncates the `all_tpkds=true` query (the exact parameter whose absence caused the round-3 zero-keys failure). The adapter is the designated C5 isolation wall; it should not forward an untrusted string into the URL structure verbatim.

**Fix:**

```ts
const response = await humbleRequest(
  `/api/v1/order/${encodeURIComponent(gamekey)}?all_tpkds=true`,
  cookie
)
```

### WR-05: `syncing` is derived only from progress events — never true for 0/1-order syncs and false until the first order resolves

**File:** `src/frontend/state/GlobalState.tsx:1097-1101`; `src/backend/humble/library.ts:405-417`

**Issue:** The renderer computes `syncing: done < total` from `humbleSyncProgress`, and the backend emits progress only *after* each order resolves (`done += 1` before send). Consequences: (a) for `total === 1`, the single event is `{done:1, total:1}` → `syncing` is never true; (b) for `total === 0` (all frozen), no event fires at all; (c) for multi-order syncs, the spinner and the refresh button's `disabled` state engage only after the first order completes (up to 15s with the request timeout). During that window the refresh button stays enabled and un-spinning, inviting repeat clicks (harmless only because of the backend single-flight guard) and giving no feedback that the click did anything.

**Fix:** Emit an initial `humbleSyncProgress` `{ done: 0, total }` in `runSync()` before `runBounded` (covers b and c), or push an explicit `syncing: true` via a state event at sync start.

### WR-06: Refresh-button cooldown never re-enables without an external re-render

**File:** `src/frontend/screens/Humble/Keys/index.tsx:88-100, 125`

**Issue:** `inCooldown` and `cooldownMinutes` are computed from `Date.now()` captured at render time. Nothing schedules a re-render when `cooldownUntil` elapses: no timer, and during a denial cooldown no sync events arrive to touch context. On an idle Keys screen the button remains disabled (and the tooltip's remaining-minutes count remains frozen) past the 15-minute cooldown until the user navigates away and back or some unrelated context update happens.

**Fix:** When `inCooldown` is true, arm a timeout to re-render at expiry:

```ts
useEffect(() => {
  if (!cooldownUntil || cooldownUntil <= Date.now()) return
  const id = setTimeout(() => setCooldownUntil(undefined), cooldownUntil - Date.now())
  return () => clearTimeout(id)
}, [cooldownUntil])
```

### WR-07: UNPICKED `deadline_date` is used unvalidated — an unparseable value renders "Expires Invalid Date" and produces NaN sort comparisons

**File:** `src/backend/humble/classify.ts:311-326`; `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx:38-39`; `src/common/humble/groupKeys.ts:45`

**Issue:** The UNPICKED pseudo-entry branch copies `product.deadline_date` into `HumbleKey.expiration` after only a `typeof === 'string'` check — unlike every tpk expiration, which goes through `extractExpiration`'s parse-and-ISO-normalize with an isNaN guard. The field name itself is flagged as speculative (Assumption A2). If the live value is a non-ISO or unparseable string: `HumbleKeyRow` renders `new Date(display.iso).toLocaleDateString()` → the literal string "Invalid Date" in the UI, and `byExpiringSoonest` compares `NaN` (comparator returns NaN → unspecified sort order). This is exactly the class of tolerance bug rounds 4-5 fixed for tpk dates, left open on the D-27 branch.

**Fix:** Normalize through the same helper:

```ts
const rawDeadline = (rawProduct as Record<string, unknown>).deadline_date
const deadline =
  typeof rawDeadline === 'string'
    ? extractExpiration({ expiry_date: rawDeadline }, now)
    : null
```

### WR-08: `machineName` used as React key can collide across orders — duplicate keys in one group list

**File:** `src/frontend/screens/Humble/Keys/components/HumbleKeyGroup/index.tsx:83`; `src/common/types/humble.ts:96-99`

**Issue:** `getKeys()` flattens all cached orders with no de-duplication, and `HumbleKeyGroup` renders `key={key.machineName}`. Humble tpk `machine_name` values are per-product, not per-order — the same game key type appearing in two owned bundles (a well-known Humble occurrence; it is *why* Playnite dedupes on machine_name) yields two rows with the same `machineName`. When both land in the same state group (likely — same product, same state), React duplicate-key behavior kicks in: reconciliation errors/dropped rows in dev, subtle mis-rendering on updates. Separately, the REVEALED flag keyed by `machineName` conflates the two copies (revealing one marks both) — possibly intended per the "de-duplication" comment on the type, but the rendered list is not actually de-duplicated to match that assumption.

**Fix:** Key rows by the guaranteed-unique pair: `key={`${key.gamekey}:${key.machineName}`}`. If conflating duplicates is intended, de-duplicate in `getKeys()`/`groupAndSortKeys` instead so display matches the REVEALED-flag semantics.

### WR-09: Circular import between HumbleKeyGroup and HumbleKeyRow

**File:** `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx:5`; `src/frontend/screens/Humble/Keys/components/HumbleKeyGroup/index.tsx:9`

**Issue:** `HumbleKeyGroup` imports `HumbleKeyRow` (component) while `HumbleKeyRow` imports `STATE_LABEL_KEYS` back from `HumbleKeyGroup`. This works today only because the row accesses the binding at render time (after both modules finish evaluating); any refactor that reads `STATE_LABEL_KEYS` at module scope in the row (e.g. deriving a lookup table) hits the ES-module TDZ and fails at runtime with a non-obvious "cannot access before initialization" error. Shared constants inside a component module are the classic seed of this failure.

**Fix:** Move `STATE_LABEL_KEYS` to a leaf module both components import, e.g. `src/frontend/screens/Humble/Keys/stateLabels.ts` (or alongside the other pure helpers in `common/humble/`).

### WR-10: Pre-existing: `handleExperimentalFeatures` writes the whole features object into `zoom.enabled`

**File:** `src/frontend/state/GlobalState.tsx:574-579`

**Issue:** (Pre-existing, in a reviewed file; not introduced by Phase 11.)

```ts
handleExperimentalFeatures = (value: ExperimentalFeatures) => {
  this.setState({
    experimentalFeatures: value,
    zoom: { ...this.state.zoom, enabled: value }
  })
}
```

`enabled` is assigned the entire `ExperimentalFeatures` object, which is always truthy — toggling the Zoom experimental feature *off* leaves `zoom.enabled` truthy until restart, and the state shape no longer matches `StateProps['zoom']` (`enabled: boolean`). Should be `enabled: value.zoomPlatform`.

**Fix:** `zoom: { ...this.state.zoom, enabled: value.zoomPlatform }`

## Info

### IN-01: `partitionGamekeys` computes a `frozenGamekeys` bucket nobody consumes

**File:** `src/backend/humble/library.ts:47-51, 63, 71-78, 396`
**Issue:** `runSync` destructures only `newGamekeys`/`nonTerminalGamekeys`; the frozen count in the summary log is recomputed as `data.length - total`. The third bucket is dead weight.
**Fix:** Drop `frozenGamekeys` from the return shape, or use it for the summary-log count.

### IN-02: `formatRelativeTime` is hardcoded English and the freshness line never ticks

**File:** `src/frontend/screens/Humble/Keys/index.tsx:19-33, 88-91`
**Issue:** "less than a minute" / "minutes" / "hours" / "days" bypass i18n (interpolated into translated strings), and the "Last synced X ago" value is frozen at render time. Mirrors an existing LibraryHeader pattern, so flagged informationally.
**Fix:** Use i18next plural keys (or `Intl.RelativeTimeFormat`) and a minute-interval re-render tick.

### IN-03: Sync never prunes cache entries for gamekeys no longer in the account's order list

**File:** `src/backend/humble/library.ts:261-267, 396-401`
**Issue:** `getKeys()` flattens every cached order; orders removed server-side (refunds, revoked gifts) persist in the inventory forever since only fetched entries are written and nothing is deleted.
**Fix:** After a clean gamekeys fetch, delete cached entries whose gamekey is absent from `gamekeysResult.data`.

### IN-04: `frontend/types.ts` duplicates the `syncError` literal union

**File:** `src/frontend/types.ts:114`
**Issue:** `syncError?: 'none' | 'denied' | 'network' | 'partial'` restates `HumbleSyncState['syncError']` (which `GlobalState.tsx:92` references properly). A future variant added to the backend type will silently drift.
**Fix:** `syncError?: HumbleSyncState['syncError']` (the file already imports from `common/types/humble`).

### IN-05: `schema_error` results carry the full raw untrusted body, including `redeemed_key_val`

**File:** `src/common/types/humble.ts:13`; `src/backend/humble/adapter.ts:238, 271, 309`
**Issue:** No in-scope consumer logs or forwards `raw`, but the discriminant hands every caller a payload that can contain raw key values — a standing hazard for the invariant the rest of the phase enforces so carefully. One future `logWarning(result.raw)` defeats C4/T-11-01.
**Fix:** Drop `raw` from the public result (the redacted `describeSchemaFailure` log already serves diagnosis), or replace it with the redacted diagnosis string.

### IN-06: Startup chain still fires a sync (one guaranteed-401 request) after the health check flags expiry

**File:** `src/frontend/state/GlobalState.tsx:1127-1129`
**Issue:** The comment says "an already-expired session never syncs", but `humbleCheckHealth().then(() => window.api.humbleSync())` runs the sync unconditionally; on an expired session `runSync`'s `getGamekeys` makes one more 401 round-trip before failing. Harmless but contradicts the comment and adds avoidable C5 noise.
**Fix:** Have `humbleCheckHealth` resolve a boolean (healthy/expired) and gate the sync, or have the backend chain health→sync itself.

### IN-07: Pre-existing: `CacheStore.set` stores a locale-dependent `Date()` string as the timestamp

**File:** `src/backend/cache.ts:82`
**Issue:** `Date()` yields a human-readable local-time string later re-parsed with `new Date(string)` — implementation/locale-dependent parsing. Harmless for the Phase 11 stores (lifespan `null`, timestamps unused), noted since the file was touched this phase for `entries()`.
**Fix:** Store `new Date().toISOString()`.

---

_Reviewed: 2026-07-06T08:50:11Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
