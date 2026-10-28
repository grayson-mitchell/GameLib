---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 26
subsystem: drm-mode
tags: [live-gate, verdict, winebus, iohid]
requires: [56-25]
provides:
  - "56-25-LIVE-GATE.md scored: 16 items, Run record, Gaps, `Verdict: FAIL — item 3`"
  - "Gap todos closed or annotated; five new todos; winebus todo raised to major with IOHID sample evidence"
affects: [phase-56-verification]
key-files:
  created:
    - .planning/todos/pending/2026-10-29-stale-redist-card-status-after-drm-setup-failure.md
    - .planning/todos/pending/2026-10-29-steam-ui-signed-in-while-dev-vault-has-no-refresh-token.md
    - .planning/todos/pending/2026-10-29-stale-nonavailablegames-entry-hides-owned-steam-game.md
    - .planning/todos/pending/2026-10-29-library-cover-art-black-after-recently-played-reorder.md
    - .planning/todos/pending/2026-10-29-drm-stage-session-has-no-wine-log.md
  modified:
    - .planning/phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-25-LIVE-GATE.md
    - .planning/todos/pending/2026-10-29-drm-stage-session-can-hit-winebus-gamecontroller-abort-spin.md
    - .planning/todos/completed/ (Gap 7, 9, 2, 10 annotated; Gap 3 and Gap 11 moved in)
decisions:
  - "Verdict FAIL at item 3: Grim Dawn launch 1 hung at bottle-stage (winebus/IOHID spin on a fresh bottle); every later launch is evidence-only (post-FAIL)"
  - "Launch 1b was a documented retry (the contract has no retry rule); a pass does not change the verdict"
  - "Gap 11 todo moved to completed: routing proven by pre-stage lines; menu outcome stays with the winebus todo"
  - "Winebus todo severity raised medium to major: it blocks every first DRM launch on a fresh bottle (2 of 2)"
metrics:
  duration: "about 2 h 20 min of live operator-driven run"
  completed: 2026-10-29
requirements: [D-15, D-16, D-17, D-18, D-21]
---

# Phase 56 Plan 26: Re-run live gate Summary

The re-run gate FAILS at item 3: Grim Dawn's first Play after the reinstall hung at the bottle-stage `reg add` on a fresh bottle (a macOS IOKit HID spin in `winedevice.exe`), so the done-when is not met live on launch 1, although Grim Dawn, Raft and the repeat-launch checks all passed on later evidence-only launches.

## Verdict

`Verdict: FAIL — item 3` (written into `56-25-LIVE-GATE.md`). The pass rule needs items 1-7, G3 and G9; item 3 (and 4, 5, 6) failed on launch 1 (anchor delta 0, `reason=drm-bottle-stage`). The header's winebus carve-out covers G9 only and does not rescue launch 1.

## Per-item scores

| Item | Result | Note |
| --- | --- | --- |
| 1 component fetched | pass | six names, pinned sha, unsigned; fetch via `downloaded and verified` (literal `component=download` could not print) |
| 2 reinstall | pass | `StateFlags 4`; first Install refused (no refresh token), passed after a GameLib QR re-login |
| 3 anchor, zero notices | issue | launch 1: delta 0, drm-bottle-stage notice |
| 4 menu | issue | launch 1 no menu; 1b, 2, 3 reached the menu (evidence-only) |
| 5 attach | issue | launch 1 none; 1b `create-interface` role=game |
| 6 census | issue | launch 1 no row; 1b verified `game call ISteamUser_SteamUser017_GetSteamID` |
| 7 no InstallPath | pass | 7a 0, CommonRedist 5, 7b unscored (no sink) |
| 8 Raft | pass | launch 4 menu, verified, no `gamelib_bridge.cfg` |
| 9 Ranch | issue | launch 7 failed at bottle-stage |
| 10 networking lead | pass | 0 hits in all 22 captures |
| 11 HKLM diagnostic | skipped | armed, not run |
| G2 | pass | zero route-notice lines |
| G3 (blocking) | pass | Play enabled, no restart, backend reached |
| G9 (blocking) | pass | GD 2, 3 and Raft 5, 6: one anchor, zero bottle-stage |
| G10 | pass | `display=confirmed` 46 ms and 44 ms |
| G11 | issue | routed to DRM mode (pre-stage lines); anchor absent; failed at bottle-stage |

## Key findings

- Stage hang tally: first stage on a fresh bottle hung 2 of 2 (Grim Dawn launch 1, Ranch launch 7); repeat launches 0 of 4. A 3 s sample of the spinning `winedevice` in the Ranch hang shows the main thread in `-[IOHIDDeviceClass valueAvailableCallback:]` (20 of 20 samples).
- No wine log covers the stage session, so stage hangs leave no trace.
- Stale "installing redistributables" card status after the launch-1 failure survived webview reload, navigation and a library Refresh, and cleared only on a dev restart; not seen after the Ranch failure (intermittent).

## Deviations from Plan

- [Rule 3 - Blocking] PC11 flagged the old `GameLibGate52GD` bottle's `appmanifest_219990.acf`; with operator confirmation only that manifest was moved to the session dir (original path recorded). Recorded in the Run record.
- Launch 1b retry and the dev restart: operator-directed deviations, recorded; contract has no retry rule.
- The first Install attempt failed on a missing Steam refresh token (an environment precondition the contract did not preflight); the operator re-signed in through GameLib. Recorded as a contract gap.
- Launch 8 (HKLM diagnostic) not run; item 11 `skipped`.
- Sections 1-4 of the contract are unchanged: `git diff ea6a7db70` has no hunk before `## 5. Tests`.
- No code was changed. Raw captures stay in `/tmp/gamelib-gate-20261028T192950Z/` and are not committed.

## Todos

- Annotated in place (completed/): Gap 7, Gap 9, Gap 2, Gap 10.
- Moved to completed/ with `## Closed by 56-26`: Gap 3 (stale redist after install), Gap 11 (Ranch routing; menu outcome stays open under the winebus todo).
- Updated: winebus todo, severity medium to major, plus the IOHID sample and the 2/2 versus 0/4 tally.
- New: stale redist card status after a DRM-setup failure; Steam UI signed in while the vault holds no token; stale `nonAvailableGames` entry for 219990; black cover art after recently-played reorder (minor, any); stage session has no wine log.

## Known Stubs

None.

## Threat Flags

None. Raw logs, SteamIDs and persona names stay out of the repo (T-56-26-01).

## Self-Check: PASSED

Contract has zero `result: pending` and one `Verdict:` line; `pnpm planning-gates` 12/12; `.planning/**` is prettier-ignored (check omitted).
