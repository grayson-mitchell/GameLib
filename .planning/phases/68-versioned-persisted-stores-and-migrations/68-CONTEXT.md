# Phase 68: Versioned persisted stores and migrations - Context

**Gathered:** 2026-11-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Every GameLib-owned persisted store, plus global and per-game settings, carries a schema
version. A shape change ships with an ordered migration that runs before the data is used, a
backup of the pre-migration file, and defined behaviour when a migration fails or an older build
meets a newer file. An upgrade never silently resets a user's settings, library cache, Steam
state or Humble records to defaults.

The work is preventive: it came from the 2026-11-06 architecture review, not from a reported data
loss. Its first real customer is Phase 70 (GameInfo split), which changes the shape of the
library caches, so it should land before Phase 70. Phase 64 (custom themes) mostly adds new data
and benefits less.

Out of scope: Keychain secrets (they have their own migrations, `humbleSecretStore.ts`,
`steamgridSecretStore.ts`), files owned by external tools (legendary, gogdl, nile, CrossOver
bottles), and actually migrating the other persisted files found by the inventory (D-12).

</domain>

<decisions>
## Implementation Decisions

### Discard vs migrate

- **D-01: Each store declares its kind where it is constructed:** a refetchable cache (discarded
  on a version mismatch) or user state (migrated). A test fails if any registered store omits the
  declaration, so a new store cannot skip the choice. Classification by directory does not work:
  `store_cache/` holds Humble audit, locally-redeemed, gifted-at, settle-declined and
  notified-expiration state, and the Steam pending-adoption and restart-hold state, none of which
  can be refetched.
- **D-02: The library caches are must-migrate,** so the offline Library survives an upgrade:
  Steam, GOG, Epic (legendary), Amazon (nile) and sideload `GameInfo[]` caches, on both the
  backend and the renderer-mirror declarations (`src/frontend/helpers/stores.ts`). Only true
  lookup caches are discardable: store metadata, artwork, the CrossOver index, PCI ids, wiki /
  umu info, GOG API info and similar. The planner lists every store with its kind.

### Downgrade behaviour

- **D-03: An older build that opens a store file with a version higher than it knows reads what
  it understands and refuses to write that file.** It logs one line per affected store. The newer
  data survives untouched for when the user upgrades again; changes made in the older build to
  that store are lost (accepted).
- **D-04: Migrations do a clean rewrite.** A migration replaces old fields outright rather than
  keeping them beside the new shape. This departs from Phase 61's precedent (`wineVersion` kept on
  disk, Engine computed at read time); the operator chose tidy files over older-build
  readability, and D-03 already keeps an older build from writing over a newer file.
- **D-05: The user sees one notice per launch** while any store is read-only, through the
  existing bottom-right notice stack, e.g. "This data was saved by a newer GameLib, so changes
  won't be saved. Update GameLib to keep them."
- Accepted limitation: builds released before Phase 68 have no version check and will read and
  write newer files freely. Nothing can fix that retroactively; D-03 holds from the first build
  that ships this phase.

### Failed migration

- **D-06: A failed migration leaves the store on its old data, read-only.** The pre-migration
  file is untouched (and backed up per D-08), writes to that store are refused, and the migration
  is retried on the next launch, so a fixed build can migrate the original. The store does not
  fall back to defaults.
- **D-07: The user sees the same notice as a downgrade (D-05),** naming the affected area
  (e.g. "Steam library") and pointing to the log. One notice per launch covers every read-only
  store, whatever the cause.
- **D-08: Keep the last 3 pre-migration backups per store,** next to the store file (e.g.
  `config.v2.bak.json`), pruning the oldest when a new one is written. Backups of token-bearing
  stores (`steam_store/`, `humble_store/`) get the same `0o600` file / `0o700` directory modes
  `fileStore.ts` applies (WR-06).
- Risk for research: under D-06, code that expects the new shape reads old-shape data. The
  researcher should establish how readers of a must-migrate store behave on old-shape data and
  whether the read-only store needs to present an empty / default view to new-shape readers
  instead, without writing.

