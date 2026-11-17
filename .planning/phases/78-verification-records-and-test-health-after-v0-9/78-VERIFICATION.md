---
phase: 78-verification-records-and-test-health-after-v0-9
verified: 2026-11-17T00:00:00Z
status: human_needed
score: 5/5 roadmap truths verified; 1 plan-level must-have (78-05 backend-di-ceilings green) not met, adjudicated as out of goal scope, needs operator acceptance
overrides_applied: 0
human_verification:
  - test: "Accept or reject the 78-05 deviation: pnpm backend-di-ceilings is still red (five frontend jest.mock tests)"
    expected: "Operator confirms it is out of Phase 78's roadmap goal and tracked by .planning/todos/pending/2026-11-17-backend-di-jestmock-ratchet-red-five-frontend-tests.md (or asks for it to be fixed in this phase)"
    why_human: "Plan 78-05 must-have and CONTEXT D-04/D-16/D-20 asked every ratchet green; the roadmap goal does not. Scope call belongs to the operator."
---

# Phase 78 Verification Report

**Goal:** The v0.9 records say what is true, and the suites the audit flagged pass (52/53/58 records current; macArchKnownFixRouting, installFlows, runnerSliceRegistration, testContainment pass).
**Re-verification:** No, initial.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 52-VERIFICATION body reads current (passed) with the 2026-10-24 gaps_found report kept under a Superseded heading | VERIFIED | `52-VERIFICATION.md`: frontmatter `status: passed`, body has "Current state (Phase 78 re-check, 2026-11-17)", and `## Superseded report (2026-10-24)` at line 126. Todo paths in the body point at `completed/`. |
| 2 | 52-UAT and 53-UAT superseded Gaps entries carry `status: superseded` + `superseded_by` | VERIFIED | 52-UAT: 12 `status: superseded` entries. 53-UAT lines 191-199: all overtaken entries superseded with pointers to commits/quicks/completed todos. Raft/Grim Dawn left `failed` with a dated current note (DRM-limited, Phase 56), which matches D-18(c). ELEX and Unclaimed World recorded as lifted; `bridge-allowlist.json` has `"knownBad": []`. |
| 3 | 53-VERIFICATION gets current body on top, old gaps_found body under a dated Superseded heading | VERIFIED | `53-VERIFICATION.md:58` "Superseded report (2026-10-25, third verification)". |
| 4 | 58-VERIFICATION follow_ups reduced to what is really open; fixed items closed with file:line and covering test | VERIFIED | Frontmatter `follow_ups` holds only the 58-33 2(e)/path=unknown entry. The "Follow-up status" section cites `bridge_helper.c` lines and tests for WR-01..05 and IN-01/02, and cites the completed callback-1298 todo. IN-01 fix in `inviteBridge.ts:65` (`socket.on('error')`); `inviteBridge.test.ts` and `helperIntegration.test.ts` pass (77 tests across gamesModuleSurface, inviteBridge and helperIntegration). |
| 5 | The four DEBT-06 suites pass | VERIFIED | I ran `pnpm jest --runTestsByPath` on all four at the current tree: `4 passed, 209 passed`. 78-TEST-HEALTH.md records a clean-worktree proof at `a96dab654`, a full `test:ci` run with all four PASS, an arch-independence check (linux/x64, darwin/x64, linux/arm64, win32/x64 simulated), a CI ubuntu run log, and per-suite attribution (red-at, first-green, cause). Verdict that quick 261105-vfq's "pre-existing" claim was true is stated. |

**Not "full suite green":** 78-TEST-HEALTH.md states "The four pass in the full run; 13 other suites red, see todo" and "does not claim the full suite is clean". The grouped todo `2026-11-16-full-suite-red-outside-debt-06.md` exists in `pending/`. This satisfies D-17.

## Plan-level must-have not met

78-05 truth 5 / D-16a/D-20 expected `pnpm backend-di-ceilings` to pass. It does not: five frontend tests (NoticeStackTwoToast, steamLoginPollLifecycle, GameStatus.bottleWaiting/.redistSpinner/.steamUpdate) are over the jest.mock ratchet.

