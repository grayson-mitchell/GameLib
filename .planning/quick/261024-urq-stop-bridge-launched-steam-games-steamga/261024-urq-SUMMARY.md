---
phase: quick-261024-urq
plan: 01
status: complete
commits:
  - 7ceeb0cb7 feat: guarded per-game bridge bottle stop
  - c5f145598 feat: Stop kills the per-game bottle of a bridge-launched game
  - 772ed92e7 chore: close todo
---

# Quick 261024-urq: Stop bridge-launched Steam games

Stop on a bridge-launched game in its own `GameLibSteamBridge-<appId>` bottle now runs a WINEPREFIX-scoped `wineserver -k` (new `stopPerGameBridgeBottle` in bottle.ts, guard chain extracted and shared with `removePerGameBridgeBottle`), then stops the bridge helper and ends the monitor (terminal `done`).

## Changes
- bottle.ts: `guardPerGameBridgeBottleName` (shared guards, log text unchanged), `stopPerGameBridgeBottle`. No new spawn site; reuses `killBottleWineServer`.
- games.ts: `bridgeLaunchBottles` record set in `fireBridgeWineLaunch`, cleared on monitor `onStopped`, wine settlement (no-monitor case), launch failure, and stop; bridge branch in `stop()` before the gvu monitor branch. Legacy shared bottle: helper + monitor teardown, warning, no kill. Download-abort and bottled-Steam branches unchanged.
- Todo moved to completed/ with a Closed section.

## Verification
- jest games.test.ts + bottle.test.ts + fakeHomeIsolation.test.ts: 513 passed.
- `pnpm codecheck`: clean. prettier --check on all four paths: clean. `pnpm planning-gates`: 12/12.
- `lint:src` passes. `lint:tests` fails the 648 ceiling, but this is pre-existing: ESLint warning counts for games.test.ts (93) and bottle.test.ts (10) are identical before and after my changes, so I added none. Not fixed (out of scope).
- Live macOS Stop check on Manor Lords 1363080: PASSED 2026-10-24 22:24 (operator, after restarting `tauri dev` so the sidecar was rebuilt). Log: `stopPerGameBridgeBottle: wineserver -k for bottle "GameLibSteamBridge-1363080"`; game exited. A first attempt at 22:19 ran the pre-fix sidecar bundle (built 21:44) and took the old monitor-only branch.

## Deviations
- games.test.ts tests were written after the implementation, so the RED step was not observed for Task 2 (RED was observed for Task 1). New tests: 6 in games.test.ts, 5 in bottle.test.ts, plus not-called assertions on existing stop tests.
- Record is `{ bottle }` objects rather than plain strings, so a late settlement of an earlier launch cannot clear a relaunch's record.
