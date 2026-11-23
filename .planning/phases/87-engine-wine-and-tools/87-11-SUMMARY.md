---
phase: 87-engine-wine-and-tools
plan: 11
subsystem: testing
tags: [oracle, golden, jest, bottles, engine-marker, fixtures, vectors, fake-home, gamelib-engine]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the oracle harness, spawn tracer, tree snapshot and redaction scan (87-05)
provides:
  - fixtureBottles.ts, the D-07 builders for 21 synthetic bottles and 8 pinned-engine variants, committed under gamelib-engine/tests/fixtures/state/{bottles,engines}
  - the bottles oracle test and 146 committed goldens under gamelib-engine/tests/fixtures/golden/bottles
  - bottle_twin.json, 216 input/output vectors for the D-24 sync helpers that stay as a TS twin
  - selection_registry.json, 11 set/get/clear sequences for the write-through selection view
affects: [87-16, every Rust bottle and marker slice of Phase 87, the D-24 twin until Phase 96]

actuals:
  tokens: 526584
  tasks: 2
  commits: 2

plan_head_before: 4f771f77340818546b8d608320cf3f612291da3f
plan_head_after: 0527ffe21e4cbe9c9c4ec4d42241c8bd290faa21

tech-stack:
  added: []
  patterns:
    - "a fixture bottle is data (name, files relative to the bottle, text carrying <TOOLS> and <HOME> placeholders); the same builder writes the committed state/ tree, expands it into a case's fake HOME, and in compare mode fails when the committed bytes differ from what the builder produces"
    - "a marker names a wineserver by absolute path, so a file's recorded sha256 is taken over its content with the profile roots replaced by placeholders (snapshotNormalised); the Rust replay expands the same placeholders and normalises the same way"
    - "a scripted process has an effect: what cxbottle --create or wineboot -i leaves in the bottle is a fixture the case writes while the scripted process runs, so no engine output is a fixture body"
    - "the spawn tracer records no time limit or signal, so the test wraps runner.run and records timeoutMs, unbounded and signal presence per spawn in result.json"
    - "crypto.randomUUID is pinned to an allow-listed BottleID so the conf GameLib writes, and the log line that names it, are deterministic"

key-files:
  created:
    - src/backend/engine/__tests__/oracle/fixtureBottles.ts
    - src/backend/engine/__tests__/oracle/bottles.oracle.test.ts
    - src-tauri/crates/gamelib-engine/tests/fixtures/state/bottles/ (21 bottles)
    - src-tauri/crates/gamelib-engine/tests/fixtures/state/engines/ (8 pinned-engine variants)
    - src-tauri/crates/gamelib-engine/tests/fixtures/golden/bottles/ (MANIFEST.json, cases.json, expected/ for 146 cases)
    - src-tauri/crates/gamelib-engine/tests/fixtures/vectors/bottle_twin.json
    - src-tauri/crates/gamelib-engine/tests/fixtures/vectors/selection_registry.json
  modified:
    - src/backend/__tests__/engineWineFixtureRedaction.test.ts

key-decisions:
  - "the tree and marker goldens are over placeholder-normalised content, not raw bytes: a marker holds an absolute wineserver path, so the raw sha differs per fake HOME"
  - "the fixtures hard-code the current pin's id, version and sha256, and a test asserts them against ENGINE_PINS: a pin bump fails the suite until the state/ tree and goldens are regenerated, which is the D-07 intent (the marker 'pinned:<current>' is an on-disk shape)"
  - "the marker gate is the existing jest-mock-free fake of the two Rust channels (fakeBottleGateRust), which answers from the real file as gamelib-store's version_gate does; every gate call is part of the golden"
  - "the DXVK installer is a scripted double that records its settings, tool, action and source; the real tools are 87-09's goldens"
  - "ensureGameBottle is driven with decide, resolveBinDir and ensurePin supplied and the real createCrossoverBottle and createFallbackBottle behind it, so the flight, the CrossOver-failure fallback and the idempotent reuse are recorded over real primitives"

patterns-established:
  - "State fixtures live beside goldens in the engine crate (state/bottles/<name>/, state/engines/<variant>/) and are rewritten from the TS builders in write mode, never by hand"

