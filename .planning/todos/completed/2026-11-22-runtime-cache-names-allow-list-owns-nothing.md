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

## Resolution (2026-11-27): ownership is the store table's alone

`store_dispatch.rs` lost the `RUNTIME_CACHE_NAMES` allow-list, its `runtime_cache_recognised` helper, the second
parameter of `owned_row`, and the test that pinned the list to `storeChannels.json`. `owned_row` now takes one
argument and resolves through a table-only lookup (`table_row_for_store_key`), the same shape that
`store_native.rs` already used for the native storeNew path.

The todo's premise needed a correction. Unknown names were not refused by the row check: the runtime row that
`row_for_store_key` builds for an unlisted `store_cache/<name>` is cache-family, which counts as owned. The left
side of the helper's `||` (`row_for_key(key).is_some()`) is what refused them. So the suggested one-liner,
`row_for_store_key(key).filter(is_rust_owned)`, would have owned `store_cache/custom_cache` and created its file,
a T-85-30 regression. Removing the runtime branch from `row_for_store_key` was not an option either: the frame
parser and the shared `store_cache/custom_cache` vector in `storeFrameVectors.json` rely on it to treat the key as
shape-valid. The branch stays as a shape check, and ownership got its own lookup.

The invariant is recorded in two tests that both read `recognizedCacheStoreNames` from `storeChannels.json`: the
Rust test `store_frame_every_recognised_cache_name_is_an_owned_table_row` and the TS case in `storeKeys.test.ts`.
Each asserts that every recognised name is a store-table row the shell owns, so a recognised name added without a
table row turns both red.

`storeChannels.json` and its `recognizedCacheStoreNames` list are unchanged: the sidecar's storeNew gate
(`storePolicy.ts`), `store_policy.rs` and `store_native.rs` still read it.

The sidecar's `isRustOwnedStoreKey` lost its test-only `recognizedRuntimeCaches` parameter and follows the same
table-only rule, so the two sides refuse the same names by the same rule.

T-85-30 still holds: the unchanged end-to-end tests (a `store_cache/custom_cache` frame is answered
`refused`/`not-owned` and no file appears) pass, and every shared valid vector still parses. This was verified by
tests, not by a live app run.

Fix commits, by subject because this branch may be rebased on merge:
"refactor(quick-261127-vbq): the shell owns a store frame's file only when the store table lists it" and
"refactor(quick-261127-vbq): the sidecar's isRustOwnedStoreKey owns a runtime cache only when the table lists it".
