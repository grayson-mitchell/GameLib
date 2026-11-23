---
phase: 87-engine-wine-and-tools
plan: 09
subsystem: testing
tags: [oracle, golden, jest, dxvk, dxvk-nvapi, vkd3d, dxmt, github-releases, fake-home, gamelib-wine]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the oracle harness, HTTP recorder, spawn tracer, tree snapshot and redaction scan (87-05), and the 87-07 worked golden plan
provides:
  - the DXVK-family oracle test and 38 committed goldens under gamelib-wine/tests/fixtures/{golden,recorded}/dxvk
  - the DXMT oracle test and 21 committed goldens under gamelib-wine/tests/fixtures/{golden,recorded}/dxmt
  - the GitHub release feeds for the three Linux tools, the macOS DXVK pinned tag and DXMT latest, recorded live once with the request headers the Rust replay pins
  - toolsOracleSupport.ts, the shared synthetic tar.gz builder, platform pin and log capture for the tools oracles (87-10 reuses it)
affects: [87-27, 87-30, every later Phase 87 golden plan]

actuals:
  tokens: 167993
  tasks: 2
  commits: 2

plan_head_before: a520f6f76d89ecadc286a748069f2d670efd2bb4
plan_head_after: 6c716c82100dbfcfb3215a8066b91b44c10cfc89

tech-stack:
  added: []
  patterns:
    - "tools cases run the real createTools / registerDxmtListeners over a fake HOME; runWineCommand is a scripted stub whose calls (commandParts, wait, resolveOnExit, the reg import file text) are recorded after the spawn records in spawns.json"
    - "release archives are synthetic tar.gz built by a minimal ustar writer (mode 0644, mtime 0) and extracted by the real tar, so no DXVK, vkd3d, nvapi or DXMT binary is a fixture body"
    - "process.platform and process.arch are pinned per case: installOrUpdateTool compares the tool's os to process.platform and the vulkan-helper path carries both"
    - "concurrent installs trace in one order because the runner wrapper serialises process calls; the install path's un-awaited copyFile and writeFile are waited out by a tree-stability poll"
    - "DXMT listeners are reached through a stand-in event bus that keeps the handlers by name, so each handler's rejection is recorded (the real bus drops it)"

key-files:
  created:
    - src/backend/tools/__tests__/oracle/dxvk.oracle.test.ts
    - src/backend/tools/__tests__/oracle/dxmt.oracle.test.ts
    - src/backend/testUtils/engineWineOracle/toolsOracleSupport.ts
    - src-tauri/crates/gamelib-wine/tests/fixtures/golden/dxvk/ (MANIFEST.json, cases.json, expected/ for 38 cases)
    - src-tauri/crates/gamelib-wine/tests/fixtures/golden/dxmt/ (MANIFEST.json, cases.json, expected/ for 21 cases)
    - src-tauri/crates/gamelib-wine/tests/fixtures/recorded/dxvk/ (38 cases)
    - src-tauri/crates/gamelib-wine/tests/fixtures/recorded/dxmt/ (21 cases)
  modified:
    - src/backend/__tests__/engineWineFixtureRedaction.test.ts

key-decisions:
  - "wine commands are recorded at the runWineCommand seam (the tools' own boundary), not as real wine spawns: the wine process layer has its own goldens from 87-08"
  - "the strict restore's reg import file is read at call time and recorded as text (CRLF), since the tool deletes it before returning"
  - "the DXMT oracle calls each handler directly and awaits it rather than emitting on the bus, so a handler that rejects is recorded instead of becoming an unhandled rejection"
  - "case counts are 38 (DXVK) and 21 (DXMT) against the plan's minimums of 10 and 7: the extra cases pin the source-pinned strict restore branches, the offline and download-failure rejections, and the per-tool skips"

patterns-established:
  - "A cases.json written by a one-off generator is hand-authored data once committed; expected/ is only ever written by the harness"

requirements-completed: [SVC-02]

duration: 20 min
completed: 2026-11-23
status: complete

coverage:
  - id: D1
    description: "DXVK, dxvk-nvapi, vkd3d and dxvk-macOS install and remove on Linux prefixes and macOS bottles: per-tool and per-platform GitHub lookups (Vulkan 1.3, 1.2, none; the macOS pinned tag and -builtin asset skip), current_<tool> markers, reg add/delete/import/query and wineboot traces, evidence log lines, source-pinned strict restore branches, and the download-failure showDialog"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/tools/__tests__/oracle/dxvk.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "DXMT across the macho export gate outcomes (pass, fail, scan rejects), the bounded boot fetch (online, offline, already current, no copies, no wines), the latest_dxmt and versioned dirs, malformed release bodies, and the wineVersionInstalled and wineVersionUninstalled hooks"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/tools/__tests__/oracle/dxmt.oracle.test.ts"
        status: pass
    human_judgment: false
