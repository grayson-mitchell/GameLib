---
phase: 84-logger
plan: 01
subsystem: testing
tags: [golden, oracle, jest, log-writer, frame-vectors, live-gate-contract, uat]

requires:
  - phase: 83-native-seam-gamelib-core-and-process-shutdown-contract
    provides: the closed live macOS gate (D-02), the exit lines and reaper line this contract scores in their new sink
provides:
  - the TS log oracle test (logGolden.test.ts) with 69 cases, compare mode by default and GAMELIB_WRITE_LOG_GOLDEN=1 write mode
  - the committed golden tree (cases.json, entries.json, expected/, NOTES.md) generated from the unmodified TS writer
  - shared kind:"log" frame vectors (11 valid, 19 invalid) for jest and cargo
  - 84-HUMAN-UAT.md, the live macOS gate contract with the post-84 sink partition and a seven-test Structural Reachability Review
affects: [84-02, 84-03, 84-04, 84-05, 84-06, 84-07, 84-08, 84-09, 84-11]

actuals:
  tokens: 68000
  tasks: 4
  commits: 6
plan_head_before: 46a96c46413130d06040008d0f35545bc2c108f6
plan_head_after: b90e6a2f24782fb2a97d7c15e52e617faa7103c2

tech-stack:
  added: []
  patterns:
    - "TS oracle drives the real LogWriter into a temp tree under fake Date only; index.ts is mocked so the oracle is independent of the facade it will outlive"
    - "frame entries recorded per writer instance; consumers compare wall-clock time (ts + tz*60000) so fixtures are host-timezone independent"
    - "golden expected tree is -text in .gitattributes so CRLF fixtures stay byte-exact"

key-files:
  created:
    - src/backend/logger/__tests__/logGolden.test.ts
    - src-tauri/crates/gamelib-log/tests/fixtures/golden/cases.json
    - src-tauri/crates/gamelib-log/tests/fixtures/golden/entries.json
    - src-tauri/crates/gamelib-log/tests/fixtures/golden/expected/
    - src-tauri/crates/gamelib-log/tests/fixtures/golden/NOTES.md
    - src/common/__fixtures__/logFrameVectors.json
    - .planning/phases/84-logger/84-HUMAN-UAT.md
  modified:
    - .prettierignore
    - meta/backendDiCeilings/logger.json
    - .gitattributes

key-decisions:
  - "Phase 83 precondition judged met from the closed record (83-HUMAN-UAT.md 5/5 passed, 83-UAT.md complete, 83-VERIFICATION.md passed, ROADMAP ticked), not from 83-11-SUMMARY.md alone, which still reads 3 pass / 2 issues"
  - "One frame per writer instance; an accepted entry that yields no line still claims the rotation (frame with rotate true and no entries), mirroring the TS gate that is claimed before the empty-message check"
  - "The Logging to file(s) line is not a forwarder entry: the Rust writer derives it from rotate true on a non-general target, so it appears in the expected tree only"
  - "Crate origin for item 7 is defined as message text found by no grep over src/backend, compared across launches 3 and 4, because a TS logDebug with the Steam prefix would otherwise pass as a crate line"

patterns-established:
  - "Golden cases with oracle:false are hand-written with a divergenceNote (shell-line)"
  - "A case that writes no file has no expected directory; the directory-set test accounts for it"

requirements-completed: [FND-05]

coverage:
  - id: D1
    description: "TS log oracle test and golden tree covering every level and prefix, message kinds, raw chunks, rotation, close and renderer sanitiser cases"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "src/backend/logger/__tests__/logGolden.test.ts (70 tests, compare mode)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Shared kind:log frame vectors for jest and cargo"
    requirement: FND-05
    verification:
      - kind: other
        ref: "node count and reason check over src/common/__fixtures__/logFrameVectors.json (11 valid, 19 invalid, 6 path-segment) plus prettier --check"
        status: pass
    human_judgment: false
  - id: D3
    description: "Live macOS gate contract 84-HUMAN-UAT.md with the post-84 sink partition and the seven-test review; never run by this plan"
    requirement: FND-05
    verification:
      - kind: other
        ref: "gsd-core parseUatItemsWithStats returns 8 items, headingsSeen 0; frontmatter parses as YAML; pnpm planning-gates 12/12"
        status: pass
    human_judgment: true
    rationale: "The contract's reachability verdicts are authoring-time judgements about Phase 84 code that does not exist yet; plan 84-11 re-checks every CONDITIONAL row against real source and runs it live."

