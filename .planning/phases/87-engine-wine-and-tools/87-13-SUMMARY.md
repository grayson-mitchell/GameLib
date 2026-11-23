---
phase: 87-engine-wine-and-tools
plan: 13
subsystem: testing
tags: [oracle, golden, jest, engine-decision, demo-status, g29, wr01, fake-home, gamelib-engine]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the oracle harness, spawn tracer, tree snapshot and redaction scan (87-05); the fixture bottles and a worked engine golden plan (87-11, 87-12)
provides:
  - the engine-decision oracle test and 122 goldens under gamelib-engine/tests/fixtures/golden/decision (launch matrix, G29 two-probe rule, WR-01 cx-inconclusive, setting edges, preflight, creation, option list, is-missing, Wine Manager staging, the CrossOver locator)
  - 40 goldens under golden/demo_status (the --demo-status probe, parseDemoStatus, readCrossoverBuild, the tested-version and untested-notice rules, crossoverBinDirFromWineBin)
affects: [87-44, 87-45, 87-46, the Rust engine decision and demo-status slices]

actuals:
  tokens: 1445962
  tasks: 2
  commits: 2

plan_head_before: ef0f95dd3598773b8eed978494c9b8efd9c7a282
plan_head_after: 547d13e15a848385140ad4aabfe996417b8190fa

tech-stack:
  added: []
  patterns:
    - "the case list is generated in code (the cross product plus named edge families); write mode writes cases.json (inputs only) and compare mode asserts the committed file equals what the generator produces, so the Rust replay reads cases.json and the TS cannot drift from it"
    - "the real --demo-status probe runs over the spawn tracer with one scripted step per attempt (the last repeating), so every probe's argv, env diff and stdin is a recorded spawn and the probe results come from real stdout parsing"
    - "every dependency call is recorded in order as one compact string per item (calls: a > b > c), not an array, to keep 1823 recorded items readable and the tree small"
    - "Date is pinned with pinClock so the probe's elapsedMs is 0 in the recorded logs and results"

key-files:
  created:
    - src/backend/engine/__tests__/oracle/engineDecision.oracle.test.ts
    - src-tauri/crates/gamelib-engine/tests/fixtures/golden/decision/ (MANIFEST.json, cases.json, expected/ for 122 cases)
    - src-tauri/crates/gamelib-engine/tests/fixtures/golden/demo_status/ (MANIFEST.json, cases.json, expected/ for 40 cases)
  modified:
    - src/backend/__tests__/engineWineFixtureRedaction.test.ts

key-decisions:
  - "the matrix is 80 cases of 15 items (CrossOver x setting x offline x bottle per case, pins x marker per item); the plan's pruning allowance was not needed, no combination is rejected before deciding"
  - "pins {current, retired, none} are read as the pin table plus what is installed: current = the shipped table with the current pin installed; retired = a table that also holds a previous pin (wine-staging-11.1) with only that one installed; none = the shipped table with nothing installed"
  - "CrossOver 'inconclusive' is a probe that times out; whether it stays inconclusive depends on the busy or idle bottle (busy: not retried, no wineserver stop; idle: retried, then broken), which is why the bottle dimension is a full axis"
  - "every launch item is recorded with offline no and yes; decideLaunchEngine is always called, so the decision is pinned whether or not the offline gate would have refused first, and the gate's inputs and verdict are part of each item"
  - "restoreNeedsAbsentPin is derived in the oracle (non-CrossOver marker and the current pin not installed); the engine switch's own read of the disk is 87-11's"
  - "the CrossOver locator is recorded for the sync resolver with hintWineBins, a crossover wineVersion and the default locations; the operator's /Applications is a scripted answer through a graceful-fs existsSync spy, never read, and the Spotlight (mdfind) async arm is out of scope"

requirements-completed: [SVC-02]

duration: 8 min
completed: 2026-11-23

status: complete

