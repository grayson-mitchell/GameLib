---
phase: 86-pure-leaf-services
plan: 04
subsystem: ts-oracle
tags: [oracle, golden, recorder, axios-adapter, redaction, recent-games, game-overrides, anticheat, d-09, d-10, d-11, sc3]

requires:
  - phase: 86-pure-leaf-services
    provides: "86-03's Replay, which reads the exchanges.json this plan's recorder writes; the D-29 row 8 jest store sink (createDiskStoreSink)"
provides:
  - "oracle/recorder.ts: installRecorder / installAdapter, record, replay and compare modes, request pinning (method, axios.getUri, headers, body), tsOnly / rustOnly / synthetic exchanges, redaction"
  - "oracle/harness.ts: withOracleProfile, pinClock, mockPlatform, writeOrCompareGolden, loadCases, syncManifest, assertManifest, expectEmptyCasesToFail, snapshotFiles"
  - "TS goldens, committed before any Rust exists, for recent_games (11 cases), game_overrides (14) and anticheat (16)"
  - "anticheat's two public data URLs recorded live with the TS request headers, plus one synthetic 503 case"
  - "fixtureRedaction.test.ts: the permanent secret scan over every file under gamelib-info/tests/fixtures"
  - ".prettierignore entry for the byte-exact fixtures"
affects: [86-06, 86-07, 86-08, 86-10, 86-12]

actuals:
  tokens: 13500
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "One stable axios adapter installed before any slice module is imported: axios.create copies the default adapter, so the dispatcher is stable and each case swaps the state behind it"
    - "A golden is `expected/<case>/{result.json, events.json, after/<every file the case left>}`; cases.json is hand-authored, MANIFEST.json is `{count, floor}`, expected/ must hold exactly one folder per case"
    - "Platform is switched with jest.replaceProperty on backend/constants/environment, not jest.mock, so the backend-di-ceilings jestMock ratchet is untouched"

key-files:
  created:
    - src/backend/info/__tests__/oracle/recorder.ts
    - src/backend/info/__tests__/oracle/harness.ts
    - src/backend/info/__tests__/oracle/recentGames.oracle.test.ts
    - src/backend/info/__tests__/oracle/gameOverrides.oracle.test.ts
    - src/backend/info/__tests__/oracle/anticheat.oracle.test.ts
    - src/backend/info/__tests__/fixtureRedaction.test.ts
    - src-tauri/crates/gamelib-info/tests/fixtures/golden/recent
    - src-tauri/crates/gamelib-info/tests/fixtures/golden/overrides
    - src-tauri/crates/gamelib-info/tests/fixtures/golden/anticheat
    - src-tauri/crates/gamelib-info/tests/fixtures/state/recent
    - src-tauri/crates/gamelib-info/tests/fixtures/state/overrides
    - src-tauri/crates/gamelib-info/tests/fixtures/state/anticheat
    - src-tauri/crates/gamelib-info/tests/fixtures/recorded/anticheat
  modified:
    - .prettierignore

key-decisions:
  - "The recorder installs a stable dispatcher adapter once and swaps per-case state behind it, because axios.create copies the default adapter value at creation: `installRecorder` is called per case, `installAdapter()` lets a test set the adapter before the first import"
  - "Platform is mocked with jest.replaceProperty over the environment constants, not jest.mock: the jestMock ratchet counts jest.mock and has no headroom"
  - "Recorded response bodies are the decoded bytes, so content-length and transfer-encoding are dropped from the recorded response headers (the wire's gzip length would contradict the body file)"
  - "The anticheat download goldens keep the live data file whole (470 KB linux, 310 KB mac); the fixture tree is 4.6 MB"

patterns-established:
  - "An oracle test calls assertManifest (count equals cases.json, at or above the floor the test itself carries, one expected/ folder per case) and expectEmptyCasesToFail"
  - "A before-state with no store file has no state folder at all; withOracleProfile seeds only from a folder that exists"

requirements-completed: []

plan_head_before: d03b471db89c41ebdca840cf1bffc19216014f30
plan_head_after: 9b36e8e136cac879f03e630e890c7408c7d6d4e5

duration: 40min
completed: 2026-11-22
status: complete
---

# Phase 86 Plan 04: TS oracle and goldens for the zero-test slices Summary

**One axios-adapter recorder and one profile harness now drive the real TS for recent_games, game_overrides and anticheat, and 41 committed goldens pin their return values, store bytes, events and (for anticheat) the live requests, all before any Rust for those slices exists.**

