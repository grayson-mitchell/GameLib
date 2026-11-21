---
phase: 85-store-host-config-and-versioned-migrations
plan: 08
subsystem: storage
tags: [rust, store-migrations, zod, schema-descriptor, strip, golden, corpus, cli, d-04, d-12]

requires:
  - phase: 85-01
    provides: "golden cases.json, inputs, outcomes.json and the expected tree (29 migrate cases) this plan replays; storeOracle.test.ts the corpus block extends"
  - phase: 85-02
    provides: "MANIFEST.json and the 161-file real-store corpus (70 migrate entries)"
  - phase: 85-07
    provides: "engine::open_file, the Chains registry (empty step lists), the store table, corpus.rs with its TS_CURRENT stand-in"
provides:
  - "meta/genStoreSchemas.ts (--check) and src-tauri/crates/gamelib-store/src/schemas.json: the zod schemas the TS strip reads, as a generated descriptor (settingsGlobal, settingsGame, gameInfo.{steam,gog,legendary,nile,sideload}, gameInfoInstalled.{gog,sideload}), with a jest drift test"
  - "gamelib-store schema (Node, Schemas, schemas()), migrate::strip (accepts, strip, StripOptions), migrate::settings (global_chain, game_chain, strip_settings), migrate::libraries (the seven library chains)"
  - "Chains::baseline() registers every TS chain with its real steps: settings 2, game 2, libraries 3, the two engine files at baseline v1 (D-04: no bump)"
  - "tests migrate_golden (every_migrate_case_replays_byte_identical, chain_versions_are_pinned_to_ts, a_current_version_library_file_opened_twice_writes_nothing), corpus older_versions_match_ts_oracle and current_version_preserves_unknown_keys"
  - "tests/fixtures/corpus-expected/: the 70 migrated files the real TS chains produced for the corpus migrate entries, plus outcomes.json (result, backup names)"
  - "gamelib-store-cli open <userData> [--app-folder <dir>] [--dry-run] [--scratch <dir>]"
affects: [85-09, store host, settings resync, TS store deletion, 85-24]

tech-stack:
  added: []
  patterns:
    - "Schema as generated data: the Rust strip reads a descriptor generated from the zod schemas the TS strip reads at call time, drift-tested by regenerating and deep-comparing; the generator refuses any construct it cannot describe"
    - "The oracle owns the expected bytes: corpus-expected is written by the real TS chains (same write/compare switch as the golden), never typed"
    - "A TS-oracle fixture is placed where the engine looks for it (the table row's path), not at its corpus path, because a captured backup's name is not a store name"

key-files:
  created:
    - meta/genStoreSchemas.ts
    - src-tauri/crates/gamelib-store/src/schemas.json
    - src-tauri/crates/gamelib-store/src/schema.rs
    - src-tauri/crates/gamelib-store/src/migrate/strip.rs
    - src-tauri/crates/gamelib-store/src/migrate/settings.rs
    - src-tauri/crates/gamelib-store/src/migrate/libraries.rs
    - src-tauri/crates/gamelib-store/tests/migrate_golden.rs
    - src-tauri/crates/gamelib-store/tests/fixtures/corpus-expected/
    - src/backend/stores/__tests__/schemaDescriptor.test.ts
  modified:
    - src-tauri/crates/gamelib-store/src/lib.rs
    - src-tauri/crates/gamelib-store/src/migrate/mod.rs
    - src-tauri/crates/gamelib-store/tests/corpus.rs
    - src/backend/stores/__tests__/storeOracle.test.ts
    - src-tauri/crates/gamelib-store-cli/src/main.rs
    - src-tauri/crates/gamelib-store-cli/tests/cli.rs
    - src-tauri/crates/gamelib-store-cli/Cargo.toml
    - src-tauri/Cargo.lock

key-decisions:
  - "The settings nodes in schemas.json are appSettingsSchema.partial() and gameSettingsSchema.partial() (what the v1->v2 strips read), and every object member carries zod's own verdict for undefined (safeParse(undefined).success) as `optional`, so the Rust strip asks the same question TS asks and never infers optionality from wrapper shapes"
  - "The generator refuses more than the plan's list: any, regex, number checks, a catchall of another type, a non-string literal and a constrained record key all exit 1, because none of the schemas the chains read use them and untested semantics in Rust would be a silent drift; a z.discriminatedUnion is described as the union it extends (same safeParse verdict)"
  - "Strings are measured in UTF-16 code units (min/max), as zod counts, so a 4096-character bound agrees with TS on astral text"
  - "The strips write nothing to a log: TS wrote removed/changed key names and still-invalid entry paths to stderr, this crate has no log channel, and the engine's backup keeps the original"
  - "Corpus migrate entries are placed at the table row's path (config.json, GamesConfig/app.json, <dir>/<name>.json) in both the TS oracle and Rust, so backup names are the real shape and can be compared, not derived from a captured backup's file name"
  - "The CLI's dry-run copies only the files `open` would touch (every table row's directory and GamesConfig, side files included so backup pruning behaves as it would for real) into a 0700 scratch directory and removes it afterwards; --scratch lets a test keep that inside its FakeHome"

