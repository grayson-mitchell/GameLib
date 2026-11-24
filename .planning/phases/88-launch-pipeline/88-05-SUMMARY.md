---
phase: 88-launch-pipeline
plan: 05
subsystem: known-fix-goldens
tags: [knownfix, golden, oracle, pairwise, incident-census, launch-overrides, svc-03]

requires:
  - phase: 88-launch-pipeline
    plan: 03
    provides: the gamelib-knownfix crate, whose tests/fixtures root (prettier-ignored) holds the goldens
  - phase: 88-launch-pipeline
    plan: 04
    provides: launchOracle (withPinnedBaseEnv, injectPlatform, withInjected, allPairs and uncoveredPairs, tsTestTitles and assertCasesCoverTitles)
provides:
  - src/backend/__tests__/oracle/knownFixReader.oracle.test.ts and knownFixReader.cases.ts (the reader oracle and its case builder)
  - src/backend/__tests__/oracle/knownFixLaunch.oracle.test.ts (the launch-override oracle)
  - gamelib-knownfix/tests/fixtures/golden/reader (125 cases) and golden/launch_overrides (19 cases), each with cases.json, deltas.json, MANIFEST.json and expected/<case>/
  - seedProfile exported from testUtils/engineWineOracle/harness.ts
affects: [88.1, 88-08, 88-09]

actuals:
  tokens: 48650
  tasks: 2
  commits: 2
commits: 2
plan_head_before: c1bb12822d5db447212a50de0c7d73ddc0a6a026
plan_head_after: 8c7cd1eb364a18beefbf7090add2c385095448c8

tech-stack:
  added: []
  patterns:
    - "a case builder module whose output is written to cases.json in write mode and compared to it in compare mode, so the list the Rust replay reads cannot drift from the list that was recorded"
    - "multi-step cases: each step removes, seeds, then calls, so one fake HOME carries a layer walk (remove the winner, read again) and the it.each titles keep one case per title"
    - "the census checks both directions: every test title is a case id and every case id of a stem is a test title"

key-files:
  created:
    - src/backend/__tests__/oracle/knownFixReader.oracle.test.ts
    - src/backend/__tests__/oracle/knownFixReader.cases.ts
    - src/backend/__tests__/oracle/knownFixLaunch.oracle.test.ts
    - src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/reader
    - src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/launch_overrides
    - .planning/todos/pending/2026-11-25-known-fix-readers-read-undefined-store-file-for-sideload.md
  modified:
    - src/backend/testUtils/engineWineOracle/harness.ts

key-decisions:
  - "cases.json is written by the oracle test in write mode from a TS builder (knownFixReader.cases.ts) rather than typed by hand: 45 pairwise rows and 74 named cases are too many to author as JSON, and compare mode asserts the committed file equals the builder, so neither can drift"
  - "A step records every reader it calls: result.json holds each answer by reader name and events.json one line per log call tagged with step and reader, so the Rust replay checks the answers and the warning count of each reader separately"
  - "The parser message after 'ignoring.\\n' in the malformed-JSON warning is recorded as the token <PARSER-MESSAGE>, not Node's text, so the golden does not move with the Node version; deltas.json documents it"
  - "The traversal and escape targets are planted inside the fake HOME (appName ../x, ../../deep-escape, an absolute <HOME> path), so each case is discriminating: the file exists, the answer is still null with the containment warning"
  - "A wrong-case spelling of an existing file is not recorded: it is accepted on a case-insensitive volume and rejected on a case-sensitive one. The mixed-case case holds a file really spelled Data/Game.EXE and asks for exactly that"

patterns-established:
  - "A name-by-title case id (<file-stem>--<slug(title)>) plus a one-for-one census against tsTestTitles gives a port a checkable 'no incident dropped' guarantee"

requirements-completed: [SVC-03]