## Performance

- **Duration:** about 40 min
- **Completed:** 2026-11-22
- **Tasks:** 3 of 3 (1 tracer, 2 auto)
- **Files:** 6 TS files created, `.prettierignore` modified, 189 fixture files

## Accomplishments

- **Tracer (Task 1).** recorder.ts and harness.ts run end to end on recent_games: 11 hand-authored cases (add to an absent list, to a populated list, an existing game moving to the head, the same game twice, an empty-appName entry dropped by the TS filter, a legacy entry with no runner kept, remove present, remove absent, remove on an empty list with no write and no event, a 60-entry list). Each runs `addRecentGame` / `removeRecentGame` over a synthetic `store/config.json` (other config keys kept so whole-file bytes compare), and records the result, every `recentGamesChanged` payload and the file bytes. The test also asserts the event bus carried the same list on every write. Compare is green, and emptying cases.json fails the suite on `scanned 0, below the floor of 9`. The tracer gate (re-run of the whole verify block) passed before Task 2.
- **game_overrides and anticheat (Task 2).** 14 overrides cases (get absent and present, getAll empty and populated, set a title, set the same override twice with identical bytes, replace-not-merge, art-only kept, an empty override clearing the entry and every `<appName>-*` image while `app1x-1.png` and `other-1.png` stay, the same cleanup for an absent entry, no images folder, no store file at all, attach with and without an override). 16 anticheat cases (lookup: mixed-case namespace, absent as `{"undefined": true}`, upper-case argument misses, entry with no epic id, undefined namespace, Windows, missing file, non-JSON file; download: matching MD5 makes no request and registers no callback, different MD5 on linux and mac, no local file on each, a local file with no latest hash, Windows, and a synthetic 503 that keeps the old file). Both real data URLs were recorded live from this machine; the golden `requests` list shows the mac case used the MacAnticheatData URL and the linux case the AreWeAntiCheatYet one, and `onlineCallbacksRegistered` is 0 for matching-MD5 and Windows (the D-07/D-28 check-then-wait order).
- **Redaction scan (Task 3).** `fixtureRedaction.test.ts` walks every file under the fixtures tree (floor 189) and fails on a query `key=`, `Bearer`, `Authorization` or `x-auth-token` value other than REDACTED, or a 32+ character `"token"` field. One self-test per rule plants a value and sees the failure; planting a `?key=SECRETVALUE` file in the tree also failed the whole-tree test and printed only the file and the rule. It imports no slice module.

Per-slice case counts and floors (MANIFEST `{count, floor}`; each oracle test also carries the floor in code, so editing the JSON alone cannot lower it):

| Slice | Cases | Floor |
| ----- | ----- | ----- |
| recent | 11 | 9 |
| overrides | 14 | 9 |
| anticheat | 16 | 11 |

## Task Commits

1. **Task 1 (tracer): recorder, harness, recent_games golden** - `37f4a1c61` (feat)
2. **Task 2: game_overrides and anticheat goldens, anticheat recorded live** - `08580b312` (feat)
3. **Task 3: permanent redaction scan** - `9b36e8e13` (test)

**Plan metadata:** the SUMMARY commit follows this file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The platform is switched with `jest.replaceProperty`, not a module mock**
- **Found during:** Task 1 (reading `meta/backendDiCeilings.cjs`)
- **Issue:** The plan says `mockPlatform` mocks `backend/constants/environment`. A `jest.mock` call in any file under `src/` is a counted ratchet entry, and a nonzero file with no shard entry fails `pnpm backend-di-ceilings`. The three oracle tests would each have needed a shard.
- **Fix:** `mockPlatform` uses `jest.replaceProperty` on `isMac`, `isLinux` and `isWindows` (plain writable properties, read at call time by the slice), and returns a restore function. The mac, linux and windows branches of anticheat all take effect (confirmed by the goldens: different URL per platform, no callback on Windows).
- **Files modified:** `oracle/harness.ts`
- **Commit:** `37f4a1c61`

**2. [Rule 1 - Bug] Recorded response headers dropped `content-length` and `transfer-encoding`**
- **Found during:** Task 2 (first live record)
- **Issue:** The http adapter hands back the decoded body, but the recorded `content-length` was the gzip length (59142 against a 469570 byte body file). A replay would serve a body that contradicts its own header.
- **Fix:** `realRequest` removes both framing headers; the body file is the truth. Re-recorded.
- **Files modified:** `oracle/recorder.ts`
- **Commit:** `08580b312`

