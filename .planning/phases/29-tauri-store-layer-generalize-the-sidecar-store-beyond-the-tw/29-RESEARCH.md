# Phase 29: Tauri store layer — generalize the sidecar store - Research

**Researched:** 2026-07-22
**Domain:** Internal architecture — Node sidecar persistence layer (electron-store parity), IPC transport generalization, renderer hydration tiering
**Confidence:** HIGH (all empirical findings below are `[VERIFIED: codebase]` — read directly from source, not inferred; no external library research was needed since D-01 already locks the approach and no new packages are introduced)

## Summary

This phase's real work is not "write a store layer" — `fileStore.ts` already implements the full method surface `TypeCheckedStoreBackend` needs. The real work is **enumerating the actual store surface** (which is bigger and messier than `StoreStructure`'s ~21 names suggest), **wiring three new sidecar handlers** (`storeSet`/`storeDelete`/`storeNew`) that today are silently swallowed as `send`-kind frames with zero registered listener, and **deciding which stores must be hydrated before first paint** versus which can lazy-load.

Three findings should reshape the plan more than anything in 29-CONTEXT.md's own text:

1. **The true "boot set" is at least 15 stores, not 2.** `GlobalState.tsx`'s constructor and `GlobalStateV2.ts`'s zustand initializer synchronously read from 11 `StoreStructure`-named stores (`configStore`, `gogConfigStore`, `gogInstalledGamesStore`, `nileConfigStore`, `zoomConfigStore`, `zoomInstalledGamesStore`, `steamConfigStore`, `humbleConfigStore`, `wineDownloaderInfoStore`, `sideloadedStore`, `gameOverridesStore`) **and** 4 `CacheStore`-backed dynamic-named stores (`legendary_library`, `gog_library`, `nile_library`, `zoom_library`) that are **not `ValidStoreName`s at all**. Today, under Tauri, all 13 of these beyond the original 2 silently read as their default value (`[]`/`{}`/`undefined`) at boot — D-04's fallback behavior is already happening, just undocumented and unwarned.