### Which files count

- **D-09: In scope: the ~19 persisted store modules** (every `TypeCheckedStoreBackend` and
  `CacheStore` declaration, including the renderer mirrors in `src/frontend/helpers/stores.ts`)
  **plus global settings (`src/backend/config.ts`) and per-game settings
  (`src/backend/game_config.ts`).**
- **D-10: The two settings writers move onto the new system.** Both already carry Heroic's
  `version` field, per-version loader classes and an `upgrade()` step, but only `v0` exists, so it
  has never run. Replace that per-class versioning with the same migrations, backup, read-only
  and downgrade rules as the stores, using the existing `version` field as the starting point
  (an absent field already means `v0`). An unknown (newer) version currently hits the "Invalid
  config version" error path; it must follow D-03 instead.
- **D-11: Fold the two ad hoc `config.ts` fix-ups into ordered migrations:**
  `migrateTrayIconVariant` (`src/common/trayIconVariant.ts`) and `migrateFocusRowSelection`
  (`src/common/focusRowMigration.ts`). `appShellFlowRegistration.ts:250` also calls
  `migrateTrayIconVariant` at read time; the planner decides whether that call stays as a
  read-side normaliser or goes.
- **D-12: Inventory everything else, migrate none of it.** The plan lists every other persisted
  GameLib file and renderer `localStorage` key with its owner and a verdict: rebuildable cache,
  needs versioning later, or not user data. Any that holds user data gets a todo in
  `.planning/todos/pending/` (with `severity:`, `platform:`, `ready:` per the repo convention).
  Starting points: about 20 backend modules write their own JSON (e.g.
  `steam/bridge/bridgeConfig.ts`, `engine/engineSwitch.ts`, `engine/fallbackEngine.ts`,
  `steam/macSteamOffline.ts`, `knownFixOverlayInstall.ts`, `save_sync.ts`), and 9 renderer files
  use `localStorage`.

### Claude's Discretion

- **Where and when migrations run.** Not asked; a technical choice for research and planning,
  constrained by D-03/D-06 and by this fact: every `FileStore` loads its JSON in its constructor,
  and the sidecar constructs every store at module scope when `./handlers` is imported
  (`storeRegistration.ts`), before `init()` runs. Today's `MigrationSystem.applyMigrations()` is
  floated, not awaited, from `bootstrap.ts:848`, after the stores have loaded. So "before first
  read" means migrating inside file load (e.g. in `FileStore`'s constructor / `load()`, keyed by
  resolved path) or before `./handlers` is imported, not reusing today's hook. The renderer never
  reads files directly (it reads through the sidecar's store snapshot and `storeWriteHandlers.ts`
  writes), so migrations are sidecar-only, but the read-only rule must also cover renderer
  writes arriving through `storeWriteHandlers.ts`.
- **Where the version lives.** Inside each file (and hidden from the renderer snapshot and
  `CacheStore.entries()`, the way `__timestamp` keys are) or in a central registry. Must work for
  D-03, where the older build has to know the file is newer.
- **The existing named-migration runner** (`src/backend/migration/`, one migration,
  `LegendaryGlobalConfigFolderMigration`): keep it for one-off cross-file moves beside the
  per-store versioned migrations, or fold it in.
- **Shared-path stores:** `steamConfigStore` and `steamBottleConfigStore` resolve to the same
  file (`steam_store/config.json`, D-14 in `fileStore.ts`), so they need one version and one
  migration chain, not two.
- Test shape: one test per migration from a fixture of the old shape (roadmap requirement), plus
  the D-01 every-store-declares-its-kind test.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope

- `.planning/ROADMAP.md` § Phase 68 — goal, scope and the original open questions this context
  answers

### Store backends and registration

- `src/backend/sidecar/fileStore.ts` — the sidecar's file store: load-at-construction, shared
  per-path cells (D-14), atomic temp+rename persist, `0o600`/`0o700` modes (WR-06), path
  containment (T-27-03, WR-11), prototype-pollution guard (CR-01)
