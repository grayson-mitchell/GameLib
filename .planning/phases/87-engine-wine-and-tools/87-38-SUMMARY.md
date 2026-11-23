---
phase: 87-engine-wine-and-tools
plan: 38
subsystem: wine
tags: [rust, gamelib-engine, bottles, engine-marker, version-gate, cxbottle-conf, ledger, registry, d-07, golden]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the 87-11 bottle goldens, state fixtures and vectors (146 cases, 21 bottles, bottle_twin.json, selection_registry.json), the gamelib-engine crate and EngineCtx (87-06, 87-25), gamelib_store::version_gate (Phase 85), the TS tools slice deletion (87-37)
provides:
  - gamelib_engine::bottles::{paths, marker, conf, pin_marker, ledger::Ledger, registry::Registry, prefix}
  - the D-07 engine marker written byte for byte through gamelib_store::version_gate in process (MARKER_FILE, ENGINE_MARKER_CHAIN, BOTTLE_FILE_VERSION); read, view, trusted, infer, reconcile, record_pinned, record_crossover, the three read-only views
  - EngineCtx.ledger and EngineCtx.registry, in-memory only
  - ops engine_bottle_record_pinned and engine_bottle_is_provisioned
  - golden_bottles.rs (98 state goldens, 168 bottle_twin vectors, 11 registry sequences) and roundtrip_state.rs (every fixture marker)
affects: [87-39, 87-42, 87-56]

actuals:
  tokens: 29635
  tasks: 2
  commits: 2

plan_head_before: 9d06eb461cd9c9a746105eb21fa17cf0116b9329
plan_head_after: 7b5a0b6b2c1086c873bfbd8d3ff7551de83a8dbc

tech-stack:
  added: []
  patterns:
    - "a writer that must honour a version gate takes the gate as a parameter (`Gate`): the app passes the in-process `process_gate`, a golden injects the 'cannot be asked' and 'answers newer' states the TS channel fake produced"
    - "marker bytes are built with `Obj::insert_js` and `to_compact_bytes` in the TS key order, never serde_json (whose object order is sorted)"
    - "a state golden replays outcome, marker bytes, log lines and the before and after trees (path, kind, mode and 0o7755, sha256 over placeholder-normalised content), with every difference from the TS in deltas.json"

key-files:
  created:
    - src-tauri/crates/gamelib-engine/src/bottles/mod.rs
    - src-tauri/crates/gamelib-engine/src/bottles/paths.rs
    - src-tauri/crates/gamelib-engine/src/bottles/marker.rs
    - src-tauri/crates/gamelib-engine/src/bottles/conf.rs
    - src-tauri/crates/gamelib-engine/src/bottles/pin_marker.rs
    - src-tauri/crates/gamelib-engine/src/bottles/ledger.rs
    - src-tauri/crates/gamelib-engine/src/bottles/registry.rs
    - src-tauri/crates/gamelib-engine/src/bottles/prefix.rs
    - src-tauri/crates/gamelib-engine/tests/golden_bottles.rs
    - src-tauri/crates/gamelib-engine/tests/roundtrip_state.rs
    - src-tauri/crates/gamelib-engine/tests/fixtures/golden/bottles/deltas.json
  modified:
    - src-tauri/crates/gamelib-engine/src/lib.rs
    - src-tauri/crates/gamelib-engine/src/ctx.rs
    - src-tauri/crates/gamelib-engine/src/engines.rs

