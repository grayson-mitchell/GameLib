---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 30
subsystem: steam-engine
tags: [uat, gap-closure, live-test]
requires: [59-24, 59-25, 59-26, 59-27, 59-28, 59-29]
provides: [re-UAT items 22-28 with operator verdicts, gaps G20-G23]
key-files:
  modified:
    - .planning/phases/59-steam-engine-fallback-when-crossover-is-unavailable/59-UAT.md
requirements-completed: [D-01, D-03, D-05, D-06, D-07, D-09, D-14]
completed: 2026-11-02
---

# Phase 59 Plan 30: Re-UAT of the second gap-closure round Summary

Live operator re-test of gaps A-G: six of seven items pass (22, 23, 24, 25, 27, 28), one issue (26: an interrupted unpack leaves a `.tmp-wine-*` dir that nothing sweeps at boot). The live run also found the real root cause of G17.

## Commits
- 26c673313: Task 1, re-UAT items 22-28 added to 59-UAT.md
- 8e7f931f8: in-session fix by the orchestrator (G17 root cause: GameConfig loaded asynchronously; first write of a session threw on undefined config; now loaded synchronously, setSetting reads the file if unset; regression test gameConfigFirstWrite.test.ts)
- 17ac7eea8: filed todo for the hidden-buttons layout bug
- Task 3 results recorded in 59-UAT.md (see final docs commit)

## Gate battery (Task 1)
- `pnpm codecheck`: exit 0
- `pnpm smoke:sidecar`: exit 0
- `pnpm planning-gates`: exit 0
- `pnpm lint`: exit 1, solely the baseline `meta/gen_vtables.ts:7472` unused `manifest` error (production scope); 0 new findings, none in a phase-59 file; tests scope passed
- `pnpm test:ci` equivalent (jest, 743 suites): the 12 baseline suites from 546af6c1d still fail, none newly passing. Two non-baseline non-passing suites, neither a phase-59 file, deferred:
  - `meta/__tests__/buildLsteamclient.test.ts` ("is unreachable from the shim build and CI"): phase 56/58 area
  - `src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayRunnerClone.realCrossover.test.ts`: passed/printed no failure when re-run alone; probable load flake

## Verdicts
22 pass, 23 pass, 24 pass, 25 pass, 26 issue (G20), 27 pass (G23 filed), 28 pass. Licence file unchanged (304 bytes, Oct 22 19:57); nothing touched /Applications/CrossOver.app; no title routed to bottled Steam. Restore done and verified 22:08.

## New gaps (in 59-UAT.md)
- G17 closed in-session (root cause above)
- G20 minor: sweep `.tmp-*` under the engine root at sidecar boot (bounded synchronous rm)
- G21 minor: Downloads tab shows no stage label during engine download and bottle setup
- G22 minor: offline launch-blocked dialog ~10 s late (demo-status probe timeout)
- G23 medium: Play/Settings hidden at mid window heights under the cx-expired warning (todo filed)

## Deviations from Plan
None to the plan's tasks; G17 was fixed by the orchestrator mid-session (8e7f931f8) rather than by this plan.

## Self-Check: PASSED
