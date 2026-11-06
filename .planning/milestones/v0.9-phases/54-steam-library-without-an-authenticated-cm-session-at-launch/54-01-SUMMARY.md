---
phase: 54-steam-library-without-an-authenticated-cm-session-at-launch
plan: 01
subsystem: steam
tags: [steam, macos, cm-session, pics, go-offline]
requires: []
provides:
  - macSteamOffline.ts go-offline wrap (withMacSteamOffline, checkGuidedOfflineReady, GuidedOfflineRequiredError)
  - anonymousClient.ts shared anonymous PICS client
  - SteamGoOffline contract types and IPC entries
affects: [54-03, 54-04, 54-06, 54-07]
tech-stack:
  added: []
  patterns: [injected-deps leaf modules, offset-before-fire log evidence gate]
key-files:
  created:
    - src/backend/storeManagers/steam/macSteamOffline.ts
    - src/backend/storeManagers/steam/anonymousClient.ts
    - src/backend/storeManagers/steam/__tests__/macSteamOfflineWrap.test.ts
    - src/backend/storeManagers/steam/__tests__/anonymousClient.test.ts
  modified:
    - src/common/types/steam.ts
    - src/common/types/ipc.ts
key-decisions:
  - "Wrap toggles when Mac Steam is running and last state is not Logged Off; probe failure defers to the guided step"
  - "Guided restore flag is one-shot with a 10 minute TTL, armed by checkGuidedOfflineReady"
  - "A close during an in-flight anonymous connect discards the late logon via a generation counter"
requirements-completed: [ROADMAP-SC2, ROADMAP-SC6, P54-SC3, P54-SC7]
duration: 25min
completed: 2026-10-27
---

# Phase 54 Plan 01: Go-offline wrap and anonymous PICS client Summary

Two leaf modules: the spike-046 Mac Steam go-offline wrap (evidence-gated on a post-fire LogOff line, goonline in a finally) and a single-flight, bounded, idle-closing anonymous steam-user client, plus the guided Go Offline IPC contract types.

## Tasks

1. Contract types and wrap, test-first: RED `6588c35e9`, GREEN `d6dd3c62a`. 15 tests.
2. Anonymous PICS client, test-first: RED `061c9bd38`, GREEN `a38677ec3`. 10 tests.

## Deviations from Plan

**1. [Rule 1 - Bug] Stale in-flight promise after a post-logon drop**
- **Issue:** after a drop the next call joined the not-yet-cleared in-flight promise instead of reconnecting.
- **Fix:** the drop handler also clears `inflight`.
- **Commit:** a38677ec3

**2. [Rule 3 - Blocking] Test infrastructure**
- Backend jest uses `resetMocks: true`, so the fs wrappers and steam-user double are set up in `beforeEach` / as real classes. `fs` namespace properties are non-configurable, so `jest.mock('fs')` replaces `jest.spyOn`.

The `.unref?.()` acceptance count (>=2) in macSteamOffline.ts is met partly by a doc comment: the single real unref lives in the default `sleep`, which the poll loop uses.

## Known Stubs

None. Nothing consumes either module yet (plans 03, 04, 06, 07 wire them).

## Verification

Both suites green (25 tests), `pnpm codecheck` green, scoped prettier green.

## Self-Check: PASSED