key-decisions:
  - "An unreadable marker is rewritten by reconcile and record_pinned, as the TS did (87-11 finding 8, goldens record-pinned-over-unreadable-overwritten and reconcile-marker-unreadable); only a marker the gate reports newer is never touched. The plan's truth wording ('an unreadable marker is kept, never reset') conflicts with the goldens it also requires; the goldens won, and the round trip itself never rewrites an unreadable marker (read returns nothing, so nothing is written back). Recorded in deltas.json; flagged for review."
  - "The gate is a parameter of every marker writer (`Gate`), defaulting to the in-process `process_gate`; the TS fake's 'Rust cannot be asked' state has no in-process equivalent, so the three reject cases replay through an injected gate and the TS channel warning line is not compared (deltas.json)"
  - "The conf writer's log lines name the bottle directory's name, not its path (T-86-15: the engine log never carries a profile path); the replay compares the golden's lines with the Bottles-root prefix removed"
  - "random_bottle_id draws 128 bits from std's per-hasher RandomState (OS entropy) instead of adding a uuid or rand dependency (T-87-SC: no new crate)"
  - "The ledger keeps each bottle's keys in marking order (a Vec per bottle, not a HashSet) because gamesRunningIn's golden order is the TS Set's insertion order"
  - "Registry selections are a typed EngineSelection enum (serde tag `kind`, the engine fields flattened) so the later switch and launch plans share one shape; a stored pinned selection always carries `dxvk` (null when absent), as the TS copy did"
  - "engine_bottle_is_provisioned answers false for a name the sanitiser rejects, where the library function (like the TS) does not sanitise: the op is a surface a renderer-derived name can reach (T-87-36)"
  - "read_bottle_engine_marker_kind in engines.rs now delegates to bottles::marker (one set of read rules); golden_config still passes unchanged"

patterns-established:
  - "a bottle golden's `gateCalls` field is a TS-channel artefact and is not replayed; the gate's behaviour is what is compared"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "Rust records the engine marker exactly as released builds did: the in-process version gate first, the TS key order (kind, id, wineserverBin, optional dxvk as {dir, version} or \"failed\", then version 1), compact, mode 0644, .gamelib-engine.json.tmp-<pid> then rename; a newer marker and a gate nobody could ask refuse the write, and no tmp file is left behind"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/tests/golden_bottles.rs (the_tracer_goldens_replay, every_marker_golden_replays: 79 cases)"
        status: pass
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/tests/roundtrip_state.rs (7 tests over the 15 fixture markers)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The marker read rules (kinds, id token, dxvk dir inside the pinned-engine root, a contradicted crossover marker), inference (DXVK-macOS present -> pinned, conf Timestamp -> crossover, else pinned), the reconcile pass and the three read-only views replay every 87-11 golden, and the 87-11 bottle_twin vectors for getBottleDir, sanitizeBottleName, isBottleProvisioned and the marker readers"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "golden_bottles.rs (views 27, reconcile 28, record-pinned 18, record-crossover 6; every_recorded_bottle_twin_vector_replays_against_the_rust_functions, 168 vectors)"
        status: pass
    human_judgment: false
  - id: D3
    description: "cxbottle.conf create-once (only with system.reg, never over a conf, wx tmp + rename, fixed template, uppercase v4 BottleID), the .gamelib-pin.json {sha256, version} marker, the in-memory ledger and registry (held in EngineCtx) and the prefix resolver replay their goldens and the 11 selection_registry sequences"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "golden_bottles.rs (provisioned 2, conf-write 5, ledger 2, registry 4, resolve-prefix 6; every_recorded_selection_registry_sequence_replays_against_the_registry)"
        status: pass
      - kind: unit
        ref: "cargo test -p gamelib-engine bottles:: (17 passed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The create, kill and removal goldens (48 of the 146 cases) are named in LATER_OPS and replay in 87-39; no TS caller is switched (87-42 switches every bottle caller)"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "golden_bottles.rs (every_case_op_is_replayed_here_or_scheduled_for_87_39)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Whether the unreadable-marker rewrite (kept from the TS) is the behaviour the user wants given the plan's 'kept, never reset' wording"
    verification: []
    human_judgment: true
    rationale: "The plan text and the committed goldens disagree; the port follows the goldens and records why (deltas.json, key-decisions). Which behaviour is right for a corrupt marker is a product call, not a test result."

duration: 16min
completed: 2026-11-23
---

# Phase 87 Plan 38: Bottle state primitives in Rust Summary

**gamelib-engine now owns the bottle engine marker (byte-compatible, written through the in-process version gate, never over a newer one), the `cxbottle.conf` writer, the pinned-artifact marker, the in-memory running-games ledger and engine registry, and the prefix resolver, with 98 of the 87-11 goldens, 168 twin vectors, 11 registry sequences and a D-07 round trip over every fixture marker replaying green.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-11-23T11:51:19Z
- **Completed:** 2026-11-23T12:08Z
- **Tasks:** 2 of 2
- **Files:** 14 changed in the two commits (2959 insertions, 50 deletions)

