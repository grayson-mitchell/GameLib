---
phase: 88-launch-pipeline
plan: 07
subsystem: known-fix-goldens
tags: [knownfix, golden, oracle, fetcher, report, relay, recorded-exchanges, incident-census, svc-03]

requires:
  - phase: 88-launch-pipeline
    plan: 03
    provides: the gamelib-knownfix crate, whose tests/fixtures root (prettier-ignored) holds the goldens
  - phase: 88-launch-pipeline
    plan: 04
    provides: launchOracle (withPinnedBaseEnv, injectPlatform, withInjected, tsTestTitles and assertCasesCoverTitles)
  - phase: 88-launch-pipeline
    plan: 05
    provides: the case-builder pattern, the layer-file helper `fix` that seeds the real reader's layers
  - phase: 88-launch-pipeline
    plan: 06
    provides: oracleCommon (spyLogs, realTurn, dropRealpathPrefix, json) and writeOrCompareGolden's `extra` map
provides:
  - src/backend/__tests__/oracle/knownFixFetch.oracle.test.ts and knownFixFetch.cases.ts (the network oracle and its case builders)
  - gamelib-knownfix/tests/fixtures/golden/fetcher (38 cases) and golden/report (48 cases), each with cases.json, deltas.json, MANIFEST.json and expected/<case>/
  - gamelib-knownfix/tests/fixtures/recorded/fetcher and recorded/report, one exchanges.json per case (plus body files) in recorder.ts's exchange shape, for the Rust Replay fetch
  - the report `constants` case: KNOWN_FIX_REPORT_PAIRS, version, max bytes, TIER1_ROUTING_KEYS, the tier-1 allow-list, the relay URL, the pending sentinel, the relay status words, the 8 000 ms timeout and both feed bases
affects: [88-11, 88.1]

actuals:
  tokens: 95970
  tasks: 2
  commits: 2
commits: 2
plan_head_before: f3484b7865a2dab45130f5aec933811d7e76648a
plan_head_after: 0274ef84a4346980d31fa3b2e92328cff0732494

tech-stack:
  added: []
  patterns:
    - "the report oracle builds its deps with the REAL knownFixReportDeps (real reader over seeded layers, real setting read, real post with its headers, 8 000 ms timeout and no redirects) and answers only axios.post, so what is recorded is the request the app would send; only `now` is overridden"
    - "the fetcher oracle answers an injected `get` per URL (unlisted URL is a 404, as the TS test's makeGet), and a `via: default` step passes no get so the fetcher's own axios client runs with axios.get answered from the same table and its options recorded"
    - "recorded/<slice>/<case>/exchanges.json is produced from the requests the module actually made, paired with the scripted answers, in recorder.ts's shape (id, request, response with bodyFile, networkError), so Replay and the golden cannot disagree about what was asked"

key-files:
  created:
    - src/backend/__tests__/oracle/knownFixFetch.oracle.test.ts
    - src/backend/__tests__/oracle/knownFixFetch.cases.ts
    - src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/fetcher
    - src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/report
    - src-tauri/crates/gamelib-knownfix/tests/fixtures/recorded/fetcher
    - src-tauri/crates/gamelib-knownfix/tests/fixtures/recorded/report
    - .planning/todos/pending/2026-11-25-known-fixes-fetch-refuses-an-app-name-that-merely-starts-with-two-dots.md
  modified:
    - src/backend/testUtils/engineWineOracle/harness.ts

key-decisions:
  - "A fetcher case is a list of steps over one fresh fake HOME. result.json holds, per step, the URLs asked, whether the call rejected and the `<APPFOLDER>` tree after the step; requests.json is `GET <url>` in order across the case; tree.json is the final `<APPFOLDER>` tree with `<APPFOLDER>/` prefixed paths and sha256 content hashes (so a Rust write that differs by one byte fails)"
  - "The plan's 'never-settling promise advanced past 10 000 ms' does not exist in the fetch loop: the 10 s deadline is the default client's axios `timeout`, and an injected `get` that never settles would hang the fetch. The timeout case is therefore a `via: default` step whose axios.get rejects with ECONNABORTED, and a second default-client case records the real axios options (timeout 10 000, responseType text, text kept as served, every status accepted)"
  - "The report's readWinning is the real readKnownFixesWithLayer over seeded bundled, local and remote layers (not a canned answer), so skipped-local is proved by the winning layer being local and the reader's own warnings (an invalid appId's traversal warning) are in the golden"
  - "A report post that never answers (`hang`) settles only when the request's signal aborts; its recorded exchange is a network error, and deltas.json says the Rust replay holds that request open until the registry is aborted"
  - "GoldenCapture.requests accepts a request object as well as a `METHOD url` string, so the report's requests.json carries the URL, headers, JSON body and timeout in one entry; the 88-06 `extra` map stays for store.json"
  - "A test title that is an it.each is one case with a step per row, as in 88-06; the case id is `<file-stem>--<slug(describe > title)>`, and the census fails both an uncovered title and an id no title owns"

