---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 50
subsystem: steam-engine
tags: [G29, crossover, demo-status, preflight]
requires: []
provides:
  - transient-failure retry in preflightCrossover
  - stdout in the demo-status nonzero-exit detail
affects: [engineDecision, demoStatus]
key-files:
  modified:
    - src/backend/storeManagers/steam/engine/demoStatus.ts
    - src/backend/storeManagers/steam/engine/engineDecision.ts
    - src/backend/storeManagers/steam/engine/__tests__/demoStatus.test.ts
    - src/backend/storeManagers/steam/engine/__tests__/engineDecision.test.ts
    - src/backend/storeManagers/steam/engine/__tests__/fixtures/stub-wine.sh
    - .planning/phases/59-steam-engine-fallback-when-crossover-is-unavailable/59-CONTEXT.md
decisions:
  - "D-09 narrowed: nonzero exit or spawn error is broken only on two consecutive probes in one pre-flight"
metrics:
  completed: 2026-11-03
  tasks: 2
---

# Phase 59 Plan 50: Transient demo-status retry (G29) Summary

`preflightCrossover` now retries once on a timeout, nonzero exit or spawn error (two probes in total), and the probe's nonzero-exit detail carries collapsed, capped stdout.

## Changes

- demoStatus.ts: nonzero-exit detail is `code=N stderr=<200> stdout=<400>`, whitespace collapsed to one line; log extra cap raised to 700.
- engineDecision.ts: `PROBE_TIMEOUT_ATTEMPTS` became `PROBE_ATTEMPTS` (2) with a unified transient loop. Timeouts behave as before. A nonzero exit or spawn error stops the wineserver only when a retry follows and no no-kill reason applies, then waits `retrySettleMs` (default 2000 ms, unref'd timer) and reprobes. Second failure returns broken with `... on 2 consecutive attempts`.
- Tests: two G29 probe tests, six G29 engineDecision tests (including decideLaunchEngine staying on cx-healthy); stub-wine gained `cxfatal` and `bigout` modes; the real-probe `fail` row now expects one kill.

## D-09 amendment

Added to 59-CONTEXT.md under D-09:

> Amended 2026-11-03 (59-50, G29): a --demo-status nonzero exit or spawn error counts as broken only when two consecutive probes in one pre-flight fail (one retry, after stopping the bottle's wineserver when no game is running); mirrors quick-261101-jbm's timeout corroboration; still per launch (D-07).

## Deviations from Plan

None in scope. The existing `maps stub mode fail` test expectation (0 kills) was updated to 1 as a direct consequence of the new retry. Whether the stock `wineserver -k` reaches the phase-60 overlay clone's server is unverified live (re-UAT 6).

## Commits

- 26c2118ce: probe stdout in nonzero-exit detail
- 710b852e1: retry in preflightCrossover, D-09 amendment

## Self-Check: PASSED
