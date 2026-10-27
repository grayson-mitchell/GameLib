---
phase: 54-steam-library-without-an-authenticated-cm-session-at-launch
plan: 04
subsystem: steam
tags: [steam, cm-session, library-refresh, auth-trigger, launch]
requires: [54-01, 54-03]
provides:
  - "consumeSteamRefreshLogonGrant: one-shot logon grant armed only by an explicit Refresh or sign-in dispatch"
  - "library.refresh() on the lease API with anonymous-first platform capture"
affects: [54-05, 54-06, 54-07, 54-08]
tech-stack:
  added: []
  patterns: ["keyring gate (sticky) separated from logon grant (one-shot)"]
key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/authTrigger.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/authTrigger.test.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/storeManagers/steam/__tests__/steamStartupKeyringDeferral.test.ts
key-decisions:
  - "game-status, nav-tabs-games-tab and login-screen origins fall through to startup; steam-sync-notice-retry, clear-cache and steam-go-offline-retry map to user-refresh"
  - "An ungranted refresh reuses an open session, else runs refreshInstallState() and emits idle"
  - "Go-offline refusal on a Refresh emits idle, not failed"
requirements-completed: [ROADMAP-SC1, ROADMAP-SC2, ROADMAP-SC6, P54-SC1, P54-SC2, P54-SC3]
duration: 40min
completed: 2026-10-27
---

# Phase 54 Plan 04: Launch never logs on; Refresh holds a lease Summary

An authenticated CM logon from library refresh now needs a one-shot grant that only an explicit Refresh or a sign-in dispatch can arm, so neither ordering of the boot probe and the mount refresh can log on at launch.

## Tasks

1. One-shot grant in `authTrigger.ts`: RED `test(54-04)` (grant tests, committed before implementation), GREEN `0bcadbd25`. The keyring gate is unchanged; `LOGON_GRANTING_TRIGGERS` is `user-refresh` and `login` only. Module is still a leaf (0 imports).
2. `refresh()` on the grant and lease; SC1 test: RED `88fddc44f`, GREEN `82385e784`.

## Behaviour delivered

- `refresh()` consumes the grant as its first statement. Granted: `acquireAuthenticated({ reason, guidedAction: 'refresh' })`. Ungranted: `acquireOpenAuthenticated`, else a local `refreshInstallState()` and one `idle` emit.
- The post-acquire body moved into a private `syncOwnedLibrary(client)`; the lease is released in `finally` on every exit including the hydration-catch rethrow. `syncing` is emitted only once a usable lease exists.
- Refusals: `go-offline-required` -> one `idle`; `logon-rejected` -> `failed/logon-rejected`; anything else -> `failed/client-not-ready`.
- Platform capture: anonymous pass first; second pass on the held client when the anonymous pass failed or captured fewer than scoped; single pass on the held client when no anonymous client.
- SC1 structural test (real `SteamUser` and `library.ts`): both orderings issue no `refreshToken` logOn and log no `CM logon mode=authenticated`; the control (explicit Refresh) logs on exactly once with the token.

## Deviations from Plan

**1. [Rule 3 - Blocking] Test shape changes.** The shared `library.test.ts` beforeEach now arms the grant via `noteRefreshTrigger` and mocks `acquireAuthenticated` to return a lease over `SteamUser.getClient()`, so the ~dozens of existing refresh tests are unchanged. The bridge "second refresh" test re-arms the grant because the grant is one-shot. The SC1 describe resets `SteamUser`'s `shuttingDown`/`client` singletons and re-establishes the `captureOwnedAppPlatforms` default because `resetMocks` strips it.

**2. Plan's "private method" not specified.** Splitting the body into `syncOwnedLibrary` rather than wrapping ~250 lines in a `try` keeps the diff reviewable; behaviour is identical.

**3. RED commit for Task 1** was created before the `authTrigger.ts` change but the import-fix for the new export was made after that commit (the test file as committed lacked the `consumeSteamRefreshLogonGrant` import); the suite still failed for the right reason before the GREEN commit.

`isSteamAuthUnlocked` stays exported (tests use it); lint did not flag it.

## Known Stubs

None.

## Deferred Issues

None new. Pre-existing sidecar failures (`installFlows`, `runnerSliceRegistration`, `testContainment`) are not in `src/backend/storeManagers/steam` and were not touched.

## Verification

`npx jest src/backend/storeManagers/steam`: 76 suites, 2949 tests green. `pnpm codecheck` green, scoped prettier green, eslint `--quiet` clean on touched files. Acceptance greps: `ensureConnected(` in library.ts code 0, `consumeSteamRefreshLogonGrant()` 1, `getAnonymousPicsClient('platform-capture')` 1; authTrigger greps 0/0/0 as required.

## Threat Flags

None.

## Self-Check: PASSED
