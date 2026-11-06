---
phase: 63-rust-migration-pattern-and-executable-scanners
plan: 06
subsystem: scanner-rustinvoke-boundary
tags: [rust, tauri, rustInvoke, scanners, parity]
requires: [63-05]
provides:
  - six allow-listed RUST_SCAN_* rustInvoke channels plus RUST_SCAN_CHANNELS
  - six dispatch_rust_channel arms calling gamelib_scan::dispatch
  - rustScan.ts invokeScan / runScanner (per-scanner ts|rust switch, once-per-caller impl log)
  - bridge/peScan.ts fail-closed async detectSteamDrmInPe / readPeImportedDllNames
  - scanChannelParity.test.ts (OPS == channels + CLI_ONLY, arm bodies)
affects: [63-07, 63-08, 63-09, 63-11, 63-12]
key-files:
  created:
    - src/backend/scanners/rustScan.ts
    - src/backend/scanners/__tests__/rustScan.test.ts
    - src/backend/scanners/__tests__/scanChannelParity.test.ts
    - src/backend/storeManagers/steam/bridge/peScan.ts
    - src/backend/storeManagers/steam/bridge/__tests__/peScan.test.ts
  modified:
    - src/common/types/sidecarTransport.ts
    - src-tauri/src/store_embed.rs
    - src-tauri/src/main.rs
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
key-decisions:
  - "No timeout exception and no spawn_blocking: scan channels keep the 60 s unref'd rustInvoke bound"
  - "peScan.ts is a new module; peSteamDrm.ts stays the pure TS oracle"
requirements-completed: [D-03, D-08, D-11]
completed: 2026-11-07
---

# Phase 63 Plan 06: rustInvoke scan boundary Summary

The sidecar can now call every app-reachable scanner in-process through six allow-listed `scan_*` rustInvoke channels routed straight to `gamelib_scan::dispatch`, behind a per-scanner ts/rust switch with byte-free arguments.

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1 Channels, shell arms, parity tests | c635d7880 | transportParity, scanChannelParity, cargoFeatures pass; shell test `scan_channels_are_gamelib_scan_app_ops` passes; Cargo.lock diff is only `+ "gamelib-scan",` |
| 2 rustScan.ts + peScan.ts | 0cf535918 | 11 new Jest tests, tsc clean, smoke:sidecar PASS |

## Verification

- Jest: transportParity, scanChannelParity, cargoFeatures (22) pass; `src/backend/sidecar` (81 suites, 1621 tests) pass; `src/backend/scanners` + peScan 286 pass.
- `cargo test --bin gamelib-shell scan_channels_are_gamelib_scan_app_ops`: ok.
- `pnpm exec tsc --noEmit`: clean (the `@ts-expect-error` Buffer line is live).
- `pnpm smoke:sidecar`: PASS.
- Greps: 6 `gamelib_scan::dispatch("scan_` arms; 0 `scan_` in sidecarRpc.ts; 0 timers and 0 Buffer/readSync/openSync in rustScan.ts and peScan.ts.
- prettier --check clean on the TS files (store_embed.rs, main.rs, Cargo.* have no parser).

## Not run

- Full `cargo test --bin gamelib-shell` and `cargo test -p gamelib-scan -p gamelib-scan-cli` (only the new shell test was run; plan 05 covered the crate).
- No live gate; the real rustInvoke round trip is exercised in 63-11/63-12.

## Deviations from Plan

- **[Rule 1] sidecarTransport.ts needed `prettier --write`** after the insertion (HEAD was already clean); formatting only.
- `main.rs` gains `scan_channels_are_gamelib_scan_app_ops` appended at the end of `mod tests`.
- `runScanner` casts `args as never` when forwarding to `invokeScan` (generic correlation between Op and channel cannot be expressed to the type checker).

## Known Stubs

None.

## Threat Flags

None. T-63-24/26/27/28 mitigations are in place (allow-list + parity tests, retained 60 s bound, string-only args with expect-error test, no timers or handles).

## Self-Check: PASSED

All created files exist; commits c635d7880 and 0cf535918 exist.
