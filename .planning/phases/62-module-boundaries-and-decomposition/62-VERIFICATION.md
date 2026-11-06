---
phase: 62-module-boundaries-and-decomposition
verified: 2026-11-07T00:00:00Z
status: gaps_found
score: 8/10 must-haves verified
gaps:
  - truth: "Boundaries are enforced by a tool and `pnpm lint` is green"
    status: failed
    reason: "`pnpm lint` exits 1: tests scope has 1 error, src/backend/storeManagers/steam/__tests__/games.test.ts:25 @typescript-eslint/no-unnecessary-type-assertion (the `as string[]` on readdirSync in gameModuleFiles). The helper came from the post-62 quick tasks (6cdce5d95 / 86451c8da), not a plan task, but it sits in the phase's own guard test and the lint gate is red."
    artifacts:
      - path: "src/backend/storeManagers/steam/__tests__/games.test.ts"
        issue: "line 25 unnecessary type assertion (error)"
    missing:
      - "Drop the `as string[]` cast at games.test.ts:25 and re-run `pnpm lint`"
  - truth: "No runner-literal checks remain in frontend/backend outside storeManagers (ESLint ban at error, zero)"
    status: partial
    reason: "The gate is at error with zero reported sites, but the selector is name-based (62-REVIEW WR-02). Live identity comparisons escape it: backend/utils.ts:455,461,476 (`library === 'gog'|'legendary'|'nile'`) and `value === 'sideload'` in FilterStoreFacet:72, FilterFocusRow:135, FocusRowStrip:228, chipLabels.ts:84. Filed as todo 2026-11-07-runner-literal-ban-misses-non-runner-names.md."
    artifacts:
      - path: "meta/runnerLiteralSelectors.cjs"
        issue: "RUNNER_NAME only matches runner/store-named operands"
    missing:
      - "Convert the 7 surviving sites to isStore/capabilities, and widen the selector (add `library`, TSAsExpression, computed access, indexOf/has), or document the blind spots in the selector header"
human_verification:
  - test: "Epic offline launch with offlineMode=true (resolveOfflineMode expired-flag hook)"
    expected: "Hook reached; offline launch honours the flag"
    why_human: "Not exercised in UAT 13; the observed failure is pre-existing (isOnline/isEpicServiceOffline) and filed as a todo"
  - test: "Sideloaded game card, game page and install dialog (UAT 14e, 15, 16)"
    expected: "Sideload store-specific controls unchanged"
    why_human: "Skipped (operator has no sideloaded game). Note the surviving `value === 'sideload'` sites are in exactly these filter files."
  - test: "Managed-by-Steam hand-off and Steam-failure download-queue cases (UAT 18c)"
    expected: "Download queue behaves as before"
    why_human: "Skipped. This is the downloadqueue.ts/utils.ts literal-to-capability swap area."
  - test: "GOG Wine 'launching' status (Windows GOG title)"
    expected: "Status emitted"
    why_human: "Balrum is native macOS so it was not reached"
  - test: "GOG resume-from-0 (Endless Sky) against a pre-62 build"
    expected: "Same resume-from-0 behaviour on pre-62 (confirms not a regression)"
    why_human: "Judged pre-existing but never compared with a pre-62 build"
---

# Phase 62: Module boundaries and decomposition: Verification Report

**Phase Goal:** Module boundaries in the TS backend and frontend are explicit, tool-enforced, and no longer bypassed by branching on store identity: dependency-cruiser rules, store capability flags, and the games.ts / depot.ts / ipc.ts decomposition plus a TS to Rust transport parity test.
**Status:** gaps_found
**Re-verification:** No

