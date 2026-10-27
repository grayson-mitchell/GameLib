---
phase: quick-261027-nd3
plan: 01
subsystem: steam-bridge
tags: [wine, crossover, redist, dock-icons]
key-files:
  modified:
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/bridge/sharedRedists.ts
    - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/sharedRedists.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts
requirements: [TODO-2026-10-26-redist-dock-icons]
completed: 2026-10-27
---

# Quick 261027-nd3: Bridge shared redists under Wine's null display driver

The shared-redist step now sets `HKCU\Software\Wine\Drivers` Graphics=null, ends the per-game bottle's wineserver session, runs the installers, then restores the exact prior value and ends the session again. This is done lazily, per-game bottle only, with a verified restore in a `finally`.

## Commits
- 51d26a695: `endPerGameBridgeBottleSession`, `killBottleWineServer` now returns boolean with optional timeout, Graphics reg builders and parser
- 2ac9d00e7: null-display window in `run()`, `displayDriver` ledger marker, recovery before the settled fast path, header docs, tests

## Behaviour
- The window opens just before the first real installer (after the HasRunKey query and the unsafe-entry check). It is never opened on the settled, offline, all-done, rejected, backed-off or shared-bottle paths.
- Restore does 2 verified attempts (delete or `reg add` of the prior value, then a read-back query), then always ends the session. The marker is cleared only after both succeed. Otherwise a loud warning is logged and the marker stays.
- A switch failure (add-null failed or the first session end false) restores immediately and the installers continue on the Mac driver.
- The marker is recovered at the top of `run()`, before the settled early return.

## Tests
- `npx jest src/backend/storeManagers/steam`: 73 suites, 2850 tests pass.
- tsc clean. eslint has no errors; the existing `require-await` warnings in bottle.test.ts predate this work. Prettier is clean on the touched paths.

## Deviations
None of substance. The `bridgeBottleNameFor` mock is given its implementation in `beforeEach`, because the jest config resets mock implementations.

## Notes for the live gate
- games.ts is unchanged.
- The working tree also holds uncommitted changes from the concurrent quick task n77 (knownFixes.ts, launcher.ts, games.ts, ...). They are not part of this task.
- The cost of the two `wineserver -k` runs plus the reg calls is not measured yet. Record it at the live gate.
