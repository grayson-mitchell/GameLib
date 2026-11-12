---
phase: 74-steam-game-updates
plan: 06
subsystem: steam-depot
tags: [steam, depot, delta, rust-wire]
requires: [74-01, 74-03]
provides: [downloadSteamDepotsRust opts.delta, RustDeltaReport/RustDeltaEstimate types, stage status mapping]
affects: [74-10 bridge updater]
key-files:
  modified:
    - src/backend/storeManagers/steam/depotRust/types.ts
    - src/backend/storeManagers/steam/depotRust/jobBuilder.ts
    - src/backend/storeManagers/steam/depotRust/install.ts
    - src/backend/storeManagers/steam/depotRust/progressBridge.ts
    - src/backend/storeManagers/steam/depotRust/errorMap.ts
    - src/backend/storeManagers/steam/depot/planModel.ts
    - src/backend/storeManagers/steam/depot/outcome.ts
metrics:
  tasks: 2
  completed: 2026-11-12
---

# Phase 74 Plan 06: TS delta job wiring Summary

TS can now start a delta job (`opts.delta.oldGidByDepot`), send `fromManifest`/`retiredDepots`, surface stage events as `updating` status text, and read the Rust `DeltaReport` off the returned outcome.

## Tasks
1. Wire types, job builder, stage mapping - a7b1000f1
2. Delta input on downloadSteamDepotsRust - see git log (feat(74-06) second commit)

## Behavior
- Installed depots get `fromManifest` = old GID string (equal GIDs still sent); added depots null; installed depots absent from the new selection become `retiredDepots` (old GID + key via fetchDepotKey under the existing lease; per-depot key failure warns by depot id and drops that retirement).
- Request-code refresher owner map includes retired depots; old GIDs go through the same refresher.
- `stage` events -> gameStatus `updating` with `steam-update-planning` / `steam-update-committing`; progress payload unchanged.
- `outcome.delta` carried on done/cancelled/error (and the abort-race cancelled return).

## Deviations
- [Rule 3] Also edited `depotRust/errorMap.ts` (to thread `delta` through `rustOutcomeToDepotOutcome`), `depot/outcome.ts` (DepotDownloadOutcome type lives there), and `__tests__/rustDepot.test.ts` (JOB literal needed `retiredDepots`). Not in the plan file list.
- Progress-stage test omits the `bytes` assertion (getFileSize mock is reset by repo jest config).

## Verification
Jest depotRust dir 51 pass; whole steam dir 4316 pass; codecheck and steam-line-ceiling pass; prettier clean. `pnpm find-deadcode` not rerun (known 74-04 exports; STEAM_UPDATE_*_CONTEXT consts are consumed in progressBridge/tests).

## Self-Check: PASSED
