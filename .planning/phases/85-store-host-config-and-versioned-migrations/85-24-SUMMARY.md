---
phase: 85-store-host-config-and-versioned-migrations
plan: 24
subsystem: infra
tags: [typescript, rust, store, versioning, deletion, read-only-notice, port-complete]

requires:
  - phase: 85-23
    provides: config, manager and store-root side with no versioning member
  - phase: 85-22
    provides: engine side with no versioning member
  - phase: 85-16
    provides: Rust raises the read-only notice; store_policy.rs area port and its vectors
provides:
  - "storeVersioning/* and storeMigrations/* TypeScript deleted (with tests and fixtures), behind red-first storeHostPortComplete entries; with 85-21's migration/* deletion SC5's TS deletions are complete"
  - "The TS read-only notice path ended: readOnlyStoresNotice.ts deleted, StoreRoot has no read-only aggregate, frontendReady calls store_read_only_notice with tsEntries: []"
  - "src/backend/utils/schemaStrip.ts (moved unchanged, test beside it) and src/backend/stores/types.ts (StoreKind, StoreDeclaration)"
  - "storeTable.json chainVersions: the chain versions the TS side reads, held equal to Chains::baseline by cargo and to storeSchemaVersions.ts and CHAIN_CURRENT by jest"
  - "storeHostPortComplete forbids either deleted directory as an import, require, dynamic import or jest.mock specifier, tests included"
affects: [85-25]

actuals:
  tokens: 55000    # chars/4 over the realized diff (git diff plan_head_before..plan_head_after outside .planning: 220167 chars, mostly deletions)
  tasks: 2
  commits: 2       # MEASURED: git rev-list --count plan_head_before..HEAD (before this docs commit)
plan_head_before: 0c3c1921da24f26c4ad021e5fd87b41b237f14eb
plan_head_after: e23d1840379dbab131be30b6b71934fdc6809363

tech-stack:
  added: []
  patterns:
    - "A version the TS side needs and only Rust code defines goes into generated data (storeTable.json chainVersions) with a cargo test pinning it to the Rust registry, and jest tests pinning every TS copy to the data"
    - "A deletion gate forbids a deleted directory by module specifier (from/import()/require/jest.mock), so path strings naming it stay legal"

key-files:
  created:
    - src/backend/stores/types.ts
    - src/backend/utils/schemaStrip.ts (moved)
    - src/backend/utils/__tests__/schemaStrip.test.ts (moved)
  modified:
    - src/backend/__tests__/storeHostPortComplete.test.ts
    - src/backend/stores/storeRoot.ts
    - src/backend/sidecar/appShellFlowRegistration.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/testUtils/testStoreRoot.ts
    - src/backend/stores/__tests__/storePolicyVectors.test.ts
    - src/backend/stores/__tests__/storeTable.test.ts
    - src/backend/store_backend.ts
    - meta/genStoreTable.ts
    - meta/__tests__/storeCorpus.test.ts
    - meta/harvestStoreCorpus.ts
    - src/common/types/ipc/storeTable.json
    - src-tauri/crates/gamelib-store/src/table.rs
  deleted:
    - src/backend/storeVersioning/ (7 sources, 9 test files)
    - src/backend/storeMigrations/ (5 sources besides schemaStrip, 3 tests, 27 fixtures)
    - src/backend/sidecar/readOnlyStoresNotice.ts
    - meta/backendDiCeilings/storeVersioning.json

key-decisions:
  - "frontendReady keeps the store_read_only_notice wire shape and sends { tsEntries: [] }: changing the rustInvoke contract is out of scope, and the Rust host's read-only stores were already the whole of the boot-seeded TS entries"
  - "storePolicyVectors.test.ts carries the committed area section unchanged in write mode and asserts only that the file has exactly the five sections; cargo store_policy is the area section's only proof"
  - "The chain versions became data: storeTable.json gained a top-level chainVersions (TableFile ignores unknown top-level keys, so no TableRow change); the generator's CHAIN_VERSIONS replaced STORE_MIGRATIONS as the chain source; cargo table_chain_versions_equal_the_shell_chains holds it and every row's chain equal to Chains::baseline in both directions"
  - "storeKeyOf (the only other runtime export store_backend.ts used from the engine) became a private function in store_backend.ts, its one caller"