patterns-established:
  - "A network golden records the request as the client built it, from the real client's options, with the transport spied and never reached"
  - "Scripted answers are written once, as recorded exchanges, and the golden for the same case is produced from the same run"

requirements-completed: [SVC-03]

coverage:
  - id: D1
    description: "The fetcher slice holds 38 cases: a named case for each of the 14 titles of knownFixesFetcher.test.ts (each it.each is one case with a step per row), the tracer, and 23 rule cases for the D-03 behaviour (feed order and the Heroic runner set, every indeterminate answer writes and deletes nothing, stale delete only when every applicable source answers 404, filter at write for both feeds, unsafe app names, the default client's configuration and timeout, a write failure that never rejects)"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/__tests__/oracle/knownFixFetch.oracle.test.ts#every title of knownFixesFetcher.test.ts is a named case, one for one"
        status: pass
    human_judgment: false
  - id: D2
    description: "The tracer case pins one remote-fixes download from scripted answer to file on disk: one GameLib-feed URL asked, the body filtered through the tier-1 allow-list (extraKey dropped, the warning logged), `<APPFOLDER>/fixes/1207658930-gog.json` written with a pinned sha256, and the exchange recorded for replay"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "knownFixFetch.oracle.test.ts#tracer-gamelib-feed-200-gog-written"
        status: pass
    human_judgment: false
  - id: D3
    description: "The report slice holds 48 cases: the 24 titles of knownFixReport.test.ts, the 2 of knownFixReportUrl.test.ts and the 3 of knownFixReportDrift.test.ts as named cases, the `constants` case, and 18 rule cases (every outcome, 16 status boundaries, relay body shapes, schema vectors, version shapes, in-flight and abort, the deployed URL and the env override)"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "knownFixFetch.oracle.test.ts#every title of %s is a named case, one for one (3 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every report POST is recorded as the real client builds it: URL, headers (content-type and user-agent only), JSON body with key order, bodyBytes under the 2 048 cap, timeout 8 000 ms, maxRedirects 0, every status accepted, a signal not yet aborted; the sent-store writes and final content are in store.json, and no body field outside appId, key, value, op, version carries data"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "knownFixFetch.oracle.test.ts#no recorded request header is anything but Content-Type and User-Agent; rule-sent-to-the-deployed-relay-with-content-type-and-user-agent-only"
        status: pass
    human_judgment: false
  - id: D5
    description: "The scripted answers are also written as recorded/<slice>/<case>/exchanges.json (plus body-<n>.<ext>) for every case in both slices, in recorder.ts's exchange shape, produced from the requests actually made"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "knownFixFetch.oracle.test.ts compare mode (98 tests, writeOrCompareRecorded for each case)"
        status: pass
    human_judgment: false
  - id: D6
    description: "MANIFEST floors equal the recorded counts (38 and 48), an empty case list fails, nothing reads the real profile or the network (every case runs on a fresh fake HOME under withPinnedBaseEnv with an injected platform, axios.get and axios.post are spied and answered from the case), and the recording is stable across repeated compare runs"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "knownFixFetch.oracle.test.ts in compare mode with GAMELIB_WRITE_ENGINE_GOLDEN and GAMELIB_EW_ORACLE unset (98 tests, three consecutive runs)"
        status: pass
    human_judgment: false
  - id: D7
    description: "The goldens are discriminating: with the Heroic runner set reduced to two runners, a 403 treated as a 404, the stale-file delete disabled, the relay timeout changed to 9 000 ms, 429 made terminal and maxRedirects changed to 5, 31 of the 98 oracle tests failed (all mutations reverted)"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "mutation run of knownFixFetch.oracle.test.ts, 31 failed, sources restored from copies"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-11-25