## Accomplishments

- **Tracer (Task 1):** `bottles::paths` and `bottles::marker`, op `engine_bottle_record_pinned`, `golden_bottles.rs` over the marker cases (79: views 27, reconcile 28, record-pinned 18, record-crossover 6) and `roundtrip_state.rs`. The tracer's `<verify>` is automated only and passed before Task 2 started (auto mode off, `human_verify_mode` end-of-phase), so no checkpoint was raised.
- **Marker:** `write_marker_with` asks the gate, refuses `newer` and an unasked gate, builds the bytes with `Obj::insert_js`, writes `.gamelib-engine.json.tmp-<pid>` (0644, create-or-truncate) and renames; a failed write removes the tmp file. `reconcile`, `record_pinned` and `record_crossover` keep the TS order of checks (clean name, conf exists, gate, read, trust, infer, write, log).
- **Task 2:** `conf::write_cxbottle_conf`, `pin_marker::{read, write, matches}`, `ledger::Ledger`, `registry::Registry` (typed `EngineSelection`), `prefix::resolve_game_prefix_value`, `EngineCtx.ledger` and `EngineCtx.registry`, op `engine_bottle_is_provisioned`. `engines.rs` now reads pin markers and the marker kind through the new modules.
- **Replay beyond the plan's minimum:** the 168 `bottle_twin.json` vectors (getBottleDir 16, sanitizeBottleName 31, isBottleProvisioned 25, the two marker readers 25 each, restoreNeedsAbsentPin 46) replay against the Rust functions, so T-87-36's "one sanitise function in each language pinned by shared vectors" holds from the Rust side too.
- **Non-vacuity:** two mutations were run and each failed the goldens, then were reverted (treating `unreadable` as not writable; renaming the written `version` key). The count floors (140 cases, 98 replayed, 168 vectors, 11 sequences, 15 round-trip fixtures) and an empty-list negative live in the tests.

## Task Commits

1. **Task 1 (tracer): the pinned bottle marker recorded in Rust through the in-process gate** - `2581db8fb` (feat)
2. **Task 2: conf, pinned markers, ledger, registry and prefix in gamelib-engine** - `7b5a0b6b2` (feat)

## Verification

- Task 1 chain: `cargo test -p gamelib-engine --features testing --test golden_bottles --test roundtrip_state` (8 + 7 passed), `cargo clippy -p gamelib-engine --all-targets --features testing -- -D warnings`, `cargo fmt -p gamelib-engine --check`.
- Task 2 chain: the same plus `cargo test -p gamelib-engine bottles::` (17 passed). Whole crate: 77 lib, 24 fetch_replay, 12 golden_bottles, 7 golden_config, 7 roundtrip_state, 3 twin_vectors, all passed; `cargo check -p gamelib-wine --all-targets` clean.
- Acceptance: `grep -c version_gate marker.rs` is 4 (>= 1); `grep -c "serde_json::to_string\|to_string_pretty" marker.rs` is 0; `grep -c "pub struct Registry" registry.rs` is 1; `selection_registry.json` replays (11 sequences).
- The Rust-only `<verify>` blocks carry no prettier check, as the plan says (no prettier-visible path is written; the written paths are Rust, JSON fixtures that are prettier-ignored, and this SUMMARY).
- Not run: the TS jest suites (no TS file was changed); a real Mac launch (no caller is switched, D-06).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug / plan conflict] The plan's "unreadable marker is kept, never reset" contradicts the goldens it also requires**
- **Found during:** Task 1
- **Issue:** the must-have truth and the prohibition say an unreadable marker is kept. The committed goldens (`record-pinned-over-unreadable-overwritten`, `reconcile-marker-unreadable`) and 87-11 finding 8 record the TS overwriting it (the gate reports `unreadable`, which is writable), and D-07 and the plan's own second truth require every marker golden to replay.
- **Fix:** followed the goldens: reconcile and record_pinned rewrite an unreadable marker, only a `newer` one is never touched. The round trip never rewrites an unreadable marker (read returns nothing, so nothing is written back) and `roundtrip_state.rs` asserts its bytes are identical. The decision and its reasoning are in `deltas.json` (`unreadable-marker-is-rewritten-as-the-ts-did`). If the user wants the stricter behaviour, it is a one-line change in `gate_allows_write` plus two goldens that become deltas.
- **Files modified:** `bottles/marker.rs`, `golden/bottles/deltas.json`
- **Commit:** `2581db8fb`

