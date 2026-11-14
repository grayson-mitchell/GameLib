# Quick 261114-nn2 Summary

Fixes Phase 74 WR-10: estimateBridgeUpdate now registers a unique per-call job key and is bounded to 60 s.

## Commits
- 7e8cb5b18: Rust `SummarizeRequest.job_id` (optional) + `host_job_id()` fallback; used by the fetcher and ShellJobHost
- 0d9ec9e77: updateEstimate.ts unique `summary-{appId}-{uuid}` key, `ESTIMATE_TIMEOUT_MS`, combined caller/timeout signal, raced summary, tests
- 5b5906e93: same unique key in install.ts and secondary.ts; todo moved to completed

## Verification
- `cargo test -p gamelib-depot`: all pass (incl. new serde test); `cargo check -p gamelib-shell` ok
- updateEstimate jest: 12/12; `tsc --noEmit` clean; prettier clean on written TS paths
- depotRust + bridge jest: 2 failures in bridge shimCoverage/shimGenerate (steam_api.def export-list pins), unrelated to this change (not touched)

## Deviations
- `cargo fmt -p gamelib-shell -- --check` reports pre-existing diffs in untouched files (clipboard.rs, dialogs.rs, ipc_contract.rs, ...); the files edited here are rustfmt-clean (checked individually). Not fixed (out of scope).