patterns-established:
  - "Descriptor drift test: jest deep-equals the pure builder's output with the committed JSON; --check compares prettier-formatted bytes (the same split 85-07 made for the store table)"
  - "Golden replay of real chains: copy inputs/<id>.json to the case's file, open through engine::open_file with Chains::baseline(), compare the tree to expected/<id> and the backup to the original bytes"

requirements-completed: [FND-06]

coverage:
  - id: D1
    description: "A zod-derived descriptor drives the Rust strip: schemas.json is generated from the zod schemas by meta/genStoreSchemas.ts, a jest test regenerates it and fails on any difference, and the generator exits non-zero naming the schema path on a refine, transform, regex, number check or lazy schema"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/stores/__tests__/schemaDescriptor.test.ts"
        status: pass
      - kind: other
        ref: "node meta/runTs.cjs --bundle --platform=node --target=node22 meta/genStoreSchemas.ts --check"
        status: pass
    human_judgment: false
  - id: D2
    description: "The strip follows schemaStrip.ts's six rules and accepts reproduces zod's verdict for the descriptor grammar (strict undeclared keys at every depth, null removal, invalid optional and element dropping on request, loose pass-through, records, the two-pass union, UTF-16 string bounds, required members never removed)"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-store strip::"
        status: pass
    human_judgment: false
  - id: D3
    description: "Chains ported unchanged (D-12): settings/global v2 (v0->v1 trayIconVariant/focusRow repair, v1->v2 strip), settings/game v2, the seven library chains v3; every real-chain golden migrate case (28) replays to byte-identical documents and backups, and a migrated library file reopens as Ok writing nothing"
    requirement: FND-06
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-store/tests/migrate_golden.rs#every_migrate_case_replays_byte_identical"
        status: pass
      - kind: integration
        ref: "src-tauri/crates/gamelib-store/tests/migrate_golden.rs#a_current_version_library_file_opened_twice_writes_nothing"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-04: no store version bump; every chain's current version is pinned to the TS value (settings 2, game 2, libraries 3, baseline 1) and every store table row resolves to its pin or baseline v1"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-store/tests/migrate_golden.rs#chain_versions_are_pinned_to_ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Research Pitfall 5 / T-85-18: all 70 older-version corpus files (every chain, settings 56 and libraries 14) open as Migrated with a backup holding the original bytes, and their migrated bytes, backup names and file set equal what the real TS chains produced; current-version files are asserted for key preservation under a separate name"
    requirement: FND-06
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-store/tests/corpus.rs#older_versions_match_ts_oracle"
        status: pass
      - kind: integration
        ref: "src-tauri/crates/gamelib-store/tests/corpus.rs#current_version_preserves_unknown_keys"
        status: pass
      - kind: unit
        ref: "src/backend/stores/__tests__/storeOracle.test.ts (corpus migrate entries)"
        status: pass
    human_judgment: false
  - id: D6
    description: "gamelib-store-cli open <userData> [--app-folder] [--dry-run] prints `<key> <outcome>` per existing file, migrates in place without --dry-run, never writes the source with it, has no keyring dependency, and its tests run only on a FakeHome profile built from three corpus files"
    requirement: FND-06
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-store-cli/tests/cli.rs#open_dry_run_prints_each_outcome_and_leaves_the_profile_untouched"
        status: pass
      - kind: integration
        ref: "src-tauri/crates/gamelib-store-cli/tests/cli.rs#open_without_dry_run_migrates_the_profile_in_place"
        status: pass
    human_judgment: false
  - id: D7
    description: "Strip behaviour on inputs neither the golden nor the corpus contains (an invalid optional member under dropInvalidOptional is not exercised by any of the 70 corpus files; a mutation of that option passes the corpus and fails the golden and unit tests)"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-store strip::tests::an_invalid_optional_member_goes_only_with_the_option"
        status: pass
    human_judgment: true
    rationale: "Parity for strip edge cases rests on the Rust unit tests and the 28 golden cases, not on a differential run against the TS strip over generated inputs; a reviewer should decide whether a randomised TS-vs-Rust differential is wanted before 85-24 deletes the TS chains"

