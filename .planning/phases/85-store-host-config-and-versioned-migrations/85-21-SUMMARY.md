---
phase: 85-store-host-config-and-versioned-migrations
plan: 21
subsystem: infra
tags: [rust, typescript, store, deletion, port-complete-gate, migrations, conf, ipc]

requires:
  - phase: 85-20
    provides: the scored live macOS gate (6 pass, 2 issue accepted by the operator, SC3 proven), which D-03 requires before the dual path is deleted
  - phase: 85-16
    provides: store_native.rs, the store:ts-fetch / store:ts-snapshot forwards and the nativeSeamPortComplete store-slice flag exemption this plan expires
  - phase: 85-17
    provides: the store:ts-* write forwards and isRustOwnedStoreName this plan deletes or rewrites
provides:
  - "storeHostPortComplete.test.ts: the Phase 85 deletion gate (DELETED, KEPT, forbidden identifiers over comment-stripped src, meta, src-tauri/src and every crate's src, a raw whole-word flag scan with tests included, a conf-import scan, floors and self-tests), with the SC4 reachability finding in its header; 85-23 and 85-24 extend it"
  - "storeMirrorSchedule.test.ts: every store's TS-mirror deletion phase pinned from 82-STATE-OWNERSHIP.md (55 registry rows + 2 settings documents at 98, R3), equality-checked against the doc"
  - "The TS migration system, migrationsStore, the GAMELIB_STORE flag, storeOwnership.ts/.json, the conf owner path, the store:ts-* channels and the conf dependency deleted; one store path: TS mirrors over the Rust StoreHost"
  - "storeFrames.ts holds the store-table key helpers (isStoreKey, dotPathsFor, isMirrorStoreKey, isRustOwnedStoreKey, isRustOwnedStoreName); storeRoot.ts holds StoreBootEnv / readStoreBootEnv"
affects: [85-22, 85-23, 85-24, 85-25]

actuals:
  tokens: 133580   # chars/4 over the realized diff (git diff 3d8427778..6a3a77f1e: 534318 chars)
  tasks: 2
  commits: 3       # MEASURED: git rev-list --count plan_head_before..HEAD
plan_head_before: 3d8427778d2f7f34ca1b67074478bb1c71f83cbe
plan_head_after: 6a3a77f1ed95212df23333788f48a9d76e612826

tech-stack:
  added: []
  patterns:
    - "A port-complete gate scans a deleted rollback flag over RAW text with tests included and builds the flag name from parts, so the gate file itself never names it"
    - "A pinned schedule test equality-checks its table against the planning doc it was copied from, so a slice that moves a deletion phase moves both"
    - "Every store is a mirror: GameLibStore refuses a key that names no store (or the excluded row) and a path that is not its table path, so a store nobody writes cannot be built"

key-files:
  created:
    - src/backend/__tests__/storeHostPortComplete.test.ts
    - src/backend/__tests__/storeMirrorSchedule.test.ts
    - src/backend/stores/__tests__/storeKeys.test.ts
  modified:
    - src/backend/store_backend.ts
    - src/backend/stores/storeRoot.ts
    - src/backend/stores/storeFrames.ts
    - src/backend/stores/settingsDocs.ts
    - src/backend/sidecar/storeWriteHandlers.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/appShellFlowRegistration.ts
    - src/common/types/typed_store.ts
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/sidecarInternal.ts
    - src/common/types/ipc/storeChannels.json
    - src/common/types/ipc/storeTable.json
    - meta/genStoreTable.ts
    - meta/genIpcContract.ts
    - src-tauri/src/store_boot.rs
    - src-tauri/src/store_native.rs
    - src-tauri/src/store_dispatch.rs
    - src-tauri/src/main.rs
    - src/backend/__tests__/nativeSeamPortComplete.test.ts
    - .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "store/migrations keeps its store table row as a no-TS-store EXTRA_ROW (family excluded) instead of being removed: the row is the table's record that Rust never opens the file (D-07), the corpus's four migrations.json files resolve their tableKey through it, and so the excluded-family rule stays (a row still uses it)"
  - "A TS mirror may be built over any key that resolves to a store row except the excluded one (isMirrorStoreKey); the recognised-cache list decides only Rust ownership and the TS push filter. Production builds no unrecognised runtime cache, and the shell would refuse its frames not-owned"
  - "With no home directory the shell's store reads and writes are errors, not forwards: there is no sidecar fallback owner any more"
  - "applyStoreWrite, resolveRawStore, the TS-raised read-only notice push and store_dispatch::sidecar_state were deleted with the handlers that were their only callers (the Rust write choke point and notice replace them)"

