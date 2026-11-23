---
phase: 87-engine-wine-and-tools
plan: 05
subsystem: testing
tags: [oracle, golden, jest, axios-recorder, spawn-trace, fake-home, redaction, gamelib-wine]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the gamelib-wine and gamelib-engine crates (87-02), whose tests/fixtures trees the goldens land in
  - phase: 86-info-services
    provides: the retired 86 oracle recorder and harness this one is generalised from
provides:
  - the shared TS oracle harness (withEngineOracleProfile, normalisePaths, writeOrCompareGolden, MANIFEST floors, deltas.json) under src/backend/testUtils/engineWineOracle/
  - the HTTP recorder with an allowLive guard and stubDownloadFile, the spawn-trace recorder over the ProcessRunner and spawnAsync seams, and the tree snapshot
  - the runtimes goldens (9 cases) and recorded lutris exchanges under gamelib-wine, committed before any Rust for wine
  - engineWineFixtureRedaction.test.ts, the permanent identity and secret scan over both crates' fixtures
affects: [87-06, 87-07, every later Phase 87 golden plan, the Rust gamelib-wine runtimes slice]

actuals:
  tokens: 21647
  tasks: 2
  commits: 2

plan_head_before: adb8edd64c697dd0b9fa2064d3f63c6a16522132
plan_head_after: 9b6a3e66c358b465fb252865398391e2d9522ff7

tech-stack:
  added: []
  patterns:
    - "one oracle harness per phase, parameterised by crate and slice: goldens under tests/fixtures/golden/<slice>/expected/<case>/{result,events,requests,spawns,tree}.json, recordings under recorded/<slice>/<case>/"
    - "every recorded path normalised to <HOME>, <USERDATA>, <APPFOLDER>, <TOOLS>, <TMP>; a seed path must begin with a placeholder"
    - "record mode only reaches the network through an allowLive predicate, so an archive body can never be downloaded by accident; archive bodies are synthetic"
    - "tree modes are recorded with group and other write bits cleared, so a golden does not depend on the machine's umask"

key-files:
  created:
    - src/backend/testUtils/engineWineOracle/harness.ts
    - src/backend/testUtils/engineWineOracle/recorder.ts
    - src/backend/testUtils/engineWineOracle/spawnTrace.ts
    - src/backend/testUtils/engineWineOracle/treeSnapshot.ts
    - src/backend/testUtils/engineWineOracle/__tests__/harness.test.ts
    - src/backend/wine/__tests__/oracle/runtimes.oracle.test.ts
    - src/backend/__tests__/engineWineFixtureRedaction.test.ts
    - src-tauri/crates/gamelib-wine/tests/fixtures/golden/runtimes/ (MANIFEST.json, cases.json, expected/ for 9 cases)
    - src-tauri/crates/gamelib-wine/tests/fixtures/recorded/runtimes/ (9 cases)
  modified:
    - .prettierignore

key-decisions:
  - "Response headers are recorded through an allow-list (content-type, etag, last-modified, link): a CDN edge adds cf-ray, whose colo names the operator's region, plus report-to and nel tokens a replay never needs"
  - "The recorder takes an allowLive predicate; the runtimes oracle allows only the lutris list in record mode, and the archive URL is served a synthetic body (T-87-11 enforced by code, not by a comment)"
  - "Synthetic response paths may be a RegExp, so the archive stub survives a new release tag in the live list"
  - "A case's starting state and inputs live in a hand-authored cases.json (seed entries use placeholders) so the Rust replay can read them; expected/ is only ever written by the harness"
  - "The runtimes list fetch is module-private, so list-runtimes observes it through a name the list does not hold; no production file was changed to export it"
  - "Redaction allow-lists the roles a prefix owns (shared, public, default, crossover, steamuser) and four synthetic BottleIDs; everything else under /Users, /home or C:\\Users fails"

patterns-established:
  - "Oracle tests build their synthetic archive body from in-repo test data and run the real tar through createRealRunner() wrapped by the spawn tracer"
  - "A harness self-test that must construct a spawn env derives it from createFakeHomeProfile(); fakeHomeIsolation.test.ts matches the eight key names textually, so even a destructuring pattern naming one trips it"

requirements-completed: [SVC-02]

duration: 11 min
completed: 2026-11-23
status: complete

