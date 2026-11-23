---
phase: 87-engine-wine-and-tools
plan: 28
subsystem: engine
tags: [rust, tauri, native-channel, engine-slice, twin, shared-vectors, default-wine-hook, d-14, d-24]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the crate ops engine_per_game_bottle_name, engine_list_options and engine_default_engine with EngineCtx.default_wine and EngineCtx.crossover_bin_dir (87-25), the Rust default_wine_from_path and discover_crossover (87-23, 87-26), the 335-plus vector file engine_twin.json (87-12), the native + schedule caller-flip pattern (87-20 to 87-26)
provides:
  - ENGINE_SLICE ("engine") and the three native invoke channels getPerGameBottleName, listEngineOptions and getDefaultEngine, each with a strict decode before the context is looked at; their sidecar handles and zod keys deleted in the same commits
  - the shell's EngineCtx.default_wine (default_wine_from_path over the process PATH) and EngineCtx.crossover_bin_dir (the two default CrossOver locations, then discover_crossover, looked up lazily) hooks, built in engine_dispatch::build_ctx; gamelib-engine still names no gamelib-wine
  - src/backend/enginewine/twin.ts: engineKeyFor, isWritableEngineOverride, importEngineSettings, getPerGameBottleNameFor (and perGameBottleName), one TS copy each, replayed against engine_twin.json by twinVectors.test.ts and by gamelib-engine's twin_vectors.rs
  - config::import_engine_settings in the crate (the one twin helper the crate did not yet have) and tests/twin_vectors.rs
  - five schedule rows (twin) in engineWineShimSchedule.test.ts
affects: [87-29, 87-34, 87-38, 87-39, 87-56, 87-57, Phase 92, Phase 98]

actuals:
  tokens: 17800
  tasks: 3
  commits: 3

plan_head_before: 7c74b3da1004fe784f7bc0e23f086000951ebd76
plan_head_after: 7676e96cb2c3b570cfa6f31e61fabfcfe546b6b8

tech-stack:
  added: []
  patterns:
    - "a native channel whose decode is a fixed-literal strict parse (UTF-16-unit bounds as zod counts them, deny unknown keys, one union rejection) that returns the object the crate op takes, rebuilt from the decoded strings, so nothing the caller sent beyond the identity reaches the op"
    - "a shell-filled EngineCtx hook that needs a context built after it reads that context lazily at call time (crossover_bin_dir reads wine_dispatch::wine_ctx() inside the future), so the construction order does not matter"
    - "a pure locator split from its blocking host probe: locate_crossover_bin_dir takes the system Applications folder, the home and a discovery closure, so a test needs no real CrossOver and no Spotlight"
    - "a twin file whose exports are exactly its schedule rows; every row lists every importer of the file because the schedule check is per file"

key-files:
  created:
    - src/backend/enginewine/twin.ts
    - src/backend/enginewine/__tests__/twinVectors.test.ts
    - src-tauri/crates/gamelib-engine/tests/twin_vectors.rs
  modified:
    - src-tauri/src/engine_dispatch.rs
    - src-tauri/src/native_router.rs
    - src-tauri/src/ipc_contract.rs
    - src-tauri/crates/gamelib-engine/src/config.rs
    - src/common/types/ipc/nativeChannels.json
    - src/common/types/ipc/native.ts
    - src/common/types/ipc/engine.ts
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src/backend/sidecar/engineFlowRegistration.ts
    - src/backend/sidecar/settingsFlowRegistration.ts
    - src/backend/sidecar/installFlowRegistration.ts
    - src/backend/engine/gameKey.ts
    - src/backend/engine/engineConfig.ts
    - src/backend/engine/gameEngineState.ts
    - src/backend/engine/perGameBottle.ts
    - src/backend/engine/engineEligibility.ts
    - src/backend/engine/engineState.ts
    - src/backend/engine/toolSettings.ts
    - src/backend/launcher.ts
    - src/backend/storeManagers/gog/games.ts
    - src/backend/storeManagers/nile/games.ts
    - src/backend/storeManagers/legendary/games.ts
    - src/backend/storeManagers/sideload/games.ts
    - src/backend/storeManagers/storeManagerCommon/games.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts
  deleted:
    - src/backend/engine/importEngineSettings.ts