patterns-established:
  - "Deletion plans regenerate the shared policy vectors (GAMELIB_WRITE_STORE_GOLDEN=1) and the store table from their generators rather than editing the JSON by hand"

requirements-completed: [FND-06]

coverage:
  - id: D1
    description: "SC4: the legendary migration's reachability recorded in the gate header and this SUMMARY, then legendary.ts, MigrationSystem, migration/stores.ts, migrationsWiring.test.ts, the 'migrations' boot step and the migrationsStore mirror deleted (D-06)"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/__tests__/storeHostPortComplete.test.ts (DELETED + forbidden identifiers MigrationSystem, createMigrationStores, migrationsStore, legendary-move-global-config-folder, applyMigrations; red first 10 failed / 14 passed, green after)"
        status: pass
      - kind: other
        ref: "grep -c 'sign in to Epic again' src/backend/__tests__/storeHostPortComplete.test.ts == 1; test ! -e src/backend/migration"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-07: store/migrations.json stays on disk and Rust never opens it; createStores builds no store over it and leaves it byte-identical"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_boot_never_opens_migrations_json"
        status: pass
      - kind: unit
        ref: "src/backend/stores/__tests__/userStateFamily.test.ts#createStores builds no store over it and leaves the file alone; storeWritePath.test.ts#refuses a store over store/migrations"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-19: every store's TS-mirror deletion phase pinned (55 registry rows + settings/global and GamesConfig/* at 98, R3), equal to 82-STATE-OWNERSHIP.md; only migrationsStore's (85) executed"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/__tests__/storeMirrorSchedule.test.ts (10 cases; mutation-checked: removing gameOverridesStore from registeredStores.json fails 'gameOverridesStore: due 86, mirror missing', reverted)"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-03: the GAMELIB_STORE flag, the ownership file, the TS owner path (conf composition), the store:ts-* channels and Rust's forwarding deleted on both sides; one store path"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/__tests__/storeHostPortComplete.test.ts (red first: 10 failed / 26 passed; green: 36 passed; flag-scan mutation in store_boot.rs fails it, reverted)"
        status: pass
      - kind: unit
        ref: "cargo test --bin gamelib-shell (687 passed); cargo test -p gamelib-store (all green); src/backend/__tests__/nativeSeamPortComplete.test.ts (no flag exemption)"
        status: pass
      - kind: other
        ref: "grep -rnw GAMELIB_STORE src meta src-tauri/src | wc -l == 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "conf removed from package.json and pnpm-lock.yaml (removal only, 17 lockfile packages pruned, none added)"
    requirement: FND-06
    verification:
      - kind: other
        ref: "grep -c '\"conf\":' package.json == 0; git diff pnpm-lock.yaml has no added lines"
        status: pass
    human_judgment: false
  - id: D6
    description: "A live app boots, reads and writes every store through the mirror with no TS owner fallback"
    verification: []
    human_judgment: true
    rationale: "No live run in this plan; the behaviour production already had since 85-15 (every family flipped) is unchanged, but the post-deletion proof is 85-25's"

duration: 50min
completed: 2026-11-22
status: complete
---

# Phase 85 Plan 21: Delete the migration system, the store flag, the TS owner path and conf Summary

