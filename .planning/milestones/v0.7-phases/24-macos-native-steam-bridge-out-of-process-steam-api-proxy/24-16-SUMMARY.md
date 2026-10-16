---
phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy
plan: 16
subsystem: steam-bridge-library-sync
tags: [steam, macos, crossover, bridge, acf, install-state, badge-sync]

# Dependency graph
requires:
  - phase: 24-12
    provides: "'bridge' AcfSource + getBridgeBottleSteamappsRoot() (the install-poll-time bridge root this plan's periodic-sync/reconciliation consult adds)"
provides:
  - "buildBridgeInstalledMap() — bridge-bottle-scoped sibling of buildBottleInstalledMap(), rooted at getBridgeBottleSteamappsRoot()"
  - "refresh() and refreshInstallState() now consult the bridge map (native -> Phase 17 bottle -> bridge precedence) so a bridge-installed game's badge survives the periodic sync and focus reconciliation"
  - "installPlatformForSource('bridge') -> 'Windows' (was falling through to hostInstallPlatform() 'Mac')"
  - "markBridgeGameUninstalled() emits gameStatusUpdate 'done' to clear the frontend Uninstalling pill"
affects: [24-UAT Gates 2-4 retest, any future bridge install-state consumer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-tier ACF install-state precedence (native ?? bottle ?? bridge), each tier gated behind its own readiness check (isMac && isBottleProvisioned() / isMac && isBridgeBottleReady()) so an unprovisioned tier is a pure no-op, never a failing scan"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts

key-decisions:
  - "buildBridgeInstalledMap() is a byte-for-byte structural mirror of buildBottleInstalledMap() (same StateFlags bit-4 check, same T-2-01 corrupt-file skip, same empty-Map-when-dir-absent guard) rather than a generalized/parameterized helper — matches the existing native/bottle sibling-function pattern in this file rather than introducing a new abstraction"
  - "Precedence order native -> bottle -> bridge is enforced via a ternary chain (source) and a `??` chain (installedData), identical shape to the existing native/bottle precedence, so the bridge tier is strictly additive and last — native/bottle behavior is provably unchanged when they match"
  - "gameStatusUpdate 'done' in markBridgeGameUninstalled() is emitted OUTSIDE the `if (existing)` guard (mirroring markBridgeGameInstalled()'s placement) so the pill clears even if the library entry was already absent"

requirements-completed: [R6]

# Metrics
duration: ~25min
completed: 2026-07-21
---

# Phase 24 Plan 16: Bridge-Aware Periodic Sync + Focus Reconciliation + Uninstall Pill Clear Summary

**Closed the D-UAT-24-07 badge-flap defect by teaching the periodic library sync (`refresh()`) and focus-triggered reconciliation (`refreshInstallState()`) to consult the bridge-bottle ACF, and fixed the stale "Uninstalling" pill on bridge uninstall.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-21
- **Tasks:** 2
- **Files modified:** 4 (2 source, 2 test)

## Accomplishments

- Added `buildBridgeInstalledMap()` to `library.ts` — a bridge-bottle-scoped sibling of `buildBottleInstalledMap()`, rooted at `getBridgeBottleSteamappsRoot()` (from 24-12), with identical StateFlags bit-4 detection and T-2-01 corrupt-file discipline.
- `refresh()` (the periodic owned-games sync) and `refreshInstallState()` (the focus/post-launch reconciliation) both now consult the bridge map with precedence native → Phase 17 bottle → bridge, gated behind `isMac && isBridgeBottleReady()`. A bridge-installed game now stays `is_installed:true` across repeated syncs instead of flapping Play→Install→Play and reverting to Install.
- `installPlatformForSource('bridge')` now returns `'Windows'` instead of falling through to `hostInstallPlatform()` (which mislabeled a bridge install as the host `'Mac'`).
- `markBridgeGameUninstalled()` in `games.ts` now emits `sendFrontendMessage('gameStatusUpdate', { appName, runner: 'steam', status: 'done' })`, mirroring `markBridgeGameInstalled()`, so a completed bridge uninstall clears the frontend "Uninstalling" pill instead of leaving it stuck.

## Task Commits

Each task was committed atomically:

1. **Task 1: library.ts — buildBridgeInstalledMap + bridge-aware refresh()/refreshInstallState() + installPlatformForSource('bridge')→'Windows'** - `467bf6ab` (fix)
2. **Task 2: games.ts — markBridgeGameUninstalled emits gameStatusUpdate 'done'** - `5b0b64f6` (fix)

_No TDD-cycle multi-commits — tests were extended alongside the implementation in each task's single commit, consistent with this repo's existing pattern for `type="auto" tdd="true"` gap-closure tasks in this file._

## Files Created/Modified

- `src/backend/storeManagers/steam/library.ts` — `buildBridgeInstalledMap()` added; `refresh()` Step 2/3 and `refreshInstallState()` widened to a 3-tier precedence (native ?? bottle ?? bridge); `installPlatformForSource` now maps `'bridge'` → `'Windows'`; imports `isBridgeBottleReady` from `./bottle`.
- `src/backend/storeManagers/steam/__tests__/library.test.ts` — new `buildBridgeInstalledMap()` describe block (empty-Map guard, StateFlags bit-4 detection, corrupt-file skip); new `refresh() bridge reconciliation (D-UAT-24-07)` describe block (installed + stays-installed-across-second-refresh, gated-off-when-unprovisioned); new nested `refreshInstallState() bridge reconciliation (D-UAT-24-07)` describe block (same two cases); `isBridgeBottleReady` added to the `../bottle` mock factory.
- `src/backend/storeManagers/steam/games.ts` — `markBridgeGameUninstalled()` now emits `gameStatusUpdate: 'done'` outside the `if (existing)` guard.
- `src/backend/storeManagers/steam/__tests__/games.test.ts` — two new tests in the existing "Phase 24 Plan 08 bridge routing" uninstall describe block: gameStatusUpdate emitted alongside pushGameToLibrary(is_installed:false) on a completed uninstall, and gameStatusUpdate still fires when the library entry is absent for that appId.

## Decisions Made

- Mirrored `buildBottleInstalledMap()` structurally rather than generalizing a shared helper — consistent with this file's existing native/bottle sibling-function convention, keeps the diff minimal and auditable against the existing bottle implementation.
- `installPlatformForSource('bridge') === 'Windows'` and the bridge-map badge behavior are covered indirectly through `refresh()`/`refreshInstallState()` assertions (`platform: 'Windows'`) rather than as a standalone unit test of the (unexported) helper — matches the existing test-file convention, where `installPlatformForSource('bottle')` was never unit-tested in isolation either.

## Deviations from Plan

None - plan executed exactly as written. All five `must_haves.truths` and both `key_links` from the plan frontmatter are satisfied by the diffs above.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `pnpm jest src/backend/storeManagers/steam/__tests__/library.test.ts --silent` — 161/161 pass.
- `pnpm jest src/backend/storeManagers/steam/__tests__/games.test.ts --silent` — 166/166 pass.
- `pnpm exec jest --silent` (parallel full suite) — 103/103 suites, 1844/1844 tests pass (no regressions; the pre-existing library.ts leaked-timer `--runInBand` crash noted in 24-UAT.md Gate 0b is unaffected — it does not manifest in parallel-worker mode).
- `pnpm codecheck` (tsc --noEmit) — clean, exit 0.
- This closes the MAJOR D-UAT-24-07 code-level defect. Gates 2-4 in `24-UAT.md` remain PENDING a fresh human-hardware retest (real Apple-Silicon Mac, packaged `.app` rebuilt off this commit) to confirm the badge no longer flaps in a live session — this plan does not itself run that retest.

---
*Phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy*
*Completed: 2026-07-21*

## Self-Check: PASSED

- FOUND: `.planning/phases/24-macos-native-steam-bridge-out-of-process-steam-api-proxy/24-16-SUMMARY.md`
- FOUND: commit `467bf6ab` (Task 1: library.ts)
- FOUND: commit `5b0b64f6` (Task 2: games.ts)
- FOUND: commit `7743328f` (docs: summary)