requirements-completed: [SVC-02]

duration: 55 min
completed: 2026-11-23
status: complete

coverage:
  - id: D1
    description: "D-07 fixture set: 21 bottles covering crossover, pinned:<current>, pinned:<retired id>, wine-manager:<version>, absent dxvk and dxvk: failed, a version: 2 marker, an unreadable marker, a contradicted crossover marker, a marker-less bottle with and without current_dxvk-macOS and with and without a Timestamp conf, a conf-less prefix, a non-prefix directory, hand-edited wineserver and dxvk paths, a bad id, a wrong kind and a no-version marker; BottleIDs from the redaction allow-list; 8 pinned-engine variants"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/bottles.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-08 and SC2 goldens: marker record (pinned and crossover), reconcile (infer, contradicted, trusted, newer, unreadable), the three read-only views, the cxbottle.conf writer, the wineserver kill, sibling-safe removal, cxbottle --create, createFallbackBottle with the scripted DXVK installer, the per-game flight, the ledger, the engine registry and the prefix resolver, each with before and after trees, marker bytes, gate calls, spawn traces and time limits"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/bottles.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-24 vectors: bottle_twin.json (216 vectors in 8 groups) and selection_registry.json (11 sequences), each with a count, a floor and an empty-list negative, compared byte for byte in compare mode"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/bottles.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "SVC-02 idempotency edge: recording the same pinned or crossover marker twice, reconciling twice, writing the conf twice and ensuring an already-provisioned bottle leave identical trees and bytes"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/bottles.oracle.test.ts"
        status: pass
    human_judgment: false
---

# Phase 87 Plan 11: Bottles and markers goldens Summary

**The bottles and markers behaviour is pinned by 21 synthetic fixture bottles, 146 goldens (marker record, reconcile and views, cxbottle conf, kill, sibling-safe removal, cxbottle and fallback creation, the per-game flight, ledger, registry, prefix resolver) and 216 twin plus 11 registry vectors, before any Rust for bottles exists.**

## Performance

- **Duration:** about 55 min (2026-11-23, local 15:00 to 15:55)
- **Tasks:** 2 of 2
- **Files:** 2 new test modules, 1 edited test, 1 hand-authored case list, 1 golden slice, 1 state fixture tree, 2 vector files; 911 new fixture files in the engine crate

## Accomplishments

