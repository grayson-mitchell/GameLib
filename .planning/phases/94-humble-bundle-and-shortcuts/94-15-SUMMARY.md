---
phase: 94-humble-bundle-and-shortcuts
plan: 15
subsystem: backend
tags: [rust, humble, http-seam, replay, redirects, multipart, app-id-resolver, shutdown, title-match, dedup, d-06, d-19, d-20, d-21]
status: complete

requires:
  - phase: 94-humble-bundle-and-shortcuts
    provides: 94-06 wire recorder (exchanges.json), the dedup goldens and the shared titleMatchVectors.json; 94-09 the app_id_resolver goldens and their recordings; 94-12 the classifier (HumbleKey, LocalZone); 94-13 the Humble context and the StoreHost reads
provides:
  - gamelib_humble::http::{Http, Request, MultipartValue, Response, HttpError, ReqwestHttp, NoHttp, Replay, PINNED_HEADERS, TRANSPORT_HEADERS, axios_query, install_crypto_provider}
  - gamelib_humble::app_id_resolver::{resolve_pass, ResolveOutcome, lookup_cached, normalize_for_app_id_match, search_term_for, pick_confident_app_id, search_request, parse_search_answer}
  - gamelib_humble::title_match::{normalize_title, title_similarity, fuzzy_match, is_dlc_false_positive_risk, is_remaster_false_positive_risk, HUMBLE_FUZZY_MATCH_THRESHOLD}
  - gamelib_humble::dedup::{recompute_ownership, SteamGame} (and the matcher re-exports)
  - gamelib_humble::stores::{AppIdEntry, app_id_entry, put_app_id_entry, js_date_string}
  - gamelib_humble::ctx::{HostZone, UtcZone}, HumbleCtx.{http, zone}, HumbleCtx::{with_zone, local_zone_at}
  - tests/golden_app_id_resolver.rs (11 resolver goldens, the D-21 shutdown tests, the pending real-capture check), tests/vectors_dedup.rs (61 dedup goldens)
affects: [94-16, 94-17, 94-19, 94-23, 94-29]

requirements-completed: []

actuals:
  tokens: 46500
  tasks: 2
  commits: 3

plan_head_before: 8393e2116d81bb521bb634bf26a75ce1913eadaf
plan_head_after: 870168f14b05cbdfaa53d5abaad1d89e3b253b96

tech-stack:
  added: []
  patterns:
    - "an HTTP replay pins the TS wire recording, not the Rust one: the recorder's exchanges.json is read as-is, a value the recorder redacted (REDACTED) matches any non-empty live value around fixed text, a failure names what differs and never a cookie, a referer, a body or a gamekey path segment"
    - "a timed async pass is replayed on tokio's paused clock with a Clock that reads Instant::elapsed, so the 350 ms gaps are instant, countable, and move checkedAt exactly as the TS fake timers did"
    - "a shutdown-aware pass registers once, and every await (the gap and the request in flight) races the token with biased select, so a cancel is seen before the next unit of work and exit never waits on the 8 s request timeout"
    - "a golden whose provenance is a later plan is an #[ignore = pending] test plus a guard that fails once the data exists while the ignore is still on (the 94-14 pattern)"

key-files:
  created:
    - src-tauri/crates/gamelib-humble/src/http.rs
    - src-tauri/crates/gamelib-humble/src/http/replay.rs
    - src-tauri/crates/gamelib-humble/src/app_id_resolver.rs
    - src-tauri/crates/gamelib-humble/src/title_match.rs
    - src-tauri/crates/gamelib-humble/src/dedup.rs
    - src-tauri/crates/gamelib-humble/tests/golden_app_id_resolver.rs
    - src-tauri/crates/gamelib-humble/tests/vectors_dedup.rs
  modified:
    - src-tauri/crates/gamelib-humble/src/{lib,ctx,stores}.rs
    - src-tauri/crates/gamelib-humble/{Cargo.toml,tests/golden_reads.rs}
    - src-tauri/src/humble_dispatch.rs
    - src-tauri/Cargo.lock
    - .planning/todos/pending/2026-11-24-humble-classifier-local-time-needs-a-host-zone-in-rust.md