coverage:
  - id: D1
    description: "The reader slice holds 45 pairwise rows over runner x local x bundled x remote layer state (absent, valid, malformed, routing-only, tier-2-only, tier-2 keys in a tier-1 file), covering every legal pair"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/__tests__/oracle/knownFixReader.oracle.test.ts#the pairwise rows cover every legal pair of runner and layer states"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 74 titles of the seven reader test files (knownFixes, Layered, WithLayer, GamelibStatus, MacArch, Drm, Overlay) are named golden cases, one for one; the two seed-data files are listed as not ported with the 88-08 reason"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/__tests__/oracle/knownFixReader.oracle.test.ts#incident census (D-14) (10 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Prohibition 6 is pinned by data: a remote tier-1 file carrying registry, dllOverrides, overlays, shimFeatures, steamSharedRedists or evidence yields only the tier-1 keys, readKnownFixProfile and readGamelibFixStatus answer null, and keys outside the 12-key allow-list are dropped"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "knownFixReader.oracle.test.ts#records that a remote-layer file carrying tier-2 keys yields no tier-2 data; goldens remote-tier-2-keys-yield-no-tier-2-data and remote-keys-outside-the-allow-list-are-dropped"
        status: pass
    human_judgment: false
  - id: D4
    description: "Traversal appNames (../x, ..\\x, an absolute path, ../../etc/x per layer) are named cases whose recorded answer is null plus the containment warning; the backslash form is recorded on POSIX, where it does not traverse, and its Windows difference is in deltas.json"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "goldens traversal-dotdot, traversal-backslash, traversal-absolute and knownFixesLayered--...rejects-a-traversing-appname-in-the-s-layer, recorded and compared"
        status: pass
    human_judgment: false
  - id: D5
    description: "The launch_overrides slice holds 19 cases: the 10 titles of knownFixLaunch.test.ts plus a symlink inside the install, a mixed-case path, a directory where the exe is named, empty and NUL overrides, an empty install path and four overrides-over-a-seeded-layer cases"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/__tests__/oracle/knownFixLaunch.oracle.test.ts (23 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "MANIFEST floors equal the recorded counts (125 and 19), an empty case list fails, and nothing reads the real profile: every case runs on a fresh fake HOME under withPinnedBaseEnv with an injected platform"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "both oracle tests, the manifest and empty-list tests, run in compare mode with GAMELIB_WRITE_ENGINE_GOLDEN and GAMELIB_EW_ORACLE unset (163 tests)"
        status: pass
    human_judgment: false

duration: 40min
completed: 2026-11-25
status: complete
---

# Phase 88 Plan 05: Known-fix reader and launch-override goldens Summary

**The tier-1 and tier-2 known-fix readers, the GameLib status probe and the launch overrides are pinned by committed TS goldens before any Rust for them exists: 45 pairwise layer vectors, a named case for each of the 74 reader incident tests, and 19 launch-override cases on seeded install trees.**

## Performance

- **Duration:** about 40 min (start time was not recorded at launch; estimated from the clock)
- **Completed:** 2026-11-25
- **Tasks:** 2 (one tracer, one auto)
- **Files:** 3 test files, 1 todo and 1 export in the shared harness; 2 golden slices (125 and 19 cases)

## Accomplishments

- **Tracer (Task 1):** `knownFixReader.oracle.test.ts` records `readKnownFixes`, `readKnownFixesWithLayer`, `readKnownFixProfile` and `readGamelibFixStatus` per case on a fresh fake HOME with the bundled layer at `<HOME>/public/fixes`, the logger spied (not mocked), `withPinnedBaseEnv` and platform `mac`. 45 pairwise rows from `allPairs` over runner x local x bundled x remote with six layer states each; `uncoveredPairs` over the rows is `[]`. Six named incident cases: three traversal forms, a remote layer carrying tier-2 keys, remote keys outside the allow-list, a sideload runner. Verified end to end and compared before Task 2 started.
- **Named incidents (Task 2):** 74 cases, id `<file-stem>--<slug(title)>`, one for every `it` / `test` title of the seven reader files, including each `it.each` title as one case with a step per row. The census proves the mapping both ways. `knownFixesCegSeeds` (3 titles) and `knownFixesMacArchSeeds` (1) are listed as not ported with the reason "a data check over the repo's public/fixes, ported as a Rust data test in 88-08"; no source-text gate was in the seven files, so none is excluded.
- **Launch overrides:** `knownFixLaunch.oracle.test.ts` covers the 10 titles plus the shapes D-14 names: a symlink inside the install (accepted), symlinks escaping it (file and directory), a symlinked install root, a missing exe, a directory where the exe is named, a mixed-case path with the exact spelling, empty and NUL overrides, an empty install path, and `readKnownFixLaunchOverrides` over a real seeded layer (the TS test mocked the reader). The exe-override info line records the resolved path as `<HOME>/...`.
- **Manifests:** `reader` 125 (floor 125), `launch_overrides` 19 (floor 19); each oracle test carries its own floor constant and an empty-list failure test.

## Task Commits

1. **Task 1: Tracer, the reader oracle end to end** - `95a90637c` (test)
2. **Task 2: Every reader incident test as a named case, and the launch-override slice** - `8c7cd1eb3` (test)

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md and ROADMAP.md.

## Decisions Made

See `key-decisions` above.

## Quirks recorded, not fixed (D-20)

- **Sideload reads `<id>-undefined.json`.** `storeMap.sideload` is `undefined`, so three of the four readers look for `app1-undefined.json`; `readGamelibFixStatus` guards it and answers null for the same file. Recorded as `sideload-reads-the-undefined-store-file` and the sideload pairwise rows; filed as `.planning/todos/pending/2026-11-25-known-fix-readers-read-undefined-store-file-for-sideload.md` (minor, any, code).
- **A traversing appName warns once per layer** (three times from `readKnownFixes`, four from `readGamelibFixStatus`): noisy, not wrong. Recorded as is; no todo.

## TDD notes

Not a TDD plan. Goldens were recorded once with `GAMELIB_WRITE_ENGINE_GOLDEN=1` and then run in compare mode.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `seedProfile` was private to the shared harness**
- **Found during:** Task 1 (a multi-step case seeds again between steps; the harness seeds only at profile creation)
- **Fix:** added `export` to `seedProfile` in `src/backend/testUtils/engineWineOracle/harness.ts` and extended its doc comment. No behaviour change; `wineCore.oracle.test.ts` still passes (22 tests).
- **Files modified:** src/backend/testUtils/engineWineOracle/harness.ts
- **Committed in:** 95a90637c

**2. [Rule 1 - Bug] Two host-dependent recordings caught before they were committed**
- **Found during:** Task 2 (reading the recorded launch goldens)
- **Issue:** the missing-install warning printed `/private<HOME>/games/nope` on macOS (the temp directory sits behind the `/var` link and `normalisePaths` matched the unresolved root inside the resolved one), and a second step of the mixed-case case asked for `bin\Game.EXE` over a file spelled `Bin/Game.EXE`, which only resolves on a case-insensitive volume.
- **Fix:** a `dropRealpathPrefix` pass over the recorded result and events, and the mixed-case tree moved to `Data/Game.EXE` asked for in its exact spelling (also keeps it from colliding with `bin` on a case-insensitive volume). Re-recorded; nothing under `/private` remains in the golden.
- **Files modified:** src/backend/__tests__/oracle/knownFixLaunch.oracle.test.ts
- **Committed in:** 8c7cd1eb3 (never committed in the broken form)

### Scope additions (inside the plan's intent)

- `cases.json` is generated from `knownFixReader.cases.ts` (reader) and an in-file builder (launch) instead of hand-typed, with a compare-mode test that the committed file equals the builder; the plan called it hand-authored. The builder lives in a second file, `knownFixReader.cases.ts`, which is not in the plan's `files_modified`.
- The reader census asserts the case ids of each stem equal the slugs of its test titles (a one-for-one check), beyond the plan's coverage check.
- `deltas.json` has two entries for `reader` (the parser message, the Windows meaning of a backslash appName) and two for `launch_overrides` (Node versus Rust OS error text, the unrecorded wrong-case spelling); the plan asked for the parser-message entry.
- "Non-regular file" is covered by a directory where the exe is named; a FIFO was not seeded because `SeedEntry` has no such kind and a FIFO cannot be made on Windows.

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug), 4 scope additions
**Impact on plan:** none on the goldens' content or the acceptance criteria; counts are 125 (needed 114) and 19 (needed 11).

