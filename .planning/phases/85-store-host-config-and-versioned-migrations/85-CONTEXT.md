# Phase 85: Store host, config and versioned migrations - Context

**Gathered:** 2026-11-21
**Status:** Ready for planning

<domain>
## Phase Boundary

The Rust `StoreHost` in gamelib-core (built minimally in Phase 84, D-09) becomes the only disk writer for every persisted store still owned by the sidecar: settings (`config.json`), per-game config, user-state stores and the `store_cache/` caches. Phase 84 already moved `uploadedLogs`. Rust serves snapshot, get, set, delete and `storeChanged` natively. The TS store classes (`store_backend.ts` / `typed_store.ts` over `conf`) become a write-through mirror until the deletion phase named for each store in `82-STATE-OWNERSHIP.md`. Rust also takes over Phase 68 store versioning and the store migrations (`storeVersioning/*`, `storeMigrations/*`): pre-migration backup, refuse-newer read-only, and corrupt-file keep-and-report. Those TS modules and `migration/*` are deleted in this phase.

An upgrade loads existing data unchanged: unknown keys are preserved, and a roundtrip diff test over real files passes. A signed-release upgrade keeps every stored credential working with no new Keychain prompt.

Not in scope: porting any store's consumers. Each consumer moves in its own slice (86–99), and the TS mirror for its store is deleted there.

</domain>

<decisions>
## Implementation Decisions

### Cutover and rollback
- **D-01:** **Store families flip per family, in separate plans, behind a flag.** Order: caches first, then user-state, then token-bearing stores (`steam_store/config`, which holds `steamConfigStore` and `steamBottleConfigStore` in one file, plus `humble_store/config` and the other account configs), then global settings (`store/config.json`) last. Each flip sits behind `GAMELIB_STORE=rust|ts`, following the short-lived slice-flag pattern of Phases 63–80, until the phase's live gate passes.
- **D-02:** **After the first migrated boot, the TS fallback refuses to own the affected stores.** Once Rust has written a store version newer than the TS engine understands, `GAMELIB_STORE=ts` opens that store read-only through the existing Phase 68 refuse-newer rule. It never rewrites or resets it. So the fallback is only a real rollback before any migration has run on a profile. No restore-from-backup rollback is built. — **Reversibility:** one-way. A store migrated on a real profile can't be handed back to TS without a backup restore, which is deliberately not built.
- **D-03:** **The dual path is deleted inside Phase 85.** Once the live gate passes, the phase's last plan deletes the `GAMELIB_STORE` flag, the TS owner path, `storeVersioning/*`, `storeMigrations/*` and `migration/*` (SC5). The TS classes that stay are only the write-through mirror. Each mirror's deletion point is its column in `82-STATE-OWNERSHIP.md`, and `migrationsStore`'s mirror dies here in 85.

### Downgrade and byte compatibility
- **D-04:** **Downgrading to v0.10 works, except for stores a migration bumped.** Rust writes files that are byte-compatible with what v0.10's TS writer produces, at the same store versions, so v0.10 reads them unchanged. A store that a migration Phase 85 introduces moves to a newer version is opened read-only by v0.10 through its own Phase 68 refuse-newer rule, and is never reset. No new downgrade code is written. Planning should prefer to introduce no version bumps in 85 unless a migration requires one.
- **D-05:** **Rust writes are byte-identical to TS writes.** Re-saving a store with unchanged values must produce identical bytes to TS `conf`: key order, indentation, trailing newline and string escaping. A roundtrip diff test over the real-file corpus (D-09) asserts this byte for byte. Note for research: the `store.rs` header says "2-space pretty JSON", but the v0.11 research summary says `conf` writes tab-indented JSON. Research must settle this from `conf@10.2.0`'s actual `serialize` and from real profile files, and fix whichever is wrong (84's `uploadedLogs` included). — **Reversibility:** costly. It fixes the on-disk format that v0.10 and every later Rust writer must keep matching.

