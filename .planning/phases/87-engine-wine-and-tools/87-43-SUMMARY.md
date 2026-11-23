---
phase: 87-engine-wine-and-tools
plan: 43
subsystem: wine
tags: [typescript, twin, d-24, d-06, delete-gate, bottles, marker-gate, ratchets]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the bottle marker, lifecycle, switch, fallback creation and restore ops of gamelib-engine (87-38 to 87-41), the shims and the selection view that switched every caller (87-42), the D-24 twin (87-03, 87-39)
provides:
  - every bridge file and the engine modules that touched the bottle code import the sync helpers (getBottleDir, sanitizeBottleName, isBottleProvisioned, buildFallbackGameSettings, the marker views, ENGINE_PINS, pinById) from enginewine/twin directly
  - EnginePin and PinnedArtifact in common/types/engine; engine/pinEngine.ts (the pin download the launch asks Rust's switch for)
  - bottlePrimitives.ts, engineSwitch.ts and adoptBottle.ts deleted with their tests and the two bottle oracles; describe('bottlesPortComplete') green with the GAMELIB_ENGINE flag absent
  - bottleVersionGate.ts trimmed to the shared-redist ledger (ENGINE_MARKER_CHAIN gone); the engine runtime carries no gate and no switcher
  - testUtils/fakeBottleRust.ts answers Rust's bottle ops by script and runs no TS reference
  - .planning/todos/pending/2026-11-23-bottle-port-copied-quirks.md
affects: [87-50, 87-52, 87-56, 95, 96]

actuals:
  tokens: 85000
  tasks: 3
  commits: 3

plan_head_before: 69c94c8406a20142081ff780d9eac3c5d6254972
plan_head_after: bf6db5e3f4e94495f77725bbf4508d4b851327bc

tech-stack:
  added: []
  patterns:
    - "a jest stand-in for Rust ops records calls and answers by script; what the op does to the filesystem and process list is the Rust goldens' job, and the TS test asserts what it sends and how it uses the answer"
    - "a mock of a re-exporting module moves to the owner with `...jest.requireActual(owner)` so the module's other exports stay real"
    - "a deliberate deletion moves the census floor with the list (diPhaseGates 65 to 63), as every earlier deletion did"

key-files:
  created:
    - src/backend/engine/pinEngine.ts
    - .planning/todos/pending/2026-11-23-bottle-port-copied-quirks.md
  modified:
    - src/backend/enginewine/twin.ts
    - src/backend/engine/enginePins.ts
    - src/backend/engine/engineRuntime.ts
    - src/backend/engine/launchEngine.ts
    - src/backend/engine/toolSettings.ts
    - src/backend/engine/engineDecision.ts
    - src/backend/stores/bottleVersionGate.ts
    - src/backend/testUtils/fakeBottleRust.ts
    - src/backend/__tests__/engineWinePortComplete.test.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts
    - src/common/types/engine.ts
  deleted:
    - src/backend/engine/bottlePrimitives.ts
    - src/backend/engine/engineSwitch.ts
    - src/backend/engine/adoptBottle.ts

key-decisions:
  - "The plan's seven-module deletion list was written on the assumption that 87-42 left no live caller. Three of the seven (engineSwitch, bottlePrimitives, adoptBottle) had none once their residue moved, and are deleted. Four (bottleLedger, engineRegistry, perGameBottle, gamePrefix) are called synchronously by the still-TS launch step (launchEngine, toolSettings, gameEngineState, engineDecision) until 87-50..87-56 move that step to Rust, so they stay and the engine slice's own gate (87-56) deletes them."
  - "What survived of engineSwitch is one function: the pin download. It is `engine/pinEngine.ts` (`ensurePinEngineFrom`), launchEngine's `switchDeps()` became `ensurePinEngine`, and `steamSwitchDeps`/`switchServicesFrom`/`switchContextFrom` are gone: the read-only marker views take `{ paths, fallback }` inline, as `prepareBottle.ts` already did."
  - "EnginePin and PinnedArtifact moved to common/types/engine so no bridge file imports engine/enginePins (the acceptance grep counts type imports); enginePins.ts re-exports them for the engine files until 87-56."
  - "The bottle fake runs no TS reference. The tests that asserted a spawn trace or a tree through it now assert the typed call the TS side sends (kill, remove, create, cancel) and how it uses the answer; each behaviour they used to pin has a named Rust counterpart below."
  - "`ENGINE_MARKER_CHAIN` and the engine runtime's `bottleGate` left TS with the last marker writer; `BottleFileChain` is now the shared-redist chain alone. Rust's in-process gate is the only marker writer (T-87-43, roundtrip_state.rs green)."

patterns-established:
  - "a delete-gate describe names what is deleted, and its doc comment names what stays and why, instead of forbidding identifiers that a live module still carries"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "Every bridge file and the engine modules that reached the bottle code import the sync helpers from the twin directly; no storeManagers non-test file imports engine/bottlePrimitives, engineSwitch or enginePins"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "grep -rlE \"engine/(bottlePrimitives|engineSwitch|enginePins)'\" src/backend/storeManagers | grep -v __tests__ | wc -l == 0; src/backend/__tests__/engineWineShimSchedule.test.ts; src/backend/enginewine/__tests__/twinVectors.test.ts; pnpm exec jest src/backend/storeManagers/steam src/backend/engine (pass)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The bottles sub-slice TS that has no live caller is deleted and its delete gate is green"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/__tests__/engineWinePortComplete.test.ts#bottlesPortComplete (red before the deletion, green after)"
        status: pass
      - kind: unit
        ref: "pnpm exec jest src/backend src/common (14814 passed); pnpm codecheck; pnpm backend-di-ceilings; pnpm find-deadcode"
        status: pass
    human_judgment: false
  - id: D3
    description: "The marker gate serves only the Phase 95 shared-redist ledger and the Rust marker round trip still passes"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/stores/__tests__/bottleVersionGate.test.ts; src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts"
        status: pass
      - kind: integration
        ref: "cargo test -p gamelib-engine --features testing --test roundtrip_state (7 passed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every quirk the bottle port copied for parity, and every D-19 hardening delta, is listed in one triaged todo, and no golden diff mixes a port with a fix"
    requirement: SVC-02
    verification:
      - kind: other
        ref: "pnpm planning-gates (12/12 passed, todo-frontmatter-gate)"
        status: pass
    human_judgment: true
    rationale: "Whether the list is complete is a reading of the goldens and the 87-38..87-42 decisions; the gate checks only the triage keys."
  - id: D5
    description: "A live Mac run of a Steam launch, install and DRM launch through the Rust bottle ops, with a live CrossOver and wineserver"
    verification: []
    human_judgment: true
    rationale: "Carried from 87-42: no live run was made. This plan deleted the TS reference the fakes ran, so the jest suites now prove the TS side's calls only; the Rust goldens prove the ops. The live check belongs to a UAT of the phase."

duration: 24 min
completed: 2026-11-24
---

# Phase 87 Plan 43: Bottle TS deleted behind the twin Summary

**Every bridge caller of the sync bottle helpers now imports them from enginewine/twin, the TS bottle primitives, engine switch and conf writer are deleted (bottlesPortComplete green), the marker gate keeps only the Phase 95 shared-redist ledger, and the copied quirks are one triaged todo; four of the plan's seven named modules stay because the still-TS launch step calls them.**

## Performance

- **Duration:** 24 min (start 2026-11-23T13:55:55Z, end 2026-11-23T14:19:55Z by the host clock)
- **Tasks:** 3 of 3 (Task 1 and Task 2 are tracers whose `<verify>` is automated only, re-run end to end before the next task, no checkpoint)
- **Files:** 83 changed across the three code commits (726 insertions, 6145 deletions)

## Accomplishments

- **Task 1 (tracer):** 21 storeManagers files (the plan listed 14; the other seven reached the helpers through a dynamic import or a name the plan did not list) and nine engine modules import from `enginewine/twin`; `EnginePin`/`PinnedArtifact` moved to `common/types/engine`; `steamSwitchDeps` is gone and `steamPrepareFacts` computes its values directly; the twin importer list in `engineWineShimSchedule.test.ts` is regenerated.
- **Task 2 (tracer):** `describe('bottlesPortComplete')` written red (17 failures), then `bottlePrimitives.ts`, `engineSwitch.ts`, `adoptBottle.ts`, their three tests and the two bottle oracles deleted until green; the engine runtime builds no `switcher`; `fakeBottleRust.ts` is a scripted recorder.
- **Task 3:** `ENGINE_MARKER_CHAIN` and the runtime's `bottleGate` removed; the shared-redist chain, `BOTTLE_FILE_VERSION` and everything `sharedRedistInstall.ts` imports kept; ratchets and the census floor follow the deletions; the todo written.

## Task Commits

1. **Task 1 (tracer): the bridge and the still-TS engine import the sync helpers from the twin directly** - `00f67d7f7` (refactor)
2. **Task 2 (tracer): delete the TS bottle primitives, engine switch and conf writer; bottlesPortComplete green** - `022b2c0c5` (refactor)
3. **Task 3: trim the marker gate to the shared-redist ledger, record the copied bottle quirks** - `bf6db5e3f` (refactor)

## Where the plan's deletion list and the repo disagree (carry-forward from 87-42)

| Plan item | Repo state | What was done |
| --- | --- | --- |
| `bottlePrimitives.ts`, `engineSwitch.ts`, `adoptBottle.ts` | no live non-test caller once the twin names were repointed and `switchServicesFrom`/`switchContextFrom` replaced | deleted |
| `engineSwitch`'s `switcher` in `engineRuntime.ts`, `fakeBottleRust`'s TS reference | dead | removed |
| `createEngineRegistry`'s private store | still live: isolation tests, the engine oracles and any runtime built without a view use it | **kept**, with the registry |
| `bottleLedger.ts` | `engineDecision.bottleBusy` and `launchEngine` read it synchronously (the TS mirror 87-42 keeps beside Rust) | **kept** |
| `engineRegistry.ts` | the validating `setEngineSelection` the TS launch calls before the switch, backed by the view | **kept** |
| `perGameBottle.ts` | `launchEngine` and `toolSettings` call `ensureGameBottle`; no TS shim for `engine_bottle_ensure_per_game` exists yet | **kept** |
| `gamePrefix.ts` | `resolveGamePrefix` is called by `launchEngine`, `gameEngineState` and `toolSettings` | **kept** |
| `legacyBottleUntouched.test.ts` | tests `selectEngineForLaunch` and the real `resolveGamePrefix` (the carry-forward's assertion lives here); its marker half is Rust's | **kept**, repointed (marker file name is a local constant) |
| `oracle/fixtureBottles.ts` | still imported by the launchEngine, engineDecision and engineConfig oracles | **kept** |
| tests of the four kept modules (`bottleLedger`, `perGameBottle`, `gamePrefix`, `engineRegistry`) | modules live | **kept**; `perGameBottle.test.ts` asserts the remove and kill calls instead of the filesystem |

`bottlesPortComplete` therefore forbids `createEngineSwitcher`, `EngineSwitcher`, `EngineSwitchDeps`, `EngineSwitchContext`, `buildCxbottleConf`, `writeCxbottleConf`, `switchServicesFrom` and `switchContextFrom`, and does not forbid the four identifiers of the kept modules (its doc comment says why). The engine slice's gate in 87-56 deletes the four modules together with `launchEngine.ts` and forbids their identifiers. Nothing here is revived: the kept modules are the ones 87-56's plan already names.

## D-08: where each deleted behavioural test went (Rust counterparts)

| Deleted or reworked TS test | Rust counterpart |
| --- | --- |
| `bottlePrimitives.test.ts` (kill, guarded removal, fallback creation) | `golden_bottles.rs`: `kill-ok`, `kill-timeout-false`, `kill-spawn-throws-false`, `kill-unsafe-names-no-spawn`, `kill-extra-env-cannot-override-prefix`, `remove-created-*`, `create-fallback-*` |
| sibling-safe removal | `golden_bottles.rs` `remove-created-inside-root-sibling-untouched`, `remove-created-symlinked-bottle`; `switch_incidents.rs` |
| `adoptBottle.test.ts` (cxbottle.conf writer) | `golden_bottles.rs` `conf-write-*` |
| `engineSwitch.test.ts`, `oracle/engineSwitch.oracle.test.ts` | `golden_switch.rs` (73 cases), `switch_incidents.rs` |
| `engineRuntime.test.ts` switch single-flight | `golden_switch.rs` `concurrent-same-target-wr02`, `concurrent-different-bottles-independent-wr02` |
| `oracle/bottles.oracle.test.ts` | the recorder of `golden/bottles` (146 cases), replayed by `golden_bottles.rs` |
| `legacyBottleUntouched.test.ts` marker half | `golden_switch.rs` `legacy-pre61-*` cases, `switch_incidents.rs`; its launch-step half stays in TS |
| `bridgeBottleLifecycle.test.ts` fallback creation order, partial-dir cleanup, createdHere and cancel cleanup | `golden_bottles.rs` `create-fallback-*`; the TS tests now pin the one typed call, the cancel id and the answer |
| the three `killBottleWineServerWith` unit tests | `golden_bottles.rs` `kill-*` |

The source-text gates in the deleted tests (none beyond what the unit tests held) are dropped; `bottlesPortComplete` carries the file-level and identifier-level guards.

## Decisions Made

See `key-decisions` above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Four of the seven named modules, `fixtureBottles.ts` and `legacyBottleUntouched.test.ts` have live callers**
- **Found during:** Task 2 (read_first grep of importers)
- **Issue:** the plan deletes `bottleLedger`, `engineRegistry`, `perGameBottle`, `gamePrefix`, `legacyBottleUntouched.test.ts` and `fixtureBottles.ts` and forbids `createBottleLedger`, `createEngineRegistry`, `createPerGameBottleFlights` and `resolveGamePrefix`. The still-TS launch step calls them synchronously until the plans that move it to Rust (87-50..87-56). Deleting them would mean writing the launch step's per-game bottle creation, prefix resolution, ledger and registry over new shims here, which is the work of 87-50 and 87-52.
- **Fix:** deleted what had no live caller; kept the rest; the delete gate and this table say which. The acceptance criterion `test ! -e src/backend/engine/perGameBottle.ts` is therefore **not met** (recorded here, not silently skipped).
- **Files modified:** `engineWinePortComplete.test.ts` (the spec and its comment)
- **Committed in:** `022b2c0c5`

**2. [Rule 3 - Blocking] Seven more storeManagers files and nine engine modules import the helpers than the plan's file list names**
- **Found during:** Task 1
- **Issue:** the acceptance count was 21 files at HEAD against 14 in `files_modified`; dynamic imports (`gameLaunch`, `gameEngineDialogs`, `gameInstallBridge`, `bridgeBottleLifecycle`) and `switchContextFrom` readers were not listed.
- **Fix:** all 21 repointed; the four `switchContextFrom` readers pass `{ paths, fallback }` inline; `steamPrepareFacts` stopped going through `steamSwitchDeps`.
- **Committed in:** `00f67d7f7`

**3. [Rule 3 - Blocking] The tests that stood in for Rust ran the deleted TS reference**
- **Found during:** Task 2
- **Issue:** `bridgeBottle.test.ts`, `bridgeBottleLifecycle.test.ts` and `perGameBottle.test.ts` asserted spawn traces and trees through `fakeBottleRust`'s run of `bottlePrimitives` (the 87-42 carry-forward asked for it to go).
- **Fix:** the fake records and answers by script; the cases assert the typed calls (kill args, remove names, create call, cancel id) and use the answers; the cases that only re-tested the Rust op's internals were dropped with their counterparts named above. The wineserver-kill cases for the CrossOver arm (a TS spawn in `steam/bottle.ts`) are unchanged.
- **Files modified:** the three tests, `fakeBottleRust.ts`, `engineRuntime.test.ts` (the switch single-flight case), `launchEngine.test.ts`, `launchEngine.deadline.test.ts` (kill spy), `legacyBottleUntouched.test.ts`, `games.test.ts` and ten other mocks of `bottlePrimitives` (now twin mocks over `jest.requireActual`)
- **Committed in:** `00f67d7f7`, `022b2c0c5`

**4. [Rule 3 - Blocking] The census floor and the DI ceilings are tied to the deleted files**
- **Found during:** Task 2
- **Issue:** `diPhaseGates.test.ts`' 66.4 owned list lost two entries (floor equals the list length, moved with every deliberate deletion before); the jest.mock ceilings of the deleted tests were stale and of five suites shrank (the dead `adoptBottle` mocks went).
- **Fix:** floor 65 to 63 with a dated comment; ceilings lowered; no ratchet went up. `knip` flagged `InstallRemove` in `engineServices.ts` (its only importer was `engineSwitch`), so it is no longer exported; the knip baseline needed no change.
- **Committed in:** `022b2c0c5`, `bf6db5e3f`

**5. [Rule 1 - Bug avoided] `fakeBottleGateRust.ts` has no engine-only memo to remove**
- **Issue:** the plan names an engine-only memo or prime helper there; the file answers the version-gate and backup channels (the redist installer and the oracles use them) and the 87-42 ledger and clear channels (the oracles use them), none engine-marker-only.
- **Fix:** left as it is, one comment line reworded.

---

**Total deviations:** 5 (4 Rule 3, 1 recorded non-change)
**Impact on plan:** the deletion scope is smaller than the plan's list by the modules the launch step still needs; everything the plan's goals depend on (D-24 direct imports, the marker with one writer, the quirk record, a green delete gate) is met. The four kept modules move with 87-56.

## Issues Encountered

- A first `sed -i` with BSD sed swallowed its script as the backup suffix; edits were redone with a script.
- zsh expands `$m[` and `=====` in shell loops; the greps were rewritten with `${m}`.
- `.planning/WINDOWS.md` row 3 table/JSON mismatch left alone as instructed.

## Known Stubs

None. No stub, skipped test or unrun verify was left.

## Threat Flags

None. No new endpoint, auth path or file access surface; the one removed surface is the TS marker writer (T-87-43: the only writer left is Rust's in-process gate, `roundtrip_state.rs` green).

## Self-Check: PASSED

- Created and deleted files verified on disk: `engine/pinEngine.ts` and the todo exist; `bottlePrimitives.ts`, `engineSwitch.ts` and `adoptBottle.ts` are absent (`bottlesPortComplete` asserts it).
- Commits `00f67d7f7`, `022b2c0c5` and `bf6db5e3f` are ancestors of HEAD; `commits: 3` measured from the ledger base `69c94c840`.
- `grep -c ENGINE_MARKER_CHAIN src/backend/stores/bottleVersionGate.ts` is 0 and `SHARED_REDIST_LEDGER_CHAIN` is 2; the storeManagers import count is 0; the todo carries `severity`, `platform`, `ready` in order.
- `pnpm exec jest src/backend src/common` 14814 passed; `cargo test -p gamelib-engine --features testing --test roundtrip_state` 7 passed; `pnpm codecheck`, `pnpm backend-di-ceilings`, `pnpm find-deadcode`, `pnpm planning-gates` and scoped lint (0 errors) pass; `npx prettier --check` over the changed files passes.
- Not met, recorded above: `test ! -e src/backend/engine/perGameBottle.ts`.

## Next Phase Readiness

Ready for 87-44. 87-50 to 87-56 own the four kept modules: when the launch step moves to Rust, `bottleLedger`, `engineRegistry`, `perGameBottle` and `gamePrefix` go with `launchEngine`, `engine/pinEngine.ts` goes with the last TS caller of the pin download, and `enginePins.ts`' re-export goes with the engine slice. A live Mac run of a Steam launch, an install and a DRM launch is still owed (87-42's D4, unchanged).

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-24*
