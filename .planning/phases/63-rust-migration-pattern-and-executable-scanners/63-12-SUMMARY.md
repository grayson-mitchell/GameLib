---
phase: 63-rust-migration-pattern-and-executable-scanners
plan: 12
subsystem: scanners
tags: [rust, scanners, live-smoke, uat, gate]
requires: [63-11]
provides:
  - 63-UAT.md scored from archived evidence (7 of 8 pass, item 6 blocked and accepted by the user)
affects: [63-13, 63-14]
key-files:
  modified:
    - .planning/phases/63-rust-migration-pattern-and-executable-scanners/63-UAT.md
decisions:
  - Gate passed. Item 3 was closed by a retest in launch 7; the user chose a temporary local fixes override over editing the repo file.
  - The user accepted item 6 as blocked: no -DXMT copy can exist on Wine-11.21. 63-13 and 63-14 may run.
metrics:
  tasks: 3
  completed: 2026-11-07
---

# Phase 63 Plan 12: Live smoke gate Summary

The operator drove the D-13 live gate in 7 launches: launches 1-6 per the contract, then launch 7 to retest item 3. It was scored from the archived logs. Items 1, 2, 3, 4, 5, 7 and 8 pass with `impl=rust` evidence. Item 6 is blocked and was accepted as blocked by the user. The D-13 live condition is met.

## Outcome by item

| item | status | key evidence |
| --- | --- | --- |
| 1 sidecar freshness | pass | P2 12:00:00 > 11:57:51; launch-1.log:102 scanner line |
| 2 Avernum 6 shim | pass | launch-2.log:110,111,120,122; result line :121; bridgeScan absent (conditional) |
| 3 GameMaker | pass (retest) | launch-7.log:141 gameMakerRunner impl=rust, :142 GameMaker D3D11 runner default line; launch 3 was blocked by the tier-1 CX_GRAPHICS_BACKEND fix (launch-3.log:146, bridgeKnownFixes.ts:154) |
| 4 Grim Dawn DRM | pass | launch-4.log:93-95, :106-107, game-role trace :161-202 |
| 5 Age of Decadence | pass | launch-5.log:90,91; launchBridgeGameBody count 0 |
| 6 dxmtBootUpdate | blocked (user-accepted) | launch-1.log:103 DXMT copy not created, winemac.so lacks metal-view exports |
| 7 wineVersionInstalled | pass | launch-1.log:102 |
| 8 timing | pass (record) | about 4 s from detectLaunchDrmWrapper to next line on Manor Lords, dominated by a probe |

No `rust scan failed` or `containment check failed` in any launch log.

## Gaps and how they closed

- Item 3: a UAT design defect. Mining Mechs has a tier-1 CX_GRAPHICS_BACKEND fix, so the runner detection never ran in launch 3. User decision 2026-11-07: "Retest, fix entry removed (Recommended)". The orchestrator added a temporary local-layer `1603180-steam.json` with empty envVariables, which shadows the bundled file whole-file. The operator relaunched (launch 7, PID 31464) and the evidence appeared at launch-7.log:141-142. The override was then deleted; no repo file was changed.
- Item 6: user decision 2026-11-07, "Accept as blocked (Recommended)". The same Rust op ran live through item 7. Only the dxmtBootUpdate caller is not exercised live; the dxmtBootFetch tests cover it.

## Deviations from Plan

None in execution. Note: build/main/sidecar.js mtime read 12:26:11 at scoring time (rebuilt by the dev flow near launch 6) with no src change since 11:57:51.

## Commits

- 68baffc63 preflight (Task 1)
- db25bc947 scoring of 63-UAT.md and this summary (Task 3)
- 58ebd8ed0 STATE session record
- re-score after the item 3 retest and the item 6 acceptance (this commit)

## Self-Check: PASSED