### Legendary global-config import
- **D-06:** **Delete the legendary migration rather than port it.** `migration/migrations/legendary.ts` (`legendary-move-global-config-folder`) copies a system-wide legendary config into GameLib's folder on first run. Every existing GameLib profile has already recorded it as applied. The only remaining reach is a new user who already signed in through Heroic or the legendary CLI, and that user can just sign in to Epic again. Record this reachability finding (SC4), then delete `legendary.ts`, `MigrationSystem` (`migration/index.ts`, `migration/stores.ts`) and the `migrationsStore` mirror.
- **D-07:** **`store/migrations.json` stays on disk.** Rust never opens it. It is not deleted, because a downgraded v0.10 should still see the migration as applied, and deleting files cuts against this phase's "never reset" rule.

### Upgrade proof and corpus
- **D-08:** **SC3 (the Keychain guarantee) is proven by a signed v0.10 → signed Phase 85 upgrade on macOS, run by the operator as a live gate.** Install the published, signed v0.10 and sign in to Steam, Humble and Epic, with SteamGrid configured if it applies. Then install a signed and notarized build of the Phase 85 branch over it. Pass means zero Keychain prompts and every sign-in still working. A dev or unsigned build does not count. Follow the memory note's offline UAT shape: network off only for the action.
- **D-09:** **The corpus holds the live operator profile plus generated v0.8, v0.9 and v0.10 profiles.** Generate a profile by briefly running each tagged release (`v0.8`, `v0.9`, `v0.10`) in a fake HOME (`createFakeHomeProfile()`, per the fake-HOME convention). Redact secrets and token-bearing values before commit, keep the JSON shape, and check the redacted fixtures in. Add hand-built edge cases on top: unknown keys, corrupt JSON, a newer-version file, an empty file and a missing file.
- **D-10:** **Windows and Linux credentials get automated checks in 85, with no live gate.** Rust keyring code and service/account names are unchanged. CI tests on Windows and Linux assert that the same names resolve through `keyring_dispatch`. The live upgrade check on those OSes rides with Phase 99 (RET-02).

### Carried forward (already decided, not re-asked)
- **D-11:** Every remaining persisted store flips at 85 (`82-STATE-OWNERSHIP.md`, Persisted stores). `steamConfigStore` and `steamBottleConfigStore` share one file and flip together.
- **D-12:** Phase 68 behaviour is ported unchanged: up to 3 backups per store (`MAX_BACKUPS_PER_STORE`) taken before a migration, a corrupt file kept and reported (never reset), a newer-version file read-only, and the per-area read-only notice (`readOnlyStores.ts` `AREA_BY_KEY`, `ReadOnlyStoresNoticePayload`) raised the same way.
- **D-13:** Phase 84 D-09: widen the existing `gamelib-core` `StoreHost` rather than replace it. Keep its signatures, its rollback of the in-memory value when a persist fails, its 0600 file and 0700 new-directory modes, and its tmp-then-rename write with a direct-write fallback.
- **D-14:** All secrets stay behind the shell's `keyring_dispatch`, with service and account names unchanged. A `-cli` never touches the real Keychain.
- **D-15:** The config.json-wins resync of the renderer's settings mirror at boot is ported along with `configStore` (ownership table notes).

