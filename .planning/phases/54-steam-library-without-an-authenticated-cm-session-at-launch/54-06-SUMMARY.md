---
phase: 54-steam-library-without-an-authenticated-cm-session-at-launch
plan: 06
subsystem: steam
tags: [steam, pics, anonymous, install-location, bridge, launch-target]
requires: [54-01, 54-03]
provides:
  - "fetchInstalldir reads PICS anonymously, falls back to an already-open session, never logs on"
  - "resolveBridgeLaunchExe: anonymous -> open session -> persisted bridge.launchTarget"
  - "setBridgeLaunchTarget and the zod-declared launchTarget field"
  - "backfillBridgeLaunchTargets(client, appIds) for 54-08 to call from Refresh"
affects: [54-08, 54-09, 54-10]
tech-stack:
  added: []
  patterns: ["anonymous-first PICS with acquireOpenAuthenticated fallback", "persisted raw record re-sanitized on read"]
key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/installLocation.ts
    - src/backend/storeManagers/steam/bridge/launchTarget.ts
    - src/backend/storeManagers/steam/bridge/bridgeVerdict.ts
    - src/backend/storeManagers/steam/electronStores.ts
    - src/backend/storeManagers/steam/__tests__/installLocation.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/launchTarget.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/bridgeVerdict.test.ts
key-decisions:
  - "Persisted record stores raw PICS executable and installdir; the absolute path is rebuilt through sanitizeInstalldir on every read, so a tampered record cannot escape the steamapps dir"
  - "A launch target is recorded only from a PICS answer (anonymous or session), never re-recorded from the stored record"
requirements-completed: [ROADMAP-SC2, P54-SC1, P54-SC3]
duration: 30min
completed: 2026-10-27
---

# Phase 54 Plan 06: Install location and launch target on the anonymous session Summary

The two single-app PICS reads (installdir, bridge Windows launch exe) now go over the anonymous client and cannot log on or sign Mac Steam's Friends session out; license-gated apps degrade through an open session and then a persisted launch record.

## Tasks

1. `fetchInstalldir` anonymous-first with open-session fallback: RED `ca56c82db`, GREEN `1189671f4`.
2. `resolveBridgeLaunchExe` anonymous-first, persisted `launchTarget`, `backfillBridgeLaunchTargets`: RED `5c4c7f812`, GREEN `a46b2e195`.

## Behaviour delivered

- Both lookups: `getAnonymousPicsClient` bounded by `STEAM_INSTALLDIR_CONNECT_TIMEOUT_MS`; a `public_only` answer, reject, timeout or null client falls to `SteamUser.acquireOpenAuthenticated('user-install')` (released in `finally`), which never logs on.
- `fetchInstalldir` with neither returns `undefined` (the `app_<appid>` name follows); `resolveBridgeLaunchExe` then reads `readBridgeVerdict(appId)?.launchTarget`.
- `sanitizeInstalldir` runs on every source, so a stored `../../escape` installdir yields `undefined`, not a throw.
- A PICS answer with executable and installdir is persisted by `setBridgeLaunchTarget` (length 1-512, numeric appId, write-if-changed).
- `backfillBridgeLaunchTargets` makes one bulk call bounded by `STEAM_PICS_BULK_TIMEOUT_MS`, skips apps with a record, filters non-numeric ids, never throws. Plan 54-08 must wire it into `refresh()`.

## Deviations from Plan

None. Existing test cases that scripted `getClient`/`ensureConnected` were migrated mechanically to `getAnonymousPicsClient`; the cold-session and ensureConnected-fails cases were rewritten to assert no `ensureConnected` call.

## Known Stubs

None.

## Deferred Issues

None new. Pre-existing sidecar failures (`installFlows`, `runnerSliceRegistration`, `testContainment`) untouched.

## Threat Flags

None. T-54-25 to T-54-28 covered: zod-bounded record, containment on every read, no `ensureConnected(` or `acquireAuthenticated(` in either file (grep 0), connects bounded.

## Verification

`npx jest src/backend/storeManagers/steam`: 2979 tests green. `pnpm codecheck` green, scoped prettier green, eslint `--quiet` clean. Greps: `getAnonymousPicsClient('installdir')` 1, `getAnonymousPicsClient('launch-target')` 1, `launchTarget: z` 1, `export async function backfillBridgeLaunchTargets` 1, non-comment `ensureConnected(`/`acquireAuthenticated(` in both files 0.

## Self-Check: PASSED
