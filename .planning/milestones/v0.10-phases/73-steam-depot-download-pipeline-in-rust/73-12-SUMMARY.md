---
phase: 73-steam-depot-download-pipeline-in-rust
plan: 12
subsystem: steam-depot
tags: [steam, depot, tauri-shell, rustinvoke, sidecar-exit-contract]
requires: [73-10, 73-11]
provides:
  - depot_job_run / depot_job_cancel / depot_manifest_summary rustInvoke channels end to end
  - ShellJobHost (bounded per-job event queue, token and request-code callbacks into Node)
  - install-root guard and shell-owned manifest cache dir
  - sidecar-EOF and app-exit depot cancellation (D-08)
  - rustDepot.ts typed helper (runDepotJob, cancelDepotJob, summarizeDepots)
affects: [73-13]
tech-stack:
  added: []
  patterns: [one host per dispatch call, finish() joins the event writer before the response frame]
key-files:
  created:
    - src-tauri/src/depot_dispatch.rs
    - src/backend/storeManagers/steam/depotRust/rustDepot.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/rustDepot.test.ts
    - src/backend/__tests__/depotChannelParity.test.ts
  modified:
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src-tauri/src/ipc_contract.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/main.rs
    - src-tauri/src/sidecar.rs
    - src-tauri/crates/gamelib-depot/src/registry.rs
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/storeManagers/steam/depotRust/types.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
key-decisions:
  - "ShellJobHost is created per dispatch call and finish() drops the sender then joins the writer, so every queued event reaches the pipe before the Outcome response (Node would otherwise drop late events for an unregistered job)"
  - "Summary requests use host job id `summary-<appId>`, matching the id the crate's summary fetcher uses for token requests; plan 13 must register an active job under that id"
  - "Generated Args carry the nested job as `serde_json::Value` (`x-rust-value`, title `request`); the crate's deny_unknown_fields stays the strict authority"
requirements-completed: [P73-B, P73-D, D-03, D-06, D-08]
duration: ~50min
completed: 2026-11-09
---

# Phase 73 Plan 12: Shell wiring and rustDepot helper Summary

The sidecar can now start, cancel and summarize Rust depot jobs in-process; jobs are cancelled when the sidecar's stdout ends and at app exit (5 s bounded wait for finalize).

## Tasks

1. **Channels, contract, shell arms, ShellJobHost** - commit 8bdaa51ac. Three `RUST_DEPOT_*` constants plus `RUST_DEPOT_CHANNELS` group in the allowlist, generated Args, `depot_dispatch.rs` (`rpc_depot_job_run/cancel/manifest_summary`, `guard_install_root`, `ShellJobHost`, `on_sidecar_eof_cancel_jobs`, `EXIT_FINALIZE_WAIT`), three exhaustive arms in `dispatch_rust_channel`, `RunEvent::Exit` calls `cancel_all_and_wait(5 s)` before `shutdown_child()`. Events go out as `send` frames on `depotJobEvent` through a 64-slot `sync_channel` with `try_send` (progress and host summaries dropped when full; planned and warning retried once after 2 ms). Tokens and request codes use `SidecarState::invoke`, JSON null maps to `None`, `""` passes through. `depotChannelParity.test.ts` pins OPS == constants == arms, each handler calls `gamelib_depot::dispatch` with its own op, and the three shell-caller channels exist.
2. **EOF cancel, unbounded channel, helper** - commit b8c12641d. The reader's EOF block calls `on_sidecar_eof_cancel_jobs()` right after the `drain_pending_invokes` loop and logs exactly `[shell] depot jobs cancelled on sidecar EOF: <n>`. `RUST_DEPOT_JOB_RUN` joins `UNBOUNDED_RUST_CHANNELS` with the second membership rule documented. `rustDepot.ts` registers before invoking, disposes in `finally`, fires `depot_job_cancel` on abort without awaiting (rejection swallowed), returns a cancelled outcome for an already-aborted signal, and creates no timers.

## Verification

- `cargo test --bin gamelib-shell`: 452 passed (incl. `install_root_guard_*`, `depot_eof_cancels_all_jobs`)
- Jest: sidecar, depotChannelParity, depotRust all green; `pnpm check:ipc-contract`, `tsc --noEmit`, `pnpm smoke:sidecar` PASS; prettier clean on touched paths
- gamelib-depot clippy `-D warnings` clean

## Deviations from Plan

**1. [Rule 3 - Blocking] Generator limits.** `genIpcContract` rejects `minLength` and un-titled positionals, so cancel's `jobId` is a plain `z.string()` (crate validates) and run/summary use `z.unknown().meta({ title: 'request', 'x-rust-value': true })` instead of an object envelope.

**2. [Rule 3 - Blocking] Existing tests updated.** `rustInvokeSchemas.test.ts` and `tauriShellSource.test.ts` hard-coded 45 channels/arms (now 48); the shell-source test also lists the depot arms in its pre-existing-arms table. `depot_dispatch.rs` was added to the two source lists in main.rs tests. Its test module is named `tests` (the D-10 census only allows a bare `tests` per file beyond three named topic mods).

**3. [Rule 3 - Blocking] `registry::cancel_all` now returns the count** (`usize`, was `()`), needed to log the EOF count; no caller used the old unit return.

**4. Task split.** The `main.rs` exit-wait hunk landed in the task 1 commit (same file as the module wiring); `sidecar.rs` hook and TS helper are in task 2.

## Deferred Issues

- `tauriShellSource.test.ts` WR-07 (`.title(format!...)` in store_embed link popup) fails independent of this plan; logged in `deferred-items.md`.
- `meta/clippyRatchet.cjs` reports one `clippy::needless_range_loop` (no ceiling) at `src-tauri/src/main.rs:2076`, in a pre-existing test helper this plan did not touch. No warnings were added by `depot_dispatch.rs`.

## Known Stubs

None.

## Threat Flags

None. T-73-45..49 mitigated as planned: allow-listed channels, generated Args plus crate deny_unknown_fields, `guard_install_root` and shell-owned cache dir, no payload logging (grep 0), bounded non-blocking event queue, cancel on stdout EOF and bounded wait at exit, no timer on the unbounded entry and fire-and-forget abort (smoke:sidecar PASS).

## Self-Check: PASSED

Created files and both commits (8bdaa51ac, b8c12641d) verified present.