duration: about 30 min
completed: 2026-11-22
status: complete
actuals:
  tokens: 23000
  tasks: 3
  commits: 7
plan_head_before: 1cc5392878a1b1d942f90a75300f495c93cff1ad
plan_head_after: 0588c8b19b6b101fc9d45c6df5b045c74bb7f016
---

# Phase 85 Plan 08: Store migration chains in Rust over a zod-generated schema descriptor Summary

**Every TS store migration (settings global and game, the seven GameInfo library chains) now runs in Rust at the same version, driven by a descriptor generated from the very zod schemas the TS strip reads and drift-tested against them, and reproduces the TS bytes for all 28 real-chain golden cases and all 70 older-version corpus files, plus a headless `gamelib-store-cli open`.**

## Performance

- **Duration:** about 30 min (the start time was not captured; first task commit 07:06 +13, last 07:16)
- **Completed:** 2026-11-22
- **Tasks:** 3 (Task 1 a tracer, Task 2 TDD, Task 3 auto)
- **Files modified:** 8 created paths (plus the `corpus-expected` tree of 71 files) and 8 modified
- **Commits:** `commits: 7` is the measured `rev-list` count over the plan's range. Four are this plan's (below); three are other sessions' docs commits that landed on main in the same window (`beeddfd02`, `774678d14`, `7ebc8ef3f`).
- **Tokens:** `actuals.tokens` is chars/4 over the added lines of this plan's four commits excluding the two generated artifacts (`schemas.json`, 120 KB, and `corpus-expected`, 71 files).

## Accomplishments

- **Descriptor (Task 1).** `meta/genStoreSchemas.ts` walks `appSettingsSchema.partial()`, `gameSettingsSchema.partial()`, the five GameInfo schemas and the gog/sideload `install` members into `schemas.json`; `schemaDescriptor.test.ts` regenerates and deep-compares and proves a refine, transform, regex, number check and lazy schema each make the walker throw with the schema path. `--check` compares prettier-formatted bytes.
- **Strip (Task 1).** `migrate/strip.rs` ports `schemaStrip.ts`'s six rules (including the two-pass union and the literal guard) and `accepts` over `schema::Node`; 9 unit tests, each rule named.
- **Chains (Tasks 1-2).** `migrate/settings.rs` (global v0->v1 repair and v1->v2 strip, game v0->v1 identity and v1->v2 strip, the gamescope repair) and `migrate/libraries.rs` (seven chains) are registered in `Chains::baseline()` under the TS chain keys. `migrate_golden` replays 28 real-chain cases to byte-identical files and backups (the 29th `migrate` case is the override-chain rotation, replayed by `engine_golden`) and pins every version to TS.
- **Corpus (Task 3).** `storeOracle.test.ts` runs every manifest migrate entry through the real TS chains and writes `corpus-expected/`; `corpus.rs` `older_versions_match_ts_oracle` asserts Migrated, backup bytes equal the original, migrated bytes and file set equal the oracle, for all 70 (settings/game 51, settings/global 5, the seven library chains 2 each).
- **CLI (Task 3).** `gamelib-store-cli open` with `--app-folder`, `--dry-run` and `--scratch`.

## Task Commits

1. **Task 1: tracer, settings/global v0 to v2 over the generated descriptor** - `a5ee4883c` (feat)
2. **Task 2: settings/game and the seven library chains** (TDD) - RED `343819597` (test), GREEN `b65ca20a9` (feat)
3. **Task 3: corpus migrate entries against oracle outputs, CLI `open`** - `0588c8b19` (feat)

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md and ROADMAP.md.

## Tracer feedback gate

Task 1 is `type="tracer"` with an automated-only `<verify>`; `human_verify_mode` is `end-of-phase`, not auto mode. The verify was re-run end to end after the commit (generator `--check`, `schemaDescriptor.test.ts` 5 tests, `migrate_golden` with the four settings/global cases, `strip::` unit tests, clippy `-D warnings`, fmt, prettier) and passed, so expansion proceeded with no checkpoint.

## TDD Gate Compliance

Task 2 is `tdd="true"` inside an `execute` plan (not plan-level `type: tdd`), so the `check tdd-red-evidence` classifier contract does not apply; the RED/GREEN sequence was followed by commit.

