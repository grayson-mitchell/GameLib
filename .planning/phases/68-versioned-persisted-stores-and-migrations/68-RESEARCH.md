# Phase 68: Versioned persisted stores and migrations - Research

**Researched:** 2026-11-08
**Domain:** Local JSON persistence, schema versioning, in-process migrations, read-only degradation (Node sidecar, `conf`-backed stores)
**Confidence:** HIGH on the codebase findings (all read from source this session); MEDIUM on the recommended design (a design, not a verified library pattern)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Discard vs migrate**
- **D-01: Each store declares its kind where it is constructed:** a refetchable cache (discarded on a version mismatch) or user state (migrated). A test fails if any registered store omits the declaration, so a new store cannot skip the choice. Classification by directory does not work: `store_cache/` holds Humble audit, locally-redeemed, gifted-at, settle-declined and notified-expiration state, and the Steam pending-adoption and restart-hold state, none of which can be refetched.
- **D-02: The library caches are must-migrate,** so the offline Library survives an upgrade: Steam, GOG, Epic (legendary), Amazon (nile) and sideload `GameInfo[]` caches, on both the backend and the renderer-mirror declarations (`src/frontend/helpers/stores.ts`). Only true lookup caches are discardable: store metadata, artwork, the CrossOver index, PCI ids, wiki / umu info, GOG API info and similar. The planner lists every store with its kind.

**Downgrade behaviour**
- **D-03: An older build that opens a store file with a version higher than it knows reads what it understands and refuses to write that file.** It logs one line per affected store. The newer data survives untouched for when the user upgrades again; changes made in the older build to that store are lost (accepted).
- **D-04: Migrations do a clean rewrite.** A migration replaces old fields outright rather than keeping them beside the new shape. This departs from Phase 61's precedent (`wineVersion` kept on disk, Engine computed at read time); the operator chose tidy files over older-build readability, and D-03 already keeps an older build from writing over a newer file.
- **D-05: The user sees one notice per launch** while any store is read-only, through the existing bottom-right notice stack, e.g. "This data was saved by a newer GameLib, so changes won't be saved. Update GameLib to keep them."
- Accepted limitation: builds released before Phase 68 have no version check and will read and write newer files freely. Nothing can fix that retroactively; D-03 holds from the first build that ships this phase.

**Failed migration**
- **D-06: A failed migration leaves the store on its old data, read-only.** The pre-migration file is untouched (and backed up per D-08), writes to that store are refused, and the migration is retried on the next launch, so a fixed build can migrate the original. The store does not fall back to defaults.
- **D-07: The user sees the same notice as a downgrade (D-05),** naming the affected area (e.g. "Steam library") and pointing to the log. One notice per launch covers every read-only store, whatever the cause.
- **D-08: Keep the last 3 pre-migration backups per store,** next to the store file (e.g. `config.v2.bak.json`), pruning the oldest when a new one is written. Backups of token-bearing stores (`steam_store/`, `humble_store/`) get the same `0o600` file / `0o700` directory modes `fileStore.ts` applies (WR-06).
- Risk for research: under D-06, code that expects the new shape reads old-shape data. The researcher should establish how readers of a must-migrate store behave on old-shape data and whether the read-only store needs to present an empty / default view to new-shape readers instead, without writing.

**Which files count**
- **D-09: In scope: the ~19 persisted store modules** (every `TypeCheckedStoreBackend` and `CacheStore` declaration, including the renderer mirrors in `src/frontend/helpers/stores.ts`) **plus global settings (`src/backend/config.ts`) and per-game settings (`src/backend/game_config.ts`).**
- **D-10: The two settings writers move onto the new system.** Both already carry Heroic's `version` field, per-version loader classes and an `upgrade()` step, but only `v0` exists, so it has never run. Replace that per-class versioning with the same migrations, backup, read-only and downgrade rules as the stores, using the existing `version` field as the starting point (an absent field already means `v0`). An unknown (newer) version currently hits the "Invalid config version" error path; it must follow D-03 instead.
- **D-11: Fold the two ad hoc `config.ts` fix-ups into ordered migrations:** `migrateTrayIconVariant` (`src/common/trayIconVariant.ts`) and `migrateFocusRowSelection` (`src/common/focusRowMigration.ts`). `appShellFlowRegistration.ts:250` also calls `migrateTrayIconVariant` at read time; the planner decides whether that call stays as a read-side normaliser or goes.
- **D-12: Inventory everything else, migrate none of it.** The plan lists every other persisted GameLib file and renderer `localStorage` key with its owner and a verdict: rebuildable cache, needs versioning later, or not user data. Any that holds user data gets a todo in `.planning/todos/pending/` (with `severity:`, `platform:`, `ready:` per the repo convention). Starting points: about 20 backend modules write their own JSON (e.g. `steam/bridge/bridgeConfig.ts`, `engine/engineSwitch.ts`, `engine/fallbackEngine.ts`, `steam/macSteamOffline.ts`, `knownFixOverlayInstall.ts`, `save_sync.ts`), and 9 renderer files use `localStorage`.

### Claude's Discretion
- **Where and when migrations run.** Not asked; a technical choice for research and planning, constrained by D-03/D-06 and by this fact: every `FileStore` loads its JSON in its constructor, and the sidecar constructs every store at module scope when `./handlers` is imported (`storeRegistration.ts`), before `init()` runs. Today's `MigrationSystem.applyMigrations()` is floated, not awaited, from `bootstrap.ts:848`, after the stores have loaded. So "before first read" means migrating inside file load (e.g. in `FileStore`'s constructor / `load()`, keyed by resolved path) or before `./handlers` is imported, not reusing today's hook. The renderer never reads files directly (it reads through the sidecar's store snapshot and `storeWriteHandlers.ts` writes), so migrations are sidecar-only, but the read-only rule must also cover renderer writes arriving through `storeWriteHandlers.ts`. **(See Finding 1: the `FileStore` premise in this paragraph is wrong for the shipping build.)**
- **Where the version lives.** Inside each file (and hidden from the renderer snapshot and `CacheStore.entries()`, the way `__timestamp` keys are) or in a central registry. Must work for D-03, where the older build has to know the file is newer.
- **The existing named-migration runner** (`src/backend/migration/`, one migration, `LegendaryGlobalConfigFolderMigration`): keep it for one-off cross-file moves beside the per-store versioned migrations, or fold it in.
- **Shared-path stores:** `steamConfigStore` and `steamBottleConfigStore` resolve to the same file (`steam_store/config.json`, D-14 in `fileStore.ts`), so they need one version and one migration chain, not two.
- Test shape: one test per migration from a fixture of the old shape (roadmap requirement), plus the D-01 every-store-declares-its-kind test.

### Deferred Ideas (OUT OF SCOPE)
- Versioning the persisted files found by the D-12 inventory: todos, not this phase.
- Reviewed todo not folded: `2026-11-05-downloads-history-lost-on-tab-return.md` (undiagnosed `downloadManager` `'finished'` bug; stays separate).
- Out of scope per the phase boundary: Keychain secrets (`humbleSecretStore.ts`, `steamgridSecretStore.ts`), files owned by external tools (legendary, gogdl, nile, CrossOver bottles), and actually migrating the D-12 files.
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are mapped to this phase (TBD in ROADMAP). CONTEXT.md decisions D-01..D-12 are the contract. The ROADMAP scope clauses become the acceptance list:

| Clause | Description | Research Support |
|--------|-------------|------------------|
| R-A | A schema version per store | Findings 3, 4; Inventory (section "Store inventory") |
| R-B | Migrations keyed by store and version, run before first read | Finding 3 (hook in `GameLibStore` constructor, before `super()`) |
| R-C | `config.ts` fix-ups folded in | Finding 6 |
| R-D | Backup of pre-migration file; logged, non-destructive fallback on failure | Findings 2, 7 |
| R-E | A test per migration from a fixture of the old shape | Validation Architecture |
</phase_requirements>

## Summary

**The single most important finding: the `FileStore` class the CONTEXT builds on is dead code in the shipping app.** `src/backend/sidecar/fileStore.ts` is imported by exactly one file, its own test (`fileStore.test.ts`), plus a handful of suites that `jest.mock('backend/store_backend')` over to it. Nothing in `package.json`, `build:sidecar` (a plain esbuild bundle, no alias), `bootstrap.ts` (which says "no `Module._load` hook is installed") or `src/sidecar/index.ts` substitutes it. Every production store is a `GameLibStore` (`src/backend/store_backend.ts`), a thin subclass of `conf@10.2.0`. [VERIFIED: `grep -rnE "from '.*fileStore'"` over `src meta scripts`; `src/backend/store_backend.ts`; `package.json` `build:sidecar`] The `fileStore.ts` header, the `handlers.ts:285` comment ("`Module._load`-substituted `FileStore`") and the CONTEXT all describe the Phase 29 Electron-era arrangement. Phase 35 Plan 05 (D-04) replaced it, and quick 261107-a1j renamed the modules without touching the prose.

This changes the design in three ways, all in the planner's favour. (1) `conf` does **not** cache: the `store` getter does `readFileSync` + `JSON.parse` on every `get/has/set/delete/iterate`, so there is no in-memory cell, no D-14 shared cell, and "load in the constructor" means only `conf`'s one constructor-time read. The shared-path steam stores simply read the same file each time. (2) Every write, from every path (`set`, `delete`, `clear`, `reset`, `CacheStore.commit()`), funnels through one setter, `set store(value)`. That is the single read-only choke point. (3) The constructor of `GameLibStore` is the one place every store, including lazily-`require`d ones (`engineNoticeStore`, never imported by `storeRegistration.ts`) and the fresh `new Store(...)` instances `handlers.ts` / `storeWriteHandlers.ts` build for cache names, passes through before first read. **Recommended hook: a synchronous `prepareStore(options)` evaluated inside the `super(...)` argument list of `GameLibStore`'s constructor, keyed by resolved path, with outcomes memoised per path per process.**