- `fixtureBottles.ts` defines 21 bottles and 8 pinned-engine variants as data. `bottles.oracle.test.ts` builds each case's before-tree from them, rewrites `state/bottles` and `state/engines` from them in write mode, and in compare mode fails when a committed byte differs. The BottleIDs are the redaction scan's four; every other test asserts no `/Users/` or `/home/` text and that no UUID outside the allow-list is present.
- 146 goldens in `golden/bottles` over the real modules (`bottlePrimitives`, `adoptBottle`, `perGameBottle`, `engineSwitch`'s marker functions, `bottleLedger`, `engineRegistry`, `gamePrefix`, `fallbackEngine`), every process a scripted answer of the spawn tracer:
  - **views (27):** `readBottleEngineMarkerKind`, `readBottleEngineMarkerSummary` and `restoreNeedsAbsentPin` over each fixture with the pin installed, four engine-directory variants, no engine, and unsafe and absent names.
  - **reconcile (28):** each fixture with the pin installed, four marker-less or contradicted shapes with the pin absent (the inferred marker carries an empty wineserver), twice (idempotent), gate rejected, unsafe name.
  - **record-pinned (18) and record-crossover (6):** fresh with and without a DXVK copy, twice, over an identical marker, over a newer marker (refused, bytes kept), over an unreadable, crossover, no-version and `dxvk: "failed"` marker, retired pin id, bad and 65-character pin id, absent bottle, unsafe name, gate rejected, gate answering newer.
  - **provisioned, conf-write, kill, remove-created (2 + 5 + 5 + 4):** the conf predicate over every fixture; the minimal conf (tmp, rename, 0644, BottleID uppercased) once, twice and over an existing conf; `wineserver -k` with WINEPREFIX spread last, timeout, spawn failure and unsafe names; removal inside the root with a sibling bottle, a sibling directory and a name-prefix directory untouched, the refused names, and a symlinked bottle whose target survives.
  - **create-crossover (12), create-fallback (15), ensure (12):** `cxbottle --create --bottle <name> --template win10_64` ok, over a provisioned bottle, timeout, no conf, exit zero, spawn failure, invalid and padded names, aborted before and during; `createFallbackBottle` with `wineboot -i`, `wineserver -w`, the scripted DXVK installer and the conf last, every failure arm, existing half-created and provisioned bottles, three abort points; `ensureGameBottle` existing, CrossOver, twice (idempotent), pinned, no bin dir, CrossOver failing into the pin, pin download failed or cancelled, concurrent callers sharing one creation, a Steam key.
  - **ledger, registry, resolve-prefix (2 + 4 + 6):** the calls and every refusal.
- Every case records the inputs, the tree before and after (path, mode, sha256), the outcome, the marker bytes of every bottle, every log line, the calls the marker gate made to Rust, the time limit and signal wiring of every spawn, and the DXVK installer's calls; `spawns.json` carries program, argv and env diff.
- `bottle_twin.json`: 216 vectors (getBottleDir 16, sanitizeBottleName 31, isBottleProvisioned 25, buildFallbackGameSettings 12, the two marker readers 25 each, restoreNeedsAbsentPin 46, the pinned-engine installed reader 36 over 9 engine states and 4 pins). `selection_registry.json`: 11 sequences with the result after each step. Long names are stored as `{repeat}` generators.
- `MANIFEST.json` is `{count: 146, floor: 140}`, asserted through `assertManifest` with an empty-list negative. The redaction `FILE_FLOOR` went 1420 to 2318.

## Task Commits

1. **Task 1 (tracer): the D-07 fixture builders and the bottles and markers goldens** - `608a518db` (test)
2. **Task 2: twin and selection-registry vectors** - `0527ffe21` (test)

Tracer gate: auto mode off, `HUMAN_VERIFY_MODE` end-of-phase, the tracer's `<verify>` is automated only. The record-pinned round trip (marker bytes, mode, tree) was written and run first, then the rest of the slice was added before the first commit; the full verify (jest over the oracle and the redaction scan, MANIFEST present, prettier) passed and expansion had already followed.

## Verification

- `GAMELIB_WRITE_ENGINE_GOLDEN= pnpm exec jest --runTestsByPath` over the oracle, `engineWineFixtureRedaction.test.ts` and `fakeHomeIsolation.test.ts`: 176 tests passed, offline, three consecutive compare runs and a write run that left the committed tree byte-identical (deterministic).
- Acceptance: `state/bottles` holds 21 bottles (>= 12); `golden/bottles/MANIFEST.json` count 146 (>= 15); `bottle_twin.json` 216 vectors (>= 60); `selection_registry.json` 11 sequences (>= 5).
- `npx prettier --check` over the oracle, the builders and the redaction test: clean (fixtures are prettier-ignored). `npx eslint` over the same and `npx tsc --noEmit -p tsconfig.json`: clean.
- Non-vacuity by mutation: flipping `"returned"` in the `record-pinned-over-newer-refused` golden and appending a byte to a committed state marker each failed their test; flipping one value in each vector file failed both vector tests; all restored.

## Findings the port must decide on (D-19 deltas, recorded as goldens, not fixed)

1. **`isBottleProvisioned` does not sanitise.** `..` resolves through `path.join`, so a `cxbottle.conf` in the CrossOver directory makes `..` read as provisioned, and `nested/inner` as well (`provisioned-parent-traversal-name`). Callers sanitise first.
2. **`getBottleDir` normalises traversal.** Four parents climb out of the Bottles root to HOME (`dir-climb-out-of-home`); `.` and the empty name give the Bottles root itself.
3. **`sanitizeBottleName` trims all Unicode whitespace**, including U+2028 and U+2029, but keeps U+200B, device names such as `CON`, and a leading dash; `.` alone is clean (`sanitize-*` vectors).
4. **`removeCreatedBottleDir` refuses `.`, the empty name and a name that trims to something else** through its containment check; `killBottleWineServerWith` refuses `.` the same way, not through the sanitiser.
5. **`createFallbackBottle` over a provisioned bottle fails** (`cxbottle.conf not written`): the conf writer never overwrites, so the final step reports false; the bottle is left (createdHere false). The flight avoids this by testing `isBottleProvisioned` first.
6. **An already-aborted signal does not stop `wineboot -i`** from starting in `createFallbackBottle`; the abort is noticed after it returns (`create-fallback-aborted-before`). `createCrossoverBottle` checks first and starts nothing.
7. **A pinned marker is written into a directory with no `system.reg`** (`record-pinned-bottle-without-system-reg`): only the directory is required.
8. **An unreadable marker is overwritten** by reconcile and by `recordPinnedBottleEngine` (the gate reports `unreadable`, which is writable), while a `version: 2` marker is never touched, and a marker with no version key reads as 0 and is rewritten at 1.
9. **A hand-edited pinned marker is bounded on read:** a `dxvk.dir` outside the pinned-engine root is dropped, and a `wineserverBin` outside the root or not named `wineserver` reads as `pinWineserverBin: null`.
10. **The wineserver-kill env inherits the whole process env** and spreads the caller's extras before WINEPREFIX, so extras cannot move the prefix (`kill-extra-env-cannot-override-prefix`).
11. **The fixtures are coupled to the shipped pin** (id, version, two sha256s): a pin bump changes `pinned:<current>` and fails the suite until `GAMELIB_WRITE_ENGINE_GOLDEN=1` regenerates `state/` and the goldens.

## Deviations from Plan

### Auto-fixed Issues

None.

### Plan interpretation (not defects)

- **Pinned-engine dirs.** The plan's builders include `<TOOLS>/steam-engines/<pin id>/.gamelib-pin.json`; they are committed under `state/engines/<variant>/`, not under `state/bottles`, so the bottle count the acceptance criterion measures is bottles only.
- **Fixture text carries placeholders.** A marker holds an absolute wineserver path, so the committed marker and every tree sha are over placeholder-normalised content (see Patterns). The Rust replay expands `<TOOLS>` and `<HOME>` into its own FakeHome.
- **`createCrossoverBottle` and the flight.** The plan names `createCrossoverBottle` scripted; the already-provisioned reuse case lives in `ensureGameBottle`, because `createCrossoverBottle` has no reuse check of its own.
- **Engine-switch goldens** over the same fixtures are 87-16, as the plan says; `prepareBottleForEngine` is not driven here.
- **146 cases, 216 vectors, 11 sequences** against the plan's minimums of 15, 60 and 5.

**Total deviations:** 0 auto-fixed. **Impact:** none on scope.

## Issues Encountered

- `pnpm find-deadcode` still reports only the 87-05 finding (`portSliceGate.ts` `manifest`), already in `deferred-items.md`; nothing new from this plan.
- `actuals.tokens` is `estimateTokens` (chars/4) over the whole realized diff, 2,106,336 chars; the generated goldens and fixtures are about 95 percent of it, so it measures output volume, not authoring effort.

## Known Stubs

None.

## Threat Flags

None. No network is reached; every bottle, marker and conf is synthetic, no file is copied from a machine, the BottleIDs are the allow-list's four, and the redaction scan (floor 2318) passes over every committed fixture (T-87-14).

## Next Phase Readiness

87-16 records the engine-switch goldens over the same fixtures. The Rust bottle and marker slices port against `golden/bottles`, `state/`, `bottle_twin.json` and `selection_registry.json`; the eleven findings above are their D-19 delta decisions. `golden/bottles/deltas.json` was not created: no Rust-side difference exists yet to record.

## Self-Check: PASSED

The builders, the oracle test, `cases.json`, `MANIFEST.json`, 146 golden case directories, 21 state bottles, 8 engine variants and both vector files exist on disk; commits `608a518db` and `0527ffe21` are ancestors of HEAD; acceptance criteria and plan-level verification re-run green.
