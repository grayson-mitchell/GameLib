---
phase: 65-steam-store-manager-decomposition-continued
plan: 19
subsystem: steam-store-manager
tags: [reconciliation, lift-stubs, dependency-cruiser, import-cycles]
requires: [65-18]
provides:
  - "SteamGame lift stubs removed (by quick-261108-ca6), lift-stub todo closed with Resolution"
  - "games-split-modules-are-leaves covers gameBridgeLaunchGate.ts"
affects: [65-20]
key-files:
  modified:
    - .dependency-cruiser.cjs
    - meta/__tests__/boundaryGates.test.ts
    - .planning/todos/completed/2026-11-07-remove-steamgame-lift-stubs.md
decisions:
  - "Plan 65-19 executed as a reconciliation: Tasks 1-3 were delivered by quick-261108-ca6 before this plan ran; only one real gap (leaf-rule coverage) was closed here"
  - "ca6's accepted-cycle-edge approach kept; no pure-move leaves (gameInstallEngine.ts, gameLaunchShared.ts) created"
metrics:
  completed: 2026-11-08
  tasks: "3 (all reconciled; 1 gap fix + 1 todo doc fix)"
---

# Phase 65 Plan 19: SteamGame lift-stub removal (reconciliation) Summary

Most of this plan landed through quick task 261108-ca6; 65-19 verified the end state and closed one real gap, the missing `gameBridgeLaunchGate` coverage in the `games-split-modules-are-leaves` dependency-cruiser rule and its seeded boundaryGates arm.

## Credit: quick-261108-ca6

- `3ebf3dabf` drop SteamGame install lift stubs. `installNative`/`installBottleNative` moved into `gameInstallDepot.ts`; `install()`, `gameInstallBridge` and `restorePinEngine` call free functions.
- `c44cb7c12` drop SteamGame launch lift stubs. `launchBridgeGame`/`runBridgeLaunch` split into the new `gameBridgeLaunchGate.ts`; `gameLaunch` and `gameBridgeLaunch` call free functions.
- `0c242e0ce` closed the todo and named the accepted import-cycle edges in `gamesModuleSurface.test.ts` (passes).

games.ts is 613 lines (steam-line-ceiling PASS, baseline `{}`).

## Classification