key-decisions:
  - "Host zone: HumbleCtx carries a HostZone seam (the UTC offset in force at an instant) and local_zone_at(utc_ms) -> LocalZone. The shell implements it over the system zone the log writer already uses (gamelib_log::SystemTz, jiff), so daylight saving is the host's own. The library port passes ctx.local_zone_at(now): exact for a host without daylight saving and for dates on the sync's side of a change; a zone-less or date-only expiry across a change is one hour off (the TS used the offset of the expiry's own date). The exact form needs classify to take a zone lookup, a 94-12 API change, and stays in the todo; the seam already answers 'the offset at this instant'."
  - "Fuzzy match: the ratio is 1.0 - d as f64 / max_len as f64 over the ASCII-normalised titles, compared with >=. Three shared vectors sit at exactly 0.85 and all match; a test proves a strict > flips them, so the vectors, not the code, pin the comparison. The two guards measure raw length in UTF-16 code units with the first argument kept as the shorter on a tie (the TS tie-break, asymmetric on purpose)."
  - "Redirects: no Humble request follows one (Request::follow_redirects is false by default; ReqwestHttp keeps a Policy::none() client and a Policy::limited(5) client). The Steam store search opts in, as axios did: it carries no cookie or credential and the plan's prohibition is about Humble requests."
  - "Request pinning compares the decoded query pairs, not the raw target: the url crate percent-encodes an apostrophe (%27) where axios sent it literally (a test pins the difference), and a server decodes both alike."
  - "A pass races the shutdown token on the request in flight as well as on the gaps (the plan named only the gaps): a request is allowed 8 s and the whole exit budget is 5 s."
  - "The cache entry's __timestamp is written as the UTC form of Date() (the same stamp the engine and info crates write); the TS wrote the local form. Both parse to the same instant, which is all a reader uses."

patterns-established:
  - "HumbleCtx::new takes the HTTP client as its sixth argument; a test passes NoHttp (every request answers a transport error) or a Replay"

requirements: [SVC-04]
duration: 150min
completed: 2026-11-24
---

# Phase 94 Plan 15: Humble HTTP seam, app-id resolver, title match and dedup Summary

**The Humble crate has a no-redirect, multipart-capable HTTP seam whose replay pins requests to the TypeScript's wire recordings, and the Steam app-id resolver (under the shutdown contract), the fuzzy title match and the ownership dedup run in Rust with parity on every recorded input: 11 resolver goldens, 101 shared title vectors and 61 dedup goldens.**

## What was built

- **Task 1 (tracer): the seam and the resolver.**
  - `http.rs` is gamelib-info's `Http`, `Request`, `Response`, `HttpError`, `ReqwestHttp` and `axios_query`, with three additions. `Request::follow_redirects(bool)` defaults to false and `ReqwestHttp` holds two clients (`Policy::none()` and `Policy::limited(5)`), so a 302 to `auth.humblebundle.com` comes back as a response with its `Location`. `Request::multipart(fields)` writes `multipart/form-data; boundary=` and the fields in the given order, with `MultipartValue::{Text, File}`, CRLF-normalised text, escaped names and a boundary chosen to occur in no field. `NoHttp` is the context for a test that must not reach the network. `HttpError` is copied with `map_error` (no URL, query or body ever reaches `Display`/`Debug`).
  - `http/replay.rs` (`Replay::from_recorded(dir)`) reads the 94-06 recorder's `exchanges.json` and pins method, scheme (https), the recorded `Host`, the path, the decoded query pairs in order, nine headers (`PINNED_HEADERS`, both directions) and the body or the multipart field names, filenames and values in order (the boundary is normalised to `<BOUNDARY>` as the recorder does). `REDACTED` in a recording matches any non-empty live value around fixed text. A failure names what differs and never prints a value; a gamekey path segment prints as `<redacted>`.
  - `app_id_resolver.rs`: `resolve_pass(ctx, titles, is_stale)` holds one `humble-appid` registrant for exactly the pass, runs the 350 ms gaps as `tokio::time::sleep`, caps at 40, applies the 7-day miss TTL and term version 2 against `ctx.clock`, stops at the first error and at a stale fence, and reads and writes `humble_steam_appid` through `stores.rs` (the entry in the TS key order, then the `__timestamp.<key>` stamp). The JS `normalizeForAppIdMatch` is reproduced (NFKD, `\p{M}`, `\p{L}`/`\p{N}`, the Steam-suffix patterns spelled out as ASCII-case-insensitive matchers, JS whitespace) and so is the response shape check (a 200 that is not an object, or has no `items`, is an error and is never cached).
  - `HumbleCtx` gained `http` (a `HumbleCtx::new` argument) and `zone`; the shell passes `ReqwestHttp::new()` (no request, no client built at boot) and a `ShellHostZone` over `gamelib_log::SystemTz`.
