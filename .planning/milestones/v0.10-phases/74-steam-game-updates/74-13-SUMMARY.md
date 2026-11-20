---
phase: 74-steam-game-updates
plan: 13
subsystem: steam
tags: [steam, update, uat, live-gate]
requires: [74-01, 74-02, 74-03, 74-04, 74-05, 74-06, 74-07, 74-08, 74-09, 74-10, 74-11, 74-12]
provides:
  - 74-UAT.md with live-gate results (15 items, 7 gaps)
key-files:
  created:
    - .planning/phases/74-steam-game-updates/74-UAT.md
  modified: []
requirements-completed: []
completed: 2026-11-13
---

# Phase 74 Plan 13: Live gate for Steam game updates Summary

The live gate was authored, run with the operator on real hardware on 2026-11-13, and did NOT pass: 11 items pass, 2 are issues (items 7 and 12), 2 are skipped. The plan's approval condition (items 1-8 and 10-14 pass) is not met, so phase 74 awaits gap closure.

## Task results

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Author the live-gate UAT and run pre-flight | 4f22dd031 |
| 2 | Operator live gate | 5290f89ca (results recorded in 74-UAT.md) |

## Pre-flight (Task 1)

cargo tests (gamelib-scan, gamelib-scan-cli, gamelib-depot, gamelib-depot-cli, gamelib-shell bin) exit 0; clippy ratchet PASS; `pnpm build:sidecar` exit 0 with sidecar.js newer than the newest backend change; check:ipc-contract, find-deadcode, steam-line-ceiling, smoke:sidecar exit 0; planning-gates 12/12.

## Fixes made by the orchestrator before the gate

- ab02bd074 chore(74): clear phase-74 knip findings (un-export RustDeltaMode, baseline Misc.getSteamUpdateInfo)
- 823d538e3 fix(74): keep the Steam auth-session policy gates green for bridge updates (Rule I via installSharedRedistsWithLogon, Rule E allow-list for updateEstimate.ts, keyring deferral test mock)
- b9a54f3bf fix(74): record the update-info channel and update-prompt store in the censuses

## Outcome

Pass 11, issue 2 (items 7, 12), skipped 2 (item 9 optional; item 15 deferred to `.planning/todos/pending/2026-11-13-verify-steam-nav-update-handoff-on-windows.md`). Per-item evidence is in 74-UAT.md; results were not altered by this summary.

## Gaps (from 74-UAT.md)

| # | Severity | UAT item | Gap |
| - | -------- | -------- | --- |
| 1 | MAJOR | 7 | Play on a stale bridge game (Hell Clock 1782460) stacks two prompts. The inherited Heroic prompt (frontend/helpers/library.ts:177, gamepage:box.update) fires first; then the backend gateBridgeLaunchOnUpdate calls showMessageBox with THREE buttons, but src-tauri/src/dialogs.rs:151 renders custom buttons only for exactly 2, so it falls back to an OK-only box. OK resolves as response 0 = Update now, queuing the update and aborting the launch over the operator's Play anyway. Play anyway and Don't ask again are unreachable. |
| 2 | minor | 12 | After Steam finishes a registered update (InstallApp ON, ADOM 333300) the badge stays and Updating state hangs. Steam finished in 3 s, before the first poll tick and with fromBuild already the new build, so the poll ran to its 40-tick timeout; the frontend update list and updateStates cache are not refreshed on registered-update completion. |
| 3 | minor | 5 | Pre-click size estimate is about 7x high (Manor Lords: up to 7.0 GB estimated, 0.96 GB downloaded; Mining Mechs about 3x). It counts all changed chunk bytes and does not credit chunks reusable from local files. |
| 4 | minor | 6 | Resuming a paused bridge update restarts from 0% and re-downloads the whole delta (70 MB then 101 MB); delta build-beside temps are discarded on the fresh run. |
| 5 | minor | 5, 6 | Downloads hero shows "0%" with no "Planning update..." text; the steam-update-planning status is not reaching heroPhase or progress overrides it. |
| 6 | cosmetic | 1 | No obvious Update control; the trigger is inherited clickable status text and "Show update size" lives on the Info tab. |
| 7 | cosmetic | 6 | Pre-launch prompt for a part-downloaded update still says to install; could offer to finish it. |

## Deviations from Plan

None to the plan's tasks. The pre-gate fixes above were made by the orchestrator, not within this plan. No code was changed in this continuation.

## Recommendation

Close the gaps with `/gsd-plan-phase 74 --gaps`, prioritising gap 1 (the stacked prompts and the 3-button showMessageBox fallback in dialogs.rs, plus de-duplicating the Heroic prompt), then re-run items 7 and 12 live.

## Known Stubs

None.

## Self-Check

PASSED: 74-UAT.md exists; commits 4f22dd031, 5290f89ca, ab02bd074, 823d538e3, b9a54f3bf exist.
