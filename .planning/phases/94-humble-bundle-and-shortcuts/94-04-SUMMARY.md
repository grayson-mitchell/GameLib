---
phase: 94-humble-bundle-and-shortcuts
plan: 04
subsystem: login
tags: [login-window-seam, survivor-schedule, relocation, d-03, oauth, user-agent]
status: complete

requires:
  - phase: 94-humble-bundle-and-shortcuts
    provides: 94-03 survivor schedule (relocated and twin shapes) and the createRustLoginWindowSeam row
provides:
  - src/backend/login/loginWindowSeam.ts and src/backend/login/userAgent.ts (moved unchanged, scheduled survivors deleted by 92)
  - src/backend/sidecar/loginSeamRegistration.ts (registerLoginWindowSeam, createRustLoginWindowSeam)
  - BootServices.loginWindowSeam, owned by the boot; HumbleServicesDeps.loginWindowSeam
  - schedule rows for the seam module, its install and the user agent (all deletedBy 92)
affects: [94-17, 94-29, 94-30]

requirements-completed: []

actuals:
  tokens: 26000
  tasks: 2
  commits: 2

plan_head_before: 5794d05fb018de68f1098f6b81fafbe72df22df9
plan_head_after: 9cc5986194f852e97471c286e5d991c7598c745e

tech-stack:
  added: []
  patterns:
    - "a survivor leaves the Humble tree with its slot install, so deleting the Humble registration cannot take the OAuth sign-in flows' seam with it"
    - "the login seam slot is boot-owned (BootServices.loginWindowSeam) and handed to createHumbleServices as a dependency"

key-files:
  created:
    - src/backend/login/loginWindowSeam.ts (git mv from humble/)
    - src/backend/login/userAgent.ts (git mv from humble/)
    - src/backend/login/__tests__/userAgent.test.ts (git mv from humble/__tests__/)
    - src/backend/sidecar/loginSeamRegistration.ts
  modified:
    - src/backend/sidecar/humbleLoginFlowRegistration.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/services/types.ts
    - src/backend/services/managerDeps.ts
    - src/backend/humble/index.ts
    - src/backend/testUtils/testHumble.ts
    - src/backend/testUtils/testServices.ts
    - src/backend/__tests__/humbleShortcutsShimSchedule.test.ts
    - src/backend/__tests__/diPhaseGates.test.ts
    - src/backend/sidecar/__tests__/electronReachLedger.test.ts
    - meta/__tests__/loginWindowSeamPredicateRemoved.test.ts

key-decisions:
  - "registerLoginWindowSeam takes a third argument, appInfo, because the GAMELIB_LOGIN_SEAM_SMOKE hook it carries calls standardBrowserUserAgent, which reads app info; the plan's two-argument signature had no way to supply it"
  - "HumbleServices no longer carries loginWindowSeam: the slot is BootServices.loginWindowSeam only, so there is one owner and managerDeps reads it directly"
  - "the slot is built inside the existing 'humble-services' boot step rather than a new step, because bootSourceShape enumerates the step names"

duration: 55min
completed: 2026-11-24
---

# Phase 94 Plan 04: Login seam and user agent relocation Summary

**The login-window seam, its Rust-backed install and the browser user-agent helper now live outside `humble/` as scheduled survivors (deleted by 92), with a boot-owned seam slot, so the Humble deletion in 94 cannot take the GOG, Epic and Amazon sign-in flows' seam with it.**

## Accomplishments

- `humble/loginWindowSeam.ts` moved by `git mv` to `login/loginWindowSeam.ts` with only a D-03 header line, comment path corrections and the accessor's error message naming the new install (no behaviour change, same RPC channels).
- `createRustLoginWindowSeam` and the `GAMELIB_LOGIN_SEAM_SMOKE` hook moved verbatim into `sidecar/loginSeamRegistration.ts`, behind `registerLoginWindowSeam(slot, requestRustInvoke, appInfo)`. `handlers.ts` calls it first, before the dev Epic sweep, Humble login, OAuth capture and runner-auth registrations (T-94-07). `registerHumbleLoginFlows` no longer installs anything and no longer takes `requestRustInvoke`.
- `BootServices.loginWindowSeam` added; the 'humble-services' step creates the one slot and `createHumbleServices` receives it as a dependency. `managerDeps` and every consumer read the boot slot.
- `humble/userAgent.ts` and its test moved to `login/`; every importer and every `humble/userAgent` jest.mock path repointed (humbleLoginFlows, legendary user, epicLogoutDomains, expiryProbe, epicCookieCensus).
- Guards followed the moves in the commits that made them: diPhaseGates OWNED_66_3 names `src/backend/login/loginWindowSeam.ts` (length unchanged), the predicate gate gained `src/backend/login` as its third root, the reach ledger walks `loginSeamRegistration.ts` and names `login/userAgent.ts` in `requiredModules`.
- Schedule: `createRustLoginWindowSeam` repointed, plus relocated rows for `registerLoginWindowSeam`, `createLoginWindowSeamSlot` and `classifyCookieRead`, and a `twin` row for `standardBrowserUserAgent` (vectors: `login/__tests__/userAgent.test.ts`), all deletedBy 92. `grep -c "deletedBy: 92"` is 7.
- New test: `registerLoginWindowSeam` installs a seam into an empty slot that drives the Rust login window (tracer proof that an OAuth login reaches Rust through the relocated seam).

