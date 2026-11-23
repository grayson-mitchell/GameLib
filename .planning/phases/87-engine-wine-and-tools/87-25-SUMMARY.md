---
phase: 87-engine-wine-and-tools
plan: 25
subsystem: engine
tags: [rust, gamelib-engine, engine-config, tool-settings, golden-replay, storehost, hooks]

requires:
  - phase: 87-engine-wine-and-tools
    provides: EngineCtx and its seams (87-06), the 70 engine-config goldens and the engine twin vectors (87-12), the Rust default wine from PATH (87-23)
provides:
  - gamelib-engine config foundation, crate-only: engine override grammar, engine key and eligibility, per-game bottle name, effective/global engine, tool settings, option list, default engine and the G25 offline refusal
  - EngineCtx.default_wine and EngineCtx.crossover_bin_dir hooks (the shell fills both from gamelib-wine in 87-28; gamelib-engine never depends on it)
  - ops engine_per_game_bottle_name, engine_list_options, engine_default_engine, engine_resolve_tool_settings (no channel, no caller)
  - golden_config.rs replaying every one of the 70 golden/config cases, with deltas.json
affects: [87-26, 87-28, 87-34, 87-38, 87-39, the tools port, the bottles port]

actuals:
  tokens: 31600
  tasks: 2
  commits: 3

plan_head_before: 18d3a689fce4e91887834084f3bb1660e7d393dd
plan_head_after: a9d5b6bbe13a7cd828c5521ba8fbc4776d750702

tech-stack:
  added: []
  patterns:
    - "a TS module that reads GamesConfig or config.json is ported to a function over &EngineCtx that reads only through ctx.host.open_doc / open_cache; the host's snapshot is searched for the exact top-level key (never a dotted get), so a name with dots is one key"
    - "a collaborator the engine crate may not depend on (default Wine, CrossOver bin dir) is a field of EngineCtx holding an Arc<dyn Fn>, defaulted to 'none' in EngineCtx::new, filled by the shell"
    - "state owned by a later slice (a live engine selection and its overlay, the bottle flight) is a ToolSettingsDeps trait method; CtxToolSettingsDeps answers the disk and store reads and a neutral default for the rest"
    - "JS semantics that a vector pins (String.trim, UTF-16 length, truthiness, String(), path.join) live once in jsutil.rs"
    - "a golden replay that goes through the StoreHost runs the shell's boot sweep over the seeded documents first, then asserts the profile tree is byte-identical across the case"

key-files:
  created:
    - src-tauri/crates/gamelib-engine/src/jsutil.rs
    - src-tauri/crates/gamelib-engine/src/ids.rs
    - src-tauri/crates/gamelib-engine/src/key.rs
    - src-tauri/crates/gamelib-engine/src/config.rs
    - src-tauri/crates/gamelib-engine/src/engines.rs
    - src-tauri/crates/gamelib-engine/src/game_prefix.rs
    - src-tauri/crates/gamelib-engine/src/offline.rs
    - src-tauri/crates/gamelib-engine/src/tool_settings.rs
    - src-tauri/crates/gamelib-engine/tests/golden_config.rs
    - src-tauri/crates/gamelib-engine/tests/fixtures/golden/config/deltas.json
  modified:
    - src-tauri/crates/gamelib-engine/src/lib.rs
    - src-tauri/crates/gamelib-engine/src/ctx.rs
    - src-tauri/crates/gamelib-engine/src/game_engine.rs

key-decisions:
  - "D-04/D-25 (b): the default Wine reaches the global settings through EngineCtx.default_wine, applied exactly where the TS factory default applied it (config.json defaultSettings has no wineVersion, platform is not Windows)"
  - "D-25: CrossOver's bin dir is a second hook, EngineCtx.crossover_bin_dir (async), for the same reason: the option list and the tool resolver need it and the locator lives in gamelib-wine"
  - "tool settings are generic over a ToolSettingsDeps seam; the live-selection registry and the bottle flight are 87-38/87-39's, so the ctx default answers no live selection and 'could not create the bottle' until they land"
  - "the pinned-engine paths, the pin install check, the Wine Manager release reads and the bottle marker-kind read are ported read-only into engines.rs because the option list, derive and tool settings need them now; 87-38/87-39 own the write half and may move these"

patterns-established:
  - "golden_config.rs: Profile (oracle layout over a fake HOME), materialise/expand_value, boot_sweep, snapshot-equality, floor and manifest guards with negatives, a delta list asserted exactly"

requirements-completed: [SVC-02]

duration: 17 min
completed: 2026-11-23
status: complete