duration: not measured (start time not recorded; roughly an hour of work)
completed: 2026-11-21
status: complete
---

# Phase 84 Plan 01: Golden, frame vectors and live gate contract Summary

**The logger's "before" is pinned: a 69-case golden generated from the real TS LogWriter, formatter and renderer sanitiser with a jest oracle that re-proves it every run, shared `kind:"log"` frame vectors, and the live macOS gate contract (eight pending items, post-84 sink partition, seven-test reachability review) authored and not run.**

## Performance

- **Duration:** not measured (start time not recorded)
- **Completed:** 2026-11-21
- **Tasks:** 4
- **Files modified:** 102 files in the plan's commits (95 of them golden expected files)

## Accomplishments

- `logGolden.test.ts` drives real `LogWriter` instances into a fresh temp tree per case under a fake `Date` only (promises, fs and the loop stay real), tokenises the temp root as `${LOGDIR}`, and compares every file, `entries.json` (by wall-clock time) and the set of case directories. Write mode regenerates from the unmodified TS writer.
- 69 cases: every level against General, Backend, Steam, Frontend and ProtocolHandler; array, Error, object, number, boolean, Promise, empty and whitespace-only messages; raw chunks including a whitespace-only chunk, CRLF and unicode; rotation (existing to `.old`, `.old` overwritten, second instance rotates again, disabled never rotates, forceLog on a disabled writer rotates, general, and the `Logging to file(s)` line for runner, game and gogRedist); close; and 12 renderer cases (LF, CRLF, the IN-04 forge, U+2028, 65,537-unit string, 257-entry array, key-order objects, empty object). One hand-written `shell-line` case (`oracle: false`, divergenceNote naming D-01).
- `logFrameVectors.json`: 11 valid and 19 invalid frames with stable reason categories (unknown-field, shape, prefix, level, runner, type, path-segment, too-large) and one `generate` stanza for the over-cap frame.
- `84-HUMAN-UAT.md`: launch recipe, sink partition after Phase 84, deliberate changes, preflight P1-P7, dual-sink evidence capture, ten-row required-literal table, eight UAT-shaped items over four launches, withdrawals (delete-uploaded, rate limiter, Windows), and a Structural Reachability Review applying all seven tests, with the Test 5 pairing pass (88 pairs considered, 7 flagged).
- The golden dir is prettier-ignored with a reason; `meta/backendDiCeilings/logger.json` carries the exact jestMock count (1) for the new suite in the same commit as the first jest.mock.

## Task Commits

1. **Task 1: Tracer, the oracle end to end for three cases** - `747e0ce93` (test)
2. **Task 2: Full behaviour-inventory case list with NOTES.md** - `7282a4069` (test), plus the byte-exact fix `7bfaef7fc` and `4de4f81a3` (fix)
3. **Task 3: Shared log frame vectors** - `01167bb93` (test)
4. **Task 4: Live macOS gate contract and plan-end gates** - `b90e6a2f2` (docs)

**Tracer gate:** the tracer's `<verify>` is automated-only, so it was re-run end to end after the commit (jest, `.old` produced, golden dir ignored, prettier) and passed before expansion: Tracer verified end-to-end, expanded.

**Mutation check (Task 2 acceptance):** changing one byte of `expected/line-number/gamelib.log` (`42` to `43`) made the oracle test fail (`1 failed, 69 passed`); the file was restored and the suite returned to 70 passed. The file is unchanged in git.

## Files Created/Modified

- `src/backend/logger/__tests__/logGolden.test.ts` - the oracle driver (type `GoldenCase`, env `GAMELIB_WRITE_LOG_GOLDEN`)
- `src-tauri/crates/gamelib-log/tests/fixtures/golden/{cases.json,entries.json,NOTES.md,expected/}` - the golden
- `src/common/__fixtures__/logFrameVectors.json` - shared frame vectors
- `.planning/phases/84-logger/84-HUMAN-UAT.md` - the live gate contract
- `.prettierignore`, `meta/backendDiCeilings/logger.json`, `.gitattributes` - ignore entry, jestMock count, byte-exact pin

## Decisions Made

