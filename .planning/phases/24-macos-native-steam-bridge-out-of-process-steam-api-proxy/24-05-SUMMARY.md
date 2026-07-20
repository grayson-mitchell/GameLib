---
phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy
plan: 05
subsystem: infra
tags: [steam, macos, bridge, objdump, pe32, wine, crossover, bottle, shim]

# Dependency graph
requires:
  - phase: 24 (24-01)
    provides: generated shim source + builtBridgeShimPath (paths.ts, BLOCKER 2 shared compiled-binary location)
  - phase: 24 (24-04)
    provides: provisionBridgeBottle()/getBridgeBottleSettings()/getBottleDir()/sanitizeBottleName() dedicated bridge bottle foundation
provides:
  - "importScan.ts -- objdump --private-headers wrapper + steam_api import parser (R3)"
  - "shimGenerate.ts -- placeShimForGame(): automatic, idempotent, coverage-validated per-bottle shim placement (R3)"
affects: [24-08 (games.ts installBridgeGame integration -- sole intended caller of placeShimForGame), 24-10 (hardware UAT)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "objdump PE import-table section-scoped line parsing (DLL Name heading boundaries), not a single multi-line regex -- resilient to GNU vs Apple LLVM objdump column-width variance"
    - "Dependency-injected shimSourcePath default (builtBridgeShimPath) so shimGenerate's own tests never need to mock a module-level path constant"
    - "Coverage-validate-not-generate: 24-01's single superset .def is placed as-is; objdump-derived imports only VALIDATE coverage, never drive per-game export selection (review finding #9, unchanged this plan)"

key-files:
  created:
    - src/backend/storeManagers/steam/bridge/importScan.ts
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/bridge/__tests__/importScan.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/fixtures/objdumpImports.ts
  modified: []

key-decisions:
  - "SHIM_EXPORTED_SYMBOLS in shimGenerate.ts is a reviewed, literal copy of meta/gen_vtables.ts's FLAT_EXPORTS_SUPERSET, not a cross-boundary import -- tsconfig's `include: [\"src\"]` excludes meta/, and the compiled .dll ships without its source .def at packaged runtime, so a shared TS import isn't viable; kept in sync per D-07's regenerate-and-review posture"
  - "placeShimForGame(appId, gameExePath, opts?) takes shimSourcePath as an injectable option defaulting to the real builtBridgeShimPath import -- lets tests point at a tmpdir fixture without mocking a module-level const, while still proving (via a source-grep test) that the production default is the real BLOCKER 2 shared location, not a second path"
  - "Path containment for gameExePath uses resolve()+relative() against getBottleDir(bottleName), rejecting '..'/absolute relative results -- NOT a path.join/startsWith string check (memory: 'path.join is not containment')"
  - "Idempotent existsSync(shimPath) guard runs BEFORE existsSync(shimSourcePath)/objdump/coverage-validation -- a second call on an already-shimmed game skips the import scan entirely, not just the copy"

patterns-established:
  - "objdump PE import fixtures reconstructed from spike 007/008's own README + committed steam_api.def evidence (no raw objdump text was archived by the spikes) -- documented in the fixture file's own header comment as a reconstruction, not a captured artifact"

requirements-completed: [R3]

# Metrics
duration: ~20min
completed: 2026-07-20
---

# Phase 24 Plan 05: macOS Native Steam Bridge -- Automatic Per-Bottle Shim Placement Summary

**`importScan.ts` enumerates a game's exact imported `steam_api` symbol set via argv-form `objdump --private-headers`, and `shimGenerate.ts`'s `placeShimForGame()` idempotently copies 24-01's compiled superset shim next to the game's `.exe` inside the bridge bottle only after validating the shim's export set covers every imported symbol -- no manual copy step, single callable entry point for 24-08.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-20T06:45:04Z
- **Completed:** 2026-07-20T06:59:15Z
- **Tasks:** 2
- **Files modified:** 5 (all created)

## Accomplishments

- `importScan.ts`: argv-form `spawnAsync('/usr/bin/objdump', ['--private-headers', exePath])` (never a shell string, T-24-06/ASVS V5), section-scoped JS parsing of the `DLL Name: steam_api.dll` import block (no shelling to `grep`), numeric appId guard, and a never-throws typed-error path for spawn failure / non-zero exit
- Reconstructed realistic `objdump --private-headers` PE import-table fixtures for both acceptance-set games (the spikes never archived raw objdump text) -- Avernum 4 = exactly 2 symbols, Hoard/Reuben = exactly 7, cross-checked against each spike's own committed `steam_api.def` and README
- `shimGenerate.ts`'s `placeShimForGame()`: sanitize-then-place shape mirroring `provisionBottle()` -- numeric appId guard, `sanitizeBottleName` guard, `resolve()+relative()` containment check (never `path.join`/string-prefix) all run BEFORE any filesystem operation; idempotent `existsSync` short-circuit runs before objdump/coverage work; export-coverage validation rejects (with no auto-remediation) a game whose imports exceed 24-01's superset `.def`; a missing compiled `.dll` at dev time returns a typed `'shim-not-built'` result rather than throwing
- 19 new unit tests (10 importScan, 9 shimGenerate) all green; shimGenerate's tests use real-tmpdir black-box fs (manifest.test.ts precedent -- `node:fs`/`fs/promises` are non-configurable getters, unmockable in this project's ts-jest/CJS interop) rather than mocking `node:fs`
- No regressions: full `bridge/` + `bottle.test.ts` suite (128 tests across 5 files) green; `pnpm codecheck` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: importScan.ts -- objdump wrapper + steam_api import parser** - `f423dc06` (feat)
2. **Task 2: shimGenerate.ts -- automatic per-bottle shim placement** - `0e3c1d2a` (feat)

