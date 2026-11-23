---
phase: 87-engine-wine-and-tools
plan: 12
subsystem: testing
tags: [oracle, golden, jest, engine-config, tool-settings, vectors, fake-home, gamelib-engine]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the oracle harness, spawn tracer, tree snapshot and redaction scan (87-05), the engine fixtures (87-11)
provides:
  - the engine-config oracle test and 70 goldens under gamelib-engine/tests/fixtures/golden/config (effective engine, option list, default engine, per-game bottle name, id and key grammars, tool settings, eligibility, the offline block)
  - engine_twin.json, 386 vectors for engineKeyFor, isWritableEngineOverride, importEngineSettings and getPerGameBottleNameFor
affects: [87-25, 87-28, the Rust engine config, tools, bottles and decision slices]

actuals:
  tokens: 172000
  tasks: 2
  commits: 2

plan_head_before: f3000feab471156cb4e175167dd972c92be5c4f5
plan_head_after: b1875471108e325d0966553c0d49d14bdcbd3eee

tech-stack:
  added: []
  patterns:
    - "an engine-config case seeds GamesConfig/<app>.json, config.json and store/wine-downloader-info.json (text carries placeholders, expanded by the test), builds the real engine runtime over the fake HOME, and records every item of a list-shaped case, so one case pins a whole table"
    - "the Wine Manager release list is read through the real wineManagerReleasesFrom over a store double that reads the seeded file, so the stored shape is the fixture"
    - "every case asserts and records that the profile tree is unchanged: reading engine state never creates a file"
    - "the CrossOver bin dir is scripted, never resolved: the real locator probes /Applications and Spotlight on the operator's machine"

key-files:
  created:
    - src/backend/engine/__tests__/oracle/engineConfig.oracle.test.ts
    - src-tauri/crates/gamelib-engine/tests/fixtures/golden/config/ (MANIFEST.json, cases.json, expected/ for 70 cases)
    - src-tauri/crates/gamelib-engine/tests/fixtures/vectors/engine_twin.json
  modified:
    - src/backend/__tests__/engineWineFixtureRedaction.test.ts

key-decisions:
  - "list-shaped cases: one case holds many items (the offline grid is 96 rows), so the MANIFEST counts scenarios while each golden pins a table"
  - "the per-game bottle flight is a scripted double in the tool-settings cases (it records its arguments); 87-11 owns the real flight's goldens"
  - "vector inputs that cannot be JSON (a long name) use the {repeat} generator of bottle_twin.json; an absent key stands for undefined"
  - "an unexpected throw is recorded by error class name only, never by message"

requirements-completed: [SVC-02]

duration: 11 min
completed: 2026-11-23
status: complete

coverage:
  - id: D1
    description: "D-08 effective engine: deriveEngineFromWine, resolveEffectiveEngine, readEngineForGame over GamesConfig and config.json files (override present, absent, legacy key, malformed, non-object entry, Steam), resolveGlobalEngine, readStoredGameConfig name guards, engineIdOf"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/engineConfig.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-08 options and defaults: listGameEngineOptions (CrossOver present and absent, pin installed and partial, Wine Manager releases filtered, Legacy rows for a game and the global default, argument shapes), getDefaultEngine (7 global shapes), getPerGameBottleNameFor, parseEngineOverride, isEngineKey and appNameOf"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/engineConfig.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-08 tool settings, eligibility and the offline block: resolveToolSettings and resolveToolSettingsForId over live selections, legacy, plain-prefix, bottle (absent, crossover, pinned, Wine Manager) shapes, engineKeyIfEligible for every runner and the native, Browser, non-macOS and bad-key exclusions, offlineLaunchCertainlyBlocked (arms plus a 96-row grid)"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/engineConfig.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-24 extended: engine_twin.json pins engineKeyFor (158), isWritableEngineOverride (34), importEngineSettings (51) and getPerGameBottleNameFor (143), compared byte for byte in compare mode, with a floor and an empty-list negative"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/engineConfig.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "82 D-05: golden/config carries MANIFEST {count: 70, floor: 20} asserted through assertManifest with an empty-list negative"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/oracle/engineConfig.oracle.test.ts#the committed MANIFEST agrees with the case list and holds one folder per case"
        status: pass
    human_judgment: false
---

# Phase 87 Plan 12: Engine configuration goldens and twin vectors Summary

**The effective engine, the option list, the default engine, the per-game bottle name, the tool-settings resolver, engine eligibility and the offline block are pinned by 70 TS-produced goldens over a fake HOME, and the four non-bridge pure twin helpers by 386 vectors, before any Rust for the config slice exists.**