- Precondition: Phase 83 is closed. `83-11-SUMMARY.md` still records the original 3 pass / 2 issues verdict; the two residual items were re-observed and passed (`83-UAT.md` complete, 3 of 3), `83-HUMAN-UAT.md` now reads 5 of 5 passed, `83-VERIFICATION.md` is `passed`, and ROADMAP is ticked. I treated the intent of D-02 (execute only after 83 closes) as met and proceeded, as the dispatch instructed after re-checking from the files.
- Frames are per writer instance; an empty or whitespace first entry still claims the rotation (frame with `rotate: true`, no entries), because the TS gate is claimed before the empty check. `shell-line` carries no frame entry (Rust-originated).
- Item 7 defines a crate-origin line by message text (no match in `src/backend`) instead of by prefix, so a TS `logDebug(..., Steam)` line cannot pass as crate output in launch 3 or fail launch 4.
- Upload evidence records only the URL host and entry name; the upload uses a benign log the operator chooses (T-84-02).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Git normalised CRLF in a golden fixture**
- **Found during:** Task 2 (commit warning: CRLF will be replaced by LF)
- **Issue:** the repo-wide `* text=auto eol=lf` stored `expected/chunks-crlf-and-unicode/games/480_steam/launch.log` with LF, so the CRLF case would compare the wrong bytes on a fresh checkout.
- **Fix:** added `src-tauri/crates/gamelib-log/tests/fixtures/golden/expected/** -text` to `.gitattributes`, then re-added the file with `git add --renormalize`; the index now holds the CRLF bytes (`git ls-files --eol`: one `i/mixed w/mixed`, the rest LF).
- **Files modified:** `.gitattributes`, the one fixture file
- **Verification:** `git show HEAD:<path> | od -c` shows `\r\n`; oracle test passes
- **Committed in:** `7bfaef7fc`, `4de4f81a3`

**2. [Rule 1 - Bug] Three lint errors in the new test file**
- **Found during:** Task 4 plan-end gates (`pnpm lint`, tests scope)
- **Issue:** three `no-unnecessary-type-assertion` errors (`prefix as LogPrefix`; `LogPrefix` as a type is `string`)
- **Fix:** removed the assertions
- **Files modified:** `src/backend/logger/__tests__/logGolden.test.ts`
- **Verification:** `pnpm lint` 0 errors, codecheck 0, oracle 70 passed
- **Committed in:** `b90e6a2f2`

---

**Total deviations:** 2 auto-fixed (2 bugs). **Impact:** both necessary for correctness of the golden and the plan-end gates; no scope change. `.gitattributes` is outside the plan's `files_modified` list.

## Issues Encountered

None beyond the deviations above. The working tree held unrelated uncommitted work (bridge, SteamEngineLaunchNotice, planning debris); none was touched or staged.

## Known Stubs

None. The `shell-line` case is hand-written by design and marked `oracle: false` with a `divergenceNote`.

## Threat Flags

None. T-84-01 (contract authored before code and never run by its author), T-84-02 (benign upload, URL host and name only), T-84-03 (compare mode default, write mode gated by `GAMELIB_WRITE_LOG_GOLDEN=1`, one-byte mutation recorded) are mitigated as planned.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 84-02 can implement the Rust writer against `golden/expected` and `entries.json`, and the serde frame structs against `logFrameVectors.json`.
- 84-11 owns running `84-HUMAN-UAT.md` and re-checking every CONDITIONAL literal in Task 1 of that plan.
- `src-tauri/crates/gamelib-log` exists only as a fixtures directory (no Cargo.toml); the workspace `members` list is explicit, so cargo is unaffected until 84-02 adds the crate.

## Self-Check: PASSED

- Files exist: `logGolden.test.ts`, `cases.json`, `entries.json`, `expected/`, `NOTES.md`, `logFrameVectors.json`, `84-HUMAN-UAT.md` (all FOUND).
- Commits exist and are ancestors of HEAD: `747e0ce93`, `7282a4069`, `7bfaef7fc`, `4de4f81a3`, `01167bb93`, `b90e6a2f2`.
- Acceptance: GAMELIB_WRITE_LOG_GOLDEN present, `jest.mock('../index'` count 1, cases.json 69, `.prettierignore` entry 1, ceilings entry 1, `Logging to file(s)` golden files 19, `0600` in NOTES.md, vectors 11/19/6, UAT 8 items with headingsSeen 0.
- Plan-end gates at the last code commit: `pnpm codecheck`, `pnpm lint` (0 errors), `pnpm find-deadcode`, `pnpm backend-di-ceilings`, `pnpm planning-gates` (12/12) all exit 0.

---
*Phase: 84-logger*
*Completed: 2026-11-21*