- **RED** (`343819597`): `every_migrate_case_replays_byte_identical` and `chain_versions_are_pinned_to_ts` both failed on assertions (`settings/game left: 1 right: 2` and the first non-settings-global migrate case), against a `Chains::baseline()` with only settings/global registered.
- **GREEN** (`b65ca20a9`): the game and library chains; both pass, plus the added reopen-writes-nothing test.

## Files Created/Modified

See `key-files`. `schemas.json` and `corpus-expected/` are generated (by `genStoreSchemas.ts` and by `GAMELIB_WRITE_STORE_GOLDEN=1 jest storeOracle.test.ts`) and never hand-edited; the golden `expected/` and `outcomes.json` were regenerated by the same write run and came out byte-unchanged.

## Decisions Made

See `key-decisions`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `gameInfoInstalled` added to the descriptor**
- **Found during:** Task 1 (reading `gameInfoLibraries.ts`)
- **Issue:** The plan lists `gameInfo.{steam,gog,legendary,nile,sideload}` only, but the gog `installed` and sideload `installed` lists are stripped against `gogGameInfoSchema.shape.install` and `sideloadGameInfoSchema.shape.install`, which the plan allowed adding ("add a node only if the TS chain uses a schema not listed here").
- **Fix:** `gameInfoInstalled: { gog, sideload }` in `schemas.json` and `schema::GameInfoInstalled`.
- **Files modified:** `meta/genStoreSchemas.ts`, `src/schema.rs`, `src/migrate/libraries.rs`
- **Committed in:** `a5ee4883c`, `b65ca20a9`

