---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 34
subsystem: steam-drm-live-gate
tags: [drm, live-gate, verdict, gap-closure]
requires: [56-33]
provides:
  - scored third live gate, Verdict PASS (56-33-LIVE-GATE.md)
  - Grim Dawn 219990 reinstalled through the bridge and verified in DRM mode on its first Play on a fresh bottle
  - the forced stage timeout -> end session -> retry path proven live (R1)
  - two gap todos closed, one updated, two new todos filed
affects: []
key-files:
  modified:
    - .planning/phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-33-LIVE-GATE.md
    - .planning/todos/pending/2026-10-29-winebus-iohid-wedges-on-powera-switch2-pad.md
  moved-to-completed:
    - .planning/todos/completed/2026-10-29-drm-stage-session-has-no-wine-log.md
    - .planning/todos/completed/2026-10-29-stale-redist-card-status-after-drm-setup-failure.md
  created:
    - .planning/todos/pending/2026-10-29-raft-hangs-on-exit-in-drm-mode.md
    - .planning/todos/pending/2026-10-29-premature-play-state-during-install-before-redist.md
decisions:
  - "Verdict PASS: items 1-7, G3, G9, S1 and R1 pass; launch 1 (the scored Play) is scored on run 1's sub-window, the operator's re-click (run 1b) is evidence-only"
  - "Item 4's procs clause is evidenced by run 1b, not run 1 (caveat recorded in the contract)"
  - "Stale-redist todo closed on the 56-27 unit tests because no DRM-setup failure occurred live (C1 N/A)"
  - "Winebus todo stays pending: one connected-pad launch with no wedge does not test the root cause"
metrics:
  tasks: 4
  completed: 2026-10-29
---

# Phase 56 Plan 34: Run the third live gate Summary

The 56-33 contract was run end to end with the operator and scored Verdict: PASS. Grim Dawn, uninstalled and reinstalled through the bridge, reached its interactive menu in steamclient-layer DRM mode on its first Play on the fresh bottle with only Mac Steam running, and the forced-timeout retry path (R1) passed live.

## Results

| Item | Result |
| ---- | ------ |
| 1 component fetched | pass: six names, sha256 pin, unsigned; `component=download` in the launch-0 prefetch line |
| 2 reinstall, fresh bottle | pass: StateFlags 4, `not yet provisioned` and `created` lines in DELTA(0) |
| 3 anchor, zero notices, stage path | pass on run 1's window: 1 anchor, 0 notices, 1 `registry not staged:` |
| 4 menu, only Mac Steam | pass, caveat: procs snapshot came from the re-click run 1b |
| 5 game attach | pass: role=game create-interface, no helper pid |
| 6 census | pass: `verified`, `game call ISteamUser_SteamUser017_GetSteamID`; 40 call names pinned |
| 7 no InstallPath keys | pass: 7a = 0; 7b no sink (unscored) |
| 8 Raft | pass: verified, menu; exit hang noted |
| 9 Ranch | pass: verified, menu; stage did not run (already staged) |
| 10 networking lead | 0 hits in every capture |
| 11 HKLM diagnostic | skipped (launch 1 passed) |
| G2 | pass: no route notice |
| G3 | pass: pid unchanged, Play enabled, `drm setup` line within seconds |
| G9 | pass: launch 2 exactly one anchor, 0 `reason=drm-bottle-stage` |
| G10 | N/A: no notice fired |
| G11 | pass: `.bind found` and `uses DRM runner` before the anchor |
| S1 | pass: stage wine log written with header and attempt 0 |
| R1 | pass: `ORDER-OK 9 12 13 17 25 34`, 0 notices, attempts 0 and 1 in the stage log; N = 0 recorded, not scored |
| C1 | N/A: no DRM-setup failure occurred |
| W1 | recorded: pad connected at launch 1, no 15000 ms timeout, no retry |

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | Segment A start, uninstall/reinstall, launch 1 (operator) | 69b6f08c7, 93ba64cae, 185343982, 8c029cf87, fe312ee53 |
| 2 | Archive launch 1, score items 1-7, G2, G3, S1 | 8a8b5906a |
| 3 | Launches 2-4, segment B prep, launch 5 (operator) | f88f94e95, e1b9ca26d, 39374cc80, 2f00eedeb, e38de1b85, a7ecb900c |
| 4 | Score the rest, verdict, Gaps, todos | 9ac2e66c8, c518703dd, 795aabc1f |

## Deviations from Plan

None of the product code was touched; all deviations are run-procedure issues, recorded in the contract's Run record and Gaps.

1. **[Process] Operator ran a second dev instance.** After launch 0's first delimiter the segment-A app was quit and another dev app was started outside the `tee`. Caught at the PC7 step; dev was restarted under `tee`, PC6 re-run (pid 86847) and a second launch-0 delimiter written before the reinstall. No scored evidence was affected.
2. **[Process] Launch 1 has two game runs.** The operator quit run 1 at its menu before taking the procs snapshot and re-clicked Play (run 1b) to take it. Per the retry rule run 1b is evidence-only; items 3 and 13 (G3) are scored on run 1's sub-window and item 4's procs clause is labelled as run 1b evidence.
3. **[Process] Launch 2 archive misaligned.** The operator re-ran the helper script four times (duplicate delimiters) and clicked Play before the final baseline, so the script's delta missed the anchor. G9 was scored from a window reconstructed from the full log copy (lines 419-end); the wine log was copied by hand. `procs-launch-2.txt` does not exist and is recorded as missing. The helper script was reworked afterwards (one run per launch number, baseline first, banner last).
4. **[Rule 2 - hygiene] Result-line words.** Initial draft result lines opened with `verified`, `recorded` and `N/A`; changed to the gamelib-conventions status words (`pass`, `skipped`) before the final commit.
5. **PC2 FAIL at authoring** was re-checked as clean and recorded as resolved. STATE.md carried no PC2 blocker to remove.

## Known Stubs

None.

## Gaps / follow-ups

- Raft does not exit after quit in DRM mode (force-quit needed): todo `2026-10-29-raft-hangs-on-exit-in-drm-mode` (medium, macos, live-gate), non-blocking.
- Transient `[play now]` card state before the redist step during install: todo `2026-10-29-premature-play-state-during-install-before-redist` (minor, macos, live-gate), non-blocking.
- C1 and W1 were not exercised live; the stale-redist todo closed on unit-test evidence (jest `drmLaunchSetup.test.ts` 40 passed; `games.test.ts -t "Phase 56"` 53 passed), the winebus todo stays pending.
- Item 7b remains "no sink, unscored".
- The segment-B dev app (pid 7306, forced-timeout env) was left running; the operator can quit it and plug the PowerA pad back in.

## Self-Check: PASSED

Verified: the contract file holds 20 `result:` lines (none pending) and one `Verdict: PASS` line; Sections 1-4 diff empty against `62952f464`; `pnpm planning-gates` 12/12; todos moved to `.planning/todos/completed/` and new todos carry severity/platform/ready; all task commits listed above exist in `git log`.