## Files Created/Modified

- `src/backend/storeManagers/steam/bridge/importScan.ts` - `scanSteamApiImports()`/`parseSteamApiImports()`: objdump wrapper + pure PE-import-section parser
- `src/backend/storeManagers/steam/bridge/shimGenerate.ts` - `placeShimForGame()`: sanitize/guard -> idempotent-check -> coverage-validate -> copy placement orchestrator
- `src/backend/storeManagers/steam/bridge/__tests__/importScan.test.ts` - 10 tests: fixture symbol extraction (2/7), argv-form assertion, empty-import case, non-zero-exit + spawn-rejection typed-error paths
- `src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts` - 9 tests: placement success, idempotency, coverage-rejection, non-numeric-appId/unsafe-bottle-name/outside-bottle-path guards, shim-not-built typed result, BLOCKER-2 default-import + no-second-hardcoded-path source-grep assertion
- `src/backend/storeManagers/steam/bridge/__tests__/fixtures/objdumpImports.ts` - Reconstructed `objdump --private-headers` fixture text for Avernum 4 / Hoard / a no-steam_api-import binary

## Decisions Made

See `key-decisions` in frontmatter. Most consequential: `SHIM_EXPORTED_SYMBOLS` is a manually-synced literal copy of `meta/gen_vtables.ts`'s `FLAT_EXPORTS_SUPERSET` rather than a cross-tsconfig-boundary import, because `src/`'s `tsconfig.json` scopes `include` to `["src"]` only (excluding `meta/`) and the packaged app never ships the source `.def` alongside the compiled `.dll` -- a real import isn't viable at either compile time or packaged runtime. This mirrors the codebase's own established convention of deliberately duplicating small guard constants (`NUMERIC_APP_ID` is independently copied in `bottle.ts`, `clientSetup.ts`, `allowlist.ts`, and now `importScan.ts`/`shimGenerate.ts`) rather than importing them.

## Deviations from Plan

None - plan executed exactly as written. Both threat-model rows assigned to this plan's files (T-24-06 argv-form spawn + sanitize-before-path-construction, T-24-04 export-set-covers-imports validation) were implemented as specified, with dedicated tests directly asserting each.

## Issues Encountered

None. One design decision required resolving ambiguity not fully spelled out in the plan text: the `<interfaces>` block's containment guidance ("resolve via `getBridgeBottleSettings` + a `getBottleSteamappsDir`-style helper") was interpreted as a containment CHECK on a caller-supplied `gameExePath` (via `getBottleDir` + `resolve()+relative()`) rather than internal path DERIVATION from an installdir, because the plan's own `<behavior>` block specifies the function's input contract as "Given a game .exe path + appId" (the exe path is already resolved by the caller -- 24-08's `installBridgeGame()`, not yet built). This keeps `shimGenerate.ts` a pure placement primitive independent of how 24-08 locates the installed exe, while still enforcing the real security property (an exe path can't escape the bridge bottle).

## Known Stubs

None. `SHIM_EXPORTED_SYMBOLS`'s hardcoded duplication of `FLAT_EXPORTS_SUPERSET` is a documented, reviewed maintenance contract (see Decisions Made), not a placeholder -- it is exercised by real coverage-validation logic against real objdump-derived data, not a stand-in for unbuilt functionality.

## Threat Flags

None. Both threat-model rows assigned to this plan's files are mitigated as specified: T-24-06 (argv-form `spawnAsync` only, numeric-appId/bottle-name guards before any path/argv construction -- test-asserted in both files) and T-24-04 (export-set-covers-imports validation, rejecting an under-covered game with no silent auto-remediation -- test-asserted in shimGenerate.test.ts). No new trust-boundary surface beyond what the plan's own `<threat_model>` already scoped (installed-game-.exe-path -> objdump subprocess; generated-shim-export-set -> game-load).

## User Setup Required

None - no external service configuration required. No package installs occurred (0 new npm dependencies).

## Next Phase Readiness

- R3's automated acceptance criteria are met: `importScan` enumerates the exact per-game import set (Avernum 4 = 2, Hoard = 7, fixture-proven); `shimGenerate`'s `placeShimForGame()` is automatic, idempotent, guarded, and coverage-validated against 24-01's superset `.def` -- exactly the acknowledged-divergence contract from this plan's `must_haves`.
- `placeShimForGame(appId, gameExePath, opts?)` is ready for 24-08's `installBridgeGame()` to call inline as the sole entry point, per this plan's own "no manual copy step" success criterion. 24-08 is expected to call it AFTER the depot-download engine places the game's `.exe`, passing the resolved exe path.
- **Explicitly NOT proven by this plan** (per its own `<success_criteria>`): the end-to-end "launching produces a placed shim, no manual copy" is real-hardware confirmed only in 24-10. This plan's coverage is unit-tested (mocked `objdump`/injected fixture `.dll`) against reconstructed, not captured, objdump fixtures -- the spikes never archived raw objdump text, only their summarized symbol counts and each `steam_api.def`.
- `builtBridgeShimPath` still resolves to a nonexistent file at dev time (24-07's packaging build hasn't run yet) -- `placeShimForGame()` will correctly return `'shim-not-built'` in that state until 24-07 lands, which is the expected, already-tested behavior, not a gap.

---
*Phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy*
*Completed: 2026-07-20*

## Self-Check: PASSED

All 6 claimed files verified present on disk; both claimed commit hashes (`f423dc06`, `0e3c1d2a`) verified present in `git log --oneline --all`.
