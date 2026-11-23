---
phase: 87-engine-wine-and-tools
plan: 10
subsystem: testing
tags: [oracle, golden, jest, winetricks, vectors, apply-queue, fake-home, gamelib-wine]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the oracle harness, HTTP recorder, spawn tracer, tree snapshot and redaction scan (87-05), and toolsOracleSupport.ts (87-09)
provides:
  - the winetricks oracle test and 76 committed goldens under gamelib-wine/tests/fixtures/{golden,recorded}/winetricks
  - winetricks_pure.json, 147 input/output vectors for the pure parsers, the classifier, the apply guard and the metadata parse
  - spawn-tracer support for streamed scripted runs, scripted spawn failures and timed-out or truncated results
affects: [87-32, 87-33, every later Phase 87 golden plan]

actuals:
  tokens: 209886
  tasks: 2
  commits: 2

plan_head_before: b2af62876c3c9d8c0b18e6a78d2e77cf17d5da55
plan_head_after: 9f9fa3bd5ac304b9c0d79837d5a3246a64737ca4

tech-stack:
  added: []
  patterns:
    - "the winetricks oracle runs the real createTools and createWinetricksQueue over a fake HOME; every process (which, wine --version, winetricks) is a scripted answer of the spawn tracer, and process.env is replaced for the case by createFakeHomeProfile().childEnv(), so the recorded env diff is only what the tool built"
    - "a winetricks run streams: the case lists stdout and stderr chunks, the 1s progress ticks (jest fake setInterval only, advanced by the step) and the exit code; the fire-and-forget which and version probes are let settle before the first byte, as they would in a run that takes minutes"
    - "events are deep-cloned at send time because the tool hands the renderer a messages array it keeps appending to"
    - "the queue's winetricksQueueChanged pushes and game-status updates share one ordered event list with the renderer events, so interleaving is pinned"
    - "long vector inputs are stored as a generator ({repeat: {char, count}}) so the vector file stays small"

key-files:
  created:
    - src/backend/tools/__tests__/oracle/winetricks.oracle.test.ts
    - src-tauri/crates/gamelib-wine/tests/fixtures/vectors/winetricks_pure.json
    - src-tauri/crates/gamelib-wine/tests/fixtures/golden/winetricks/ (MANIFEST.json, cases.json, expected/ for 76 cases)
    - src-tauri/crates/gamelib-wine/tests/fixtures/recorded/winetricks/ (76 cases)
  modified:
    - src/backend/testUtils/engineWineOracle/spawnTrace.ts
    - src/backend/testUtils/engineWineOracle/__tests__/harness.test.ts
    - src/backend/__tests__/engineWineFixtureRedaction.test.ts

key-decisions:
  - "the spawn tracer gained three additive scripted-run features (stream, throws, timedOut and truncated, code null) rather than a winetricks-only runner double, so the 87-32 Rust replay can drive the same script shape"
  - "the game the library lookup returns is a native-game double, so toolSettings resolves to the stored settings: the engine and bottle resolution layer is not this slice's golden; a Steam title with no own bottle is the one case that reaches it (not-own-bottle, unavailable)"
  - "every body is synthetic and no live request is ever allowed (allowLive is always false): the script served by the URL is a five-verb synthetic with the metadata fields the parsers read, so no winetricks script is a fixture body (T-87-61)"
  - "the committed 146 KB metadata excerpt under src/common stays where it is: the vector names it and pins verb count, a sha256 of every parsed entry, the six needs-GUI verbs and six sampled entries"

patterns-established:
  - "A scripted run that must settle after probes it does not own awaits one macrotask first; ordering in the golden then does not depend on microtask depth"

requirements-completed: [SVC-02]

duration: 35 min
completed: 2026-11-23
status: complete

coverage:
  - id: D1
    description: "Winetricks script download (online, offline, Windows, cached under 7 days, stale, 500, network error, no tools directory) and the install lifecycle: streamed stdout and stderr, curl meter percent, 1s tick flushes, progressOfWinetricks with failed only on the ['Done'] event, installing-winetricks-component, the five which probes, missing-dependency lines and the mac wiki line, the unsupported-wine notice, umu and Proton, spawn-error dialog, refusal, invalid wine and the Steam bottle cases"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/tools/__tests__/oracle/winetricks.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Catalog reads (listAvailable annotated from the script, catalogFor cache, listInstalled on a bottle and a prefix), the sequential apply queue (order, state transitions, cancel remaining, failing verb, busy, same-tick apply, invalid payloads) and the environment reports (wine-version probe, dependency check)"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/tools/__tests__/oracle/winetricks.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Pure vectors: parseWinetricksListAll, VERB_SHAPE_RE, classifyWinetricksLine, splitOutputChunk, parseWineVersionOutput, parseUnsupportedWineVersion, isUnsupportedWineVersion, assertWinetricksApplyPayload (accepted and every rejection, WINETRICKS_APPLY_MAX_VERBS), isVisibleVerb, parseWinetricksMetadata, deriveNeedsGuiVerbs and the committed metadata excerpt, with a count, a floor and an empty-list negative"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/tools/__tests__/oracle/winetricks.oracle.test.ts"
        status: pass
    human_judgment: false