## Performance

- **Duration:** 11 min by the system clock (the start time was not recorded; measured from the previous plan's last commit, 15:42 NZDT, to the last task commit, 15:52 NZDT)
- **Tasks:** 2 of 2
- **Files:** 1 new oracle test, 1 edited test, 1 hand-authored case list, 70 golden case folders (5 files each), 1 vector file

## Accomplishments

- `engineConfig.oracle.test.ts` runs the real modules (`engineConfig`, `gameEngineState`, `engineIds`, `gameKey`, `toolSettings`, `engineEligibility`, `offlineRefusal`, the engine runtime's fallback engine, registry and launch settings) over a fresh `createFakeHomeProfile()` per case. `GamesConfig/<app>.json`, `config.json` and `store/wine-downloader-info.json` are seeded files; the release list goes through the real `wineManagerReleasesFrom`.
- 70 goldens in `golden/config`:
  - **effective engine (23):** `deriveEngineFromWine` (7: CrossOver and non-objects, the current pin, a retired pin, installed Wine Manager releases, unusable releases, Legacy labels, no store file), `resolveEffectiveEngine` (4), `readEngineForGame` over files (11: stored overrides, own wine, four inherited-global cases, no config anywhere, corrupt and odd files, Steam never derives), `readStoredGameConfig` name guards (1).
  - **global, ids and keys (5):** `resolveGlobalEngine` stored and derived, `engineIdOf`, `parseEngineOverride`, `isEngineKey` and `appNameOf`.
  - **options and defaults (18):** `listGameEngineOptions` (8), `getDefaultEngine` (7), `getPerGameBottleNameFor` (3).
  - **eligibility and offline (7):** `engineKeyIfEligible` for each runner and each exclusion; `offlineLaunchCertainlyBlocked` arms plus a 96-row grid (87 not blocked, 6 `crossover-missing`, 3 `restore-needs-pin`).
  - **tool settings (17):** not engine-controlled, non-macOS host, the Game-free resolver's refusals, live CrossOver and pinned selections with and without a launch context, Legacy, plain prefix (pinned, missing, Wine Manager), bottle absent (read, failed and succeeded flight, shared bottle never created), bottle with a crossover marker, no marker, pinned marker, pinned override, Wine Manager override, pin not installed, a sideload id before its library entry.
- Every case records its inputs, every item's outcome, that the tree is unchanged, the log lines, a tree snapshot and the (empty) spawn trace; no case spawned a process or reached the network.
- `engine_twin.json`: `engineKeyFor` 158, `isWritableEngineOverride` 34, `importEngineSettings` 51, `getPerGameBottleNameFor` 143, each id unique, a floor of 100 in total and 20 per helper, an empty-list negative, compared byte for byte in compare mode.
- `MANIFEST.json` is `{count: 70, floor: 20}`, asserted through `assertManifest`. The redaction `FILE_FLOOR` went 2318 to 2686 (the tree already held 2333 files before this plan).

## Task Commits

1. **Task 1 (tracer): effective engine, options, defaults and grammars end to end** - `10ad7afaf` (test)
2. **Task 2: tool settings, eligibility, the offline block and the engine twin vectors** - `b18754711` (test)

Tracer gate: auto mode off, `HUMAN_VERIFY_MODE` end-of-phase, the tracer's `<verify>` is automated only, so it was re-run end to end after the commit (jest in compare mode, redaction and isolation suites, MANIFEST present, prettier clean) and passed. Tracer verified end-to-end, expansion followed.

## Verification

- `GAMELIB_WRITE_ENGINE_GOLDEN= pnpm exec jest --runTestsByPath` over the oracle, `engineWineFixtureRedaction.test.ts` and `fakeHomeIsolation.test.ts`: 94 passed, offline, compare mode; a write run left the committed tree byte-identical.
- Acceptance: `golden/config/MANIFEST.json` count 70 (>= 20); `engine_twin.json` has 4 keys; the config goldens hold the effective-engine, options and default-engine cases.
- `npx prettier --check` over the oracle test and the redaction test: clean (the fixtures are prettier-ignored). `npx eslint` over the oracle test and `npx tsc --noEmit -p tsconfig.json`: clean.
- Non-vacuity by mutation: flipping a value in the `default-engine-crossover` golden, one `"expected": true` in `engine_twin.json` and one `"blocked": true` in the offline grid each failed exactly one test; all restored.

## Findings the port must decide on (D-19 deltas, recorded as goldens, not fixed)

1. **The entry points under test swallow garbage arguments.** `listGameEngineOptions`, `getPerGameBottleNameFor` and `readEngineForGame` take non-object, null and wrong-typed arguments without throwing (the goldens record the plain list or `null`). `importEngineSettings` takes an object by type and no vector passes it a non-object, so its behaviour on one is not pinned.
2. **A retired pin id is not writable and not derivable.** `pinned:wine-staging-11.1` parses to `automatic` (stored) and a Wine whose bin is the retired pin's wine derives Legacy, so a bottle with such an override stays on CrossOver (`tool-settings-bottle-pinned-override-no-marker`).
3. **A stored `engineOverride` that is outside the grammar reads as Automatic with source `stored`**, not as a fall-through to derive; a non-string one falls through (`effective-stored-override`, `read-game-stored-overrides`).
4. **A Wine with type `wine` and a pin's bin path but a trailing slash or a `64` suffix is Legacy**; the comparison is exact string equality (`derive-current-pin`).
5. **`wine-manager:` versions are filtered twice**: the grammar rejects DXMT, toolkit, gptk and porting names and the option list repeats the filter before it parses (`options-wine-manager-releases`, `ids-parse-engine-override`).
6. **A live selection with no launch context returns the stored settings**: the tool targets the engine (`kind: engine`) but the overlay is the identity until the launch sets a context (`tool-settings-live-crossover-selection`).
7. **A CrossOver game on a shared (legacy) bottle that is absent is never created, even when the tool asks for it** and the flight is not called (`tool-settings-legacy-shared-bottle-never-created`).
8. **The per-game bottle name** is `GameLib-<runner>-<appName>` with every byte outside `[A-Za-z0-9-]` as `_hh` (a lone `.` kept), truncated at 64 characters with a 10-hex sha256 suffix over `runner:appName`; Steam, an unclean name and an unknown runner have none.
9. **`engineKeyFor` for Steam accepts 1 to 10 ASCII digits only**: `000620` and `1234567890` are keys as written (leading zeros kept); `12345678901`, `1e3`, `-1` and full-width digits are refused (`key-steam-*` vectors).

## Deviations from Plan

### Auto-fixed Issues

None.

### Plan interpretation (not defects)

- **"global default from a scripted PATH".** No function under test reads `PATH`: `getDefaultEngine` derives from the global `wineVersion` in `config.json` (or a stored `engineOverride`). The slice therefore seeds `config.json` and records seven global shapes; a spawn tracer with no script is the process runner, and every `spawns.json` is empty, which pins that nothing here spawns.
- **The CrossOver bin dir is scripted, not resolved.** The real locator checks `/Applications/CrossOver.app` and Spotlight, so its answer depends on the operator's machine. `listGameEngineOptions` takes the scripted `resolveCrossoverBinDir` through its `decision` deps and `resolveToolSettings` takes `crossoverBinDir` through its overrides. The locator is not part of this plan's list.
- **`ensureGameBottle` is a scripted double in the tool-settings cases** and records its arguments; the real flight over `createCrossoverBottle` is 87-11's (`ensure-*` goldens).
- **`cases.json` was generated once from a throwaway script** (data only, no expected values) and committed; `expected/` is only ever written by the harness, as in 87-05 and 87-11.
- **Counts.** 70 cases, 386 vectors and a 96-row grid against the plan's floor of 20.

**Total deviations:** 0 auto-fixed. **Impact:** none on scope.

## Issues Encountered

- `pnpm find-deadcode` still reports only the 87-05 finding (`portSliceGate.ts` `manifest`), already in `deferred-items.md`; nothing new from this plan.
- `actuals.tokens` is `estimateTokens` (chars/4) over the whole realized diff (689,335 characters); the generated goldens are most of it.
- The files already in the two fixture trees were 2333, not the 2318 the previous floor recorded; the floor now equals the tree exactly (2686).

## Known Stubs

None.

## Threat Flags

None. No network is reached and nothing is spawned; every config, release list and bottle is synthetic, BottleIDs are the redaction allow-list's first, and the scan (floor 2686) passes over every committed file (T-87-63: every expected value is produced by running the TS; the floor and the empty-list negative stop a vacuous slice).

## Next Phase Readiness

87-25 and 87-28 port the config, tools and decision slices against `golden/config` and `engine_twin.json`; the nine findings above are their D-19 delta decisions. `golden/config/deltas.json` was not created: no Rust-side difference exists yet.

## Self-Check: PASSED

The oracle test, `cases.json`, `MANIFEST.json`, 70 golden case folders and `engine_twin.json` exist on disk; commits `10ad7afaf` and `b18754711` are ancestors of HEAD; acceptance criteria and plan-level verification re-run green.