- `src/backend/store_backend.ts`, `src/backend/typed_store.ts` — `TypeCheckedStoreBackend` and
  the store registry
- `src/backend/cache.ts` — `CacheStore`: lifespan, `__timestamp.*` bookkeeping keys, change
  notifications to the renderer, `entries()` filtering
- `src/frontend/helpers/stores.ts` — renderer-side store mirrors, including the library caches
- `src/backend/sidecar/storeRegistration.ts` — module-scope import of every store, why it exists
- `src/backend/sidecar/storeWriteHandlers.ts` — renderer write path, recognised cache-store names

### Existing migration and versioning code

- `src/backend/migration/index.ts`, `src/backend/migration/stores.ts` — Heroic's named-migration
  runner and `migrationsStore`
- `src/backend/sidecar/bootstrap.ts` § "Data migrations" (around line 823) — why migrations are
  floated, the module-scope import ordering, and the happens-before caveat
- `src/backend/config.ts`, `src/backend/game_config.ts` — Heroic's `version` field and
  `upgrade()` mechanism (D-10)
- `src/common/trayIconVariant.ts`, `src/common/focusRowMigration.ts` — the ad hoc fix-ups (D-11)

### Precedent

- `.planning/phases/61-unified-macos-engine-for-all-stores/61-CONTEXT.md` § "Migrating existing
  `wineVersion` choices" — computed-not-written migration, which D-04 deliberately departs from

### Repo conventions

- `Skill("gamelib-conventions")` — todo frontmatter (D-12 todos), sidecar exit contract (no
  unbounded in-flight boot work if migrations run at boot), `<verify>` prettier rule

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `MigrationSystem` (`src/backend/migration/index.ts`): sequential runner with graceful-failure
  logging; a model for ordering and logging even if per-store migrations live elsewhere.
- `FileStore.persist()`: atomic temp+rename with private modes; backups (D-08) should reuse the
  same write discipline.
- The bottom-right notice stack (see `Skill("sketch-findings-gamelib")`) and
  `src/backend/engine/engineNoticeStore.ts` as an example of a backend-raised notice, for D-05.
- `CacheStore.entries()` already hides internal bookkeeping keys; a version key can be hidden the
  same way.

### Established Patterns

- Stores are declared in thin `stores.ts` modules and constructed at module scope (Phase 29,
  D-15), so declaring a store's kind (D-01) belongs at the construction call.
- Shrink-only ratchets and source-level tests (Phase 62) are the repo's way to enforce "every X
  has Y"; the D-01 test fits that style.
- Files hold token material: never log store contents or keys (T-28-04).

### Integration Points

- `FileStore` constructor / `load()` — the earliest point every store file is read.
- `bootstrap.ts` — sidecar boot ordering; `./handlers` imported at module scope before `init()`.
- `storeWriteHandlers.ts` — must honour the read-only state (D-03, D-06).
- `GlobalConfig.reload()` / `GameConfig.reload()` — where the settings files detect their version
  today.

</code_context>

<specifics>
## Specific Ideas

- Notice wording example (D-05): "This data was saved by a newer GameLib, so changes won't be
  saved. Update GameLib to keep them." The failure variant names the area and points to the log.
- Backup naming example (D-08): `config.v2.bak.json` next to `config.json`.
- Sequence: land before Phase 70, whose GameInfo split is the first real shape change to the
  library caches.

</specifics>

<deferred>
## Deferred Ideas

- Versioning the persisted files found by the D-12 inventory: todos, not this phase.

### Reviewed Todos (not folded)

- `2026-11-05-downloads-history-lost-on-tab-return.md` — the only pending todo that touches a
  persisted store (`downloadManager` `'finished'` key). It is an undiagnosed bug about the key
  being empty on remount, not a versioning problem, so it stays a separate todo. The other 19
  keyword matches from `todo.match-phase` were unrelated.

</deferred>

---

*Phase: 68-versioned-persisted-stores-and-migrations*
*Context gathered: 2026-11-08*