2. **Not every store is constructible in the sidecar today without pulling in heavier modules.** Three `StoreStructure` stores are **not** declared in an isolated `electronStores.ts`-style file: `wineDownloaderInfoStore` lives inside `wine/manager/utils.ts` (which also defines the real Wine-download pipeline), `downloadManager` lives inside `downloadqueue.ts` (which also imports `storeManagers/index.ts`'s full `libraryManagerMap`), and `migrationsStore` is constructed **lazily inside a singleton class constructor** (`MigrationSystem.get()`), never at module scope. Achieving D-02's "every store round-trips" bar requires either importing these heavier modules into the sidecar (reintroducing side effects Phase 27 deliberately avoided) or extracting these three store declarations into dedicated files. This is a genuine architectural decision the planner must make explicitly — it is not covered by any of D-01..D-12.

3. **A same-cwd, same-default-name collision already exists between `steamConfigStore` and `steamBottleConfigStore`** (both `{ cwd: 'steam_store' }`, neither passes `options.name`, both defaulting to electron-store's hardcoded `'config'` — confirmed by reading `node_modules/electron-store/index.js:52`). In the real Electron build this is harmless because `conf`'s `get store()` re-reads the file fresh from disk on every access (`node_modules/conf/dist/source/index.js:274`). In the sidecar's `fileStore.ts`, `this.data` is cached **once at construction** and never re-read — so the moment this phase makes `steamBottleConfigStore` live (today nothing touches it), the two stores **will silently clobber each other's writes** in-process, independent of D-07's already-accepted cross-process/cross-build clobber. This is a `fileStore.ts` fidelity gap more consequential than the `options.defaults` gap 29-CONTEXT.md already flags, and it is fixable now (either re-read-on-access, matching `conf`'s model, or a path-keyed singleton registry so two logical stores sharing a physical file share one in-memory object).

**Primary recommendation:** Do the inventory work first (Steps A below) before writing any handler code — the plan's task breakdown should start with "enumerate every store construction site and its true on-disk collision graph," because several of D-02/D-03/D-09's decisions cannot be sized correctly without that list.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Store persistence (read/write JSON on disk) | Node sidecar (`fileStore.ts`) | — | D-01 locked; matches Electron's existing `electron-store` ownership |
| Store instance construction / registry | Node sidecar (`backend/electron_store.ts` + per-manager `electronStores.ts`) | — | Shared module already used by both Electron and sidecar builds via the `Module._load` hook |
| Renderer synchronous read cache (snapshot) | Renderer preload (`tauriTransport.ts`'s in-memory `snapshot`) | Node sidecar (source of truth on refresh) | Snapshot is a cache, not storage; sidecar remains authoritative |
| Write dispatch (storeSet/storeDelete) | Node sidecar (new handlers in `handlers.ts`) | Renderer (optimistic local patch) | Renderer's optimistic write must not be mistaken for confirmed persistence — D-06's invalidation push closes this gap |
| Change notification / invalidation | Node sidecar → Rust shell (existing `frontend_message` relay) → Renderer | — | Zero Rust changes needed — `pushFrontendMessage(channel, ...args)` already accepts an arbitrary channel name; confirmed in `main.rs`'s generic `kind == "frontendMessage"` branch |
| Secret allow-list enforcement | Node sidecar (snapshot/write handlers) | Renderer preload (defense-in-depth, unchanged) | D-08 — Tauri path only; Electron's deny-list in `misc.ts` stays byte-identical |
| Rust shell | — | — | Zero involvement this phase (confirmed: the existing generic relay handles any new channel name without a Rust code change) |

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** — Persistence stays in the Node sidecar; grow `fileStore.ts`. Do NOT move store ownership to Rust or `tauri-plugin-store`. (Rationale: byte-identical on-disk JSON layout with Electron; ~18 backend files call `.get()` synchronously at module scope.)
- **D-02** — Completion bar: every store round-trips, proven by a test that walks `ValidStoreName`. Method surface is complete; real gaps are (a) coverage, (b) `defaults` option handling, (c) `backend/cache.ts`'s direct `new Store({ clearInvalidConfig })` construction bypassing `TypeCheckedStoreBackend`. Full electron-store semantics parity (atomic writes, dot-notation edge cases) explicitly NOT required (see D-10).
- **D-03** — Tiered hydration: declared boot set eager, everything else lazy. Rejected: one eager all-stores snapshot (would block first paint serializing unbounded caches).
- **D-04** — Sync read of a not-yet-hydrated store: return the caller's `defaultValue`, log a distinct/greppable warning, kick off async hydrate. Non-fatal. Known accepted risk: silently-wrong-then-self-corrects first read.
- **D-05** — Wire the writes AND a sidecar→renderer invalidation push. Register real `storeSet`/`storeDelete`/`storeNew` handlers; close the reverse direction.
- **D-06** — Invalidation shape: per-key change event `{ store, key, value }`. Reuse the existing push path (`sendFrontendMessage` → `frontend_message` Tauri event → renderer `on()`). Implied constraint: every sidecar-side write must funnel through a single choke point. Rejected: coarse dirty-store re-fetch, per-store opt-in.
- **D-07** — Cross-process write clobber is ACCEPTED and DOCUMENTED, not engineered around. Rejected: re-read-before-write, advisory lock, separate Tauri userData folder. Deliverable: written down in SEAM.md and/or a `fileStore.ts` code comment.
- **D-08** — Secret policy flips to an ALLOW-LIST, on the Tauri path only. Electron's deny-list in `misc.ts` stays byte-identical. Accepted consequence: divergent secret policies between builds until Electron retires — needs a comment at both sites.

### Claude's Discretion

- **D-09** — How the boot set is defined: hand-declared list vs. derived from `registerStore()`/module-scope `storeNew` calls.
- **D-10** — Whether `fileStore.persist()` becomes atomic temp-file+rename (currently plain `writeFileSync`).
- **D-11** — Whether `backend/cache.ts`'s direct `new Store()` path gets the same treatment as `TypeCheckedStoreBackend`, or is left to the `Module._load` hook's existing substitution.
- **D-12** — Frame/naming for the new store channels — must stay consistent with `sidecarTransport.ts`'s existing shapes.

### Deferred Ideas (OUT OF SCOPE)

- Cross-process write safety (re-read-before-write, advisory lock, separate userData folder) — rejected by D-07.
- Flipping the Electron preload path to the allow-list — deferred by D-08; natural moment is Phase 35 (Electron cutover) or a warn-only telemetry pass.
- A real `onDidChange`/reactive store public API — D-06's per-key events are the substrate, not the API itself.
- Full electron-store semantics parity (schema validation, migrations) — explicitly out of D-02's bar.
- Porting install/uninstall/update-check IPC — Phase 30.
- Rust/Tauri store options, `tauri-plugin-store`, OSCrypt, cross-process file locking, Windows/Linux packaging — explicit research non-goals per the orchestrator's brief.

## Phase Requirements

**No REQ-29-xx IDs exist yet** — REQUIREMENTS.md has no Phase 29 section (confirmed: full grep of REQUIREMENTS.md's traceability table shows Phase 28 as the last minted phase). Per the Phase 26/28 precedent, the planner mints REQ-29-xx from the locked D-01..D-08 decisions at plan time. Suggested mapping (mirrors the `D-XX -> REQ` mapping lines already established for Phases 23/21/28):

| Candidate ID | Locked decision(s) | Description | Research support |
|----|------|-------------|-------------------|
| REQ-29-01 | D-02 | Every `ValidStoreName` (and the CacheStore-backed dynamic names actually reachable from the frontend) constructs and round-trips `get`/`set`/`delete`/`raw_store` through the sidecar | Finding 3 (full inventory below); Finding 2 (three stores need construction-site work first) |
| REQ-29-02 | D-03/D-04/D-09 | Tiered hydration: a declared/derived boot set ships eagerly; a not-yet-hydrated sync read returns default + distinct warning + kicks off async hydrate | Finding 1 (empirical boot-set enumeration) |
| REQ-29-03 | D-05/D-06/D-12 | `storeSet`/`storeDelete`/`storeNow` handlers registered in the sidecar; a per-key change event reaches the renderer via the existing push path | Confirmed today's silent-swallow bug (Question 4 below); confirmed zero Rust changes needed |
| REQ-29-04 | D-08 | An allow-list secret policy on the Tauri path only, replacing the 2-key deny-list, covering every secret/main-process-only field in `StoreStructure` | Full secret-field enumeration below (Question 5) |
| REQ-29-05 | D-07 | The cross-process (and, per this research, cross-instance same-file) write-clobber risk is documented in SEAM.md and/or a `fileStore.ts` comment | Finding 3 above supplies a concrete second instance of the same risk class |
| REQ-29-06 | D-02 (test bar) | A new test walks every `ValidStoreName` and asserts the D-08 allow-list excludes every named secret, mirroring `skeletonFlows.test.ts`'s Test 4 shape, using the safe `jest.mock('os', ...)` isolation pattern | Question 7 below (landmine + safe pattern) |

## Standard Stack

No new external packages. This phase grows existing project code:

| File | Role | Change scope |
|------|------|--------------|
| `src/backend/sidecar/fileStore.ts` | Store implementation | Extend fidelity (defaults handling per D-02's bar; optionally atomic persist per D-10; optionally re-read-on-access or path-keyed singleton per Finding 3) |
| `src/backend/sidecar/handlers.ts` | RPC handler registration | Add `storeSet`/`storeDelete`/`storeNow` `ipcMain.on`/`ipcMain.handle` registrations; generalize `sidecar:store-snapshot` |
| `src/preload/tauriTransport.ts` | Renderer-side snapshot bridge | Extend `SECRET_STORE_KEYS` deny-list → allow-list (D-08, Tauri path only); add a `storeChanged` listener that patches `snapshot` in place (D-06) |
| `src/backend/electron_store.ts` | `TypeCheckedStoreBackend` wrapper | Candidate location for a store-instance registry (Finding: needed for a generic write-handler lookup by `ValidStoreName`) |
| `src-tauri/src/main.rs` | Rust shell | **No changes required** — confirmed: `pushFrontendMessage`'s existing generic `frontendMessage` relay and the renderer's existing generic `listen()` already carry an arbitrary channel/payload |

### Package Legitimacy Audit

**Not applicable.** This phase installs no new npm or Cargo packages — it is a pure code-generalization phase operating entirely within existing project files (`fileStore.ts`, `handlers.ts`, `tauriTransport.ts`, `electron_store.ts`). No `slopcheck`/registry verification is needed.

## Architecture Patterns

### System Architecture Diagram (the generalized store round-trip)

```
Renderer boot (index.tsx)
  │
  ├─ tauriAttach.ts (window.api attached — Invariant A, unchanged)
  │
  ├─ hydrateStoreSnapshot()  ──invoke──▶  Tauri sidecar_store_snapshot command
  │        (awaited, 8s timeout)              │
  │                                            ▼
  │                                   Rust: state.invoke("sidecar:store-snapshot")
  │                                            │  (stdio JSON-RPC, unchanged shape)
  │                                            ▼
  │                              Sidecar: ipcMain.handle('sidecar:store-snapshot')
  │                                            │
  │                                            ├─ walks the DECLARED/DERIVED boot set (D-03/D-09)
  │                                            ├─ per store: raw_store, minus D-08 allow-listed fields
  │                                            └─ returns { [storeName]: safeFields }
  │        ◀──────────────────────── result ───┘
  │
  ├─ snapshot[storeName] populated (eager tier)
  │
  ▼
GlobalState / GlobalStateV2 constructors run
  │
  ├─ SYNC read of an EAGER store  → snapshotGet() returns real value
  │
  └─ SYNC read of a LAZY store    → snapshotGet() returns defaultValue
           │                          + DISTINCT warning logged (D-04)
           └─ kicks off async hydrate (new per-store fetch, not the boot snapshot)
                    │
                    ▼
           Sidecar: a new per-store invoke handler (or reused snapshot handler,
           scoped to one name) returns that store's safe fields
                    │
                    ▼
           snapshot[storeName] updated → next sync read is correct

Renderer WRITE path (new this phase)
  │
  ├─ TypeCheckedStoreFrontend.set() → window.api.storeSet(name, key, value)
  │        │
  │        ├─ optimistic: snapshot[name][key] = value (existing, unchanged)
  │        └─ send('storeSet', [name, key, value])  ──send──▶  Tauri sidecar_send
  │                                                              │
  │                                                              ▼
  │                                                   Sidecar: ipcMain.on('storeSet', ...)
  │                                                              │  ★ NEW — today this
  │                                                              │    handler does not exist;
  │                                                              │    the frame is dispatched
  │                                                              │    to an EMPTY listener
  │                                                              │    array and silently
  │                                                              │    vanishes (verified).
  │                                                              ▼
  │                                              storeRegistry.get(name)?.set(key, value)
  │                                                              │
  │                                                              ▼
  │                                              pushFrontendMessage('storeChanged',
  │                                                   { store: name, key, value })  (D-06)
  │                                                              │
  ◀──────────────────────────────────────────────────────────────┘
  renderer's storeChanged listener patches snapshot[name][key] = value
  (closes the loop even for the OPTIMISTIC writer itself — self-healing if the
   optimistic write and the confirmed write ever diverge)
```

### Recommended Project Structure

No new top-level directories needed. Suggested new/changed files:

```
src/backend/
├── electron_store.ts          # + optional store-instance registry keyed by ValidStoreName
├── sidecar/
│   ├── fileStore.ts            # + defaults handling, + re-read-on-access or path-keyed cache
│   ├── handlers.ts              # + storeSet/storeDelete/storeNow handlers, generalized snapshot
│   ├── storeAllowlist.ts        # NEW — single-sourced D-08 allow-list (replaces 3 duplicated
│   │                             #   deny-lists: tauriTransport.ts, misc.ts, handlers.ts L43)
│   └── storeRegistration.ts     # NEW (candidate) — explicit side-effect imports of every
│                                 #   electronStores.ts-style module so all TypeCheckedStoreBackend
│                                 #   instances exist in the sidecar process before any handler runs
├── wine/manager/
│   └── electronStores.ts        # NEW (candidate, Finding 2) — extract wineDownloaderInfoStore
│                                 #   out of utils.ts so it can be imported without the Wine
│                                 #   download/install pipeline
└── downloadmanager/
    └── electronStores.ts        # NEW (candidate, Finding 2) — extract downloadManager out of
                                   #   downloadqueue.ts so it can be imported without libraryManagerMap
```

### Pattern 1: Store-instance registry for generic write dispatch

**What:** Today `handlers.ts` reaches specific store instances by importing them by name (`import { configStore as steamConfigStore } from '../storeManagers/steam/electronStores'`). This does not scale to a generic `storeSet(storeName, key, value)` handler that must resolve an arbitrary `ValidStoreName` string to the right instance.
**When to use:** Any handler that must look up a store by its runtime name string (the new `storeSet`/`storeDelete`/generalized-snapshot handlers).
**Example (illustrative, not yet in the codebase):**
```typescript
// src/backend/electron_store.ts — TypeCheckedStoreBackend constructor, extended:
const storeRegistry = new Map<ValidStoreName, TypeCheckedStoreBackend<any>>()

export class TypeCheckedStoreBackend<Name extends ValidStoreName> ... {
  constructor(name: Name, options: Store.Options<StoreStructure[Name]>) {
    // @ts-expect-error ...
    this.store = new Store(options)
    storeRegistry.set(name, this)   // NEW — self-registers by logical name
  }
}
export { storeRegistry }
```
This still requires every `electronStores.ts`-style module to actually be **imported** (side-effect-only) into the sidecar process — the registry only fills as modules evaluate. See Pattern 2.

### Pattern 2: Force-import every store module without pulling in business logic

**What:** `steamFlowRegistration.ts` deliberately imports only `SteamLibraryManager`/`SteamGame`, not `storeManagers/index.ts`'s full `libraryManagerMap` (SEAM.md §3, unchanged this phase per Phase 30's scope). But a generalized store layer needs **every** `TypeCheckedStoreBackend` instance to exist, which today only happens as a side effect of importing each manager's business-logic modules.
**When to use:** A new sidecar-only module (e.g. `storeRegistration.ts`) that imports ONLY the light `electronStores.ts` files (gog, zoom, nile, sideload, humble, steam — all confirmed side-effect-light by inspection) directly, bypassing `games.ts`/`library.ts`/`user.ts` per manager.
**Constraint:** `wineDownloaderInfoStore` and `downloadManager` are NOT in isolated files today (Finding 2) — either accept importing their heavier host modules, or extract them first (see Project Structure above). `migrationsStore` is never constructed until `MigrationSystem.get()` is called — decide whether the migrations store belongs in the eager/lazy tier at all, or should simply be excluded from D-02's coverage bar with a documented reason (it has no renderer consumer today).

### Anti-Patterns to Avoid
- **Re-deriving each store's `cwd`/`name` in the sidecar handler code:** the correct source of truth is each store's own construction site. Don't hardcode a second copy of the cwd/name table in `handlers.ts` — that's exactly the kind of duplication D-08's own text calls out for `SECRET_STORE_KEYS` (declared in two places today) and is what led to `humbleConfigStore.csrfToken` slipping past the deny-list.
- **Assuming `StoreStructure`'s ~21 keys are the whole surface:** they are not (Finding 1). A `ValidStoreName`-only walk test passes while leaving `legendary_library`/`gog_library`/`nile_library`/`zoom_library`/`steam_library`/`steam_metadata`/`steam_sync`/6 humble CacheStores/`gog_api_info`/`gog_achievements`/`gog_install_info`/`zoom_install_info`/`nile_install_info`/`gog_playtime_sync_queue` completely untested — all of these flow through the identical `storeNew`/`storeGet`/`storeSet`/`storeDelete` sidecar surface with an arbitrary string name.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Backend→frontend push notification | A new Tauri event/command for store-change | The existing `sendFrontendMessage` → `frontend_message` relay | Confirmed generic already — zero Rust changes needed; `main.rs`'s reader treats any `kind: "frontendMessage"` frame identically regardless of channel name |
| Sidecar→Rust request/response | A new correlated-request mechanism | `requestRustInvoke()` (Phase 28's `rustInvoke` channel) | Only needed if a store operation ever needs Rust's answer — it doesn't for this phase (no Keychain/OS-level store operation involved) |
| Reactive store API (`onDidChange`) | A pub/sub abstraction on top of the new per-key event | Nothing — explicitly deferred (see Deferred Ideas) | D-06 only needs the substrate; GameLib doesn't use electron-store's `onDidChange` today, so building a public reactive API is scope creep |
| Atomic file writes | A custom fsync/lockfile scheme | Node's own `writeFileSync` to a temp path + `renameSync` (POSIX/NTFS atomic rename) | Standard, no new dependency; this is D-10's discretion, not a new library decision |

**Key insight:** every piece of "new" infrastructure this phase seems to need (push channel, request/response channel) already exists from Phase 27/28. The actual net-new code is: (1) three IPC handlers, (2) a store-instance registry, (3) an allow-list table, (4) fidelity fixes to `fileStore.ts`. Resist the urge to design new transport primitives.

## Common Pitfalls

### Pitfall 1: The `storeSet`/`storeDelete` write is not merely "unported" — it is invisibly swallowed
**What goes wrong:** Unlike the ~217 other unported endpoints (which are `invoke`-kind and get a loud, marker-tagged rejection via `UNPORTED_CHANNEL_MARKER`), `snapshotSet`/`snapshotDelete` call `send('storeSet', ...)`/`send('storeDelete', ...)` — a **fire-and-forget `send`-kind frame**. `sidecarRpc.ts`'s `dispatchSend()` looks up `listenerRegistry.get('storeSet')`, finds an empty array (no `ipcMain.on('storeSet', ...)` registered anywhere today — confirmed by reading all of `handlers.ts`), and iterates zero times. No error, no log, no rejected promise — the write vanishes with **zero observable signal anywhere**, worse than every other unported channel in the codebase.
**Why it happens:** `send`-kind frames never produce a response frame by design (mirrors `ipcRenderer.send`'s fire-and-forget contract) — there is no promise to reject.
**How to avoid:** Register real `ipcMain.on('storeSet', ...)`/`ipcMain.on('storeDelete', ...)` listeners in `handlers.ts` (D-05's explicit deliverable). Verify by writing a value, then reading it back through a *second*, freshly-hydrated snapshot fetch — not just checking that the optimistic local write is visible (that would pass even with today's broken swallow-everything behavior).
**Warning signs:** A UI action appears to succeed (optimistic snapshot update) but the change is gone after an app restart or a `hydrateStoreSnapshot()` re-fetch.

### Pitfall 2: `StoreStructure`'s ~21 names understate the real store surface by roughly 2x
**What goes wrong:** `common/types/electron_store.ts`'s `StoreStructure` interface has exactly **21** keys (not "~18" as 29-CONTEXT.md's own text says — confirmed by direct count): `configStore`, `wineDownloaderInfoStore`, `gogInstalledGamesStore`, `zoomInstalledGamesStore`, `timestampStore`, `fontsStore`, `gogConfigStore`, `zoomConfigStore`, `steamConfigStore`, `steamBottleConfigStore`, `nileConfigStore`, `humbleConfigStore`, `sideloadedStore`, `downloadManager`, `gogSyncStore`, `zoomSyncStore`, `gogPrivateBranches`, `wikigameinfo`, `uploadedLogs`, `migrationsStore`, `gameOverridesStore`. But `storeNew`/`storeGet`/`storeSet`/`storeDelete`/`storeHas` in `misc.ts` all type their `storeName` parameter as a **bare `string`**, not `ValidStoreName` — so every `CacheStore` instance (frontend `helpers/electronStores.ts` and backend `cache.ts`, both constructed with an arbitrary filename string) flows through the exact same sidecar surface, untyped and unenumerated. Concretely, at least 19 additional dynamic-named stores exist: `legendary_library`, `gog_library`, `gog_api_info`, `gog_achievements`, `gog_install_info`, `gog_playtime_sync_queue`, `zoom_library`, `zoom_install_info`, `nile_library`, `nile_install_info`, `steam_library`, `steam_metadata`, `steam_sync`, `humble_library`, `humble_sync`, `humble_revealed`, `humble_ownership_override`, `humble_gifted_at`, `humble_audit`, `humble_local_redeemed`, `humble_notified_expiration`.
**Why it happens:** `CacheStore` (both frontend and backend versions) was designed as a lighter-weight cache abstraction with its own filename convention, layered on top of the SAME `window.api.storeNew`/`storeGet` IPC surface as the typed stores — it was never folded into `StoreStructure`'s type-checking.
**How to avoid:** D-02's "walk every `ValidStoreName`" test needs a **second**, explicitly-named list of CacheStore filenames alongside the `ValidStoreName` walk — enumerate both in the plan. Two additionally-confirmed oddities within `StoreStructure` itself: `fontsStore` has **zero construction sites anywhere in the backend** (dead/unused — confirmed via grep, `new TypeCheckedStoreBackend('fontsStore', ...)` does not exist), and `wikigameinfo`'s real implementation is a `CacheStore` (`wiki_game_info/electronStore.ts`), **not** a `TypeCheckedStoreBackend` — it only coincidentally shares its name with the `StoreStructure` key. The planner should decide whether to fix `fontsStore`'s dead entry or explicitly exclude it from the coverage test with a documented reason.
**Warning signs:** A D-02 completion test that only imports `ValidStoreName` from `common/types/electron_store` and calls it "every store" — this passes while a majority of actually-used, actually-Tauri-routed stores remain unverified.

### Pitfall 3: In-process same-file collision between `steamConfigStore` and `steamBottleConfigStore` — safe today, unsafe once `fileStore.ts` grows
**What goes wrong:** `steam/electronStores.ts` constructs both `configStore` (as `'steamConfigStore'`) and `steamBottleConfigStore` with `{ cwd: 'steam_store' }` and **neither passes `options.name`**. `node_modules/electron-store/index.js:52` hardcodes the default `name: 'config'` when omitted — confirmed by reading the installed package source. So both logical stores resolve to the identical on-disk path `steam_store/config.json`. In the real Electron build this is harmless: `conf`'s `get store()` (`node_modules/conf/dist/source/index.js:274`) re-reads the file fresh via `fs.readFileSync` on every single access, so two `Store` instances sharing a file always merge against the current on-disk state. `fileStore.ts`, however, loads `this.data` **once at construction** (`this.data = this.load()` in the constructor) and every subsequent `.get()`/`.set()`/`.delete()` mutates that same in-memory snapshot, persisting a **full overwrite with no re-read** — so if `steamConfigStore.set(...)` and `steamBottleConfigStore.set(...)` both run against the sidecar after construction, the second write's full-object overwrite silently erases whatever the first write persisted (each instance's `this.data` is a stale, divergent copy of the same file from the moment both were constructed).
**Why it happens:** `fileStore.ts` was written as a minimal skeleton stub for a 2-store read path where this never mattered; it doesn't currently need to handle two DIFFERENT logical stores sharing a physical file, because only one of the pair (`steamConfigStore`) is touched by anything today.
**How to avoid:** Fix `fileStore.ts` before or alongside generalizing the write path — either (a) re-read `this.data` from disk before every `get`/`set`/`has`/`delete` (matches `conf`'s model, simple, more I/O), or (b) keep a **path-keyed** singleton cache inside `fileStore.ts` (`Map<filePath, FileStore>`) so two `TypeCheckedStoreBackend` instances that resolve to the same file share ONE in-memory `FileStore` object — this is likely the better fix since it also naturally solves the "two instances = two independently-cached copies" problem for ANY future same-path pair, not just this one.
**Warning signs:** A regression test that constructs `steamConfigStore` then `steamBottleConfigStore`, writes a distinct key to each, and asserts BOTH keys survive a fresh read of either instance — this specific test does not exist yet and should be added as part of D-02's coverage work.

### Pitfall 4: `TypeCheckedStoreBackend`'s constructor drops its own `name` parameter — the logical ValidStoreName is NOT the on-disk filename
**What goes wrong:** `TypeCheckedStoreBackend`'s constructor signature is `constructor(name: Name, options: Store.Options<...>)`, but the body is `this.store = new Store(options)` — `name` (e.g. `'timestampStore'`) is used only for TypeScript's generic parameter, never forwarded into the real store's options. The on-disk filename is governed **purely** by `options.cwd` + `options.name` (which defaults to `'config'` if omitted) — completely independent of the `ValidStoreName` string. `fileStore.ts`'s own `resolveStorePath()` already replicates this convention correctly (`const name = options.name ?? 'config'`) — this is not a bug to fix, but a subtlety a generic write-handler MUST respect: a lookup keyed by `ValidStoreName` (e.g. via the Pattern 1 registry) must resolve to the actual constructed instance, never re-derive a path from the name string itself.
**How to avoid:** Always dispatch writes through the instance registry (Pattern 1), never by reconstructing `{cwd, name}` from the `ValidStoreName` in a second place.
**Warning signs:** A new store handler that tries to compute a file path from the store name via a hardcoded switch statement — this will silently diverge from the real construction options the moment any electronStores.ts file changes its `cwd`/`name`.

### Pitfall 5: Jest suites that construct a real `fileStore.ts`/`configStore` can destroy a developer's live Steam session
**What goes wrong:** Documented, hardware-confirmed incident (see project memory `tests-clobbering-real-steam-store` and `electronUntouched.test.ts`'s own header): a test suite that drives the REAL, unmocked `configStore`/`fileStore.ts` without overriding `os.homedir()` writes to the developer's actual `~/Library/Application Support/GameLib/...` — a previous version of a proof suite wiped a real refresh token this way, and the restore-in-`afterAll` safety net does NOT run when a Jest worker is force-killed (this repo has a known leaked-timer crash in `storeManagers/steam/library.ts` that triggers exactly that).
**Why it happens:** The project-wide safe default — `src/backend/__mocks__/electron-store.ts` (a Jest manual mock auto-applied to node_modules imports, redirecting `cwd` into a real `tmp.dirSync()` temp directory) — is bypassed the moment a test needs the REAL sidecar shims (`jest.mock('electron', () => jest.requireActual('../electronStub'))` / `jest.mock('electron-store', () => ({ default: jest.requireActual('../fileStore').default }))`), because `fileStore.ts` resolves its path via `pathShim.ts`'s raw `homedir()` with **no test-injectable override**.
**How to avoid — the proven safe pattern** (confirmed in `skeletonFlows.test.ts` and `electronUntouched.test.ts`, both currently in the repo):
```typescript
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () => path.join(actual.tmpdir(), `gamelib-<suite-name>-test-home-${process.pid}`)
  }
})
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))
```
D-02's new "walk every store" test MUST use this exact three-mock combination (`os` + `electron` + `electron-store`), never just the two latter mocks alone. `electronUntouched.test.ts` additionally demonstrates the fallback discipline for any test that, for some other reason, MUST touch the real config path: read-only, byte-comparison assertions, never a `.set()`/`.delete()`/`.clear()` call.
**Warning signs:** A new test file under `src/backend/sidecar/__tests__/` that mocks `electron`/`electron-store` to point at the real shims but omits the `os` mock — this is the exact shape of the incident that already happened once.

### Pitfall 6: Sidecar process construction gaps — most stores don't exist in the sidecar process yet
**What goes wrong:** `steamFlowRegistration.ts` (imported by `handlers.ts`) deliberately imports only `SteamLibraryManager`/`SteamGame` — NOT `storeManagers/index.ts`'s `libraryManagerMap` (SEAM.md §3, explicit and intentional). This means GOG/Zoom/Nile/Sideload/Humble's `electronStores.ts` modules, `wine/manager/utils.ts`, `downloadqueue.ts`, `logger/uploader.ts`, `game_overrides/electronStores.ts`, and `migration/index.ts` are **never imported into the sidecar process today** — their `TypeCheckedStoreBackend`/`CacheStore` construction never runs, so there is currently no live instance to read/write for any of these stores in a running sidecar.
**Why it happens:** Phase 27 deliberately minimized the sidecar's import surface to the two flows it needed (Steam read + Steam launch).
**How to avoid:** This phase must add an explicit, side-effect-only import step (new module, e.g. `storeRegistration.ts`, imported from `handlers.ts` or `bootstrap.ts`) that pulls in every `electronStores.ts`-style file. Verify each one is genuinely side-effect-light before importing it wholesale — `wine/manager/utils.ts` and `downloadqueue.ts` are NOT (Finding 2) and need extraction first, or a conscious decision to accept their heavier imports.
**Warning signs:** A generalized snapshot/write handler that "works" in a unit test (because the test file directly imports the specific electronStores.ts under test) but returns nothing/fails silently in the real running sidecar, because that module was never actually imported by the production bootstrap chain.

## Code Examples

### The existing silent-swallow (current behavior, to be fixed)
```typescript
// src/preload/tauriTransport.ts:189-199 (unchanged input this phase must fix downstream of)
export function snapshotSet(storeName: string, key: string, value?: unknown): void {
  if (!snapshot[storeName]) snapshot[storeName] = {}
  snapshot[storeName][key] = value
  send('storeSet', [storeName, key, value])   // → sidecarRpc.ts dispatchSend() →
}                                               //   listenerRegistry.get('storeSet') ?? []
                                                //   → empty array → no-op, no error, no log
```

### The existing generic push mechanism (reused verbatim for D-06, zero Rust changes)
```typescript
// src/backend/sidecar/sidecarRpc.ts:224-234 — ALREADY generic over `channel`
export function pushFrontendMessage(channel: string, ...args: unknown[]): void {
  const notification: SidecarNotification = { kind: 'frontendMessage', channel, args }
  writeLine(notification)
}
// src-tauri/src/main.rs:397-414 — the reader thread's frontendMessage branch is ALREADY
// generic over `channel`/`args` — confirmed no match on a fixed channel name.
```

### The existing safe store-isolation pattern for the new D-02 coverage test
```typescript
// Source: src/backend/sidecar/__tests__/skeletonFlows.test.ts:72-91 (verbatim pattern to reuse)
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () => path.join(actual.tmpdir(), `gamelib-storelayer-test-home-${process.pid}`)
  }
})
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))
```

## State of the Art

| Old Approach | Current/Recommended Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 2-store hardcoded snapshot handler (`configStore`, `steamConfigStore`) | Generalized handler walking a boot-set list + lazy per-store fetch | This phase | Later IPC slices (Phase 30+) get real config instead of extending the snapshot ad hoc, per SEAM.md's own incremental-port checklist step 4 |
| 2-key hardcoded deny-list (`SECRET_STORE_KEYS`, duplicated in 2 files) | Single-sourced allow-list (D-08) | This phase | Closes the `humbleConfigStore.csrfToken` class of leak by construction, not by remembering to update a deny-list |
| Writes silently vanish (`send('storeSet', ...)` with no listener) | Real `storeSet`/`storeDelete` handlers + confirmed-write push | This phase | The renderer's optimistic UI state stops silently diverging from the persisted state |

**Deprecated/outdated:** N/A — this is an internal architecture phase, not a library upgrade.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The exhaustive list of `CacheStore`-backed dynamic store names (Pitfall 2) is complete — derived by grepping every `new CacheStore(` call site found during this research session. A store manager file not read in this session could add more. | Pitfall 2, Standard Stack | D-02's coverage test could still miss a store if the enumeration is incomplete; the planner should re-grep `new CacheStore(` across the full `src/backend` and `src/frontend` trees as a verification step before finalizing the test list. |
| A2 | `conf`'s `get store()` re-reading fresh from disk on every access (confirmed for the installed `node_modules/conf` version) is the SAME behavior across all `conf`/`electron-store` versions the project might upgrade to. Not verified against `conf`'s changelog. | Pitfall 3 | Low — this only affects the framing of "why the real Electron build is safe"; it does not change what fix `fileStore.ts` needs. |
| A3 | No other `StoreStructure` pair besides `steamConfigStore`/`steamBottleConfigStore` shares a `{cwd, name}` combination. Verified by manually cross-referencing every construction site's `cwd`/`name` options found in this session (11 `TypeCheckedStoreBackend` sites read in full). | Pitfall 3 | If a construction site was missed, another silent collision could exist undetected. Low risk — every backend `new TypeCheckedStoreBackend(` grep hit was read in full during this session. |

**If this table is empty:** N/A — three assumptions logged above, all low-risk and independently verifiable by the planner with a fresh grep.

## Open Questions (RESOLVED)

> All four were answered by the post-research decision round (29-CONTEXT.md D-13/D-14/D-15)
> and by `/gsd-plan-phase 29`. Resolutions are noted inline below; nothing here is still open.


1. **Do the 19 CacheStore-backed dynamic stores count toward D-02's "every store round-trips" bar, or is D-02 scoped strictly to `ValidStoreName`?**
   - **RESOLVED: D-13.** The four boot-set names (`legendary_library`, `gog_library`, `nile_library`, `zoom_library`) are IN the bar and are covered by plan 29-04's walk test; the other ~15 ride D-03's lazy tier without a coverage guarantee.
   - What we know: they flow through the identical `storeNew`/`storeGet`/`storeSet`/`storeDelete` sidecar surface; 4 of them (`legendary_library`, `gog_library`, `nile_library`, `zoom_library`) are read synchronously in `GlobalState`'s constructor today (part of the real boot set).
   - What's unclear: 29-CONTEXT.md's own text ("all ~18 `ValidStoreName` stores") only mentions the typed set.
   - Recommendation: the planner should explicitly widen D-02's completion bar to include at minimum the 4 boot-set CacheStore names, and ideally all 19, in the coverage test — otherwise a "phase complete" claim would be measurably false against what the frontend actually does at boot.

2. **How should `wineDownloaderInfoStore`, `downloadManager`, and `migrationsStore` be made constructible in the sidecar without reintroducing the heavier business-logic modules Phase 27 avoided?**
   - **RESOLVED: D-15 (extraction), plan 29-02.** All three move into thin `electronStores.ts` modules. Planning added a FOURTH extraction for `uploadedLogs` (`src/backend/logger/electronStores.ts`) for the same reason, so `storeRegistration.ts` imports zero host modules and D-02's bar needs no exclusion. `migrationsStore` is NOT excluded — the recommendation to drop it was superseded.
   - What we know: all three are declared inside modules with real business-logic side effects (Wine download pipeline, `libraryManagerMap`, a lazily-constructed migration singleton respectively).
   - What's unclear: whether extraction into a dedicated `electronStores.ts` (a genuine refactor of existing modules, arguably justified as "the file this store's construction should have always lived in") is in scope for this phase, or whether accepting the heavier import is preferable.
   - Recommendation: extract `wineDownloaderInfoStore` and `downloadManager` into sibling `electronStores.ts` files (low-risk, mechanical — the store declarations have no dependency on the rest of their host module's logic); leave `migrationsStore` out of the eager tier entirely (nothing reads it from the renderer today) with a documented one-line reason in the coverage test.

3. **Should `fileStore.ts`'s in-memory caching model change to re-read-on-access (matching `conf`) or to a path-keyed singleton?**
   - **RESOLVED: D-14 — path-keyed.** Plan 29-01 implements a path-keyed shared data cell (`cellRegistry`); re-read-on-access was rejected for adding a disk read to a synchronous mount-time path.
   - What we know: either fixes the `steamConfigStore`/`steamBottleConfigStore` collision (Pitfall 3); re-read-on-access is a smaller diff but adds a disk read to every `.get()`/`.has()` call (currently zero-cost after construction); a path-keyed singleton adds a small registry but preserves the current all-in-memory performance characteristic.
   - What's unclear: whether any call site depends on `fileStore.ts`'s current "in-memory, cheap repeated reads" performance characteristic strongly enough that read-on-every-access would be a regression (unlikely at this store's data volumes, but not measured).
   - Recommendation: the path-keyed singleton is very likely the better fix — it removes the divergent-copy risk entirely for ANY future same-path pair (not just this one instance), and it doesn't add disk I/O to hot-path reads. Flag to the planner as the default recommendation, not a coin flip.

4. **Does D-08's allow-list also need to state a policy for the ~19 CacheStore-backed stores' fields, or are none of them secret?**
   - **RESOLVED: plan 29-03.** `storePolicy.ts` defaults cache stores to `'*'` and carries an explicit `DENIED_CACHE_STORES` list containing `humble_library`, so its internal-only `revealedKeyValue`/`keyindex` entries cannot bypass `library.ts`'s `getKeys()` projection.
   - What we know: none of the CacheStore names identified (game/library caches, sync timestamps, Humble's revealed/audit/redeemed/gifted/ownership-override records) obviously carry a raw secret comparable to `refreshToken`/`sessionCookie`/`csrfToken`. Humble's `humbleLibraryStore` entries carry an internal-only `revealedKeyValue` field per `HumbleKeyInternal` (see `humble/electronStores.ts`'s own doc comment: "library.ts's getKeys() display projection strips these two fields before any IPC broadcast" — i.e., filtering already happens at the library-manager layer, not the store layer).
   - What's unclear: whether the store-layer allow-list should ALSO gate `humble_library`'s `revealedKeyValue`/`keyindex` fields as defense-in-depth (matching the two-layer pattern D-08 preserves for `refreshToken`/`csrfToken`), given this phase generalizes the exact kind of raw `raw_store`-style snapshot access that could bypass `library.ts`'s existing projection if a future caller reads the CacheStore's snapshot directly instead of going through `getKeys()`.
   - Recommendation: extend the allow-list's audit to explicitly note `humble_library`'s two internal-only fields as a DENIED-by-the-allow-list case, even though they are not literally `StoreStructure` fields — the CacheStore's raw entries flow through the same eventual sidecar surface once CacheStore names are folded into the generalized layer (Open Question 1).

## Environment Availability

Skipped — no external tool/service/runtime dependencies for this phase. All work is internal TypeScript/Rust code already present in the repository; `node`, `cargo`, `tauri` CLI availability was already established and hardware-verified in Phases 27/28.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (project-wide; sidecar-specific suites under `src/backend/sidecar/__tests__/`) |
| Config file | `jest.config.js` (repo root; not re-read this session — inherited, unchanged) |
| Quick run command | `npx jest src/backend/sidecar/__tests__/skeletonFlows.test.ts` (or the new coverage test file once created) |
| Full suite command | `npx jest src/backend/sidecar` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-29-01 | Every `ValidStoreName` + boot-set CacheStore name round-trips get/set/delete/raw_store | integration | `npx jest src/backend/sidecar/__tests__/storeLayer.test.ts` | ❌ Wave 0 (new file) |
| REQ-29-02 | A lazy-tier sync read returns default + a distinct, greppable warning; a later async hydrate corrects it | integration | `npx jest src/backend/sidecar/__tests__/storeLayer.test.ts -t "lazy hydrate"` | ❌ Wave 0 (same new file, additional `describe` block) |
| REQ-29-03 | `storeSet`/`storeDelete` persist AND push a `storeChanged` notification the renderer can observe | integration | `npx jest src/backend/sidecar/__tests__/skeletonFlows.test.ts -t "storeSet"` (extend existing suite) OR new file | ⚠️ Extend existing `skeletonFlows.test.ts`, or Wave 0 new file |
| REQ-29-04 | The allow-list excludes every named secret field (`refreshToken`, `sessionCookie`, `csrfToken`, and any Open-Question-4 additions) from any snapshot response | integration | `npx jest src/backend/sidecar/__tests__/storeLayer.test.ts -t "allow-list"` | ❌ Wave 0 |
| REQ-29-05 | D-07's write-clobber constraint is documented (a text/comment-presence assertion, not a runtime behavior test) | manual/doc-check | N/A — verified by reading SEAM.md/`fileStore.ts` comments during code review | N/A |
| REQ-29-06 (Pitfall 3 regression) | `steamConfigStore` and `steamBottleConfigStore` (or the chosen fix) do not clobber each other's writes | unit | `npx jest src/backend/sidecar/__tests__/fileStore.test.ts -t "same-path collision"` | ❌ Wave 0 (no `fileStore.test.ts` exists today — confirmed by directory listing) |

### Sampling Rate
- **Per task commit:** the specific new/extended test file for that task (`npx jest <file>`).
- **Per wave merge:** `npx jest src/backend/sidecar` (full sidecar suite, ~5 files).
- **Phase gate:** full suite green (`npx jest src/backend/sidecar src/preload/__tests__/tauriTransport.test.ts`) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `src/backend/sidecar/__tests__/storeLayer.test.ts` — new file covering REQ-29-01/02/04, using the Pitfall 5 three-mock isolation pattern (`os`+`electron`+`electron-store`).
- [ ] `src/backend/sidecar/__tests__/fileStore.test.ts` — new file (none exists today, confirmed) covering `fileStore.ts`'s own unit behavior in isolation, including the Pitfall 3 same-path-collision regression test.
- [ ] Extend `src/backend/sidecar/__tests__/skeletonFlows.test.ts` — add storeSet/storeDelete round-trip + storeChanged push assertions to the existing real-shim end-to-end suite (REQ-29-03).
- [ ] Extend `src/preload/__tests__/tauriTransport.test.ts` — add an assertion that a `storeChanged` notification patches the in-memory `snapshot` (currently only tests `hydrateStoreSnapshot`/`snapshotGet`/the generic `frontendListenerSlot` push, not a store-specific patch).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | This phase touches no auth flow (Steam login is Phase 28/deferred login-channel scope) |
| V3 Session Management | No | N/A |
| V4 Access Control | Yes | The D-08 allow-list itself IS the access-control mechanism for renderer-reachable config data — must fail closed (undeclared field = excluded) |
| V5 Input Validation | Yes | `storeSet(storeName, key, value)` accepts an arbitrary string `storeName`/`key` from the renderer — the sidecar handler must validate against the known registry (Pattern 1) rather than blindly constructing/writing an arbitrary path, preserving T-27-03's existing path-tampering guard in `resolveStorePath()` |
| V6 Cryptography | No | No new crypto surface — secret fields (`refreshToken` etc.) are already handled by Phase 28's keyring path; this phase only decides which FIELDS are visible to the renderer, not how they're encrypted |

### Known Threat Patterns for this phase's stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A compromised renderer script calls `window.api.storeGet(arbitraryStoreName, arbitraryKey)` to exfiltrate a field the allow-list didn't anticipate | Information Disclosure | D-08's allow-list (fail-closed: undeclared = excluded) is the correct shape; verify it is enforced identically in both the eager snapshot handler AND any new per-store lazy-fetch handler — a common gap is enforcing the filter in one but not the other |
| A malformed/malicious `storeSet` RPC frame with a `storeName` not in the known registry | Tampering | The new write handler must look up the target via the Pattern 1 registry and no-op (or reject) on an unknown name, rather than attempting to construct a new store on the fly from attacker-controlled `cwd`/`name` — mirrors `resolveStorePath()`'s existing T-27-03 guard, which must not be weakened by this generalization |
| The write choke point silently drops a write under load/error (regression of Pitfall 1's current silent-swallow bug, just relocated) | Repudiation | The new handler should log (or push a failure notification) on any internal error during `.set()`/`.delete()`, so a write failure is at minimum observable in sidecar logs, never purely silent |

## Sources

### Primary (HIGH confidence — direct source inspection this session)
- `src/backend/sidecar/fileStore.ts` — full read, in-memory caching model confirmed
- `src/common/types/electron_store.ts` — `StoreStructure`, exact 21-key count confirmed by direct enumeration
- `src/backend/electron_store.ts` — `TypeCheckedStoreBackend`, name-drop behavior confirmed
- `src/backend/sidecar/handlers.ts` — confirmed no `storeSet`/`storeDelete`/`storeNow` handler exists today
- `src/preload/tauriTransport.ts` — confirmed `send('storeSet', ...)`/`send('storeDelete', ...)` fire-and-forget shape
- `src/preload/api/misc.ts` — confirmed `storeName: string` (untyped against `ValidStoreName`)
- `src/backend/sidecar/sidecarRpc.ts` — confirmed `dispatchSend()`'s empty-listener-array silent no-op behavior
- `src/backend/sidecar/electronStub.ts` — confirmed `ipcMain.on`/`listenerRegistry` exists and is the correct registration point
- `src-tauri/src/main.rs` — confirmed the `frontendMessage` relay is already channel-name-generic (no Rust change needed for D-06)
- `src/frontend/state/GlobalState.tsx` (full read) — the empirical boot-set enumeration (Finding 1)
- `src/frontend/state/GlobalStateV2.ts` — confirmed `gameOverridesStore` read at zustand-store-creation time (part of the boot set)
- `src/frontend/helpers/electronStores.ts` — confirmed `CacheStore`'s dynamic-name pattern and its use of `window.api.storeNew`
- All ~14 backend `electronStores.ts`/inline-store-declaration files (steam, gog, zoom, nile, sideload, humble, game_overrides, key_value_stores, wine/manager/utils.ts, downloadqueue.ts, migration/index.ts, logger/uploader.ts, cache.ts, wiki_game_info/electronStore.ts) — full or targeted reads, cwd/name options and construction-site weight assessed
- `node_modules/electron-store/index.js` — confirmed the hardcoded `name: 'config'` default (line 52) and `options.configName = options.name` passthrough (line 66)
- `node_modules/conf/dist/source/index.js` — confirmed `get store()`'s fresh `fs.readFileSync` on every access (line 274), the basis for Pitfall 3's Electron-vs-sidecar divergence claim
- `src/backend/sidecar/__tests__/skeletonFlows.test.ts` — full header + Test 4 read; the safe test-isolation pattern (Pitfall 5)
- `src/backend/sidecar/__tests__/electronUntouched.test.ts` — header read; the read-only proof-suite convention
- `src/backend/__mocks__/electron-store.ts` — the project-wide default-safe test mock (tmp-dir redirect)
- `src/backend/humble/__tests__/library.realstore.test.ts` — confirmed the alternate `jest.mock('electron-store')` auto-mock convention used elsewhere in the project
- `.planning/config.json` — confirmed `workflow.nyquist_validation: true` and no `security_enforcement` key (both sections included per the enabled-by-default rule)

### Secondary (MEDIUM confidence)
- None — no WebSearch/Context7 lookups were needed this session; the entire domain is internal project architecture, and D-01 already forecloses the one external-library question (Rust store vs Node) this phase's ROADMAP text raised.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; every file/line cited was read directly this session.
- Architecture: HIGH — the diagram and patterns are derived from tracing the actual current transport code (`sidecarRpc.ts`, `main.rs`, `tauriTransport.ts`), not inferred from documentation.
- Pitfalls: HIGH — all six pitfalls are backed by specific file:line evidence gathered this session, including two (Pitfall 2's 21-vs-18 count, Pitfall 3's same-file collision) that contradict or refine claims in 29-CONTEXT.md itself.

**Research date:** 2026-07-22
**Valid until:** Should remain valid for the life of this phase (internal codebase facts don't go stale like external library docs do) — re-verify only if another phase touches `fileStore.ts`, `electronStores.ts` construction sites, or `StoreStructure` before Phase 29 is planned/executed.
