---
phase: 87-engine-wine-and-tools
plan: 16
subsystem: testing
tags: [oracle, golden, jest, engine-switch, wr-02, engine-marker, version-gate, fake-home, gamelib-engine]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the oracle harness, spawn tracer, tree snapshot and redaction scan (87-05); the fixture bottles and engine variants (87-11)
provides:
  - the engine-switch oracle test and 73 goldens under gamelib-engine/tests/fixtures/golden/switch (every switch direction, every refusal, the DXVK outcomes, the marker states, the WR-02 interleave, the legacy-bottle rule)
affects: [87-40, 87-41, the Rust engine switch slice]

actuals:
  tokens: 330458
  tasks: 2
  commits: 2

plan_head_before: 787f980ca9a6659276f6d5c519b8cfc1fcb49f82
plan_head_after: 06506ce6be0dd021eab7ea2e776fd540feb5a200

tech-stack:
  added: []
  patterns:
    - "one ordered timeline per case: calls starting and finishing, every Rust gate ask, every wineserver stop (with its env and limit), every installer call, onSwitching, the crossover-settings reads, the pin downloads and every write of the marker with its bytes; two calls started together interleave in it, so the WR-02 order is recorded, not inferred"
    - "a marker write is observed as the rename onto `.gamelib-engine.json`: `fs.renameSync` of the real module is spied and reads the tmp file's bytes before delegating, so a refused write leaves no entry and the count is asserted from the case (`markerWrites`)"
    - "a case says which bottles must keep their marker bytes (`markerUnchanged`) and how many times the marker is written; both are asserted in the test body, so write mode cannot record a violation"
    - "the DXVK installer is a double with one outcome per action (`backup` ok, fails, no-marker, throws, throws-once; `restore` ok, fails, left, throws) that writes or removes `current_dxvk-macOS` the way the real tool does; the real tools are 87-09's goldens"
    - "every case records `treeDiff` (added, removed, changed, and whether only a marker differs), which is how the legacy-bottle rule is a recorded fact rather than an assertion in prose"

key-files:
  created:
    - src/backend/engine/__tests__/oracle/engineSwitch.oracle.test.ts
    - src-tauri/crates/gamelib-engine/tests/fixtures/golden/switch/ (MANIFEST.json, cases.json, expected/ for 73 cases)
  modified:
    - src/backend/__tests__/engineWineFixtureRedaction.test.ts

key-decisions:
  - "the real createEngineSwitcher, the real marker readers and writers, the real fallback engine (for the installed-pin checks), the real ledger and the real killBottleWineServerWith run; only the wineserver processes (the spawn tracer), the DXVK installer, the pinned-engine download and the CrossOver settings are doubles"
  - "`changed` in the result is the plan's `switched` flag: the code has no field of that name"
  - "the unreadable-marker case records what the code does (the marker is rewritten), not the plan's 'kept': the plan's 'kept' holds when Rust cannot be asked, which is a separate case (see Findings)"

patterns-established:
  - "a golden slice for stateful behaviour records an ordered timeline, not only before and after, so ordering rules (a waiting switch re-reads the marker) are pinned"

requirements-completed: [SVC-02]

duration: 45 min
completed: 2026-11-23
status: complete

coverage:
  - id: D1
    description: "D-07 engine switch: crossover to pin, pin to crossover healthy and unhealthy (built-in restore), pin to Wine Manager, Wine Manager to crossover and to the pin, crossover to Wine Manager, DXVK ok and failed (install false, no marker file, throws; restore false, file left, throws), the same-engine no-ops, the retried failed DXVK, the retired pin to the current pin, every marker shape the fixtures hold, each with results, `changed` flags, marker bytes before and after, trees, wineserver argv and env and the installer's calls"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/engineSwitch.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-07 never-overwrite: a version: 2 marker refuses a real change (to crossover, to Wine Manager, with the gate forced to newer) with the bytes asserted unchanged, lets the same engine through, and an unaskable gate is treated as newer; unreadable, contradicted, bad-id, wrong-kind and no-version markers are recorded as the writable cases they are"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/engineSwitch.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "SVC-02 concurrency edge: concurrent switches of one bottle (two, three, opposite targets, first rejecting, both refused busy) and of two bottles record the marker write order, each call's result, the waiting log and the re-read; the waiting call returns changed false or switches back, never repeats a step"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/engineSwitch.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Refusals and the legacy rule: shared-bottle, bottle-busy (with the same-engine and own-key exceptions), game-running (starting, running, same engine), invalid-bottle (unsafe, absent), and pre-61 bottles with game data that stay byte-identical except the marker"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/engineSwitch.oracle.test.ts"
        status: pass
    human_judgment: false