---

# Phase 87 Plan 10: Winetricks goldens Summary

**Winetricks is pinned by 76 committed goldens and 147 pure vectors (script download, streamed install lifecycle with its event sequence and spawn env, catalog reads, the sequential apply queue and the environment reports) before any Rust for it exists.**

## Performance

- **Duration:** about 35 min (2026-11-23, local 14:55 to 15:30)
- **Tasks:** 2 of 2
- **Files:** 1 oracle test, 3 edited harness and test files, 1 vector file, 464 golden and recorded fixture files

## Accomplishments

- `winetricks.oracle.test.ts` drives the real `createTools(deps).Winetricks` and `createWinetricksQueue` over a fake HOME. 76 cases:
  - **download (8):** online fresh (one GET, the `HeroicGamesLauncher/<version>` User-Agent, chmod 0755), offline, Windows host, fresh cache (no request, the chmod still runs), stale cache (8 days, refetched), 500, network error, tools directory missing.
  - **install (19):** a single verb on linux with a curl meter redrawn by bare CR, two 1s tick flushes, a wine noise line and the `['Done']` event; the macOS bottle with the wiki line; the unsupported-wine notice; the script fetched first online and the spawn at a missing path offline; non-zero exit with an abort line, a signal exit, partial last lines, a spawn error with its dialog, the already-installing refusal, an invalid wine, umu Proton, Proton without umu (`files/bin/wine`, `<prefix>/pfx`), the Steam bridge's explicit settings, a Steam title with no bottle, sorted missing dependencies on linux, a `which` that throws, and a stale record cleared.
  - **catalog reads (15):** `listAvailable` on a linux prefix and a macOS bottle (list-all split across chunks, the prefix block, apps and benchmarks, a needs-GUI verb and the hidden verbs, annotated from the script), the script fetched or missing, the wine-version probe unsupported, failing or silent, the stderr warning, empty output, a non-zero exit, a spawn error and umu; `catalogFor` miss then cached and an empty list never cached; `listInstalled` on a prefix, a bottle, a Proton `pfx`, with no log, and on a Steam title with no bottle.
  - **environment reports (15):** `checkWineVersion` unsupported, the 7.99 edge, 8.0, 10.0 compared numerically, a supported wine clearing a stale record, and unparseable, non-zero, timed-out, truncated and failing-to-spawn probes that never clear one; `checkDependencies` all present, the same subset (no push), a linux subset, all five on macOS with the wiki line, and a probe that throws.
  - **queue (19):** three verbs in order with every state transition and the `winetricks` then `done` game status, a cached catalog, dedupe, cancel remaining mid-queue, a failing verb, a spawn-error verb, a second apply while running, two applies in the same tick, an apply from inside a run, an apply while a component installs, the invalid payloads (not an array, empty, not in the catalog, a hidden verb, shape, 101 verbs) and an environment warning mid-run.
- Every case records the result (returns, every log line, the environment report, the `installing` flag, the launcher calls), the events in order (`installing-winetricks-component`, `progressOfWinetricks`, `showDialog`, `winetricksQueueChanged`, the game status), the requests with their headers, the tree and the process trace with each call's env diff. A run asserts on every case that `failed` appears only on the `['Done']` event and that a spawned install ends in it.
- `winetricks_pure.json` holds 147 vectors in 13 groups; the apply-guard group has 29 (five accepted shapes, every rejection message, the 100-entry maximum and the 101st). `MANIFEST.json` is `{count: 76, floor: 76}`, asserted through `assertManifest` with an empty-list negative; the vector file carries its own floor of 60 and an empty-list negative.
- The redaction `FILE_FLOOR` went 955 to 1420 (the wine fixture file count; 1015 after Task 1). The scan passes.

## Task Commits

1. **Task 1 (tracer): script download and single-verb install goldens** - `c3a17b59b` (test)
2. **Task 2: vectors, catalog reads, apply queue and environment goldens** - `9f9fa3bd5` (test)

Tracer gate: auto mode off, `HUMAN_VERIFY_MODE` end-of-phase, the tracer's `<verify>` is automated only, so it was run end to end (jest over the oracle and the redaction scan, MANIFEST present, prettier) and passed; expansion followed.

## Verification

- `GAMELIB_WRITE_ENGINE_GOLDEN= GAMELIB_ENGINE_ORACLE= pnpm exec jest --runTestsByPath` over the oracle, `engineWineFixtureRedaction.test.ts`, `fakeHomeIsolation.test.ts` and the harness self-test: 126 tests passed, offline, three runs in a row. Six concurrent runs of the oracle under load: 81 of 81 each.
- Acceptance: `winetricks_pure.json` 147 vectors (>= 60); `golden/winetricks/MANIFEST.json` count 76 (>= 10); the single-verb install case ends in the `['Done']` event.
- `npx prettier --check` over the oracle, the tracer, the harness self-test and the redaction test: clean (fixtures are prettier-ignored). `npx eslint` over the same and `npx tsc --noEmit -p tsconfig.json`: clean.
- Non-vacuity by mutation: changing `"failed": true` to `false` in the `queue-failing-verb-continues` events golden failed that case; restored.

