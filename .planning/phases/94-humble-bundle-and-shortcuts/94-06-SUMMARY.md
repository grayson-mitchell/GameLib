---
phase: 94-humble-bundle-and-shortcuts
plan: 06
subsystem: testing
tags: [oracle, golden, humble, wire-recorder, redaction, classify, dedup, title-match, d-05, d-06, d-23]
status: complete

requires:
  - phase: 94-humble-bundle-and-shortcuts
    provides: 94-02 gamelib-humble crate skeleton and the prettier-ignore for its fixtures
provides:
  - src/backend/testUtils/humbleOracle/wireRecorder.ts (startWireRecorder, replay / write / forward modes, redaction, exchanges.json)
  - src/backend/testUtils/humbleOracle/harness.ts (withHumbleOracleProfile, pointHumbleAt, pointSteamStoreSearchAt, withWireRecorder, snapshotHumbleState, seedHumbleState, writeOrCompareGolden, recordDelta, MANIFEST floors)
  - 492 classify goldens and 61 dedup goldens recorded from the TypeScript under gamelib-humble/tests/fixtures/golden/{classify,dedup}
  - 3 recorded wire cases under gamelib-humble/tests/fixtures/recorded/wire (session-status x2, Steam storesearch)
  - src/common/matching/__tests__/fixtures/titleMatchVectors.json (101 shared vectors) and its replay test
  - src/backend/__tests__/humbleFixtureRedaction.test.ts (permanent scan, floor 555 files)
affects: [94-07, 94-08, 94-10, 94-15, 94-23, Humble Rust plans]

requirements-completed: []

actuals:
  tokens: 33000
  tasks: 3
  commits: 5

plan_head_before: 2f4ecb482b584370830a1d7ffb363fcde3743ab5
plan_head_after: 413f3d365aa39e1841bb6522c9d7ce74930522b1

tech-stack:
  added: []
  patterns:
    - "the base URLs move by property replacement (jest.replaceProperty on HUMBLE_BASE_URL) and an axios request interceptor, never a module mock, so the jestMock ratchet gets no entry from 94-06"
    - "the recorder records requests as they arrived on the socket (rawHeaders order), normalises the origin, boundary and content-length, redacts before any write, and replay compares the whole request"
    - "pure-logic goldens are {fn, input, output} per case; key values are redacted BEFORE the TS runs so input and output agree"
    - "zone-dependent cases are recorded in three fixed-offset zones with the zone in the input; the TZ switch is verified and an environment fault is never swallowed into a golden"

key-files:
  created:
    - src/backend/testUtils/humbleOracle/wireRecorder.ts
    - src/backend/testUtils/humbleOracle/harness.ts
    - src/backend/testUtils/humbleOracle/__tests__/wireRecorder.test.ts
    - src/backend/humble/__tests__/oracle/pureLogic.oracle.test.ts
    - src/backend/__tests__/humbleFixtureRedaction.test.ts
    - src/common/matching/__tests__/titleMatchVectors.test.ts
    - src/common/matching/__tests__/fixtures/titleMatchVectors.json
    - src-tauri/crates/gamelib-humble/tests/fixtures/golden/classify (492 cases + MANIFEST.json)
    - src-tauri/crates/gamelib-humble/tests/fixtures/golden/dedup (61 cases + MANIFEST.json)
    - src-tauri/crates/gamelib-humble/tests/fixtures/recorded/wire (3 cases)
  modified:
    - .gitattributes

key-decisions:
  - "Replay matches an arriving request to its recording by method and target (so concurrent chunk fetches do not depend on order), then requires the whole recorded request to be equal, and fails if a recording was never requested again. close() throws, so a caller that swallows the 599 still fails the test."
  - "Multipart requests record every field's name, filename and (redacted) value in order, not names alone: the _1_* scalar fields (cursor, page, limit) are part of what the Rust port must send. The boundary and content-length are normalised."
  - "Gamekeys in a /home/library/<gamekey> path and the bare ids in the reveal POST body are redacted too, not only gamekey JSON fields."
  - "The redaction scan judges a gamekey by shape (a run of 12 or more letters and digits) because the synthetic fixtures' ids carry a hyphen; key values must be REDACTED everywhere, which the pure-logic oracle guarantees by redacting them before the TS runs."
  - "Title-match vectors carry a fourth field, similarity (1 - distance/maxLen), so the Rust copy is pinned on the ratio as well as the verdict; three pairs sit exactly at 0.85 and all match."

patterns-established:
  - "oracle API the plans after this one rely on is tagged @public in harness.ts (knip ratchet), with a note that the plan's contract names it"

requirements: [SVC-04]
duration: 95min
completed: 2026-11-24
---

# Phase 94 Plan 06: Humble TS oracle Summary

**A wire-level Humble recorder that pins requests as they appear on the socket, plus classify, dedup and fuzzy-title vectors recorded from the TypeScript (553 goldens, 101 shared title vectors) before any Humble Rust exists.**

## What was built