**2. [Rule 2 - Missing critical] The generator is narrower than the plan's node list**
- **Found during:** Task 1
- **Issue:** The plan lists `any`, regex source, number `int`/`min`/`max` and `discriminatedUnion` as node kinds. None of the schemas the chains read use `any`, a regex, a number check or a non-string literal, and zod 4's `any` and requiredness semantics differ from the other kinds in a way the Rust `accepts` would have to guess at. Shipping untested Rust semantics for them would be exactly the silent drift T-85-18 is about.
- **Fix:** those constructs make the generator exit 1 naming the path (and a jest self-test pins that); a `discriminatedUnion` is described as the union it extends (zod's class inheritance makes the TS strip treat it as one, and the verdict is identical).
- **Files modified:** `meta/genStoreSchemas.ts`, `src/backend/stores/__tests__/schemaDescriptor.test.ts`
- **Committed in:** `a5ee4883c`

**3. [Rule 3 - Blocking] `is_none_or` replaced by `map_or(true, ..)`**
- **Found during:** Task 1
- **Issue:** The crate's `rust-version` is 1.77.2 and `Option::is_none_or` is 1.82; the installed toolchain accepts it, an MSRV build would not.
- **Fix:** `map_or(true, ..)` in `strip.rs`; clippy `-D warnings` stays clean.
- **Committed in:** `a5ee4883c`

**4. [Rule 3 - Blocking] The corpus oracle places files at the table row's path**
- **Found during:** Task 3
- **Issue:** The plan says to copy each entry "into a temp userData at its relative path", but a captured backup's corpus path (`backups/GamesConfig/112100.v0.<stamp>.bak.json`) is a backup name, not a store name, and the Rust `stage()` strips only the source directory. Opening a file at that path would also derive a backup named `<name>.v0.<stamp>.v0.<stamp>.bak.json`.
- **Fix:** both the TS oracle and the Rust test place the file at the row's path (`config.json`, `GamesConfig/app.json`, `<dir>/<name>.json`); `corpus-expected/<manifest path>` still holds the migrated bytes, and `outcomes.json` the backup names under the oracle's fake clock, which Rust now compares too.
- **Files modified:** `src/backend/stores/__tests__/storeOracle.test.ts`, `src-tauri/crates/gamelib-store/tests/corpus.rs`
- **Committed in:** `0588c8b19`

**5. [Rule 3 - Blocking] CLI gains `--scratch`, and a `gamelib-testutil` dev-dependency**
- **Found during:** Task 3
- **Issue:** `open --dry-run` needs somewhere to copy to; the system temp directory is the right default but a test that clears the environment would land in `/tmp`, not its FakeHome.
- **Fix:** an optional `--scratch <dir>` (default `std::env::temp_dir()`), and `gamelib-testutil` as a dev-dependency of the CLI crate so its tests use `FakeHome`. `Cargo.lock` gains one line (`gamelib-testutil` under `gamelib-store-cli`); no new crate, so the crate-name pin is unaffected.
- **Files modified:** `src-tauri/crates/gamelib-store-cli/{Cargo.toml,src/main.rs,tests/cli.rs}`, `src-tauri/Cargo.lock`
- **Committed in:** `0588c8b19`

**6. [Rule 3 - Blocking] eslint and knip findings fixed**
- **Found during:** Tasks 1 and 3
- **Issue:** `@typescript-eslint/no-unnecessary-type-assertion` on a literal narrowed by `unsupported(): never`; knip flagged the exported `Member` type.
- **Fix:** dropped the assertion; un-exported `Member`. `pnpm find-deadcode` PASS at the 312-finding baseline.
- **Committed in:** `a5ee4883c`, `0588c8b19`

**7. [Rule 1 - Bug] `migrate_golden` prints 28 of 29, not 29 of 29**
- **Found during:** Task 2
- **Issue:** The acceptance criterion asks for a printed case count equal to the number of `migrate` cases in `cases.json` (29). One of them, `migrate-sequence-backups-max3-newest-equal`, is five boots over an override chain, not a real chain, and `engine_golden` already replays it.
- **Fix:** `migrate_golden` replays the 28 real-chain cases, asserts `28 + 1 == total migrate cases`, and prints `28 of 29 migrate cases replayed (the other, the override-chain sequence, runs in engine_golden)`.
- **Committed in:** `b65ca20a9`

---

**Total deviations:** 7 auto-fixed (1 Rule 1, 1 Rule 2, 5 Rule 3)
**Impact on plan:** none changes what the plan delivers; 2 and 4 follow the oracle and the safer reading over the plan's sketch.

## Issues Encountered

- `src/backend/__tests__/cargoFeatures.test.ts` (the `Cargo.lock` crate-name pin) fails on the jiff and portable-atomic crates another session's `8fcadab94` added; the orchestrator named it. This plan adds no crate, so it was not touched.
- A mutation of `dropInvalidOptional` in the settings strip passes all 70 corpus files (none contains an invalid optional settings value) and fails only the unit tests; the golden's library cases do catch the same mutation in `libraries.rs`. See coverage D7: the strip's edge behaviour is held by unit tests and the golden, not by a differential run against TS over generated inputs.
- The Windows leg cannot run here; nothing in this plan is Windows-specific (the CLI's directory mode is `cfg(unix)`).

## Known Stubs

None. No placeholder values flow anywhere; `Chains::baseline()` carries real steps for all nine versioned chains and `corpus.rs`'s `TS_CURRENT` stand-in is deleted.

## Threat Flags

None. T-85-18 (descriptor generated with a drift test; byte parity over golden and corpus; a backup before every non-identity migration) and T-85-19 (`--dry-run` on a scratch copy, CLI tests on FakeHome only, no keyring dependency: `cargo tree -p gamelib-store-cli | grep -c keyring` is 0) are mitigated as planned. T-85-SC: no new package; `Cargo.lock` gains only a dev-dependency edge on an in-repo crate.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The host (85-09 onward) can build on `engine::open_file` with `Chains::baseline()`: every chain TS has is registered and at its TS version, so a profile from v0.8/v0.9/v0.10 migrates in Rust exactly as it did in TS.
- `gamelib-store-cli open <profile> --dry-run` is the headless way to check a profile copy before the host takes over.
- Plan 85-05 is open at its human checkpoint; its files and 85-VALIDATION.md's signed baseline were not touched.

## Self-Check: PASSED

All created files exist (`meta/genStoreSchemas.ts`, `schemas.json`, `schema.rs`, `migrate/{strip,settings,libraries}.rs`, `tests/migrate_golden.rs`, `schemaDescriptor.test.ts`, `corpus-expected/` with `outcomes.json`); commits `a5ee4883c`, `343819597`, `b65ca20a9` and `0588c8b19` are ancestors of HEAD; `cargo test -p gamelib-store -p gamelib-store-cli` (97 lib, 8 corpus, 3 migrate_golden, 2 engine_golden, 3 ops_golden, 8 cli) all pass, `cargo clippy --all-targets -D warnings` and `cargo fmt --check` clean, `schemaDescriptor.test.ts`, `storeOracle.test.ts` (145) and `storeTable.test.ts` pass, `genStoreSchemas.ts --check` up to date, `npx prettier --check` over the three TS paths, `pnpm codecheck`, `pnpm lint` (0 errors), `pnpm find-deadcode` (PASS at baseline) and `pnpm planning-gates` (12/12) all exit 0.

---
*Phase: 85-store-host-config-and-versioned-migrations*
*Completed: 2026-11-22*