### Post-research decisions (2026-11-21, answers to `85-RESEARCH.md` § Open Questions)
- **D-16 (Q1):** **The signed v0.10 baseline comes from a Wave 0 `checkpoint:human-action` task.** The operator pushes `v0.10` or dispatches `release-tauri.yml`, and the signing identity of both the baseline and the Phase 85 build is recorded before the D-08 gate is scheduled. Until then SC3 is reported unproven. No dev or same-identity local build stands in for it.
- **D-17 (Q2):** **The bottle-local versioned files get a Rust `version_gate(path, chain)` op in `gamelib-store`.** It reads the version and refuses newer (both chains are empty, so no migrations). `engine/engineSwitch.ts` and `storeManagers/steam/bridge/sharedRedistInstall.ts` call it via `rustInvoke`. `engineMarkerFile.ts` and `sharedRedistLedgerFile.ts` are named in the ownership table and deleted with `storeVersioning/*` (SC5).
- **D-18 (Q4):** **A corrupt store file is always copied aside, then handled by kind.** A `<name>.corrupt.<stamp>.json` copy is written first, and the original is kept byte-identical. Settings and user-state stores open read-only (`'failed'`) with the read-only notice. Rebuildable caches carry on with an empty store, but only after the copy exists.
- **D-19 (Q3):** **SC5 is read as: pin a mirror-deletion schedule for every store, and execute only the deletions due in 85.** A `storeMirrorSchedule` test is copied from `82-STATE-OWNERSHIP.md`. Only the Phase 85 mirror deletion (`migrationsStore`) runs, plus deletion of the TS *owner* path for every family (D-03).
- **D-20 (Q5):** **D-15's settings resync stays in TS, running through the mirror.** It needs TS factory defaults, so "ported" means it keeps working, not that it moves to Rust.
- **D-21 (Q6):** **Durability depends on the store kind.** `sync_all` runs for user-state, settings and token-bearing stores, but not for caches. The cost is measured in the Wave 0 spike on macOS and the Windows leg.
- **D-22 (Q7):** **`GlobalConfig`'s first-boot `resetToDefaults()` write becomes an ordinary store frame at boot.** The first `getSettings()` is served from the in-memory config, so there is no read-after-write race.

### Claude's Discretion
- The research and spike items from the roadmap's research flag: sync TS reads over async Rust ownership (mirror shape), read-your-writes guarantees, ordering of `storeChanged` against snapshots, Windows atomic rename while a file is open (the current EPERM/EBUSY direct-write fallback is the starting point), and the boot sequence for migrations (they run once at shell boot, before any consumer reads).
- Crate layout: a `gamelib-store` implementation crate vs widening `gamelib-core/src/store.rs` (research suggests core holds traits and a store crate holds the implementation; 84 put the minimal host in core).
- Channel shapes for snapshot, get, set, delete and `storeChanged` through the 83 native router.
- How the redacted corpus fixtures are generated and stored, and how they are pinned so a test can't pass with no fixtures.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 85: Store host, config and versioned migrations" — goal, the 5 success criteria and the research flag
- `.planning/REQUIREMENTS-v0.11.md` — FND-06, FND-07
- `.planning/research/v0.11/SUMMARY.md` — phase 85 outline, open question 3 (legendary) and 5 (mirror vs consumers first), gaps
- `.planning/research/v0.11/STACK.md` — `gamelib-store` stack: serde_json preserve_order, tempfile, flatten extra, migration step tables, crates not to add
- `.planning/research/v0.11/PITFALLS.md` — Pitfall 3 (store format compat), 11 (HOME isolation), 12 (Keychain prompts after the owning process changes)
- `.planning/research/v0.11/ARCHITECTURE.md` — slice C (stores) and the StoreHost composition root

### Ownership and prior decisions
- `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md` — per-store flip column (85) and TS-mirror deletion phase, sync-read consumers, migration notes per store
- `.planning/phases/84-logger/84-CONTEXT.md` — D-09 (minimal StoreHost; 85 widens it), D-13/D-21 (exit budget)
- `.planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/` — native router with sidecar fallback, one owner per channel, Rust argument validation
- Phase 68 store-versioning decisions (D-03 to D-08, D-13) — their record lives in the code headers of `src/backend/storeVersioning/*`. The planner should find the Phase 68 CONTEXT under `.planning/milestones/` if a deeper record is needed.

