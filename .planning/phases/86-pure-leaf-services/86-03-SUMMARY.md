---
phase: 86-pure-leaf-services
plan: 03
subsystem: rust-services
tags: [gamelib-info, gamelib-info-cli, cache-view, reqwest, replay, shutdown, d-02, d-18, d-20]

requires:
  - phase: 85-store-host-config-and-versioned-migrations
    provides: the shipped StoreHost (open_cache, Store get/set/remove/apply/snapshot/read_only, Origin) that CacheView reads and writes through
  - phase: 86-pure-leaf-services
    provides: the D-29 host API table (86-01) and the live gate contract (86-02)
provides:
  - "crate gamelib-info: InfoCtx, sorted OPS, dispatch and dispatch_sync, and `guarded`, the op wrapper (Shutdown registrant, token race, panic catch)"
  - "cache_view: the TS CacheStore over the StoreHost (CacheView get/get_opt/set/delete/clear/has/entries, five store constants, js_date_string, parse_js_date)"
  - "http: the Http trait, Request/Response/HttpError, ReqwestHttp, axios_query, and Replay (feature testing) which pins each request to its recorded twin"
  - "secrets: SecretSource, Slot, EnvSecretSource, MemorySecretSource (feature testing)"
  - "crate gamelib-info-cli: ops, cache-get, op <name> <json-args> --user-data [--replay]"
  - "both crates registered in the workspace, the shell's path dependencies, CI, the lockfile pin test and the crates README"
affects: [86-04, 86-06, 86-08, 86-10, 86-12, 86-14, 86-15, 86-16, 86-18, 86-19, 86-20, 86-21, 86-22]

