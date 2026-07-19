# Architecture Research — Humble Bundle Integration

**Domain:** Key-management overlay on an existing multi-store Electron launcher
**Researched:** 2026-07-05
**Confidence:** HIGH (existing codebase read directly; Humble API patterns corroborated by multiple community implementations)

---

## Core Architectural Decision: Keys Domain, Not a Runner

Humble Bundle does NOT slot into the `storeManagers/` pattern as a `LibraryManager`.

The `LibraryManager` interface requires 11 methods tied to a launchable-game lifecycle: `getGame()`, `getInstallInfo()`, `install()`, `launch()`, `repair()`, `syncSaves()`, `uninstall()`, etc. Humble has none of these. A `humble/` directory inside `storeManagers/` that stubs every game-operation method would be architecturally dishonest and would require adding `'humble'` to the `Runner` union type in `src/common/types.ts`, which would infect `libraryManagerMap`, the IPC layer, and the download manager queue with a runner that can never install or launch anything.

Humble is a **keys domain** — a parallel backend subsystem that overlays the library rather than contributing GameInfo objects to it. The only place Humble data appears in the game library is as annotation on existing Steam entries (a collapsed redeemed key, F3) and as badges on GameCard tiles (F7). Both are read from Humble's own persisted cache, not from injected GameInfo rows.

