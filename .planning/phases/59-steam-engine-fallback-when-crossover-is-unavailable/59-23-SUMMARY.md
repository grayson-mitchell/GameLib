---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 23
subsystem: steam-engine-re-uat
tags: [gap-closure, re-uat, G1, G2, G6, G9, G10, G12, CR-02, CR-03, WR-04, WR-05, WR-11]
requires: [59-14, 59-15, 59-16, 59-17, 59-18, 59-19, 59-20, 59-21, 59-22]
provides:
  - 59-UAT.md items 13-21 with operator verdicts and gaps G13-G19
key-files:
  modified:
    - .planning/phases/59-steam-engine-fallback-when-crossover-is-unavailable/59-UAT.md
    - src/frontend/screens/Library/components/InstallModal/__tests__/steamEligibilityWiring.test.ts
decisions:
  - The 34.15 guard C2 now expects 3 fa-spin in MainButton.tsx because 59-22 added the "Installing…" spinner.
metrics:
  completed: 2026-11-02
---

# Phase 59 Plan 23: Operator re-UAT of the gap closure Summary

Re-UAT of plans 59-14..59-22 on real hardware: 6 pass, 1 skipped, 1 pass on the progress half only, 1 issue (item 18), plus new gaps G13-G19 found along the way.

## Gate battery (before the live session)

- `pnpm codecheck` exit 0; `pnpm smoke:sidecar` exit 0; `pnpm planning-gates` exit 0.
- `pnpm lint` exit 1: the single error is the known `meta/gen_vtables.ts:7472` unused `manifest` (pre-existing, not a phase-59 file); 0 other errors.
- `pnpm test:ci`: 731 suites. One NEW failure, `steamEligibilityWiring.test.ts` C2 (MainButton `fa-spin` 3 vs 2), caused by the 59-22 "Installing…" spinner. Fixed in 0d5113e8e by updating the guard to 3; suite passes 46/46.
- Remaining non-passing suites, measured by the orchestrator at 546af6c1d in a worktree: steamFlows, skeletonFlows, lintTranslations, genI18nGateScope, appShellLayout, steamInstallOptionsEntry, cargoFeatures, findDeadcode and getDefaultLegendarySavePathRefresh also fail at base; runnerClone and windows are "focused" at base; i18nCatalogChurnGuard passes at base and fails now only because of the operator's uncommitted `translation.json` edit. None is a phase-59 file, none is new.

## Re-UAT results

| Item | Re-tests | Verdict |
|---|---|---|
| 13 | G2 | skipped: unreachable via UI (signed out hides the Steam library); refusal path covered by unit tests only |
| 14 | G1, CR-02, D-05 | pass for progress (Dinkum); redist half NOT exercised (Dinkum has no shared redists) |
| 15 | G6, D-06, IN-05 | pass |
| 16 | G10 | pass (notes G18, G19) |
| 17 | G9 | pass (needs CrossOver present) |
| 18 | G12, WR-05 | **issue**: stored value shows, but saving Automatic/CrossOver never persists (G17) |
| 19 | WR-04 | pass |
| 20 | CR-03 | pass (minor G19) |
| 21 | WR-11, CR-01 | pass |

New gaps in 59-UAT.md: G13 cancel during engine/bottle setup does not stop the install (major), G14 only "Resume" afterwards (medium), G15 bottle survives a depot-stream cancel (minor, intent to decide), G16 reinstall after a cancelled bridge install routes to bottled Steam and fails (major; `bridgeFailedThisSession` is a hypothesis), G17 override save bug (major), G18 no warning for a forced CrossOver override on an expired bottle (minor), G19 wineserver -k against an absent pinned engine and non-blocking library-folder errors (minor). A Batman quit at 17:22:07 that did not exit the app is recorded as unconfirmed, not a gap. Native-Steam downloads missing from Downloads and the black button spinner are already filed as todos.

## For verify-work

- Item 13 needs a decision on whether a live check is required.
- Item 14 redist-on-engine (CR-02) has no live evidence; a title with a shared redist is needed.
- Item 18 is an open issue (G17); G13 and G16 are major and unrelated to the closed gaps.

## Deviations

**[Rule 1 - Bug] steamEligibilityWiring C2 spinner count** — found during the gate battery; fixed in 0d5113e8e.

## Restore

Done and verified by the orchestrator: pinned engine present, 38400 backdate undone, overrides reset to automatic, licence unchanged (Oct 22 19:57, 304 bytes), no CrossOver.app changes, bottle list equals the pre-test snapshot plus GameLibSteamBridge-1062520.

## Commits

- 0d5113e8e test(59-23): MainButton fa-spin count is 3
- 0265fe1b8 docs(59-23): re-UAT items 13-21

## Self-Check: PASSED