- **Task 2: title match and dedup.** `title_match.rs` (`normalize_title`, `title_similarity`, the DLC and remaster guards, `fuzzy_match`) with `\b`, `\s` and `toLowerCase` semantics spelled out; `dedup.rs` (`recompute_ownership` over `HumbleKey` and a two-field `SteamGame`, plus the re-exports) with the 31 tests of `dedup.test.ts` as named tests in modules named after its describes, their Steam library fixtures read from the goldens' inputs; `vectors_dedup.rs` replaying all 61 dedup goldens.

## Evidence

- `golden_app_id_resolver.rs` replays all 11 resolver goldens with the manifest count and floor and a recorded wire case for each: summaries, `lookups` after each run, the request sequence with each request's term, 8 s timeout, `GameLib` user agent and the instant it went out (against the trace), the clock moving by exactly the sum of the trace's sleeps, the log lines, and the exact cache bytes after the case. Coverage floors: at least 50 requests, 40 gaps, 2 cached skips, 3 errors, 5 deferrals and exactly one stale stop. Mutating the gap to 349 ms turned it red with the requests' instants and the clock (then restored).
- D-21: `a_cancelled_token_stops_a_pass_at_the_next_gap` (the second title never requested, `deferred` 2, the clock still 0, the registrant held while the pass runs and released after), `a_pass_after_shutdown_began_starts_nothing`, `shutdown_cancels_a_request_in_flight` (a request that never answers, stopped at 100 ms, not at the 8 s timeout; not counted as an error).
- T-94-27: `a_302_to_the_auth_host_is_a_response_and_one_request_is_made` and `a_request_that_opts_in_follows_a_redirect` over a real loopback server (one request versus two). T-94-28: `an_http_error_holds_no_url_query_or_path`, and the shell test that the context's client answers a connection failure without the URL.
- `title_match` replays all 101 shared vectors (floor 60), asserts matches and non-matches, non-ASCII input and at least three pairs at exactly 0.85 that all match, and proves a strict `>` flips those three. The TS replay of the same file passes. Mutating `>=` to `>` turned the Rust replay red (then restored). `vectors_dedup` replays 61 goldens (7 exact, 17 fuzzy, 45 none verdicts) and discriminates (a recompute that ignores the override disagrees with its golden).
- `cargo test -p gamelib-humble`: 218 unit tests, 5 resolver, 3 golden reads, 1 classify replay and 2 dedup replay passing, 1 `#[ignore]`d (pending, below). `cargo test --bin gamelib-shell humble`: 77 passed. `cargo clippy -p gamelib-humble --all-targets -D warnings` and `cargo fmt -p gamelib-humble --check` clean; the shell has no clippy or rustfmt finding in `humble_dispatch.rs`.
- `pnpm planning-gates` 12/12, `pnpm find-deadcode` PASS (310 baselined), `pnpm check:ipc-contract` up to date, `pnpm codecheck` clean, and the jest suites `testContainment`, `humblePortComplete`, `shortcutsPortComplete`, `infoPortComplete`, `humbleShortcutsShimSchedule`, `titleMatchVectors` and `humbleFixtureRedaction` (309 tests) pass. No TypeScript file was written, so no prettier check was owed; the todo edit is in a prettier-ignored folder.
- Tracer feedback gate (interactive, `end-of-phase`, automated-only `<verify>`): the plan's verify was re-run end to end after the Task 1 commit, passed, and the plan expanded.

## Pending

- `the_real_capture_sends_no_header_the_seam_does_not_pin` (tests/golden_app_id_resolver.rs) is `#[ignore]`d with its reason: plan 94-10 (the live Humble capture and `recorded/real/WIRE_HEADERS.json`) is deferred until after 94-24. Until then the seam is pinned to the 94-06 wire recordings and the 94-08 wire goldens only, and no header value was typed by hand. Once `recorded/real/` exists, the check loads every real `exchanges.json` through `Replay` and fails on any request header the seam neither pins (`PINNED_HEADERS`) nor knowingly leaves to the transport (`TRANSPORT_HEADERS`), and requires the `WIRE_HEADERS.json` to be non-empty with at least four exchanges. Its guard `the_real_capture_check_runs_once_it_is_recorded` prints `PENDING` while absent and fails as soon as the directory exists with the ignore still on. 94-23 should also decide the reqwest compression features and `Accept-Encoding` from `WIRE_HEADERS.json`.
- `.planning/WINDOWS.md` could not take the ledger entry for that ignored test: `gsd-tools windows append` refuses because the ledger's table disagrees with its JSON for id 3 (a defect that predates this plan). Not touched; best-effort by contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The replay's own failure message leaked a gamekey**
- **Found during:** Task 1, the unit test that asserts a multipart-order failure prints no value.
- **Issue:** the request name in a failure was `POST /home/library/<gamekey>`.
- **Fix:** `shown_path` prints the segment after `home/library`, `v1/order` and `v1/orders` as `<redacted>`; the test passes.
- **Files modified:** src-tauri/crates/gamelib-humble/src/http/replay.rs
- **Commit:** 8d4b6b08b

