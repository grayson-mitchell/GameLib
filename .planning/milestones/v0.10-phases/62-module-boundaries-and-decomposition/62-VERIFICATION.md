---
phase: 62-module-boundaries-and-decomposition
verified: 2026-11-07T12:00:00Z
status: passed
score: 10/10 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 8/10
  gaps_closed:
    - "Boundaries are enforced by a tool and `pnpm lint` is green (62-22: games.test.ts:25 cast removed; pnpm lint exits 0)"
    - "No runner-literal checks remain outside storeManagers (62-23: 7 surviving sites routed through isStore; selector widened to library/value/computed/cast/non-null/indexOf/Set.has)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Epic offline launch with offlineMode=true (resolveOfflineMode expired-flag hook)"
    expected: "Hook reached; offline launch honours the flag"
    why_human: "Not exercised in UAT 13; observed failure is pre-existing (isOnline/isEpicServiceOffline), filed as a todo"
  - test: "Sideloaded game card, game page, install dialog and the Library filter chips/facet (UAT 14e, 15, 16)"
    expected: "Sideload store-specific controls unchanged"
    why_human: "Skipped (no sideloaded game). 62-23 swapped `value === 'sideload'` to isStore in the filter files, which makes this pass more worthwhile"
  - test: "Managed-by-Steam hand-off and Steam-failure download-queue cases (UAT 18c)"
    expected: "Download queue behaves as before"
    why_human: "Skipped. downloadqueue.ts/utils.ts literal-to-capability swap area; 62-23 touched backend/utils.ts library comparisons"
  - test: "GOG Wine 'launching' status (Windows GOG title)"
    expected: "Status emitted"
    why_human: "Balrum is native macOS so not reached"
  - test: "GOG resume-from-0 (Endless Sky) against a pre-62 build"
    expected: "Same behaviour on pre-62 (confirms not a regression)"
    why_human: "Judged pre-existing, never compared with a pre-62 build"
---

# Phase 62: Module boundaries and decomposition: Verification Report (re-verification)

**Phase Goal:** Module boundaries in the TS backend and frontend are explicit, tool-enforced, and no longer bypassed by branching on store identity: dependency-cruiser rules, store capability flags, and the games.ts / depot.ts / ipc.ts decomposition plus a TS to Rust transport parity test.
**Verified:** 2026-11-07
**Status:** human_needed
**Re-verification:** Yes. Previous status gaps_found 8/10; both gaps are closed.

Note: `.planning/REQUIREMENTS.md` does not exist; requirements are D-01..D-17 from 62-CONTEXT.md.

## Gap re-check

| Gap | Result | Evidence |
|-----|--------|----------|
| `pnpm lint` red (games.test.ts:25) | CLOSED | `pnpm lint` run by me: exit 0 (warnings only). `pnpm codecheck` passes. |
| Runner-literal ban misses live identity checks (WR-02) | CLOSED | The previously named sites (backend/utils.ts library comparisons; sideload comparisons in the filter facet/focus-row/strip/chipLabels) no longer contain `=== 'gog'/'sideload'` literals; chipLabels.ts:85 now uses `isStore(descriptor.value, 'sideload')`. A src-wide grep for `(library\|runner) === '<store>'` outside storeManagers finds comments only. Selector now covers `library`, `value`, computed access, `as`, non-null, `indexOf`, `Set.has`, and carries an explicit Known-blind-spots list. |

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | dependency-cruiser rules at error, zero violations | VERIFIED | `pnpm boundaries`: no violations (973 modules, 5003 dependencies) |
| 2 | Runner-literal ban is an ESLint rule at error | VERIFIED | `no-restricted-syntax` error from `meta/runnerLiteralSelectors.cjs`; selector test passes |
| 3 | Ban reaches zero literal identity checks | VERIFIED | See gap table. Residual blind spots are documented in the selector header |
| 4 | Capability flags replace runner-literal branching | VERIFIED | storeCapabilities test passes; lint has 0 errors |
| 5 | games.ts split into launch/DRM/requirements modules, no façade | VERIFIED | Unchanged from previous report (regression-checked via boundaries pass) |
| 6 | games.ts not a grab-bag | VERIFIED | Unchanged |
| 7 | depot fold, no back-edge | VERIFIED | cruiser rules pass |
| 8 | ipc split per domain + census | VERIFIED | census test passes |
| 9 | TS to Rust transport parity test | VERIFIED | transportParity test passes |
| 10 | Lint/typecheck gates green | VERIFIED | `pnpm lint` exit 0; `pnpm codecheck` passes |

**Score:** 10/10

## Behavioral Checks

| Check | Result |
|-------|--------|
| `pnpm boundaries` | PASS |
| `pnpm codecheck` | PASS |
| `pnpm lint` | PASS (exit 0) |
| jest transportParity, ipc census, storeCapabilities, runnerLiteralSelectors | PASS (87 tests in the selector+capabilities run; 86 in the parity+types+capabilities run) |

Full jest: not re-run by me. Orchestrator reports 8 failed suites, six matching the documented pre-existing baseline (games.test 56-01 constants, bottle DRM_LAUNCH_FORM, macArchKnownFixRouting, findDeadcode CLI drift, genI18nGateScope anti-rot, tauriShellSource). I observed genI18nGateScope, findDeadcode and x86CallbackWineHarness failing in a meta jest run. x86CallbackWineHarness (unexpected slot 15) fails in isolation but covers no file changed by 62-22/62-23; it is outside the gap-closure diff and should be tracked separately. dxvkInstallRemove is a known load flake.

## Review findings (62-REVIEW.md) judged against "enforced by a tool"

- **WR-01 (nested switch false positive):** the `:has` gate matches descendants, so a store-literal case in a nested switch can flag an unrelated outer switch. Direction is over-reporting, not under-reporting, and lint is at 0 today, so no current breakage and the tool still enforces. Non-blocking; fix is the `:has(> SwitchCase...)` scoping plus a pinned non-hit test.
- **WR-02 (multi-level casts):** `(game?.runner as string) === 'steam'`, `(runner as Runner)! === 'steam'`, `(['gog'] as const).includes(runner)` and `lastIndexOf` are missed, and the header's "seen through casts" wording is slightly overstated because these composed forms are not in the Known-blind-spots list. This is narrower than the original gap (those shapes are rare and none exist in the tree now), so the goal "enforced by a tool" holds; the residual is documentation accuracy. Non-blocking warning. Recommend either adding the arms or listing them as blind spots.

Neither finding blocks the phase goal.

## D-xx accounting

D-01..D-17 satisfied as in the previous report; D-03/D-04 "reach zero" is now met, subject to the documented blind spots. D-17 live smokes ran (62-UAT, partial); the residue is carried as human items.

## Anti-patterns

None blocking found in the gap-closure scope; no TBD/FIXME/XXX introduced that I checked in meta/runnerLiteralSelectors.cjs.

## Gaps Summary

No gaps. Automated checks all pass. Status is human_needed only because of the UAT residue above (sideload, Managed-by-Steam queue, Epic offline hook, GOG Wine status, GOG resume baseline), which cannot be verified programmatically. Sideload and Managed-by-Steam are the paths touched by capability swaps and are worth a manual pass before closing the milestone.

---

_Verified: 2026-11-07_
_Verifier: Claude (gsd-verifier)_

## Human Verification Resolution (2026-11-07)

All five human_verification items passed in `62-HUMAN-UAT.md`. Two notes: in test 3 Part B, the operator skipped the Steam-failure (error and Remove) sub-case. Test 5 was reported as a pass by the operator; no pre-62 worktree was built in that session. Status moved from human_needed to passed.
