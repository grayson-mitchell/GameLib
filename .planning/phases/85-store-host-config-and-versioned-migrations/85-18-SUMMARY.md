---
phase: 85-store-host-config-and-versioned-migrations
plan: 18
subsystem: infra
tags: [rust, typescript, rustinvoke, version-gate, engine-marker, shared-redist-ledger, store-versioning]

requires:
  - phase: 85-store-host-config-and-versioned-migrations
    provides: "85-11 hardened mirror cells and the moduleStateCensus lesson; 85-12 the cache flip and the pattern of one gate on each side; 85-07 the Rust version engine, Chains::baseline and the backup module this reuses"
provides:
  - "gamelib-store::version_gate (GateState Absent/Ok/Unreadable/Newer, GateOutcome, version_gate, version_gate_with): the refuse-newer rule for the two bottle-local versioned files, reading only, never writing"
  - "rustInvoke store_version_gate and store_backup_file (store_gate_dispatch.rs): absolute path, no `..`, file name exactly one of the two marker names, chain matching the name, else <channel>:bad-args; backups beside the file, 0600, at most 3"
  - "backend/stores/bottleVersionGate.ts: createBottleVersionGate() (prime / state / forget over a closure-owned memo), gateAllowsWrite, backupBottleFile, the chain keys and BOTTLE_FILE_VERSION"
  - "engineSwitch.ts and sharedRedistInstall.ts no longer import storeVersioning/*; nothing outside storeVersioning/* uses engineMarkerFile.ts or sharedRedistLedgerFile.ts, so 85-24 can delete them (SC5)"
  - "testUtils/fakeBottleGateRust.ts: a jest-mock-free fake of both channels that answers from the real file"
affects: [85-22, 85-24, 85-19, 85-25]

plan_head_before: d797e71557e04ee3e7aea1304ec55e99cac4509f
plan_head_after: 01f7eb5b3e4196fdc2a3c5b689cc82be97ebd0df
commits: 2

actuals:
  tokens: 27000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "an async entry point primes a boot-owned memo from Rust, and the synchronous writers read the memo back; an unprimed path refuses the write (never a guess about a file that may be newer)"
    - "state that must outlive a call but cannot be module-level lives in an object a boot-owned runtime holds (EngineRuntime.bottleGate, the installer's state), which is how moduleStateCensus stays at zero"

key-files:
  created:
    - src-tauri/crates/gamelib-store/src/version_gate.rs
    - src-tauri/src/store_gate_dispatch.rs
    - src/backend/stores/bottleVersionGate.ts
    - src/backend/stores/__tests__/bottleVersionGate.test.ts
    - src/backend/testUtils/fakeBottleGateRust.ts
  modified:
    - src-tauri/crates/gamelib-store/src/lib.rs
    - src-tauri/src/main.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/backend/engine/engineSwitch.ts
    - src/backend/engine/engineDecision.ts
    - src/backend/engine/engineRuntime.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/testUtils/testEngineRuntime.ts
    - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
    - src/backend/storeManagers/steam/bridge/bridgeRuntime.ts
    - src/backend/storeManagers/steam/bridgeBottleLifecycle.ts
    - src/backend/storeManagers/steam/gameBridgeLaunch.ts

key-decisions:
  - "The gate memo is NOT module state: moduleStateCensus allows no new top-level mutable binding, so the plan's free functions primeBottleVersionGate / bottleVersionGate / forgetBottleVersionGate became the methods prime / state / forget of createBottleVersionGate(). The memo lives on EngineRuntime (bottleGate) for the engine switch and in the installer's own state for the ledger, so two boots and two tests never share an answer"
  - "EngineSwitchContext replaces `versioning` with both `requestRustInvoke` (as the plan says) and `bottleGate` (the memo); switchContextFrom fills both from services.engineRuntime, so no caller of switchContextFrom changed"
  - "A gate Rust cannot answer (rejected, or a reply that is not a known state) is treated as unprimed, not as writable: the same engine still launches, a real engine change is refused as marker-newer, nothing is written. prime() never rejects, so a Rust outage cannot break a launch"
  - "prime() asks Rust on every call (it refreshes the memo) rather than answering from the memo, so a marker a newer build replaced since the last call is noticed"
  - "store_backup_file reads the file itself and rejects store_backup_file:write-failed when the copy cannot be made, resolving null only when the file is absent; the ledger reader treats a rejection as 'skip the pass, leave the file alone', which is what the TS backup throwing did"
  - "reconcileBottleEngineMarker, recordPinnedBottleEngine and recordCrossoverBottleEngine became async (each primes the gate itself) instead of making three callers prime first: all three callers were already in async code and now await"