coverage:
  - id: D1
    description: "A shared TS oracle harness: HTTP recorder with record, write and compare modes, spawn-trace recorder over ProcessRunner and spawnAsync, tree snapshot, path normalisation, golden write/compare and the MANIFEST floor guard"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/testUtils/engineWineOracle/__tests__/harness.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "The runtimes goldens (list, is-installed x5, download, re-download over an existing install, failed download) recorded live once and replayed offline, committed before any Rust for wine"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/wine/__tests__/oracle/runtimes.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "The permanent fixture redaction scan over both crates' fixtures, with planted negatives for a home path, an Authorization value and a real BottleID, and a floor"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/__tests__/engineWineFixtureRedaction.test.ts"
        status: pass
    human_judgment: false
---

# Phase 87 Plan 05: Oracle harness and the runtimes goldens Summary

**A shared TS oracle harness (HTTP, spawn-trace and tree recorders over a fake HOME) with the lutris runtimes goldens committed through it, and a permanent redaction scan that fails on any operator path, secret or real BottleID in either crate's fixtures.**

## Performance

- **Duration:** 11 min (2026-11-23T01:06Z to 01:17Z)
- **Tasks:** 2 of 2
- **Files:** 7 source and test files, 1 config, 67 fixture files

## Accomplishments

- `src/backend/testUtils/engineWineOracle/` holds `harness.ts`, `recorder.ts`, `spawnTrace.ts` and `treeSnapshot.ts`. `withEngineOracleProfile` mints a fresh `createFakeHomeProfile()` per case with a fixed layout (`<USERDATA>` and `<APPFOLDER>` are deliberately different directories), `normalisePaths` rewrites every profile root to a placeholder, and `writeOrCompareGolden` writes or compares `result.json`, `events.json`, `requests.json`, `spawns.json` and `tree.json`. `GAMELIB_ENGINE_ORACLE=record` and `GAMELIB_WRITE_ENGINE_GOLDEN=1` drive the modes.
- The runtimes slice is recorded: nine cases (`list-runtimes`, five `is-installed-*`, `download-eac-runtime`, `redownload-over-existing`, `download-http-404`). The lutris list was fetched live once; the archive is a synthetic body from the in-repo `ArchiveWithSubfolder.tar.xz`, extracted by the real `tar` and traced (`-xf <TOOLS>/runtimes/eac_runtime-20240114.tar.xz -C <TOOLS>/runtimes/eac_runtime --strip-components=1`). `MANIFEST.json` is `{count: 9, floor: 9}`; the oracle test asserts it through `assertManifest` and proves an empty case list fails.
- `engineWineFixtureRedaction.test.ts` imports no slice module, walks both crates' `tests/fixtures`, and fails on `/Users/<name>`, `/home/<name>`, `C:\Users\<name>` (raw or JSON-escaped), `key=`, Bearer, Authorization and x-auth-token values, a long `token` field, and any uppercase UUID in a `cxbottle.conf` or after `BottleID` that is not in the synthetic allow-list. Floor 67 files.
- `.prettierignore` gained entries for `gamelib-engine/tests/fixtures` and `gamelib-wine/tests/fixtures` in the 86 comment form.

## Task Commits

1. **Task 1 (tracer): harness plus the runtimes golden end to end** - `851523577` (test)
2. **Task 2: redaction scan, harness self-tests, vacuous-pass negatives** - `9b6a3e66c` (test)

Tracer gate: auto mode off, `HUMAN_VERIFY_MODE` end-of-phase, the tracer's `<verify>` is automated only, so it was re-run end to end after the commit and passed (`runtimes.oracle.test.ts` 11/11 offline, MANIFEST present and prettier-ignored, prettier clean). Tracer verified end-to-end, expansion followed.

## Verification