### Code being ported or deleted
- `src-tauri/crates/gamelib-core/src/store.rs` — the existing StoreHost core
- `src/backend/store_backend.ts` — the conf wrapper: name→configName, absolute cwd, the read-only refusal, modes
- `src/backend/typed_store.ts`, `src/common/types/typed_store.ts`, `src/backend/stores/{storeRoot,storeRegistry,createStores}.ts`
- `src/backend/storeVersioning/{engine,backup,readOnlyStores,settingsFiles,engineMarkerFile,sharedRedistLedgerFile,types}.ts`
- `src/backend/storeMigrations/{index,gameInfoLibraries,schemaStrip,settingsGame,settingsGlobal,settingsStrip}.ts`
- `src/backend/migration/{index,stores}.ts`, `src/backend/migration/migrations/legendary.ts` — deleted (D-06)
- `src/backend/sidecar/storeWriteHandlers.ts` — the current renderer store-write channels
- `src-tauri/src/keyring_dispatch.rs` — names must not change
- Test fixtures: `src/backend/stores/__tests__/fixtures/registeredStores.json`, `src/backend/__tests__/storeKinds.test.ts` (`EXPECTED_KINDS`)

### Conventions
- `Skill("gamelib-conventions")` — fake-HOME isolation (corpus generation), the Rust shutdown contract (boot-time migrations must be bounded), and the `<verify>` prettier rule

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `gamelib_core::store::{StoreHost, Store, StoreChange}`: per-file `Arc<Store>`, an IndexMap that keeps file order, listeners that fire after the write is on disk, and in-memory rollback when a persist fails. This is the base to widen with dot paths, the versioned envelope, backup and the `storeChanged` bridge.
- `storeVersioning/backup.ts` `atomicWritePrivate` and the max-3 backup rotation: the reference behaviour for the Rust port.
- `readOnlyStores.ts`: the area map and notice payload the renderer already displays. Keep the payload shape.
- `createFakeHomeProfile()` and the Rust `FakeHome` from Phase 82: use these to generate the v0.8/v0.9/v0.10 corpus profiles.

### Established Patterns
- The slice pattern from Phases 63–80: a per-domain crate, `dispatch(op, args)`, a `-cli` for headless parity, golden-trace parity replay, a short-lived `GAMELIB_<SLICE>=rust|ts` flag, and the slice's last plan deleting its TS.
- `conf` quirks that `store_backend.ts` documents: `name` must map to `configName`, `cwd` is always absolute under userData, plus `clearInvalidConfig` and `accessPropertiesByDotNotation` set per store. Rust must reproduce how each store resolves its path and keys.

### Integration Points
- `src-tauri/src/native_router.rs` / `relay_commands.rs`: the renderer's store channels move from the sidecar relay to native handlers.
- The Tauri shell boot (`main.rs`): migrations run once, before any consumer reads, inside bounded boot work.
- The TS sidecar: store classes become write-through mirrors whose writes go as ordered frames to Rust, and they receive `storeChanged` back.

</code_context>

<specifics>
## Specific Ideas

- The flip order is fixed: caches, then user-state, then token-bearing, then global settings last.
- The live gate uses real published signed artifacts (v0.10), not dev builds.
- Record the legendary reachability finding explicitly before deleting the code (SC4 wording).

</specifics>

<deferred>
## Deferred Ideas

- Live Windows and Linux credential upgrade checks: Phase 99 (RET-02).
- A restore-from-backup rollback lever: deliberately not built (D-02). Backups remain the manual recovery path.

### Reviewed Todos (not folded)
- The todo matcher returned only keyword-overlap hits (Windows unsigned releases, blank-render fix, GOG elevation live check, the bridged-launch session kick, the gamelib-log Windows path golden, the settings-flow digest gate, the steampoll grandchild flake). None is about store hosting or migrations, so none was folded.

</deferred>

---

*Phase: 85-store-host-config-and-versioned-migrations*
*Context gathered: 2026-11-21*