### Additions beyond the plan's named surface

- `installAdapter()`: sets the shared adapter with no case installed, so a test can import its slice dynamically after the adapter exists and before the first case. `installRecorder` still sets it too.
- `Recorder.requested`: the `METHOD url` list (secrets redacted) of every request the TS made. The anticheat goldens record it as `requests`, which is what proves a replay really went through the recorder and not the network.
- `syncManifest`, `loadCases`, `snapshotFiles`, `json` in harness.ts, and `assertManifest` also checks that `expected/` holds exactly one folder per case.
- Extra cases beyond the plan's list, each a distinct TS decision: anticheat upper-case argument misses (only the file side is lower-cased), entry without an epic id, non-JSON data file, local file with no latest hash, synthetic 503; overrides replace-not-merge, art-only, absent-entry image cleanup, no images folder; recent legacy entry and remove-drops-empty-appName.
- The recorder also redacts a `"token"` JSON field in a response body and `set-cookie`, so the HowLongToBeat search-init token never reaches disk (86-06); the scan rule for it exists from this plan.

## Authentication gates

None. Both anticheat URLs are public and keyless.

## Issues Encountered

- `pnpm backend-di-ceilings` fails on two files this plan did not touch: `src/backend/storeManagers/steam/__tests__/optInDlc.test.ts` (6 jestMock, no baseline entry) and `src/frontend/state/__tests__/libraryStoreFollowers.test.ts` (2). Foreign failure, not fixed. Nothing under `src/backend/info` is named.
- `src/backend/stores/__tests__/storeOracle.test.ts`, which the plan's read_first cites as the compare-versus-write model, was deleted with the 85-21 store cutover. The model was reconstructed from `storePolicyVectors.test.ts` and the 85 golden NOTES.md.
- `pinClock` fakes only `Date` (so timers, `setImmediate` and streams keep working, which anticheat's MD5 stream needs) and sets `process.env.TZ`. Under jest `process.env` is a copy, so that does not reach the native date code: an oracle for a slice that formats dates (86-06 onward) must be run with `TZ=UTC` on the command line. None of these three slices formats a date.

## Known Stubs

None.

## Threat Flags

None. The recorder makes outbound requests only in record mode, only from a test, and only to the two public data URLs; the plan's T-86-08 (redaction plus scan) and T-86-09 (synthetic state) are as built. State fixtures are synthetic (`app1`, `Game 1`, `example.invalid` URLs); no operator library data or key is in any file.

## Next Phase Readiness

- 86-08, 86-10 and 86-12 have their goldens: `golden/<slice>/expected/<case>/{result.json, events.json, after/...}` plus `state/<slice>/<case>/` as the starting profile. The Rust side should treat a missing state folder as an empty profile.
- anticheat's `exchanges.json` is the array 86-03's `Replay::from_case` reads; every body file sits beside it. Two things 86-12 must handle: the recorded `authorization` and `x-auth-token` headers (when a later slice sends them) are `REDACTED`, and `Replay` pins `authorization` and `x-auth-token`, so those two comparisons need the redacted marker treated as "present"; and the recorded `user-agent` is `GameLib/0.11.0 (+...)`, the TS value, which Rust must send identically.
- 86-06 and 86-07 reuse `installRecorder` as is: `synthetic` for error paths, `rustOnly` (fetched in record mode only) and `tsOnly` flags are implemented but only `synthetic` is exercised by a committed case here.
- Regenerate: `GAMELIB_INFO_ORACLE=record` re-records anticheat from the live services (the data file will have changed upstream; follow with `GAMELIB_WRITE_INFO_GOLDEN=1`).
- The fixture tree is 4.6 MB, almost all of it the live anticheat data file (470 KB linux, 310 KB mac) held once in `recorded/` per case and once in each `after/` golden.

## Self-Check: PASSED

- Files: all six TS files present; `golden/{recent,overrides,anticheat}/MANIFEST.json` present; `recorded/anticheat` holds 8 case folders.
- Commits: `37f4a1c61`, `08580b312`, `9b36e8e13` are ancestors of HEAD.
- Verify: the four jest suites (56 tests) pass in compare mode, offline; eslint over `src/backend/info` clean; `pnpm codecheck` exit 0; `npx prettier --check` over the six TS paths clean and the fixture tree reported ignored; `pnpm planning-gates` 12/12; emptying `golden/recent/cases.json` fails the suite; a planted `?key=` file fails the redaction scan.