patterns-established:
  - "A rustInvoke op that takes a path from the sidecar validates it in Rust a second time (absolute, no `..`, an allow-listed file name, the matching chain) even though the TS schema is strict: the TS schema is a contract, the Rust check is the boundary"

requirements-completed: [FND-06]

coverage:
  - id: D1
    description: "The engine marker's refuse-newer rule is decided by Rust: engineSwitch's async entries prime `store_version_gate`, a `newer` answer (or an unanswerable gate) makes the synchronous marker writers refuse and the file stays byte-identical, `ok`/`absent`/`unreadable` let it write"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/engineSwitch.test.ts#marker versioning (261109-w52) (Rust decides newer, not the marker bytes; a gate Rust cannot answer is read as newer; an unreadable marker is still writable; the recorders and reconcile prime the gate themselves)"
        status: pass
      - kind: unit
        ref: "src/backend/stores/__tests__/bottleVersionGate.test.ts (28 cases: each state, refresh on every prime, unanswerable and malformed replies, forget, no shared state between gates, gateAllowsWrite table)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The Rust gate reads the codec's version (missing/invalid is 0, non-negative integer is itself, above u32 clamps) and answers absent/ok/unreadable/newer for both chains without writing; store_version_gate and store_backup_file reject every path or chain they do not own"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-store version_gate (8 tests)"
        status: pass
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_gate (5 tests: each state through the arm, wrong chain / other file name / relative / `..` / empty path rejected, backup beside the file capped at 3, 0600, absent file is null, bad fromVersion rejected)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The shared-redist ledger goes through the same gate and the Rust backup op with every existing ledger case unchanged: a newer or unanswerable ledger skips the pass and is left unchanged, an unreadable or wrong-shape ledger is backed up through store_backup_file and read as empty, a backup that cannot be made skips the pass"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts#ledger versioning (quick 261109-uv4) (66 tests in the file)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Nothing outside storeVersioning/* depends on engineMarkerFile.ts or sharedRedistLedgerFile.ts, so 85-24 can delete them with the directory"
    requirement: FND-06
    verification:
      - kind: other
        ref: "grep -c 'storeVersioning/' engineSwitch.ts sharedRedistInstall.ts sharedRedistInstall.test.ts == 0; grep -rln 'engineMarkerFile\\|sharedRedistLedgerFile' src lists only storeMigrations/index.ts (comments) and the two files' own tests"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-11-22
status: complete
---

# Phase 85 Plan 18: Bottle version gate Summary

**A Rust `version_gate` op (refuse-newer, never writes) for the engine marker and the shared-redist ledger, reached through two new rustInvoke channels with a boot-owned memo so engineSwitch's synchronous writers stay synchronous and no module state is added**

## Performance

- **Duration:** 16 min
- **Started:** 2026-11-21T23:30:43Z
- **Completed:** 2026-11-21T23:46:40Z
- **Tasks:** 2
- **Files modified:** 26 (including the regenerated ipc_contract.rs)

## Accomplishments

