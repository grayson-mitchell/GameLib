---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 09
subsystem: steam-bridge
tags: [steamstub, launch, notice, i18n]
requires: [52-06, 52-08]
provides:
  - SteamStub forwarder setup step in launchBridgeGame
  - maybeNotifySteamStubUnforwarded (log every time, notify once per title per session)
affects: [52-10]
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
key-decisions:
  - "Notice gate is a module-level session Set, not a persisted flag, so a still-broken title is re-announced next session"
  - "drmWrapper resolved as result.drmWrapper ?? fresh verdict ?? persisted scan, so already-placed no-op launches still set up"
metrics:
  tasks: 2
  completed: 2026-10-24
---

# Phase 52 Plan 09: SteamStub launch wiring Summary

`launchBridgeGame` now calls `setupSteamClientForwarder` for titles flagged `drmWrapper === 'steamstub'`, after `writeBridgeConfig` and before wine, and tells the user honestly when forwarding is unavailable, without ever blocking the launch.

## What was built

- `games.ts`: import of `setupSteamClientForwarder`; `steamStubNoticeShownThisSession` set; `maybeNotifySteamStubUnforwarded(cause)` logs `[bridge-notice] appId=<id> reason=steamstub-unforwarded:<cause>` every time and calls `notify()` (keys `gamelib:steam.bridge.steamstub.title/.body`) once per title per session. Setup outcomes: `placed` logs `[bridge-steamstub] ... forwarder placed at <winPath>`; `unavailable` notifies with its reason; `error` logs a warning and notifies with `setup-error`. No breaker, no `steamBridgeSetupRequired`, no new frontend message.
- `no-steam-api` branch with steamstub: notice with cause `no-steam-api`, then the existing direct launch.
- `games.test.ts`: describe `Phase 52: SteamStub forwarder setup` (6 cases: call args and order cfg -> setup -> wine, persisted-scan fallback with arch, non-steamstub never calls setup, unavailable notifies once across two launches, error proceeds without setup-required message, no-steam-api).

## Task commits

1. Task 1: e2b0e3d26
2. Task 2: verification only, no file changes (steam backend jest 60 suites / 2276 tests green, `tsc` clean, prettier clean, `lint-translations:gamelib` 0 hard failures).

## Deviations from Plan

### Flagged (per orchestrator note)

**1. `withheld` status carries no drmWrapper.** Verified in `shimGenerate.ts`: `drmWrapper` is stamped only on placed / already-placed / placed-miss results; `withheld` has no such field (its verdict is not stamped either). A SteamStub title that is withheld goes down the existing direct-launch branch with no helper, no forwarder and no notice. The plan does not require a notice there and the `cause` union has no value for it, so I left it. Consequence: that case still gives the unexplained early exit. Follow-up if wanted: stamp drmWrapper on withheld results and add a cause.

### Auto-fixed

None. During work, one scripted edit initially landed in `installBridgeGame` (same anchor text); caught by the first test run and moved to `launchBridgeGame` before commit.

## Pre-existing issue (not caused by this plan)

`pnpm lint` exits 1: the tests-scope warning cap is exceeded ("found too many warnings (maximum: 648)", 656 warnings, 0 errors; production scope PASS). This plan added zero warnings (the two it initially introduced in games.test.ts were removed), so the base commit is already over the cap.

## Known Stubs

None.

## Self-Check: PASSED

- games.ts and games.test.ts modified, commit e2b0e3d26 present.
