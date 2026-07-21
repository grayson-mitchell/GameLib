---
phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy
plan: 17
subsystem: steam-bridge-library-install-state
tags: [steam, macos, crossover, bridge, install-state, gap-closure]

# Dependency graph
requires:
  - phase: 24-16
    provides: "buildBridgeInstalledMap() + native ?? bottle ?? bridge precedence in refresh()/refreshInstallState() (the precedence this plan makes bridge-authoritative for eligible titles)"
provides:
  - "isBridgeAuthoritativeForInstallState(appIdStr) in library.ts — cycle-free eligibility mirror of games.ts isBridgeEligible() (bridgeAllowlist + mac/arch gate via steamMetadataStore)"
  - "refresh() Step 3 and refreshInstallState() derive install-state from ONLY the bridge map for bridge-eligible titles, ignoring native/Phase-17-bottle maps"
affects: [24-UAT Gates 3-4 retest, any future bridge install-state consumer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Library-level eligibility mirrors a private class method (games.ts's isBridgeEligible/isBottleEligible) by reproducing its composition from the same underlying stores, rather than importing across the existing games.ts<->library.ts cycle — deliberately drops the transient bridgeFailedThisSession leg so a session-scoped recoverable failure never permanently flips persisted install-state"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts

key-decisions:
  - "isBridgeAuthoritativeForInstallState() intentionally excludes games.ts's bridgeFailedThisSession (module-scoped, transient, unexported) — only the DURABLE eligibility signal (allowlist + mac + arch) drives install-state, since install-state persists to steamLibraryStore and must not be corrupted by a single recoverable session failure"
  - "Eligibility is derived from bridgeAllowlist (zod+JSON, no cycle) + the already-imported steamMetadataStore rather than importing games.ts, so the existing library.ts<->games.ts load-order cycle (flagged in 24-UAT Gate 0b) is not deepened"
  - "bridgeAuthoritative is computed once per appId and used to short-circuit BOTH installedData and source selection with a single ternary each, keeping the diff minimal against 24-16's existing native ?? bottle ?? bridge chain (non-eligible titles fall through to the exact same expression, byte-for-byte)"

requirements-completed: [R6]

# Metrics
duration: ~20min
completed: 2026-07-21
---

# Phase 24 Plan 17: Bridge-Authoritative Install-State for Bridge-Eligible Titles Summary

**Closed the core of D-UAT-24-02 by making install-state authoritative to the bridge bottle for bridge-eligible Steam titles, so a native macOS build or a Phase 17 `GameLibSteam` bottle copy can no longer shadow the bridge and dead-end Play.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-21
- **Tasks:** 2
- **Files modified:** 2 (1 source, 1 test)

## Accomplishments

- Added `isBridgeAuthoritativeForInstallState(appIdStr)` to `library.ts` — reproduces games.ts's `isBridgeEligible()` composition (`bridgeAllowlist.has(appId)` AND the `isBottleEligible()` mac/arch gate: `mac_arch==='32'` OR `(platformsCaptured===true AND is_mac_native===false)`) by reading `bridgeAllowlist` + `steamMetadataStore` directly, WITHOUT importing `games.ts` — the existing `library.ts`↔`games.ts` cycle is not deepened.
- `refresh()` Step 3 and `refreshInstallState()` now compute `bridgeAuthoritative = isBridgeAuthoritativeForInstallState(appIdStr)` and select `installedData`/`source` from ONLY `bridgeInstalledData`/`'bridge'` when true — a bridge-eligible title present in the native and/or Phase 17 bottle map but absent from the bridge map is now correctly `is_installed:false`.
- Non-bridge-eligible titles (allowlist miss, mac/arch gate false, or non-macOS) keep the exact `nativeInstalledData ?? bottleInstalledData ?? bridgeInstalledData` chain and source ternary from 24-16, unchanged.
- Deliberately excludes games.ts's module-scoped, transient `bridgeFailedThisSession` set from the eligibility composition — a single recoverable session failure must never permanently flip persisted install-state; only the durable allowlist+mac+arch signal belongs at the library layer.

## Task Commits

Each task was committed atomically:

1. **Task 1: library.ts — isBridgeAuthoritativeForInstallState + bridge-authoritative selection in refresh()/refreshInstallState()** - `d672c9d9` (fix)
2. **Task 2: library.test.ts — regression tests (Tests A/B/C/D)** - `b243b813` (test)

_No TDD-cycle multi-commits — tests were written alongside the implementation across the two commits, consistent with this file's existing `type="auto" tdd="true"` gap-closure pattern (24-16 precedent)._

## Files Created/Modified

- `src/backend/storeManagers/steam/library.ts` — added `import { bridgeAllowlist } from './bridge/allowlist'`; added `isBridgeAuthoritativeForInstallState(appIdStr)` module-level helper (docstring cites D-UAT-24-02, mirrors `isBridgeEligible()`, documents the deliberate `bridgeFailedThisSession` exclusion); `refresh()` Step 3 and `refreshInstallState()` both widened with a `bridgeAuthoritative` ternary gating `installedData`/`source` selection.
- `src/backend/storeManagers/steam/__tests__/library.test.ts` — new `jest.mock('../bridge/allowlist', ...)` (`bridgeAllowlist.has: jest.fn()`), defaulted to `false` in the shared `beforeEach`; new describe `SteamLibraryManager.refresh() bridge-authoritative install-state (D-UAT-24-02)` (Tests A/B/C); new nested describe `bridge-authoritative install-state (D-UAT-24-02)` under `refreshInstallState()` (Test D, two cases: flip + no-flip).

## Decisions Made

- Excluded `bridgeFailedThisSession` from the library-level eligibility notion (see key-decisions above) — this is the one deliberate DIVERGENCE from games.ts's `isBridgeEligible()`, documented in both the plan interfaces and the helper's own docstring so it isn't mistaken for an oversight.
- Reused the existing `getBottleSteamappsDir` jest mock's arg-differentiation pattern (`mockImplementation((bottleName) => bottleName === 'GameLibSteamBridge' ? BRIDGE_ROOT : BOTTLE_ROOT)`) rather than introducing a new mocking helper, so Tests A/B/D could exercise the Phase 17 bottle and bridge roots as genuinely distinct locations within the same test.

## Deviations from Plan

None - plan executed exactly as written. All five `must_haves.truths` and both `key_links` from the plan frontmatter are satisfied by the diffs above.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `pnpm jest src/backend/storeManagers/steam/__tests__/library.test.ts --silent` — 166/166 pass (161 baseline from 24-16 + 5 new: Test A, Test B, Test C, Test D-flip, Test D-no-flip).
- `pnpm codecheck` (tsc --noEmit) — clean, exit 0.
- `pnpm exec jest --silent` (parallel full suite) — 103/103 suites, 1849/1849 tests pass (no regressions vs the 24-16 baseline; notably the Phase 27 `bootstrap.test.ts` circular-import red noted in 24-UAT.md Gate 0b is not present in this run — attributable to concurrent uncommitted fixes in the working tree from a parallel debug session, not this plan).
- `grep -c "from './games'" src/backend/storeManagers/steam/library.ts` — unchanged (only the pre-existing `SteamGame` import; no new games.ts import added).
- This closes the code-level core of D-UAT-24-02. Live re-verification is the human-hardware Gate 3/4 retest in `24-UAT.md`: Avernum 6 / Hoard should now show Install (not Play) on a fresh sync, install through GameLib's bridge path, and launch through the bridge; Avernum 5 (already in the bridge bottle) should stay installed. This plan does not itself run that retest.

---
*Phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy*
*Completed: 2026-07-21*

## Self-Check: PASSED

- FOUND: `.planning/phases/24-macos-native-steam-bridge-out-of-process-steam-api-proxy/24-17-SUMMARY.md`
- FOUND: commit `d672c9d9` (Task 1: library.ts)
- FOUND: commit `b243b813` (Task 2: library.test.ts)
