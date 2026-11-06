---
phase: 63-rust-migration-pattern-and-executable-scanners
plan: 12
subsystem: scanners
tags: [rust, scanners, live-smoke, uat, gate]
requires: [63-11]
provides:
  - 63-UAT.md scored from archived evidence (6 of 8 pass, 2 blocked)
affects: [63-13, 63-14]
key-files:
  modified:
    - .planning/phases/63-rust-migration-pattern-and-executable-scanners/63-UAT.md
decisions:
  - Gate NOT fully passed; 63-13 and 63-14 must not run until items 3 and 6 are closed or the user accepts them.
metrics:
  tasks: 3
  completed: 2026-11-07
---

# Phase 63 Plan 12: Live smoke gate Summary

The D-13 live gate was driven by the operator (6 launches) and scored from archived logs: items 1, 2, 4, 5, 7, 8 pass with `impl=rust` evidence; items 3 and 6 are blocked. The D-13 live condition is NOT fully met.

## Outcome by item

| item | status | key evidence |
| --- | --- | --- |
| 1 sidecar freshness | pass | P2 12:00:00 > 11:57:51; launch-1.log:102 scanner line |
| 2 Avernum 6 shim | pass | launch-2.log:110,111,120,122; result line :121; bridgeScan absent (conditional) |
| 3 GameMaker | blocked | no gameMakerRunner line; launch-3.log:146 tier-1 CX_GRAPHICS_BACKEND=dxvk; bridgeKnownFixes.ts:154 short-circuit |
| 4 Grim Dawn DRM | pass | launch-4.log:93-95, :106-107, game-role trace :161-202 |
| 5 Age of Decadence | pass | launch-5.log:90,91; launchBridgeGameBody count 0 |
| 6 dxmtBootUpdate | blocked | launch-1.log:103 DXMT copy not created, winemac.so lacks metal-view exports |
| 7 wineVersionInstalled | pass | launch-1.log:102 |
| 8 timing | pass (record) | about 4 s from detectLaunchDrmWrapper to next line on Manor Lords, dominated by a probe |

No `rust scan failed` or `containment check failed` in any launch log.

## Gaps and closing options

- Item 3: UAT design defect (the chosen title has a tier-1 CX_GRAPHICS_BACKEND fix, so the runner detection never executes). Close by re-driving on a GameMaker title with no such fix, or temporarily running Mining Mechs with the tier-1 entry unset. Not a Rust regression.
- Item 6: needs a Wine-Staging-macOS build whose winemac.so has the macdrv metal-view exports so a -DXMT copy is created, then a relaunch (launch 7).

## Deviations from Plan

None in execution. Note: build/main/sidecar.js mtime read 12:26:11 at scoring time (rebuilt by the dev flow near launch 6) with no src change since 11:57:51.

## Commits

- 68baffc63 preflight (Task 1)
- scoring commit for 63-UAT.md and this summary (Task 3)

## Self-Check: PASSED