**The TS migration system and its migrationsStore are gone after the legendary reachability finding was recorded. The GAMELIB_STORE flag, storeOwnership, the conf-backed owner, the store:ts-* channels with Rust's forwarding, and the conf dependency are deleted, so every TS store is a mirror over the Rust StoreHost. A red-first port-complete gate keeps them deleted, and a pinned schedule names every remaining mirror's deletion phase.**

## SC4: legendary migration reachability (recorded before deletion, D-06)

The TS migration system had one migration, `legendary.ts` (`legendary-move-global-config-folder`). It copied a system-wide legendary config into GameLib's own folder on first run. `applyMigrations()` ran from the sidecar bootstrap in v0.8, v0.9 and v0.10 (wired by quick 260822-s8y before v0.8). Electron-era builds ran it from `main.ts` before that. The migration returned true, and so was recorded as applied, even when there was nothing to copy. The operator's `store/migrations.json` reads `["legendary-move-global-config-folder"]`, as do the generated v0.8, v0.9 and v0.10 corpus profiles, so every supported upgrade source has it applied. The only remaining reach is a fresh install on a machine that already has a system-wide legendary config (`~/.config/legendary`, or `<appData>/legendary` on Linux). That user can sign in to Epic again. So the migration was deleted rather than ported, together with `MigrationSystem` (`migration/index.ts`, `migration/stores.ts`) and the `migrationsStore` mirror. `store/migrations.json` stays on disk and Rust never opens it (D-07).

## Performance

- **Duration:** 50 min
- **Started:** 2026-11-22T05:03:24Z
- **Completed:** 2026-11-22T05:53:03Z
- **Tasks:** 2 (Task 1 a tracer, verified end to end before Task 2)
- **Files modified:** 102 (1,853 insertions, 6,811 deletions)

## Accomplishments

- **Port-complete gate (red first both times).** `storeHostPortComplete.test.ts` checks:
  - DELETED paths are absent and KEPT paths present (the golden, vectors, corpus and corpus-expected fixture dirs, mirrorCell, dotPath, storeFrames, settingsDocs and bottleVersionGate).
  - Forbidden identifiers are absent from comment-stripped `src`, `meta`, `src-tauri/src` and every crate's `src`.
  - The flag does not appear as a whole word in raw text, tests included. The flag name is built from parts, so the gate does not name it.
  - Nothing imports `conf`.
  - Walk floors and a self-test per scan.
- **Task 1 red:** 10 failed, 14 passed. **Task 2 red:** 10 failed, 26 passed. **Final green:** 36 passed. Mutation-checked: a `GAMELIB_STORE` comment appended to `store_boot.rs` fails the flag scan.
- **Mirror schedule (D-19).** 57 rows. The test fails if:
  - a store due after 85 lost its registration or documented TS class;
  - `migrationsStore` or `uploadedLogs` (84) still has one;
  - a registered store has no row;
  - the table disagrees with 82-STATE-OWNERSHIP.md.
- **82-STATE-OWNERSHIP.md:** the two settings-document deletion cells (98, R3) written into its notes.
- **Rust:**
  - `store_boot` has no `StoreMode`, `store_mode_from_env` or `Ownership`. `is_rust_owned(row)` is "every row but excluded".
  - `store_dispatch` and `store_native` lost the mode, the `SidecarProxy`, every `store:ts-*` constant and forward, and `NewOutcome`/`WriteOutcome::Forwarded`.
  - `main.rs`, `native_router`, `safety_dispatch`, `log_upload` and `relay_commands` follow.
- **TS:**
  - `GameLibStore` is mirror-only. It keeps the WR-11 path translation and containment and records its `declaration`.
  - `storeWriteHandlers.ts` keeps only the single `STORE_CHANGED_CHANNEL` push site, the change-channel bind and the `storeMirrorEvent` registration.
  - `handlers.ts` has no store read handler.
  - `frontendReady` always raises the read-only notice through Rust.
  - `typed_store.ts` has a local `StoreOptions`.
- **IPC:** `sidecarInternal.ts` lost the six `store:ts-*` schemas and `STORE_SNAPSHOT_CHANNEL` left the generator. `ipc_contract.rs` was regenerated; `check:ipc-contract` passes.