---

# Phase 87 Plan 09: DXVK-family and DXMT goldens Summary

**DXVK, dxvk-nvapi, vkd3d, the macOS DXVK and DXMT are pinned by 59 committed goldens (live GitHub feeds recorded once, install and remove trees, reg and wineboot traces, the export gate and the bounded boot fetch) before any Rust for them exists.**

## Performance

- **Duration:** 20 min (2026-11-23T01:47Z to 02:08Z)
- **Tasks:** 2 of 2
- **Files:** 3 source and test files, 1 edited test, 403 fixture files

## Accomplishments

- `dxvk.oracle.test.ts` drives `createTools(deps).DXVK.installRemove` over a fake HOME on Linux prefixes and macOS CrossOver and pinned-engine bottles. 38 cases: fresh install (the three Linux feeds recorded live once, all three archives downloaded and extracted, then the install), already current, update from the tools dir, 32-bit prefix, tilde prefix, Vulkan 1.2 (pinned DXVK v1.10.3 and VKD3D v2.6 tags), no GPU, download failure, offline, invalid prefix, the Game Porting Toolkit skip, remove with and without installed DLLs, dxvk-nvapi with and without an nvngx path (NGXCore `reg add`), vkd3d (x86 not x32), the source-pinned install and its five strict-restore outcomes, and on macOS the pinned Gcenx tag (recorded live once), the `-builtin` asset skip, the DXMT and toolkit skips, and the no-op for every tool but DXVK.
- `dxmt.oracle.test.ts` drives the production `registerDxmtListeners`. 21 cases: the boot fetch online (latest release recorded live once), offline, already current, tag differs with the tools dir current, no `-DXMT` copy, no installed wine, one copy failing the gate, a download failure; `wineVersionInstalled` through the gate (pass, fail, the Rust scan rejecting and failing closed, a non-Staging wine), tools already present, a download failure that removes the half-made copy, a feed with no assets key, an empty assets list, a feed that answers 500; and `wineVersionUninstalled` (removes the copy, no copy, wrong type). The scan request arguments (`scan_winemac_metal_exports`, `{wineBundlePath}`) are recorded per case.
- Every case records the result, every log line (the evidence lines such as `installing dxvk on... <HOME>/prefix` and `dxvk already installed!`), the renderer events, the requests with their headers (in `recorded/`), the tree afterwards (`<TOOLS>/dxvk`, `<TOOLS>/dxmt`, the prefixes and the wine version dirs) and the process trace (vulkan-helper probes, the real `tar`, then each `runWineCommand`).
- `MANIFEST.json` is `{count: 38, floor: 38}` and `{count: 21, floor: 21}`, asserted through `assertManifest`, each with an empty-list negative. The redaction `FILE_FLOOR` went 552 to 955 (812 after Task 1, 955 after Task 2); the scan passes over the live GitHub bodies.

## Task Commits

1. **Task 1 (tracer): DXVK, dxvk-nvapi, vkd3d and dxvk-macOS goldens end to end** - `78abe500a` (test)
2. **Task 2: DXMT export gate, bounded boot fetch and wine install hook goldens** - `6c716c821` (test)

Tracer gate: auto mode off, `HUMAN_VERIFY_MODE` end-of-phase, the tracer's `<verify>` is automated only, so it was run end to end (jest over the oracle and the redaction scan, MANIFEST present, prettier) and re-run after Task 2 with the shared helper extracted. Tracer verified end-to-end, expansion followed.

## Verification

- `GAMELIB_WRITE_ENGINE_GOLDEN= GAMELIB_ENGINE_ORACLE= pnpm exec jest --runTestsByPath` over both oracles, `engineWineFixtureRedaction.test.ts` and `fakeHomeIsolation.test.ts`: 4 suites, 81 tests passed, offline, three runs in a row. Six concurrent runs of the two oracles under load: 64 of 64 each (checks that the trace and log order do not depend on real `tar` timing).
- Acceptance: `golden/dxvk/MANIFEST.json` count 38 (>= 10); `golden/dxmt/MANIFEST.json` count 21 (>= 7).
- `npx prettier --check` over both oracles, the support module and the redaction test: clean (fixtures are prettier-ignored from 87-05). `npx eslint` and `npx tsc --noEmit -p tsconfig.json`: clean.
- Non-vacuity by mutation: changing `"wait": false` to `true` in a DXVK spawn golden failed `linux-dxvk-source-pinned-restore`; renaming the scan channel in a DXMT result golden failed `install-gate-fails`; both restored.