key-decisions:
  - "The decodes are the TS zod's, hand-ported: gameIdentity is exactly {runner 1-64 units, appName 1-4096 units} with unknown keys refused; listEngineOptions accepts that or the strict {appName: 'default'} and rejects everything else with the one union code at path 0; getDefaultEngine takes no argument. A rejection names only a path and a code, never the caller's value (T-87-26)"
  - "getDefaultEngine's Wine is the shell's PATH rule (D-25 (b)): the hook always answers an installation, with name 'Default Wine - Not Found' and an empty bin when no wine is on PATH, as the TS getDefaultWineBinary did, and global_settings applies it off Windows only"
  - "crossover_bin_dir is the TS locator's rule without its memo: the two default install folders (system and home) when they hold cxbottle, otherwise the first Spotlight bundle whose bin holds cxbottle; macOS only. The locator memoised a found dir; the hook does not, because it is read on a list refresh, not per call of a hot path, and the sync probe answers first"
  - "twin.ts exports five names, not four. perGameBottleName (the naming rule getPerGameBottleNameFor and the bottle code share) had to live in twin.ts: engineKeyFor must be there (acceptance), and a naming function in perGameBottle.ts would make twin.ts and perGameBottle.ts import each other. perGameBottle.ts re-exports it so gamePrefix, launchEngine and gameEngineState and their mocks keep their import; it is scheduled as an intra-phase row (deletedBy 87) that 87-56 makes private"
  - "Every twin row lists every importer of twin.ts as its callers (14 files): the schedule's check is per file, so the plan's split (launcher and games.ts for engineKeyFor, the two flow registrations for the rest) cannot hold; the deletedBy phases are the plan's (92, 98, 98, 98)"
  - "The grammar and clean-name rules twin.ts needs are imported, not copied: parseEngineOverride from engine/engineIds, isCleanAppName, isKnownRunner and STEAM_APP_ID_RE (now exported) from engine/gameKey, sanitizeBottleName from engine/bottlePrimitives. They are leaf modules the engine TS deletion in 87-56 must relocate or keep, which 87-56's gate will surface"

patterns-established:
  - "a hand-written native decode is proven by the manifest's valid and invalid vectors, a Rust unit test of the parse (every rejection path and code), a not-ready-before-install test and a hostile-value-never-echoed test"

requirements-completed: [SVC-02]

duration: 18 min
completed: 2026-11-23
status: complete

coverage:
  - id: D1
    description: "getPerGameBottleName, listEngineOptions and getDefaultEngine are native channels of the new engine slice: strict decodes before the context is looked at, answered by the crate's engine_* ops on the blocking pool, rejections fixed-literal; their sidecar handles and zod keys are gone"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell native_manifest and engine_dispatch (17 tests: the parse tables, rejects-before-context, not-ready, hostile value not echoed, bottle name computed over a real context)"
        status: pass
      - kind: unit
        ref: "src/backend/sidecar/__tests__/nativeChannelOwnership.test.ts, ipcSchemaCoverage.test.ts, ipcDomainCensus.test.ts, flowRegistrationCensus.test.ts, engineFlows.test.ts, runnerMiscEngine.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "The shell fills EngineCtx.default_wine from the Rust PATH rule and EngineCtx.crossover_bin_dir from the CrossOver locator; getDefaultEngine and listEngineOptions answer the TS payloads for a populated and an empty profile over a FakeHome with a scripted PATH; gamelib-engine still depends on no gamelib-wine"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell engine_dispatch (the_default_wine_hook_reads_the_scripted_path, get_default_engine_answers_the_ts_payload_for_a_populated_and_an_empty_profile, list_engine_options_answers_the_rows_for_the_picker_and_for_a_game, locating_crossover_prefers_the_default_locations_and_only_then_asks_spotlight)"
        status: pass
      - kind: other
        ref: "cd src-tauri && test \"$(cargo tree -p gamelib-engine | grep -c 'gamelib-wine')\" -eq 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "The four non-bridge pure helpers have one TS copy in twin.ts, scheduled, and are pinned to Rust by 386 shared vectors replayed by both twinVectors.test.ts and twin_vectors.rs; a one-character mutation of the bottle-name cut and a flipped writable check each fail their replay"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/enginewine/__tests__/twinVectors.test.ts and src/backend/__tests__/engineWineShimSchedule.test.ts"
        status: pass
      - kind: unit
        ref: "cd src-tauri && cargo test -p gamelib-engine --features testing --test twin_vectors"
        status: pass
    human_judgment: false
  - id: D4
    description: "In a running app: the Settings engine picker, the global default engine row and the install dialogs' bottle name are served by the native channels, and CrossOver shows as installed when it is in /Applications, ~/Applications or known to Spotlight"
    requirement: SVC-02
    verification: []
    human_judgment: true
    rationale: "No automated test drives window.api into the packaged shell with a real CrossOver install; the channels are proven by manifest vectors and handler tests over a real context, and the CrossOver locator by a pure test over a temporary tree. 87-58's live gate owns it"