## Task Commits

1. **Task 1: tracer, migration system and mirror schedule** - `eea0c79c7` (feat), plus `7befbc4b2` (fix: the SC4 sentence was wrapped across two lines, so the one-line acceptance grep read 0)
2. **Task 2: flag, TS owner path, conf** - `6a3a77f1e` (feat)

**Plan metadata:** the final docs commit (SUMMARY, STATE, ROADMAP, REQUIREMENTS)

## Files Created/Modified

- `src/backend/__tests__/storeHostPortComplete.test.ts` - the deletion gate with the SC4 header
- `src/backend/__tests__/storeMirrorSchedule.test.ts` - the pinned mirror-deletion schedule
- `src/backend/stores/__tests__/storeKeys.test.ts` - the table-key helper cases moved from the deleted storeOwnership suite
- `src/backend/store_backend.ts` - mirror-only facade
- `src/backend/stores/storeFrames.ts` / `storeRoot.ts` - the key helpers and the boot env, moved from storeOwnership.ts
- `src-tauri/src/store_boot.rs`, `store_native.rs`, `store_dispatch.rs` - the mode, ownership file and forwards removed
- `meta/genStoreTable.ts` - `store/migrations` as a no-TS-store row
- Deleted:
  - `src/backend/migration/` (3 modules)
  - `migrationsWiring.test.ts`
  - `meta/backendDiCeilings/migration.json` (empty)
  - `storeOwnership.ts`, `storeOwnership.json`
  - `storeOracle.test.ts`, `storeOwnership.test.ts`, `storeFallback.test.ts`, `storeBackendVersioning.test.ts`

## Decisions Made

See `key-decisions` above. In short:
- `store/migrations` keeps an excluded no-TS-store row (D-07 record, corpus `tableKey`).
- The mirror key rule is "any resolvable store key but the excluded one".
- With no home directory, a store read or write is an error instead of a forward.
- Dead callers were removed with their handlers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `store/migrations` row kept, not removed**
- **Found during:** Task 1
- **Issue:** removing the row would break things the plan keeps:
  - the KEPT corpus manifest, whose four `migrations.json` entries have `tableKey: "store/migrations"`, so `corpus.rs` would panic "no table row";
  - `table.rs` tests;
  - the table's own record that Rust never opens the file.
- **Fix:** `genStoreTable.ts` emits it as an EXTRA_ROW with `tsNames: []`, as `uploadedLogs` has been since 84. Task 2 then keeps the excluded rule because a row still uses it, which is the plan's own conditional.
- **Files modified:** meta/genStoreTable.ts, src/common/types/ipc/storeTable.json
- **Committed in:** eea0c79c7

**2. [Rule 3 - Blocking] Pins and lists outside the plan's file lists**
- **Found during:** Tasks 1 and 2
- **Issue:** the deletions moved counts and lists that other gates pin:
  - bootSourceShape, configBootOrder and pathsBootOrder (the 'migrations' step);
  - diPhaseGates (16 to 15 stores modules, floor 17 to 16);
  - testContainment (classified suite list);
  - storeLayer's name list;
  - testServices.test (18 to 17 families, missed in Task 1, fixed in the Task 2 commit);
  - sidecar-tests-boot.json (a stale `migrationsWiring` jestMock entry, missed in Task 1, fixed in the Task 2 commit);
  - storePolicyVectors.json (regenerated);
  - storePolicy.test;
  - the tauriTransport.test lazy-store examples (repointed to `nileConfigStore`/`legendaryConfigStore`, because every lazy store already has its own order-sensitive case);
  - tauriShellSource (the ownership-file pin replaced with a no-ownership pin);
  - sidecarInternal schema test (16 to 10 channels);
  - rendererAllowList.
- **Fix:** moved each pin with a dated note. No floor was lowered except where the file it counts was deleted.
- **Committed in:** eea0c79c7, 6a3a77f1e