A second finding raises the stakes on D-08: **the live store files are not mode `0o600`.** `conf` is called with its default `configFileMode: 0o666`, and `atomically` chmods the temp file to exactly that. Measured on this machine: `humble_store/config.json` and `steam_store/config.json` are `-rw-rw-rw-`, and `steam_store/` is `drwxr-xr-x`. The WR-06 hardening D-08 says to "reuse" exists only in the dead `FileStore`. Backups must therefore set modes explicitly, not inherit them (and fixing the live files is a one-line, optional change; see Open Questions).

**Primary recommendation:** implement versioning inside `GameLibStore` (path-keyed state registry, pure `(data) => data` migration functions in a central `storeMigrations` registry, in-file `__internal__.gamelib.schemaVersion`, lazy stamping on write, backup-then-atomic-rewrite on a real migration), enforce read-only at `GameLibStore.set store` plus explicit early-returns in `TypeCheckedStoreBackend`/`CacheStore`/`applyStoreWrite` (so no change notification is pushed for a refused write), move `config.json` and `GamesConfig/<app>.json` onto the same engine with the existing `version: 'vN'` field, and surface one aggregated notice through a new once-per-launch push emitted from the existing `frontendReadyBootWorkDone` block.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Schema version storage, migration run, backup, read-only decision | Sidecar (Node backend), `GameLibStore` | — | Only the sidecar touches the files; the renderer reads a filtered snapshot and writes through `storeWriteHandlers.ts` (CONTEXT, verified in `handlers.ts`/`storeWriteHandlers.ts`). |
| Store kind declaration (cache vs user-state) | Sidecar, at the `new TypeCheckedStoreBackend` / `new CacheStore` call | — | D-01. Renderer mirrors in `frontend/helpers/stores.ts` do no I/O, so they hold no kind; a parity test ties each mirror to a backend declaration. |
| Read-only enforcement | Sidecar (`GameLibStore` backstop + store-class early return) | `applyStoreWrite` guard for renderer-initiated writes | A silent drop at the `conf` layer alone would still let callers push a change notification for a value that never reached disk (`storeChangeNotifier` header warns of exactly this divergence). |
| Hiding `__internal__` from the renderer | Sidecar (`filterStoreSnapshot` / `isAllowedStoreField`, `raw_store`, `CacheStore.entries()`) | — | Allow-listed stores already drop unknown top-level keys; the `'*'` stores and cache stores need an explicit rule. |
| Settings (`config.json`, `GamesConfig/*.json`) migration | Sidecar (`config.ts`, `game_config.ts`) | — | Own the files today with plain `writeFileSync`. |
| User notice | Sidecar emits one push; Renderer (`NoticeStack`) displays | — | Notice stack is bottom-right in `AppNoticeStack`; text goes through i18n. |
| Pending-migration retry | Sidecar, next launch | — | D-06; no timers, no boot-time unbounded work (sidecar exit contract). |

## Standard Stack