coverage:
  - id: D1
    description: "D-04 engine ids and keys: parse_engine_override, engine_key_for, is_engine_key, app_name_of, engine_key_if_eligible and the per-game bottle name, byte for byte with the TS, including the Steam 1-10 digit rule, JS trim and UTF-16 length, and the 64-character cut with a 10-hex hash"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/tests/golden_config.rs#the_tracer_goldens_replay"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-04 effective engine: derive_engine_from_wine, resolve_effective_engine, read_engine_for_game and resolve_global_engine over GamesConfig and config.json read through the StoreHost, with the default Wine from the EngineCtx.default_wine hook"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/tests/golden_config.rs#every_config_golden_replays"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-04 options and default engine: list_game_engine_options (with the Legacy row) and default_engine for populated and empty profiles; the offline refusal arms"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/tests/golden_config.rs#every_config_golden_replays"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-04 tool settings: resolve_tool_settings and resolve_tool_settings_for_id over live selections, legacy, plain prefix, absent, crossover, pinned and Wine Manager bottles, with the settings builders"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/tests/golden_config.rs#every_config_golden_replays"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-06 crate-only: ops engine_per_game_bottle_name, engine_list_options, engine_default_engine and engine_resolve_tool_settings dispatch with strict arguments and no channel or caller; gamelib-engine does not depend on gamelib-wine"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/src/lib.rs#tests"
        status: pass
      - kind: other
        ref: "cd src-tauri && test \"$(cargo tree -p gamelib-engine | grep -c 'gamelib-wine')\" -eq 0"
        status: pass
    human_judgment: false
---

# Phase 87 Plan 25: Engine configuration in gamelib-engine Summary

**The per-game bottle name, engine ids and keys, effective and global engine, tool settings, the option list, the default engine and the offline refusal are Rust in gamelib-engine, reading GamesConfig and config.json only through the StoreHost, and all 70 TS goldens replay; the default Wine and the CrossOver bin dir arrive through two EngineCtx hooks, so the crate still never depends on gamelib-wine.**

## Performance

- **Duration:** 17 min (from the previous plan's last commit, 19:27 NZDT, to this plan's last task commit, 19:44 NZDT; the start time was not recorded)
- **Tasks:** 2 of 2 (the tracer and the TDD task: one tracer commit, one RED commit, one GREEN commit)
- **Files:** 10 created, 3 modified

## Accomplishments