**3. [Rule 1 - Dead code] Callers left with no caller removed**
- **Found during:** Task 2
- **Issue:** with the `store:ts-*` handlers gone, several things lost their only caller:
  - `applyStoreWrite` and `resolveWritableStore`;
  - `resolveRawStore` and `CACHE_BACKED_STORE_NAMES` (handlers.ts);
  - `pushReadOnlyStoresNotice`;
  - `store_dispatch::sidecar_state`;
  - the `DENIED_CACHE_STORES` export (knip).
- **Fix:** deleted them, and made `DENIED_CACHE_STORES` module-private rather than baselining it.
- **Committed in:** 6a3a77f1e

**4. [Rule 3 - Blocking] Test suites built on the conf owner**
- **Found during:** Task 2
- **Issue:** the default test root was `ts` mode, so 27 suites relied on conf behaviour:
  - conf re-reads its file on every access;
  - `defaults`;
  - arbitrary cache names;
  - the `jest_store_root/` cwd redirect in `__mocks__/store_backend.ts`;
  - the deleted handlers.
- **Fix:**
  - The mock no longer redirects cwd; the jest-contained userData is the isolation.
  - Suites use table store paths and shared roots, and the boot-reported read-only set.
  - The ts-mode, handler and conf-byte-parity cases were deleted where their behaviour is now the shell's (store_native / store_policy cargo tests).
  - The `readStoreBootEnv` cases moved to storeRoot.test, the key cases to a new storeKeys.test.
  - cache.test's non-vacuity case restates conf's path rule instead of importing conf.
- **Committed in:** 6a3a77f1e

---

**Total deviations:** 4, all auto-fixed (Rules 1 and 3). **Impact:** each was needed to delete what the plan names without breaking a KEPT fixture or an unrelated gate. There was no behaviour change in production, which has run every store as a mirror since 85-15.

## Issues Encountered

- **One jest flake in the full `pnpm test` run.** `src/backend/sidecar/__tests__/outboundHttpRegistry.test.ts` failed once (1 of 24,416 tests). It passes alone (9/9). This is the WebSocket-upgrade-under-load flake already recorded in deferred-items.md (85-17), in code this plan did not touch.

## Gates at the last code commit (6a3a77f1e)

These ran on the final tree; only prettier fixes and a comment followed the run.
- `npx jest src/backend src/common src/preload`: 664 suites passed.
- `pnpm test`: 1,144 suites passed, 1 known flake.
- `cargo test --bin gamelib-shell`: 687 passed.
- `cargo test -p gamelib-store`: all green.
- `rustfmt --check` on every edited `.rs` file: clean.
- `check:ipc-contract`, `smoke:sidecar` (PASS), `codecheck` (0 errors), `lint` (production PASS, tests PASS), `find-deadcode` (PASS, 311 baselined, none new), `backend-di-ceilings` (PASS), `planning-gates` (12/12).
- `npx prettier --check` over every edited TS/JSON path: clean, and no path was prettier-ignored.

## Known Stubs

None.

## User Setup Required

None.

## Next Phase Readiness

- 85-22 can unthread the TS versioning engine from the engine side. ts mode is gone, so engineConfig's TS migrate step is dead weight, as the 85-22 truth says.
- storeVersioning/* and storeMigrations/* still exist, and their consumers belong to 85-22..85-24. The settings-docs TS-read path for callers with no root (settingsDocs.ts `writeSettingsFile`/`ensureSettingsMigrated`) goes with them.
- The 85-17 late mirror-cell rev handshake stays deferred (deferred-items.md).

---
*Phase: 85-store-host-config-and-versioned-migrations*
*Completed: 2026-11-22*

## Self-Check: PASSED

- Files: storeHostPortComplete.test.ts, storeMirrorSchedule.test.ts and storeKeys.test.ts exist.
- Deleted paths are absent: `src/backend/migration`, storeOwnership.ts/.json, storeOracle.test.ts, storeBackendVersioning.test.ts.
- Commits: eea0c79c7, 7befbc4b2 and 6a3a77f1e are ancestors of HEAD.