status: complete
---

# Phase 88 Plan 07: Remote-fixes fetcher and report goldens Summary

**The two network clients of known-fixes are pinned by committed TS goldens before any Rust for them exists: 38 fetcher cases (which URLs, in what order, what is written and deleted under `<APPFOLDER>/fixes`) and 48 report cases (the exact opt-in POST, its sent-store writes and every outcome), each with its scripted answers recorded as offline-replayable exchanges.**

## Performance

- **Duration:** about 10 min
- **Completed:** 2026-11-25
- **Tasks:** 2 (one tracer, one auto)
- **Files:** 2 test-side files created, 1 shared harness type widened, 1 todo filed; 2 golden slices (38 and 48 cases) and 2 recorded slices

## Accomplishments

- **Tracer (Task 1):** `fetchRemoteKnownFixes` for a gog game with a scripted GameLib-feed 200 whose body carries one key the allow-list drops. It records the one URL asked, the log lines (the dropped-key warning, "written from GameLib"), the `<APPFOLDER>` tree with the content hash of `1207658930-gog.json`, and `recorded/fetcher/<case>/exchanges.json` plus its body file. Verified in compare mode before Task 2 started (the auto-mode tracer gate: tracer verified end to end, expanding).
- **Fetcher rules (Task 2):** one case per title of `knownFixesFetcher.test.ts` (14, `knownFixesFetcher--<slug>`, each `it.each` one case with a step per row) and 23 rule cases: the GameLib feed asked first, the Heroic feed only on a 404 and only for legendary, gog and nile (a five-runner case lists the URLs per runner); a network error, 403, 5xx, 3xx, 204, a malformed body, an array, `null` and a JSON string each write and delete nothing, for either feed; a stale file is deleted only when every applicable source answers 404 (including steam, which has one source); bodies are filtered at write (a body of tier-2 keys, bad values and an unknown key from either feed, and a body of every tier-1 key kept whole); five unsafe app names write nothing and ask nothing; a second download overwrites the first; a `fixes` path that is a file makes the write fail without the call rejecting; the default client's real axios options (timeout 10 000, text, every status accepted) and its timeout and Heroic-fallback behaviour.
- **Report (Task 2):** one case per title of `knownFixReport.test.ts` (24), `knownFixReportUrl.test.ts` (2) and `knownFixReportDrift.test.ts` (3), each outcome (`not-mac`, `disabled`, `skipped-local`, `skipped-known`, `skipped-not-32`, `already-sent`, `in-flight`, `no-relay`, `invalid`, `sent`, `rejected`, `retryable`, `error`), 16 status boundaries (199 to 599), relay body shapes logged by status word only, a schema-refused version, drm removal refused by the schema, add and remove keeping separate sent records, two reports in flight together, the deployed relay URL and the env override, and schema vectors for `parseKnownFixReport`. The `constants` case records every value the Rust client is pinned to.
- **Recorded exchanges:** every case in both slices has `recorded/<slice>/<case>/exchanges.json` (an empty list where nothing was asked) and a `body-<n>.<ext>` per answer body; the report's request body is the JSON text sent, its request headers are `content-type` and `user-agent` only (a test over the recorded files enforces it).
- **Manifests:** `fetcher` 38 and `report` 48, floors equal counts; each describe carries its own floor constant and an empty-list failure test.

## Task Commits

1. **Task 1: Tracer, a remote known-fixes download recorded from the scripted GameLib-feed answer to the file on disk** - `b11cd8c70` (test)
2. **Task 2: Every fetcher and report incident as a named golden case, with the report constants** - `0274ef84a` (test)

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md, ROADMAP.md and REQUIREMENTS.md.

## Decisions Made

See `key-decisions` above.

## Quirks recorded, not fixed (D-20)