| Item | Class | Evidence |
|---|---|---|
| Truth 1: non-interface stubs gone, 9 interface methods thin | DONE-by-ca6 | `grep -cE` for the ten stub names as members in games.ts = 0; `.stub(` call-form grep over src/backend non-tests prints nothing; interface members install/isNative/addShortcuts/removeShortcuts/launch/moveInstall/repair/syncSaves/uninstall present |
| Truth 2: D-18 reduced scope recorded | DONE (this SUMMARY) | 65-13 removed eligibility 4 + uninstallBridgeGame (1b288062b); ca6 removed the ten remaining; 65-19 own removals: 0 |
| Truth 3: D-19 retained cycle-breakers with todo | SUPERSEDED | ca6 removed all ten; `grep -c D-19 games.ts` = 0; no retained stub. `restorePinEngine` stays as a class-bound arrow property (engineSwitch callback), body calls the free `ensureBuiltInEngineForInstall(this, pin)`; not a delegating stub |
| Truth 4: D-17 describes stay, spies repointed | DONE-by-ca6 | `grep -c "SteamGame.prototype"` in games.test.ts = 0; ca6 repointed 19 spies to module exports |
| Truth 5: call sites call free fn with instance first | DONE-by-ca6 | stub call-form grep over non-test src/backend = empty |
| Truth 6: no new cycle, resolved by pure-moves into leaves, or D-19 | SUPERSEDED / accepted | ca6 chose accepted cycle edges (gameInstall->gameInstallBridge, gameInstallBridge->gameLaunch, gameLaunch->gameBridgeLaunchGate, gameLaunch->gameBridgeWineLaunch, gameBridgeLaunch->gameBridgeWineLaunch, gameBridgeLaunchGate->gameBridgeLaunch) named in `CYCLE_EDGES` in gamesModuleSurface.test.ts (7/7 pass). No module outside the baseline list or its split products joined a cycle (see cycle rule). gameInstallEngine.ts / gameLaunchShared.ts not created, not needed |
| Truth 7: new leaves in leaf rule and LIFTED_OWNERS | GAP, now closed | `LIFTED_OWNERS` already listed gameInstallDepot.ts and gameBridgeLaunchGate.ts; the depcruise rule regex lacked `BridgeLaunchGate` (gameInstallDepot was covered). Fixed in 0bfd02bab with a seeded runtime-import arm in boundaryGates |
| Truth 8: todo in completed/ with Resolution | DONE-by-ca6, heading fixed | ca6 wrote `## Resolved`; 65-19 appended `## Resolution` with phase counts (the plan's grep target) |
| Artifact games.ts | DONE-by-ca6 | 613 lines, ten stubs gone |
| Artifact completed todo contains `## Resolution` | DONE here | appended, planning-gates 12/12 |
| Key link gameLaunch -> gameBridgeLaunch `launchBridgeGame(steamGame)` | DONE-by-ca6 (altered) | call now goes via `gameBridgeLaunchGate` (`gameLaunch->gameBridgeLaunchGate` edge) rather than gameBridgeLaunch directly; semantics same |
| Key link gameInstall -> gameInstallBridge `installBridgeGame(steamGame` | DONE-by-ca6 | edge in CYCLE_EDGES |
| Task 1 acceptance (install stubs 0, no `.x(` call sites) | DONE-by-ca6 | greps above |
| Task 2 acceptance: stubs 0, `SteamGame.prototype` 0 | DONE-by-ca6 | greps above |
| Task 2 acceptance: no `from './gameLaunch'` in gameBridgeLaunch/gameBridgeWineLaunch | SUPERSEDED | count is 1 in each (accepted cycle edges; pure-move approach not taken). Plan permitted this only under the D-19 fallback; the user-approved ca6 approach replaces it |
| Task 3 acceptance: interface members listed, todo closed, planning-gates | DONE | 12/12 gates pass |
| Files in files_modified: gameInstallEngine.ts, gameLaunchShared.ts | NOT-NEEDED | no pure-move leaves created |
| Files in files_modified: .dependency-cruiser.cjs, boundaryGates.test.ts | GAP, closed | 0bfd02bab |

## Cycle rule (65-10 user decision)

Census command from 65-01 re-run: raw count 482 (65-18: 482, baseline ceiling 321 is for the phase's original measure; the raw count has been above it since earlier plans and is unchanged by this plan). Set diff of cycle modules against `65-baseline-steam-cycle-modules.txt` shows the same split-product set as 65-18 plus the modules below, all split out of listed files, none a foreign module:

- `gameBridgeLaunchGate.ts`: split out of `gameBridgeLaunch.ts` (listed). Split product.
- `gameInstallDepot.ts`, `gameInstallBridge.ts`, `bridgeInstallState.ts`: split out of `gameInstall.ts` (listed), 65-11.
- `gameBridgeWineLaunch.ts`: split out of `gameBridgeLaunch.ts` (listed), 65-14.
- `gameMetadata.ts`: split out of `games.ts` (listed), 65-13.
- The remaining new names (bridge/drm/*, bridge/helper*, bridge/shim*, library/*) are earlier split products of listed files (65-02, 65-15 to 65-18).

No STOP condition: no module outside the list and its split products joined a cycle.

## Verification

- Steam suite: numTotalTests 4389 (baseline 4385, +4 from earlier plans/ca6; same as 65-18's 4389, no delta vs. 65-18), numRuntimeErrorTestSuites 0, numFailedTests 1, `comm -23` of failing names against 65-baseline-steam.txt prints nothing. The 65-18 off-baseline failure (module-surface forward test, gameBridgeLaunchGate missing from the FORWARD map) is fixed by ca6.
- `pnpm codecheck` pass, `pnpm boundaries` no violations (1095 modules), `pnpm steam-line-ceiling` PASS (0 allowlisted), `npx jest --selectProjects Meta --testPathPattern boundaryGates` 18/18, `pnpm planning-gates` 12/12.
- `pnpm lint`: 1 error, the pre-existing `@typescript-eslint/no-require-imports` in `games.test.ts` (now line 230, previously ~222). ca6 did NOT fix it; only the line moved. Left alone (out of scope).

## Reduced scope

D-18: 65-19 removed zero stubs itself; all stub removal was done by 65-13 (5) and quick-261108-ca6 (10). No D-19 retentions, no pure-move leaves, and the plan's one-way-edge acceptance for gameBridgeLaunch/gameBridgeWineLaunch is replaced by named accepted cycle edges.

## Deviations from Plan

**1. [Rule 2 - Missing critical] Leaf-rule coverage for gameBridgeLaunchGate**
- Found during: classification of must-have 7
- Fix: added `BridgeLaunchGate` to the `games-split-modules-are-leaves` regex and to the seeded arm
- Files: `.dependency-cruiser.cjs`, `meta/__tests__/boundaryGates.test.ts`
- Commit: 0bfd02bab

**2. [Rule 3] Todo Resolution heading**: appended `## Resolution` to the completed todo (docs commit below).

## Known Stubs

None.

## Self-Check: PASSED
