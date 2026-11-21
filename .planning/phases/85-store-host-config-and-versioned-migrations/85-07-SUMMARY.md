---
phase: 85-store-host-config-and-versioned-migrations
plan: 07
subsystem: storage
tags: [rust, store-engine, envelope, backups, corrupt-handling, store-table, corpus, golden, d-12, d-18]

requires:
  - phase: 85-01
    provides: "golden cases.json, outcomes.json and the expected tree this plan replays (ops, settingsDoc, engine, rotation)"
  - phase: 85-02
    provides: "MANIFEST.json and the 161-file real-store corpus"
  - phase: 85-06
    provides: "gamelib-store json, dotpath and atomic primitives"
provides:
  - "gamelib-store envelope (RESERVED_KEY, store_version, stamp_for_write, strip_envelope, settings_version, set_settings_version) and ops (Op, OpReject, apply, get, has)"
  - "gamelib-store engine::open_file with OpenOutcome Missing | Ok | Adopted | Migrated | CacheDiscarded | ReadOnly{Newer|Failed} | StartEmpty, and StoreKind, ReadOnlyReason, Flavour, Opened"
  - "gamelib-store backup (MAX_BACKUPS_PER_STORE = 3, write_pre_migration_backup, write_corrupt_copy, stamp, is_side_file)"
  - "gamelib-store migrate::{Step, StepFn, Chains::{baseline, with_override, current_version_of, pending}} (registry only; 85-08 fills the steps)"
  - "gamelib-store table (TableRow, Family, Kind, table, row_for_key, row_for_path) over the generated src/common/types/ipc/storeTable.json"
  - "meta/genStoreTable.ts (--check) and its jest drift test"
  - "tests ops_golden, engine_golden and corpus"
affects: [85-08, 85-09, store host, store-cli, settings resync, TS store deletion]

tech-stack:
  added: []
  patterns:
    - "The ops work on the whole document with the __internal__ envelope kept in it (so a write keeps its position and its other keys); the reserved key is refused for writes and hidden from reads instead of being split off"
    - "open_file returns the document reads are served from plus the version a write stamps; every read-only outcome leaves the file's bytes untouched"
    - "Side files (backups, corrupt copies) share one writer: 0600 through write_atomic Synced, skip when equal to the newest of the family, prune the oldest beyond 3 but never the file just written"
    - "One generated table for both sides: the generator's pure buildStoreTable() is what jest deep-equals, the prettier-formatted bytes are what --check compares"

key-files:
  created:
    - src-tauri/crates/gamelib-store/src/envelope.rs
    - src-tauri/crates/gamelib-store/src/ops.rs
    - src-tauri/crates/gamelib-store/src/engine.rs
    - src-tauri/crates/gamelib-store/src/backup.rs
    - src-tauri/crates/gamelib-store/src/migrate/mod.rs
    - src-tauri/crates/gamelib-store/src/table.rs
    - src-tauri/crates/gamelib-store/tests/common/mod.rs
    - src-tauri/crates/gamelib-store/tests/ops_golden.rs
    - src-tauri/crates/gamelib-store/tests/engine_golden.rs
    - src-tauri/crates/gamelib-store/tests/corpus.rs
    - meta/genStoreTable.ts
    - src/common/types/ipc/storeTable.json
    - src/backend/stores/__tests__/storeTable.test.ts
  modified:
    - src-tauri/crates/gamelib-store/src/lib.rs

key-decisions:
  - "Corrupt files (D-18) are copied to <name>.corrupt.<stamp>.json before anything else; the original is never rewritten; a cache then starts empty, every other kind opens ReadOnly(Failed), and so does any kind whose copy cannot be written"
  - "A migration rewrite is written with the tab layout for settings documents too (to_store_bytes), because the golden oracle shows TS did; the plan text said to_settings_bytes and the oracle wins"
  - "Step.run is an Arc<dyn Fn(&mut Json) -> Result<(), String>> (StepFn), not a fn pointer, so the golden's data-driven setTop/deleteTop/throws steps and 85-08's schema-bound strips can capture state"
  - "The backup stamp uses an in-crate civil-date routine (Hinnant's civil_from_days); no date crate is added and Cargo.lock is unchanged"
  - "Opened.version is always the chain's current version (what a write stamps); Opened.view keeps the envelope as the file had it, and is {} for a cache over a newer file (viewOf), a discarded cache and a StartEmpty"

