---
phase: 87-engine-wine-and-tools
plan: 08
subsystem: testing
tags: [oracle, golden, jest, vectors, spawn-trace, fake-home, gamelib-wine, wine-env, discovery]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the oracle harness, spawn tracer, tree snapshot and redaction scan (87-05), and the gamelib-wine fixtures tree (87-02)
provides:
  - wine_env.json, 61 input/output vectors of setupEnvVars and setupWineEnvVars (every wineVersion.type, platform and toggle)
  - valid_wine.json, 19 validWine vectors, and default_wine.json, 8 getDefaultWineBinary vectors
  - golden/wine_command, 16 runWineCommand spawn-trace cases, and golden/discovery, 51 discovery cases
  - the TS quirks the Rust gamelib-wine core must decide on as D-19 deltas
affects: [87-19, the Rust gamelib-wine core and discovery slices, DXVK, Winetricks and bottle creation ports]

actuals:
  tokens: 137558
  tasks: 2
  commits: 2

plan_head_before: aab9e828757c5f153f61be8fd96cd0c36d7de44e
plan_head_after: 79620d47a6406a6137a1e64af64446d078534db7

tech-stack:
  added: []
  patterns:
    - "env-builder vectors are {id, platform, settings, gameId, installPath, env, existing, expected}: placeholders (<HOME>, <TOOLS>) in every path, the six read process.env keys set per vector, `existing` entries made on the fake profile (trailing `/` is a directory)"
    - "runWineCommand runs through createCommandRunner over the real setupEnvVars, setupWineEnvVars, validWine, verifyWinePrefix, isUmuSupported and getUmuPath, with process.env replaced by the fake profile's eight variables plus a scripted PATH, and the runner options the command runner chooses pinned as events"
    - "discovery cases take their bundle paths from scripted mdfind output under <HOME>/Applications and <TOOLS>; os.homedir is pinned to the fake HOME, /usr/share/steam is made non-existent and directory listings are sorted"
    - "a vector file is a bare array; its count and floor are asserted in the oracle test with assertAtOrAboveFloor, and compare mode re-checks the committed file"

key-files:
  created:
    - src/backend/wine/__tests__/oracle/wineCore.oracle.test.ts
    - src/backend/wine/__tests__/oracle/wineDiscovery.oracle.test.ts
    - src-tauri/crates/gamelib-wine/tests/fixtures/vectors/ (wine_env.json, valid_wine.json, default_wine.json)
    - src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_command/ (MANIFEST.json, cases.json, expected/ for 16 cases)
    - src-tauri/crates/gamelib-wine/tests/fixtures/golden/discovery/ (MANIFEST.json, cases.json, expected/ for 51 cases)
  modified:
    - src/backend/__tests__/engineWineFixtureRedaction.test.ts

key-decisions:
  - "Vectors carry only the 21 GameSettings fields the env builders read plus wineVersion, so the Rust side deserialises one small shape"
  - "Directory listings are sorted in the discovery oracle: the TS lists in filesystem order (alphabetical on APFS, hash order on ext4), so a golden that followed the recording machine would fail on the Linux leg; the Rust port sorts too (a D-19 hardening)"
  - "The real verifyWinePrefix runs inside the missing-prefix cases, so the wineboot --init spawn and its wineserver --wait are recorded, not stubbed"
  - "getAlternativeWine is called through the GlobalConfig prototype over a stand-in this; every case stores a release list so the refresh branch (recorded by 87-07) never reaches the network"

patterns-established:
  - "A spy on a node module that is also imported by name (os.release, os.homedir, graceful-fs existsSync and readdirSync) is taken on require('os') / require('graceful-fs'), the registry's own object: a namespace import is a frozen copy and jest.spyOn throws 'Cannot redefine property'"
  - "A scripted spawn output's stdout is expanded onto the profile like its program and argv, or a path it prints names no file"

requirements-completed: [SVC-02]

duration: 8 min
completed: 2026-11-23
status: complete

coverage:
  - id: D1
    description: "setupEnvVars and setupWineEnvVars pinned as 61 shared vectors over every wineVersion.type, the Linux runtime-path, GStreamer and wine-dll probe branches, the Steam id fallbacks, custom env and the unset-variable syntax, and macOS crossover CX_BOTTLE"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/wine/__tests__/oracle/wineCore.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "validWine over each wine type with binaries present, missing and partly present, and runWineCommand recorded as spawn traces (wine wait and no-wait, proton with and without umu, crossover, custom verb, missing prefix running verifyWinePrefix, Invalid wine)"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/wine/__tests__/oracle/wineCore.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Wine discovery (CrossOver, wine-on-mac, Wineskin, GPTK, system GPTK, Whisky, the Linux set with custom paths, getAlternativeWine order) and getDefaultWineBinary with and without wine on PATH, on a fake HOME with a scripted PATH"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/wine/__tests__/oracle/wineDiscovery.oracle.test.ts"
        status: pass
    human_judgment: false
