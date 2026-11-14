---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 35
subsystem: steam-cm
tags: [rust, macos, owned-apps, ipc-contract]
requires: [79-27, 79-30, 79-34]
provides:
  - "steamcm_mac_owned_apps: fallback-safe Mac Steam owned-apps op (helper out of process, anonymous PICS type/name lookup)"
affects: [79-36]
key-files:
  modified:
    - src-tauri/crates/gamelib-steamcm/src/macowned.rs
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

# Phase 79 Plan 35: Rust side of the Mac Steam owned-apps path Summary

`macowned.rs` spawns `steam-bridge-helper --steam-owned-apps --expect-steamid` out of process (30 s bound, `kill_on_drop`), strictly parses its final line, looks the ids up over the anonymous PICS session to keep `common.type == game` with names, and selects demos with the shared `select_licensed_demos` rule. It is exposed as `steamcm_mac_owned_apps`, which never errors: every failure is `{ok:false,kind:"fallback",reason}`.

## Commits
- 38823371d feat(79-35): macowned.rs (7 unit tests over stub helper scripts)
- the second commit registers the op through crate, TS contract, generated contract and shell (see git log)

## Result shape
- Success: `{ok:true,result:{owned:{app_count,apps:[{appid,name,playtime_forever:0,rtime_last_played:0}]},demos:[{appid,name,playtime_forever}],subscribedCount}}`
- Failure: `{ok:false,kind:"fallback",reason}` with reason one of `not-macos, helper-missing, helper-failed, timeout, not-logged-on, account-mismatch, ambiguous-slot, parse, pics-failed`.

## Decisions
- Demos reuse `select_licensed_demos` by modelling Steam's subscribed set as one synthetic package, with the game set as the "owned" exclusion.
- Real-profile arm: the helper inherits the real environment (needs real HOME for steamclient.dylib); documented in the module doc. Tests spawn only stub scripts.
- Shell handler (T-79-104) rejects a `helperPath` that is not absolute, contains `..`, or whose file name is not `steam-bridge-helper`; unit-tested.
- RUST_STEAMCM_MAC_OWNED_APPS is in UNBOUNDED_RUST_CHANNELS (helper 30 s plus per-batch PICS reads exceed the generic cap).

## Deviations from Plan
1. **[Rule 2] Extra `pics-failed` reason.** An anonymous lookup failure has no home in the specified enum; it falls back with `pics-failed` rather than a misleading `helper-failed`.
2. Exit-code 2 with `attach-failed` maps to `helper-failed` (no dedicated variant in the interface).
3. Verify syntax: whole-crate `cargo test -p gamelib-steamcm` and `--lib macowned` used instead of path filters.
4. The hung-helper test checks the child is dead or a zombie (tokio reaps lazily), not `kill -0`.

## Verification
`cargo test -p gamelib-steamcm` 264 lib tests pass; `cargo clippy -p gamelib-steamcm --all-targets -D warnings` and `cargo fmt -p gamelib-steamcm --check` clean; `cargo build` ok; shell dispatch test passes; `check:ipc-contract` up to date; `tsc --noEmit` clean; jest `src/backend` 208 of 209 suites pass (the only failure is the pre-existing tauriShellSource); prettier clean on the TS files. `cargo clippy --workspace -D warnings` reports 14 errors in the pre-existing `gamelib-shell` code, none in files touched here. The live Mac Steam success path was NOT exercised (not run).

## Known Stubs
None.

## Self-Check: PASSED
