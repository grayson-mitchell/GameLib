---
phase: 75-steam-local-file-formats-in-rust
plan: 19
subsystem: steam-depot
tags: [rust, depot, acf, ipc]
requires: [75-07, 75-12]
provides:
  - depot_finalize op (no-download ACF finalize) in gamelib-depot
  - RUST_DEPOT_FINALIZE channel, shell arm rpc_depot_finalize
affects: [75-23]
key-files:
  created:
    - src-tauri/crates/gamelib-depot/tests/finalize_op.rs
  modified:
    - src-tauri/crates/gamelib-depot/src/lib.rs
    - src-tauri/src/depot_dispatch.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/__tests__/depotChannelParity.test.ts
    - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
decisions:
  - "No-download finalize always has all_files_verified=false, so StateFlags 4 is never written (fail closed)"
  - "sizeOnDisk on the wire is a decimal string, matching the job's AcfResult"
metrics:
  tasks: 2
  completed: 2026-11-14
---

# Phase 75 Plan 19: depot_finalize op Summary

A `depot_finalize` op in gamelib-depot performs a no-download ACF finalize (zero-depot install, failed resume verify) through the existing `acf::finalize` and `preserve_installed_manifest` rules, reachable from the sidecar as a new unbounded depot channel.

## Commits
- 96e42e347 test(75-19): failing tests (8 through dispatch)
- fe1b57fc8 feat(75-19): depot_finalize op
- da0bb1c48 feat(75-19): channel, shell arm, parity pin

## Deviations from Plan

**1. [Rule 3 - Blocking] Stale channel-count pin**
- `rustInvokeSchemas.test.ts` hardcoded 48 channels but was already stale (58 before this plan); updated to 59 so the sidecar suite is green.

Otherwise the plan was executed as written. Result shape: `{acf:{path,stateFlags,sizeOnDisk(string)}}`, `{preserved:true,stateFlags}`, or `{error}`.

## Self-Check: PASSED
