---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 30
subsystem: steam-cm
tags: [rust, refresh, enrichment, ipc-contract]
requires: [79-14, 79-15, 79-16, 79-27, 79-28, 79-29]
provides:
  - "steamcm_refresh: whole Refresh orchestration in Rust, bounded at 150 s"
  - "steamcm_store_enrich and steamcm_store_appdetails lazy ops"
affects: [79-31, 79-32]
key-files:
  modified:
    - src-tauri/crates/gamelib-steamcm/src/refresh/mod.rs
    - src-tauri/crates/gamelib-steamcm/src/facade.rs
    - src-tauri/crates/gamelib-steamcm/src/lib.rs
    - src-tauri/src/ipc_contract.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/steamcm_dispatch.rs
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/storeManagers/steam/cm/steamCmTypes.ts
    - src/backend/__tests__/steamCmChannelParity.test.ts
    - src/backend/__tests__/dialogOptionForwarding.test.ts
    - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
metrics:
  tasks: 2
  completed: 2026-11-15
---

# Phase 79 Plan 30: Rust Refresh orchestration and enrichment ops Summary

`refresh_library` runs the whole Refresh in Rust (collect owned plus demos on the lease, anonymous-first capture with held fallback, assemble, bounded enrichment) and returns the finished games plus every changed metadata entry. It and the two lazy store ops are wired through the crate, TS contract, generated contract and shell.

## Commits
- 791f8e9e7 feat(79-30): crate side (refresh/mod.rs, facade, lib.rs; OPS now 28)
- c9a018923 feat(79-30): TS contract, regenerated ipc_contract, shell arms, types

## Result shapes
- `steamcm_refresh` -> `{ok:true,result:{games,metadataUpdates,ownedCount,demoCount,demosFailed,capture:{platforms,metacritic,anonCount,heldCount},enrich:{attempted,enriched,delisted,failed,rateLimited,budgetHit,notReached},source:"cm"}}`; failures `{ok:false,kind:"ownedFailed"(+cause,eresult?)|"leaseUnknown"|"shuttingDown"|"timeout"}`. Demos, capture and enrichment failures never fail it.
- `steamcm_store_enrich` -> `{ok:true,result:{kind:"enriched"|"delisted"|"noData",entry?,game?}}`; failures `badAppId|http(status)|tooLarge|timeout|parse|network`.
- `steamcm_store_appdetails` -> `{ok:true,result:{delisted,data,storageBytes,macMinOs,macArch}}`.

## Deviations from Plan
1. **[Rule 3] Opaque payloads in the schema.** `gen:ipc-contract` rejects record schemas, so `metadata`, `previousGames`, `installState`, `cached` and `current` use `x-rust-value` (generated as `Value`); strict typing is in the crate's `deny_unknown_fields` structs.
2. **`leaseId` stays `u64` in `RefreshSource` per the plan interface**, converted to the crate's `u32` LeaseId; an out-of-range id is `leaseUnknown`.
3. **Envelope:** store ops use the same `{ok,result}` envelope as every other op.
4. Only RUST_STEAMCM_REFRESH joins `UNBOUNDED_RUST_CHANNELS` (pin in dialogOptionForwarding.test.ts updated); store ops keep the generic cap since each is bounded by its own 15 s HTTP timeout. Channel counts: parity 24 -> 27, rustInvokeSchemas 83 -> 86.
5. Verify syntax: used `cargo test -p gamelib-steamcm` whole-crate rather than path filters.

## Verification
`cargo test -p gamelib-steamcm` 257 lib tests pass (7 new in refresh and 2 in lib dispatch); clippy `--all-targets -D warnings` and `cargo fmt -p gamelib-steamcm --check` clean; `cargo build` ok; `check:ipc-contract` up to date; `tsc --noEmit` clean; jest backend sidecar + parity + dialogOptionForwarding 118 suites pass; prettier clean. `cargo fmt --check` on the generated `ipc_contract.rs` reports diffs (the generator's output is not rustfmt-shaped; pre-existing, untouched). No live Steam run.

## Known Stubs
None.

## Self-Check: PASSED