## Task Commits

1. Task 1 (tracer): seam, slot install and boot slot move - `8cc92e70e`
2. Task 2: user agent move, reach ledger and schedule rows - `9cc598619`

The tracer gate re-ran the Task 1 jest set (13 suites, 475 tests), `pnpm codecheck` and prettier green before Task 2 expanded.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `registerLoginWindowSeam` needs app info**
- **Found during:** Task 1
- **Issue:** The smoke hook calls `standardBrowserUserAgent`, which needs `appInfo`; the plan's `(slot, requestRustInvoke)` signature could not supply it.
- **Fix:** Third parameter `appInfo: Pick<AppInfo, 'userAgentFallback'>`, passed as `deps.services.appInfo` in handlers.ts.
- **Files modified:** src/backend/sidecar/loginSeamRegistration.ts, src/backend/sidecar/handlers.ts
- **Commit:** 8cc92e70e

**2. [Rule 3 - Blocking] Files outside the plan's list consume the slot**
- **Found during:** Task 1
- **Issue:** Making the slot a `BootServices` member (and dropping it from `HumbleServices`) required edits beyond the plan's file list: `services/managerDeps.ts`, `sidecar/__tests__/bootstrap.test.ts` (thirty-seven to thirty-eight fields), `playtimeQueueBootDrain.test.ts`, `runnerSliceRegistration.test.ts`, `storeManagers/__tests__/createStoreManagers.test.ts`, `humble/__tests__/humbleInstances.test.ts` (its source-shape list and the wiring-bug message regex), plus the `humble/__tests__/*` imports of the moved module.
- **Fix:** Repointed to `services.loginWindowSeam`, updated the field census and the message regex to `registerLoginWindowSeam`.
- **Commit:** 8cc92e70e

**3. [Rule 3 - Blocking] The schedule's caller check counts `testUtils`**
- **Found during:** Task 2
- **Issue:** `callerProblems` treats `testUtils/testHumble.ts` and `testUtils/testServices.ts` as non-test importers of the seam module.
- **Fix:** Listed both in the rows' callers.
- **Commit:** 9cc598619

## Known Stubs

None.

## Threat Flags

None. The seam's behaviour, channels and OAuth paths are unchanged; T-94-07 is mitigated by `registerLoginWindowSeam` running first in handlers.ts and by the unchanged oauthLoginCapture, logoutCookies and epicCookieCensus suites passing.

## Verification

- `pnpm exec jest --runTestsByPath` over the Task 1 and Task 2 sets: all pass (oauthLoginCapture, humbleLoginFlows, humbleFlows, gog and nile logoutCookies, legendary user, epicCookieCensus, epicLogoutDomains, expiryProbe, humbleInstances, flowRegistrationCensus, diPhaseGates, testContainment, schedule, electronReachLedger, login userAgent); `pnpm exec jest src/backend/humble`: 716 tests pass. The measured electron reach set is unchanged.
- `pnpm codecheck` clean; `npx prettier --end-of-line auto --check` clean on every touched file; eslint reports no errors.
- Acceptance greps: `humble/loginWindowSeam` 0 files, `humble/userAgent'` 0 files, `humble/loginWindowSeam.ts` and `humble/userAgent.ts` absent, no `loginWindowSeam.install` left in humbleLoginFlowRegistration.ts.

### Windows-local failures, not caused by this plan

These suites are red in this Windows worktree and were failing for environment reasons (CRLF checkout, the missing `public` assets in the worktree, the grep spawn in the meta gate), not because of the moves:

- `meta/__tests__/loginWindowSeamPredicateRemoved.test.ts`: all four cases fail, including the pre-existing `humble` and `storeManagers` roots and the single-file `oauthLoginCapture.ts` case; the spawned grep output is mis-parsed on Windows (`C:NaN`). I ran the same four patterns by hand over `src/backend/login` and `oauthLoginCapture.ts` with bash grep and found zero offenders. It needs a run on the ubuntu CI.
- `sidecar/__tests__/bootSourceShape.test.ts` ("one top-level let") and the `bootstrap.test.ts` "healthy arm" asset-root case (worktree has no `public` assets). The bootstrap field-count case I updated passes.

## Self-Check: PASSED

- FOUND: src/backend/login/loginWindowSeam.ts, src/backend/login/userAgent.ts, src/backend/login/__tests__/userAgent.test.ts, src/backend/sidecar/loginSeamRegistration.ts
- MISSING (as intended): src/backend/humble/loginWindowSeam.ts, src/backend/humble/userAgent.ts
- FOUND: 8cc92e70e, 9cc598619
