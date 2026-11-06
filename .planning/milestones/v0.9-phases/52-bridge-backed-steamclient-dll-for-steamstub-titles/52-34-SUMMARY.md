---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 34
subsystem: steam-bridge
tags: [steamstub, notify, forwarder]
requires: [52-33]
provides:
  - "maybeNotifySteamStubForwarded: honest notice on the forwarded SteamStub path"
affects: []
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
decisions:
  - "Trigger is deterministic (steamstub + forwarder placed), not a detected rejection"
  - "Separate session gate from the unforwarded notice"
metrics:
  completed: 2026-10-24
---

# Phase 52 Plan 34: Forwarded SteamStub notice Summary

On `forwarder.status === 'placed'` for a steamstub title, launchBridgeGame now logs `[bridge-notice] ... steamstub-forwarded:launch-check-unsatisfiable` every launch and notifies once per title per session using the 52-33 strings, then launches through the bridge unchanged.

## Commits
- 76b9d1deb: RED tests (3 failing cases: changed placed-path test, once-per-session, separate gates)
- 09a48a2e6: implementation (GREEN)

## Verification
- steam backend jest: 60 suites, 2313 tests pass. `pnpm codecheck` clean. eslint 0 errors (warnings pre-existing). prettier clean.
- Only games.ts and games.test.ts changed; nothing under native/, meta/ or steam/bridge/.
- The old `expect(notify).not.toHaveBeenCalled()` on the placed path was replaced, as the plan directs.

## Notice scope
- The notice is predictive and pre-emptive: it fires before the stub runs, on known state, and is not a detected rejection.
- It rests on one measured title (Grim Dawn 219990, 52-UAT items 24 and 27-29); generalisation to other SteamStub titles is an inference.
- The image-name caveat is not ruled out: 52-30's pid anchor was a non-Steam image (notepad.exe) and neither arm showed an image-name query.

## Deviations from Plan
None - plan executed exactly as written.

## Self-Check: PASSED
