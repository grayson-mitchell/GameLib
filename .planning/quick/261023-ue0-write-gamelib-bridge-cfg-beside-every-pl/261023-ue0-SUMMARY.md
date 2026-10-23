---
quick_id: 261023-ue0
status: complete
date: 2026-10-23
commits:
  - 4fb664973
  - ae050a4db
---

# Quick 261023-ue0: gamelib_bridge.cfg beside every placed shim

writeBridgeConfig now writes the cfg into the exe dir plus each distinct shim dir, and placeShimForGame reports every runtime shim path (placed-miss and already-placed). launchBridgeGame passes them on every launch.

## Changes
- bridgeConfig.ts: `shimPaths?`, result `extraPaths?` (only set when a shim dir differs from the exe dir). All shim paths are validated inside the bottle before any write. A write failure stops the loop, cleans its .tmp, and returns an error.
- shimGenerate.ts: runtime branch returns the full `allShimPaths` on both `already-placed` (new `shimPaths` field) and `placed-miss` (previously only copied entries).
- games.ts: derives shimPaths from the shim result, passes it to writeBridgeConfig, and logs the cfg copy count.

## Stale-port answer
No worse than one copy: every copy is rewritten (tmp-then-rename) on every launch, after the helper port is known and before wine starts, and 'already-placed' now reports the shim paths too. A directory that once held a shim may keep an old cfg; only the shim reads it, and the next launch re-places the shim and rewrites it. No sweep added.

## Verification
- jest: shimGenerate, bridgeConfig, games suites: 3 suites passed, 382 tests passed. bridgeConfig alone 13/13.
- `npx tsc --noEmit -p .` clean. Scoped prettier --check clean on all six files.
- `graphify update .` ran fine.

## Deviations
None.

## PENDING (live check)
Orchestrator rebuilds with `pnpm tauri:dev:packaged`; operator relaunches Vampire's Fall: Origins (1167950). Expect `HELLO shim attached appid=1167950` in gamelib.log and no `SteamAPI_Init() failed` in Player.log.