patterns-established:
  - "Golden replay helper (tests/common): Replay stands in for GameLibStore over one file; reads are compared as canonical lines so key order is part of the comparison"
  - "Corpus tests derive the table row from the manifest's tableKey, never from the staged file name (the edge fixtures carry names that are not store names)"

requirements-completed: [FND-06]

coverage:
  - id: D1
    description: "Every golden ops and settingsDoc case replays in Rust to byte-identical files and reads: envelope stamped at write time keeping an existing envelope's position, appended last otherwise, reads never expose __internal__, and a write whose first segment is __internal__ is refused with no change"
    requirement: FND-06
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-store/tests/ops_golden.rs#every_ops_case_writes_the_bytes_ts_wrote"
        status: pass
      - kind: integration
        ref: "src-tauri/crates/gamelib-store/tests/ops_golden.rs#every_settings_doc_case_writes_the_bytes_ts_wrote"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-12: identity-only pending chains are adopted with zero bytes written, current files untouched, newer files read-only with their bytes untouched, a non-identity chain writes a backup then rewrites atomically, a cache with a non-identity chain is deleted; every golden engine case and the backup-rotation case match outcomes.json"
    requirement: FND-06
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-store/tests/engine_golden.rs#every_engine_case_decides_the_way_ts_did"
        status: pass
      - kind: integration
        ref: "src-tauri/crates/gamelib-store/tests/engine_golden.rs#backup_rotation_keeps_three_and_skips_an_equal_newest"
        status: pass
      - kind: unit
        ref: "cargo test -p gamelib-store engine:: backup::"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-18: a corrupt file (unparseable, array root, empty, BOM, lone surrogate) is copied aside first and kept byte-identical; user-state, account and settings open ReadOnly(Failed), caches StartEmpty only after the copy exists, and an unwritable copy makes every kind ReadOnly(Failed); copies are 0600 and capped at 3 with a newest-equal skip"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-store/src/engine.rs#tests::a_corrupt_user_file_is_copied_aside_kept_and_opened_read_only"
        status: pass
      - kind: unit
        ref: "src-tauri/crates/gamelib-store/src/engine.rs#tests::when_the_copy_cannot_be_written_every_kind_opens_read_only"
        status: pass
      - kind: unit
        ref: "src-tauri/crates/gamelib-store/src/backup.rs#tests::a_permanently_corrupt_file_does_not_grow_the_disk_on_every_boot"
        status: pass
    human_judgment: false
  - id: D4
    description: "SC1/FND-06 idempotency: opening every roundtrip corpus file writes zero bytes (twice), its parsed data re-serialises to its exact bytes, and unknown keys at the current version survive a write; the CRLF edge is checked as semantic-only"
    requirement: FND-06
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-store/tests/corpus.rs#roundtrip_is_byte_identical"
        status: pass
      - kind: integration
        ref: "src-tauri/crates/gamelib-store/tests/corpus.rs#noop_open_writes_nothing"
        status: pass
      - kind: integration
        ref: "src-tauri/crates/gamelib-store/tests/corpus.rs#unknown_keys_at_the_current_version_survive_a_write"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every non-migrate corpus outcome matches its MANIFEST expect (readOnly-failed 5, readOnly-newer 2, startEmpty 1, missing 1 with nothing created); migrate entries (70) are classified as pending; the test fails below the manifest floor (161) and when an expect value, source or table key has no entry"
    requirement: FND-06
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-store/tests/corpus.rs#outcomes_match_manifest"
        status: pass
      - kind: integration
        ref: "src-tauri/crates/gamelib-store/tests/corpus.rs#manifest_is_complete"
        status: pass
      - kind: integration
        ref: "src-tauri/crates/gamelib-store/tests/corpus.rs#migrate_entries_have_a_pending_chain"
        status: pass
    human_judgment: false
  - id: D6
    description: "D-11: storeTable.json (56 rows) is generated by meta/genStoreTable.ts from registeredStores.json plus the extra, native and settings rows; store/migrations is the one excluded row; a jest drift test regenerates it and ties it to EXPECTED_KINDS (54 names) and STORE_MIGRATIONS; the Rust table parses it and applies the family rule"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/stores/__tests__/storeTable.test.ts"
        status: pass
      - kind: other
        ref: "node meta/runTs.cjs --bundle --platform=node --target=node22 meta/genStoreTable.ts --check"
        status: pass
      - kind: unit
        ref: "cargo test -p gamelib-store table::"
        status: pass
    human_judgment: false

