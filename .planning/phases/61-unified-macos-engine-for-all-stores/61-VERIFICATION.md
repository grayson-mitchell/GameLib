---
phase: 61-unified-macos-engine-for-all-stores
verified: 2026-11-07T10:00:00Z
status: human_needed
score: 20/20 decisions verified in code (2 warnings need a developer decision)
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 14/20
  gaps_closed:
    - "CR-01 D-05: invalid-bottle no longer classed as broken"
    - "CR-02 D-18: deadline no longer kills; C:\\ form added; onGiveUp cancels the deadline (prior WR-01)"
    - "CR-03 D-16: no wineserver -k on the deadline path"
    - "CR-04 D-01/D-17: Sideload Run installer routes through the per-game bottle"
    - "CR-05 D-08/D-09: engineOverride default injection removed"
    - "UAT G-1 D-04: legacy prefix gets the fresh-bottle confirm"
  gaps_remaining: []
  regressions: []
gaps: []
human_verification:
  - test: "Decide on review WR-01: an inconclusive pre-flight (incl. busy-bottle timeout) now always launches on CrossOver without checking the bottle's engine marker, logged as cx-healthy; this rule lives in shared decideLaunchEngine, so Steam is affected too"
    expected: "Either accept it (the 59 D-09 principle is that inconclusive is not broken) or have it fixed to keep the bottle's current engine / limit it to invalid-bottle, with an honest log label"
    why_human: "Policy trade-off. Not a must-have failure, but it can force a switch back to a possibly expired CrossOver on a bottle whose marker is non-crossover, and it changes Steam behaviour that was not UAT-covered"
  - test: "Decide on review WR-02: the notice-only deadline still calls raiseMainWindow plus a modal over a running (possibly fullscreen) game it cannot detect"
    expected: "Accept, or deliver the launch-deadline-unconfirmed notice without raising the window"
    why_human: "UX judgement. D-18 only requires a deadline notice. Nothing is killed, so the safety goal holds"
  - test: "UAT 13 (deadline notice does not stop a running game) and UAT 14 (Sideload Run installer uses the game's bottle) are pending optional live checks"
    expected: "Game keeps running after 180 s with a notice only; installer runs in the GameLib-sideload bottle"
    why_human: "Live CrossOver needed. Both are covered by unit tests, and the operator may waive them"
---

# Phase 61: Unified macOS engine for all stores - Re-verification Report

**Phase goal:** One per-game Engine control for every Windows game on macOS (all stores), with the Phase 59 engine decision moved out of `steam/engine/` so non-Steam launches get trial-expiry pre-flight, N-days notice, launch timeout, broken-CrossOver detection and a fallback bottle.
**Status:** human_needed
**Re-verification:** Yes, after gap closure plans 61-21..61-25

## Prior gaps, re-checked against the code

| Gap | Decision | Status | Evidence in code |
| --- | --- | --- | --- |
| CR-01 bottle-name regex | D-05 | CLOSED | `demoStatus.ts:93-98` validates with `sanitizeBottleName` plus a length cap. `CX_BOTTLE` is passed in env (line 115-117). A residual `invalid-bottle` returns `broken` with `inconclusive: true` (`engineDecision.ts:309-317`), and `decideLaunchEngine` does not fall back on an inconclusive result (`:487-509`). |
| CR-02 deadline kills unmatched games | D-18 | CLOSED | `onEngineLaunchDeadline` (`launchEngine.ts:465-495`) only logs and shows a notice ("It has not been stopped"). `gameProcessWatch.ts:57-61` adds the `C:\` form from `bottleDir`. `onGiveUp` calls `cancelLaunchDeadline(..., 'monitor-unavailable')` (`:530-534`). |
| CR-03 deadline ignores ledger | D-16 | CLOSED | `grep wineserver` in `launchEngine.ts` hits only comments. There is no kill on the deadline path. |
| CR-04 Sideload Run installer | D-01/D-17 | CLOSED | `SideloadDialog/index.tsx:283-292` calls `runWineCommandForGame({ pendingInstall: true, wait: true })`. `wineToolsFlowRegistration.ts:395-402` dispatches to `runWineCommandForPendingInstall`. |
| CR-05 engine default injection | D-08/D-09 | CLOSED | `game_config.ts:303-309` has a comment only and no `engineOverride` default. The launch passes `readOverride: () => effective.id` (review confirms). |
| UAT G-1 legacy confirm | D-04 | CLOSED | `engineOverrideLogic.ts:54-57` is true for `'plain'` or `'legacy'` with automatic or crossover. |

Targeted regression run: `npx jest src/backend/engine` gives 29 suites and 499 tests passing. No TBD/FIXME/XXX markers in the touched engine files.

## Decision coverage D-01..D-20

All verified in code or by the earlier live UAT (items 2-6, 9-11 passed, unchanged by the gap closure). D-04, D-05, D-08, D-09, D-16, D-17 and D-18 moved from failed or partial to verified in this pass. The sideload Run installer path (D-17) is verified by code and unit tests only (UAT 14 pending). The decision to stop inheriting the global Engine for existing config-less games (D-09 applies to new installs only) is recorded in 61-23 and is not a gap.

## Warnings carried forward (not must-have failures)

- **Review WR-01 (shared `decideLaunchEngine`)**: the inconclusive-means-CrossOver rule skips the marker check, mislabels the log as `cx-healthy`, and also changes Steam. It follows 59 D-09 ("only a real pre-flight failure means broken"), so it is not a D-01..D-20 violation. It is a real behavioural risk for a busy bottle with a non-crossover marker. It needs a developer decision.
- **Review WR-02**: the notice-only deadline raises the main window. Nothing is killed, so D-16/D-18 hold. This is a UX regression for undetectable games.
- **Review WR-03..WR-05**: silent pending-install failure, `GameConfig.get` before `appName` validation, and an orphan bottle on cancel. These are robustness issues on the new path and don't break a decision.
- **Prior unclosed findings** (prev WR-02 and others) are listed in 61-REVIEW.md and are not phase-goal blockers.

## Pre-existing and unrelated failures

Per the orchestrator, 7 of the 8 jest failures reproduce at the pre-gap-closure commit `fefd2f859`. The 8th (`x86CallbackWineHarness`) was inconclusive at baseline, but the gap-closure diff touches no meta or bridge files. The gate battery was green (`pnpm lint` fails only on the pre-existing warning cap, with 0 errors). I did not re-run these.

## Gaps summary

No must-have failures remain. Status is `human_needed` because of the open developer decisions (WR-01, WR-02) and the optional pending live UAT items 13 and 14. If the developer accepts them, the phase can be treated as passed.

---

_Verified: 2026-11-07_
_Verifier: Claude (gsd-verifier)_