---

# Phase 87 Plan 28: The engine slice's three read channels native, and the engine pure helpers as one pinned twin Summary

**`getPerGameBottleName`, `listEngineOptions` and `getDefaultEngine` are native `engine`-slice channels over the 87-25 crate ops, the shell fills the context's default-wine and CrossOver hooks from `gamelib-wine`, and `engineKeyFor`, `isWritableEngineOverride`, `importEngineSettings` and `getPerGameBottleNameFor` now exist once in `enginewine/twin.ts`, pinned to Rust by 386 shared vectors replayed on both sides.**

## Performance

- **Duration:** 18 min (plan-head ledger 07:32Z, SUMMARY 07:50Z)
- **Tasks:** 3 of 3 (one tracer, one TDD task, one auto)
- **Files:** 3 created, 25 modified, 1 deleted across the plan's three commits (30 files changed in the last, 567 insertions and 116 deletions)

## Accomplishments

- **Tracer (Task 1): `getPerGameBottleName` native end to end.** `ENGINE_SLICE` is named in `native_router.rs` with its own slice test; `engine_dispatch::get_per_game_bottle_name` decodes exactly one strict `{runner, appName}` (runner 1 to 64 UTF-16 units, appName 1 to 4096, unknown keys refused) and runs `engine_per_game_bottle_name` on the blocking pool. The manifest entry carries 3 valid and 13 invalid vectors; the sidecar `ipc.handle` and zod key are deleted in the same commit; contract, snapshot and census pins follow.
- **Task 2: `listEngineOptions` and `getDefaultEngine`, and the hooks.** `listEngineOptions` takes a game identity or the strict `{appName: 'default'}` and `getDefaultEngine` takes no argument; both are native with the same decode discipline. `build_ctx` now fills `default_wine` with a closure over `default_wine_from_path` and the process `PATH`, and `crossover_bin_dir` with the locator (the two default install folders, then `discover_crossover`), the wine context looked up at call time because it is built from the engine context. The shell tests run over a FakeHome with a scripted `PATH` (a populated profile gets `legacy:wine`, an empty one the TS shape) and the engine context never consults the developer's real `PATH` or Spotlight.
- **Task 3: the twin.** `twin.ts` holds the four helpers once; `gameKey.ts`, `engineConfig.ts` and `gameEngineState.ts` lose theirs, `importEngineSettings.ts` is deleted, and `launcher.ts`, the five `games.ts`, the engine and settings/install flows and the engine TS import the twin. `twinVectors.test.ts` replays `engine_twin.json` (158, 34, 51 and 143 vectors, floors 386 total and 34 per group) and `twin_vectors.rs` replays the same file against `key::engine_key_for_json`, `config::is_writable_engine_override`, the new `config::import_engine_settings` (a three-line composition, as 87-25 predicted) and `game_engine::per_game_bottle_name_for`. A mutation of the TS hash length failed three TS tests, a flipped writable check failed the Rust replay, and both were restored.

## Task Commits

1. **Task 1 (tracer): `getPerGameBottleName` native end to end through the new engine slice** - `1e81abc27` (feat)
2. **Task 2: `listEngineOptions` and `getDefaultEngine` native, and the default-wine and CrossOver hooks** - `8a66dfccb` (feat)
3. **Task 3: the engine pure helpers as one pinned TS twin with shared vectors** - `7676e96cb` (feat)

Tracer gate: auto mode off (`workflow.auto_advance` false), `HUMAN_VERIFY_MODE` end-of-phase and the tracer's `<verify>` is automated only, so it was run end to end (manifest vectors, `engine_dispatch`, rustfmt, `check:ipc-contract`, the ownership, schema and census jest, codecheck, prettier) before the commit and again inside the plan-level jest run. Tracer verified end to end, expansion followed.

## Verification