- **Task 1, tracer:** `ids.rs`, `key.rs`, `game_engine.rs` (the naming half), `jsutil.rs`, op `engine_per_game_bottle_name`, and `golden_config.rs` with the MANIFEST floor, an empty-list and a shrunken-list negative, and the replay of the bottle-name, ids, keys and eligibility goldens. A one-character mutation of the name cut (`HASH_HEX - 1` to `- 2`) failed the replay and was restored. Gate: auto mode off and `HUMAN_VERIFY_MODE` end-of-phase with an automated-only `<verify>`, so it was re-run after the commit (golden test, clippy and fmt: green) and expansion followed.
- **Task 2, TDD:** RED commit (`31577c8ff`) listed all 14 ops and failed on the first unported one; GREEN added `config.rs`, `tool_settings.rs`, the options and default engine, `offline.rs`, `game_prefix.rs`, `engines.rs`, the two `EngineCtx` hooks and three ops. All 70 goldens pass; mutating one `-all` env value in the fallback settings and flipping the pin comparison in `derive_engine_from_wine` each failed the replay and were restored.
- **Extra confidence, not committed:** a throwaway test replayed the 335 `engine_twin.json` vectors for `engineKeyFor`, `isWritableEngineOverride` and `getPerGameBottleNameFor` against the Rust functions: all matched. (The vector replay itself, `twin_vectors.rs`, is 87-28's.)

## Task Commits

1. **Task 1 (tracer): the per-game bottle name end to end** - `49eb189fc` (feat)
2. **Task 2 RED: every config golden must replay** - `31577c8ff` (test)
3. **Task 2 GREEN: config, tool settings, options, default engine, offline** - `a9d5b6bbe` (feat)

## Verification

- `cargo test -p gamelib-engine --features testing`: lib 49 passed, `fetch_replay` 14, `golden_config` 7 (70 goldens replayed, MANIFEST count 70, floor 20); `cargo clippy -p gamelib-engine --all-targets --features testing -- -D warnings` and `cargo fmt -p gamelib-engine --check`: clean.
- `test "$(cargo tree -p gamelib-engine | grep -c 'gamelib-wine')" -eq 0`: passes (0).
- `cargo test -p gamelib-engine-cli` (8 passed), `cargo check -p gamelib-wine --tests` and `cargo check --workspace --all-targets`: clean (the two `gamelib-shell` warnings are not from this plan's files).
- Regression suites: `infoPortComplete`, `engineWinePortComplete`, `engineWineShimSchedule` (296 tests) and `engineWineFixtureRedaction` pass.
- Prettier: every path written is Rust or a prettier-ignored fixture (`npx prettier --file-info` on `deltas.json` reports `ignored: true`), so no prettier check applies.

## D-19 deltas (recorded in `golden/config/deltas.json`, three)

1. **A GamesConfig name the store host refuses reads as no entry.** `StoreHost::open_doc` refuses a name that is not a plain segment (ASCII letters, digits, `-_. `, no `..`, no trailing dot or space, no device name). The TS fell back to a raw file read, so the hand-placed `GamesConfig/dots..in.json` of `read-stored-name-guards` was read. The shell never writes such a document and `engineKeyFor` already refuses an appName containing `..`, so no game that reaches the engine layer is affected. The replay patches only that one item's expected value.
2. **The settings documents are the host's view.** Opening a document runs its migration chain (a `v0` seed is rewritten, with a backup). The shell opens every settings document at boot, so the replay does the same (a boot sweep) before it snapshots; after that a read writes nothing, asserted byte for byte on every case. No outcome differs.
3. **The goldens' log lines and sha256 tree snapshot are not compared.** The slice logs nothing (the registry's `Engine: <key> uses ...` line is the bottle slice's) and the stronger "tree unchanged" property is asserted directly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] A second hook, `EngineCtx.crossover_bin_dir`**
- **Found during:** Task 2
- **Issue:** The option list (CrossOver available/installed) and the tool resolver (CrossOver settings) both need the CrossOver bin dir, whose locator is in gamelib-wine. The plan named only the `default_wine` hook.
- **Fix:** an async `Arc<dyn Fn() -> BoxFuture<Option<String>>>` field, `with_crossover_bin_dir`, defaulting to none; 87-28 fills it from `gamelib_wine::discovery::discover_crossover`, the same direction as D-25 (b).
- **Files modified:** `src/ctx.rs`
- **Commit:** `a9d5b6bbe`

**2. [Rule 3 - Blocking] Read-only ports of modules owned by later slices**
- **Found during:** Task 2
- **Issue:** The goldens for tool settings, options and derive run the real `gamePrefix`, `buildFallbackGameSettings`, `buildCrossoverGameSettings`, `buildPlainPrefixSettings`, the pin paths and install check, `resolveWineManagerStaging`, the bottle `cxbottle.conf` and `.gamelib-engine.json` marker reads, and `offlineLaunchCertainlyBlocked`, none of which the plan's file list covers. 87-38/87-39 port the bottle slice later.
- **Fix:** ported the read-only subset the goldens exercise into `game_prefix.rs`, `engines.rs`, `offline.rs` and the builders in `tool_settings.rs`, so each is proven now against the goldens. 87-38 can move or reuse them (`bottles/prefix.rs` is `resolveGamePrefix`'s natural home) without changing behaviour. Nothing writes, downloads or spawns.
- **Files modified:** `src/game_prefix.rs`, `src/engines.rs`, `src/offline.rs`, `src/tool_settings.rs` (new)
- **Commit:** `a9d5b6bbe`

**3. [Rule 3 - Blocking] `jsutil.rs`**
- **Found during:** Task 1
- **Issue:** The key, bottle-name and derive answers depend on `String.trim` (BOM trimmed, U+0085 not), UTF-16 `.length`, truthiness, `String()` and `path.join`; Rust's `trim` and `chars().count()` disagree on names the vectors pin.
- **Fix:** one module for those semantics with its own tests.
- **Commit:** `49eb189fc`

**Total deviations:** 3 auto-fixed (all Rule 3), no scope reduction; every file is crate-internal.

## Auth gates

None.

## Known Stubs

Intentional, until the bottle slice lands (87-38/87-39); neither can leave a goldened behaviour wrong because the golden cases script them:

- `src-tauri/crates/gamelib-engine/src/tool_settings.rs`, `CtxToolSettingsDeps::has_live_selection` answers `false` and `overlay` is the identity: the in-memory engine registry and launch overlay are 87-38's. A tool run during a launch would therefore not target the launch's engine if a later caller used the ctx default before 87-38 wires its registry.
- `src-tauri/crates/gamelib-engine/src/tool_settings.rs`, `CtxToolSettingsDeps::ensure_game_bottle` answers "could not create" (`bottle-not-created`): the bottle flight is 87-39's.

No caller reaches either until 87-28/87-34 serve the channels, and the plan's goal (a proven configuration foundation, no caller) is met.

## Threat Flags

None. T-87-73 is mitigated: GamesConfig and config.json are read only through `ctx.host.open_doc`, malformed or unknown override values fall back exactly as the TS did (goldens), and the crate adds no dependency (T-87-SC).

## Issues Encountered

- `open_doc` migrates a `v0` document on open and writes a backup, which broke the first "tree unchanged" assertion; solved by modelling the shell's boot sweep in the replay (delta 2).
- The workspace-wide `cargo check` takes about 100 s and was run in the background.

## Next Phase Readiness

87-26 and 87-28 can serve `listEngineOptions`, `getDefaultEngine` and `getPerGameBottleName` natively: build the ctx's two hooks from `gamelib_wine::discovery::{default_wine::default_wine_from_path, discover_crossover}`. 87-28's `twin_vectors.rs` replays `engine_twin.json` (the Rust key, bottle-name and writable functions already match its 335 vectors; `importEngineSettings` is the remaining twin helper, a three-line composition of `is_writable_engine_override` and `per_game_bottle_name_for`). 87-38/87-39 own the registry and bottle flight that fill `ToolSettingsDeps`.

## Self-Check: PASSED

All ten created files and three modified files exist; commits `49eb189fc`, `31577c8ff` and `a9d5b6bbe` are ancestors of HEAD; the plan's acceptance criteria (the `engine_per_game_bottle_name` grep count of 7 in `lib.rs` against a minimum of 1, MANIFEST count 70 against a minimum of 20, `cargo tree` gamelib-wine count 0) were re-run green.