duration: about 45 min
completed: 2026-11-22
status: complete
actuals:
  tokens: 35000
  tasks: 3
  commits: 10
plan_head_before: 9d3428feb420bdfc4b209053f6f25c4b24a4f66a
plan_head_after: 3ca99c0f72953dc0ab7e08fc6998857f54fa5885
---

# Phase 85 Plan 07: Store engine, backups, corrupt handling and the generated store table Summary

**Rust port of the Phase 68 version engine (identity adoption writes nothing, backup-then-atomic-rewrite, cache discard, newer read-only) with the D-18 corrupt-file copy-aside, the `__internal__` envelope and op layer, and one generated `storeTable.json` both sides read, proven against all 23 golden ops/settingsDoc cases, 14 engine cases, the rotation case and the 161-file real-store corpus.**

## Performance

- **Duration:** about 45 min (the start time was not captured; first task commit 06:46 +13, last 06:57 +13)
- **Completed:** 2026-11-22
- **Tasks:** 3 (Task 1 a tracer, Task 2 TDD, Task 3 auto)
- **Files modified:** 14 (13 created, `lib.rs` modified)
- **Commits:** `commits: 10` is the measured `rev-list` count over the plan's range. Four are this plan's (below); six are other sessions' commits that landed on main in the same window (`0c1ea4a87`, `13608a70c`, `857ef3dc5`, `5ad01481e`, `daea6bdc0`, `2043bc4d0`).

## Accomplishments

- **Write shape (Task 1).** `envelope` ports `storeVersionCodec`, `stampForWrite` and `parseSettingsVersion`; `ops` applies set/delete/clear/replace over dot-prop paths and refuses a reserved `__internal__` first segment (typed_store parity, also with dot paths off) without changing anything. `ops_golden` replays all 16 `ops` and 7 `settingsDoc` cases to byte-identical files, reads, and the refused-op indexes.
- **Engine (Task 2).** `open_file` follows `runFileMigration`'s order and adds D-18: a corrupt file (unparseable, array root, empty, BOM, lone surrogate) is copied to `<name>.corrupt.<stamp>.json` first and kept byte-identical; caches start empty only once the copy exists; if the copy cannot be written every kind opens `ReadOnly(Failed)`. Pre-migration backups and corrupt copies share one 0600 writer that skips a newest-equal write and keeps three. `engine_golden` replays all 14 engine cases (10 oracle, 4 tsOnly) and the five-boot rotation case.
- **Table and corpus (Task 3).** `storeTable.json` has 56 rows (registered stores, `steam_update_prompt_ack`, `steam_engine_notices`, `uploadedLogs` native, `settings/global`, `settings/game`); `store/migrations` is the one `excluded` row. `corpus.rs` runs the 161-file corpus: 78 roundtrip files open twice with nothing written and re-serialise to their bytes, 70 `migrate` entries are classified pending, and the five readOnly-failed, two readOnly-newer, one startEmpty and one missing entry match their manifest outcome.

## Task Commits

1. **Task 1: tracer, envelope and ops replay every golden ops case** - `7e291352c` (feat)
2. **Task 2: version engine, backups, D-18** (TDD) - RED `1f69eef52` (test), GREEN `8b7d92f77` (feat)
3. **Task 3: generated store table, drift test, corpus** - `3ca99c0f7` (feat)

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md and ROADMAP.md.

## Tracer feedback gate

Task 1 is `type="tracer"` with an automated-only `<verify>`; `human_verify_mode` is `end-of-phase`, not auto mode. The verify was re-run end to end after the commit (`ops_golden` 3 tests, `envelope::`/`ops::` unit tests, clippy `-D warnings`, fmt) and passed, so expansion proceeded with no checkpoint. The test was also shown to fail when it should: stamping version 2 instead of 1 made `ops_golden` fail on `cache-ops-dotpath-intkey`.

## TDD Gate Compliance

Task 2 is `tdd="true"` inside an `execute` plan (not plan-level `type: tdd`), so the classifier-based `check tdd-red-evidence` contract does not apply; the RED/GREEN sequence was followed by commit.

