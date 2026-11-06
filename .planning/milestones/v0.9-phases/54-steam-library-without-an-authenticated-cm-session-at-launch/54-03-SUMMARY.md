---
phase: 54-steam-library-without-an-authenticated-cm-session-at-launch
plan: 03
subsystem: steam
tags: [steam, cm-session, lease, go-offline, auth, macos]
requires: [54-01]
provides:
  - "SteamUser.acquireAuthenticated / acquireOpenAuthenticated / getPersistedSteamId64 and the AuthenticatedLease, AuthSessionReason, AuthSessionRefusal types"
  - "every authenticated cold connect inside withMacSteamOffline, autoRelogin off, no relog"
affects: [54-04, 54-05, 54-06, 54-08, 54-09]
tech-stack:
  added: []
  patterns: [refcounted lease with unref'd idle close, single-flight wrapped connect]
key-files:
  created:
    - src/backend/storeManagers/steam/__tests__/authSessionLifecycle.test.ts
  modified:
    - src/backend/storeManagers/steam/user.ts
    - src/backend/storeManagers/steam/macSteamOffline.ts
    - src/backend/storeManagers/steam/__tests__/user.test.ts
    - src/backend/storeManagers/steam/__tests__/credentialsMissing.test.ts
    - src/backend/storeManagers/steam/__tests__/probeCredentialPresence.test.ts
key-decisions:
  - "AUTH_SESSION_IDLE_GRACE_MS 60000; AUTH_LOGON_BOUND_MS 35000 replaces the 15 s fallback and the separate 20 s grace window"
  - "A bare ensureConnected() takes no lease and clears any armed idle timer on success, so an un-migrated long install is never logged off under it"
  - "Sign-in passes the token in memory and skips both the keyring read and the isLoggedIn flag check"
requirements-completed: [ROADMAP-SC3, ROADMAP-SC6, P54-SC1, P54-SC4, P54-SC7]
duration: 95min
completed: 2026-10-27
---

# Phase 54 Plan 03: Gated, refcounted authenticated Steam session Summary

`SteamUser` is now the single owner of every authenticated CM logon: the cold connect runs inside the Mac Steam go-offline wrap, the client is built with `autoRelogin: false`, a post-logon drop ends the session instead of re-logging on, and callers hold refcounted leases that close the session after a 60 s unref'd idle grace.

## Tasks

1. Wrapped cold connect, autoRelogin off, session end, canary re-entry: RED `55d30d235`, GREEN `6aca5d5c8`. 13 tests.
2. Refcounted lease API, idle grace, guided push, shutdown release: RED `23aa6192f`, GREEN `3c43a97a9`. 13 more tests (26 total in `authSessionLifecycle.test.ts`).
3. Sign-in, redeem and logout through the entry point; existing suites migrated: tests `e39a0b5a7`, GREEN `095e2734a`.
4. Supporting fix `284a1d520`: `backend/config` loaded lazily in `macSteamOffline.ts`.

## Behaviour delivered

- `ensureConnected()` keeps its name and boolean contract (plan 09 will gate callers); internally it is `ensureAuthenticatedSession('user-refresh')`.
- Stale canary: old client ended (`CM session closed ... cause=stale-canary`), cold connect re-entered through the wrap. `client.relog()` appears nowhere in code.
- Logon line `[Steam] CM logon mode=authenticated reason=<r> wrap=<kind>` precedes every `logOn`; the token is never logged.
- A logon in flight at 35 s is `logOff()`'d before the wrap returns (so before `goonline`).
- Wrap refusal: no client constructed, no `logOn`; `acquireAuthenticated` returns `go-offline-required` and pushes `steamGoOfflineRequired { action, appName }` only when the caller named a `guidedAction`.
- `releaseForShutdown` and `logout` close both the authenticated and the anonymous client.
- Sign-in and QR profile run through a `login` lease; persona lookup bounded at 5 s with fallback to `session.accountName`; `steamId` from the `LoginSession`.
- `redeemKey` leases with `reason: 'redeem'`, `guidedAction: 'redeem'`, releases in `finally`; refusal `go-offline-required` surfaces as `message: 'go-offline-required'`.

## Deviations from Plan

**1. [Rule 3 - Blocking] `backend/config` loaded lazily in `macSteamOffline.ts`**
- `user.ts` now imports `macSteamOffline` on every path; its top-level `backend/config` import dragged Electron paths into every suite that loads `user.ts` (tokenStore, humble, dxvk suites failed). `GlobalConfig` is now `require`d inside `connectionLogPath`. Commit `284a1d520`.

**2. [Rule 1 - Bug] Redundant keyring read and a possible double logon**
- The plan's cold path read the keyring before checking for an in-flight connect, and a connect that finished during the read would have been followed by a second logon that logs the fresh session off. The cold path now joins an in-flight connect without reading the keyring, and returns success if another caller connected during the read. Commit `095e2734a`.

**3. [Rule 3 - Blocking] Sign-in skips the `isLoggedIn` check**
- With a token override the session was just persisted by the caller, so `ensureAuthenticatedSession` does not require the stored flag. Needed for the QR/credentials path (and the existing logout-with-client test).

**4. [Rule 3 - Blocking] `probeCredentialPresence.test.ts` edited**
- Not in the plan's file list, but it imports `user.ts` and now needs the `./macSteamOffline`, `./anonymousClient` and `backend/ipc` mocks. `credentialsMissing.test.ts` likewise needed `backend/ipc`.

**5. Task 3 order**
- The Task 3 implementation was written before the Task 3 test commit, so `e39a0b5a7` (tests) precedes `095e2734a` (feat) but was not run red against the new code. Tasks 1 and 2 were genuine RED then GREEN.

`ensureAuthenticatedSession` in Task 1 temporarily called the sign-in path directly; Task 3 swapped in the lease. Interim code was committed as such.

## Known Stubs

None.

## Deferred Issues

Three sidecar suites (`installFlows`, `runnerSliceRegistration`, `testContainment`) fail identically against the pre-phase `user.ts`; logged in `deferred-items.md`. A `prefer-promise-reject-errors` eslint error in plan 01's `macSteamOffline.ts` is also logged there.

## Threat Flags

None. T-54-10 (log lines carry reason and wrap kind only, asserted by test), T-54-12/13 (idle close, bound, autoRelogin off, persistent `error` listener) and T-54-16 (raw key never logged) are covered by tests.

## Verification

`authSessionLifecycle` (26), `user` (104), `credentialsMissing`, `probeCredentialPresence` and `signInProbe` suites: 348 tests green. Full backend project: only the three pre-existing sidecar failures. `pnpm codecheck` green, scoped prettier green, eslint clean on touched files except the pre-existing item above. Acceptance greps: `.relog(` 0, `RELOG_GRACE_MS` 0, `autoRelogin: false` 1, `CM logon mode=authenticated reason=` 1, `reason: 'redeem'` 1, `closeAnonymousClient('logout')` 1.

## Self-Check: PASSED
