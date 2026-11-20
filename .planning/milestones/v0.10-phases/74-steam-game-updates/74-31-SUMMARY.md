---
phase: 74-steam-game-updates
plan: 31
subsystem: steam-library
tags: [steam, library, signed-out, update-detection, gap-closure]
requires: []
provides:
  - restoreLocalSteamLibrary(deps, opts?) cache seed plus install-state reconcile
affects: [steam update detection, signed-out Steam library]
tech-stack:
  added: []
  patterns: [restore cached library on every non-sync exit]
key-files:
  created:
    - src/backend/storeManagers/steam/library/localLibrary.ts
    - src/backend/storeManagers/steam/__tests__/library.localLibrary.test.ts
  modified:
    - src/backend/storeManagers/steam/library/refresh.ts
    - src/backend/storeManagers/steam/__tests__/library.refresh.test.ts
key-decisions:
  - "Seed from the persisted sync cache, not ACF enumeration (avoids Steamworks redistributables)"
requirements-completed: [STEAM-01, STEAM-02]
duration: 20min
completed: 2026-11-13
---

# Phase 74 Plan 31: Restore local Steam library on non-sync exits Summary

Every `refresh()` exit that does not sync (no open session, go-offline-required, lease refused, no steamID, getUserOwnedApps failure) now seeds the backend library map from the cached library and reconciles install state from local ACFs, so a signed-out boot gives `detectSteamUpdates` a non-empty installed set. No CM logon, timer or handle is added.

## Tasks

1. restoreLocalSteamLibrary helper with six unit tests (commit 0c6bc7cde).
2. Wired into all five exits in refresh.ts; six UAT 23 tests added (commit 3ed84907c).

RED evidence (Task 2, before wiring): 5 of 6 new tests failed (not-signed-in, logon-rejected/go-offline, ungranted, no-steamID, installed-entry-in-map); the owned-apps-failed case passed because that path already pushed the cache.

## Deviations from Plan

- [Rule 3] Added `library.clear()` to the main describe's `beforeEach` in library.refresh.test.ts: the shared map leaked between tests and the new helper (which seeds only an empty map) exposed it.
- Existing "exit path 2" test fixture gained `is_installed: false` on its cached games so the follow-up reconcile does not re-push them; emit expectations unchanged.
- Task 1 RED was not committed separately (tests and helper in one commit); the module-missing RED is trivial. Task 2 RED was captured as above.
- Helper tests mock `../library/refresh` (refreshInstallState) rather than the ACF builders; the ACF flip is covered end to end in library.refresh.test.ts. The import cycle refresh.ts <-> localLibrary.ts is runtime-only and passes jest, tsc, knip.

## Verification

jest steam suites green except 2 pre-existing shimGenerate/steam_api.def failures (unrelated, native/steam-bridge/generated missing). tsc, lint (0 errors), find-deadcode, steam-line-ceiling, smoke:sidecar pass; prettier clean.

## Self-Check: PASSED
