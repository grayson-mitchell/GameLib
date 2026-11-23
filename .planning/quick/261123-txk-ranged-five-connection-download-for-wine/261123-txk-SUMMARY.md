---
phase: quick-261123-txk
plan: 01
subsystem: engine-fetch
tags: [rust, reqwest, ranged-download, easydl, goldens, wine-manager]
requires:
  - phase: 87-engine-wine-and-tools
    provides: the shared Fetch::download seam, Replay goldens, wine-manager goldens
provides:
  - ranged five-connection download in Fetch::download (EasyDl's ranges, single-stream fallback)
  - Replay range-pinned matching
  - install-ranged-checksum-match / -mismatch wine-manager goldens
  - four ranged fetch_selftest goldens and real-socket ranged tests
affects: [87-47 fallback engine download, 87-48]
actuals:
  tokens: 26000
  tasks: 3
  commits: 3
plan_head_before: 25682b1c5542f6109b0f9e6f64d26d7790e91d86
plan_head_after: a1c5f9a21612a060ec6effa2d07988a226fbb427
tech-stack:
  added: []
  patterns:
    - "one shared engine (OpenGet + download_ranged) behind both ReqwestFetch and Replay, so goldens run the code the app runs"
    - "range futures polled by the download's own future through buffer_unordered, never spawned (D-17)"
key-files:
  created:
    - src-tauri/crates/gamelib-wine/tests/fixtures/recorded/wine_manager/install-ranged-checksum-match/
    - src-tauri/crates/gamelib-wine/tests/fixtures/recorded/wine_manager/install-ranged-checksum-mismatch/
    - src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_manager/expected/install-ranged-checksum-match/
    - src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_manager/expected/install-ranged-checksum-mismatch/
    - src-tauri/crates/gamelib-engine/tests/fixtures/recorded/fetch_selftest/download-ranged/
    - src-tauri/crates/gamelib-engine/tests/fixtures/recorded/fetch_selftest/download-ranged-ignored/
    - src-tauri/crates/gamelib-engine/tests/fixtures/recorded/fetch_selftest/download-ranged-no-length/
    - src-tauri/crates/gamelib-engine/tests/fixtures/recorded/fetch_selftest/download-ranged-bad-probe/
  modified:
    - src-tauri/crates/gamelib-engine/src/fetch.rs
    - src-tauri/crates/gamelib-engine/tests/fetch_replay.rs
    - src-tauri/crates/gamelib-wine/tests/golden_wine_manager.rs
    - src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_manager/cases.json
    - src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_manager/MANIFEST.json
    - .planning/todos/completed/2026-11-23-fallback-and-wine-downloads-are-single-stream.md
    - .planning/phases/87-engine-wine-and-tools/87-48-PLAN.md
key-decisions:
  - "Ranged GETs go to the request's own URL (not the post-redirect URL EasyDl used), so each follows a signed redirect itself"
  - "Fallback signal is a crate-private RangeStop enum; FetchError gains no variant"
  - "sha256 for a ranged download is computed by reading the joined .part back in 1 MiB blocks"
requirements-completed: ["quick:261123-txk", "todo:2026-11-23-fallback-and-wine-downloads-are-single-stream"]
status: complete
---

# Phase quick-261123-txk Plan 01: Ranged five-connection download for Wine Summary

Fetch::download now downloads a HEAD-advertised (Accept-Ranges: bytes plus a length) archive in EasyDl's ranges over at most five concurrent ranged GETs, joined in `<dest>.part`, with the single stream kept as the fallback and every existing golden untouched.

## What was built

- **Task 1 (tracer), commit 7eeab7e9d.** `fetch.rs`: `DOWNLOAD_CONNECTIONS` (5), `RANGE_CHUNK_MAX` (10 MiB), `plan_ranges` (EasyDl `_calcRanges`), the crate-private `OpenGet` opener trait implemented by `ReqwestFetch` and `Replay`, and one `download_ranged` engine: probe the first range, create and pre-size `.part`, fetch every range through `buffer_unordered(5)` (each range writes at its offset; every open and chunk read is cancel-first and bounded by `DOWNLOAD_IDLE_LIMIT`; each 206 is checked against the requested range and the HEAD length), then sha256 the joined file, report 100% and rename. `Replay` pins `range` (`PINNED_HEADERS` now 10) and matches parallel GETs by it. Two wine-manager goldens (`install-ranged-checksum-match`, `-mismatch`) with a guard test; `FLOOR` 19 to 21, install-case guard 12 to 14, MANIFEST 21.
- **Task 2, commit 8f7700a7f.** Four ranged `fetch_selftest` Replay cases (reverse-order ranges, ignored probe, no length, bad probe), cancel and progress tests, and a configurable local range server proving the redirect (each range keeps its `Range` across a 302), the concurrency bound (2 to 5), both 200 fallbacks and a failed range (`Status(500)`, directory empty).
- **Task 3, commit a1c5f9a21.** The todo moved to `completed/` with a Resolution; 87-48-PLAN.md no longer plans a todo edit (plan-structure valid, 2 tasks).

## Verification (all run in this tree)

- `cargo test -p gamelib-engine --features testing`: lib 57 (8 in `fetch::`), fetch_replay 24, golden_config 7, twin_vectors 3. All pass.
- `cargo test -p gamelib-wine --features testing`: lib 113, dxvk_incidents 39, golden_discovery 11, golden_dxvk 6, golden_runtimes 5, golden_wine_core 18, golden_wine_manager 8. All pass. fetch_replay run six times in a row, 24 passed each time (the socket tests are not flaky).
- clippy `-D warnings` clean on both crates; `cargo fmt --check` exit 0; `engineWineFixtureRedaction` jest 10 passed; `pnpm planning-gates` 12/12; no `tokio::spawn` in fetch.rs outside comments.
- Mutation checks: making Replay ignore `accept-ranges` fails `every_install_case_matches...` with `unconsumed recorded exchange(s): ex-3 ... ex-12`, so the ranged wine goldens do exercise the ranged path.
- RED for Task 2: with `200 => Network` temporarily substituted in `open_range`, exactly three tests failed: `a_probe_answered_200_is_streamed_as_the_whole_file_with_no_further_request`, `a_server_that_answers_every_range_200_gets_one_get`, `a_200_to_a_later_range_restarts_as_one_plain_get` (21 passed, 3 failed). Restored before the commit.

## Deviations from Plan

**1. [Process] The 200 fallbacks landed in the Task 1 commit, not Task 2.**
- **Found during:** Task 1. The engine was written whole (the `Opening`/`RangeStop` shapes cannot be stripped without leaving dead-code warnings, which fail the Task 1 clippy gate).
- **Fix:** Task 2's RED was produced by temporarily turning a 200 into `Network` (the plan's described Task 1 behaviour) and running the new tests; the three expected tests failed. `fetch.rs` has no change in the Task 2 commit.
- **Files modified:** none beyond the plan. **Commits:** 7eeab7e9d, 8f7700a7f.

No other deviations. No auth gates. Plan-level threat mitigations T-261123-txk-01 to 06 are implemented as written (Content-Range and total check, no spawn, cancel and idle bounds, no new FetchError variant, exact-path staging).

## Known Stubs

None.

## Notes

- The pre-existing dirty files in the tree (`.planning/state.json`, spike logs, two completed todos, `meta/i18nGateScope.json`, `meta/i18nForkTouchedFiles.json`, `meta/__tests__/genI18nGateScope.test.ts`, the repo-root `.dxvk-cache`) were not touched or committed; the `meta/` changes appeared during the run and are not this plan's.
- `graphify update .` was run after the code change (output gitignored).
- The ranged path against a real GitHub-hosted archive is first exercised live by the Phase 87 gate's wine-manager download (D-11 item 4) and Phase 99 (D-13).

## Self-Check: PASSED

All three commits are ancestors of HEAD; fetch.rs, fetch_replay.rs, the ranged wine exchanges.json and the completed todo exist.
