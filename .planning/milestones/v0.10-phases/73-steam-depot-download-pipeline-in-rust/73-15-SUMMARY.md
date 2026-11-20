---
phase: 73-steam-depot-download-pipeline-in-rust
plan: 15
subsystem: tooling
tags: [steam-depot, rust, cli, parity-sweep, tier2, fake-home]
requires: [73-10, 73-13]
provides:
  - gamelib-depot-cli run | verify | summarize streaming modes (NDJSON events + one final {ok,result} line)
  - meta/gamelibDepotCli.ts fake-HOME spawn helper (runDepotCli, DEPOT_CLI_BUILD_COMMAND)
  - meta/depotParitySweep.ts Tier 2 tree differ, outcome-status differ, codec coverage, perf summary
  - package scripts depot-cli:build, depot-parity-sweep
affects: [73-16]
key-files:
  created:
    - src-tauri/crates/gamelib-depot-cli/tests/cli.rs
    - meta/gamelibDepotCli.ts
    - meta/depotParitySweep.ts
    - meta/__tests__/gamelibDepotCli.test.ts
    - meta/__tests__/depotParitySweep.test.ts
  modified:
    - src-tauri/crates/gamelib-depot-cli/src/main.rs
    - src-tauri/crates/gamelib-depot-cli/Cargo.toml
    - src-tauri/Cargo.lock
    - package.json
key-decisions:
  - "CLI stdin envelope: run/verify read {job, tokens?}, summarize reads {request, tokens?}; tokens is host -> token and is never echoed. Bad JSON or a dispatch Err prints {ok:false,error} and exits 2; unknown flag exits 64"
  - "verify forces mode verify_only by rewriting the job's mode before dispatch, so the same depot_job_run path (and panic guard) is used"
  - "Sweep compares outcome, not only bytes: the Rust status from the [depot-rust] outcome log line vs a TS status (default completed), plus optional per-depot status maps. This is what surfaces the open EResult-40 divergence (TS skips, Rust manifest_unavailable) even when the install trees look identical"
  - "Sweep exit 3 also covers an unreadable outcome log; a title with no Rust outcome line is a divergence (exit 1), so coverage cannot pass vacuously"
  - "depot-parity-sweep script carries a pnpm depot-cli:build prefix (key_link), though the sweep itself does not spawn the CLI"
requirements-completed: [P73-A, P73-G, D-14, D-17]
duration: 45min
completed: 2026-11-09
---

# Phase 73 Plan 15: Headless depot CLI and Tier 2 parity sweep Summary

The depot CLI now streams `run`, `verify` and `summarize` jobs headlessly, meta/ reaches it only through a fresh fake-HOME profile per spawn, and a redacted Tier 2 sweep diffs TS-installed against Rust-installed trees (bytes, modes, BSD flags, ACF, outcome status) with codec coverage and a throughput/RSS summary.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 | a30183790, 98b543e99 | CLI modes, `tests/cli.rs` (7 tests), `meta/gamelibDepotCli.ts`, `depot-cli:build`; follow-up fixes the helper's reject-with-Error lint |
| 2 | 2e74aeb8d | `meta/depotParitySweep.ts`, 19 sweep tests, `depot-parity-sweep` script |

## Verification

- `cargo test -p gamelib-depot-cli`: 7 pass (event/final-line shape, verify override fetches nothing, summarize single line, token reaches the CDN and is never echoed, bad stdin -> ok:false exit 2, unknown flag exit 64, `--list`).
- `cargo +1.99.1 clippy -p gamelib-depot-cli --all-targets -- -D warnings` clean; cargo fmt clean.
- jest: `gamelibDepotCli.test.ts` (7), `depotParitySweep.test.ts`, and `fakeHomeIsolation.test.ts` pass with the new spawn sites. prettier, eslint and `tsc --noEmit` clean.
- Smoke: the bundled sweep (`meta/runTs.cjs`) ran on a clean pair and exited 0.
- Acceptance greps: `createFakeHomeProfile` present in both helpers, no `env: {` literal in the CLI helper, no `std::env::var` in the CLI.

## Parity sweep and the EResult-40 divergence

Plans 73-13/73-14 left a divergence open: a manifest-level EResult-40 refusal is skipped on the TS path but surfaces as `manifest_unavailable` on Rust. A tree-only differ can miss this because both sides may leave identical files. The sweep therefore also reports, per title, `status ts=<x> rust=<y>` (Rust status from the log line, TS status from the input, default `completed`) and, when both per-depot maps are supplied, `depot <id> ts=<s> rust=<s>` lines. Exit 1 on any of these. A test (`identical trees but a Rust manifest_unavailable status is surfaced`) pins this. The operator in 73-16 must supply `tsStatus` and the per-depot maps to get depot-level resolution; without them only overall status is compared.

## Deviations from Plan

**1. [Rule 3 - Blocking] CLI test dev-dependencies.** The `tests/cli.rs` reuses the gamelib-depot fixture builder and fake CDN via `#[path]`, so the CLI crate gained dev-dependencies (aes, cbc, flate2, prost, sha1, zstd, tokio). Cargo.lock updated. No runtime dependency change.

**2. [Rule 1 - Bug] Reject non-Error.** First commit had `reject(e)` flagged by eslint `prefer-promise-reject-errors`; fixed in 98b543e99 (my chain let the commit run before the lint failure was handled).

**3. Sweep script prefix.** Plan's script text had no `pnpm depot-cli:build &&`, but its key_links require it; the prefix is included.

**4. Sweep flag reader.** Uses `stat -f %f` (one number per line, input order preserved) rather than `%f %N`, avoiding name parsing for paths with unusual characters.

## Known Stubs

None.

## Threat Flags

None. T-73-57 (fresh fake HOME per spawn; gate passes), T-73-58 (hash + basename, final scrub of roots/home/username/tokens), T-73-59 (tokens never echoed; test asserts), T-73-60 (zero inputs exit 3, codec coverage and missing outcome line fail) are in place.

## Self-Check: PASSED

- FOUND: tests/cli.rs, meta/gamelibDepotCli.ts, meta/depotParitySweep.ts, both test files
- FOUND commits: a30183790, 98b543e99, 2e74aeb8d