---

# Phase 87 Plan 08: Wine core and discovery goldens Summary

**The wine command core is pinned by 61 env-builder vectors, 19 validWine vectors and 16 runWineCommand spawn traces, and macOS/Linux wine discovery by 51 goldens plus 8 default-wine vectors, all recorded from the TS on a fake HOME before any Rust for them exists.**

## Performance

- **Duration:** 8 min (2026-11-23T01:44Z to 01:53Z)
- **Tasks:** 2 of 2
- **Files:** 2 test files, 1 test edited, 342 fixture files

## Accomplishments

- `wineCore.oracle.test.ts` records three artefacts through the 87-05 harness. `vectors/wine_env.json` holds 61 vectors: for each, the platform, the settings the builders read, the six read `process.env` keys (`LD_PRELOAD`, `LD_LIBRARY_PATH`, `ORIG_LD_LIBRARY_PATH`, `SteamAppId`, `STEAM_COMPAT_APP_ID`, `SteamGameId`), the `existing` paths and the two outputs. They cover wine, proton, crossover and toolkit, DXVK HUD and fps cap, FSR sharpness (default, 0, 5), esync, fsync, msync, Wayland and HDR, WoW64, nvapi, the EAC and BattlEye runtimes, verbose logs with and without user keys, the GStreamer and wine-dll probes (both, one, none), the no-lib-paths branches on Linux and mac, the Steam id fallbacks, custom env with quotes and the empty (unset) value, `WINEDLLOVERRIDES` appended case-insensitively, the deprecated GE name workaround and macOS `CX_BOTTLE`.
- `vectors/valid_wine.json` holds 19 `validWine` vectors: wine with both, one or neither binary, no wineserver field, an empty one, proton, crossover, toolkit on and off the macOS version check, and a null wine. Both outcomes occur, so an always-true or always-false `validWine` cannot pass.
- `golden/wine_command` holds 16 cases run through the real `createCommandRunner` with the real `verifyWinePrefix`, `isUmuSupported` and `getUmuPath`: wine wait and no-wait, proton plain, proton with `umu-run` on PATH, proton with umu allowed but absent, a custom `protonVerb`, crossover with a bottle, the missing and partly present prefix (the warning, the prefix directory, then `wineboot --init` and its `wineserver --wait` before the command), `Invalid wine` for a missing binary, a missing wineserver and a quoted binary, the default settings, wrappers, `ignoreLogging` dropping `PROTON_LOG`, and `resolveOnExit` with a track key. Each records the result, `commandParts` before and after, the spawn trace (program, argv, envDiff, cwd), the runner options the command runner chooses (`replaceEnv`, `track`, `resolveOn`, timeout, `windowsHide`), the warnings and the output events, and the profile tree.
- `wineDiscovery.oracle.test.ts` records `golden/discovery` (51 cases) and `vectors/default_wine.json` (8): CrossOver by scripted `mdfind` (one, two, none, a failing query, an app missing its `wine`, a stale Spotlight path, off macOS), wine-on-mac (tools and Spotlight, the `wine` fallback, no binary, a failing query), Wineskin, GPTK, system GPTK (heroic/tools excluded, first match only), Whisky, the mac aggregate order, the Linux set (fresh profile creating `tools/wine` and `tools/proton`, tools and Lutris wine with and without libs and wineserver, Proton directories with `UMU-Latest` skipped, Steam libraries and `showValveProton`, a missing and a throwing `libraryfolders.vdf` read, system wine with and without a `--version`, custom paths from config, the empty-config skip, `scanCustom` off, and the full order) and `getAlternativeWine` on mac and Linux. `getDefaultWineBinary` is recorded with `wine` and a sibling `wineserver`, without one, in the second PATH directory, not executable, as a symlink (reported as the link), first-match-wins, PATH unset and no wine (`Default Wine - Not Found`).
- Counts and floors (82 D-05): `wine_command` and `discovery` carry `MANIFEST.json` (`{16, 16}`, `{51, 51}`) asserted by `assertManifest`; the three vector files are asserted by `assertAtOrAboveFloor` in the tests (61 against 40, 19 against 14, 8 against 8) and again on the committed file in compare mode. An empty case list fails for both slices. The redaction `FILE_FLOOR` went 210 to 552 (the 342 files this plan commits); the scan passes.

## Task Commits

1. **Task 1 (tracer): env-builder, validWine and runWineCommand goldens** - `5f7e2eb9a` (test)
2. **Task 2: discovery goldens and the default-wine vectors** - `79620d47a` (test)

Tracer gate: auto mode off, `HUMAN_VERIFY_MODE` end-of-phase, the tracer's `<verify>` is automated only, so it was run end to end before the commit and again as part of the final superset run (86 of 86 offline, three consecutive runs stable). Tracer verified end-to-end, expansion followed.