---

# Phase 87 Plan 16: Engine-switch goldens Summary

**Engine switching is pinned by 73 goldens over the 87-11 fixture bottles: every direction between CrossOver, the pin and a Wine Manager engine, every refusal, the never-overwrite rule for a newer marker, and the WR-02 interleave recorded as an ordered timeline, before any Rust for the switch exists.**

## Performance

- **Duration:** about 45 min (2026-11-23)
- **Tasks:** 2 of 2
- **Files:** 1 new test module, 1 edited test, 1 hand-authored case list, 1 golden slice (73 case folders, 5 files each)

## Accomplishments

- `engineSwitch.oracle.test.ts` drives `createEngineSwitcher().prepareBottleForEngine` over the fixture bottles (reused from `fixtureBottles.ts`, no new builder, BottleIDs from the allow-list, spawn env from `createFakeHomeProfile()` through the harness). Each case has one or more calls, run one after another or all started together (`mode: concurrent`).
- 73 goldens in `golden/switch`:
  - **pin to crossover:** healthy restore, restore false, restore leaving `current_dxvk-macOS`, restore throwing, no CrossOver found for the G30 stop, unhealthy built-in restore (and its failure), the pin fetched before anything is stopped (and unavailable: nothing stopped, marker kept), restore from the marker's own DXVK copy with the pin absent, no DXVK recorded, a retired pin, a wineserver outside the roots and a misnamed one, `dxvk: "failed"`, inferred pins (pin installed and absent), a contradicted marker, a bad-id, wrong-kind and no-version marker, an unreadable marker.
  - **crossover to pin and Wine Manager:** DXVK install false, no marker file, throws, no DXVK handed over, no CrossOver found, the stop timing out and failing to spawn, an inferred crossover, retired pin to current pin; pin to Wine Manager, crossover to Wine Manager, Wine Manager to crossover (manager wineserver present and absent) and to the pin, same Wine Manager version.
  - **same engine:** pinned, crossover, no marker (writes the marker only), the failed-DXVK retry (ok, failing, refused busy), the contradicted and wrong-kind markers rewritten.
  - **refusals:** shared-bottle (and the own-bottle switch), bottle-busy (refused, same engine proceeds, the caller's own key ignored), game-running (starting, running, same engine), invalid-bottle (unsafe name, absent).
  - **newer and gate:** newer marker refused to crossover and to Wine Manager, newer marker with the same engine proceeds, the gate forced to newer, Rust unaskable.
  - **concurrency and sequence:** two, three, opposite targets, first rejects, two bottles, both refused busy; the same switch twice and a round trip pin, crossover, pin.
  - **legacy:** pre-61 bottles with game data and another title's files stay byte-identical except the marker (CrossOver and pin), a refused change writes nothing, a conf-less prefix.
- Every case records the inputs, the tree before (path, mode, sha256 over placeholder-normalised content), each call's result or thrown message, the ordered timeline, the marker bytes of every bottle before and after, `treeDiff`, the log lines, the calls the gate made to Rust, the time limit of each spawn and the installer's calls with their settings; `spawns.json` carries program, argv and env diff, `tree.json` the tree after.
- The test asserts in its body, not only through the golden: the marker bytes of the named bottles are unchanged (`markerUnchanged`, set on every `newer-marker-*` case and on every refusal) and the marker is written exactly `markerWrites` times. A separate test requires at least three `concurrent-*` cases, each concurrent with at least two calls and a write count.
- `MANIFEST.json` is `{count: 73, floor: 73}` through `assertManifest` with an empty-list negative. The redaction `FILE_FLOOR` went 4295 to 4662.

## Task Commits

1. **Task 1 (tracer): crossover to pin, the newer, unreadable and unavailable-gate markers** - `b2d35df84` (test)
2. **Task 2: every other switch branch, the WR-02 interleave and the legacy rule** - `06506ce6b` (test)

Tracer gate: auto mode off, `HUMAN_VERIFY_MODE` end-of-phase, the tracer's `<verify>` is automated only, so it was re-run end to end (jest in compare mode, MANIFEST present, prettier) before expansion; it passed.

## Verification

- `GAMELIB_WRITE_ENGINE_GOLDEN= pnpm exec jest --runTestsByPath` over the oracle, `engineWineFixtureRedaction.test.ts` and `fakeHomeIsolation.test.ts`: 97 tests passed, offline; compare mode passed twice after a write run, and the next write run left the tree byte-identical (deterministic).
- Acceptance: `golden/switch/MANIFEST.json` count 73 (>= 15); `newer-marker-*` cases record unchanged marker bytes; the concurrent cases record the marker write order and both results.
- `npx prettier --check` over the oracle and the redaction test: clean (the golden tree is prettier-ignored). `npx eslint` over both and `npx tsc --noEmit -p tsconfig.json`: clean.
- Non-vacuity by mutation: flipping `"changed": false` to `true` in the `concurrent-same-target-wr02` golden failed that case; restored by a write run.

## Findings the port must decide on (D-19 deltas, recorded as goldens, not fixed)

1. **An unreadable marker is rewritten, not kept.** The gate reports `unreadable`, which is writable, so the switch infers the engine (the pin for `fx-marker-unreadable`) and writes a marker with no `dxvk` field (`unreadable-marker-rewritten-to-pin`, `-to-crossover`). Only a gate Rust cannot answer is treated as newer and keeps the bytes (`gate-unavailable-marker-kept`). The plan text said "kept, never reset"; the prefix is never reset, the marker is.
2. **A contradicted crossover marker asked for the pin is rewritten as pinned with no `dxvk` field** and nothing is installed (`crossover-contradicted-to-pin-rewrites-marker`).
3. **The existence check precedes the outside-roots check.** A recorded wineserver outside every root that is not on disk gives "nothing to stop", not the warning (`pin-to-crossover-wineserver-outside-roots`); the warning is reached with an empty path, which is what a pin inferred while the pin is absent carries (`nomarker-dxvk-pin-absent-to-crossover`).
4. **A pinned marker whose binary is named `wine` is run with `-k`** (`pin-to-crossover-wineserver-misnamed`): only the root is checked, not the name.
5. **Pin to Wine Manager leaves `current_dxvk-macOS` and the DXVK DLLs behind**: no restore runs for a non-CrossOver target (`pin-to-wine-manager`).
6. **A throwing installer or restore escapes**, after the previous wineserver was stopped, leaving the marker as it was (not `dxvk: "failed"`) (`crossover-to-pin-dxvk-installer-throws`, `pin-to-crossover-healthy-restore-throws`). Only a `false` or a missing marker file is recorded as `dxvk: "failed"`.
7. **The phase check comes before the marker is read**: a running title is refused even for the same engine and the gate is never asked (`game-running-*`); bottle-busy comes after the same-engine return, so the same engine proceeds while another game runs.
8. **A restore for `dxvk: "failed"` still runs** from the installed pin (`dxvk-failed-to-crossover-restores`); a retired pin id restores from the current pin and its absent wineserver is "nothing to stop" (`pin-to-crossover-retired-pin-restores-from-current`); a retired pin asked for the current pin is a real switch (`retired-pin-to-current-pin`).
9. **WR-02:** the second call logs that it waits, then asks the gate again and re-reads the marker. Same target: `changed: false`, one kill, one install, one marker write. Opposite targets: two writes, the second a full restore. A rejecting first call does not block the chain: the second does the whole switch. Two bottles never wait on each other.

## Deviations from Plan

### Auto-fixed Issues

None.

### Plan interpretation (not defects)

- **Unreadable marker:** recorded as the code behaves (finding 1) rather than as "kept".
- **`switched` flags:** the result field is `changed`.
- **`legacyBottleUntouched`:** the original test drives `selectEngineForLaunch` (87-15's goldens cover that step); here the legacy rule is recorded at the switch, where the marker is the only file written, as four cases with game data seeded into the fixture bottles and `treeDiff.onlyMarkersDiffer` recorded.
- **73 cases** against the plan's minimum of 15.

**Total deviations:** 0 auto-fixed. **Impact:** none on scope.

## Issues Encountered

- `actuals.tokens` is `estimateTokens` (chars/4) over the whole realized diff, 1,321,831 chars; the goldens are about 90 percent of it, so it measures output volume, not authoring effort.

## Known Stubs

None.

## Threat Flags

None. No network is reached; every bottle is one of the 87-11 synthetic fixtures with allow-listed BottleIDs, nothing is copied from a machine, and the redaction scan (floor 4662) passes over every committed file (T-87-62).

## Next Phase Readiness

87-40 and 87-41 port the switch against `golden/switch`: the timeline (gate asks, stops, installer calls, marker writes) is the order the Rust code has to reproduce, and the nine findings above are its D-19 delta decisions. No `deltas.json` was created: no Rust-side difference exists yet.

## Self-Check: PASSED

The oracle test, `cases.json`, `MANIFEST.json` and 73 golden case folders exist on disk; commits `b2d35df84` and `06506ce6b` are ancestors of HEAD; acceptance criteria and plan-level verification re-run green.