No new runtime packages are needed or recommended.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `conf` (already a dependency) | 10.2.0 (`^10.2.0`, pinned deliberately: 11+ is ESM-only) [VERIFIED: `node_modules/conf/package.json`, `package.json:111`] | Backing store of `GameLibStore` | Already the persistence layer. Its built-in `migrations` option is NOT used (see Don't Hand-Roll). |
| Node `fs` via `graceful-fs` | existing | Backup copy, atomic temp+rename rewrite | Same module `fileStore.ts`/`config.ts` use. |
| `jest` + `ts-jest` | existing (`jest.config.js` projects Backend/Common/Frontend/Preload/Meta) | Tests | Existing harness. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` (existing) | existing | The new push payload schema in `src/common/types/ipc/*.ts` | Only for the new notice channel. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-file `__internal__.gamelib.schemaVersion` | Central registry file (`store/schema-versions.json`) | A central file can diverge from the data file after a crash between two writes (data migrated, registry not, or the reverse), so migrations would have to be idempotent everywhere. In-file is atomic with the data. |
| Own migration engine in `GameLibStore` | `conf`'s built-in `migrations` + `projectVersion` | Rejected, see below. |
| Hook in `GameLibStore` constructor | Hook in `FileStore` (CONTEXT's suggestion) | `FileStore` is not on the production path. |

**Why `conf`'s built-in `migrations` is not usable** [VERIFIED: `node_modules/conf/dist/source/index.js` `_migrate`, lines ~392-420]: it is semver-keyed against a `projectVersion` (`StoreOptions` already `Omit`s `projectVersion`), runs in the constructor with **no** read-only/downgrade detection (a file version above the build's simply matches no candidates), restores with `this.store = storeBackup` on failure and then **throws from the constructor**, which at module scope in `storeRegistration.ts` would stop the sidecar from booting (D-06 requires the opposite), and has no backup file. Its `__internal__.migrations.version` key is unused today and is not touched by this design.

**Installation:** none.

**Version verification:** `conf` 10.2.0 confirmed from `node_modules/conf/package.json`. No `npm view` needed because no package is added.

## Package Legitimacy Audit

No external packages are installed by this phase. `atomically` is a transitive dependency of `conf`; do **not** import it directly (it is not in `package.json`). Write the rewrite with the same temp+rename discipline as `FileStore.persist()` using `graceful-fs`.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none) | — | — | — | — | not run (no installs) | n/a |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Key Findings (answers to the ten research questions)

### Finding 1: Production backend is `conf`, not `FileStore` (Q3)

- `TypeCheckedStoreBackend` (`typed_store.ts:84`) and `CacheStore` (`cache.ts:35`) both do `new Store(...)` where `Store` is `./store_backend` = `GameLibStore extends Conf` [VERIFIED: source]. `handlers.ts:314` and `storeWriteHandlers.ts:92,364` also `new Store(...)` the same class.
- `conf` ctor (`index.js` ~L120-160) computes `this.path`, then `const fileStore = this.store` (a disk read), merges `options.defaults`, and **writes** (`this.store = store`) if the merge differs from disk. Today no store passes `defaults`, but a read-only store must not be written by this path either: the setter override must be in place and must consult path-keyed state **during** `super()`. Since `this` is unavailable before `super()`, the state lives in a module-level `Map<resolvedPath, StoreState>`, and `this.path` (already set when `conf` first touches `this.store`) is the key.
- Every write funnels through `set store(value)`: `set` -> `this.store = store`; `delete`, `clear`, `reset` the same; `CacheStore.commit()` does `this.store.store = Object.fromEntries(...)`. [VERIFIED: `index.js`]. The only bypass is `conf`'s private `_set`, used by `_migrate`, which this design never enables.
- Existing tests mock `backend/store_backend` over `FileStore` in several suites (e.g. `migrationsWiring.test.ts`). New tests must use the **real** `GameLibStore` (the Backend project's `jest.setupContainment.ts` already redirects `homedir()`/`HOME`/`XDG_*` into a disposable root, so real stores are safe) or the manual mock at `src/backend/__mocks__/store_backend.ts`, which subclasses the real shim and so inherits the new behaviour.

**Do not spend plan effort on `fileStore.ts`.** Either leave it alone or note it as dead-code candidate (knip; separate concern). Hardening ideas in its header are not live.

### Finding 2: Store inventory with proposed kinds (Q1)

All paths are relative to `userData` (`~/Library/Application Support/GameLib` on macOS). `uc` = user-state (migrated), `cache` = discardable on mismatch. "Token" = holds token/credential material (0o600 backups). Files confirmed present in a live profile by directory listing this session.

**`TypeCheckedStoreBackend` declarations (19 declarations, 18 files):**

| # | Store name | File | Declared in | Proposed kind | Notes |
|---|-----------|------|-------------|---------------|-------|
| 1 | `configStore` | `store/config.json` | `constants/key_value_stores.ts` | uc | Contains the `settings` mirror of global settings (see Finding 6), recents/favourites/hidden, window props. |
| 2 | `timestampStore` | `store/timestamp.json` | same | uc | Play times. Allow-list `'*'`. |
| 3 | `steamConfigStore` | `steam_store/config.json` | `storeManagers/steam/stores.ts` | uc, Token | Shared file with #4. |
| 4 | `steamBottleConfigStore` | `steam_store/config.json` | same | uc, Token | **Same file as #3: one version, one chain.** Key the state by resolved path; assert both declarations agree on `kind`. |
| 5 | `gogConfigStore` | `gog_store/config.json` | `gog/stores.ts` | uc, Token | |
| 6 | `gogInstalledGamesStore` | `gog_store/installed.json` | same | uc | |
| 7 | `gogSyncStore` | `gog_store/saveTimestamps.json` | same | uc | Save-sync timestamps; conservative uc. Allow-list `'*'`. |
| 8 | `gogPrivateBranches` | `gog_store/privateBranches.json` | same | uc | User-entered branch passwords. Allow-list `'*'`. |
| 9 | `nileConfigStore` | `nile_store/config.json` | `nile/stores.ts` | uc, Token | |
| 10 | `legendaryConfigStore` | `legendary_store/config.json` | `legendary/stores.ts` | uc, Token | |
| 11 | `sideloadedStore` | `sideload_apps/library.json` | `sideload/stores.ts` | uc (D-02 library) | Not refetchable; the sideload `GameInfo[]` list. |
| 12 | `humbleConfigStore` | `humble_store/config.json` | `humble/stores.ts` | uc, Token | |
| 13 | `downloadManager` | `store/download-manager.json` | `downloadmanager/stores.ts` | uc | Queue + finished. |
| 14 | `gameOverridesStore` | `store/game-overrides.json` | `game_overrides/stores.ts` | uc | Absolute `cwd`. |
| 15 | `migrationsStore` | `store/migrations.json` | `migration/stores.ts` | uc | Must never be discarded (re-runs one-off migrations). **Exempt from being its own migration subject's dependency**: the versioned engine must not read it. |
| 16 | `wineDownloaderInfoStore` | `store/wine-downloader-info.json` | `wine/manager/stores.ts` | cache | `wine-releases` list, refetched. |
| 17 | `macArchStore` | `store/mac-arch.json` | `macArch/stores.ts` | cache (verify) | `verdicts` of `{mac_arch, checkedAt}`; recomputable by scan. Absolute `cwd`. |
| 18 | `runsForMeStore` | `store/runs-for-me.json` | `runsForMe/stores.ts` | cache (verify) | `games: Record<string, RunsForMeState>`; confirm no user input is stored before finalising. Absolute `cwd`. |
| 19 | `uploadedLogs` | `store/uploadedLogs.json` | `logger/stores.ts` | cache | Flat keys (dpaste URLs), `accessPropertiesByDotNotation:false`. See Pitfall 5: consumers iterate `raw_store`. |
| — | `fontsStore` | none | — | n/a | Dead `StoreStructure` entry, no construction site (`storeRegistration.ts` documents the exclusion). Exempt explicitly in the D-01 test. |

**`CacheStore` declarations (32), all `store_cache/<name>.json`:**

| Store file | Declared in | Proposed kind | Notes |
|-----------|-------------|---------------|-------|
| `steam_library` | steam/stores.ts | **uc (D-02)** | `GameInfo[]` under key `games`; renderer mirror exists. |
| `gog_library` | gog/stores.ts | **uc (D-02)** | key `games`; mirror exists. |
| `legendary_library` | legendary/stores.ts | **uc (D-02)** | key `library`; mirror exists (`libraryStore`). |
| `nile_library` | nile/stores.ts | **uc (D-02)** | key `library`; mirror exists. |
| `steam_metadata` | steam/stores.ts | cache | `SteamMetadataCacheEntry`; refetched/rescanned. |
| `steam_sync` | steam/stores.ts | cache | `syncedAt` epoch. |
| `steam_pending_adoption` | steam/stores.ts | **uc** | Per CONTEXT D-01. Lazily `require`d. |
| `steam_restart_hold` | steam/stores.ts | **uc** | Per CONTEXT D-01. |
| `steam_known_fix_reports` | steam/stores.ts | **uc** | "Report sent" records (Phase 57 D-16/17); losing them re-sends reports. |
| `steam_engine_notices` | engine/engineNoticeStore.ts | **uc** | Dismissals. Never imported by `storeRegistration.ts`, constructed lazily: proves the hook must be in `GameLibStore`, not in registration. |
| `gog_api_info` | gog/stores.ts | cache | |
| `gog_achievements` | gog/stores.ts | cache | |
| `gog_install_info` | gog/stores.ts | cache | |
| `gog_playtime_sync_queue` | gog/stores.ts | **uc** | Unsent playtime. |
| `nile_install_info` | nile/stores.ts | cache | |
| `legendary_install_info` | legendary/stores.ts | cache | |
| `legendary_games_override` | legendary/stores.ts | cache | 7-day lifespan. |
| `legendary_gameinfo` | legendary/stores.ts | cache | |
| `humble_library` | humble/stores.ts | **uc (conservative)** | Holds `revealedKeyValue`; confirm whether it is rebuildable from the API. Renderer-denied (`DENIED_CACHE_STORES`). |
| `humble_sync` | humble/stores.ts | cache | Sync cursor/state; confirm. |
| `humble_revealed` | humble/stores.ts | **uc** | |
| `humble_ownership_override` | humble/stores.ts | **uc** | |
| `humble_gifted_at` | humble/stores.ts | **uc** | CONTEXT D-01. |
| `humble_audit` | humble/stores.ts | **uc** | CONTEXT D-01. |
| `humble_local_redeemed` | humble/stores.ts | **uc** | CONTEXT D-01. |
| `humble_notified_expiration` | humble/stores.ts | **uc** | CONTEXT D-01. |
| `humble_settle_declined` | humble/stores.ts | **uc** | CONTEXT D-01. |
| `crossover_index` | crossover_index/stores.ts | cache | |
| `pci_ids_device` | utils/systeminfo/gpu/pci_ids.ts | cache | |
| `pci_ids_vendor` | utils/systeminfo/gpu/pci_ids.ts | cache | |
| `wikigameinfo` | wiki_game_info/stores.ts | cache | Allow-list `'*'`. |
| `umu` | wiki_game_info/stores.ts | cache | |

(That is 7 Steam + 5 GOG + 2 Nile + 4 Legendary + 9 Humble + 1 crossover + 2 pci + 2 wiki = 32. The "Humble: 9" includes `humble_library`.)

**Settings files (outside `conf`):** `appFolder/config.json` (global settings, `{defaultSettings, version}`), `appFolder/GamesConfig/<appName>.json` (`{[appName]: settings, version, explicit}`; 51 files in this profile). Both uc. Both Token: no (but contain `steamGridDbApiKey` in settings; treat backups as private, 0o600, cheap).

**Renderer mirrors (`src/frontend/helpers/stores.ts`):** 16 declarations. They perform no file I/O (reads come from the filtered sidecar snapshot, writes go through `window.api.storeSet`). They need **no version, no migration and no kind of their own**. Add a parity test: every mirror's `(cwd, name)` or cache filename must map to a backend declaration that has a kind (the four library mirrors map to the D-02 uc stores). Mirror `gameOverridesStore` declares `cwd: 'store'` while the backend uses an absolute path; the parity test must compare by file leaf, not by raw `cwd`.

**Dynamic constructions without declarations:** `handlers.ts:314`, `storeWriteHandlers.ts:92,364` build `new Store({cwd:'store_cache', name, clearInvalidConfig:true})` for the recognised cache names. They carry no kind. The state registry is therefore keyed by **resolved path** and populated by the declaring constructor; a dynamic construction looks up the existing state. A path with no registered declaration (only possible in tests or a future gap) behaves as pass-through (no version handling, writable), and the D-01 source test is what prevents that in production.

### Finding 3: Hook design: where and when migrations run (Q3, Q10)

```
const STATE = new Map<string, StoreState>()      // key: resolved absolute path

class GameLibStore extends Conf {
  constructor(options) {
    super(prepareStore(options))                  // runs BEFORE conf touches the file
  }
  get store()   { return viewOf(this.path, super.store) }
  set store(v)  { if (isReadOnly(this.path)) { logOnce(...); return }
                  super.store = stamp(v, schemaVersionOf(this.path)) }
}
```

`prepareStore(options)`:
1. `translated = translateStoreOptions(options)` (existing, does containment) and compute the absolute file path.
2. Pull out the declaration (`kind`, optional `failedView`, `secret`) from the new option field and **delete it from the options handed to `conf`**.
3. If `STATE` already has the path: assert the declaration's `kind` matches the registered one, return. (Handles the shared steam path, repeat constructions, and the dynamic `new Store` calls.)
4. Otherwise run `runStoreMigrations(path, declaration)` synchronously and record the outcome in `STATE`. **Must never throw** (a throw here is a module-scope throw in `storeRegistration.ts` = sidecar boot failure); wrap everything, mark the path read-only on any unexpected error, log one line, continue.

`runStoreMigrations` logic:
- File absent -> state `{ok, version: current}`, nothing to do (first write stamps).
- Read raw text; unparseable or non-object JSON -> do nothing here (preserve today's `conf` behaviour: `clearInvalidConfig` stores read empty, others throw as today; do not invent new behaviour). Do not mark read-only.
- `fileVersion = data.__internal__?.gamelib?.schemaVersion ?? 0`.
- `fileVersion > current` -> state `read-only (newer)`; log one line; **no write, no backup, no migration**. (D-03, applies to both kinds.)
- `fileVersion === current` -> ok.
- `fileVersion < current`, kind `cache` -> **discard**: unlink the file (no backup; refetchable), state ok. Discard is data loss by design only for cache kind.
- `fileVersion < current`, kind `user-state` -> chain = migrations with `from >= fileVersion`, in order. If every step in the chain is declared `identity` (baseline adoption), do **nothing** (no backup, no rewrite); the version is stamped lazily on the next write. Otherwise: backup (Finding 7), apply pure functions in memory, validate the result is a plain object, write atomically with stamp; on any failure leave the file untouched, state `read-only (failed)`, log (store key, from/to, error message only; never contents).

**Why this satisfies "before first read" and the exit contract:** it is synchronous, bounded (about 2 MB total JSON in a live profile [VERIFIED: `du` this session]; `conf` already reads each file once in its constructor, so this adds one read+parse per store at boot), creates no timer, watcher, socket or child handle, and leaves no in-flight promise, so the event-loop-drain exit at stdin EOF is unaffected. Nothing is swept at boot beyond the constructed stores. **Do not** sweep `GamesConfig/*.json` at boot (51 files here, unbounded in general): migrate each file lazily on its first `GameConfig.get(appName)` (Finding 6), memoised per process.

**Relationship to `MigrationSystem`:** keep it unchanged for named one-off cross-file moves (`LegendaryGlobalConfigFolderMigration` copies a folder; it is not a per-file shape change). Its floated-promise hook and its `migrationsStore` record remain valid for that purpose. The versioned engine does not use `migrationsStore` (which is itself a versioned store; avoid the circularity). Say this explicitly in the plan so nobody "folds in" the runner.

### Finding 4: Where the version lives (Q4)

Recommendation: **inside each `conf`-managed file at `__internal__.gamelib.schemaVersion` (integer)**, absent meaning 0 (pre-Phase-68).

- `__internal__` is already `conf`'s reserved namespace: `Conf.set('__internal__.x', ...)` throws "Please don't use the __internal__ key" [VERIFIED: `index.js` `_containsReservedKey`]. This blocks dotted writes from backend callers for free. **Gap:** the check is `key.startsWith('__internal__.')`, so `set('__internal__', {...})` (the bare key) passes, and `accessPropertiesByDotNotation:false` stores skip the check entirely. Add an explicit top-level `__internal__` refusal in `applyStoreWrite` (renderer path) and in `TypeCheckedStoreBackend.set/delete`.
- Stamping is done in the `set store` override on every write (so `set`, `delete`, `clear`, `commit()` all re-stamp, and `clear()` keeps the stamp). No eager stamping of untouched files at boot: avoids ~50 rewrites at first launch and keeps files readable by pre-68 builds until actually written. A real (non-identity) migration stamps eagerly.
- The in-file location is atomic with the data, so a crash can never leave version and data disagreeing. A central registry cannot give that.
- **Hiding it:**
  - Renderer snapshot: `filterStoreSnapshot` -> `isAllowedStoreField` already drops keys outside the per-store allow-list, so allow-listed stores are safe. For `'*'` stores (`timestampStore`, `gogSyncStore`, `gogPrivateBranches`, `wikigameinfo`, `uploadedLogs`) and for cache stores (`policy === undefined` branch returns `true` for recognised names), add a first rule to `isAllowedStoreField`: `key.split('.')[0] === '__internal__'` -> `false`. This also makes `pushStoreChanged` reject it.
  - `CacheStore.entries()`: add `key !== '__internal__'` to the existing filter (next to `'__timestamp'`). Also `use_in_memory()` does `new Map(this.store)`, which will copy `__internal__` into the map and write it back in `commit()`; harmless (same value, re-stamped anyway), but the `entries()` filter must cover the Map path too (the existing filter already does, since it runs after `Object.fromEntries`).
  - `TypeCheckedStoreBackend.raw_store`: strip `__internal__` (returns a shallow copy without it). Callers: `handlers.ts` (snapshot) and `uploader.ts:142` (iterates `uploadedLogs` keys; would otherwise treat `__internal__` as a log URL).
  - `GameLibStore.entries/iterator` is not used directly by backend code beyond `CacheStore`; confirm with grep during implementation.
- Older (pre-68) builds ignore the key and, if they write, preserve it (they round-trip the whole object). Fine: that is the "accepted limitation".

For `config.json` and `GamesConfig/*.json` keep the existing top-level string `version: 'vN'` (D-10 says to start from it). Introduce a shared parser `parseVersion('v0'|'v1'|...) -> number`. See Finding 6.

### Finding 5: Migration shape and registry

- A migration is a **pure function** `(data: Record<string, unknown>) => Record<string, unknown>` declared in a central registry `src/backend/storeMigrations/` keyed by store key (`store/config`, `store_cache/steam_library`, `settings/global`, `settings/game`) as an ordered list `{ to: number, id: string, run, identity?: true }`. Pure functions make "one test per migration from a fixture of the old shape" a plain input/output test with no filesystem.
- `current(storeKey) = max(1, ...chain.map(m => m.to))`. Baseline is 1 for every store; the implicit 0 -> 1 step is the adoption step (identity, no backup, lazy stamp). Declare it in the registry as the default so no per-store boilerplate exists.
- The engine (file I/O, backup, atomic write, state registry, logging) is separate from the pure registry and gets its own tests (backup, prune, failure, newer-file, discard).
- Declaration at the construction site (D-01): add a **required** `kind` to the third argument of `CacheStore` (`options?: {invalidateCheck?}` becomes `options: {kind; invalidateCheck?}`) and a third constructor parameter to `TypeCheckedStoreBackend`, plus the typed option on `StoreOptions`. Required in the type system (compile error) **and** a source-level test as D-01 demands (the test also catches `as any` and covers the lazily-required stores).
- Shared-path stores: `STATE` is keyed by resolved path, so `steamConfigStore` and `steamBottleConfigStore` share one state; the registry key is the path-derived `steam_store/config`, not the store name.

### Finding 6: `config.ts` / `game_config.ts` and the two fix-ups (Q5)

How it works today [VERIFIED: source]:
- `GlobalConfig.get()` peeks `version` from `configPath` (`~/…/GameLib/config.json`); absent/corrupt -> `'v0'`; calls `reload(version)`. `reload` has only a `'v0'` case; any other version logs "Invalid config version" and **falls through to `GlobalConfig.globalInstance.upgrade()` on an undefined instance, which throws a TypeError.** So a newer config today does not merely hit an error path, it crashes the first caller. D-10's "must follow D-03" therefore also removes a crash.
- `GlobalConfigV0.getSettings()` reads the file, requires `settings.defaultSettings` (throws if absent), then returns `{...factoryDefaults, ...defaultSettings, winePrefix, trayIconVariant: migrateTrayIconVariant(defaultSettings), focusRow: migrateFocusRowSelection(defaultSettings)}`. The fix-ups are therefore **applied at read time and never persisted until the next `flush()`**.
- `flush()` hard-codes `version: 'v0'`; `writeToFile` is a plain, non-atomic `writeFileSync`.
- `GameConfig.get(appName)` does the same per `GamesConfig/<app>.json`. `GameConfigV0.upgrade()` is an identity rewrite (reads the file, writes it back with plain `writeFileSync`, returns `false`; creates `{}` for a missing file), so it runs on **every first `get` per game per launch**. `GameConfigV0_1` is unreachable: `flush()` always writes `'v0'` and `currentGameConfigVersion` is `'v0'`.
- **Other direct readers of these files that bypass the classes:** `engine/engineConfig.ts` `readStoredGameConfig` reads `GamesConfig/<app>.json` directly; `utils/compatibility_layers.ts:55` reads `configPath`; `utils.ts:482` lists them for deletion; `shellFilesFlowRegistration.ts` (`resetHeroic`) deletes `config.json` + `GamesConfig/`.

Recommended move (D-10/D-11):
1. A small shared **settings-file migrator** in `storeMigrations/` used by both: `ensureSettingsMigrated(path, chainKey)`; memoised per path per process; same backup / atomic rewrite / read-only state registry as the stores (so the aggregated notice sees it).
2. `GlobalConfig.get()` calls it before reading `version`. `GameConfig.get(appName)` calls it per file, lazily; `readStoredGameConfig` calls the same memoised function (cheap) so it never sees an unmigrated file.
3. **Chain `settings/global`:** `v0 -> v1`: `defaultSettings.trayIconVariant = migrateTrayIconVariant(defaultSettings)`; delete `defaultSettings.darkTrayIcon`; `defaultSettings.focusRow = migrateFocusRowSelection(defaultSettings)` (called with the **original** `defaultSettings` so the "presence of `focusRow`" guard and the `libraryTopSection` seed behave exactly as today); set `version: 'v1'`. Keep `libraryTopSection` in place (it is still a declared `AppSettings` field and a factory default, so deleting it is churn that factory defaults would re-add). The pure helper functions stay where they are and are **called by the migration** (single source of truth).
4. **Chain `settings/game`:** `v0 -> v1` is identity (shape unchanged), stamping `version: 'v1'`. Drop the identity-rewrite `upgrade()` (it is the only reason a per-game file is rewritten on every launch, non-atomically) but keep a test around `gameConfigFirstWrite.test.ts` behaviour: confirm no caller relies on the `{}` file the old `upgrade()` created for a missing config.
5. Change the three hard-coded `'v0'` in `flush()` to the current-version constant; extend `GlobalConfigVersion`/`GameConfigVersion` types (`src/common/types.ts:228,409`) with `'v1'`, drop `'v0.1'` from the game union only after confirming nothing else references it (grep found no other `v0.1` use outside `game_config.ts`).
6. **Newer version (`v2` file, `v1` build):** state `read-only (newer)`. `getSettings()` still returns what it understands (factory defaults spread under whatever the file has). `setSetting`/`flush` keep the in-memory change for the session (so the setting visibly applies) but **refuse the file write** and log once per file; one `backendEvents.emit('settingChanged')` still fires. Matches D-03 "changes lost".
7. **`appShellFlowRegistration.ts:250` and `config.ts` `getSettings()` calls:** recommend **keeping** both as read-side normalisers. Under D-06 a failed `settings/global` migration leaves the old `darkTrayIcon` on disk read-only; without the read-side call the tray silently flips to `'auto'`. They cost nothing and make the failure path correct. This is within the "planner decides" latitude in D-11; the fold-in is the persisted migration, the read-side call is the degradation path.
8. The `configStore` `settings` key (`store/config.json`) mirrors global settings and is read by the renderer (`seedFocusRowFromMirror`, `GlobalState.tsx`). It is part of the `store/config` chain, not the `settings/global` chain. Do not alter the renderer seed logic in this phase; note in the plan that the mirror is written on `setSetting` only, so after the file migration it can lag the migrated file until the next setting write. That is today's behaviour and `hydrateFocusRowSelection` already covers it.

### Finding 7: Backup mechanics (Q6)

- **Naming:** `<name>.v<fromVersion>.<UTC yyyymmddThhmmss>.bak.json` next to the store file (CONTEXT's `config.v2.bak.json` is an "e.g."; a bare version-only name collides when a migration is retried). Prune by listing `<name>.v*.bak.json`, sort ascending by embedded timestamp, delete all but the newest 3 **after** writing the new one.
- **Dedupe retries (D-06 interaction):** a failed migration is retried every launch, so naive backup-per-attempt would fill all 3 slots with byte-identical copies within three launches and push out any older, different backup. Before writing, compare the new snapshot with the newest existing backup (size + sha256 or direct `Buffer.equals`); skip if identical.
- **Copy mechanics:** read the original bytes and write them with `writeFileSync(tmp, bytes, {mode: 0o600})` then `renameSync`, not `copyFileSync` (which copies the source mode, and the live source files are `0o666`, see Finding 1). Create the directory with `mkdirSync(dir, {recursive:true, mode: 0o700})` only when it does not exist. Do **not** chmod an existing store directory (existing live `steam_store/` is `0o755`; changing it is a separate hardening decision, see Open Questions). Apply `0o600` to backups of **every** store (cheap, uniform) rather than only `steam_store/`/`humble_store/`; this satisfies D-08 and removes a classification that could drift.
- **Rewrite after migration:** write to `<file>.tmp-<pid>` mode `0o600`, `renameSync`, on rename failure fall back to a direct write and unlink the temp (the exact `FileStore.persist()` sequence, WR-05/WR-06). Lift this into one shared helper (`atomicWritePrivate(path, text)`) used by the engine and by the two settings writers. Never log `data`/`serialized` (T-28-04).
- **Location side effects:** backups sit inside `store_cache/`, `store/`, `steam_store/`, and, for per-game settings, inside `GamesConfig/`. Checked: `uninstaller.ts` removes `<app>.json`, `<app>.log`, `<app>-lastPlay.log` by exact name; `resetHeroic` removes the whole `GamesConfig/` directory; nothing enumerates `*.json` in the store directories. Per-game backups: only create one when the migration is non-identity (the v0->v1 game step is identity, so none are created in this phase), which also avoids littering `GamesConfig/`.
- **Size:** live profile has 520 KB `steam_library` and 560 KB `steam_metadata`; three backups of a library cache is about 1.5 MB. Acceptable. Cache-kind stores take no backup.
- **Prune safety:** only ever delete files matching the exact backup pattern for that store's own name inside its own directory (containment check as in `resolveStorePath`).

### Finding 8: D-06 risk, read-only views for old-shape data (Q2)

How readers behave on old-shape data:
- `TypeCheckedStoreBackend.get(key, default)` returns the **default** only when the key is absent. Clean-rewrite migrations (D-04) that remove or rename keys therefore degrade gracefully for key-level changes (defaults apply). The dangerous case is a **key that survives with a different value shape** (e.g. `GameInfo[]` item fields renamed or nested): readers get a non-undefined value of the wrong shape, and TypeScript cannot help at runtime.
- `CacheStore.get()` additionally needs a `__timestamp.<key>`; a missing timestamp already yields the fallback (so a cache whose bookkeeping is missing already reads as empty).

Recommendation, as a rule keyed on kind plus an opt-in override:

| Situation | View presented to readers | Writes |
|-----------|---------------------------|--------|
| Newer file, user-state (D-03) | Data **as-is** (D-03: "reads what it understands") | refused |
| Newer file, cache kind | **Empty** view (the shape is unknowable and the data is refetchable) | refused |
| Failed migration, user-state | **Old data as-is** by default (D-06 as written; key-level shape changes degrade to defaults) | refused |
| Failed migration, store flagged `failedView: 'empty'` | **Empty** view (reader gets `{}`; the file is untouched) | refused |

- Phase 68 ships no shape change to any `GameInfo[]` cache, so **no store in this phase needs `failedView: 'empty'`**. Build the option now (it is a two-line branch in `get store()`), document it, and let Phase 70 set it on the four library caches, where an old-shape `GameInfo[]` read by new-shape code is the realistic failure. The empty view is not "falling back to defaults" in the D-06 sense: nothing is written, the original file is intact, and the in-memory libraries repopulate from the network in the session (their refresh results are not persisted while read-only).
- Presenting an empty view for `config`-type user state would show the user as signed out or reset their settings, which is the exact outcome the phase exists to prevent. Hence the default for user-state is old-as-is.
- `clearCache()` (`utils.ts:440`) calls `.clear()` on cache stores; on a read-only store it is refused and logged. That is correct; just make sure it does not throw.

### Finding 9: Read-only plumbing to writers (Q3 second half)

Enforce at three layers; the first is the backstop, the others stop false change notifications:
1. `GameLibStore.set store`: if the path state is read-only, drop the write, log once per path (`[storeVersion] <storeKey> is read-only (newer|failed): write refused`).
2. `TypeCheckedStoreBackend.set/delete/clear` and `CacheStore.set/delete/clear/commit`: early-return **before** calling `notifyStoreChanged`/`notifyStoreInvalidated` when `this.store.readOnly` is true. (`typed_store.ts:134-147`, `cache.ts:108-183`.) Expose `get readOnly(): boolean` on `GameLibStore` backed by the path state. For `CacheStore` in `use_in_memory()` mode the in-memory map still works; only `commit()` must skip the disk write and the invalidation push.
3. `applyStoreWrite` (`storeWriteHandlers.ts`): add a guard (after guard (d) resolves the target, before the write) that returns with one log line when `target.readOnly`. Without it the handler's own `pushStoreChanged` at the end announces a value that never reached disk, the divergence documented in that file's header. Add `readOnly` to the `WritableStoreBackend` interface.
4. Settings writers (`config.ts`, `game_config.ts`): consult the shared state registry inside `writeToFile`.

### Finding 10: Notice delivery (Q7)

- `engineNoticeStore.ts` is **not** a notice raiser. It is a `CacheStore` that persists *dismissals*. It is only an example of a store, not of delivery. The real delivery pattern: backend `sendFrontendMessage('steamRequestNotice', {...})` -> renderer `window.api.handle…(listener)` registered in `GlobalState.tsx` -> a zustand store -> a toast component inside `AppNoticeStack` (`src/frontend/components/UI/NoticeStack/index.tsx`, currently `SteamEngineLaunchNotice` + `HumbleExpiryToast`).
- **Boot-time loss problem:** the stores are checked at module scope, long before any renderer listener exists, so a push at detection time would be dropped. Do **not** push at detection. Hold the aggregated list in a backend module (`readOnlyStores.ts`: `Set` of `{storeKey, area, reason}`), and emit one push from the existing once-per-process `if (!frontendReadyBootWorkDone)` block in `appShellFlowRegistration.ts` (~L539), which runs when the renderer reports ready. That gives "one notice per launch" (D-05) for free; a renderer reload will not re-show it (acceptable, and consistent with the other once-per-boot work in that block).
- New IPC surface (the planner must budget for these gates): a zod entry in `src/common/types/ipc/` (a `PushFns` channel like `engineFrontendMessagesArgs`, typing only), a `frontendListenerSlot` in `src/preload/api/`, registration in `GlobalState.tsx` next to `handleSteamRequestNotice`, then `pnpm check:ipc-contract`, `ipcSchemaCoverage.test.ts` and `ipcDomainCensus.test.ts`. The Tauri transport/Rust side is generic for push events (confirm during implementation; `engineStateChanged` is the nearest precedent).
- Component: `ReadOnlyStoresNotice` in `components/UI/NoticeStack/`, rendered in `AppNoticeStack`; follow `Skill("sketch-findings-gamelib")` `references/notices-and-toasts.md` (variant A stripe, `renderNoticeSlot`/`useNoticePhaseFallback` from `NoticeStack/noticeSlot`, 8 s hairline, reduced-motion fade). All text through `t()` with keys in `public/locales/en/gamelib.json`; the repo has `hardcodedStringGate.test.ts`, `lintTranslations` and an i18n churn guard, so run them.
- Copy: area names come from the backend as stable ids (`steam-library`, `settings`, ...), mapped to translated labels in the renderer; the failure variant says "could not be updated, see the log"; the newer-build variant uses the D-05 wording. Never put store contents in the payload.
- Auto-hide after 8 s is the stack's convention. For a data-integrity notice consider no auto-hide with a dismiss button; flag to the operator as a UI decision (Open Question 3).

### Finding 11: D-12 inventory (Q8), first pass

The plan must finish this as a deliverable. What this session established (backend JSON writers found by `grep writeFile(Sync)?` over `src/backend`, ~37 files; classification from file names and one-line reads; **mark each [TO VERIFY] before writing todos**):

| File | Owner | Verdict (provisional) |
|------|-------|----------------------|
| `appFolder/config.json`, `GamesConfig/<app>.json` | `config.ts`, `game_config.ts` | In scope (D-09/D-10) |
| `appFolder/mac-steam-offline-owed.json` | `steam/macSteamOffline.ts` (0o600) | needs versioning later; user-state (owed restore) |
| `<exeDir>/.gamelib-engine.json` | `engine/engineSwitch.ts` | needs versioning later (per-bottle marker) |
| `<prefix>/.gamelib-pin.json` | `engine/fallbackEngine.ts` | needs versioning later (engine pin marker) |
| steam bridge cfg | `steam/bridge/bridgeConfig.ts` (atomic, 0o600) | rebuildable (regenerated per launch), confirm |
| `gamelib-shared-redists.json` | `steam/bridge/sharedRedistInstall.ts` | needs versioning later (ledger) |
| `gamelib-shared-redist-index.json` | `steam/depot/sharedRedist.ts` | rebuildable index, confirm |
| `fixes/<app>-<store>.json` | `knownFixesFetcher.ts` | rebuildable cache (refetched) |
| `areweanticheatyet.json` | `anticheat/utils.ts` | rebuildable cache |
| depot manifest files | `steam/depot/manifest.ts` | rebuildable (CDN), confirm |
| `legendary/…/installed.json`, `save_path` edit | `save_sync.ts`, `legendary` | external tool's file (legendary), out of scope |
| gog `installed.json` manifests (`manifestPath`) | `gog/library.ts` | gogdl-owned, out of scope |
| nile `installed.json` | `nile/library.ts` | nile-owned, out of scope |
| `dxmt`/`tools` version files | `tools/index.ts` | not user data (version marker) |
| `shortcuts/*` | shortcuts | external (Steam shortcuts / .desktop), out of scope |
| `knownFixOverlayInstall.ts`, `originalRestore.ts`, `runnerClone.ts`, `runnerEntitlements.ts`, `overlayRunnerClone.ts`, `steamclientLayerInstall.ts`, `valveClient.ts`, `lzmaNativeBinding.ts` | steam bridge / overlay | binary/payload writers, not JSON user data, confirm per file |
| `devSecretVault.ts` | dev-only vault | not user data (dev flag) |
| `launcher.ts` (apps-names JSON) | launcher | rebuildable, confirm |
| `engine/adoptBottle.ts` | writes `cxbottle.conf` | external CrossOver format |

Renderer `localStorage` keys found (**more than the 9 files CONTEXT estimated**; about 30 files reference `localStorage`; keys confirmed by grep):

| Key | Owner | Verdict (provisional) |
|-----|-------|----------------------|
| `heroic-tour-state` | `state/TourContext.tsx` | UI state, low value; needs versioning later at most |
| `discounts.filters`, `discounts.regionOverride` | `screens/Discounts/helpers.ts` | UI preference; has its own shape validation |
| `libraryTileWidth` | `Library/libraryTileSize.ts` | UI preference, scalar |
| `gamelib_welcome_seen` | `UI/WelcomeModal/welcomeState.ts` | flag |
| `show_external_link_dialog` | `UI/ExternalLinkDialog` | flag |
| `last-store`, `last-url-<store>` | `NavShell/navTabs.ts`, `WebView` | UI memory |
| `scrollPosition` | `NavTabs` | ephemeral |
| `nonAvailableGames` | `Library/engineWiring.ts` | derived list, self-healing (comment says healed on each change) |
| `show_favorites` | `Library/engineWiring.ts` | retired flag |
| `language` | `helpers/resolveBootLanguage.ts` | deliberate boot hint; configStore is the authority |
| filter/sort/category keys | `Library/filterEngine.ts` (legacy values "DISCARDED, never translated" per D-02 comment) | already discard-on-mismatch |
| zoom saved value | `state/savedZoomBoot.ts` | UI preference |
| other keys in `Library/index.tsx`, `GameCard`, `DownloadDialog`, `GamePage`, `ConsoleMode`, `UninstallModal`, `SettingsPanel`, `LanguageSelector`, `HeroicVersion`, `ChangelogModal`, `hooks/constants.ts`, `hasProgress.ts`, `helpers/library.ts`, `SteamSignOut.ts`, `GamesSettings` | various | [TO VERIFY] enumerate literal keys with `grep -nE "localStorage\.(get|set|remove)Item\("` per file in the plan |

Expected todo outcome: very few. UI-preference keys are low-value and self-defaulting; the user-state candidates are `mac-steam-offline-owed.json`, `.gamelib-engine.json`, `.gamelib-pin.json` and `gamelib-shared-redists.json`. Each todo needs `severity:`, `platform:`, `ready:` (bare, lowercase, in that order; `pnpm planning-gates` enforces) [CITED: CLAUDE.md Conventions].

## Architecture Patterns

### System Architecture Diagram

```
 sidecar boot (module scope; ./handlers import)
   storeRegistration.ts / lazy require()  -->  new TypeCheckedStoreBackend(name, opts, {kind})
                                                new CacheStore(file, ttl, {kind, ...})
                                                         |
                                                         v
                                            new GameLibStore(opts)
                                         super( prepareStore(opts) )   <-- sync, never throws
                                                         |
                  +--------------------------------------+------------------------------+
                  | path already in STATE?  -> assert same kind, reuse                  |
                  v no                                                                  |
        read raw file ----absent----> state{ok}                                         |
              |  unparseable/non-object --> leave to conf (today's behaviour)           |
              v                                                                         |
        fileVersion = __internal__.gamelib.schemaVersion ?? 0                           |
              |                                                                         |
   > current  |  == current        < current                                            |
   v          v                    v                                                    |
 read-only   ok          kind=cache ----------> unlink file, ok                         |
 (newer)                 kind=user-state                                                |
 log 1 line              chain all identity? --yes--> ok (lazy stamp on next write)     |
                              | no                                                      |
                              v                                                         |
                    backup (dedupe, prune 3, 0o600) -> run pure fns -> atomic write     |
                              | fail                              | ok                  |
                              v                                   v                     |
                         read-only (failed)                       ok                    |
                         file untouched                                                 |
                                                                                        |
 readers --> GameLibStore.get store --(viewOf: as-is | empty)--> data                   |
 writers --> TypeChecked/CacheStore early-return if readOnly (no notify)                |
         --> applyStoreWrite guard (renderer path) --> GameLibStore.set store backstop  |
                                                                                        |
 read-only set (STATE) --> readOnlyStores.ts --> frontendReady block --> 1 push -->     |
        renderer listener --> zustand --> ReadOnlyStoresNotice in AppNoticeStack <------+
```

### Recommended Project Structure
```
src/backend/
├── store_backend.ts              # GameLibStore: prepareStore() in super(...), get/set store overrides
├── storeVersioning/              # NEW
│   ├── engine.ts                 # runStoreMigrations, STATE registry, viewOf, readOnly queries
│   ├── backup.ts                 # backup + dedupe + prune + atomicWritePrivate
│   ├── readOnlyStores.ts         # aggregated list for the notice (+ area labels)
│   └── settingsFiles.ts          # ensureSettingsMigrated for config.json / GamesConfig
├── storeMigrations/              # NEW: pure registry, one file per store family
│   ├── index.ts                  # STORE_MIGRATIONS: Record<storeKey, Migration[]>
│   ├── settingsGlobal.ts         # v0 -> v1 (tray + focusRow)
│   └── __tests__/…               # one fixture test per migration
└── __tests__/storeKinds.test.ts  # D-01 source-level + registry test
```

### Pattern 1: Hook before `super()`
**What:** evaluate migration inside the `super` argument expression so `conf` reads already-migrated data and its constructor write goes through the guarded setter.
**When:** always, in `GameLibStore`.
```typescript
// Source: this design; constraint verified against conf@10.2.0 index.js constructor order
export default class GameLibStore<T extends Record<string, unknown> = Record<string, unknown>> extends Conf<T> {
  constructor(options?: StoreOptions<T>) {
    super(prepareStore(options))      // no `this` before super; state keyed by path
  }
  get store() { return viewOf(this.path, super.store) }
  set store(value) {
    if (isReadOnly(this.path)) { noteRefusedWrite(this.path); return }
    super.store = stampVersion(this.path, value)
  }
}
```
Accessor overrides must define **both** getter and setter on the subclass, or the inherited setter is shadowed. Check the compile target supports `super.store` accessor access (tsconfig `target`); add a unit test that `set`/`delete`/`clear` still persist.

### Pattern 2: Pure migration + fixture test
```typescript
export const settingsGlobalV0toV1: Migration = {
  id: 'settings-global-v0-v1', to: 1,
  run: (file) => {
    const d = { ...(file.defaultSettings as Record<string, unknown>) }
    d.trayIconVariant = migrateTrayIconVariant(d)
    delete d.darkTrayIcon
    d.focusRow = migrateFocusRowSelection(d)
    return { ...file, defaultSettings: d, version: 'v1' }
  }
}
```

### Anti-Patterns to Avoid
- **Building on `FileStore`:** it is not in the production path (Finding 1).
- **Silent drop without early return in the store classes:** produces false change notifications.
- **Throwing from the constructor path on a migration failure:** module-scope throw = sidecar boot failure (breaks D-06).
- **Sweeping `GamesConfig/*.json` at boot:** unbounded work; violates the sidecar exit contract spirit.
- **Eagerly stamping every file at first launch:** 50 rewrites, destroys pre-68 readability for no benefit.
- **Logging store keys' contents or values:** T-28-04; log store key (file leaf), from/to versions and error message only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic write | a new write routine per caller | one `atomicWritePrivate` lifted from `FileStore.persist()` (temp `mode 0o600` + rename + fallback + temp unlink) | WR-05/WR-06 history; three call sites (engine, config, game_config). |
| Path containment | ad hoc `startsWith` | the existing `resolve`+`relative` idiom in `translateStoreOptions` / `assertContained` | Phase 18 lesson, WR-11. |
| Prototype-pollution guard on key paths | new checks | `isSafeKeyPath` from `common/types/storePolicy` | CR-01. |
| Source scan for the D-01 test | a new walker | the `fakeHomeIsolation.test.ts` walker idiom + `testUtils/stripSourceComments` | Comments mention `new CacheStore(` in prose; stripping avoids false positives. |
| Semver ranges | `semver` | plain integers | Per-store sequential versions; no ranges needed. |

**Key insight:** the hard parts are all about *where* the logic sits (a path-keyed registry reachable from the constructor, the setter and the store classes), not about the migration functions themselves, which are trivial pure transforms.

## Common Pitfalls

### Pitfall 1: `conf`'s constructor writes before your guard exists
**What goes wrong:** `conf` does `this.store = mergedDefaults` in its constructor when disk differs from defaults. If the setter override has no path state yet, a read-only (newer) file gets rewritten.
**How to avoid:** register the path state in `prepareStore` (before `super`); the override reads `this.path`, which `conf` sets before its first `this.store` access. Unit-test: a newer file plus a store with `defaults` is byte-identical after construction.

### Pitfall 2: Boot crash from a throwing prepare step
**What goes wrong:** an uncaught error in `prepareStore` is an uncaught error at module scope.
**How to avoid:** wrap the whole function; on error mark read-only and log. A test asserts `new GameLibStore(...)` never throws for a corrupt/odd-typed file in the migration layer (and still behaves as today for `clearInvalidConfig:false` + malformed JSON, which `conf` itself throws; do not change that in this phase, record it).

### Pitfall 3: Retried failures flood backups
See Finding 7 (dedupe against the newest backup).

### Pitfall 4: `__internal__` leaking to the renderer or into iteration
**What goes wrong:** `'*'` allow-list stores and cache stores pass every top-level key; `raw_store` and `entries()` iterate everything.
**How to avoid:** the four hiding points in Finding 4, each with a test; add `__internal__` rejection to `applyStoreWrite`.

### Pitfall 5: `uploadedLogs` flat keys
`accessPropertiesByDotNotation:false`: `_containsReservedKey` is skipped and `uploader.ts:142` iterates all keys as URLs. Strip in `raw_store`; stamp via direct object write (the override does not use dot paths, so it works).

### Pitfall 6: Dynamic `new Store()` instances for the same path
`storeWriteHandlers.resolveWritableStore` creates a new `Store` per write for cache names. Per-path memoised state makes them consistent; do not run migrations again, and do not re-log "read-only" for each write (log once per path).

### Pitfall 7: `GlobalConfig.reload` undefined-instance crash
Replace the `switch/default` with: unknown/newer version -> state read-only, load the `v1` reader (it already tolerates unknown fields). Add a test with `version: 'v9'`.

### Pitfall 8: Existing tests that mock `store_backend` to `FileStore`
They will not exercise the new behaviour, and they will keep passing. Do not rely on them as coverage; do run `cache.test.ts`, `storeLayer.test.ts`, `storeLaunchHooks.test.ts`, `migrationsWiring.test.ts`, `gameConfigFirstWrite.test.ts` after changes.

### Pitfall 9: Mixed `kind` on a shared path
`steamConfigStore`/`steamBottleConfigStore` must declare identical kind; the engine throws in tests / logs in production on a mismatch.

### Pitfall 10: Plain `writeFileSync` for settings
`config.ts`/`game_config.ts` write non-atomically today. The migration rewrite must be atomic; consider routing `writeToFile` through `atomicWritePrivate` while there (small, in scope since the same helper is needed).

## Code Examples

### D-01 source-level test sketch
```typescript
// Style of src/backend/__tests__/fakeHomeIsolation.test.ts: walk src/, strip comments, regex the call sites.
const CTOR = /new\s+(CacheStore|TypeCheckedStoreBackend)\s*(<[^>]*>)?\s*\(/g
// For each match, parse to the matching close paren and require /kind\s*:\s*['"](cache|user-state)['"]/ in the argument text.
// Sanity floor: expect >= 50 constructions found (19 + 32 + engineNoticeStore) so the walker cannot pass vacuously.
// Exemptions: tests, __mocks__, the class definitions themselves; fontsStore has no construction.
```
Pair with a runtime test: import `storeRegistration` and `engineNoticeStore`, then assert every entry in the engine's `STATE` has a kind, and that the set of `(cwd,name)` leaves equals the inventory table's file list (shrink-only style: a new store forces a test edit, which forces the kind decision).

### Renderer-mirror parity test sketch
Parse `src/frontend/helpers/stores.ts` constructions, derive the file leaf (`CacheStore('x')` -> `store_cache/x`; `TypeCheckedStoreFrontend(_, {cwd,name})` -> `cwd/(name ?? 'config')`), and require each to exist in the backend STATE table.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `electron-store` + `FileStore` shim (Phase 27/29) | First-party `GameLibStore` over `conf@10.2.0` | Phase 35 Plan 05 (D-04) | `FileStore` is dead; per-access disk reads; no shared cell. |
| Heroic per-version config loader classes | One engine + registry | this phase | The `reload()` switch/`upgrade()` mechanism is retired. |
| Computed-not-written migration (Phase 61 `wineVersion`) | Clean persisted rewrite (D-04) | this phase | Files tidy; older builds can't read migrated files (D-03 guards writes). |

**Deprecated/outdated:** `fileStore.ts` header prose about being the sidecar's store; `handlers.ts:285` comment. A one-line comment fix is reasonable but optional.

## Runtime State Inventory

Not a rename phase, but a persistence-shape phase; the answers that matter:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 18 `TypeChecked` files + 32 `store_cache` files + `config.json` + `GamesConfig/*.json`, all unversioned today | Version baseline 1 (lazy stamp); one real data migration: `settings/global` v0->v1 |
| Live service config | None; no external service stores these strings | None (verified: all state is local files) |
| OS-registered state | None | None |
| Secrets/env vars | Token material lives in `steam_store/humble_store/gog_store/nile_store/legendary_store` config files (and Keychain for refresh tokens, out of scope) | Backups at `0o600`; never log contents |
| Build artifacts | `build/main/sidecar.js` / SEA binary are stale until rebuilt (MEMORY: `tauri dev` does not rebuild the sidecar) | Rebuild `build:sidecar-sea` before any live test of backend changes |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | tests, build | yes | (jest ran) | — |
| `jest` / `ts-jest` | tests | yes | repo-pinned | — |
| `pnpm` scripts (`codecheck`, `planning-gates`, `check:ipc-contract`, `lint`) | gates | yes (scripts present in `package.json`) | — | — |
| A populated userData profile for live check | manual UAT | yes on this machine (50 store files, 51 game configs) | — | Build a fixture profile under a fake HOME |

No missing dependencies. Live verification needs a rebuilt sidecar and `pnpm tauri:dev` (never `tauri:dev:run`, per memory).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | jest 29 + ts-jest; projects Backend, Common, Frontend, Preload, Meta (`jest.config.js`) |
| Config file | `/jest.config.js`, `src/backend/jest.config.js` (setup: `jest.setupContainment.ts`, `resetMocks: true`) |
| Quick run command | `npx jest --selectProjects Backend --runTestsByPath <file>` (verified: `cache.test.ts` ran 14 tests in 0.6 s) |
| Full suite command | `pnpm test:ci` (plus `pnpm codecheck`, `pnpm lint`, `pnpm planning-gates`, `pnpm check:ipc-contract`, `pnpm find-deadcode`) |

### Phase Requirements -> Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| R-A / D-01 | Every `new CacheStore`/`new TypeCheckedStoreBackend` declares a valid `kind`; floor of constructions found | source-scan unit | `npx jest --selectProjects Backend --runTestsByPath src/backend/__tests__/storeKinds.test.ts` | Wave 0 |
| D-01/D-02 | Inventory table vs runtime registry equality; four library caches are `user-state`; mirror parity | unit | same file | Wave 0 |
| R-B | Old-shape fixture on disk -> after `new GameLibStore`, data migrated, backup present, version stamped | unit (real store, fake HOME) | `…/storeVersioning/__tests__/engine.test.ts` | Wave 0 |
| R-B | Migrated before first read (`get` immediately after construct returns new shape) | unit | same | Wave 0 |
| D-03 | Newer file: file byte-identical after construct and after `set`/`delete`/`clear`; one log line; readable | unit | same | Wave 0 |
| D-03 | Newer file + store with `defaults`: not rewritten by `conf` ctor (Pitfall 1) | unit | same | Wave 0 |
| D-06 | Throwing migration: file untouched, read-only, retried by a second construct after clearing state; no throw | unit | same | Wave 0 |
| D-06 | Retry does not create a duplicate backup | unit | same | Wave 0 |
| D-08 | 4th backup prunes oldest; mode 0o600; dir 0o700 when created; prune ignores unrelated files | unit | `…/backup.test.ts` | Wave 0 |
| D-01 cache | Cache kind older version -> file removed, no backup | unit | engine test | Wave 0 |
| Shared path | Steam config + bottle stores: one state, one backup, kind mismatch detected | unit | engine test | Wave 0 |
| Hiding | `__internal__` absent from snapshot (`'*'` store + cache store), `entries()`, `raw_store`, renderer write rejected | unit | `storePolicy` + `cache` + `typed_store` tests | extend existing |
| Read-only no false push | `TypeChecked.set`/`CacheStore.set`/`applyStoreWrite` on read-only emit no `notifyStoreChanged` | unit | `storeChangeNotifier.test.ts` neighbours | extend |
| D-10 | `settings/global` v0 fixture (with `darkTrayIcon`, `libraryTopSection`, no `focusRow`) -> v1; version `'v9'` no longer crashes | unit | `…/storeMigrations/__tests__/settingsGlobal.test.ts` | Wave 0 |
| D-10 | `GamesConfig` lazy migrate; first-write behaviour unchanged | unit | extend `gameConfigFirstWrite.test.ts` | extend |
| D-11 | `appShellFlowRegistration` read-side normaliser still works on old-shape settings | unit | existing tests + 1 new | extend |
| D-05/D-07 | Aggregation + once-per-launch emit; renderer listener -> store -> component renders; i18n keys | unit (backend) + component (Frontend project) | new tests | Wave 0 |
| Exit contract | No new timer/handle: `pnpm smoke:sidecar` against a fake-HOME profile with an old-shape fixture exits | smoke | `pnpm smoke:sidecar` (needs `build:sidecar-sea`) | existing; add fixture arm |

Fixturing old shapes: write the old-shape JSON string literal into `join(userData, 'store_cache', 'x.json')` in a `beforeEach` (the Backend project's containment already redirects userData into a disposable root; use `__resetStoreState()` test-only export, mirroring `__resetFileStoreRegistry`). Keep fixtures as `.json` files under each `__tests__/fixtures/` for the pure-function tests.

### Sampling Rate
- **Per task commit:** the single test file touched via `--runTestsByPath`, plus `npx prettier --check <exact paths>` (scoped, per the repo convention; check `--file-info` first).
- **Per wave merge:** `npx jest --selectProjects Backend` and `pnpm codecheck`.
- **Phase gate:** `pnpm test:ci`, `pnpm lint`, `pnpm codecheck`, `pnpm planning-gates`, `pnpm check:ipc-contract`, `pnpm find-deadcode`, `pnpm smoke:sidecar`, then a live `pnpm tauri:dev` check on a copy of the real profile (rebuild the sidecar first).

### Wave 0 Gaps
- [ ] `src/backend/__tests__/storeKinds.test.ts` — D-01 source scan, registry equality, mirror parity
- [ ] `src/backend/storeVersioning/__tests__/engine.test.ts`, `backup.test.ts`
- [ ] `src/backend/storeMigrations/__tests__/settingsGlobal.test.ts` and a generic "adoption is identity" parameterised test over all uc stores
- [ ] A test-only `__resetStoreState()` export (knip/ts-prune annotation `@public` per repo convention)
- [ ] Frontend component test for `ReadOnlyStoresNotice`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no auth change; tokens only protected at rest) | — |
| V3 Session Management | no | — |
| V4 Access Control | yes (renderer-initiated writes) | `applyStoreWrite` guards: store allow-list, `isSafeKeyPath`, new `__internal__` and read-only guards |
| V5 Input Validation | yes | Renderer key paths already validated; migration inputs are local files, validated as plain objects before/after; no `eval`/dynamic code |
| V6 Cryptography | no (none added; do not hand-roll) | — |
| V8 Data Protection | yes | Backups `0o600`; never log contents (T-28-04); existing `logSecretGate.test.ts` |
| V12 Files | yes | Path containment for backups/prune; atomic rewrite |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Renderer forges `__internal__` to bump/lower the version | Tampering | Reject top-level `__internal__` in `applyStoreWrite` and the stores; hide it from snapshots |
| Backup/prune escapes the store directory | Tampering | `resolve`+`relative` containment; fixed filename pattern; never take a path from RPC |
| Token files copied world-readable | Information disclosure | Explicit `0o600` on backups and rewrites; **existing live files are `0o666` (Open Question 1)** |
| Prototype pollution via migrated JSON | Tampering | `JSON.parse` output used with own-key copies; reuse `isSafeKeyPath` where keys are dynamic |
| Secret in logs on migration failure | Information disclosure | Log store leaf, versions, `error.message` only; `logSecretGate` covers `logError` call sites |
| Disk-fill via backup retries | DoS | Dedupe + cap of 3 per store |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `runsForMeStore` and `macArchStore` hold only recomputable data (cache kind) | Inventory #17/#18 | If user input is stored, a discard on mismatch loses it; classify uc to be safe |
| A2 | `humble_library` should be uc because it holds `revealedKeyValue`; `humble_sync` is cache | Inventory | Wrong cache choice discards a not-refetchable record |
| A3 | `steam_known_fix_reports` is uc (report-sent markers) | Inventory | If wrong, harmless extra migration cost |
| A4 | The Rust/Tauri transport carries a new push channel with only the zod + preload additions (precedent `engineStateChanged`) | Finding 10 | More wiring (Rust side) than budgeted |
| A5 | No caller relies on the empty `{}` config file the old `GameConfigV0.upgrade()` creates for a missing game config | Finding 6 | A first-write regression; mitigated by running `gameConfigFirstWrite.test.ts` |
| A6 | TypeScript target supports `super.store` accessor overrides in `GameLibStore` | Pattern 1 | Needs a different shim shape (e.g. wrapper methods) |
| A7 | D-12 provisional verdicts for the writers marked "confirm" | Finding 11 | Missed user-data todo |
| A8 | Applying `0o600` to backups of all stores (not only steam/humble) is acceptable | Finding 7 | None practical; stricter than D-08 |

## Open Questions

1. **Should this phase also set `configFileMode: 0o600` on `GameLibStore` (and create new dirs `0o700`)?**
   - What we know: live `steam_store/config.json` and `humble_store/config.json` are `-rw-rw-rw-`; `steam_store/` is `0o755`. `fileStore.ts`'s WR-06 hardening never reaches production; `conf`'s default `configFileMode` is `0o666` and `atomically` chmods to it. [VERIFIED: `ls -l` on this machine and `atomically` source]
   - What's unclear: whether the operator wants a security fix folded into a versioning phase (existing files would keep their modes until rewritten, because `atomically` is called with an explicit mode).
   - Recommendation: surface to the operator now. Minimum for this phase: backups and migration rewrites are `0o600`. A one-line `configFileMode: 0o600` in `translateStoreOptions` is the fix; treat as a separate todo if declined.
2. **`humble_library`, `macArchStore`, `runsForMeStore`, `steam_known_fix_reports`: final kind?** Inspect writers before locking (A1-A3).
3. **Notice persistence:** the stack auto-hides at 8 s. A data-integrity notice may deserve manual dismissal. UI decision for the operator/planner.
4. **Does the operator want `fileStore.ts` deleted as dead code?** Out of scope here; mention in the plan so tests that `jest.mock` over it are not mistaken for coverage.
5. **`v0.1` removal from `GameConfigVersion`:** safe per grep, but confirm no persisted test fixture uses it.

## Sources

### Primary (HIGH confidence): this repository, read this session
- `src/backend/store_backend.ts`, `src/backend/typed_store.ts`, `src/backend/cache.ts` (the live store stack)
- `node_modules/conf/dist/source/index.js` + `package.json` (10.2.0): constructor order, `store` getter/setter, `_migrate`, `_containsReservedKey`, `configFileMode`
- `node_modules/atomically/dist/index.js`: explicit-mode chmod on the temp file
- `src/backend/sidecar/fileStore.ts` and its importer set (dead in production)
- `src/backend/sidecar/storeRegistration.ts`, `storeWriteHandlers.ts`, `handlers.ts` (snapshot/resolve paths), `bootstrap.ts` (~L823-875 migrations), `appShellFlowRegistration.ts` (~L239-252, L539)
- `src/common/types/storePolicy.ts` (`STORE_ALLOWLIST`, `filterStoreSnapshot`, `isAllowedStoreField`), `src/common/types/typed_store.ts`
- `src/backend/config.ts`, `src/backend/game_config.ts`, `src/common/trayIconVariant.ts`, `src/common/focusRowMigration.ts`, `src/backend/migration/*`
- All `*/stores.ts` store declaration modules; `src/frontend/helpers/stores.ts`
- Live profile listing and `ls -l` modes of `~/Library/Application Support/GameLib` (names, sizes, modes only; no contents read)
- `.claude/skills/gamelib-conventions`, `.claude/skills/sketch-findings-gamelib/references/notices-and-toasts.md`, `CLAUDE.md`

### Secondary / Tertiary
- None. No web sources were needed; no claim depends on external documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new packages, `conf` 10.2.0 read directly.
- Architecture (hook in `GameLibStore`, setter choke point): HIGH on the facts (source read); MEDIUM on the design (not yet prototyped; Assumption A6 on accessor overrides).
- Inventory: HIGH for declarations and paths; MEDIUM for a few kind verdicts (A1-A3); D-12 table is explicitly provisional.
- Pitfalls: HIGH (each traced to a specific line).

**Research date:** 2026-11-08
**Valid until:** 2026-12-08, or sooner if Phase 70 or any store-touching phase lands first (re-run the D-01 inventory test).

## Project Constraints (from CLAUDE.md)

- Tech stack is React + TypeScript on a Rust/Tauri shell; GameLib is independent of Heroic, so upstream mergeability is not a concern (do not raise it).
- Linux, macOS, Windows must all keep working (the engine is platform-neutral; `mode` bits are no-ops on Windows).
- GSD workflow: all edits go through a GSD command; use `/gsd-execute-phase` (hyphen form).
- Conventions to honour in plans: (1) any file created in `.planning/todos/pending/` carries `severity:`, `platform:`, `ready:` (D-12 todos); (2) child processes in tests use `createFakeHomeProfile()` (the `smoke:sidecar` arm); (3) sidecar: `unref()` every timer/watcher/socket/child and leave **no unbounded in-flight boot work** (this design adds none; do not sweep `GamesConfig/` at boot); (4) UAT items follow the `### N.` / `expected:` / `result:` shape; (5) every task `<verify>` runs `npx prettier --check` over the exact paths written (check `--file-info` first).
- Never log store contents or keys (T-28-04).
- Use `graphify query` for orientation; never read `GRAPH_REPORT.md` or `graph.json`.
- Memory notes relevant to verification: `tauri dev` does not rebuild the sidecar (rebuild with `build:sidecar-sea`); a fresh worktree needs build prep; dev launch is `pnpm tauri:dev`.
- Knip ratchet: new exports must have a consumer or an `@public` justification; run `pnpm find-deadcode`.