## Findings the port must decide on (D-19 deltas, recorded as goldens, not fixed)

1. **A failed or skipped getLatest makes installRemove reject.** Offline, or a failed DXVK download, leaves `latest_<tool>` missing and `installRemove` throws `ENOENT ... latest_dxvk` instead of returning false (`linux-dxvk-install-offline`, `linux-dxvk-install-download-fails`, and the macOS pair).
2. **The toggle install resolves before it has finished.** On the source-less path the DLL copies (`copyFile`) and the `current_<tool>` write (`writeFile`) are fire-and-forget; only the `reg add` loop is awaited. The oracle waits for the tree to stop changing before it records.
3. **The DXMT boot update rejects when offline.** After "App offline, skipping possible DXMT update" the listener still copies from an empty version dir and rejects with ENOENT (`boot-fetch-offline`, `boot-update-download-fails`).
4. **Listener rejections are dropped.** A feed without an `assets` key, or one that answers 500, rejects out of `wineVersionInstalled`; the event bus never sees the promise.
5. **Remove keeps no backup.** `restore` deletes the tool DLLs and relies on `wineboot -u` (or the engine-switch prefix update) to bring the stock ones back; the golden trees show the files gone.
6. **showDialog text is a key in the golden.** The backend jest project stubs i18next to return the key, so the dialog events carry `box.error.dxvk.title` and `box.error.dxmt.title`, not English. The port compares keys or the catalogue default.
7. **Request order of the three concurrent Linux feeds follows the `tools` list** (vkd3d, dxvk, dxvk-nvapi), not the order a live run saw responses.

## Deviations from Plan

### Auto-fixed Issues

None.

### Plan interpretation (not defects)

- **Wine commands at the `runWineCommand` seam.** The plan says "the `reg import` and wine spawn traces". The tools call `deps.commandRunner.runWineCommand`; the wine process layer under it is 87-08's golden. The traces are those calls, interleaved after the spawn records in `spawns.json` (`program: "runWineCommand"`).
- **`recorded/` holds every case, not only the live ones.** As in 87-07, record mode writes each case's exchanges (synthetic ones included) so the Rust replay has them; the two feeds that were live are the `live` cases.
- **No `fixtures/state` tree.** Starting states are `seed` entries in the hand-authored `cases.json`, as in 87-05 and 87-07.
- **Shared helper.** The archive builder, platform pin and log capture moved into `testUtils/engineWineOracle/toolsOracleSupport.ts` once the second oracle needed them; `renderLogMessage` is module-private so the knip ratchet stays at its one existing finding.
- **38 and 21 cases** against the plan's 10 and 7.

**Total deviations:** 0 auto-fixed. **Impact:** none on scope.

## Issues Encountered

- `pnpm find-deadcode` still reports only the 87-05 finding (`portSliceGate.ts` `manifest`), already in `deferred-items.md`; nothing new from this plan.
- The live vkd3d asset is a `.tar.xz` and the synthetic body is gzip; `tar` detects the compression from the bytes, so the extraction (macOS bsdtar here) is unaffected, but a Linux CI leg running the compare has not been exercised.

## Known Stubs

None.

## Threat Flags

None. Record mode reaches only the `api.github.com/repos/.../releases/...` feeds through `allowLive` (the plan's trust boundary); archive bodies are the synthetic tar.gz built in the test, and any other live request is refused by name.

## Next Phase Readiness

87-27 (DXVK) and 87-30 (DXMT) port against these goldens; the seven findings above are their D-19 delta decisions. `golden/{dxvk,dxmt}/deltas.json` were not created: no Rust-side difference exists yet to record. 87-10 (winetricks) can reuse `toolsOracleSupport.ts`.

## Self-Check: PASSED

Both oracle tests, the support module, both `cases.json` and `MANIFEST.json` files and the golden and recorded case directories exist on disk; commits `78abe500a` and `6c716c821` are ancestors of HEAD; acceptance criteria and plan-level verification re-run green.