**2. [Rule 3 - Blocking] The resolver needs NFKD and Unicode general categories, which the crate did not declare**
- **Found during:** Task 1 (the plan says no new dependency).
- **Issue:** `normalizeForAppIdMatch` is NFKD, `\p{M}+`, `[^\p{L}\p{N}]+` over the `u` flag; neither `std` nor the crate's `regex` build (no Unicode tables) can express them.
- **Fix:** `unicode-normalization` (already in Cargo.lock and used by gamelib-info and gamelib-safety, so no new package, one new dependency edge for this crate), the `regex` feature `unicode-gencat` (general categories only; `\s`, `\d`, `\w` still fail to compile, preserving the crate's stray-shorthand guard), and `tokio` `test-util` as a dev-dependency (`start_paused`).
- **Files modified:** src-tauri/crates/gamelib-humble/Cargo.toml, src-tauri/Cargo.lock
- **Commit:** 8d4b6b08b

**3. [Rule 3 - Blocking] The plan's Task 2 verify is not valid cargo syntax**
- **Issue:** `cargo test -p gamelib-humble --lib title_match dedup` (two filters) errors with "unexpected argument". Run as two commands (`title_match`: 7 passed, `dedup`: 31 passed); the same command shape had to be split in 94-13.

### Plan text followed differently

- `resolve_pass(ctx, titles)` takes a third argument, `is_stale`, the TS `opts.isStale` (a disconnect or a newer sync must be able to stop a pass), and the request in flight also races the shutdown token (the plan named the gaps).
- The plan listed no change to `stores.rs`, `Cargo.toml`, `golden_reads.rs` or the todo; the cache read/write the plan asks for goes through `stores.rs`, `HumbleCtx::new` gained an argument (so the one other caller, `golden_reads.rs`, changed), and the zone decision is recorded in the todo it came from.
- Files outside `files_modified`: `stores.rs`, `Cargo.toml`, `Cargo.lock`, `tests/golden_reads.rs`, the todo; and one extra commit beyond the two tasks (`870168f14`, a test that pins the `url` crate's apostrophe encoding).

## Findings worth carrying forward

1. **The wire differs from axios in one place the Replay hides on purpose.** reqwest builds the request line from the `url` crate, which percent-encodes `'` in a query (`%27`); axios sent it literally. A server decodes both the same. The Replay compares decoded pairs and `the_url_crate_spells_an_apostrophe_in_the_query_differently_from_axios` pins the difference.
2. **Replay matches the TS recordings' header casing and order loosely on purpose.** Header names compare case-insensitively and order is not pinned (undici writes some names lower case); only the nine pinned headers and their values are.
3. **A cached `appId` of `""` is neither a hit nor a miss** (it is asked again), as in the TS; a stored entry whose shape is wrong reads as absent and is overwritten.
4. **The shell's `cargo clippy -p gamelib-shell --all-targets -D warnings` reports 26 errors on this Windows host, all in files this plan does not touch** (`single_instance.rs`, `wake_lock.rs`, `humble_helpers.rs`, `login_window/*`, `native_gamepad_shape.rs`: dead code and MSRV lints under `cfg(windows)`); none in `humble_dispatch.rs` or any gamelib-humble file. CI lints on ubuntu.

## Known Stubs

None. The ignored real-capture test is a named pending check, not a stub (Pending, above).

## Threat Flags

None beyond the plan's register. The only outbound request added is the Steam store search the TypeScript already made, now with the Humble-style error text (T-94-28) and the shutdown race; the test-only loopback server binds 127.0.0.1 on an ephemeral port and stops at a 20 s deadline.

## Self-Check: PASSED

Every created file exists and each of the three commits (8d4b6b08b, 53b1abca7, 870168f14) is on the branch; `commits:` is the measured `git rev-list --count` from the plan ledger.