**Adjudication: not a gap against the phase goal, but a real deviation from the plan. I recommend the operator accept it.**
- These tests pre-date Phase 78. NoticeStackTwoToast came from quick-261116-s6q (2026-11-16). steamLoginPollLifecycle changed in Phase 79 (2026-11-16). The GameStatus.* baselines were touched by 80-28/80-29 and quick-261114-obu (2026-11-14..16). The pending todo `2026-11-16-pre-push-hook-red-gameLaunch-and-jest-mock.md` shows this ratchet was already red on origin/main before Phase 78 executed. Phase 78 did not cause it.
- The roadmap goal and Success Criteria cover the records and the four suites. The ratchet is folded scope (the lint-workflow todo).
- Ceilings were not raised (`meta/lintScoped.cjs` and `meta/backendDiCeilings/*.json` untouched), as D-20 requires. 78-05 declared the deviation, filed a todo, and 78-TEST-HEALTH.md reports it plainly. The todo is tracked in `pending/`.
- Residual effect: `lint.yml` and `.husky/pre-push` are still red on this one step (78-04 un-masked it, so it now shows instead of hiding behind another red). That is a deviation from D-04 as written, not from the goal.

Overrides suggestion if accepted:
```yaml
overrides:
  - must_have: "backend-di-ceilings passes at execution HEAD (78-05 / D-16a, D-20)"
    reason: "Five jest.mock reds pre-date Phase 78 (quick-261116-s6q, Phase 79/80); filed as 2026-11-17 todo; ceilings unchanged"
    accepted_by: "operator"
    accepted_at: "<ISO timestamp>"
```

## Code review findings (78-REVIEW.md, 3 warnings)

None affects the roadmap goal. All are hardening, and none is recorded as fixed.
- WR-01: `gameEngineDialogs.ts` is not in `LIFTED_OWNERS` in `gamesModuleSurface.test.ts`. I confirmed the list lacks it (13 entries, no gameEngineDialogs). The ratchet's coverage is incomplete for the new module but the test passes.
- WR-02: `helperProcess.ts:186` still uses `socket.once('error', ...)`. I confirmed. This is the same defect class as 58 IN-01 in a sibling site. The 58 IN-01 record is accurate for `inviteBridge.ts` but a reader may assume the class is gone. A todo or fix is advisable.
- WR-03: the helperIntegration source pins are weak. 58-VERIFICATION already describes WR-03 as "pin-only ... No automated stalled-reader reproduction exists", so the record is honest.

## Other findings (WARNING, minor)

- `52-VERIFICATION.md` frontmatter line 18 (`gaps_deferred`) still cites `.planning/todos/pending/2026-10-24-steamstub-launch-check-static-re-decision.md`. That todo is now in `completed/`. D-18 asked that stale `pending/` paths be corrected; the body was fixed but this frontmatter reference was missed. The Superseded section (line 289) also says the forwarding todo "stays in pending/", which is historical text under the Superseded heading.
- "TBD" matches in 52-VERIFICATION are about the old "Requirements: TBD" text in planning docs, not code debt markers. Not a blocker.

## Requirements Coverage

| Requirement | Plans | Status | Evidence |
|-------------|-------|--------|----------|
| DEBT-05 (52/53/58 records current) | 78-01, 78-02, 78-03 | SATISFIED | Truths 1-4. |
| DEBT-06 (macArch + three sidecar suites pass) | 78-05 | SATISFIED | Truth 5, run by me. |

Both IDs appear in REQUIREMENTS.md (lines 60-61, traceability lines 98-99, marked Complete). No orphaned requirements.

## Behavioral spot-check

`pnpm jest --runTestsByPath` on macArchKnownFixRouting, installFlows, runnerSliceRegistration and testContainment: 4 suites, 209 tests, all pass (in the tree as it stands, which is dirty with unrelated changes; the clean-HEAD proof is the one in 78-TEST-HEALTH.md). Also passing: gamesModuleSurface, inviteBridge, helperIntegration (77 tests).

## Gaps Summary

No roadmap-level gaps. The records match the code and the four suites pass. One plan-level must-have (backend-di-ceilings green) is unmet. It is pre-existing, tracked and honestly reported, but requires operator acceptance. Status is `human_needed` for that decision only.

_Verified: 2026-11-17_
_Verifier: Claude (gsd-verifier)_