- `GAMELIB_WRITE_ENGINE_GOLDEN= GAMELIB_ENGINE_ORACLE= pnpm exec jest --runTestsByPath src/backend/wine/__tests__/oracle/runtimes.oracle.test.ts`: 11 passed, offline.
- `pnpm exec jest --runTestsByPath` over the redaction test, the harness test, the runtimes oracle and `fakeHomeIsolation.test.ts`: 4 suites, 54 tests passed.
- Acceptance: MANIFEST count 9 (>= 5); `grep -c "gamelib-wine/tests/fixtures" .prettierignore` is 1; the MANIFEST path reports `"ignored": true` under `prettier --file-info`.
- `npx prettier --check` over every `.ts` file written: clean. `npx eslint` over the new directories and the redaction test: clean. `npx tsc --noEmit -p tsconfig.json`: clean.
- Non-vacuity, by mutation: a planted `{"p":"/Users/alice/x","h":"Authorization: Bearer abc"}` fixture in the wine tree failed the scan on both rules (and was removed); making `normalisePaths` a no-op failed 4 harness and oracle tests (and was restored).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Response header allow-list in the recorder**
- **Found during:** Task 1 (inspecting the live lutris response headers)
- **Issue:** the 86 recorder redacted only secret headers. A live response carries `cf-ray` (its colo suffix names the operator's region), `report-to` and `nel` with report tokens: identity and noise in a committed fixture (T-87-10).
- **Fix:** `allowResponseHeaders` keeps `content-type`, `etag`, `last-modified`, `link` only, applied to live responses.
- **Files modified:** `src/backend/testUtils/engineWineOracle/recorder.ts`
- **Commit:** `851523577`

**2. [Rule 2 - Missing critical] allowLive guard and RegExp synthetic paths**
- **Found during:** Task 1
- **Issue:** T-87-11 says archive bodies are never downloaded, but nothing prevented record mode from fetching a real `.tar.xz` if the live list's archive path changed.
- **Fix:** `RecorderOptions.allowLive` makes record mode refuse (throw by name) any live request the case did not allow; synthetic `path` accepts a `RegExp`, so the archive stub matches whatever release tag the list carries. Self-tested.
- **Files modified:** `src/backend/testUtils/engineWineOracle/recorder.ts`, `harness.test.ts`
- **Commit:** `851523577`, `9b6a3e66c`

**3. [Rule 3 - Blocking] fakeHomeIsolation gate tripped by a test fixture literal**
- **Found during:** Task 2
- **Issue:** `fakeHomeIsolation.test.ts` matches the eight key names textually in any file that calls `.run(`; my first spawn-tracer self-tests wrote `HOME:` and a destructuring `XDG_DATA_HOME:` and failed it.
- **Fix:** both tests derive their env from `createFakeHomeProfile()` and drop the key with a `filter`.
- **Files modified:** `src/backend/testUtils/engineWineOracle/__tests__/harness.test.ts`
- **Commit:** `9b6a3e66c`

**4. [Rule 3 - Blocking] knip dead-export ratchet**
- **Found during:** Task 2 (`pnpm find-deadcode`)
- **Issue:** 11 new findings from harness exports with no consumer yet.
- **Fix:** unexported `json`, `seedProfile`, `Manifest`, `REDACTED`, `redactBody`, `RecordedExchange`, `RustOnlyRequest`, `ScriptedOutput`, `SpawnRecord`; `pinClock` stays exported and is tagged `@public` for the clock-driven goldens in later plans.
- **Files modified:** `harness.ts`, `recorder.ts`, `spawnTrace.ts`
- **Commit:** `9b6a3e66c`

### Plan interpretation (not defects)

- **`cases.json` and a fifth golden file.** The plan lists four expected files; `requests.json` is added so the Rust replay pins the request list, and a hand-authored `cases.json` (never written by the harness, seed entries use placeholders) carries each case's inputs for the Rust side. `expected/` stays harness-written only.
- **`list-runtimes` goes through `download` with an unlisted name.** `_get` is module-private and no production file is in this plan's scope; the case still records exactly the one GET of the list and the created runtimes directory.
- **`stubDownloadFile` is built and self-tested but unused by the runtimes slice.** `downloadFile` there goes through the axios adapter, which serves the synthetic archive. The stub is for the wine-manager's EasyDl flow (87-07).
- **TDD (Task 2).** The behaviour under test (the harness) was committed in Task 1 as the plan's tracer, so a RED that fails on missing code was not available. The tests were instead proved non-vacuous by mutation (see Verification), the evidence a RED would have given.

**Total deviations:** 4 auto-fixed (2 Rule 2, 2 Rule 3). **Impact:** none on scope; two are hardening of the recorder beyond the 86 original.

## Issues Encountered

- `pnpm find-deadcode` still reports one finding this plan did not introduce: `src/backend/testUtils/portSliceGate.ts` export `manifest`. Logged in `deferred-items.md`, not fixed (out of scope).

## Known Stubs

None.

## Threat Flags

None. The only new network surface is record mode's single GET of `https://lutris.net/api/runtimes`, which is the `allowLive` allow-list and was in the plan's trust boundaries.

## Next Phase Readiness

Later golden plans add cases only: call `withEngineOracleProfile`, `installRecorder`, `createSpawnTracer`, `snapshotTree` and `writeOrCompareGolden`, raise `FILE_FLOOR` in the redaction test by the files they commit, and draw any BottleID from `SYNTHETIC_BOTTLE_IDS`. 87-07 adds the wine-manager cases to this crate's goldens.

## Self-Check: PASSED

All created files exist on disk; commits `851523577` and `9b6a3e66c` are ancestors of HEAD; acceptance criteria and plan-level verification re-run green.