patterns-established: []

requirements-completed: [FND-06]

coverage:
  - id: D1
    description: "The TS read-only notice path ends: readOnlyStoresNotice.ts deleted, StoreRoot drops the aggregate, frontendReady sends only Rust's notice with no TS entries"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/sidecar/__tests__/appShellFlows.test.ts#85-24: frontendReady x2 calls store_read_only_notice once with no TS entries and pushes no notice itself"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/storeHostPortComplete.test.ts (readOnlyStoresNotice.ts deleted; notice helper forbidden), red before, green after"
        status: pass
      - kind: other
        ref: "grep -rhE 'createReadOnlyStores|pushReadOnlyStoresNotice|readOnlySinks|storeRoot\\.readOnly|root\\.readOnly' src --exclude-dir=storeVersioning (comment-filtered) == 0"
        status: pass
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_policy (12 passed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "storeVersioning/* and storeMigrations/* deleted behind the gate; schemaStrip and the store types relocated; nothing imports, requires or mocks either directory"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/__tests__/storeHostPortComplete.test.ts (77 tests: DELETED, KEPT, forbidden identifiers, specifier scan and its self-test), red before the deletions, green after"
        status: pass
      - kind: other
        ref: "grep -rlE \"(from |require\\(|jest\\.mock\\()['\\\"][^'\\\"]*(storeVersioning|storeMigrations)\" src meta | wc -l == 0; test ! -e both directories"
        status: pass
      - kind: unit
        ref: "pnpm test (1133 suites passed, 5 skipped; 24267 tests passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Orchestrator amendment: storeSchemaVersions.ts and CHAIN_CURRENT cannot drift from the shell's chains"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/stores/__tests__/storeTable.test.ts#storeSchemaVersions.ts stamps every row at the version chainVersions gives it"
        status: pass
      - kind: unit
        ref: "meta/__tests__/storeCorpus.test.ts#agrees with the store table chain versions (the shell chains)"
        status: pass
      - kind: unit
        ref: "cargo test -p gamelib-store table_chain_versions_equal_the_shell_chains (shown failing on a planted settings/game 3)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Plan-end gates green"
    verification:
      - kind: other
        ref: "cargo test --bin gamelib-shell (687 passed); cargo test -p gamelib-store -p gamelib-store-cli (all ok); check:ipc-contract up to date; smoke:sidecar PASS; smoke:exit-check --mode eof PASS (11 ms); codecheck 0 errors; lint PASS; find-deadcode PASS (311 baselined, none added); backend-di-ceilings PASS (jestMock=1798); planning-gates 12/12"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-11-22
status: complete
---

# Phase 85 Plan 24: Delete storeVersioning and storeMigrations TypeScript Summary

**The TS versioning engine, the TS migration chains and the TS read-only notice path are deleted (SC5). schemaStrip and the store declaration types are relocated, and the chain versions the TS side still needs come from generated table data that cargo pins to the shell's `Chains::baseline`.**

## Performance

- **Duration:** about 20 min
- **Started:** 2026-11-22T06:29:20Z
- **Completed:** 2026-11-22T06:49:12Z
- **Tasks:** 2
- **Files changed:** 84 (379 insertions, 4908 deletions)

## Accomplishments

- The frontendReady flow calls `store_read_only_notice` with `{ tsEntries: [] }`. The Rust host's own read-only stores (85-16) are now the whole notice. `StoreRoot` has no read-only aggregate, no sinks seam and no boot seeding, and `readOnlyStoresNotice.ts` is deleted.
- `storePolicyVectors.test.ts` asserts the read, write, keyPath and cacheName rows against TS. The area section stays in the file untouched, and cargo's `store_policy` test is its only proof.
- Deleted: `src/backend/storeVersioning/`, `src/backend/storeMigrations/` (including tests and fixtures) and `meta/backendDiCeilings/storeVersioning.json`. `schemaStrip.ts` moved unchanged to `src/backend/utils/` with its test beside it, and `rustRefresh.ts` was re-pointed. `StoreKind`/`StoreDeclaration` now live in `src/backend/stores/types.ts`.
- storeHostPortComplete lists every deleted file and the three KEPT survivors. It forbids the versioning interface, the read-only aggregate factory and the notice helper. It also forbids either directory as a module specifier, with tests included in the scan.
- `storeTable.json` gained `chainVersions`. The store table generator, `storeSchemaVersions.ts` (85-23) and the corpus harvester's `CHAIN_CURRENT` are now all machine-checked against the shell's chains.

## Task Commits

1. **Task 1 (tracer): end the TS read-only notice path** - `943d58d3d` (feat)
2. **Task 2: delete storeVersioning and storeMigrations TypeScript** - `e23d18403` (feat)

Tracer gate (interactive, end-of-phase, automated-only verify): before Task 2 started I re-ran Task 1's verify: the four plan suites plus mirrorCell, the reference count (0), cargo store_policy (12 passed), codecheck and prettier. All passed. A wider `jest src/backend/sidecar src/backend/stores src/backend/__tests__` run (240 suites) also passed.

### Red-first record (storeHostPortComplete)

Task 1, before deleting the notice module:

```
✕ src/backend/sidecar/readOnlyStoresNotice.ts is deleted
✕ comment-stripped non-test src/, meta/ and src-tauri sources never name raiseReadOnlyStoresNoticeInRust
    +   "src/backend/sidecar/appShellFlowRegistration.ts: raiseReadOnlyStoresNoticeInRust",
    +   "src/backend/sidecar/readOnlyStoresNotice.ts: raiseReadOnlyStoresNoticeInRust",
Tests:       2 failed, 38 passed, 40 total
```

After: `Tests: 198 passed, 198 total` over storeHostPortComplete, appShellFlows, runnerSliceRegistration, storePolicyVectors and mirrorCell.

Task 2, before the moves and deletions: 36 failed, 41 passed, 77 total. The failures were 30 DELETED paths, the 3 KEPT survivors, `StoreVersioning` (engine.ts, engineMarkerFile.ts, settingsFiles.ts, sharedRedistLedgerFile.ts), `createReadOnlyStores` (readOnlyStores.ts), and the specifier scan. The specifier scan named cache.ts, rustRefresh.ts, store_backend.ts, storeRegistry.ts, typed_store.ts, storeTable.test.ts, meta/genStoreTable.ts, meta/__tests__/storeCorpus.test.ts and the directories' own files. The specifier self-test passed while red.

After: `Tests: 77 passed, 77 total`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] More importers than the plan listed**
- **Found during:** Task 1 and Task 2 (the plan's own reference count and the specifier scan)
- **Issue:** the plan's lists left out `mirrorCell.test.ts` (two cases read `root.readOnly`), `meta/genStoreTable.ts` and `storeTable.test.ts` (`STORE_MIGRATIONS` as the chain source), `meta/__tests__/storeCorpus.test.ts` (the runner, flagged by the orchestrator) and `store_backend.ts`'s `storeKeyOf` import from the engine.
- **Fix:**
  - Deleted the two mirrorCell aggregate cases. The boot read-only cell case stays.
  - Made `storeKeyOf` a private function in store_backend.ts.
  - Replaced the generator's chain source with `CHAIN_VERSIONS` (see 2).
  - Re-pointed storeTable.test.ts and the corpus check at `chainVersions`.
- **Commits:** 943d58d3d, e23d18403

**2. [Orchestrator amendment] The chain versions as checked data**
- **Issue:** the shell reads its chain versions from Rust code (`Chains::baseline`), not from a data file. That left the test-side `storeSchemaVersions.ts` and the harvester's `CHAIN_CURRENT` with nothing to check against once the TS registry was gone.
- **Fix:**
  - The generator writes a top-level `chainVersions` map into `storeTable.json`. Rust's `TableFile` ignores unknown top-level keys, so `TableRow` is unchanged.
  - New cargo test `table_chain_versions_equal_the_shell_chains` (gamelib-store `table.rs`) holds the map, and every row's chain and version, equal to `Chains::baseline` in both directions. A planted `settings/game: 3` made it fail.
  - New jest case in storeTable.test.ts holds `storeSchemaVersions.ts` equal to the map for every row and chain key.
  - storeCorpus.test.ts holds `CHAIN_CURRENT` equal to it.
- **Files:** meta/genStoreTable.ts, src/common/types/ipc/storeTable.json, src-tauri/crates/gamelib-store/src/table.rs, src/backend/stores/__tests__/storeTable.test.ts, meta/__tests__/storeCorpus.test.ts, meta/harvestStoreCorpus.ts (comment)
- **Commit:** e23d18403

**3. [Rule 3 - Blocking] diPhaseGates floor**
- The 66.4 owned list lost the three deleted files, so its floor (which equals the list length) moved from 76 to 73, with a comment recording why.
- **Commit:** e23d18403

**4. [Rule 3 - Blocking] knip: newly unused exports**
- `ReadOnlyArea` in `common/types/readOnlyStores.ts` (its only importer was the deleted aggregate) and the generator's `CHAIN_VERSIONS` are no longer exported. No baseline line was added.
- **Commit:** e23d18403

**5. [Rule 1 - Stale docs] Comments naming deleted TS modules**
- Reworded comments in gameInfoSchema.ts (the plan's item), genStoreSchemas.ts, schemaDescriptor.test.ts, store_policy.rs (its header said readOnlyStores.ts read storeChannels.json), migrate/mod.rs (`TS_CHAIN_KEYS`) and table.rs (`chain` doc). Historical references in other Rust comments and NOTES.md were left alone.
- **Commit:** e23d18403

**Total deviations:** 5 (3 Rule 3, 1 Rule 1, 1 orchestrator amendment). **Impact:** every production change is what the plan specified. The extras are test and data wiring that keep the remaining TS version tables tied to the shell.

## Issues Encountered

None. `outboundHttpRegistry.test.ts` did not flake in the full run. `src/frontend/state/libraryState.ts` was modified in the working tree by another session during this plan. I did not touch it or stage it.

## Known Stubs

None.

## Threat Flags

None. T-85-60 is mitigated as planned: the gate went red first in each task, the KEPT entries cover utils/schemaStrip.ts, its test and stores/types.ts, the specifier scan is in place, and rustRefresh.ts imports `backend/utils/schemaStrip`. T-85-61: Rust's notice is the only one, the frontendReady case asserts it is still sent once, and cargo store_policy keeps the area mapping proven. D-07 is untouched: the `store/migrations` row stays `excluded`.

## Next Phase Readiness

SC5's TS deletions are complete. 85-25 can push. `storeSchemaVersions.ts`, `CHAIN_CURRENT` and the generator's `CHAIN_VERSIONS` are three hand-written copies of the shell's chain versions, and each is now machine-checked against it.

## Self-Check: PASSED

- FOUND: src/backend/utils/schemaStrip.ts, src/backend/utils/__tests__/schemaStrip.test.ts, src/backend/stores/types.ts
- MISSING (as intended): src/backend/storeVersioning, src/backend/storeMigrations, src/backend/sidecar/readOnlyStoresNotice.ts, meta/backendDiCeilings/storeVersioning.json
- FOUND commits: 943d58d3d, e23d18403