actuals:
  tokens: 31000
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Every dispatched op runs inside `guarded`: Shutdown::register(\"info\") for its lifetime, a biased select against the shutdown token, a hand-written catch_unwind future so no futures crate is needed"
    - "Query strings are built by axios_query and passed in the URL; reqwest's `query` feature stays off"
    - "Replay is the one place a recorded TS request is compared to a Rust request: method, scheme+host+path, decoded query pairs in order, body and nine pinned headers, in both directions; the first failure is sticky and finish() reports it"
    - "A secret never enters an error or Debug string: HttpError carries no URL, Request's Debug drops query, headers and body, Replay hides key-like query values and secret headers"

key-files:
  created:
    - src-tauri/crates/gamelib-info/Cargo.toml
    - src-tauri/crates/gamelib-info/src/lib.rs
    - src-tauri/crates/gamelib-info/src/ctx.rs
    - src-tauri/crates/gamelib-info/src/cache_view.rs
    - src-tauri/crates/gamelib-info/src/http.rs
    - src-tauri/crates/gamelib-info/src/secrets.rs
    - src-tauri/crates/gamelib-info/tests/cache_view.rs
    - src-tauri/crates/gamelib-info/tests/http_replay.rs
    - src-tauri/crates/gamelib-info-cli/Cargo.toml
    - src-tauri/crates/gamelib-info-cli/src/main.rs
    - src-tauri/crates/gamelib-info-cli/tests/cli.rs
    - .planning/todos/pending/2026-11-22-rust-cache-timestamps-utc-date-form.md
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - .github/workflows/rust-test.yml
    - meta/__tests__/rustTestWorkflow.test.ts
    - src/backend/__tests__/cargoFeatures.test.ts
    - src-tauri/crates/README.md

key-decisions:
  - "CacheView follows the TS source where the plan's behavior line disagrees: an expired entry whose invalidate check says no (CrossOver index, ITAD, umu with a truthy value) is returned and kept, not answered as the fallback"
  - "The crate-owned runtime for dispatch_sync is multi-thread with two workers (gamelib-steamcm's), not current-thread: the shell calls in from several plain worker threads"
  - "Replay's exchange format is the array 86-04's recorder writes, with a per-exchange `tsOnly` flag plus a `with_ts_only(ids)` builder for a case that lists them; a tsOnly exchange is still served if Rust requests it"
  - "SVC-01 is not marked complete: it is the whole phase's requirement and 23 plans follow"

patterns-established:
  - "Rust cache stores are opened with CacheView::open(host, user_data, params, clock): the host dedups by path, so a test's own handle on the same file sees every write"
  - "A new crate follows the 85-06 registration checklist: workspace members, the shell path dependency, rust-test.yml step name and -p list, a rustTestWorkflow case with an omission mutation, EXPECTED_LOCKFILE_CRATE_NAMES, the README"

requirements-completed: []

plan_head_before: dcd27a981456633005f164a2c09aade8af38b60a
plan_head_after: 9312891531ca57ed90aa90d4884213d11c95733c

duration: 20min
completed: 2026-11-22
status: complete
---

# Phase 86 Plan 03: gamelib-info and gamelib-info-cli Summary

**The leaf services' three shared seams now exist in one Tauri-free crate: the TS `CacheStore` over the Phase 85 StoreHost, an `Http` trait with a reqwest client and a request-pinning `Replay`, and an op wrapper that holds a shutdown registrant around every op. A CLI reads a real operator cache entry through them.**

## Performance

- **Duration:** about 20 min
- **Completed:** 2026-11-22
- **Tasks:** 3 of 3 (1 tracer, 2 TDD)
- **Files:** 18 changed (12 created)

## Accomplishments

- **Tracer (Task 1).** Both crates scaffolded and registered. `gamelib-info-cli cache-get` reads the operator's real `wikigameinfo` entry through `CacheView` and the StoreHost, and answers `fallback` once the entry is past its 30-day lifespan (and deletes both keys, as TS does). The tracer gate (re-run the whole verify block) passed before Task 2 began. `cargo tree` shows 0 `keyring` and 0 `tauri` in either crate, and the reqwest `query` feature is off.
- **CacheView (Task 2).** `set` is two dot-path writes (`key`, `__timestamp.<key>`), so `S.T.A.L.K.E.R.` nests (ending in an empty-string segment, as dot-prop does) and the timestamps share one `__timestamp` object. The integer-like key `480` lands in JS order and produces bytes identical to the 85 golden `cache-ops-dotpath-intkey` (apart from that golden's numeric timestamp). Timestamps are written as the UTC `Date()` form and read from that form, the local long form with any parenthetical (the operator's real `GMT+1300 (New Zealand Daylight Time)` entries parse) and ISO 8601. 20 integration tests plus 5 unit tests; every `cache.test.ts` case has a counterpart except the in-memory `use_in_memory`/`commit` path (not used by any of the five stores).
- **HTTP seam, secrets and wrapper (Task 3).** `axios_query` matches the plan's vector and `encodeURIComponent` for the rest. `ReqwestHttp` was exercised against a local server: per-request timeout, five redirects then an error (six connections), body cap by `Content-Length` and while streaming, and no URL or `key=` in any error or `Debug`. `Replay` fails naming the request on a differing path, decoded query pair, body or pinned header, passes on an `Accept-Encoding` difference, matches paginated exchanges in any order, and `finish()` fails on an unconsumed exchange unless it is `tsOnly`. `guarded` answers `<op>:shutdown` (and releases its registrant: `Shutdown::drain` returns no names), `<op>:panic`, and does not start work once shutdown has begun. The CLI gained `op <name> <json-args> --user-data [--replay]`. 26 tests, run 7 times with no flake.

## Task Commits

1. **Task 1 (tracer): scaffold, register, read one real entry** - `4e0e7bf9b` (feat)
2. **Task 2 RED: failing CacheView write tests** - `604adebf8` (test)
3. **Task 2 GREEN: CacheView writes, UTC `Date()`, quirk todo** - `ab08d08b3` (feat)
4. **Task 3 RED: failing HTTP, Replay, secrets and wrapper tests** - `0a25f68e8` (test)
5. **Task 3 GREEN: Http, ReqwestHttp, axios_query, Replay, guarded, CLI `op`** - `931289153` (feat)

**Plan metadata:** the SUMMARY commit follows this file.

## TDD Gate Compliance

Task-level `tdd="true"` (the plan is `type: execute`, so the plan-level classifier gate does not apply). RED commits hold the real API surface with inert stubs, so each target test failed on an assertion for the missing behavior, never on a compile or fixture error: Task 2 RED had 14 of 20 failing, Task 3 RED 18 of 26. `cargo test` prints libtest text, which `gsd_run check tdd-red-evidence` has no adapter for, so no machine-classified record was produced; the semantic assessment is that each failure was the target assertion (for example `value_is_written` saw `None` for `foo`, the shutdown test ran 30 s to its sleep instead of answering `shutdown`). Several tests passed vacuously against the stubs (an absent key reads as the fallback) and are meaningful only after GREEN; they are not counted as RED evidence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in the plan's spec] An expired entry kept by the invalidate check is returned, not answered as the fallback**
- **Found during:** Task 1 (reading `cache.ts`) and Task 2 behavior list
- **Issue:** The plan's behavior lines say `Never` "keeps both and returns the fallback" and umu's `WhenFalsy` "keeps an expired truthy value (returns fallback, keys stay)". `CacheStore.get` does `if (expired && invalidateCheck(value)) { delete; return fallback }` and otherwise falls through to `return this.current_store.get(key)`, so TS returns the stale value. That is also the point of `() => false` on the CrossOver index and ITAD caches (serve stale when offline). A port that returned the fallback would have made 86-18/19/20 diverge from their goldens.
- **Fix:** `CacheView::get_opt` returns `Some(value)` and keeps both keys when the check says no. Tests `never_keeps_an_expired_value_and_still_serves_it` and `when_falsy_keeps_an_expired_truthy_value_and_deletes_a_falsy_one` pin it.
- **Files modified:** `src-tauri/crates/gamelib-info/src/cache_view.rs`, `tests/cache_view.rs`
- **Commit:** `4e0e7bf9b`, `ab08d08b3`

**2. [Rule 2 - Correctness] The sync runtime is multi-thread, not current-thread**
- **Found during:** Task 1 (`dispatch_sync`)
- **Issue:** The plan says a lazily built crate-owned current-thread runtime, "the steamcm sync facade pattern". The steamcm facade actually uses `new_multi_thread().worker_threads(2)`, and the shell calls `dispatch_sync` from several plain worker threads; concurrent `block_on` on one current-thread runtime stalls all but one caller.
- **Fix:** Two-worker multi-thread runtime, named `info`; tokio feature `rt-multi-thread` instead of `rt`.
- **Files modified:** `src-tauri/crates/gamelib-info/Cargo.toml`, `src/lib.rs`
- **Commit:** `4e0e7bf9b`

**3. [Rule 3 - Blocking] MSRV 1.77.2 rejected `str::split_at_checked` (stable 1.80)**
- **Found during:** Task 1 clippy
- **Fix:** `strip_prefix('+')` / `strip_prefix('-')` in `parse_gmt_offset`.
- **Commit:** `4e0e7bf9b`

### Additions beyond the plan's named surface (needed by the behavior it asks for)

- `Request.max_body` (default 16 MiB) and `Method`, `HttpFuture`, `Request` builder methods: the plan asks for a per-call body cap but its `Request` field list had no place for it.
- `CacheView::get_opt`, `entries`: `get_opt` is the TS `get(key)` without a fallback; `entries` is the `cache.test.ts` timestamp-exclusion case.
- `InfoCtx::new(...)` and `InfoCtx::secret(op, slot)` (answers `<op>:no-secret-source`): later plans add context fields, so construction goes through one function.
- `EnvSecretSource` is not feature-gated (it reads only the two variable names its caller passes; the library reads no environment variable of its own). `MemorySecretSource` is behind `testing`.
- `guarded` is `pub`, so slice crates' tests and `tests/http_replay.rs` can drive it directly while `OPS` is still empty.

### Host drift (D-29)

Re-checked the host symbols this plan uses against the current tree. Names and signatures are unchanged (`open_cache`, `Store::get/set/remove/apply/snapshot/read_only`, `Origin::Rust`, `Op::Clear`); only line numbers moved after the Phase 85 review fixes: `StoreHost` host.rs:555 to 598, `open_cache` 678 to 721, `Store::read_only` 421 to 426, `store_boot::host()` store_boot.rs:242 to 280. `86-VALIDATION.md` is not in this plan's `files_modified`, so the table rows are left as they are; the later plans that cite file:line should use the current ones.

## Issues Encountered

- `cargo clippy --workspace --all-targets -- -D warnings` fails inside the shell crate's own test target (19 non-snake-case test names). Not touched by this plan; `-p gamelib-info -p gamelib-info-cli` is clean with and without `--features testing`. Recorded here as a foreign failure, not fixed.

## Known Stubs

None. `OPS` is empty by design (each slice adds its ops); `route` answers `unknown op` until they do.

## Threat Flags

None. The new surface is network egress through `ReqwestHttp`, already covered by the plan's threat model (T-86-04 to T-86-07). Mitigations as built: errors carry no URL and are scrubbed of a stray URL or query copy (T-86-04), 16 MiB default cap with per-call caps and a streaming check (T-86-05), `Policy::limited(5)` (T-86-06), registrant plus token race per op (T-86-07).

## Next Phase Readiness

- Slices can add ops to `OPS`/`route`, open their caches with `CacheView::open`, build queries with `axios_query` and test against `Replay::from_case` (86-04's `exchanges.json` format, `tsOnly` honoured).
- The shell does not call into the crate yet: `gamelib-info` is a path dependency only. 86-08 builds the `InfoCtx` at `run_setup` and `info_dispatch`.
- The ITAD and SteamGridDB keys have no source in the shell until 86-14 (`secrets: None`, ops answer `<op>:no-secret-source`).

## Self-Check: PASSED

- Files: all 12 created files present (`gamelib-info` src and tests, `gamelib-info-cli` src and tests, both Cargo.toml files, the quirk todo).
- Commits: `4e0e7bf9b`, `604adebf8`, `ab08d08b3`, `0a25f68e8`, `931289153` are ancestors of HEAD.
- Verify: `cargo test -p gamelib-info -p gamelib-info-cli` (with and without `testing`), clippy `-D warnings`, `cargo fmt --check`, `cargo tree` keyring 0/0 and tauri 0, reqwest `query` feature 0, jest `rustTestWorkflow` and `cargoFeatures` (41 passed), prettier check over the four TS/YAML/Markdown paths, `pnpm planning-gates` (12/12), `pnpm codecheck` exit 0.
