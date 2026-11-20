---
phase: 65-steam-store-manager-decomposition-continued
plan: 12
subsystem: backend/storeManagers/steam
tags: [decomposition, user, sign-in, redeem, split]
requires: ["65-11"]
provides:
  - "steam/userTypes.ts, userSignInState.ts, userSignIn.ts, userRedeem.ts (flat siblings split out of user.ts)"
affects: [65-19]
key-files:
  created:
    - src/backend/storeManagers/steam/userTypes.ts
    - src/backend/storeManagers/steam/userSignInState.ts
    - src/backend/storeManagers/steam/userSignIn.ts
    - src/backend/storeManagers/steam/userRedeem.ts
  modified:
    - src/backend/storeManagers/steam/user.ts
    - src/backend/storeManagers/steam/depot/planModel.ts
    - src/backend/storeManagers/steam/gameInstallDepot.ts
    - src/backend/sidecar/steamAuthFlowRegistration.ts
    - src/backend/storeManagers/steam/__tests__/user.test.ts
    - src/backend/storeManagers/steam/__tests__/credentialsMissing.test.ts
    - src/backend/sidecar/__tests__/steamAuthFlows.test.ts
    - src/backend/sidecar/__tests__/keyringTokenStore.test.ts
    - src/backend/__tests__/steamAuthSessionPolicy.test.ts
    - meta/steamLineCeilingBaseline.json
key-decisions:
  - "Sign-in fields (session, qrSessionState, qrLastLoggedStatus, credSessionState, settle callbacks) are only touched by the sign-in cluster and logout(), so all five moved to userSignInState.ts; logout() calls resetSignInState() in the same position."
  - "userSignIn.ts imports user.ts (for SteamUser.acquireAuthenticatedWithToken); user.ts does not import userSignIn, so no cycle was added."
metrics:
  completed: 2026-11-08
---

# Phase 65 Plan 12: Split user.ts Summary

user.ts (1,562 lines) is split into userTypes (pure move), userSignInState + userSignIn and userRedeem (free-function lifts, no delegating statics). user.ts is now 888 lines and its steamLineCeiling allowlist entry is deleted (6 keys remain).

## Line counts

| File | Lines |
| --- | --- |
| user.ts | 888 |
| userSignIn.ts | 411 |
| userRedeem.ts | 138 |
| userTypes.ts | 107 |
| userSignInState.ts | 81 |

## Commits

- 40382634a refactor(65-12): move user constants and types to userTypes (pure move; planModel and gameInstallDepot repointed)
- b522e5903 refactor(65-12): lift sign-in flows to userSignIn free functions (D-15)
- 2573ecc44 refactor(65-12): lift redeemKey to userRedeem free functions (D-15)

## Lift details

- `acquireAuthenticatedWithToken` lost `private` (exported on the class); only user.ts and userSignIn.ts call it, pinned by new policy Rule L.
- `finishAuth` is exported from userSignIn.ts because credentialsMissing.test.ts drove it as a private static; the other helpers (`resolveSignInProfile`, `completeQrProfile`, settle helpers) stay module-private.
- Narrowing in lifted bodies needed small local consts (`previousSession`, `session = getSession()` before the guard in submitSteamGuardCode); behavior and log lines are unchanged. The redeem body moved verbatim (key never logged).
- `SteamUserClient` in userTypes.ts is not exported (nothing else uses it).

## Tests and gates

- Steam suite: 4389 tests (baseline 4385), 0 runtime-error suites, no new failures against the baseline (macArchKnownFixRouting failure is in the baseline).
- steamAuthSessionPolicy: added USER_SIGN_IN/STATE to must-scan, new Rule L (acquireAuthenticatedWithToken callers, non-vacuous: both allowed files must hit), userRedeem.ts added to the Rule E allow-list (it holds `acquireAuthenticated(`).
- keyringTokenStore process.env scan now covers user.ts, userSignIn.ts, userSignInState.ts and userRedeem.ts with an existence and size assert.
- steamAuthFlows: user sign-in/redeem spies replaced with `jest.mock` of userSignIn / userRedeem.
- logSecretGate: no repoint needed (scans the tree); its 2 failures are the known pre-existing uninstaller.ts:131 pair.
- codecheck, boundaries, steam-line-ceiling pass. find-deadcode shows only the pre-existing drift (engine, IPC schema); no user*/SignIn/Redeem findings. indexedAccess steam buckets unchanged; failures are outside steam (tools, wiki_game_info, frontend/screens).
- `pnpm lint`: one error, in `__tests__/games.test.ts:221` (`require()` import). I did not touch that file; last changed in c3ddef301 (quick-261108-anw). Left alone.
- meta/knip-baseline.txt needed no change from this plan.

## Cycle rule (USER DECISION 65-10)

Census (65-01 command): raw count 453 (65-11: 452, +1). Module set diffed against 65-baseline-steam-cycle-modules.txt: the diff lists these modules not in the baseline: bridgeBottle, bridgeBottleLifecycle, bridgeInstallState, bottledSteam, gameInstallBridge, gameInstallDepot, provisionBottle, library/* (acfState, index, installPollOnce, installPolling, installRoot, installStop, installedMap, macArch, pollState, refresh, restartHold, resume, resumeBreadcrumbs, runningPoll, uninstallPolling) and userTypes.ts. All but userTypes were already present at 65-11 (earlier splits of baseline files). The only module this plan adds is userTypes.ts, a split product of user.ts (on the list); it joins via user.ts -> userTypes -> common/types/steam -> ... -> utils -> user.ts, because depcruise counts its `import type` edge as a runtime edge in this census. userSignIn, userSignInState and userRedeem are not in any cycle.

## Deviations from Plan

**1. [Scope] Sign-in and redeem describes stayed in user.test.ts.** The plan said to move them to userSignIn.test.ts/userRedeem.test.ts. They share ~200 lines of module mocks and the `mockSteamUserInstance` harness, so splitting would duplicate that. Calls were converted to the free functions in place; no test was dropped (4389 vs 4385). userSignIn.test.ts, userRedeem.test.ts, steamStartupKeyringDeferral.test.ts and authSessionLifecycle.test.ts were not created/edited: the latter two use the real modules and needed no change.

**2. [Rule 3] credentialsMissing.test.ts** drove `finishAuth` as a private static; now imports the exported function.

## Known Stubs

None.

## Threat Flags

None. T-65-28/29/31 mitigated as planned (scans widened, body moved verbatim, resetSignInState in logout's position); T-65-30 pinned by Rule L.

## Self-Check: PASSED