- `gamelib-store::version_gate` reads the two bottle files' top-level `version` exactly as the TS codecs did and answers `absent`, `ok`, `unreadable` or `newer`; both chains are empty so it never migrates or rewrites (D-17).
- `store_version_gate` and `store_backup_file` are wired end to end: TS contract constants and strict schemas, the regenerated Rust contract, `store_gate_dispatch.rs`, and the router arms. Path and chain are validated in Rust (T-85-46).
- `engineSwitch.ts` no longer touches `storeVersioning/*`: async entries (`prepareBottleForEngine`, and the three marker recorders, now async) prime the gate, the synchronous `writeMarker` refuses when the answer is `newer` or missing (T-85-47), reads never consult it.
- `sharedRedistInstall.ts` asks the gate before the ledger is read and backs an unreadable ledger up through Rust; both bottle files can now be deleted with `storeVersioning/*` in 85-24.

## Task Commits

1. **Task 1: Tracer, the engine marker gate end to end** - `ac288e547` (feat). Tracer verified end to end: `newer` through `rustInvoke store_version_gate` makes the sync `writeMarker` refuse with the file byte-identical, proven by the engineSwitch suite and the Rust arm tests, before the ledger work was started.
2. **Task 2: The shared-redist ledger through the gate and the Rust backup op, plus the plan-end gates** - `01f7eb5b3` (feat)

**Plan metadata:** the docs commit that carries this file, STATE.md and ROADMAP.md.

## Files Created/Modified

See the frontmatter `key-files`. The two Rust files are `version_gate.rs` (the decision, 8 tests) and `store_gate_dispatch.rs` (the two handlers, 5 tests). `bottleVersionGate.ts` is the TS side; `fakeBottleGateRust.ts` is the test fake both consumers' suites use.

## Decisions Made

See `key-decisions`. The one that changes the plan's shape: the memo is a closure-owned object, not module state, because `moduleStateCensus` forbids a new top-level mutable binding.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The gate memo cannot be module-level state**
- **Found during:** Task 1 (design, against `moduleStateCensus.test.ts` and the dispatch note)
- **Issue:** the plan's free functions `primeBottleVersionGate / bottleVersionGate / forgetBottleVersionGate` imply a module-level Map; the census sanctions none outside three files and `pnpm backend-di-ceilings` would fail.
- **Fix:** `createBottleVersionGate()` returns `{ prime, state, forget }` over a closure Map. EngineRuntime owns one (`bottleGate`) and EngineSwitchContext carries it beside `requestRustInvoke`; the shared-redist installer owns its own in its state. The behaviour in the plan's truths is unchanged.
- **Files modified:** `src/backend/stores/bottleVersionGate.ts`, `engineRuntime.ts`, `engineSwitch.ts`, `sharedRedistInstall.ts`
- **Committed in:** `ac288e547`, `01f7eb5b3`

**2. [Rule 3 - Blocking] The new channels needed their strict schemas and counts, which the plan's file list omitted**
- **Found during:** Task 1
- **Issue:** `rustInvokeArgs` must hold one schema per channel (`rustInvoke.ts`), and two tests pin the channel count (`rustInvokeSchemas.test.ts` 120 to 122) and the router's arm count (`tauriShellSource.test.ts` 120 to 122, plus its arm-name list). `store_gate_dispatch.rs` also had to join the shell-source lists in `main.rs`.
- **Fix:** added both schemas, updated the two counts and the arm list, and registered the module in both source lists.
- **Files modified:** `src/common/types/ipc/rustInvoke.ts`, `src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts`, `src/backend/__tests__/tauriShellSource.test.ts`, `src-tauri/src/main.rs`
- **Committed in:** `ac288e547`

**3. [Rule 1 - Bug avoided] Three exported marker functions became async**
- **Found during:** Task 1
- **Issue:** `reconcileBottleEngineMarker`, `recordPinnedBottleEngine` and `recordCrossoverBottleEngine` are sync entry points that reach `writeMarker`; with an async gate they would write unprimed (refused) or unchecked.
- **Fix:** each primes the gate itself and returns a Promise; their three callers (`gameBridgeLaunch.ts`, `bridgeBottleLifecycle.ts` twice) now `await`, and the callers' spies in `bridgeBottleLifecycle.test.ts` resolve. `engineSwitch.test.ts` awaits them.
- **Files modified:** `engineSwitch.ts`, `gameBridgeLaunch.ts`, `bridgeBottleLifecycle.ts`, `bridgeBottleLifecycle.test.ts`, `engineSwitch.test.ts`
- **Committed in:** `ac288e547`

