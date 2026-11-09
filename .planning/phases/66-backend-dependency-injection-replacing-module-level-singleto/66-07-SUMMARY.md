---
phase: 66-backend-dependency-injection-replacing-module-level-singleto
plan: 07
subsystem: testing
tags: [jest, sidecar, bootFresh, di, flows-tests]
requires:
  - phase: 66-04
    provides: bootFresh() harness helper
  - phase: 66-06
    provides: reuseRegistry option and per-file freshRegistry()/boot() pattern
provides:
  - "installFlows, steamAuthFlows, settingsFlows, steamFlows on one fresh boot per case"
  - "storeEmbedFlows, humbleLoginFlows, runnerAuthFlows confirmed free of any sidecar boot"
affects: [66-08]
key-files:
  modified:
    - src/backend/sidecar/__tests__/installFlows.test.ts
    - src/backend/sidecar/__tests__/steamAuthFlows.test.ts
    - src/backend/sidecar/__tests__/settingsFlows.test.ts
    - src/backend/sidecar/__tests__/steamFlows.test.ts
    - src/backend/sidecar/__tests__/storeEmbedFlows.test.ts
    - src/backend/sidecar/__tests__/humbleLoginFlows.test.ts
    - src/backend/sidecar/__tests__/runnerAuthFlows.test.ts
key-decisions:
  - "Same per-file freshRegistry() + boot() = bootFresh({ reuseRegistry: true }) pattern as 66-06; module handles become file-level lets rebound each case"
  - "The three lightweight suites (storeEmbed, humbleLogin, runnerAuth) never boot the sidecar (startRpcServer / register*Flows only), so only prose was reworded"
requirements-completed: []
duration: 40min
completed: 2026-11-10
---

# Phase 66 Plan 07: flows-3 tests onto bootFresh Summary

Four flows suites that booted through `startSidecar()` now boot once per case in a fresh module registry; the other three never boot the sidecar. No `init(` or `startSidecar(` remains in any of the seven files.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 installFlows, steamAuthFlows, storeEmbedFlows | 98040bc8d | 57 + 37 + storeEmbed passing |
| 2 humbleLogin, runnerAuth, settings, steam | ebcfa0db8 | 21 (settings) + 9 (steam) + humbleLogin + runnerAuth passing |

Combined: 260 passed, 260 before (no coverage lost).

## Approach

installFlows, steamAuthFlows, settingsFlows, steamFlows: top-level imports of mocked or registry modules were replaced with `let` handles rebound by `freshRegistry()` (resetModules, require bootstrap first, then require each handle) in `beforeEach`; `startSidecar()` became `boot()`. settingsFlows uses a root-level `beforeEach` so it runs before each describe's own mock setup. steamAuthFlows runs it only in the first describe (the A-05 describe reads source text and never boots).

storeEmbedFlows, humbleLoginFlows, runnerAuthFlows use `startRpcServer`/`register*Flows()` directly, with no bootstrap boot, so there is no shared or re-entered boot. Left as is, with prose mentioning `init()` reworded so the acceptance grep reports 0.

No order-coupled cases found; no case needed state set up differently.

## jest.mock accounting

Net 0. `sidecar-tests-flows-3.json` unchanged; `node meta/backendDiCeilings.cjs --shard sidecar-tests-flows-3` PASS (jestMock=60).

## Deviations from Plan

None - plan executed as written. Note: the plan lists 7 files but the shard JSON tracks 6 (storeEmbedFlows has no jest.mock); unchanged.

## Remaining init/startSidecar in tests

`grep -rlE "\binit\(|startSidecar\("` still lists files owned by other plans or prose/legit uses: migrationsWiring, gogPresenceBootWire, loggerCallSiteGuard, loggerFlows, devSecretVault, humbleFlows, steamFocusRefreshWire, bootstrapUserReconcile, outputStreamBinding, bootstrapWirings (comments/source-gate strings per 66-04/66-06), plus appShellFlows (66-09, not yet migrated).

## Notes

installFlows logs a "Cannot log after tests are done" console.info from the final case's boot (pre-existing noise from `downloadQueueFlowRegistration`; no failure).

## Deferred Issues

`testContainment.test.ts` T-34.2-83 (unclassified `outboundHttpRegistry.test.ts`) remains failing; pre-existing, in deferred-items.md.

## Known Stubs

None.

## Threat Flags

None. Containment setup untouched; no production file changed; each case boots fresh so no token state crosses cases.

## Self-Check: PASSED

Commits 98040bc8d and ebcfa0db8 exist; all seven suites pass (260); prettier and eslint (warnings only) clean.