- **Wire recorder** (`wireRecorder.ts`): `startWireRecorder({slice, caseId, mode, synthetic})` runs an `http.createServer` on 127.0.0.1 and records each request as it arrived: method, target, headers in `rawHeaders` order, body bytes, multipart fields in order. Modes: replay-and-compare (default, offline), `GAMELIB_WRITE_HUMBLE_GOLDEN=1` (answers from the case's synthetic responses and rewrites `exchanges.json`), `GAMELIB_HUMBLE_ORACLE=forward` (proxies to the real https host via an upstream map or the `x-oracle-upstream` header and records the response; used only by 94-10, never run here). Redaction runs before any write (cookies of any name, CSRF and authorization values, gamekeys in paths and fields, key values, emails, account names); response headers are reduced to an allow-list.
- **Harness** (`harness.ts`): `withHumbleOracleProfile` (fresh `createFakeHomeProfile()`, macOS layout on every host, a clock pinned at 2026-11-24T12:00Z), `pointHumbleAt` (`jest.replaceProperty` on the constants module's `HUMBLE_BASE_URL`), `pointSteamStoreSearchAt` (an axios request interceptor rewriting the resolver's storesearch origin), `withWireRecorder` (both pointings, undo in a `finally`, then close), `snapshotHumbleState` / `seedHumbleState` (the `store_cache/humble_*.json` and `humble_store/config.json` bytes), `writeOrCompareGolden`, MANIFEST `{count, floor}` with the empty-list self-test, `recordDelta`. No file this plan wrote carries a module mock (the ratchet's own counter prints 0 for every new file; `pnpm backend-di-ceilings` unchanged at jestMock=1637).
- **Tracer proof**: the real `getSessionStatus` export, pointed at the recorder, records `Cookie: _simpleauth_sess=REDACTED` and the headers the TS never sets (`Accept-Encoding: gzip, compress, deflate, br`, `User-Agent: axios/1.20.0`, `Host`, `Connection: keep-alive`). `searchSteamStoreApps` records the storesearch request with its query and `User-Agent: GameLib`. Three such cases are committed and replay offline. 17 tests including: an unmatched request fails even when the caller swallows the 599, a differing request fails naming what differs, a recording never requested again fails, multipart field order is recorded without the boundary, forward mode against a local upstream redacts the response, and each redaction rule.
- **Pure-logic oracle** (`pureLogic.oracle.test.ts`): every classify export (`classifyOrder`, `classifyTpk`, `isTerminal`, `isServerTerminal`, `isFreezeEligible`, `extractExpiration`, the three `describe*`) and dedup's `recomputeOwnership`. 492 classify goldens: `classifyOrder` under six predicate and clock variants over every one of the 33 `tpks.ts` orders, the three describe functions over each, the full `classifyTpk` signal grid (96), the state predicates and the `isFreezeEligible` grid, `extractExpiration` over every field, 29 date value shapes (ISO, RFC 2822, date-only, zone-less, slash and long-month forms V8 accepts, unparseable, non-strings) in three fixed zones (UTC, America/Phoenix, Asia/Kolkata), the relative-days edges (0, negative, 1e8, overflow, NaN, Infinity) and field precedence, plus `classifyOrder` over the same order with seven date strings. 61 dedup goldens: the classifier's own rows for every fixture order against the Steam library, and the appid, resolved-id, fuzzy, cross-platform, DLC-guard, remaster-guard, non-ASCII, override, UNPICKED and empty-library tiers. The classify manifest records `classifierVersion: 7`.
- **Title-match vectors**: 101 `{a, b, normalizedA, normalizedB, similarity, fuzzyMatch}` vectors from `titleMatch.ts` (49 match): non-ASCII that normalises to a space or to nothing (CJK, Cyrillic, Greek, emoji), accents, `İ`, full-width Latin, DLC and remaster guards, edition suffixes on and off a `\b` boundary, punctuation-only, empty and whitespace titles, and pairs at 0.85 exactly, below (0.846, 0.833, 0.8) and above (0.852, 0.857, 0.9). The replay test checks all four fields, the floor, the spread of the file and that a mutated copy (a flipped verdict, a changed normalisation, a changed ratio) fails.
- **Redaction scan** (`humbleFixtureRedaction.test.ts`): imports no slice module; fails on a cookie value, CSRF or authorization header value, a real-shaped gamekey in a path or field, a key value field not `REDACTED`, an email, an account-name field, or a real home path; planted negatives for every rule; floor 555 files (the tree holds 561).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A self-test wrote a recording into the committed fixtures**
- **Found during:** Task 2 (file count 562, expected 561)
- **Issue:** the interceptor self-test ran with `mode: 'write'` outside the temporary fixtures root, so Task 1's commit carried `recorded/s/steam-interceptor/exchanges.json`.
- **Fix:** moved the test under the temp-root describe and deleted the stray file in the Task 2 commit.
- **Files modified:** `src/backend/testUtils/humbleOracle/__tests__/wireRecorder.test.ts`
- **Commit:** 86c76f0dc

**2. [Rule 1 - Bug] Jest's `process.env` is a copy, so the first zone-dependent goldens recorded host faults**
- **Found during:** Task 2, the "time-zone switch is real" check failed (offset -780, wanted 0, the host is UTC+13)
- **Issue:** assigning `TZ` in a test never reaches the real environment. Worse, `record()` caught the "host ignored TZ" error and wrote it into 559 goldens as `{threw: ...}`.
- **Fix:** the real process is reached through `vm.runInThisContext('process')`, the offset is verified on every switch, and the fault is an `OracleHostError` that `record()` rethrows. The goldens were rewritten; none carries `threw`.
- **Commit:** 86c76f0dc

**3. [Rule 3 - Blocking] The knip ratchet (`pnpm find-deadcode`, pre-push and lint.yml) failed on 17 new findings**
- **Found during:** final verification after Task 3
- **Fix:** the API the plan names and later plans consume (`withHumbleOracleProfile`, `snapshotHumbleState`, `seedHumbleState`, `recordDelta` and their types) is tagged `@public`; unused exports (`HUMBLE_CRATE`, `HUMBLE_ORIGIN`, `REDACTED`, four recorded types, `goldenDir`, `humbleGoldenMode`) were un-exported and the unused `normalisePaths` removed. `find-deadcode` PASS at the baseline of 310.
- **Commit:** 413f3d365

### Plan wording that could not hold as written

**4. "import the inputs, do not copy them" (Task 2) for the classify.test.ts and dedup.test.ts tables.** Those tables are inline in the test files, and a test file cannot be imported without running its `describe` blocks. The fixture modules (`tpks.ts`, `steamGames.ts`) are imported by namespace, and the inline tables are restated as data matrices that cover each of their shapes (the file header lists them). Nothing is hand-typed as an expected value; every output is the TS's.

### Additions beyond the plan

- Multipart parts record a redacted `value`, and title vectors carry `similarity` (key decisions above).
- `.gitattributes` pins `gamelib-humble/tests/fixtures/** -text`, as 94-05 did for the shortcut fixtures, so the goldens stay LF on a CRLF checkout.
- Task 3 was run RED then GREEN as two commits (the test alone fails with ENOENT, then the vectors).
- The pinned branch is `gsd/phase-94-humble-bundle-and-shortcuts`, not the `phase-94-humble-shortcuts` the Task 1 precondition names; the orchestrator named it as correct.
- Plan 94-10 (live capture) was not run. Forward mode is built and self-tested against a local upstream only.

## Findings worth carrying forward

1. **The shared fuzzy match is length-sensitive, not word-sensitive.** `Tekken 7` vs `Tekken 8` scores 0.875 and matches; `Left 4 Dead 2` vs `Left 4 Dead` scores 0.846 and does not. The vectors pin this; the Rust copy must reproduce it, and the TS stays for the renderer.
2. **Three vectors sit at exactly 0.85 and all match** (`1 - 3/20`, `1 - 6/40`, `1 - 9/60` in f64). The Rust port must compute the ratio as `1.0 - distance as f64 / max_len as f64` and compare with `>=`.
3. **Zone-less and date-only dates are host-zone dependent in production** (i31), so the goldens record three zones. 94-15 decides how the Rust port treats local time (the crate allows fixed-offset civil time only).
4. **A request-pinning replay compares the whole recorded request**, including axios's `User-Agent` version, so an axios upgrade re-records `wire/*` on purpose.
5. The recorder's replay answers 599 for an unrecorded request; the adapter maps that to a transient error, which is exactly why `close()` throws.

## Windows-only observations

None of this plan's checks fail on this Windows CRLF checkout. Every new suite, `pnpm codecheck`, `pnpm backend-di-ceilings`, `pnpm find-deadcode`, `pnpm planning-gates` (12/12), `moduleStateCensus` and `fakeHomeIsolation` pass locally. The fixtures are LF and `-text`.

## Verification

- `pnpm exec jest --runTestsByPath` over the four new suites: 594 tests pass (17 recorder, 11 redaction, 560 pure-logic: 553 golden cases plus the guards, 6 title-match).
- Compare run after the write run is green for classify, dedup and the wire cases; the title vectors replay.
- `countJestMock` over every new `.ts` file prints 0.
- `npx prettier --check` over the written paths passes; the golden and recorded JSON are prettier-ignored (94-02) and the title vector JSON is formatted.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: the recorder binds 127.0.0.1 only (T-94-11) and forward mode is opt-in by environment; redaction before write and the permanent scan cover T-94-10.

## Self-Check: PASSED

- Files: `wireRecorder.ts`, `harness.ts`, `wireRecorder.test.ts`, `pureLogic.oracle.test.ts`, `humbleFixtureRedaction.test.ts`, `titleMatchVectors.test.ts`, `titleMatchVectors.json`, `golden/classify/MANIFEST.json`, `golden/dedup/MANIFEST.json` all exist.
- Commits: 82fd47a49, 86c76f0dc, f28841a70, 4d922263f, 413f3d365 all in `git log`.