Note: `.planning/REQUIREMENTS.md` does not exist. Plan "requirements" are D-01..D-17 from 62-CONTEXT.md, accounted for below.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | dependency-cruiser rules at error, zero violations (no cross-store-manager import; launcher only via storeManagers/index) | VERIFIED | `pnpm boundaries`: "no dependency violations found (973 modules)". `.dependency-cruiser.cjs` has 5 rules, all `severity: 'error'`, no baseline file. launcher.ts has no direct imports from gog/legendary/nile managers. |
| 2 | Runner-literal ban is an ESLint rule at error | VERIFIED | `eslint.config.mjs:115` `no-restricted-syntax: ['error', ...runnerLiteral.SELECTORS]` from `meta/runnerLiteralSelectors.cjs`. Selector test passes. |
| 3 | The ban actually reaches zero literal identity checks | PARTIAL (gap) | Zero reported, but WR-02 shows 7 surviving store-literal comparisons the selector cannot see (see gaps). |
| 4 | Capability flags replace runner-literal branching (D-01/D-02) | VERIFIED | `src/common/storeCapabilities.ts` exists, with its test passing; 62-SITE-CLASSIFICATION records per-site classification; src lint reports 0 errors. |
| 5 | games.ts split into launch/DRM/requirements modules; no façade (D-05/D-07) | VERIFIED | `gameLaunch`, `gameBridgeLaunch`, `gameLaunchOverlay`, `gameDrmLaunch`, `gameRequirements`, `gameInstall`, `gameUninstall`, `gameSessionState`, `gameEligibility`, `gameMaintenance`, `gameProtocolUrl`, `gameConstants` exist and are substantive (10 to 1,788 lines). The `games-split-modules-are-leaves` cruiser rule passes. |
| 6 | games.ts is not a grab-bag | VERIFIED | 2,043 lines (from 7,228). One top-level export (`getBridgeRouteVerdict`) beyond the SteamGame class, which is the retained cohesive class (D-07). The plan targets (<2,000, <1,400) were missed. This is a plan-estimate miss, not a goal gap: the goal is the split into launch/DRM/requirements modules, which is met. |
| 7 | depot.ts folded into steam/depot/ with index entry, no back-edge (D-08) | VERIFIED | `steam/depot.ts` absent; `depot/index.ts` present; `no-depot-parent-back-edge` and `no-circular-depot` rules at error, passing. |
| 8 | ipc.ts split per domain, intersection umbrella, census (D-09..D-11) | VERIFIED | `common/types/ipc.ts` absent; 26 domain files plus `ipc/index.ts`; `ipcDomainCensus.test.ts` passes. |
| 9 | TS to Rust transport parity test (D-12) | VERIFIED | `transportParity.test.ts` passes. |
| 10 | Lint/typecheck gates green | FAILED | `pnpm codecheck` passes. `pnpm lint` exits 1 (see gap 1). |

**Score:** 8/10 (truth 3 partial, truth 10 failed)

## Behavioral Checks

| Check | Result |
|-------|--------|
| `pnpm boundaries` | PASS (0 violations) |
| `pnpm codecheck` | PASS |
| `pnpm lint` | FAIL (1 error, tests scope, games.test.ts:25) |
| jest: transportParity, ipcDomainCensus, storeCapabilities, runnerLiteralSelectors | PASS (75 tests) |

The six pre-existing jest failures were not counted and the full suite was not re-run.

## D-xx Accounting (62-CONTEXT.md)

D-01..D-04 (capabilities, isStore helper, all-runner reach, scope): implemented. The D-03/D-04 "reach zero" claim is partial because of WR-02.
D-05..D-08 (no façade, pure moves, minimum modules, depot index): satisfied.
D-09..D-12 (ipc domains, intersection, census, transport parity): satisfied.
D-13/D-14/D-15 (two tools; ratchets deleted when zero; every rule at error and zero): satisfied as measured by the tools, with the WR-02 caveat on the ESLint ban. The cruiser rules are fully satisfied.
D-16 (ordering): followed.
D-17 (two live smokes): run (62-UAT), status partial; see residue below.

## UAT Residue Judgement

- GOG resume-from-0 (item 18b): the phase-62 diffs there are 1:1 literal-to-capability swaps and the gogdl command is byte-identical, so it is plausibly pre-existing. It is unconfirmed against a pre-62 build, so it stays a human item but is not a goal blocker.
- Sideload, Managed-by-Steam, GOG Wine "launching" and the Epic offline hook: acceptable human-verification residue. Sideload and Managed-by-Steam are the paths touched by capability swaps, so a quick manual pass is worth doing before closing the milestone.

## Gaps Summary

Two gaps, neither structural:
1. `pnpm lint` is red because of one unnecessary type assertion in games.test.ts:25. This is a one-line fix and should be done first.
2. WR-02: "ceiling 0" overstates coverage. Seven live store-literal comparisons escape the name-based selector. This is a genuine, small gap against "no longer bypassed by branching on store identity" and "enforced by a tool". It is already tracked as a todo; fix it either by converting those sites and widening the selector, or by explicitly documenting the blind spots.

The games.ts line-count miss is NOT a gap. The decomposition, depot fold, ipc split, boundary rules and parity test all exist, are wired, and are tool-verified.
