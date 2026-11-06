---
phase: 54-steam-library-without-an-authenticated-cm-session-at-launch
plan: 05
subsystem: steam
tags: [steam, depot, cm-session, lease, shared-redist, lastowner]
requires: [54-03]
provides:
  - "buildDepotPlan and downloadSelectedDepotFiles hold an authenticated lease, released in finally"
  - "downloadSharedRedistDepots / installSteamBridgeSharedRedists accept allowLogon (install only)"
  - "finalizeToSteam writes LastOwner from the persisted SteamID"
affects: [54-08, 54-09, 54-10]
tech-stack:
  added: []
  patterns: ["lease-held wrapper around an unindented leased body (buildDepotPlanLeased, downloadSharedRedistDepotsLeased)"]
key-files:
  created:
    - src/backend/storeManagers/steam/__tests__/depotLeaseMocks.ts
  modified:
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
    - src/backend/storeManagers/steam/__tests__/depot.test.ts
    - src/backend/storeManagers/steam/__tests__/depot.finalize.test.ts
    - src/backend/storeManagers/steam/__tests__/depot.prescreen.test.ts
    - src/backend/storeManagers/steam/__tests__/depot.selectedFiles.test.ts
    - src/backend/storeManagers/steam/__tests__/depotLinktarget.test.ts
    - src/backend/storeManagers/steam/__tests__/depot.sharedRedist.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts
key-decisions:
  - "Play-time shared redists reuse an open session or defer as offline; only the install path (allowLogon: true) may log on"
  - "Refused acquire keeps the 'no authenticated Steam CM connection available for appId' text with the refusal enum appended, so classifyDepotError still maps to notSignedIn"
requirements-completed: [ROADMAP-SC3, ROADMAP-SC6, P54-SC4]
duration: 45min
completed: 2026-10-27
---

# Phase 54 Plan 05: Depot path on the lease API Summary

Every depot-path authenticated use now goes through `SteamUser.acquireAuthenticated`, and Play can no longer open a CM session to fetch shared redists.

## Tasks

1. Lease-held plan building, wrapped retries, persisted LastOwner: RED `6a8d5b417`, GREEN `809f1a051`.
2. Shared redists open a session only at install time: RED `cce43f843`, GREEN `e655db64c`.

## Behaviour delivered

- `buildDepotPlan` acquires `{ reason: opts.sessionReason ?? 'user-install', guidedAction: 'install', appName }`, throws the existing not-authenticated text on refusal, and releases in `finally` on success, step error and abort. `prescreenBridgeDepots` passes `sessionReason: 'prescreen'` (new internal opt on `DownloadSteamDepotsOpts`).
- `withPlanBuildRetry` re-enters `acquireAuthenticated({ reason: 'plan-retry' })` and releases that inner lease at once.
- `downloadSelectedDepotFiles` holds an `original-restore` lease across plan and file download; a refusal flows through its existing catch to `status: 'error'`.
- `finalizeToSteam` reads `LastOwner` from `getPersistedSteamId64()`; test proves it survives a closed session and falls back to `'0'`.
- `downloadSharedRedistDepots`: without `allowLogon` it calls `acquireOpenAuthenticated('shared-redist')`, else returns `'offline'` with no logon; with it, `acquireAuthenticated({ reason: 'shared-redist', guidedAction: 'install' })`. Lease released in `finally`.
- `installSteamBridgeSharedRedists(appId, settings, signal?, opts?)` threads `allowLogon`; the inFlight dedupe is unchanged. The offline log line now says "offline or no Steam session at Play".

Recorded behaviour change: bridge titles installed before Phase 54 with an unsettled redist ledger no longer fetch shared redists at Play unless a session is already open; they defer as offline. Plan 08 must call with `allowLogon: true` at the end of a bridge install.

## Deviations from Plan

**1. Wrapper structure instead of re-indenting.** `buildDepotPlan` and `downloadSharedRedistDepots` became thin lease-holding wrappers around `buildDepotPlanLeased` / `downloadSharedRedistDepotsLeased` (the original bodies, untouched) rather than wrapping ~300 lines in `try`. Behaviour identical, diff reviewable.

**2. New test helper `__tests__/depotLeaseMocks.ts`** (not in the plan's file list) scripts the lease the way tests scripted `ensureConnected`; the ~200 existing `ensureConnected` mock lines were mechanically migrated to it.

**3. Plan-retry release assertion.** The throwing-step shared-redist test asserts every acquire is released (count equal to acquires) rather than exactly once, because the retry wrapper legitimately acquires and releases once per retry.

## Known Stubs

None.

## Deferred Issues

None new. Pre-existing sidecar failures (`installFlows`, `runnerSliceRegistration`, `testContainment`) untouched.

## Threat Flags

None. T-54-21 to T-54-24 covered: allowLogon off by default, persisted-ID string source, release in finally on every path, refusal text carries appId and enum only.

## Verification

`npx jest src/backend/storeManagers/steam`: 2964 tests green. `pnpm codecheck` green, scoped prettier green, eslint `--quiet` clean. Greps: non-comment `ensureConnected(` in depot.ts 0, `getClient()?.steamID` 0, `getPersistedSteamId64()` 1, refusal text present, `acquireOpenAuthenticated('shared-redist')` 1, `allowLogon` in sharedRedistInstall.ts 4, ledger/display-driver diff lines 0.

Note: criterion `grep -c "getPersistedSteamId64()"` is 1 as required; comment text mentioning `ensureConnected` remains in a few depot.ts doc comments (the acceptance grep excludes comments).

## Self-Check: PASSED
