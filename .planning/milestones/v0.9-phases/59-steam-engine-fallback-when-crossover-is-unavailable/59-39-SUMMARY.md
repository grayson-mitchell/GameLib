---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 39
subsystem: steam-engine
tags: [re-uat, H1, H2, H3, G20, G21, G22, WR-02, WR-03]
requires: [59-31, 59-32, 59-33, 59-34, 59-35, 59-36, 59-37, 59-38]
provides:
  - re-UAT 3 verdicts for items 29-35 in 59-UAT.md
  - gaps G24 (Amazon store embed over the game page) and G25 (offline launch block still slow)
key-files:
  modified:
    - .planning/phases/59-steam-engine-fallback-when-crossover-is-unavailable/59-UAT.md
decisions:
  - "Item 34 recorded as issue, not skipped: the run showed the early refusal never fires live, which is a finding in its own right (G25)."
  - "Item 35 recorded as pass with a deviation: the second cancel landed in the depot stream; the cancel-during-bottle-creation leg is covered by item 33 round b."
metrics:
  completed: 2026-11-03
requirements: [H1, H2, H3, G20, G21, G22, WR-02, WR-03]
---

# Phase 59 Plan 39: re-UAT 3 for gap closure 59-31..59-38 Summary

Six of the seven round-3 items pass live; the offline launch block (item 34) does not, and is filed as G25.

## Gate battery (Task 1)

Unit, type and lint gates over the round-3 code were green, apart from failures that predate round 3 and are not caused by it: steamFlows, skeletonFlows, cargoFeatures, getDefaultLegendarySavePathRefresh, appShellLayout, steamInstallOptionsEntry, lintTranslations, buildLsteamclient, findDeadcode and genI18nGateScope. `i18nCatalogChurnGuard` fails only on the operator's uncommitted `translation.json`. The containment tripwire caught the new `engineTempSweepBootWire.test.ts` after wave 1; it was declared in `0e461f1ed`.

## Verdicts

| Item | Finding re-tested | Result |
|---|---|---|
| 29 | H1 (DirectX redist exit 247) | pass: Wine Mono support MSI then DXSETUP, ledger settled on 576770 |
| 30 | H2 | pass |
| 31 | H3 | pass |
| 32 | G20 (stale engine temp dir) | pass: `.tmp-wine-*` swept in the first second of the next boot; idle quit exits cleanly |
| 33 | G21 (Downloads stage labels) | pass: engine download, verify, unpack, "Creating the game's bottle", depot; round b straight to bottle creation, cancel removes the bottle |
| 34 | G22 (offline block within 2 s) | issue: about 12 s under no-crossover.sb with no early refusal; with CrossOver visible the game restored to CrossOver and launched (correct, but the item's expectation assumed otherwise). See G25 |
| 35 | WR-02, WR-03 (cancel after a cancelled reinstall) | pass: reinstall 2 s after the first cancel started a fresh run; second cancel left no depot activity and no abort-controller error |

## New gaps

- **G24** (observation, outside round 3): the Amazon store embed stays drawn over the Library game page.
- **G25** (minor): `isOnline()` read online in both offline runs; `resolveBridgeLaunchExe` waits about 9 s on a launch-target CM logon before engine selection; with CrossOver unavailable the refusal is skipped whenever the marker's DXVK copy exists.

## Restore

Done 2026-11-03: engine back in `steam-engines`, network on, Batman bottle deleted, 1284190 marker back to `crossover`, licence unchanged (304 bytes, Oct 22 19:57), bottle list equals the session-start snapshot minus GameLibSteamBridge-200260. A spare 856 MB engine copy remains in `tools/steam-engines-aside-59-39` pending the operator's call.

## Deviations from Plan

- Item 34 run 1 was made under no-crossover.sb by mistake; run 2 repeated it with CrossOver visible. Both are recorded.
- Item 33 round b and item 35 needed the Batman bottle deleted by hand between attempts (operator go-ahead for deleting it was given at the start of the session).

## Self-Check: PASSED