- **RED** (`1f69eef52`): `engine::open_file` was a skeleton returning `Missing` and the backup writers returned the store path without writing. The suite compiled and 26 tests failed on assertions (for example `assertion left == right failed` on the expected outcome, the stamp text and the backup file set), including both `engine_golden` tests.
- **GREEN** (`8b7d92f77`): the implementation; 71 lib tests plus every integration target pass.

## Files Created/Modified

- `src-tauri/crates/gamelib-store/src/envelope.rs`, `ops.rs` - the envelope codecs and the op layer
- `src-tauri/crates/gamelib-store/src/engine.rs` - `open_file`, `OpenOutcome`, `Opened`, `StoreKind`, `ReadOnlyReason`, `Flavour` (serde, lowercase, for the table)
- `src-tauri/crates/gamelib-store/src/backup.rs` - side-file writer, stamp, `is_side_file`
- `src-tauri/crates/gamelib-store/src/migrate/mod.rs` - the chain registry (all 11 TS chain keys, no steps yet)
- `src-tauri/crates/gamelib-store/src/table.rs` - the compiled-in table and its lookups
- `src-tauri/crates/gamelib-store/tests/{common/mod,ops_golden,engine_golden,corpus}.rs`
- `meta/genStoreTable.ts`, `src/common/types/ipc/storeTable.json`, `src/backend/stores/__tests__/storeTable.test.ts`

## Decisions Made

See `key-decisions`. For 85-08: `Chains::baseline()` still has empty chains, so `settings/global` is current v1 in Rust until that plan registers the steps; `corpus.rs` carries a clearly named `TS_CURRENT` table that overrides the nine versioned chains with no-op steps so the engine can tell current, newer and pending apart. 85-08 should delete that table and assert real bytes for the `migrate` entries.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `Step.run` is an `Arc<dyn Fn>`, not a `fn` pointer, and `Step` has `id` and no `from`**
- **Found during:** Task 2
- **Issue:** The plan sketches `run: fn(&mut Json) -> Result<(), String>` and a `from` field. The golden's override steps (`setTop`, `deleteTop`, `throws`) are data, and 85-08's strip steps bind schema nodes; neither can be a bare `fn`. TS `Migration` has no `from` either (a step applies when `to > fromVersion`).
- **Fix:** `pub type StepFn = Arc<dyn Fn(&mut Json) -> Result<(), String> + Send + Sync>`; `Step { id, to, identity, run }` with `Step::new` and `Step::identity`.
- **Files modified:** `src/migrate/mod.rs`
- **Verification:** `engine_golden` rotation and every override case
- **Committed in:** `1f69eef52`

**2. [Rule 1 - Bug] A migrated settings document is rewritten with the tab layout**
- **Found during:** Task 2
- **Issue:** The plan says to write `to_store_bytes` or `to_settings_bytes`. The golden NOTES and `expected/migrate-settings-global-v0/config.json` show TS wrote every migration with `JSON.stringify(..., undefined, '\t')`, settings documents included (the next `writeSettingsFile` re-indents with two spaces).
- **Fix:** `open_file` always writes `to_store_bytes`; for `Flavour::Settings` it sets the top-level `version` instead of stamping an envelope (pinned by `a_migrated_settings_document_keeps_the_version_key_where_it_was_and_is_tab_indented`).
- **Files modified:** `src/engine.rs`
- **Committed in:** `8b7d92f77`

**3. [Rule 1 - Bug] Backup writers return `io::Result<PathBuf>`, not `io::Result<Option<PathBuf>>`**
- **Found during:** Task 2
- **Issue:** D-18 needs the path of the copy even when the write was skipped because the bytes equal the newest copy (`StartEmpty { copy }` must name a file that exists). `Option` would force every caller to re-list the directory.
- **Fix:** both writers return the path that now holds the bytes: the new file, or the newest existing one when equal. Tests assert no second file appears.
- **Files modified:** `src/backup.rs`
- **Committed in:** `8b7d92f77`

**4. [Rule 2 - Missing critical] Pruning never deletes the file just written**
- **Found during:** Task 2
- **Issue:** TS prunes the oldest by stamp, so a clock that ran backwards would delete the backup or copy that was just written, and D-18 relies on that copy existing before a cache continues.
- **Fix:** the prune list excludes the target.
- **Files modified:** `src/backup.rs`
- **Committed in:** `8b7d92f77`

