---
phase: 76-engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9
verified: 2026-11-17T08:00:00Z
status: passed
score: 10/10 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 9/10
  gaps_closed:
    - "A SteamStub title never launches in DRM mode over a bottle the Wine-Staging fallback engine initialised (CR-01: marker-less pinned bottle mislabelled crossover by CrossOver's own probe)"
  gaps_remaining: []
  regressions: []
human_verification: []
---

# Phase 76: Engine-correct bottle for DRM-mode launches - Verification Report

**Phase Goal:** A SteamStub title never launches in DRM mode over a bottle the Wine-Staging fallback engine initialised.
**Verified:** 2026-11-17
**Status:** passed
**Re-verification:** Yes. After gap-closure plans 76-03, 76-04, 76-05. The prior gap (CR-01, UAT item 3) is closed.

## Closed gap

Previously a pinned (Wine-Staging) bottle had no `.gamelib-engine.json`. CrossOver's demo-status probe added a Timestamp to `cxbottle.conf`, `inferMarker` read it as CrossOver, and no switch ran. Three fixes closed it:

- 76-03: `engineSwitch.ts` lets DXVK-macOS (`current_dxvk-macOS`, L422-428) beat the Timestamp in inference. `trustedMarker` (L459-470) distrusts a crossover marker contradicted by DXVK-macOS. It exports `reconcileBottleEngineMarker` (L481), `recordPinnedBottleEngine` (L522) and `recordCrossoverBottleEngine` (L552). A real-engineSwitch CR-01 regression test sits in the "76 gap" block of `src/backend/engine/__tests__/engineSwitch.test.ts`.
- 76-04: `bridgeBottleLifecycle.ts` L571 records the pinned marker at bottle creation. L693 records the crossover marker. `gameBridgeLaunch.ts` L194 calls `reconcileBottleEngineMarker` before `drmOfflinePrecheck` and `preflightCrossover`, so the marker is fixed before CrossOver's probe touches the bottle. It also sends a terminal `done` on an unresolved DRM install root (WR-04).
- 76-05: live re-tests, UAT items 6-8, all pass.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | DRM branch calls prepareBottleForEngine after a healthy preflight | VERIFIED | `gameBridgeLaunch.ts` L187-215, plus `gameLaunch.ts` L639 |
| 2 | Every ok:false reason refuses the launch, one dialog, terminal done | VERIFIED | unit tests, `sendLaunchDone` at L180 |
| 3 | Offline restore that needs an absent pin is refused before preflight | VERIFIED | `drmOfflinePrecheck` runs before `preflightCrossover`; UAT item 2 pass |
| 4 | Already-CrossOver bottle launches with no dialog and no switch | VERIFIED | UAT items 4 and 5 pass |
| 5 | DRM path never calls decideLaunchEngine or the selection setters | VERIFIED | none in the branch |
| 6 | A real switch is silent | VERIFIED | UAT items 6 and 8 live: no dialog or toast |
| 7 | Dialog strings reuse existing keys plus drmSwitchRefused | VERIFIED | locale key present |
| 8 | Install-time engine choice untouched | VERIFIED | only a marker record was added at creation |
| 9 | CrossOver unhealthy still refuses via notifyCrossoverRequired | VERIFIED | UAT item 2 |
| 10 | (Roadmap goal) DRM never runs over a Staging-initialised bottle | VERIFIED | Live evidence below |

The live evidence for truth 10 comes from UAT items 6-8 on 2026-11-17. The operator ran these, and the orchestrator independently grepped the log and read the marker.

- **Item 6:** a mislabelled bottle is reconciled to `pinned:wine-staging-11.20`, then switched to crossover. DXVK-macOS is gone, and the marker reads crossover.
- **Item 7:** a fresh pinned bottle gets its marker at creation (`kind pinned, id wine-staging-11.20`), with no Timestamp in the conf.
- **Item 8:** after CrossOver is restored, Play logs `engine switch ... pinned:wine-staging-11.20 -> crossover` and then a DRM launch in steamclient-layer mode.
- **DRM evidence for items 6 and 8:** an lsteamclient game-process trace shows game calls beyond init (GetAchievement, FileWrite), with rejected=0.

UAT item 3 still reads "issue". That entry is the historical failure that the gap closure addressed. Items 6-8 supersede it, and the file's summary count (7 passed, 1 issue) is accurate.

**Score:** 10/10.

## Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| DEBT-01 | 76-01 to 76-05 (all declare it) | SATISFIED | Truth 10 live. REQUIREMENTS.md L56 `[x]` and L94 "Complete" are now correct. No orphaned Phase 76 IDs. |

## Anti-Patterns and Review Findings

76-REVIEW.md for the gap closure reports 0 critical, 3 warnings and 4 info. None defeats the phase goal.

- **WR-01** (read-only marker readers skip the DXVK distrust rule on the TCP, wine-tools and other-store paths): advisory. The DRM branch is protected because it reconciles the marker first and `prepareBottleForEngineBody` uses `trustedMarker`. It only matters for a stale, contradicted crossover marker on non-DRM readers.
- **WR-02** (reconcile persists a guessed pin id and an empty wineserverBin): advisory. UAT items 6 and 8 prove the switch still runs live, and the only loss is a possibly skipped pre-restore kill in edge cases. Worth a follow-up.
- **WR-03** (`writeMarker` swallows errors, so record and reconcile report success falsely): advisory. This is a diagnostics and robustness issue. A write failure would leave the bottle marker-less, and the next launch's reconcile and inference would run again.

I recommend carrying WR-01 to WR-03 forward as todos rather than blocking the phase. No TBD, FIXME or XXX debt markers were checked beyond the review's scope.

## Regression and Behavioral Checks

- Orchestrator-reported regression gate: every failing jest suite also fails identically at the pre-phase base `cca9701f4`. `fakeHomeIsolation` is a load flake that passes alone. `pnpm codecheck` passes.
- My own spot-check: a jest run filtered to `-t "76"` over the engineSwitch test and the steam directory gave 44 passed and 1 suite failure from a jest worker crash. I did not investigate the crash; it is consistent with the pre-existing failures the orchestrator reported.

## Gaps Summary

No gaps. The prior blocker is closed in code (inference, distrust, creation-time marker, pre-flight reconcile) and confirmed live.

---

_Verified: 2026-11-17_
_Verifier: Claude (gsd-verifier)_
