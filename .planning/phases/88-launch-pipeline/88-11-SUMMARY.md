---
phase: 88-launch-pipeline
plan: 11
subsystem: known-fix-network
tags: [knownfix, fetcher, report, relay, post, fetch-seam, golden-replay, svc-03]

requires:
  - phase: 88-launch-pipeline
    plan: 07
    provides: golden/fetcher (38 cases) and golden/report (48 cases) with their deltas.json, recorded/fetcher and recorded/report exchanges, and the report `constants` case
  - phase: 88-launch-pipeline
    plan: 08
    provides: the order-preserving jsvalue.rs, the reader (filter_tier1_known_fixes, read_known_fixes_with_layer) and the strict op-argument pattern
  - phase: 88-launch-pipeline
    plan: 10
    provides: KnownFixCtx (relay_url, app_version, the single-flight tables), the `guarded` op wrapper and the EngineCtx.fetch seam as the one network path
provides:
  - gamelib-knownfix remote.rs (GAMELIB_KNOWN_FIXES_BASE, HEROIC_KNOWN_FIXES_BASE, FEED_REQUEST_TIMEOUT, fetch_remote_known_fixes)
  - gamelib-knownfix report.rs (DetectedFix, ReportKey, ReportOp, Detector, ReportOutcome, KnownFixReport, ReportEnv, CtxReportEnv, relay_url, parse_known_fix_report, report_sent_key, run_known_fix_report, run_known_fix_report_with, report_detected_fix, report_detected_fix_with and the pinned report constants)
  - ctx.rs ReportsInFlight on KnownFixCtx.report_in_flight (one post per appId, key and op)
  - gamelib-engine fetch.rs Method::Post, FetchRequest.body, FetchRequest.follow_redirects, FetchRequest::post, FetchRequest::no_redirects (ReqwestFetch and Replay both serve them)
  - ops knownfix_fetch_remote and knownfix_report_detected
  - tests golden_fetcher.rs (FETCHER_FLOOR 38) and golden_report.rs (REPORT_FLOOR 48)
affects: [88-12, 88-13, 88.1]

actuals:
  tokens: 30605
  tasks: 3
  commits: 5
commits: 5
plan_head_before: d9f29dc53186f40adc72606bfcabe1edbd1a7d35
plan_head_after: 27e96dd2d7a44f6523b2986e45d798f8a813f79b

tech-stack:
  added: []
  patterns:
    - "a recorded exchange the TS spy could not fully see is completed on the replay side, not the golden side: the fetcher goldens recorded no User-Agent (axios' own default is not in the options a spy reads), so the test hands Replay a temp copy of the case with the one header the Rust client sends added, and Replay still pins every other request detail in both directions"
    - "a post that never answers is a tap in front of Replay: the replay still matches the request and consumes its recorded exchange, then the tap holds the answer open, so only the shutdown token (the Rust abort-all) or the 8 s bound ends it"
    - "reportability seams are one small trait (ReportEnv: platform, winning layer, sent record read and write) with a real implementation over KnownFixCtx and a test wrapper that fails one probe, so the `error` outcome is reachable and replayed instead of being dead code"
    - "a Fetch seam grows additively by data, not by trait method: Post rides the existing `get` on `FetchRequest.method`, exactly as Head already did, so no other `impl Fetch` in the workspace changed"

key-files:
  created:
    - src-tauri/crates/gamelib-knownfix/src/remote.rs
    - src-tauri/crates/gamelib-knownfix/src/report.rs
    - src-tauri/crates/gamelib-knownfix/tests/golden_fetcher.rs
    - src-tauri/crates/gamelib-knownfix/tests/golden_report.rs
  modified:
    - src-tauri/crates/gamelib-engine/src/fetch.rs
    - src-tauri/crates/gamelib-knownfix/src/lib.rs
    - src-tauri/crates/gamelib-knownfix/src/ctx.rs
    - src-tauri/crates/gamelib-knownfix-cli/tests/cli.rs

