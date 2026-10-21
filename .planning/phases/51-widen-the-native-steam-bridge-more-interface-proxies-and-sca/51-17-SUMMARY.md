---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 17
subsystem: steam-bridge
tags: [depot, bridge-routing, prescreen, tdd]

requires:
  - phase: 51-07
    provides: setBridgeSteamApiPrescreen / bridgeVerdict.ts's steamApi field (bridgeVerdict.ts)
  - phase: 51-13
    provides: resolveBridgeRoute's NOTICE_REASONS gate and the steamBridgeRouteNotice dialog wiring (bridgeRoute.ts)
provides:
  - "screenDepotPlanForSteamApi(plan): pure, case-insensitive basename classifier over a built DepotPlan's file list -- 'none' | 'x86' | 'x64' | 'both'"
  - "prescreenBridgeDepots(appId, opts): guarded second buildDepotPlan call (PICS + manifest only, forced os:'windows'), never throws, resolves 'unknown' on any failure"
  - "install() wiring: a pending-scan bridge title with no stored steamApi is screened BEFORE routing; a screened x64 title with no Win64 shim now fails closed to the bottle before any bytes download"
affects: [51-18, future shim-coverage/bridge-routing plans touching games.ts's install()]

actuals:
  tokens: 7063
  tasks: 2
  commits: 4
  plan_head_before: 845ee641dfe1f85d7c30d51591231022175ecf4a
  plan_head_after: 1de07f88455d178d2b57a19521db72ebff010d49

tech-stack:
  added: []
  patterns:
    - "A pure classifier (screenDepotPlanForSteamApi) kept fully separate from its guarded async wrapper (prescreenBridgeDepots), so the classification logic is unit-testable with zero network/CM mocking"
    - "Stateful steamMetadataStore test double (get/set closing over a shared `state` variable) reused from the write-discipline describe's own local precedent, needed here because install() reads the persisted verdict TWICE in the same call (once to route, once after the prescreen writes)"

key-files:
  created:
    - src/backend/storeManagers/steam/__tests__/depot.prescreen.test.ts
  modified:
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts

key-decisions:
  - "prescreenBridgeDepots always forwards os:'windows' to buildDepotPlan regardless of the caller's own opts.os -- the bridge route is Windows-only, so screening any other platform's depot selection would answer the wrong question"
  - "install()'s guard is route.reason==='pending-scan' AND readBridgeVerdict(appId)?.steamApi===undefined (not just the route reason alone) -- resolveBridgeRoute's rule 11 can return 'pending-scan' even for an ALREADY-screened x64 title with a shim present (steamApi set, no scan yet), and re-running the expensive screen on every such install() call would defeat T-51-37's 'runs at most once per title' mitigation"
  - "targetSteamappsDir/installdir passed to prescreenBridgeDepots are throwaway values (getBottleSteamappsDir(bridgeBottleNameFor(appId)) and this.appId) -- buildDepotPlan never uses targetSteamappsDir and only uses installdir as a PICS-display-name fallback on a DepotPlan the prescreen immediately discards, so resolving the real installdir via resolveSteamInstallTarget (the expensive, PICS-adjacent call runNativeDepotDownload makes later) would defeat the point of a 'cheap' screen"

patterns-established:
  - "A second, narrower buildDepotPlan call (PICS + manifest only) as a cheap pre-decision probe, reusing an existing heavier function rather than duplicating its PICS/manifest-fetch plumbing"

requirements-completed: []

coverage:
  - id: D1
    description: "screenDepotPlanForSteamApi classifies a depot plan's file list by case-insensitive steam_api(64)?.dll basename -- none/x86/x64/both, with a .dll.bak file correctly excluded"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/depot.prescreen.test.ts#screenDepotPlanForSteamApi — pure file-list classifier"
        status: pass
    human_judgment: false
  - id: D2
    description: "prescreenBridgeDepots never throws -- resolves 'unknown' on no CM connection, PICS error, or an already-fired abort signal; forwards os:'windows'; never calls the chunk-download path"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/depot.prescreen.test.ts#prescreenBridgeDepots — guarded second plan-build, never throws"
        status: pass
    human_judgment: false
  - id: D3
    description: "install() runs the screen only for a pending-scan bridge title with no stored steamApi, persists the result, and recomputes the route -- a screened x64 title with no Win64 shim fails closed to the bottle before any download; seed/scan-verdict/stored-steamApi titles skip the screen"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/games.test.ts#SteamGame.install() — Phase 24 Plan 08 bridge routing (R4/BLOCKER-1/finding-3) > D-51-06 pre-install prescreen (Plan 17)"
        status: pass
    human_judgment: false

duration: ~18min
completed: 2026-10-21
status: complete
---

# Phase 51 Plan 17: Pre-install Steam-API Depot Prescreen Summary

**Cheap pre-install prescreen (a second, PICS+manifest-only buildDepotPlan call) that classifies a bridge title's steam_api DLL architecture before routing, so a 64-bit-only title with no Win64 shim fails closed to the bottle instead of downloading into a bridge bottle it can never run in.**

## Performance
- **Duration:** ~18min
- **Started:** 2026-10-21T11:46:56Z
- **Completed:** 2026-10-21T12:04:53Z
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments
- Added `screenDepotPlanForSteamApi` and `prescreenBridgeDepots` to `depot.ts` (D-51-06), each covered by TDD RED→GREEN with 11 new unit tests in a dedicated `depot.prescreen.test.ts`
- Wired the screen into `install()` so a pending-scan bridge title is screened exactly once, before routing, with the result persisted via the already-existing `setBridgeSteamApiPrescreen` (built in 51-07) and the route recomputed immediately after
- 9 new `games.test.ts` tests cover every behavior bullet in the plan: x64-no-shim fail-closed, x64-with-shim proceed, `none`/`x86`/`both`/`unknown` all proceed to install-then-scan, and all three skip conditions (seed, stored clean scan, stored steamApi)
- Full `src/backend/storeManagers/steam/` suite (54 suites, 1953 tests) green with zero regressions

## Task Commits
1. **Task 1: Pure depot file-list classifier and guarded prescreen** — RED `8b9d6f771` (test), GREEN `0469f71da` (feat)
2. **Task 2: Run the screen in install() before routing a pending-scan title** — RED `9cfca8168` (test), GREEN `1de07f884` (feat)

## Files Created/Modified
- `src/backend/storeManagers/steam/__tests__/depot.prescreen.test.ts` — new: 11 tests for the pure classifier and the guarded async wrapper
- `src/backend/storeManagers/steam/depot.ts` — added `screenDepotPlanForSteamApi` and `prescreenBridgeDepots`, placed beside `buildDepotPlan`; added `basename` to the existing `path` import
- `src/backend/storeManagers/steam/games.ts` — `install()`: after the first `bridgeRoute()` computation and before the 51-13 notice gate, runs the guarded screen for a pending-scan title with no stored steamApi, persists the result, and recomputes the route; added `prescreenBridgeDepots` to the existing `./depot` import
- `src/backend/storeManagers/steam/__tests__/games.test.ts` — added `prescreenBridgeDepots: jest.fn()` to the `../depot` mock and its import; added a `D-51-06 pre-install prescreen (Plan 17)` describe block with 9 tests

## Decisions Made
See `key-decisions` in frontmatter — the `os:'windows'`-always-forced forwarding, the two-part install() guard (route reason AND un-screened steamApi) needed because rule 11 can also fire for an already-screened title, and the throwaway targetSteamappsDir/installdir choice that keeps the screen genuinely cheap.

## Deviations from Plan

None — plan executed exactly as written. Both tasks followed RED→GREEN exactly as specified (no REFACTOR commit needed in either task; the first implementation pass was clean and needed no cleanup).

**Note on `gsd_run check tdd-red-evidence`:** consistent with this phase's own established practice (documented in `51-02-SUMMARY.md`, itself citing `48-05`/`49-01`), no persisted RED-evidence record was run through the classifier. Jest's default reporter output is not TAP-formatted, and the classifier's `tapFailedTestNames`/`parseNodeTestSummary` primitives only recognize `node --test`'s TAP output — running a genuine Jest "is not a function" RED (confirmed manually: 11/11 and 6/9 failures respectively, both for the correct reason — the implementation did not exist yet, never an unrelated/contaminated assertion) through that classifier would score `zero_tests_discovered`/`INVALID_RED` even though the RED state is textbook. Both RED runs were manually verified against the actual jest output (captured in this session) before any GREEN implementation was written.

## Issues Encountered

None.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness

This was the last plan in Wave 6. Wave 7's 51-18 depends on this plan plus 51-15/51-16, all now complete and green with no regressions across the full `src/backend/storeManagers/steam/` suite (54 suites, 1953 tests).

No blockers or concerns carried forward from this plan.

---
*Phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca*
*Completed: 2026-10-21*

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/__tests__/depot.prescreen.test.ts
- FOUND: .planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-17-SUMMARY.md
- FOUND commit: 8b9d6f771 (test: depot prescreen classifier RED)
- FOUND commit: 0469f71da (feat: depot prescreen classifier GREEN)
- FOUND commit: 9cfca8168 (test: install() prescreen wiring RED)
- FOUND commit: 1de07f884 (feat: install() prescreen wiring GREEN)
