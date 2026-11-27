---
phase: quick-261127-vbq
plan: 01
subsystem: stores
tags: [store-ownership, T-85-30, rust, sidecar, todo-closure]
requires: []
provides:
  - "Table-only store-frame ownership in the shell (`owned_row(key)`, `table_row_for_store_key`)"
  - "Sidecar `isRustOwnedStoreKey(storeKey)` with the same rule and no test-only parameter"
  - "Invariant tests: every recognised cache name in storeChannels.json is an owned store-table row (Rust and TS)"
affects: [src-tauri/src/store_dispatch.rs, src/backend/stores/storeFrames.ts]
tech-stack:
  added: []
  patterns: ["ownership resolved from the store table alone; runtime store_cache/<name> is shape-valid only"]
key-files:
  created: []
  modified:
    - src-tauri/src/store_dispatch.rs
    - src/backend/stores/storeFrames.ts
    - src/backend/stores/__tests__/storeKeys.test.ts
    - .planning/todos/completed/2026-11-22-runtime-cache-names-allow-list-owns-nothing.md
key-decisions:
  - "Ownership gets its own table-only lookup; row_for_store_key keeps its runtime shape branch so the shared store_cache/custom_cache vector still parses (the todo's one-liner would have owned it and created a file)"
  - "storeChannels.json and recognizedCacheStoreNames unchanged (storePolicy.ts, store_policy.rs, store_native.rs read it)"
status: complete
commits: 4
plan_head_before: 739481822dd7905dd9f46e6a4110aabcb1ad38de
plan_head_after: abeb61549c39fcd1182be836c47651aa3bee9568
actuals:
  tokens: 9000
  tasks: 3
  commits: 3
duration: ~25m
completed: 2026-11-27
---

# Phase quick-261127-vbq Plan 01: Runtime-cache allow-list removed Summary

The shell now decides store-frame ownership from the store table alone; the hand-copied `RUNTIME_CACHE_NAMES` list and its helper are gone, and T-85-30 (an unlisted `store_cache/<name>` frame is refused `not-owned`, no file) still holds.

## What was done

**Task 1 (tracer, TDD)** — `src-tauri/src/store_dispatch.rs`
- RED: rewrote the two list-pinning tests first (`store_frame_every_recognised_cache_name_is_an_owned_table_row`, and `store_frame_owned_row_takes_every_openable_row_and_refuses_every_runtime_name_the_table_does_not_list`); `cargo test -p gamelib-shell store_dispatch::` failed to compile with `E0061: this function takes 2 arguments but 1 argument was supplied` at both one-argument `owned_row` calls.
- GREEN: added `table_row_for_store_key`, made `owned_row(key)` one-argument over it, kept `row_for_store_key`'s runtime shape branch, deleted the constant and helper, updated the worker call site.
- Commit `93a303550` "refactor(quick-261127-vbq): the shell owns a store frame's file only when the store table lists it".

**Task 2** — `storeFrames.ts`, `storeKeys.test.ts`
- `isRustOwnedStoreKey(storeKey)` lost the `recognizedRuntimeCaches` seam; `RECOGNIZED_CACHE_STORE_NAMES` import removed from `storeFrames.ts`; doc comments updated. The T-85-30 case now asserts unlisted runtime names are shape-valid but not owned, `store_cache/umu` is owned, and every recognised name is a table row the sidecar owns (non-empty guard).
- Commit `8327bc074` "refactor(quick-261127-vbq): the sidecar's isRustOwnedStoreKey owns a runtime cache only when the table lists it".

**Task 3** — todo moved to `.planning/todos/completed/` with a dated Resolution; `pnpm planning-gates` 12/12.
- Commit: see Deviations (the move landed inside another executor's commit `abeb61549`).

## Measured gates

- `cargo test -p gamelib-shell`: 1040 passed, 0 failed, 2 ignored; 25 `store_dispatch::tests` ok; 0 compiler warnings pointing into `store_dispatch.rs`.
- `grep -c -E 'RUNTIME_CACHE_NAMES|runtime_cache_recognised' src-tauri/src/store_dispatch.rs`: 13 -> 0.
- rustfmt: no `Diff in` for `store_dispatch.rs` (`ipc_contract.rs` pre-existing diffs untouched, not staged).
- Jest (paths before `--selectProjects Backend`): 20 suites passed, 688 tests passed (same as HEAD baseline).
- `pnpm -s codecheck` exit 0; scoped eslint and `prettier --check` clean on the two TS paths.
- Baselines after: `recognizedRuntimeCaches` in storeFrames.ts 3 -> 0; non-comment `RECOGNIZED_CACHE_STORE_NAMES` in storeFrames.ts 2 -> 0; two-argument `isRustOwnedStoreKey` calls in the test 3 -> 0.
- `pnpm planning-gates`: 12/12.
- `graphify update .` ran successfully.

## Deviations from Plan

**1. [Process - shared index] Task 3's todo move was committed inside another executor's commit**
- **Found during:** Task 3 commit.
- **Issue:** I staged the `git mv` plus the edited completed todo, but a concurrent 88.2-26 executor on the same working tree committed first and its commit `abeb61549` ("test(88.2-26): a cancel is answered while a kill holds the game handle ...") swept in my two staged paths (verified: `abeb61549` contains `A completed/2026-11-22-runtime-cache-names-allow-list-owns-nothing.md` and `D pending/...`). My own `git commit` then reported nothing to commit.
- **Fix:** none needed for content (the move and Resolution are in HEAD, pending copy absent). History was not rewritten since the commit is shared with another plan. The dedicated `docs(quick-261127-vbq): close the runtime-cache allow-list todo` commit therefore does not exist; the orchestrator may note this.
- **Consequence for measured counts:** `plan_head_before..HEAD` reports 4 commits because it also includes two 88.2-26 commits (`1f8ac97a4`, `abeb61549`); `actuals.commits: 3` is this plan's own work (2 own commits + the todo move inside `abeb61549`).

Otherwise: plan executed as written. The plan's line numbers were from `aaf7eed2e`; HEAD had moved one docs commit and edits applied cleanly.

## Known Stubs

None.

## Threat Flags

None. The change only narrows what the shell treats as owned (T-quick-261127-vbq-01 mitigated by `owned_row` using the table-only lookup; checked by the rewritten unit test and the unchanged end-to-end `not-owned` tests).

## Self-Check: PASSED

- store_dispatch.rs, storeFrames.ts, storeKeys.test.ts, completed todo: present.
- Commits 93a303550, 8327bc074, abeb61549 are ancestors of HEAD.
- Verified by tests, not a live app run.