key-decisions:
  - "The remote fixes file is written in the body's own key order, not the allow-list's: the TS wrote `JSON.stringify(filtered, null, 2)` over keys in the order the body listed them, and the golden pins the sha256 of the bytes, so `filter_tier1_known_fixes`' struct (allow-list order) is used only to decide which keys survive and the file is written from the parsed body's entries in order, with a local two-space pretty printer over JsValue. No trailing newline, empty `[]` and `{}` as JavaScript writes them. A rolled-back build therefore reads and rewrites the same bytes (87 D-07)"
  - "The fetcher sends the GameLib User-Agent (`GameLib/<version> (+https://github.com/...)`) where axios sent its own default one. The oracle's spy records axios options, not axios' default headers, so the recorded exchanges carry none; golden_fetcher.rs hands Replay a temp copy of each case with that one header added. The report is the opposite: the TS set `User-Agent: GameLib/<version>` explicitly, so the Rust client sends exactly that and the recorded exchanges are replayed as they are"
  - "A log line names the file (`<id>-<store>.json`), a source label, a status or a category, never a URL, header, body or path (prohibition 1): `request failed for <file>: <category>` replaces the URL and the transport text, `written from <label>: <file>` replaces the destination path, the refused name is not echoed, and a body that is not valid JSON says so without the parser's text. The golden lines are mapped to these in the test (`want_line`) and every produced line is asserted to hold no `://` and no HOME path"
  - "`Fetch` gained POST through data on `FetchRequest` (method, body, follow_redirects), not a new trait method, and ReqwestFetch holds a second lazily built client with redirects off, because reqwest sets the redirect policy per client, not per request. Replay compares a POST's body byte for byte, fails the request loudly and sticky on a mismatch, and prints only the two lengths, never a body"
  - "The in-flight table is the TS abort registry's job done by a set of sent-record keys with a drop guard (`ReportsInFlight`), because the TS entry existed to be aborted and the Rust abort is the shutdown token. The post races the token and an 8 s `tokio::time::timeout` (the TS had both axios' `timeout` and `AbortSignal.timeout(8000)`), so a Fetch that ignores a request's own timeout is still bounded, and a dropped op (the `guarded` wrapper winning the race at shutdown) frees the place through the guard"
  - "The `error` outcome is reachable: `ReportEnv` is the one seam through which a report reads the platform, the winning layer and the sent store, and the real one answers `Err` when the sent-report store cannot be opened or written (read-only, corrupt). The oracle's `readWinning throws` and `isMac throws` cases replay as that seam failing with `boom` and `sync boom`, giving the same outcome and the same log line"
  - "Nothing runs at boot and nothing is wired into the shell here: the fetch runs when a caller invokes `knownfix_fetch_remote` at install time and the report when a detector invokes `knownfix_report_detected`. 88-12 points the TS callers at the two ops. `knownfix_report_detected` takes `enabled` from the caller (the `shareDetectedFixes` setting as it read it), so the crate reads no settings file"

patterns-established:
  - "A POST golden replays as method, URL, the two headers and the body byte for byte through Replay, with request-level facts the recording cannot hold (the 8 s timeout, redirects off) asserted on the request the client built"
  - "A hang case is a held answer plus a cancel: abort-all is the shutdown token, and the test yields after cancelling so the log lines land in the step that cancelled, as they did in the oracle"

requirements-completed: [SVC-03]

