---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 03
subsystem: steam-cm
tags: [steam, feature-flags, logonid]
requires: []
provides: [steamCmImpl, steamCmSignInImpl, getOrCreateCmLogonId]
affects: [79-18, 79-25, 79-41]
key-files:
  created:
    - src/backend/storeManagers/steam/cm/steamCmFlags.ts
    - src/backend/storeManagers/steam/cm/cmLogonId.ts
    - src/backend/storeManagers/steam/cm/__tests__/steamCmFlags.test.ts
    - src/backend/storeManagers/steam/cm/__tests__/cmLogonId.test.ts
  modified:
    - src/common/types/typed_store.ts
    - src/backend/jest.setupContainment.ts
decisions:
  - "Both flags default to ts; Jest pins both to ts via ??= until plan 79-41"
  - "cmLogonId stored in steamConfigStore, not in the renderer-readable policy list"
requirements-completed: [D-18]
duration: 10min
completed: 2026-11-15
---

# Phase 79 Plan 03: CM flags and logonID Summary

Env-only `GAMELIB_STEAMCM_CM` and `GAMELIB_STEAMCM_SIGNIN` flags (rust|ts, default ts, call-time read) plus a persisted per-install non-zero `cmLogonId` for steam-user.

## Tasks
1. Flags and Jest pin: commit in git log "feat(79-03): add GAMELIB_STEAMCM_CM/SIGNIN flags..."
2. Persisted logonID: commit "feat(79-03): persisted per-install CM logonID"

## Deviations from Plan
None. The pin uses `??=` (as in the 75 pin) so tests may override it.

## Verification
Jest (cm tests, src/common), tsc and prettier all pass. No GAMELIB_STEAMCM reference in frontend or common.

## Self-Check: PASSED
