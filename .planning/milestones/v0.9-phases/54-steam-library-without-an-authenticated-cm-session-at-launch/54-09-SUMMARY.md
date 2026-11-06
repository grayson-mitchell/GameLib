---
phase: 54-steam-library-without-an-authenticated-cm-session-at-launch
plan: 09
subsystem: steam
tags: [steam, source-gate, docs, session-policy]
requires: [54-04, 54-05, 54-06, 54-07, 54-08]
provides:
  - "steamAuthSessionPolicy.test.ts: non-vacuous source gate for the authenticated-session policy (ROADMAP SC3)"
  - "STEAM-STACK.md and CLAUDE.md record the anonymous-PICS / on-demand-session change (ROADMAP SC5)"
affects: [54-10, 54-11]
key-files:
  created:
    - src/backend/__tests__/steamAuthSessionPolicy.test.ts
  modified:
    - src/backend/storeManagers/steam/user.ts
    - .planning/research/STEAM-STACK.md
    - CLAUDE.md
key-decisions:
  - "MIN_FILES_SCANNED = 420 (measured 2026-10-27: 839 files under src/ minus __tests__ and *.test.*)"
  - "ensureConnected stays a public static; doc comment marks it user.ts-internal and the gate forbids callers elsewhere"
requirements-completed: [ROADMAP-SC3, ROADMAP-SC5, ROADMAP-SC6, P54-SC1, P54-SC6, P54-SC7]
completed: 2026-10-27
---

# Phase 54 Plan 09: Session policy gate and stack record Summary

A 13-test source gate pins who may log on to the Steam CM network, and the frozen stack record now explains why steam-user went anonymous-by-default.

## Tasks

1. Source gate: `f1a007aaf`.
2. STEAM-STACK.md and CLAUDE.md: `33c0ecd5c`.

## What the gate does

Rules A-K plus a floor test and a must-scan test (13 tests), all on comment-stripped source: refreshToken logOn only in user.ts; anonymous logOn only in anonymousClient.ts; no `.relog(`; `ensureConnected(` only in user.ts; `acquireAuthenticated(` / `acquireOpenAuthenticated(` only in their allow-lists with each entry matching at least once; launch-path files call neither of the first and last; every `new SteamUserLib(` passes `autoRelogin: false` (2 constructions found); `allowLogon: true` once, in games.ts; `getExtraInfo` touches no `SteamUser.`; the two `CM logon mode=... reason=` log lines occur once each. It passed on the tree as plans 03-08 left it, with no leftover call sites.

Sabotage control (run by hand, not committed): appending `void SteamUser.ensureConnected()` to `bridge/launchTarget.ts` failed exactly Rules D and G, both naming launchTarget.ts; after revert 13/13 passed.

## Desk battery (honest results)

| Command | Exit | Note |
| --- | --- | --- |
| `pnpm test:ci` | 1 | 9 suites / 12 tests failed of 628 suites (see below) |
| `pnpm codecheck` | 0 | 9s |
| `pnpm lint` | 1 | 950s; see below |
| `pnpm smoke:sidecar` | 0 | 3s (weak backstop: misses slow exit) |
| `pnpm planning-gates` | 0 | 8s |

Failing jest suites: the known `installFlows`, `runnerSliceRegistration`, `testContainment`, plus `skeletonFlows` (Steam refreshLibrary read flow, same sidecar family), frontend `permanentlyMountedPolls`, and meta `findDeadcode`, `genI18nGateScope`, `isIntelMacRemoved`, `machineFillGamelib`. This plan only added a new test and a comment, so none are caused by it; I did not bisect them. `skeletonFlows`, `isIntelMacRemoved` and the meta ones were not in deferred-items.md and are worth a look (the other session's `.claude/worktrees/quick-261027-tot` may contribute to the git-derivation and findDeadcode ones).

`pnpm lint` is not green: the repo-wide run walks `.claude/worktrees/quick-261027-tot/` (the other session's worktree, outside the tsconfig) producing parse errors, plus errors in `meta/`. Scoped `eslint --quiet` over this plan's two source files exits 0; scoped prettier is green. The macSteamOffline.ts `prefer-promise-reject-errors` error is pre-existing and untouched.

## Docs

STEAM-STACK.md has a dated `Reopened by Phase 54 (2026-10-27)` section; the steam-user Authentication and Library Data rows now say anonymous/on-demand and `getUserOwnedApps(steamID, { includePlayedFreeGames: true })`; the Web API rejected row records the SteamClient-token limit; Confidence row renamed. Greps: "Reopened by Phase 54" 1, `getOwnedApps()` 0 in both files, `getUserOwnedApps()` 1 in CLAUDE.md. STEAM-STACK.md is prettier-ignored (no check claimed); CLAUDE.md prettier check green. `graphify update .` ran (exit 0).

## Deviations from Plan

**1. Line 91 of STEAM-STACK.md** (a link title "getOwnedApps() performance") was reworded to "getOwnedApps performance" to meet the zero-grep criterion; the link target is unchanged.

**2. Battery not fully green** as detailed above; pre-existing or environmental, reported rather than fixed (out of scope).

## Known Stubs

None.

## Self-Check: PASSED