coverage:
  - id: D1
    description: "The remote known-fixes fetcher replays all 38 golden/fetcher cases: GameLib feed first, Heroic only on a 404 and only for legendary, gog and nile, every indeterminate answer (transport failure, 403, 5xx, 3xx, 204, malformed body, non-object body) writes and deletes nothing, a stale file is deleted only when every applicable source answers 404, bodies are filtered through the tier-1 allow-list at write and written with the TS's exact bytes (sha256 pinned), unsafe app names are refused without a request, and nothing ever rejects"
    requirement: SVC-03
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-knownfix/tests/golden_fetcher.rs#every_fetcher_golden_replays"
        status: pass
    human_judgment: false
  - id: D2
    description: "The tracer: `knownfix_fetch_remote` end to end on a Replay fetch, from the scripted GameLib-feed 200 to the filtered file on disk, compared with the golden tree (committed and verified before any expansion)"
    requirement: SVC-03
    verification:
      - kind: integration
        ref: "golden_fetcher.rs#every_fetcher_golden_replays (case tracer-gamelib-feed-200-gog-written)"
        status: pass
    human_judgment: false
  - id: D3
    description: "gamelib-engine's Fetch POSTs a body and can refuse to follow redirects, additively: the body and caller headers reach a local server intact, a 3xx comes back as the 3xx with redirects off and is followed by default, Replay serves a recorded POST only when method, URL and body match and fails loudly (without printing a body) otherwise, and every existing gamelib-engine (196 lib, 26, 26, 24, 14, 7, 3, 2, 8, 8, 9, 6, 17, 13, 7, 6, 4, 12) and gamelib-wine (170, 39, 11, 9, 6, 5, 18, 10, 8, 25, 13, 27) test is unchanged and green"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-engine/src/fetch.rs#tests (a_post_sends_its_body_and_the_content_type_the_caller_set, a_redirect_is_followed_by_default_and_returned_as_the_3xx_with_no_redirects, replay_post::*)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The opt-in report client replays all 48 golden/report cases: every outcome (not-mac, disabled, skipped-local, skipped-known, skipped-not-32, already-sent, in-flight, no-relay, invalid, sent, rejected, retryable, error) from the same inputs, 16 status boundaries, the relay body logged by its status word only, one POST with Content-Type and User-Agent only, 8 s, no redirects, the JSON body byte for byte, `{at, status}` recorded in the steam_known_fix_reports store for a 2xx and a terminal 4xx and nothing for a retryable one, two different reports in flight together and the same one refused, abort-all ending a held post as retryable and freeing the place"
    requirement: SVC-03
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-knownfix/tests/golden_report.rs#every_report_golden_replays"
        status: pass
    human_judgment: false
  - id: D5
    description: "The report constants (pairs, version, max bytes, tier-1 routing keys and allow-list, relay URL, pending sentinel, relay status words, 8 000 ms, both feed bases) equal the recorded `constants` case and are checked against the text of src/common/knownFixReport.ts and src/backend/knownFixReport.ts, so a change on the TS side fails here"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "golden_report.rs#the_constants_case_equals_the_rust_constants, golden_report.rs#the_constants_equal_the_shared_schema_source"
        status: pass
    human_judgment: false
  - id: D6
    description: "Both clients hold the `knownfix` registrant through `guarded` and are cancelled by the shutdown token; the 8 s bound holds on a network that ignores a request's own timeout (paused clock); a shutdown during the post frees the in-flight place and drains the registrant; the two ops take one strict object each, never echo what they were given, and answer without a request for a refused name, a sideload game, a disabled report and a non-Mac host; the CLI lists and runs both ops"
    requirement: SVC-03
    verification:
      - kind: integration
        ref: "golden_report.rs#an_unanswered_post_is_given_up_after_8_seconds_and_is_retryable, #a_shutdown_during_the_post_frees_the_place_and_the_registrant, #the_report_op_decodes_one_strict_object_and_answers_the_outcome_word, #the_fetch_remote_op_decodes_one_strict_object_and_asks_nothing_for_a_refused_name; gamelib-knownfix-cli tests/cli.rs#ops_prints_the_op_table_and_exits_zero, #the_fetch_and_report_ops_answer_without_a_request_and_refuse_a_bad_call"
        status: pass
    human_judgment: false
  - id: D7
    description: "The goldens are discriminating: with the Heroic runner set reduced to two runners, a 403 treated as a 404, 429 made terminal, redirects left on, the skip-local rule removed and the User-Agent changed, the fetcher and report replays each failed (all mutations reverted)"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "mutation runs of golden_fetcher and golden_report, sources restored from copies"
        status: pass
    human_judgment: false

duration: 24min
completed: 2026-11-25
status: complete
---

# Phase 88 Plan 11: Remote-fixes fetcher and report client Summary

