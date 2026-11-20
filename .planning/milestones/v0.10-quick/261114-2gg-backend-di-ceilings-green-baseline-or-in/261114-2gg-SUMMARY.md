---
phase: quick-261114-2gg
plan: 01
subsystem: ci-gates
tags: [backend-di-ceilings, jest-mock-ratchet, lint-workflow, d-16]
requires: []
provides:
  - "node meta/backendDiCeilings.cjs exits 0"
  - "Backend DI ceilings Lint step no longer masked by an earlier red step"
affects: [meta/backendDiCeilings, .github/workflows/lint.yml]
key-files:
  modified:
    - meta/backendDiCeilings/storeManagers.steam.json
    - meta/backendDiCeilings/storeManagers.steam.bridge.json
    - meta/backendDiCeilings/humble.json
    - meta/backendDiCeilings/utils.json
    - meta/backendDiCeilings/src.frontend.json
    - meta/backendDiCeilings/frontend-hooks.json
    - meta/backendDiCeilings/frontend-screens-game.json
    - meta/__tests__/backendDiCeilingsWiring.test.ts
    - .github/workflows/lint.yml
decisions:
  - "Baseline 21 new jest.mock suites + raise games.test.ts 47 -> 48; each named in the commit body"
  - "Un-mask the gate in place in lint.yml rather than copying it next to planning-gates in codecheck.yml"
metrics:
  tasks: 3
  files: 11
status: complete
commits: 3
plan_head_before: 07bf8ae523218c4d9e06cb99997482b7ceb11887
plan_head_after: dc1ace1f284ca85a535194337967988f621a1227
actuals:
  tokens: 12000
  tasks: 3
  commits: 3
---

# Phase quick-261114-2gg Plan 01: backend-di-ceilings green Summary

Gate green by baselining 22 live FAIL lines (21 new jestMock entries, games.test.ts 47 -> 48, each named with its introducing sha) and un-masking the Lint step with `if: ${{ !cancelled() && steps.deps.outcome == 'success' }}`, pinned by the wiring test.

## Results

- `di-gate-before.txt` FAIL count: **22** (21 `new violation`, 1 `grew` on games.test.ts). No other FAIL shape appeared.
- Final `node meta/backendDiCeilings.cjs`: **exit 0** (`PASS childProcess=1 jestMock=2018 (455 files) sanctioned=1`).

## Task 1: remove first (tracer) - nothing removed

Both suites (`autoUpdateAttempts.test.ts`, `checkGameUpdates.test.ts`) were green at HEAD (10 tests). Removing the unasserted `backend/logger` mock made 4 tests fail across the two suites: the real logger is not initialised under jest (`heroicLogWriter` undefined in `src/backend/logger/index.ts`, so `logWarning` throws). The planning-time premise that the real logger is safe to load was wrong for these suites (the 247 mock-free suites presumably do not reach a log call or init it). Both files were restored byte-for-byte with `git show HEAD:<path>`; both fall through to the baseline. No Task 1 commit.

## Commits

| Task | Commit | Message |
| ---- | ------ | ------- |
| 1 | none | no removals kept |
| 2 | `24ce5285e` | chore(quick-261114-2gg): baseline 21 jest.mock suites from phases 74/75 and quick tasks; games.test.ts 47 -> 48 |
| 3 | `e485a9bde` | ci(quick-261114-2gg): run backend-di-ceilings even when an earlier Lint step fails |
| 3 | `dc1ace1f2` | docs(quick-261114-2gg): close backend-di-ceilings todo (todo git mv + follow-up todo) |

Task 2 verification: commit touches only `meta/backendDiCeilings/*.json`; body has 22 `- src/` lines equal to the FAIL count; names `e005430a8`; prettier clean; `diPhaseGates.test.ts -t sanctioned` passes (4); `backendDiCeilings.test.ts` passes (132).

Task 3: the new positive wiring test was seen red before the lint.yml edit, green after (8/8). `Backend DI ceilings` is the only lint.yml step with an `if`. `pnpm planning-gates` 12/12.

## Deviations from Plan

**1. [Rule 1 - Premise wrong] Task 1 removals did not hold.** Found during Task 1. Real logger unusable under jest without init; restored both suites, baselined instead (as the plan's step 3 prescribes). The baseline commit body states this.

**2. Decision (planner-sanctioned):** gate un-masked in place in `lint.yml` instead of wiring it beside planning-gates in `codecheck.yml` (that step is also masked behind `pnpm codecheck`, and a copy would run twice). Recorded in the todo's Resolved section.

## Follow-up todo

Filed: `.planning/todos/pending/2026-11-14-lint-workflow-red-masks-ratchet-steps.md` (`severity: major`, `platform: any`, `ready: code`). Lint on main was still `failure` (`gh run list`, head 6ef7351) and no pending todo mentioned ESLint/max-warnings.

## Pending

Live CI proof is pending the first push: on the next Lint run, `Backend DI ceilings` should show as executed rather than skipped, even if `Lint code.` is red.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

Commits `24ce5285e`, `e485a9bde`, `dc1ace1f2` exist; todo is in `completed/` with a Resolved section; `di-gate-before.txt` present (left unstaged for the orchestrator's docs commit).