**4. [Rule 1 - Test removed with its subject] The simulated-v2-step ledger test is gone**
- **Found during:** Task 2
- **Issue:** `sharedRedistInstall.test.ts` had a case that overrode the TS chain with a v2 step and expected a backup plus a v2 stamp. The Rust gate never migrates (both chains are empty, D-17), so the case has no subject.
- **Fix:** removed it; the remaining ledger cases keep their expectations, and four cases were added for the transport (asks by path and chain, Rust says newer, Rust cannot be asked, unreadable ledger backed up through `store_backup_file`).
- **Files modified:** `src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts`
- **Committed in:** `01f7eb5b3`

**5. [Rule 3 - Blocking] knip, the jestMock ceiling and the clippy MSRV lint**
- **Found during:** Task 2 plan-end gates
- **Issue:** an unused `RUST_STORE_GATE_CHANNELS` group and an exported type tripped `find-deadcode`; `jest.mock('backend/logger')` in the new test tripped the jestMock ceiling; `Option::is_none_or` is a new `incompatible_msrv` warning the clippy ratchet would count.
- **Fix:** dropped the group and made the type private, removed the mock (the real logger is harmless under jest), used `map_or`.
- **Committed in:** `01f7eb5b3`

---

**Total deviations:** 5 auto-fixed (4 blocking, 1 bug avoided). **Impact on plan:** none on scope; every item is something the plan's own verify (`backend-di-ceilings`, `find-deadcode`, the contract and count tests) would have refused.

## Issues Encountered

- `src/backend/__tests__/tauriShellSource.test.ts` has one failing case, "the ownership file flips only the tracer store", that predates this plan: it still pins every family `false` and 85-12 flipped `cache`. Out of scope, recorded in `deferred-items.md`. Every other case in the file passes, including the two I changed.
- `sharedRedistInstall.test.ts` prints a harmless "import after the Jest environment has been torn down" for a Wine Mono repair log from a deliberately never-settling run (the file's own Phase 54 note); it passes 66/66.

## Known Stubs

None.

## Threat Flags

None. Both new channels cross the sidecar to Rust boundary the plan's threat model already names (T-85-46, T-85-47).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 85-22 can remove `versioning` from `EngineServices`, `BridgeRuntime`'s deps (now unread) and `testBridgeRuntime`'s default; 85-24 can delete `engineMarkerFile.ts`, `sharedRedistLedgerFile.ts` and their two tests together with `storeVersioning/*`.
- The Windows and Linux legs of CI have not run this plan's Rust tests; the code uses only `std::path` and `std::fs` and the tests use `FakeHome`, with the 0600 check `cfg(unix)`.

## Self-Check: PASSED

- All five created files exist and both commits are ancestors of HEAD (`ac288e547`, `01f7eb5b3`).
- Plan-end gates at the last commit: `check:ipc-contract`, `codecheck`, `lint` (0 errors), `find-deadcode`, `backend-di-ceilings`, `planning-gates` (12/12) pass; `cargo test --bin gamelib-shell` 642 passed; `cargo test -p gamelib-store version_gate` 8 passed; jest over `src/backend/engine`, `storeManagers/steam/bridge`, `stores`, `sidecar`, `games.test.ts` and `bridgeBottleLifecycle.test.ts` passes (221 suites); `rustfmt` and `cargo fmt -p gamelib-store --check` clean on the files written; `cargo clippy -p gamelib-store --all-targets -- -D warnings` clean and the new shell file adds no clippy warning.

---
*Phase: 85-store-host-config-and-versioned-migrations*
*Completed: 2026-11-22*