**The last two known-fix modules are Rust: the remote fixes fetcher (GameLib feed, Heroic on a 404, filtered bytes identical to the TS's) and the opt-in report client (strict wire schema, one POST with no redirects, sent records in the real store), each replaying its 88-07 goldens offline over gamelib-engine's one Fetch seam, which gained POST and a no-redirect switch without touching a single existing test.**

## Performance

- **Duration:** about 24 min
- **Completed:** 2026-11-25
- **Tasks:** 3 (one tracer, two TDD)
- **Files:** 4 created, 4 modified (all under src-tauri/crates)

## Accomplishments

- **Tracer (Task 1):** `knownfix_fetch_remote` end to end on a `Replay` fetch. One feed request, the body filtered through the tier-1 allow-list, `1207658930-gog.json` written with a pinned sha256 and the `<APPFOLDER>/fixes` tree equal to the golden. Verified in compare mode before anything else was built (the tracer gate: tracer verified end to end, expanding). All 38 `golden/fetcher` cases pass in the same test.
- **Fetcher (Task 1):** the TS decision table in full. The destination containment check is the TS resolve-plus-relative test (so `..dots` is still refused, recorded behaviour from 88-07, not fixed), the file is written as `JSON.stringify(filtered, null, 2)` in the body's own key order, a stale file goes only when every applicable source answered 404, and a failed write is a log line, never an error.
- **Fetch seam (Task 2, TDD):** `Method::Post`, `FetchRequest.body` and `follow_redirects` (default true), `FetchRequest::post` and `no_redirects`. `ReqwestFetch` sends the body and uses a second client with redirects off when asked. `Replay` pins a POST's body byte for byte and fails loudly, sticky and without printing either body. RED `537a1b4e6` (four tests failing on their assertions), GREEN `1bbbf3c8d`.
- **Report client (Task 3, TDD):** the TS order of checks, the strict seven-field schema with its two refinements, one POST through `EngineCtx.fetch` (8 s, no redirects, `Content-Type` and `User-Agent` only, body capped at 2 048 bytes), sent and terminal-4xx records in `store_cache/steam_known_fix_reports` through `StoreHost`, an in-flight table with a drop guard, a spawned `report_detected_fix` that holds the `knownfix` registrant. RED `57b034545`, GREEN `27e96dd2d`. All 48 `golden/report` cases pass, plus the `constants` case against both the recording and the TS source text.
- **Ops:** `knownfix_fetch_remote` (`{ appName, runner }`, answers `null`) and `knownfix_report_detected` (`{ appId, key, op, detector, enabled }`, answers the outcome word), both with `deny_unknown_fields` args and fixed, non-echoing `bad-args` literals. The CLI lists and runs them.

## Task Commits

1. **Task 1 (tracer): the fetcher, its op and the 38-case replay** - `be3705cac` (feat)
2. **Task 2 RED: failing tests for POST and no-redirect** - `537a1b4e6` (test)
3. **Task 2 GREEN: POST and no-redirect on the Fetch seam** - `1bbbf3c8d` (feat)
4. **Task 3 RED: failing replay of the 48 report goldens** - `57b034545` (test)
5. **Task 3 GREEN: the report client, its op, the CLI coverage** - `27e96dd2d` (feat)

**Plan metadata:** the docs commits that carry this SUMMARY, STATE.md, ROADMAP.md and REQUIREMENTS.md.

## Decisions Made

See `key-decisions` above.

## Quirks recorded, not fixed (D-20)

- **The fetcher refuses any app name that starts with two dots** (`..dots`), as the TS does: the containment test is `relative.startsWith('..')`. Reproduced in `contained_dest` and pinned by `rule-unsafe-app-names-write-and-ask-nothing`; already filed from 88-07 (`2026-11-25-known-fixes-fetch-refuses-an-app-name-that-merely-starts-with-two-dots`).
- **An app name that resolves lexically to one entry (`a/../b`) is accepted**, as in the TS. The temp file is written beside it under the folder's own path, so such a name fails to write in both implementations (no real id is shaped like that; no case covers it).
- **The report reads the winning layer before it validates the appId**, so `../x` logs the reader's traversal warning once per layer and is then refused as `invalid`. Both are in the golden and reproduced.

## Deviations from Plan

### Plan wording that does not match the code

- **The plan says the report's in-flight set is "in `KnownFixCtx` (ctx.rs) instead of the abort registry".** It is, as `ReportsInFlight` on `KnownFixCtx.report_in_flight`; the oracle's abort-all has no registry counterpart, so it is the shutdown token (`ctx.engine.shutdown.token().cancel()`), which is also what the exit path fires.
- **`knownfix_report_detected` answers the outcome word, while the TS `reportDetectedFix` is fire-and-forget.** The Rust fire-and-forget entry point exists as `report_detected_fix` (a spawned task holding the registrant); the op awaits, because an op must answer. The golden `detect` step's `postsMadeSynchronously` is therefore 0 on the Rust side, where the TS made its post synchronously (in `deltas.json` terms: "the Rust entry point is a spawned task that returns nothing").
- **The User-Agent of the fetcher** is the GameLib one; the recordings hold none (see key-decisions). The replay adds it to a temp copy of each case.

### Scope additions (inside the plan's intent)

- **`ReportEnv` / `CtxReportEnv`** in report.rs and `run_known_fix_report_with`: a seam the plan does not name, so the `error` outcome (and the `readWinning throws` / `isMac throws` goldens) are replayable. [Rule 2 - missing critical functionality: without it the `error` outcome would have no Rust trigger and two golden cases no replay]
- **`gamelib-knownfix-cli/tests/cli.rs`** (not in the plan's file list): the acceptance criterion "`gamelib-knownfix-cli ops` lists the two ops" is checked by the existing `ops_prints_the_op_table_and_exits_zero`, extended, and a new test runs both ops over a fake home in the calls that make no request.
- **Extra tests in golden_report.rs** beyond the golden replay: the 8 s bound on a paused clock, shutdown mid-post, and the two ops' strict decoding.

### Process note

- **Task 3's RED commit was cut after the implementation was drafted.** The golden test, the types, the schema, the in-flight table and the ops were committed with the report logic stubbed (`run_known_fix_report_with` answering `error`), so `57b034545` genuinely fails the 48-case replay by assertion and `27e96dd2d` makes it pass; the failing state was not obtained by writing the test first. Task 2's RED/GREEN were written in order.

**Total deviations:** 0 auto-fixed bugs, 1 scope addition for the `error` outcome (Rule 2), 3 plan-wording adjustments and the process note above.
**Impact on plan:** none on the files or artifacts the plan names; every must-have truth holds.

## Issues Encountered

- `AtomicUsize::fetch_update` is deprecated on the installed toolchain (renamed `try_update`) but the crate's MSRV is 1.77, so the test's hold counter is a `Mutex<usize>` instead.
- A first clippy pass flagged two unused trait imports in the new fetch.rs tests (the parent module already brings them in); removed.

## Known Stubs

None.

## Threat Flags

None. T-88-27 (a feed body becoming the remote layer) is pinned by the filter-at-write cases for both feeds and the indeterminate-answer cases; T-88-28 (stale-file delete) by `rule-stale-file-is-deleted-only-when-every-applicable-source-answers-404` and the containment cases; T-88-29 (the report leaving the machine) by the exact body, the two headers, redirects off, the opt-in and skip-local rules and the 2 048-byte cap check; T-88-SC: no crate was added (`reqwest` is reached only through gamelib-engine's Fetch, `tempfile` and `tokio` were already dev-dependencies).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 88-12 can point the TS callers of `fetchRemoteKnownFixes` and `runKnownFixReport` / `reportDetectedFix` at `knownfix_fetch_remote` and `knownfix_report_detected`; the shell already hands `KnownFixCtx` its relay URL (the `GAMELIB_FIX_RELAY_URL` override, resolved once) and app version. A caller passes `enabled` from the `shareDetectedFixes` setting.
- Every known-fix module now has a Rust owner replaying its goldens (ROADMAP 88 SC1 is complete in Rust); the TS modules stay in place until 88-12.

## Self-Check: PASSED

Created files exist (remote.rs, report.rs, golden_fetcher.rs, golden_report.rs and the modified fetch.rs, lib.rs, ctx.rs, cli.rs); commits `be3705cac`, `537a1b4e6`, `1bbbf3c8d`, `57b034545` and `27e96dd2d` are ancestors of HEAD; `cargo test -p gamelib-knownfix` (57 lib, 38-case fetcher and 48-case report replays, the rest of the crate), `-p gamelib-knownfix-cli` (9), `-p gamelib-engine` and `-p gamelib-wine` all pass with no test removed; `cargo clippy -p gamelib-knownfix -p gamelib-engine --all-targets -- -D warnings` and `cargo fmt --check` over the three touched crates are clean; `cargo check --workspace --all-targets` builds; the fetcher count is 38 (floor 20) and the report count 48 (floor 30); mutation runs of both replays failed as expected and were reverted.

---
*Phase: 88-launch-pipeline*
*Completed: 2026-11-25*