coverage:
  - id: D1
    description: "D-08/D-20 decision matrix: decideLaunchEngine over CrossOver {healthy, missing, expired, broken, inconclusive} x pins {current, retired, none} x marker {none, crossover, pinned, wine-manager, null pinId} x setting {Automatic, forced CrossOver, forced pin, forced wine-manager} x offline {yes, no} x bottle {busy, idle}, recorded as {kind, selection, preflight, logLines} with every dependency call in order"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/engineDecision.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-16 as corrected by research: WR-01 recorded as shipped (reason cx-inconclusive, the marker's engine kept, no wineserver stop, the marker only read, the tree unchanged), over all seven marker shapes and all three pin states, under all four settings"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/engineDecision.oracle.test.ts#a cx-inconclusive golden keeps the marker, stops no wineserver, reads the marker only and writes nothing (WR-01)"
        status: pass
    human_judgment: false
  - id: D3
    description: "the G29 two-probe rule and WR-07: nonzero, timeout and spawn error each retried once; two in a row broken; a busy bottle or a running or starting title never retried on a timeout and never has its wineserver stopped; invalid bottle names inconclusive without a spawn"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/engineDecision.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-08 demo-status: stdout fixtures plus the argv, env and stdin trace (wine --demo-status, CX_BOTTLE, empty stdin, 15 s cap, 64 KiB buffer) for Standard, trial, expired, timeout, nonzero exit, spawn error, truncated output and over-long and unsafe bottle names, with the tested-version rules (isTestedCrossover, shouldShowUntestedNotice, dismissUntestedNotice) and readCrossoverBuild"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/engineDecision.oracle.test.ts#the probe spawns <binDir>/wine --demo-status with CX_BOTTLE, an empty stdin, the 15 s cap and the 64 KiB buffer"
        status: pass
    human_judgment: false
  - id: D5
    description: "SVC-02 offline edge: every launch case is recorded with offline yes and no, and the offline refusal verdict (crossover-missing, restore-needs-pin) is part of the expected result"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/engineDecision.oracle.test.ts#the matrix covers every cell the plan names, offline yes and no on every launch item"
        status: pass
    human_judgment: false
  - id: D6
    description: "D-20 prohibition: no recorded decision selects bottled Steam, enforced by an assertion over every recorded launch decision (with a self-test that trips on one) and a scan of the committed goldens"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/engineDecision.oracle.test.ts#no expected decision selects bottled Steam: the assertion trips on one that does"
        status: pass
    human_judgment: false
  - id: D7
    description: "82 D-05: golden/decision carries MANIFEST {count: 122, floor: 80} and golden/demo_status {count: 40, floor: 15}, each asserted through assertManifest with an empty-list negative"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/engineDecision.oracle.test.ts#cases.json agrees with the generated case list, the MANIFEST agrees with both and holds one folder per case"
        status: pass
    human_judgment: false
---

# Phase 87 Plan 13: Engine decision and demo-status goldens Summary

**The CrossOver-first engine decision is pinned by 122 TS-produced goldens (1,823 recorded items, the real `--demo-status` probe over the spawn tracer, the G29 two-probe rule, the shipped WR-01 behaviour and the offline refusal on every launch item) and CrossOver trial detection and the tested-version rules by 40 more, before any Rust for either exists.**

## Performance

- **Duration:** 8 min (2026-11-23T02:58Z to 03:06Z)
- **Tasks:** 2 of 2
- **Files:** 1 new oracle test, 1 edited test, 162 golden case folders (5 files each), 2 hand-checked `cases.json`, 2 MANIFESTs

## Accomplishments

- `engineDecision.oracle.test.ts` runs the real `decideLaunchEngine`, `decideCreationEngine`, `preflightCrossover`, `isCrossoverMissing`, `listEngineOverrideOptions`, `resolveWineManagerStaging`, `createCrossoverLocator`, `createProbeDemoStatus`, `parseDemoStatus`, `readCrossoverBuild` and the tested-version helpers over a fresh `createFakeHomeProfile()` per case. The pinned-engine paths are the engine runtime's real fallback; everything else a decision reads is a scripted dependency, recorded in call order.
- 122 goldens in `golden/decision`:
  - **the matrix (80):** CrossOver x setting x offline x bottle, 15 items each (pins x marker). Of 1,692 launch items, 1,556 proceed and 136 are refused offline (116 `restore-needs-pin`, 20 `crossover-missing`); 1,508 decisions use an engine and 184 are `unavailable`.
  - **G29 and WR-07 (13):** nonzero/timeout/spawn-error then healthy, expired or broken, a busy bottle or a running or starting title, a throwing wineserver stop, unrecognised stdout, 10 bottle names the layer refuses, trial days, install shapes, build reads.
  - **WR-01 (7):** the inconclusive pre-flight over all 7 marker shapes x 3 pin states under each of the 4 settings, a Wine Manager marker that cannot be resolved, no marker reader, an invalid bottle name.
  - **settings (5):** values outside the grammar, a retired pin id, a forced pin's installed state, Wine Manager release and file states, other Wine Manager builds.
  - **the rest (17):** `preflightCrossover` (3), `decideCreationEngine` (4), the option list (3), `isCrossoverMissing` (1), Wine Manager staging (1), and the CrossOver locator (3).
- 40 goldens in `golden/demo_status`: 28 probe cases (Standard, trial 12/1/0, expired 3/0/400, last-line-wins, CRLF and padding, noise after status, empty, singular day, default and custom timeout, nonzero with output, nonzero with 500-character output cut at 200 and 400, no exit code, spawn error, truncated output, 255 and 256 character names, nine refused names, spaces and punctuation, the production and the fake-profile arm shapes), `parseDemoStatus` (2), `readCrossoverBuild` (4, with the `plutil` argv traced), the tested-version and untested-notice rules (6) and `crossoverBinDirFromWineBin` (2).
- The redaction `FILE_FLOOR` went 2686 to 3500, the exact count of files in both crates' fixture trees.

## Task Commits

1. **Task 1 (tracer): the decision matrix goldens end to end** - `e02ab432f` (test)
2. **Task 2: demo-status and tested-version goldens** - `547d13e15` (test)

Tracer gate: auto mode off, `HUMAN_VERIFY_MODE` end-of-phase, the tracer's `<verify>` is automated only, so it was re-run end to end after the commit (jest in compare mode over the oracle, the redaction scan and the isolation gate, MANIFEST count 122 against the floor of 80, prettier clean) and passed. Tracer verified end-to-end, expansion followed.

## Verification

- `GAMELIB_WRITE_ENGINE_GOLDEN= pnpm exec jest --runTestsByPath` over the oracle, `engineWineFixtureRedaction.test.ts` and `fakeHomeIsolation.test.ts`: 192 passed, offline, compare mode; a write run left the committed tree byte-identical.
- Acceptance: `golden/decision/MANIFEST.json` count 122 (>= 80); `golden/demo_status/MANIFEST.json` count 40 (>= 15); a golden records `cx-inconclusive` with the marker preserved (`wr01-inconclusive-automatic`, pinned marker: selection `pinned` / `cx-inconclusive` / `wine-staging-11.20`, calls hold `markerSummary` and no `killCrossoverWineserver`, tree unchanged).
- `npx prettier --check` over the oracle test and the redaction test: clean (the fixtures are prettier-ignored). `npx eslint` over both and `npx tsc --noEmit -p tsconfig.json`: clean.
- Non-vacuity by mutation: changing `licensed` to `trial` in `probe-standard` failed that case and the argv/env test; changing `cx-healthy` to `cx-broken` in a decision golden failed exactly that case; both restored.

## Findings the port must decide on (D-19 deltas, recorded as goldens, not fixed)

1. **A timeout is the only failure the bottle's state changes.** A timeout while another game is in the bottle or this title is running or starting is returned at once as inconclusive (no retry, no wineserver stop); an idle bottle stops the wineserver and probes again, and two failures of any kinds are broken. Two nonzero exits on a busy bottle are broken with no stop (`g29-timeout-busy-or-running`, `g29-nonzero-running-no-kill`).
2. **The last timeout still stops the wineserver** (idle bottle, no retry left); the last nonzero exit does not. The kill precedes the retry only.
3. **An inconclusive pre-flight under override `crossover` launches on CrossOver with reason `override`**, not `cx-inconclusive`; under Automatic with no usable marker engine it launches on CrossOver with `cx-inconclusive` and never selects `pins.current`.
4. **A recorded retired pin is kept only when its wineserver and wine both exist** and its wineserver sits inside the pinned-engine root; a known pin (current or previous in the table) wins first, then the Wine Manager build, then the retired pin.
5. **A stored setting outside the grammar reads as Automatic** (`'Automatic'`, `' automatic'`, `'pinned:'`, a retired-pin id with no previous pin is `unavailable`, `'wine-manager:a..b'`); a retired pin id is `unavailable` when the table holds no previous pin.
6. **The forced pin and forced Wine Manager paths never pre-flight CrossOver**: the probe is not called whatever CrossOver's state, and `needsDownload` follows the disk.
7. **A Wine Manager build runs without DXVK when the current pin is not installed**, and says so in `logLines`.
8. **`decideCreationEngine` is a presence check**: CrossOver with the 120 s create cap and a best-effort build (a rejected read is `null`), the current pin with `cx-missing` (no bin dir or no `bin/wine`) or `cx-broken` (not executable); a rejecting resolver rejects the call.
9. **The offline gate is evaluated on `override` only for Automatic and CrossOver**; with CrossOver missing it refuses only under Automatic with the current pin absent, and the `restore-needs-pin` arm refuses under `crossover` even with the current pin installed.
10. **`readCrossoverBuild` accepts exactly four dot-separated digit groups** after trimming and returns `null` for any other shape, a failed or timed-out `plutil`; the dismissed-notice list keeps the last 50 builds, drops non-string entries and refuses any build that is not four digit groups.

## Deviations from Plan

### Auto-fixed Issues

None.

### Plan interpretation (not defects)

- **Cases are generated in code, not authored.** The plan says "generate the cross product", so the test builds the case list; write mode writes `cases.json` (inputs only, no expected value) and compare mode asserts it equals the generator, so the Rust side reads `cases.json` and the TS cannot silently drift from it. `expected/` is only ever written by the harness.
- **`MANIFEST count` counts cases, each holding many items.** 122 and 40 cases hold 1,823 and 120 recorded items; the floors (80, 15) are the plan's.
- **No combination was pruned.** The plan allowed pruning combinations the TS rejects before deciding; none is rejected (a forced pin or Wine Manager setting skips the pre-flight but is still decided), so each cell is recorded.
- **"No toast" is a recorded absence, not a toast assertion.** The decision layer has no toast; what the golden pins is that the inconclusive path reads the marker only, stops no wineserver, returns no notice field and leaves the profile tree unchanged. The toast suppression lives in the caller (`launchEngine`), which is another plan's.
- **The locator records the sync resolver only.** `resolveCrossoverBinDirAsync` shells out to Spotlight (`mdfind`) through the compatibility layer; the plan lists `hintWineBins` and the sync arms. The operator's `/Applications` is never read: a `graceful-fs` `existsSync` spy answers the scripted list for paths under `/Applications/` and the real filesystem only for paths inside the fake profile.
- **The retired pin is a scripted table entry** (the shipped table's `previous` is null), built from `wine-staging-11.1` (`RETIRED_PIN_ID`) with the current pin's DXVK; its sha and size are the current pin's, since nothing downloads it.
- **TDD flag not set.** Neither task carries `tdd="true"`; the oracle was proved non-vacuous by mutation, as in 87-05 and 87-12.

**Total deviations:** 0 auto-fixed. **Impact:** none on scope.

## Issues Encountered

- `actuals.tokens` is `estimateTokens` (chars/4) over the whole realized diff under `src` and `src-tauri` (5,783,849 characters); the generated goldens are almost all of it, which is why it is far above the plan's 75,000 estimate.
- The oracle test file is about 2,100 lines after prettier; it is one file because the plan names one.
- `pnpm exec` re-ran the root `prepare` (husky install) on some runs; it changed nothing tracked.

## Known Stubs

None.

## Threat Flags

None. Nothing is spawned for real (the tracer answers every probe from its script) and no network is reached; every bottle, marker and release list is synthetic, the bin dir is under the fake HOME, and the redaction scan (floor 3500) passes over every committed file (T-87-15: every expected value is produced by running the TS; the MANIFEST floors and the empty-list negatives stop a vacuous matrix).

## Next Phase Readiness

87-44 to 87-46 port the decision and demo-status slices against `golden/decision` and `golden/demo_status`; the ten findings above are their D-19 delta decisions. `deltas.json` was not created for either slice: no Rust-side difference exists yet.

## Self-Check: PASSED

The oracle test, both `cases.json` and `MANIFEST.json` files, and the 122 and 40 golden case folders exist on disk; commits `e02ab432f` and `547d13e15` are ancestors of HEAD; the acceptance criteria and the plan-level verification re-ran green.
