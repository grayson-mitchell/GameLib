---
phase: 65-steam-store-manager-decomposition-continued
plan: 07
subsystem: backend/storeManagers/steam
tags: [decomposition, bottle-split, log-secret-gate]
requires: ["65-06"]
provides:
  - "steam/bottledSteam.ts (raise loops, dispatchToBottledSteam, tellBottledSteamToLaunch/Uninstall, __stopBottledRaiseLoops)"
  - "steam/provisionBottle.ts (ProvisionBottleResult, killBottleWineServer, provisionBottle)"
affects: []
key-files:
  created:
    - src/backend/storeManagers/steam/bottledSteam.ts
    - src/backend/storeManagers/steam/provisionBottle.ts
    - src/backend/storeManagers/steam/__tests__/bottledSteam.test.ts
    - src/backend/storeManagers/steam/__tests__/provisionBottle.test.ts
  modified:
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/gameLaunch.ts
    - src/backend/sidecar/steamAuthFlowRegistration.ts
    - src/backend/sidecar/__tests__/steamAuthFlows.test.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts
    - src/backend/storeManagers/steam/__tests__/removeCopies.test.ts
    - src/backend/storeManagers/steam/__tests__/steamStartupKeyringDeferral.test.ts
    - meta/__tests__/logSecretGate.test.ts
    - meta/steamLineCeilingBaseline.json
key-decisions:
  - "Flat siblings in steam/, not a bottle/ directory (plan's recorded reason: bottle.ts keeps the highest-fan-out names)"
metrics:
  completed: 2026-11-08
---

# Phase 65 Plan 07: bottle.ts split, part 1 Summary

`bottledSteam.ts` and `provisionBottle.ts` extracted from `bottle.ts` as pure moves. Steam suite: 4385 tests (= baseline), 0 runtime-error suites, no failing name outside the baseline. `bottle.ts` ceiling 2275 -> 1883 -> 1469.

## Commits

- 547f21d69 move bottled-Steam raise loops and dispatch to bottledSteam
- 1a7248457 move provisionBottle to provisionBottle.ts

## Module sizes (wc -l)

bottle.ts 1469, bottledSteam.ts 409, provisionBottle.ts 447.

## Decisions and notes

- `bottledRaiseLoopsCancelled`, `activeRaiseTimers`, `__stopBottledRaiseLoops` and `handle.unref?.()` all live in bottledSteam.ts (D-10); `bottle.ts` has zero references.
- `raiseInstallerWindow` exported (task 1). `killBottleWineServer` exported (task 2); it is still called by bridge code left in bottle.ts. `cxbottleIn`, `wineserverIn`, `cxRootFrom` and `CROSSOVER_REQUIRED_MESSAGE` in bottle.ts gained `export` because provisionBottle.ts now uses them.
- Transient import cycles: commit 1 had bottle.ts -> bottledSteam -> bottle (provisionBottle still in bottle.ts); commit 2 removed that edge. bottle.ts <-> provisionBottle.ts remains until the bridge bottle code leaves bottle.ts in 65-08/09 (bottle.ts calls `killBottleWineServer` and uses `ProvisionBottleResult`). Both edges are call-time only, no top-level work. Steam cycle count is not gated by depcruise (boundaries pass at zero).
- Mock factories: games, macArchKnownFixRouting, removeCopies and steamStartupKeyringDeferral each dropped the two `tellBottledSteamTo*` entries from the `../bottle` factory and gained a `jest.mock('../bottledSteam')` factory carrying them. `steamAuthFlows.test.ts` gained an automock for `provisionBottle`. No `jest.requireMock('../bottle')` site named a moved symbol (they only use `__crossoverInstalled`).
- bottle.test.ts: `afterEach(__stopBottledRaiseLoops)` kept in all three files (outer describe `bottle.ts` copied so fullNames are unchanged). The `describe('quick 261024-cjq: CrossOver precondition')` block calls `provisionBottle` and stays in bottle.test.ts with a repointed import. The bottleProcessMonitor mock was removed from bottle.test.ts (bottle.ts no longer reaches it). Other jest.mock preambles copied unpruned (harmless, avoid transitive-load differences).

## logSecretGate

`logSecretGate.test.ts` pinned list gained `provisionBottle.ts` (bottle.ts kept for the bridge exemption); total stays 15. The Meta gate was already red before my first commit (`logSecretGate ratchet ... finds zero violations` and its non-vacuity test are in `65-baseline-adjacent.txt`, from `utils/uninstaller.ts:131`); after my commits the only failures in logSecretGate + steamLineCeiling tests are those same 2. I left the uninstaller finding alone. The pin test passes.

## Deviations from Plan

None beyond the above. The `steamLineCeiling CLI exits 0` Meta test failed once mid-work only because it ran before I lowered the baseline entry; it passes after.

## Pre-existing failures observed, left alone

`pnpm find-deadcode` engine/IPC drift (perGameBottle, preload engine, schemaTypes, stale baseline lines; none from this plan's files), logSecretGate (uninstaller), genI18nGateScope, x86CallbackWineHarness.

## Known Stubs

None.

## Self-Check: PASSED

bottledSteam.ts, provisionBottle.ts and both new test files exist; commits 547f21d69 and 1a7248457 present.