- `cargo test --bin gamelib-shell`: `native_manifest_*` 6 passed (one new slice test), `engine_dispatch` 17 passed (12 new); `rustfmt --edition 2021 --check` over `engine_dispatch.rs` and `native_router.rs` clean. `cargo test -p gamelib-engine --features testing`: lib 49, `fetch_replay` 14, `golden_config` 7, `twin_vectors` 3 passed; `cargo clippy -p gamelib-engine --all-targets --features testing -- -D warnings` and `cargo fmt -p gamelib-engine --check` clean. `test "$(cargo tree -p gamelib-engine | grep -c 'gamelib-wine')" -eq 0` passes.
- `pnpm check:ipc-contract`: both files current. `pnpm codecheck`: clean. `pnpm find-deadcode`: PASS at 310 baselined findings (no rise). `npx prettier --check` over every TS path written: clean (`ipcSchemaSnapshot.json` is prettier-ignored, so no check applies to it).
- jest `src/backend src/common src/preload meta/__tests__`: 739 suites passed; 3 failed. `meta/__tests__/genI18nGateScope.test.ts` A-17 ANTI-ROT is the known failure. `valveClient.test.ts` ("a second instance does not share the first one's pending fetch") failed in the full run and passes alone (48 of 48), so it is order or load flakiness in a file this plan did not touch. `gameDetailsImportGate.test.ts` Gate 7 failed because this plan changed `settingsFlowRegistration.ts`; it was re-pinned in the Task 3 commit (see Deviations) and passes. The regression set (`infoPortComplete`, `engineWinePortComplete`, `engineWineShimSchedule`) passes.
- Acceptance: `"slice": "engine"` count in `nativeChannels.json` 1 after Task 1 (3 after Task 2); non-comment `'getPerGameBottleName'`, `'listEngineOptions'` and `'getDefaultEngine'` in `engineFlowRegistration.ts` all 0 (each was 1); `export function engineKeyFor` in `gameKey.ts` 0 (was 1) and in `twin.ts` 1; `from 'backend/engine/gameKey'` in `gog/games.ts` 0 (was 1).

## Decisions Made