**Where the humble domain lives:**
```
src/backend/humble/           ← new top-level backend domain
src/frontend/screens/Humble/  ← new frontend screens
src/common/types/humble.ts    ← shared type definitions
```

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  React Frontend                                                          │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │ HumbleKeys   │  │ GiftableSpares│  │ ClaimFlow   │  │ GameCard    │  │
│  │ /humble/keys │  │/humble/spares│  │  (modal)    │  │ overlay     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘  └──────┬──────┘  │
│         └─────────────────┴─────────────────┴────────────────┘         │
│                          IPC (ipcRenderer.invoke)                        │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────────────┐
│  Backend: src/backend/humble/                                            │
│                                                                          │
│  ┌────────────────┐   ┌─────────────┐   ┌─────────────┐                 │
│  │ ipc_handler.ts │──▶│  library.ts │──▶│  dedup.ts   │                 │
│  │ (addHandler)   │   │ (sync/cache)│   │(Steam xref) │                 │
│  └────────┬───────┘   └──────┬──────┘   └──────┬──────┘                │
│           │                  │                  │                        │
│           ▼                  ▼                  ▼                        │
│  ┌────────────────┐   ┌─────────────┐   ┌─────────────┐                 │
│  │   user.ts      │   │  adapter.ts │   │  keys.ts    │                 │
│  │ (auth/session) │   │  (C5 wall)  │   │(reveal/audit│                 │
│  └────────┬───────┘   └──────┬──────┘   └─────────────┘                │
│           │                  │                                           │
│           ▼                  ▼                                           │
│  ┌─────────────────────────────────────────────────────┐                │
│  │             electronStores.ts                        │                │
│  │  humbleConfigStore | humbleLibraryStore | auditStore │                │
│  └─────────────────────────────────────────────────────┘                │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                     ┌─────────────▼─────────────┐
                     │  humblebundle.com (private │
                     │  session-cookie API)        │
                     └───────────────────────────┘
```

---

## C5 Adapter Interface: The Isolation Boundary

All HTTP calls to humblebundle.com go through a single `HumbleAdapter` class in `adapter.ts`. Nothing else in the humble domain (or anywhere else in the codebase) makes direct HTTP calls to Humble endpoints. This satisfies constraint C5: when the undocumented API changes, only `adapter.ts` requires a fix.

The adapter manages the `_simpleauth_sess` session cookie and the `X-Requested-By: hb_android_app` header required by Humble's API. It uses `axios` (already in the project, no new dependency).

**Interface (`src/common/types/humble.ts`):**
```typescript
export interface HumbleAdapter {
  // Authentication
  login(email: string, password: string): Promise<
    { status: 'done' } |
    { status: 'guard_required' } |
    { status: 'error'; message?: string }
  >
  submitGuardCode(code: string): Promise<{ status: 'done' | 'error' }>
  isSessionValid(): Promise<boolean>
  clearSession(): void

  // Data — these are the only functions that know Humble endpoint URLs
  getGamekeys(): Promise<string[]>
  getOrder(gamekey: string): Promise<HumbleRawOrder>
}
```

The implementation in `adapter.ts` is a class that holds the `axios` instance with the session cookie jar. `user.ts` calls `adapter.login()` / `adapter.submitGuardCode()`; `library.ts` calls `adapter.getGamekeys()` and `adapter.getOrder()`. No other file touches `axios` for Humble requests.

**Do NOT use the `humblebundle` npm package** (konsumer/humblebundle — 8 commits, last activity unknown, uses basic auth that may no longer work against Humble's current login flow). Build the adapter directly with `axios`. The adapter is small: two auth endpoints, two data endpoints.

---

## Local Persistence: Where State Lives

Follow the existing pattern: `TypeCheckedStoreBackend` for typed config, `CacheStore` for library data.

### New StoreStructure entries (`src/common/types/electron_store.ts`)

```typescript
humbleConfigStore: {
  isLoggedIn: boolean
  sessionCookie?: string         // encrypted via Electron safeStorage, same pattern as steamConfigStore.refreshToken
  userData?: { username: string; email: string }
}

humbleAuditStore: {
  entries: Array<{
    action: 'reveal' | 'redeem'
    gamekey: string
    tpkIndex: number
    title: string
    keyType: string
    timestamp: number
    outcome: 'success' | 'cancelled' | 'error'
    errorMessage?: string
  }>
}
```

### CacheStore files (in `store_cache/`)

- `humble_library` — normalized `HumbleKey[]` array including the local `REVEALED` flag
- `humble_sync` — last successful sync epoch (same pattern as `steam_sync`)

The `REVEALED` flag lives **inside the normalized key record** in `humble_library`, not as a separate lookup table. When `library.ts` normalizes a raw order response, it reads the current cached record for that (gamekey, tpkIndex) pair and preserves its `revealed` flag before writing the updated entry. This means a sync that gets a fresh server response cannot accidentally overwrite a locally-set REVEALED state.

**Session cookie encryption**: Use `safeStorage.encryptString()` / `safeStorage.decryptString()` exactly as `steam/user.ts` does with the `TOKEN_PREFIX` sentinel to distinguish encrypted vs. plaintext fallback storage. Store in `humbleConfigStore.sessionCookie`.

---

## Data Flow: Library Sync (F1/F2)

```
ipcRenderer.invoke('humble:sync')
    ↓
ipc_handler.ts → library.ts.sync()
    ↓
adapter.getGamekeys()             → string[] of order IDs
    ↓ (concurrent, bounded to ~5 in-flight)
adapter.getOrder(gamekey)         → raw HumbleRawOrder per order
    ↓
normalizeOrder(raw, existingCache) → HumbleKey[] preserving REVEALED flag
    ↓
dedup.annotateOwnership(keys)     → keys with owned_elsewhere set
    ↓
humbleLibraryStore.set('keys', keys)
humbleSyncStore.set('syncedAt', Date.now())
    ↓
sendFrontendMessage('humbleKeysUpdated', keys)
```

`normalizeOrder` maps `tpkd_dict.all_tpks[]` to `HumbleKey` objects. The 5-state classification (UNPICKED / UNREVEALED / REVEALED / REDEEMED / UNREDEEMABLE) is computed here. If the server response has `redeemed_key_value` present, state is REDEEMED. If absent and not in the local REVEALED flag, state is UNREVEALED. The REVEALED flag from the cache is preserved across syncs.

The frontend receives `humbleKeysUpdated` (pushed via `sendFrontendMessage`) and stores it in React context. The context exposes derived views:
- `humbleKeysWaiting` — filter to `owned_elsewhere === false && state in {UNPICKED, UNREVEALED, REVEALED}`
- `humbleSpares` — filter to `owned_elsewhere === true && state === 'UNREVEALED'`
- `humbleKeysByTitle` — lookup map for the store overlay (F7)

---

## Dedup Architecture: F3 Without Coupling to Steam Manager Internals

`dedup.ts` reads from the **persisted Steam library cache** (`steamLibraryStore.get('games', [])`), not from the in-memory `library` Map in `steam/state.ts`. This means:

- No import of `SteamLibraryManager` or `steam/user.ts`
- Works offline and survives a Steam CM disconnection
- `steamLibraryStore` is already a separate module (`steam/electronStores.ts`) that can be imported without pulling in the full Steam manager

**Matching strategy (two passes):**

1. **Steam AppID match** — when `key_type === 'steam'`, extract the AppID from the Humble order response (some have it; community tools like HumbleKeysLibrary also maintain title-to-AppID mappings). If found, look for `GameInfo.app_name === String(appId)` in the Steam library. `owned_elsewhere = true` if matched regardless of install state (ownership, not install state).

2. **Normalized title match** — lowercase, strip punctuation and edition suffixes ("GOTY Edition", "Definitive Edition", etc.), Levenshtein distance ≤ 2. Mark `matchConfidence: 'fuzzy'` on the key record to let the UI show "You may already own this" rather than a definitive "You own this" when confidence is low.

`dedup.ts` exports a single function:
```typescript
export async function annotateOwnership(keys: HumbleKey[]): Promise<HumbleKey[]>
```

It is called by `library.ts` as the final step before persisting, so the canonical persisted key record always has `owned_elsewhere` set.

---

## Recommended File Structure

```
src/backend/humble/
├── adapter.ts            # C5 isolation wall — ALL Humble HTTP calls
├── user.ts               # Auth: login, guard code, session lifecycle
├── library.ts            # Sync, normalize, 5-state classify, cache
├── dedup.ts              # Cross-reference against Steam library cache
├── keys.ts               # Reveal action, audit log write, claim handoff
├── electronStores.ts     # humbleConfigStore, humbleLibraryStore, humbleAuditStore
├── ipc_handler.ts        # All addHandler() registrations for humble:* channels
└── constants.ts          # Endpoint URLs, header constants, rate-limit config

src/frontend/screens/Humble/
├── index.tsx             # Humble section root / layout
├── KeysWaiting/
│   └── index.tsx         # F4 — unowned + unredeemed list, expiration sort
├── GiftableSpares/
│   └── index.tsx         # F6 — owned-elsewhere + unrevealed, gift link copy
└── ClaimFlow/
    └── index.tsx         # F5 — guided reveal → steam:// handoff → mark redeemed

src/common/types/
└── humble.ts             # HumbleAdapter interface, HumbleKey, HumbleAuditEntry, etc.
```

`ipc_handler.ts` registers itself from `main.ts` alongside the other `ipc_handler.ts` imports (the existing pattern: downloadmanager, logger, recent_games, shortcuts, etc. all register this way).

---

## Component Boundaries and Communication

### Backend → Frontend

| Channel | Direction | Payload | When |
|---------|-----------|---------|------|
| `humbleKeysUpdated` | backend → frontend | `HumbleKey[]` | After each sync completes |
| `humbleAuthState` | backend → frontend | `{ isLoggedIn: boolean; username?: string }` | On login/logout |

### Frontend → Backend (IPC invoke)

| Channel | Payload | Returns | Notes |
|---------|---------|---------|-------|
| `humble:login` | `{ email, password }` | `{ status: 'done' \| 'guard_required' \| 'error' }` | Parallel to steamStartCredentials pattern |
| `humble:submitGuard` | `{ code }` | `{ status: 'done' \| 'error' }` | |
| `humble:logout` | — | `void` | Clears session cookie + store |
| `humble:sync` | — | `{ status: 'done' \| 'error'; count?: number }` | Manual re-sync trigger |
| `humble:getKeys` | — | `HumbleKey[]` | Returns current cached set |
| `humble:revealKey` | `{ gamekey, tpkIndex }` | `{ status: 'done' \| 'error'; keyValue?: string }` | Destructive — C1 guard in handler |
| `humble:markRedeemed` | `{ gamekey, tpkIndex }` | `void` | User-confirmed, writes audit log |
| `humble:getAuditLog` | — | `HumbleAuditEntry[]` | |
| `humble:getUserInfo` | — | `{ username: string; email: string } \| undefined` | |

All channels registered in `humble/ipc_handler.ts` using the existing `addHandler()` function from `src/backend/ipc.ts`. Channel names and return types added to `AsyncIPCFunctions` in `src/common/types/ipc.ts`.

### React Context Integration

The existing `ContextProvider` in `src/frontend/state/ContextProvider` manages per-store state (`epic`, `gog`, `amazon`, `zoom`). Add a `humble` context slice:

```typescript
humble: {
  isLoggedIn: boolean
  username?: string
  keys: HumbleKey[]           // full normalized set; views derive from this
  lastSynced: number | null
  syncError: string | null
}
```

The `humbleKeysUpdated` frontend message (from `sendFrontendMessage`) updates `humble.keys` in context, following the same `pushGameToLibrary` → library state update pattern used by Steam.

### Store Overlay (F7): Non-Intrusive Badge Injection

The overlay does NOT modify `GameCard`'s data model. Instead:
1. `GameCard` receives the existing `GameInfo` prop (unchanged)
2. If `humble.keys` context has entries, `GameCard` checks `humbleKeysByTitle.get(normalizedTitle(game.title))` for a badge
3. Badge render is a conditional overlay `<div>` with CSS position absolute, conditionally rendered when Humble is logged in and keys are loaded
4. This is an additive change to `GameCard` — no changes to GameInfo types, no runner coupling

---

## New vs. Modified Components

### New (backend)
- `src/backend/humble/adapter.ts`
- `src/backend/humble/user.ts`
- `src/backend/humble/library.ts`
- `src/backend/humble/dedup.ts`
- `src/backend/humble/keys.ts`
- `src/backend/humble/electronStores.ts`
- `src/backend/humble/ipc_handler.ts`
- `src/backend/humble/constants.ts`

### New (frontend)
- `src/frontend/screens/Humble/` (full subtree — Keys Waiting, Giftable Spares, Claim Flow)
- Humble section in Manage Accounts surface

### New (types)
- `src/common/types/humble.ts`
- Two new `StoreStructure` entries in `src/common/types/electron_store.ts`
- New channels in `AsyncIPCFunctions` and `FrontendMessages` in `src/common/types/ipc.ts`

### Modified (existing)
- `src/backend/main.ts` — import and register `humble/ipc_handler.ts`; no structural change
- `src/frontend/state/ContextProvider` — add `humble` slice to context
- `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx` — add Humble sidebar item, conditionally shown when logged in
- `src/frontend/screens/Library/components/GameCard/index.tsx` — add optional Humble badge overlay (additive)
- `src/frontend/screens/Settings/` or Login section — add Humble auth to Manage Accounts surface

### NOT modified
- `src/common/types.ts` — `Runner` union is NOT extended
- `src/backend/storeManagers/index.ts` — `libraryManagerMap` is NOT extended
- Any existing store manager — no changes required

---

## Suggested Build Order (Phase Decomposition)

Dependencies flow strictly: auth must precede sync; sync + dedup must precede all frontend views; claim flow requires the reveal action; store overlay can be built in parallel with claim flow once the dedup data is available.

| Phase | Name | Deliverable | Depends On |
|-------|------|-------------|------------|
| 1 | Humble Auth + Adapter | `adapter.ts`, `user.ts`, `electronStores.ts`, Manage Accounts UI section, IPC auth channels | Nothing |
| 2 | Library Sync + Key Model | `library.ts`, 5-state classification, `humbleLibraryStore`, IPC sync channels, React context slice | Phase 1 |
| 3 | Dedup + Ownership Overlay | `dedup.ts`, Steam cross-reference, ownership context in GameCard badge | Phase 2 + existing Steam library cache |
| 4 | Keys Waiting + Spares Views | `/humble/keys` and `/humble/spares` frontend screens, sidebar item | Phases 2+3 |
| 5 | Guided Claim Flow | `keys.ts`, reveal action (C1/C2/C6), audit log, `steam://open/activateproduct` handoff, mark-redeemed IPC | Phase 4 |
| 6 | Store Overlay + Expiration Alerts | F7 badge on GameCard + store views, F8 urgency sort and notifications | Phase 3 |

Phase 3 can begin in parallel with Phase 4 work after Phase 2 ships. Phase 5 and Phase 6 are independently startable after Phase 4 completes.

---

## Architectural Patterns to Follow

### Adapter-First Implementation
Implement `adapter.ts` first with all endpoint calls and a test harness that replays recorded HTTP responses. Every other module receives the adapter via module import, never instantiates an `axios` client directly for Humble calls. This makes future API breakage a one-file fix.

### Preserve Local State Through Syncs
When `library.ts` normalizes fresh server data, always read the existing cached key record first and carry forward any locally-mutated fields (`revealed`, `revealedAt`, `redeemedAt`). Never let a server sync overwrite locally-set state. The REVEALED flag must survive a full library resync.

### Fan-Out with Concurrency Bound
`library.ts` fetches all gamekeys, then fetches each order. Use a simple semaphore to bound concurrent requests to ~5 in-flight orders at a time (C3 — respect rate limits). Do not use `Promise.all()` with an unbounded array of order fetches; that approach has caused Humble bans in community tools.

### Fail Soft
On any adapter error during sync, log the error, set a `syncError` string in the context, and serve the cached library. Never throw from a sync that would crash the IPC handler. This is the same pattern as Steam's CM fallback in `library.ts` (falls back to `steamLibraryStore.get('games', [])`).

---

## Anti-Patterns to Avoid

### Adding 'humble' to the Runner Union
Adding `'humble'` to `src/common/types.ts`'s `Runner` type would require Humble to implement `LibraryManager`, participate in `libraryManagerMap`, appear in download queue entries, and handle install/launch/uninstall IPCs. None of these make sense. The keys domain needs its own IPC surface, not the game-runner IPC surface.

### Storing the Session Cookie in Cleartext
The `_simpleauth_sess` cookie grants full Humble account access. Encrypt it at rest with `safeStorage.encryptString()` exactly as the Steam refresh token is handled. Never write it to logs (C4). The TOKEN_PREFIX sentinel pattern from `steam/user.ts` is the correct model to copy.

### Tight Import of Steam Manager Internals
`dedup.ts` must NOT import `SteamLibraryManager`, `SteamUser`, `steam/user.ts`, or `steam/state.ts`. It imports only `steamLibraryStore` from `steam/electronStores.ts` — the persisted cache, not the live in-memory state. Any future refactor of the Steam manager internals cannot break dedup.

### Triggering Reveals Automatically or in Bulk
The reveal action (in `keys.ts`) must be callable only from the IPC handler for `humble:revealKey`, which is invoked only by explicit user action. Never call it from `library.ts`'s sync loop or from any background task. The audit log write must be the last step, not an afterthought (C1, C6).

### Name-Match Overconfidence
Fuzzy title matching produces false positives for DLC, bundles, and edition variants ("Cyberpunk 2077" vs. "Cyberpunk 2077: Phantom Liberty"). Mark fuzzy matches with `matchConfidence: 'fuzzy'` and render them differently in the UI ("You may already own this") rather than collapsing them as definitive duplicates.

---

## Integration Points Summary

| Integration Point | How | Notes |
|-------------------|-----|-------|
| `src/backend/main.ts` | Import `humble/ipc_handler.ts` at startup | Follows existing pattern for downloadmanager, logger, etc. |
| `src/common/types/ipc.ts` | Add humble channels to `AsyncIPCFunctions` and `FrontendMessages` | Typed IPC — both sides get compile-time safety |
| `src/common/types/electron_store.ts` | Add `humbleConfigStore` and `humbleAuditStore` to `StoreStructure` | Follows existing gogConfigStore / steamConfigStore patterns |
| `steam/electronStores.ts` | `dedup.ts` imports `steamLibraryStore` for read-only access | Read-only import — no writes to Steam stores from Humble code |
| `GameCard` component | Optional badge overlay rendered when `humble.isLoggedIn` and key lookup hits | Additive — no prop changes, no runner coupling |
| `ContextProvider` | New `humble` slice mirrors `gog`/`epic`/`amazon` slices | Keys pushed via `humbleKeysUpdated` message, same as `pushGameToLibrary` |
| `SidebarLinks` | New sidebar item for Humble section | Conditionally shown on `humble.isLoggedIn` |

---

## Scalability Note

Humble orders can be large (thousands of items from years of bundles). Progress updates via `sendFrontendMessage('humbleLibrarySyncProgress', { fetched, total })` let the frontend show "Syncing Humble library... (234/1,243 orders)". After initial sync, subsequent syncs are incremental: check `humble_sync` timestamp and skip re-fetch if cache is younger than the configured TTL (suggest 6 hours default, matching `CacheStore`'s built-in 360-minute lifespan).

---

## Sources

- Codebase read directly: `src/backend/storeManagers/steam/`, `src/backend/storeManagers/index.ts`, `src/common/types/game_manager.ts`, `src/common/types/ipc.ts`, `src/common/types/electron_store.ts`, `src/backend/electron_store.ts`, `src/backend/cache.ts`, `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx`
- [Humble Bundle API docs (Schiff, 2017)](https://www.schiff.io/projects/humble-bundle-api/) — endpoint list, auth headers, _simpleauth_sess pattern
- [HumbleKeysLibrary (Dasmius007, C# Playnite extension)](https://github.com/Dasmius007/HumbleKeysLibrary) — actively maintained (last release March 2026), confirms tpkd_dict.all_tpks[] field path and API viability
- [FailSpy/humble-steam-key-redeemer](https://github.com/FailSpy/humble-steam-key-redeemer) — Python implementation, confirms session-cookie auth flow and tpkd_dict parsing
- [humblebundle npm package (konsumer)](https://github.com/konsumer/humblebundle) — assessed as abandoned (8 commits); NOT recommended for use
- HUMBLE-SPEC-SOURCE.md (in this repo) — domain model, feature spec, constraints C1–C6

---

*Architecture research for: Humble Bundle integration in GameLib (v0.3 milestone)*
*Researched: 2026-07-05*