- **The fetcher refuses any app name that starts with two dots**, not only a traversing one (`startsWith('..')` on the relative path). `..dots` gives a destination inside the folder and is refused anyway. No real store id starts that way, so nothing is lost. Recorded in `rule-unsafe-app-names-write-and-ask-nothing`; filed as `.planning/todos/pending/2026-11-25-known-fixes-fetch-refuses-an-app-name-that-merely-starts-with-two-dots.md` (minor, any, code).
- **The fetch loop has no deadline of its own**: the 10 s timeout is the default client's axios option, so an injected `get` that never settles hangs the fetch. By design (the only caller outside tests passes no `get`), recorded as the `via: default` timeout case rather than filed.
- **An invalid appId reaches the reader before the schema**: `runKnownFixReport` reads the winning layer first, so `../x` logs the reader's "resolved outside the known-fixes directory" warning and is then refused as `invalid`. Both lines are in the golden.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `GoldenCapture.requests` could only hold `METHOD url` strings**
- **Found during:** Task 2
- **Issue:** the plan records the report's POST as URL, headers, JSON body, timeout and redirects in `requests.json`, but the shared harness typed `requests` as `readonly string[]`.
- **Fix:** the type now also accepts a request object (`readonly (string | Readonly<Record<string, unknown>>)[]`); the file contents for existing slices are unchanged.
- **Files modified:** src/backend/testUtils/engineWineOracle/harness.ts
- **Verification:** all seven suites that use the harness pass (427 tests), tsc and eslint clean.
- **Committed in:** 0274ef84a

### Plan wording that does not match the code

- **No never-settling promise for the fetcher timeout.** The plan asks for "a never-settling promise advanced past 10 000 ms with fake timers", but the 10 s deadline is the default client's axios `timeout`; the fetch loop itself waits forever on an injected `get` that never settles. The timeout is recorded as a default-client step whose `axios.get` rejects with `ECONNABORTED`, and the client's real options are recorded in a second case (see key-decisions).
- **Report requests come from the real client.** The plan describes "scripted ReportDeps (post table, ...)". The oracle instead uses the real `knownFixReportDeps` and answers `axios.post`, so the headers, the 8 000 ms timeout and `maxRedirects: 0` are recorded from the code rather than restated. Only `now` is overridden. The plan's `relayUrl` seam is the real `relayUrl()` reading `GAMELIB_FIX_RELAY_URL`.

### Scope additions (inside the plan's intent)

- `knownFixFetch.cases.ts` is a file the plan does not list: the case builders follow 88-05 and 88-06 (cases.json written from a builder so the list and the recording cannot drift).
- One todo for the `..` prefix quirk above.

---

**Total deviations:** 1 auto-fixed (1 blocking), two plan-wording adjustments and scope additions as listed
**Impact on plan:** none on the files or the artifacts the plan names; every must-have truth holds, with the timeout recorded where the timeout actually lives.

## Issues Encountered

- A first lint pass flagged the deliberate non-Error rejection (`prefer-promise-reject-errors`); it carries an `eslint-disable-next-line` with the reason, because the case exists to reach the client's fallback line for a rejection that is not an `Error`.

## Known Stubs

None.

## Threat Flags

None. T-88-15 (a feed body becoming the remote layer) is pinned by the filter-at-write cases for both feeds (tier-2 keys, bad values and unknown keys dropped, every tier-1 key kept) and by the indeterminate-answer cases that write and delete nothing; T-88-16 (the report leaving the machine) by the exact body keys, `bodyBytes` under the 2 048 cap, no redirects, the skip-local rule and header redaction through `redactHeaders`. No gamelib.log line carries a URL, query, header or token: the report's lines name the appId, key, op and version only (the golden `events.json` files show it). T-88-SC: no package was added.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 88-11 (the Rust fetcher and report client) has `golden/fetcher` and `golden/report` with `deltas.json` for the documented Rust-side differences (error and zod text, the abort signal and redirect option names, the held-open request), the `constants` case, and `recorded/fetcher` and `recorded/report` for the offline `Replay` fetch.
- The todo above is `ready: code` and independent of the port.

## Self-Check: PASSED

All created paths exist on disk (the two test-side files, `golden/fetcher` and `golden/report` with MANIFEST, cases, deltas and 38 + 48 expected folders, `recorded/fetcher` and `recorded/report` with an exchanges.json per case, the todo); commits `b11cd8c70` and `0274ef84a` are ancestors of HEAD; the oracle passes in compare mode (98 tests, three consecutive runs); the seven suites that use the harness pass (427 tests); `tsc --noEmit`, eslint over the three touched test-side files, `npx prettier --check` over the same three and `pnpm planning-gates` (12 of 12) are clean; the fetcher manifest count is 38 (at least 20) and the report count 48 (at least 30); six planted mutations failed 31 tests and were reverted.

---
*Phase: 88-launch-pipeline*
*Completed: 2026-11-25*