## Findings the port must decide on (D-19 deltas, recorded as goldens, not fixed)

1. **A failed script download is not an error to the caller.** `downloadFile` returns the `AxiosError` instead of throwing, so the 500 and network-error cases fall through to `chmod`, which fails with ENOENT; the logged warning names the chmod, not the HTTP status (`download-server-error`, `download-network-error`). With no tools directory the write itself fails (`download-tools-dir-missing`).
2. **`progressOfWinetricks` hands out a live array.** `messages` is the run's own `executeMessages`, appended to after the send; only the serialisation boundary makes it a snapshot. The goldens clone at send time.
3. **A spawn error sends no Done.** `onSpawnError` shows the dialog and resolves, but never sends the `['Done']` event; the renderer relies on the closing `installing-winetricks-component ''` (`install-spawn-error-dialog`, `queue-spawn-error-verb-fails-and-queue-continues`).
4. **Cancel pushes once per skipped verb.** After `cancelRemaining`, the loop pushes the state again for each cancelled verb, so three identical snapshots with rising revisions follow the verb that was running (`queue-cancel-remaining-mid-queue`).
5. **The linux env always carries `GAMEID=umu-0` and `UMU_RUNTIME_UPDATE=0`**, umu or not; the mac env passes the unreplaced settings to the two env builders where linux passes the always-wine ones (the FIXME in the source), pinned by the `launcher` list in `install-missing-dependency-mac-wiki` against `install-proton-without-umu`.
6. **umu drops `-q`.** With umu the program is umu's, argv starts with `winetricks` and the `-q` is removed (`install-umu-proton`, `list-available-umu-proton`).
7. **The wine-version probe runs on list-all only, fire and forget.** An unparseable, non-zero, timed-out, truncated or throwing probe leaves an existing record alone; a supported one clears it.
8. **The missing-dependency wiki line is an environment line, not a dialog.** It names Heroic's wiki page on purpose (the source says GameLib has no equivalent).
9. **`showDialog` text is a key in the golden.** The backend jest project stubs i18next to return the key, so the dialog carries `box.error.winetricks.title` and `.message`.
10. **A hidden verb never reaches the guard's hidden check through the real catalog.** `listAvailable` already filters hidden verbs, so `annihilate` is rejected as not in the catalog (`queue-invalid-hidden-verb-is-not-in-catalog`); the guard's own hidden-verb message is reached only by the vector file (`reject-hidden-annihilate`).
11. **The 100-verb maximum counts entries, not distinct verbs**, and is checked before shape and catalog (`reject-one-over-the-maximum` carries an empty catalog and still reports the count).

## Deviations from Plan

### Auto-fixed Issues

None.

### Plan interpretation (not defects)

- **"The wiki message dialog".** The plan says the missing-dependency case records a wiki message dialog. `checkDependencies` appends the wiki URL as an `environment` log line and records the missing subset; it opens no dialog. The one dialog the winetricks tools send is the spawn-error one, which has its own cases.
- **No live exchange.** The threat model names "the release lookup" and the plan's D-08 line names the raw.githubusercontent.com download. The winetricks tools make only the one script GET and no release lookup; its body is synthetic, as the plan requires, so `recorded/` holds synthetic exchanges and no case is `live`.
- **Tracer extension.** The streamed run, the scripted spawn failure and the timed-out and truncated results needed three additive options on `createSpawnTracer` (with two self-tests); existing goldens are byte-identical.
- **Vectors beside the goldens.** The metadata fixture is not copied: its vector names the committed path and pins a digest of the whole parse plus six sampled entries.
- **76 cases and 147 vectors** against the plan's minimums of 10 and 60.

**Total deviations:** 0 auto-fixed. **Impact:** none on scope.

## Issues Encountered

- `pnpm find-deadcode` still reports only the 87-05 finding (`portSliceGate.ts` `manifest`), already in `deferred-items.md`; nothing new from this plan.
- The first record run replaced `process.env` and lost the `GAMELIB_ENGINE_ORACLE` switch the golden writer reads mid-case; the mode is now read once before the swap.

## Known Stubs

None.

## Threat Flags

None. Record mode reaches no network (`allowLive` refuses everything) and the script body is synthetic.

## Next Phase Readiness

87-32 (winetricks queue) and 87-33 (winetricks install and catalog) port against these goldens and vectors; the eleven findings above are their D-19 delta decisions. `golden/winetricks/deltas.json` was not created: no Rust-side difference exists yet to record.

## Self-Check: PASSED

The oracle test, the vector file, `cases.json`, `MANIFEST.json` and the 76 golden and 76 recorded case directories exist on disk; commits `c3a17b59b` and `9f9fa3bd5` are ancestors of HEAD; acceptance criteria and plan-level verification re-run green.