## Verification

- `GAMELIB_WRITE_ENGINE_GOLDEN= pnpm exec jest --runTestsByPath` over both oracle tests, `engineWineFixtureRedaction.test.ts` and `fakeHomeIsolation.test.ts`: 4 suites, 93 tests passed, offline, three runs.
- Acceptance: `wine_env.json` holds 61 vectors (>= 40); `golden/wine_command/MANIFEST.json` count 16 (>= 8); `golden/discovery/MANIFEST.json` count 51 (>= 12); `default_wine.json` holds the `Default Wine - Not Found` vector (4 occurrences: the record, three cases).
- `npx prettier --check` over both oracle tests and the redaction test: clean (the fixtures are prettier-ignored since 87-05; `--file-info` reports `ignored: true`). `npx eslint` over the three files: clean. `npx tsc --noEmit -p tsconfig.json`: clean.
- Non-vacuity by mutation: changing `PROTON_NO_FSYNC` in a committed env vector failed the env test; changing a CrossOver name in a committed discovery golden failed `crossover-one`; both were restored.

## Findings the port must decide on (D-19 deltas, recorded as goldens, not fixed)

1. **The macOS version check compares the Darwin kernel major to 14.** `isMacSonomaOrHigher` reads `os.release()`, which on macOS is the Darwin version, so every macOS from 10.10 (Darwin 14) passes. `toolkit-present-darwin-14` is true, `toolkit-present-old-darwin-13` false.
2. **`validWine` tests the binary as stored, quotes included.** A wine whose `bin` is `'/path'` (single-quoted) is `Invalid wine` (`quoted-bin-is-invalid-wine`), so the later `replaceAll("'", '')` in `runWineCommand` is unreachable for a valid wine. A proton or crossover `wineserver` is never checked; a wine whose `wineserver` is `''` is invalid.
3. **`runWineCommand` mutates `commandParts`** in place (the proton verb and the wrapper list are unshifted into the caller's array); `commandPartsAfter` is recorded in each result.
4. **`getCrossover` lists a bundle that has a plist but no `wine` binary** (`crossover-app-missing-wine`), with `wineserver: ''`.
5. **`getSystemGamePortingToolkitWine` tries only the first match**, so a first match that is no longer on disk hides a later one that exists (`system-gptk-first-match-wins`).
6. **Directory order is the filesystem's.** The goldens pin the sorted order (the oracle sorts `readdirSync`); the Rust port has to sort to match, which makes it deterministic where the TS is not.
7. **`getWineOnMac` reads the `tools/wine` directory, not the wine-manager store.** The plan's "from installed wine-manager versions (state `store/wine-downloader-info.json`)" is therefore recorded as directories; the store is not an input to this function.

## Deviations from Plan

### Auto-fixed Issues

None needed beyond the test's own construction (an async `withPath` and a stdout-expansion bug found and fixed before the first commit of Task 2; no committed defect).

### Plan interpretation (not defects)

- **No `fixtures/state` tree and no store seed for wine-on-mac** (see finding 7); a case's starting state is `seed` in the hand-authored `cases.json`, as in 87-05 and 87-07.
- **`cases.json` was generated once from a throwaway script** kept in the scratchpad and not committed; the committed JSON is now the source and is hand-editable. The vector inputs live in the oracle tests' tables and the vector files are written from the TS.
- **`getAlternativeWine` never reaches the refresh branch** (a stored release list in every case); the refresh is 87-07's `refresh-*` goldens.
- **Counts exceed the minimums:** 61 env vectors against 40, 16 wine_command cases against 8, 51 discovery cases against 12.
- **A first sketch of the discovery spy sorted nothing;** the sorted-listing hardening was added when it was clear the Linux CI leg would otherwise differ from the APFS recording (finding 6).

**Total deviations:** 0 auto-fixed. **Impact:** none on scope.

## Issues Encountered

None. `pnpm find-deadcode` was not re-run: this plan adds no exports.

## Known Stubs

None.

## Threat Flags

None. No network surface; `process.env` was restricted to synthetic values (T-87-12 mitigated, scan passes), no recorded path names the operator, and the spawns are scripted so no wine binary runs.

## Next Phase Readiness

The Rust `gamelib-wine` core replays `wine_env.json`, `valid_wine.json` and `golden/wine_command`, and the discovery slice replays `golden/discovery` and `default_wine.json`; the findings above are its D-19 delta decisions. `golden/{wine_command,discovery}/deltas.json` were not created: no Rust-side difference exists yet to record. Ready for the next Wave 3 plan.

## Self-Check: PASSED

Both oracle tests, the three vector files, both `MANIFEST.json` files and their `cases.json` and `expected/` folders exist on disk; commits `5f7e2eb9a` and `79620d47a` are ancestors of HEAD; acceptance criteria and plan-level verification re-run green.