See `key-decisions`. The ones later plans lean on: `twin.ts` has five exports and one of them (`perGameBottleName`, `deletedBy 87`) must be made private by 87-56; the twin imports four leaf helpers from `engine/` that 87-56 must keep or relocate; and the crossover hook reads the wine context lazily, so 87-29's DXVK injection can add a context the same way.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `perGameBottleName` is a fifth exported name and a fifth schedule row**
- **Found during:** Task 3
- **Issue:** `getPerGameBottleNameFor` needs the naming rule, `engineKeyFor` must be in `twin.ts` (acceptance), and the rule in `perGameBottle.ts` would make the two files import each other; `gamePrefix`, `launchEngine` and `gameEngineState` also call it for runners the twin's function refuses (Steam), so they cannot switch to `getPerGameBottleNameFor`. The shim schedule requires every exported value under `enginewine/` to have a row.
- **Fix:** the naming rule moved into `twin.ts` and is exported; `perGameBottle.ts` re-exports it, so no caller or mock changes. It is a `twin` row, `deletedBy: 87` (an intra-phase row that 87-56's `noIntraPhaseRowsLeft` will force private), pinned by the bottle-name vectors. `PER_GAME_BOTTLE_NAME_MAX` is now private to the twin; `perGameBottle.test.ts` holds its own literal 64.
- **Files modified:** `src/backend/enginewine/twin.ts`, `src/backend/engine/perGameBottle.ts`, `src/backend/__tests__/engineWineShimSchedule.test.ts`, `src/backend/engine/__tests__/perGameBottle.test.ts`
- **Commit:** `7676e96cb`

**2. [Rule 3 - Blocking] The twin rows' `callers` are the whole importer set**
- **Found during:** Task 3
- **Issue:** the schedule's last check is per file ("imported by exactly its listed callers"), so the plan's split by row cannot pass.
- **Fix:** all five rows list the same 14 importers; the `deletedBy` values are the plan's.
- **Commit:** `7676e96cb`

**3. [Rule 3 - Blocking] Files outside the plan's list that follow the change**
- Four modules the plan did not list import `engineKeyFor` (`engineEligibility.ts`, `engineState.ts`, `toolSettings.ts` and, for the naming, `perGameBottle.ts`) and now import the twin. Tests followed the moved exports: `gameKey.test.ts`, `engineConfig.test.ts`, `gameEngineState.test.ts`, `importGameEngine.test.ts` and the two engine oracle tests import from the twin; `engineFlows.test.ts`, `runnerMiscEngine.test.ts` and `flowRegistrationCensus.test.ts` drop the deleted channels (engine flows invoke 5 to 2).
- **Re-pin:** `gameDetailsImportGate.test.ts` Gate 7 pins `settingsFlowRegistration.ts` by a sha256 digest; this plan changed that file's one `isWritableEngineOverride` import line, so the digest was recomputed and the reason written beside it, as the gate's own comment demands. No channel, argument or `steamLibrary.has` gate moved.
- **Commit:** `7676e96cb`, `1e81abc27`, `8a66dfccb`

**4. [Rule 3 - Blocking] `installFlowRegistration.ts`'s twin import sits near the top of its import block**
- **Found during:** Task 3
- **Issue:** the schedule's importer scan reads comment-stripped text, and the comment stripper mis-handles part of that file (a prose comment ahead of its late imports), so an import placed at the old spot was not seen as an importer. The same file's other late imports are equally unseen.
- **Fix:** the import sits right after `IpcRegistry`, in the region the scan reads. The stripper was not touched (pre-existing, out of scope).
- **Commit:** `7676e96cb`

**5. [Process] Task 2 (`tdd="true"`) was committed as one commit, not RED then GREEN**
- The plan lists one commit per task and the tests and the implementation were written together; the tests were verified by mutation instead (a wrong expected answer fails the TS replay, a flipped writable check fails the Rust replay). No RED-only commit exists for Task 2.

**Total deviations:** 5 (four blocking, one process). **Impact:** none on the goal; the five-row schedule and the callers lists are the mechanical consequence of the files the plan asked for, and 87-57's final comparison with the D-24 survivor list should expect the fifth name.

### Behaviour changes worth knowing

- **`getDefaultEngine`'s default Wine comes from Rust's PATH rule**, not the sidecar's `getDefaultWineBinary` (the same rule, pinned by `default_wine.json`); a profile whose `config.json` has no `wineVersion` gets `legacy:<basename of the first wine on PATH>`, or the not-found installation when there is none. Windows has no default.
- **The CrossOver hook has no memo.** The TS locator remembered a Spotlight hit; the hook asks the two default folders first and only then Spotlight (one `mdfind`, its own 10 s limit), on each list refresh.
- **A native rejection is a fixed `[invalid-args]` literal**; a `listEngineOptions` call that matches neither shape rejects with the union code at path `0`.

## Issues Encountered

- A `git checkout` of one file (to park the Task 2 hook patch) triggered a repository post-checkout hook that ran `pnpm install` and the helper-binary download; nothing in the working tree changed.
- `git apply --3way` of the saved hook patch conflicted on the doc-comment header and a `use` line only; resolved by hand before Task 2's commit.

## Known Stubs

None.

## Deferred Issues

- `meta/__tests__/genI18nGateScope.test.ts` A-17 ANTI-ROT fails as before (known, not touched).
- `src/backend/storeManagers/steam/bridge/drm/__tests__/valveClient.test.ts` failed once in a full jest run and passed alone; not touched, not investigated.
- A live call of the three channels against a running shell, a real `PATH` and a real CrossOver install is not exercised by any test; 87-58's live gate owns it.
- `engineFlowRegistration.ts`'s `EngineFlowDeps` still carries `config` and `stores` entries that only `listEngineOptions` and `getDefaultEngine` used through `engineServicesOf`; `getEngineState` still reads them, so nothing is dead yet. 87-34 and 87-56 own the rest of that file.

## Threat Flags

None new. T-87-26 holds: every decode is deny-unknown-fields with fixed-literal rejections that carry a path and a code, never the caller's value (a hostile key is asserted absent from the error). T-87-27 holds: `isWritableEngineOverride` is the one validator in each language, pinned by the same 34 vectors, and the bottle name is computed from the identity (a renderer-sent `wineCrossoverBottle` is ignored in both, a vector). T-87-SC: no new crate or package.

## Next Phase Readiness

Ready for 87-29 (DXVK installer injection) and the bottle plans: `EngineCtx` now has both hooks filled and `ENGINE_SLICE` exists for the next engine channels. 87-56 must make `perGameBottleName` private and relocate or keep the four leaf helpers the twin imports (`engineIds`, `gameKey`'s `isCleanAppName`, `isKnownRunner`, `STEAM_APP_ID_RE`, and `bottlePrimitives`' `sanitizeBottleName`); 87-57's final schedule comparison should expect five twin rows from `twin.ts`.

## Self-Check: PASSED

- Created files exist: `src/backend/enginewine/twin.ts`, `src/backend/enginewine/__tests__/twinVectors.test.ts`, `src-tauri/crates/gamelib-engine/tests/twin_vectors.rs`; `src/backend/engine/importEngineSettings.ts` is deleted.
- Commits exist on `main`: `1e81abc27`, `8a66dfccb`, `7676e96cb` (3 measured from `plan_head_before`, all this plan's).
- Acceptance criteria and the plan-level verification re-run and passing (see Verification).
