---
phase: quick-261101-jbm
plan: 01
subsystem: steam-engine
tags: [crossover, demo-status, preflight, retry]
key-files:
  modified:
    - src/backend/storeManagers/steam/engine/engineDecision.ts
    - src/backend/storeManagers/steam/engine/__tests__/engineDecision.test.ts
    - src/backend/storeManagers/steam/engine/__tests__/fixtures/stub-wine.sh
decisions:
  - "A single --demo-status timeout is inconclusive: stop wineserver, retry once; two timeouts = cx-broken (D-09). Stateless (D-07)."
metrics:
  completed: 2026-11-01
---

# Quick 261101-jbm: Single demo-status timeout must not flip CrossOver to broken

`preflightCrossover` now retries a `--demo-status` timeout once (stopping the wineserver after each timeout); only two consecutive timeouts return `broken`/cx-broken.

## Commits
- d3f83e677: fix(quick-261101-jbm): retry a single --demo-status timeout (code + tests + stub-wine `hang-once` mode)
- 2b62f0f0d: docs(quick-261101-jbm): close todo (moved to todos/completed with Result section)

## Verification
- jest (engineDecision, demoStatus, engineState): 3 suites, 87 tests passed.
- eslint and prettier --check clean on the two .ts files; `grep -c hang-once` on the fixture = 1.
- `pnpm planning-gates`: 12/12 passed.
- `pnpm codecheck`: FAILS on 2 pre-existing errors in `src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts` (BigInt literals, TS2737). Unrelated to this change; no errors in engine/ files. Not fixed (out of scope).

## Deviations
None to the plan's behaviour. Real-probe 'hang' kill expectation updated to 2 and 'hang-once' added as specified.

## Not done
No live bridge launch. A persistent double-timeout on the operator machine still needs root-causing; restart dev first (sidecar is not rebuilt).