## Issues Encountered

None beyond the above. `pnpm planning-gates` (12 of 12), `tsc --noEmit`, eslint over `src/backend/__tests__/oracle` and the harness, and `npx prettier --check` over the three test files and the case builder are clean. The golden directory is prettier-ignored (`--file-info` reports it ignored), so no formatter check is made over it.

## Known Stubs

None.

## Threat Flags

None. T-88-10 (path containment) and T-88-11 (remote layer carrying tier-2 keys) are mitigated as planned by named goldens; T-88-SC added no package.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 88-08 replays `golden/reader` (cases.json steps, expected result.json and events.json, deltas.json) and ports the two seed-data tests as Rust data tests over `public/fixes`; 88-09 replays `golden/launch_overrides`.
- Both replays substitute their own FakeHome for the placeholders (`<HOME>`, `<APPFOLDER>`); layer directories are `<APPFOLDER>/fixes/local`, `<HOME>/public/fixes` and `<APPFOLDER>/fixes`.
- The wineCore oracle's header says the shared `engineWineOracle` harness is deleted with the D-22 twins in Phase 88; both oracles here import it (`withEngineOracleProfile`, `seedProfile`, `normalisePaths`, `writeOrCompareGolden`, the manifest helpers), so whichever plan deletes it has to carry those over first, as 88-04 already noted.

## Self-Check: PASSED

Created files all exist on disk (the three test files, the case builder, both golden slices with MANIFEST.json, the todo); commits `95a90637c` and `8c7cd1eb3` are ancestors of HEAD; both oracle tests pass in compare mode (163 tests); the MANIFEST counts are 125 and 19 with floors equal; `pnpm planning-gates` 12 of 12.

---
*Phase: 88-launch-pipeline*
*Completed: 2026-11-25*
