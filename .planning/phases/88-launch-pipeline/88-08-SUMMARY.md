---
phase: 88-launch-pipeline
plan: 08
subsystem: known-fix-reader
tags: [knownfix, reader, layering, native-channels, golden-replay, bundled-seeds, svc-03]

requires:
  - phase: 88-launch-pipeline
    plan: 03
    provides: the gamelib-knownfix crate scaffold (KnownFixCtx, guarded dispatch, CLI pair) the reader hangs on
  - phase: 88-launch-pipeline
    plan: 05
    provides: golden/reader, 125 cases recorded from the TS readers, with cases.json, deltas.json, MANIFEST.json and expected/<case>/
provides:
  - gamelib-knownfix reader.rs (read_known_fixes, read_known_fixes_with_layer, read_known_fix_profile, read_gamelib_fix_status, the two filters, is_valid_exe_override_shape, is_routing_only_tier1_fix, store_suffix), types.rs and the order-preserving jsvalue.rs
  - ops knownfix_read and knownfix_status (args [appName, runner], bad-args against the closed runner set)
  - src-tauri/src/knownfix_dispatch.rs (KNOWNFIX_CTX, install, get_known_fixes, get_gamelib_fix_status) and KNOWNFIX_SLICE in native_router.rs
  - native channels getKnownFixes and getGamelibFixStatus (slice knownfix), sidecar handles and zod keys deleted, IPC contract regenerated
  - tests golden_reader.rs (READER_FLOOR 125) and bundled_seeds.rs
  - DEFAULT_RELAY_URL in gamelib-knownfix ctx.rs (the shell's fallback for GAMELIB_FIX_RELAY_URL)
affects: [88-09, 88-10, 88-11, 88.1]

actuals:
  tokens: 34300
  tasks: 3
  commits: 4
commits: 4
plan_head_before: ef0c519fa8e9c4edc2348d813a949e0c8bfb4e2b
plan_head_after: 76e3464ddb03c5f8dbd5d9fa978c2df6b116dfd6

tech-stack:
  added: []
  patterns:
    - "an order-preserving JSON value (jsvalue.rs) for files whose key order is observable: warnings follow JavaScript's Object.entries order (array indices first, then insertion order) without turning serde_json's workspace-wide preserve_order on"
    - "a native handler body takes the installed context as an Option argument (game_channel), so a unit test drives not-ready and the seeded answer over its own FakeHome context without touching the process-wide OnceLock"
    - "a tracer task that deletes a sidecar handle moves every census count that pinned it in the same commit, each with a 'Phase 88 Plan 08' note in the file's history style"

key-files:
  created:
    - src-tauri/crates/gamelib-knownfix/src/reader.rs
    - src-tauri/crates/gamelib-knownfix/src/types.rs
    - src-tauri/crates/gamelib-knownfix/src/jsvalue.rs
    - src-tauri/crates/gamelib-knownfix/tests/golden_reader.rs
    - src-tauri/crates/gamelib-knownfix/tests/bundled_seeds.rs
    - src-tauri/src/knownfix_dispatch.rs
  modified:
    - src-tauri/crates/gamelib-knownfix/src/lib.rs
    - src-tauri/crates/gamelib-knownfix/src/ctx.rs
    - src-tauri/crates/gamelib-knownfix-cli/tests/cli.rs
    - src-tauri/src/main.rs
    - src-tauri/src/native_router.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/ipc/nativeChannels.json
    - src/common/types/ipc/native.ts
    - src/common/types/ipc/enrichment.ts
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src/backend/sidecar/enrichmentFlowRegistration.ts
    - src/backend/sidecar/__tests__/enrichmentFlows.test.ts
    - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/enrichment.test.ts
    - src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts

key-decisions:
  - "KnownFixesInfo and KnownFixProfile hold each key's JSON value (Option<serde_json::Value>), not a narrowed Rust type: the TS reader copies an allow-listed key unchecked apart from the five shape-checked ones, and the golden keeps `launchNotice: 5` as 5 (D-20, kept as recorded). The launch builders and registry fixes validate the keys they use"
  - "A fix file is parsed into an order-preserving JsValue, not serde_json::Value: preserve_order must stay off (gamelib-store), and the warning for each ignored key is logged in Object.entries order, which the goldens record"
  - "The containment test is the TS one ported literally (resolve, then relative must be non-empty and not start with `..`), so a file whose own name starts with two dots is refused too and a backslash form warns on every OS"
  - "The sideload runner reads `<id>-undefined.json` in three readers and answers None in the status probe, as recorded (todo 2026-11-25-known-fix-readers-read-undefined-store-file-for-sideload); store_suffix answers None for it"
  - "The relay URL is read once by the shell (GAMELIB_FIX_RELAY_URL, empty means unset) with the deployed URL as the crate's DEFAULT_RELAY_URL, so the crate reads no environment"
  - "The shell validates [appName, runner] before it looks at the context (app name 1 to 256 UTF-16 units, one of five runners) and a rejection is the invalid-args marker with fixed paths and codes; the crate decodes again and its rejection is the fixed `<op>:bad-args`"

requirements-completed: [SVC-03]

coverage:
  - id: D1
    description: "The tier-1, tier-1-with-layer, tier-2 and status readers replay every one of the 125 golden/reader cases (answers and events), with the parser message the one documented delta; READER_FLOOR is 125 in the Rust file and an empty list fails"
    requirement: SVC-03
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-knownfix/tests/golden_reader.rs#every_reader_golden_replays and #the_floor_matches_the_manifest_and_an_empty_list_fails"
        status: pass
    human_judgment: false
  - id: D2
    description: "getKnownFixes and getGamelibFixStatus are native knownfix channels run on the blocking pool through guarded; a call before install answers `<channel>: not ready`; the renderer names and result shapes are unchanged"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell knownfix_dispatch (the_handler_answers_not_ready_before_install_and_validates_first, get_known_fixes_answers_null_for_an_unknown_game_and_the_fix_for_a_seeded_one, get_gamelib_fix_status_answers_null_the_local_origin_and_never_counts_the_remote_layer) and native_manifest_knownfix_channels_are_registered_in_the_knownfix_slice"
        status: pass
    human_judgment: false
  - id: D3
    description: "The sidecar no longer registers either channel; their zod entries are gone and the census counts, flow pins and the regenerated IPC contract and snapshot agree"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "pnpm exec jest src/backend/sidecar (114 suites, 3143 tests), pnpm check:ipc-contract, pnpm codecheck"
        status: pass
    human_judgment: false
  - id: D4
    description: "WR-06 and T-88-17: a traversing appName (relative, backslash, absolute, deeper) answers None with the fixed warning and no read, the target file existing in each layer's parent; a rejected runner is a fixed literal that never echoes input"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "reader.rs#a_traversing_app_name_is_refused_with_a_fixed_warning_and_nothing_is_opened, golden cases traversal-dotdot, traversal-backslash, traversal-absolute, and lib.rs#the_read_op_decodes_app_name_and_runner_and_answers_null_or_the_fix"
        status: pass
    human_judgment: false
  - id: D5
    description: "Prohibition 6 and T-88-18: the tier-2 walk lists local and bundled only and the tier-1 filter is the 12-key allow-list; a planted remote layer in the profile walk fails 41 golden cases and the behaviour tests"
    requirement: SVC-03
    verification:
      - kind: integration
        ref: "golden_reader.rs#the_profile_reader_never_opens_the_remote_directory and #a_remote_tier_1_file_carrying_tier_2_keys_yields_no_tier_2_data, plus the 41-case failure under the planted mutant"
        status: pass
    human_judgment: false
  - id: D6
    description: "The bundled seed checks the TS ran are Rust tests over public/fixes: the three CEG seeds carry macArch 32 and drm ceg and are routing-only, the three macArch seeds are routing-only, Mining Mechs is a real fix, and all ten bundled files parse with no dropped key"
    requirement: SVC-03
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-knownfix/tests/bundled_seeds.rs (4 tests, floor of 10 files)"
        status: pass
    human_judgment: false
  - id: D7
    description: "The Windows and Linux legs of the replay and the shell tests were not run; only the macOS dev machine built and tested the crate and the shell"
    verification: []
    human_judgment: true
    rationale: "Cross-OS behaviour (path separators in the containment test, the case-insensitive volume) is proven only by the first CI run of rust-test.yml"

duration: 30min
completed: 2026-11-25
status: complete
---

# Phase 88 Plan 08: Known-fix reader, native channels and the full reader replay Summary

**The tier-1, tier-2, with-layer and status known-fix readers are Rust, replay all 125 reader goldens, and serve `getKnownFixes` and `getGamelibFixStatus` as native `knownfix` channels with the sidecar handles and zod keys deleted in the same commits.**

## Performance

- **Duration:** about 30 min (start time was not recorded at launch; estimated from the commit clock)
- **Tasks:** 3 (one tracer, two TDD)
- **Commits:** 4 (tracer, RED, GREEN, seed tests)
- **Files:** 6 created and 15 modified; 21 changed over the plan, 2674 insertions and 165 deletions (the snapshot and generated contract included)

## Accomplishments

- **Tracer (Task 1):** `getKnownFixes` native end to end. `reader.rs` reads `<id>-<store>.json` from local, then bundled, then remote, the first parsed object winning whole-file, through the 12-key allow-list with the five shape checks. Containment is resolve-plus-relative before any open. Op `knownfix_read`; the shell's `knownfix_dispatch.rs` (context set once, `install` after `wine_dispatch::install`, decode before the context, blocking pool, `not ready` before install); the `knownfix` slice and manifest entry; the sidecar `ipc.handle` and zod key deleted with every census count that pinned them. The tracer's `<verify>` was re-run end to end before expansion: crate and shell tests, `check:ipc-contract`, the whole sidecar jest tree, `codecheck`, prettier.
- **Readers and replay (Task 2):** `read_known_fixes_with_layer`, `read_known_fix_profile` (local and bundled only; no remote directory is in its layer list), `read_gamelib_fix_status` (tier 1 then tier 2, notice trimmed with JavaScript's `trim`, the routing-only `break`) and the tier-2 filter. `golden_reader.rs` replays every case of `golden/reader` (answers of the four readers, events per step and reader, `filter`, `exeShape`, `routingOnly`, `tier1Keys`, `layerPaths`) on a FakeHome, floor 125, empty list fails. `getGamelibFixStatus` is native the same way.
- **Seed data tests (Task 3):** `bundled_seeds.rs` reads the repo's `public/fixes` as the bundled layer with empty local and remote layers: the CEG seeds, the macArch seeds, Mining Mechs as a real fix, and every bundled file read with no warning and no dropped key, floor 10 files.

## Task Commits

1. **Task 1 (tracer): getKnownFixes native end to end** - `f250ff891` (feat)
2. **Task 2 RED: failing reader replay and tier-2 behaviours** - `f1316efce` (test)
3. **Task 2 GREEN: tier-2 reader, with-layer reader, status probe, getGamelibFixStatus native** - `e36a62606` (feat)
4. **Task 3: bundled seed data tests** - `76e3464dd` (test)

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md, ROADMAP.md and REQUIREMENTS.md.

## TDD notes

- **Task 2 RED:** the replay and four behaviour tests were committed against three reader stubs that answer `None`. `cargo test -p gamelib-knownfix --test golden_reader` failed 4 of 6 tests; `every_reader_golden_replays` reported 94 of 125 cases differing, each on the planned answer (for example `readKnownFixesWithLayer` null where the golden holds `{fix, layer}`) or on events the stub never logged. The tests compile and run, so this is a semantic RED, not a build failure. `gsd_run check tdd-red-evidence` was not run: cargo's libtest output is not one of the report formats the classifier reads, so this plan's RED rests on the assessment above. **GREEN:** the same replay passes 125 of 125 with no change to the test. A planted remote layer in the profile walk failed 41 cases and three tests, then was removed.
- **Task 3:** a RED was not obtainable, because the readers it checks exist from Tasks 1 and 2 and the data are real. Substituted by mutation: reading `drm` as another literal failed the CEG and the no-dropped-key tests; raising the floor above ten failed the floor assertion; both reverted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Fidelity to the golden] KnownFixesInfo and KnownFixProfile hold JSON values, not narrowed types**
- **Found during:** Task 1 (types.rs), confirmed against `knownFixesGamelibStatus--readgamelibfixstatus-launchnotice-p-undefined`
- **Issue:** the plan asked for fields typed as the TS types declare (strings, string arrays, maps). The TS reader copies an allow-listed key without checking its type, and the golden records `launchNotice: 5` answered as `5`, so a `String`-typed field would reject a file the TS accepted.
- **Fix:** each field is `Option<serde_json::Value>` (a present `null` stays present); the five shape-checked keys keep their checks; accessors `set`, `get` and `keys` give the consumers a typed way in.
- **Files modified:** `types.rs`
- **Commit:** `f250ff891`

**2. [Rule 3 - Blocking] An order-preserving JSON value, a file the plan did not list**
- **Found during:** Task 1 (the warning order)
- **Issue:** the warning for each ignored key is logged in `Object.entries` order and the goldens record it, but `serde_json::Value` objects iterate sorted and `preserve_order` must stay off (`gamelib-store/Cargo.toml` explains: feature unification would reorder every crate's output). The "ignoring <value>" text also needs `JSON.stringify` key order.
- **Fix:** `jsvalue.rs`: a `Deserialize` visitor that keeps entries in JavaScript's own-key order (array indices ascending, then insertion order, a repeated key keeping its first place), `stringify` as `JSON.stringify` writes it, and conversion to `Value` for kept keys. The replay reads `cases.json` through it so `filter` cases keep their key order.
- **Files modified:** `src-tauri/crates/gamelib-knownfix/src/jsvalue.rs` (new), `lib.rs`
- **Commit:** `f250ff891`

**3. [Rule 2 - Missing critical] The echoed ignored value is cut in the warning**
- **Found during:** Task 1 (prohibition 1, T-88-19)
- **Issue:** the shape-check warnings echo the ignored value (`ignoring "C:\\game.exe"`, which the goldens require), and a remote file can carry an arbitrarily long value for those keys into `gamelib.log`.
- **Fix:** the echo is cut at 200 characters with a `...` suffix. No golden value is that long, so every recorded line is unchanged; a unit test pins the cut.
- **Files modified:** `reader.rs`
- **Commit:** `f250ff891`

**4. [Rule 3 - Blocking] `DEFAULT_RELAY_URL` added to the crate's ctx.rs**
- **Found during:** Task 1 (the shell's context build)
- **Issue:** the plan has the shell fall back to "the crate's default" relay URL, and the crate had none (88-07 added goldens, not code). `ctx.rs` was not in `files_modified`.
- **Fix:** `pub const DEFAULT_RELAY_URL` with the deployed URL, the value the 88-07 `constants` golden pins as `GAMELIB_FIX_RELAY_URL`.
- **Files modified:** `src-tauri/crates/gamelib-knownfix/src/ctx.rs`
- **Commit:** `f250ff891`

### Verification notes (no code change)

- `cargo fmt -p gamelib-shell --check` in the plan's `<verify>` reports 175 diffs, all in the generated `src-tauri/src/ipc_contract.rs`, which the generator writes unformatted and HEAD already carries that way. `knownfix_dispatch.rs` is rustfmt-clean (checked with `rustfmt --edition 2021`); `cargo fmt -p gamelib-knownfix --check` and `-p gamelib-knownfix-cli` pass, and so does `cargo clippy ... --all-targets -- -D warnings`.
- `invokeReturnValueSweep.test.ts` is in `files_modified` but needed no edit: it reads four other registration modules and pins none of these channels. It passes unchanged.
- `golden/reader/deltas.json` says the POSIX recording of `traversal-backslash` "warns nothing". The recorded `events.json` holds the containment warning (the TS refuses any relative path starting with `..`, and `..\x` does). The replay matches the recorded events on every OS, so the delta's description is inaccurate but harmless; the fixture was not edited.

**Total deviations:** 4 auto-fixed (1 fidelity, 1 blocking x2, 1 missing-critical) plus 3 verification notes. **Impact:** none on the plan's goal; the first deviation narrows the typed-field wish to what the golden demands.

## Authentication Gates

None.

## Known Stubs

None. The three RED stubs of `reader.rs` were replaced in the GREEN commit.

## Threat Flags

None. The two new native channels, the `appName` and `runner` boundary and the remote layer are the surfaces T-88-17, T-88-18 and T-88-19 already cover.

## Issues Encountered

None blocking. The Windows and Linux legs of the new tests have not run (see coverage D7).

## Next Phase Readiness

Ready for 88-09. The reader is the base the registry fixes, the exe override and the overlays read through: `reader::read_known_fixes`, `read_known_fix_profile`, `read_known_fixes_with_layer` and `store_suffix` are public, `KnownFixCtx` carries the bundled layer, the relay URL and the app version, and the shell's `knownfix_dispatch::knownfix_ctx()` is where later `knownfix_*` rustInvoke arms read the installed context.

## Self-Check: PASSED