**2. [Rule 2 - Missing critical] `engine_bottle_is_provisioned` sanitises**
- **Found during:** Task 2
- **Issue:** the TS `isBottleProvisioned` never sanitised (87-11 finding 1, golden `provisioned-parent-traversal-name`: `..` reads as provisioned if a conf sits in the CrossOver directory). Exposed as an op, a renderer-derived name could probe a path outside the Bottles root (T-87-36).
- **Fix:** the op answers `false` for a name `sanitize_bottle_name` rejects; the library function keeps the recorded behaviour so the golden and twin vectors still replay.
- **Files modified:** `src/lib.rs` (with a test)
- **Commit:** `7b5a0b6b2`

**3. [Rule 3 - Blocking] Files the plan does not list**
- **Found during:** Tasks 1 and 2
- **Issue:** `engines.rs` already held `bottle_dir`, `is_bottle_provisioned`, `read_bottle_engine_marker_kind` and a private pin-marker reader, so a second copy of the read rules would have drifted; `NonCrossoverEngine` and `DxvkBuild` needed `Deserialize` for the op argument and the registry's flattened selection; `golden/bottles/deltas.json` carries the replay's documented differences.
- **Fix:** `engines.rs` delegates to `bottles::marker`, `bottles::paths` and `bottles::pin_marker`; the two types derive `Deserialize`.
- **Files modified:** `src/engines.rs`, `golden/bottles/deltas.json`
- **Commit:** `2581db8fb`, `7b5a0b6b2`

**Total deviations:** 3 (1 Rule 1 plan-conflict decision, 1 Rule 2, 1 Rule 3). **Impact on plan:** none on scope; deviation 1 needs a user look (coverage D5).

## Issues Encountered

- Running `git checkout -- <file>` once triggered the repo's `post-checkout` hook (`pnpm i`, `pnpm download-helper-binaries`); it changed nothing tracked and the dev tooling (jest, prettier, tsc) is intact. I used `git show` and file copies afterwards.

## Known Stubs

None. `pin_marker::write` and `conf::random_bottle_id` have no non-test caller yet by design: the fallback bottle creation that calls them is 87-39, and no TS caller is switched (D-06).

## Threat Flags

None. T-87-36 (bottle name and marker paths) is mitigated as planned: one sanitiser, pinned by 31 shared vectors on this side; `dxvk.dir` must sit inside the pinned-engine root (`is_inside`, golden `pinned-dxvk-outside-root`); trust roots come from the context's tools path, never from marker data. T-87-38 (marker overwrite across versions) is mitigated: the gate runs before every write, `newer` is refused (`record-pinned-over-newer-refused`, `a_marker_from_a_newer_build_is_never_overwritten`), see deviation 1 for the unreadable case. T-87-SC: no new crate.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 87-39 ports CrossOver and fallback bottle creation, the wineserver kill, guarded removal and the per-game flight; the 48 cases of those ops are in `LATER_OPS` of `golden_bottles.rs` and the Rust writers (`marker::record_pinned`, `conf::write_cxbottle_conf`, `pin_marker::write`) are ready for them.
- 87-42 switches every bottle caller; the TS twins (`getBottleDir`, `sanitizeBottleName`, `isBottleProvisioned`, the marker readers) stay until then and are pinned against these by `bottle_twin.json`.
- `graphify update .` was run.

## Self-Check: PASSED

- FOUND: `bottles/{mod,paths,marker,conf,pin_marker,ledger,registry,prefix}.rs`, `tests/golden_bottles.rs`, `tests/roundtrip_state.rs`, `golden/bottles/deltas.json`
- FOUND: `2581db8fb`, `7b5a0b6b2` (ancestors of HEAD; `git rev-list --count` from the plan ledger is 2)