**5. [Rule 3 - Blocking] `tests/common/mod.rs` added; `is_side_file` and a serde `Flavour`**
- **Found during:** Tasks 1 and 3
- **Issue:** `ops_golden` and `engine_golden` share the case and outcome readers and the op replay (not listed in `files_modified`); `row_for_path` must not map `GamesConfig/<app>.v0.<stamp>.bak.json` to the per-game settings row, and the table's `flavour` column must deserialise.
- **Fix:** a shared test module, `backup::is_side_file`, `#[derive(Deserialize)]` on `Flavour`.
- **Committed in:** `7e291352c`, `3ca99c0f7`

**6. [Rule 3 - Blocking] The generator loads prettier at run time, and jest compares data, not bytes**
- **Found during:** Task 3
- **Issue:** esbuild's CommonJS bundle of prettier 3 fails at start (`import.meta.url` is undefined), and prettier 3 cannot `format` inside jest without ESM VM flags.
- **Fix:** `renderStoreTable` loads prettier with `createRequire(cwd/package.json)` (a non-literal require esbuild leaves alone); `--check` compares formatted bytes, while the jest drift test deep-equals the pure `buildStoreTable()` with the committed JSON. Verified both fail on a changed `kind`.
- **Files modified:** `meta/genStoreTable.ts`
- **Committed in:** `3ca99c0f7`

**7. [Rule 3 - Blocking] knip: three exports trimmed**
- **Found during:** Task 3 (`pnpm find-deadcode`)
- **Fix:** `renderStoreTable`, `Kind` and `Flavour` are no longer exported from the generator. PASS at the 312-finding baseline.
- **Committed in:** `3ca99c0f7`

---

**Total deviations:** 7 auto-fixed (2 Rule 1, 1 Rule 2, 4 Rule 3)
**Impact on plan:** none changes what the plan delivers; 2 and 3 follow the oracle and D-18's own needs over the plan's sketch.

## Issues Encountered

- `src/backend/__tests__/cargoFeatures.test.ts` (the `Cargo.lock` crate-name pin) fails on the jiff and portable-atomic crates another session's `8fcadab94` added; the orchestrator named it. This plan adds no crate and `Cargo.lock` is unchanged, so it was not touched.
- One test of a `0500` directory proves nothing as root (a root-owned write succeeds anyway); both such tests detect that and skip the assertion instead of failing.
- The Windows leg cannot run here; nothing in this plan is Windows-specific (the permission tests are `cfg(unix)`).

## Known Stubs

None. `Chains::baseline()` carries every TS chain key with no steps by design; plan 85-08 registers the settings and library steps, and `corpus.rs`'s `TS_CURRENT` stands in until then.

## Threat Flags

None. T-85-15 (bytes never overwritten on Failed or Newer; byte-equality asserted in `engine_golden` and `corpus`), T-85-16 (backups and corrupt copies 0600 through `write_atomic`, in the store's own directory) and T-85-17 (newest-equal skip and the cap of 3, `a_permanently_corrupt_file_does_not_grow_the_disk_on_every_boot`) are mitigated as planned. T-85-SC: no new package; `Cargo.lock` is unchanged.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 85-08 can register the real chains in `Chains::baseline()` (the table's `chain` column and `TS_CURRENT` name the nine versioned ones), assert the migrated bytes for the 70 `migrate` corpus entries and the golden `migrate` cases, and build the host on `open_file`, `ops::apply`, `stamp_for_write` and `write_atomic`.
- `table::row_for_path` already skips backups and corrupt copies in `GamesConfig/`, which the CLI's per-game iteration needs.
- Plan 85-05 is open at its human checkpoint; its files and 85-VALIDATION.md's signed baseline were not touched.

## Self-Check: PASSED

All 13 created files and `lib.rs` exist; commits `7e291352c`, `1f69eef52`, `8b7d92f77` and `3ca99c0f7` are ancestors of HEAD; `cargo test -p gamelib-store -p gamelib-store-cli` (77 lib, 2 engine_golden, 1 golden, 3 ops_golden, 7 corpus, 5 vectors, 4 cli), `cargo clippy --all-targets -D warnings`, `cargo fmt --check`, `storeTable.test.ts` (7), `meta/genStoreTable.ts --check`, `npx prettier --check` over the three TS paths, `pnpm codecheck`, `pnpm find-deadcode` (PASS at baseline) and eslint on the two TS files all pass.

---
*Phase: 85-store-host-config-and-versioned-migrations*
*Completed: 2026-11-22*
