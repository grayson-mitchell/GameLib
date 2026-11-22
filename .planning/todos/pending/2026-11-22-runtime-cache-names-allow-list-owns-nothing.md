---
created: 2026-11-22T12:00:00.000Z
title: "Runtime-cache allow-list RUNTIME_CACHE_NAMES owns nothing the store table does not already own (Phase 85 review B-WR-10)"
area: stores
files:
  - src-tauri/src/store_dispatch.rs (~159-185, runtime_cache_recognised, runtime_cache_row)
severity: minor
platform: any
ready: code
---

## Problem

Phase 85 code review finding B-WR-10 (round 1, `5714cafea`). It is a necessity finding: machinery written
for a case that does not exist yet.

`runtime_cache_recognised(key, recognised)` is `row_for_key(key).is_some() || recognised.contains(&name)`.
Every name in `RUNTIME_CACHE_NAMES` is already a table row. The test
`store_frame_owned_row_takes_every_openable_row_and_refuses_unrecognised_runtime_names` asserts this for all
five names, and the doc comment says the runtime branch "owns nothing the table does not already name". So
the right-hand side of the `||` never decides anything in production.

Four things exist only for a hypothetical future runtime cache:

- the list
- `runtime_cache_recognised`
- the `runtime_cache_row` branch of `row_for_store_key`
- the test that pins the list to `storeChannels.json`

Unknown names are already refused at the `owned_row` row check, so the list adds no trust boundary.

The 85 fixer left it alone on 2026-11-22, because a necessity finding is outside the `critical_warning` fix
scope. Deferred by the operator during 85 UAT.

## Fix

Drop the list and record the invariant, or keep only one source for it. `owned_row` can become
`row_for_store_key(key).filter(is_rust_owned)`. Add a runtime cache when a real one exists.

Verify with `cargo test -p gamelib-shell`. Check that the TS gates pinning `storeChannels.json` still pass:
`pnpm jest` over the store channel and `tauriShellSource` gates.
