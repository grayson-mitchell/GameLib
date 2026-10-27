---
phase: 54-steam-library-without-an-authenticated-cm-session-at-launch
plan: 07
subsystem: frontend
tags: [steam, macos, go-offline, dialog, ipc, zustand]
requires: [54-01, 54-02, 54-03]
provides:
  - "steamGoOfflineRetry invoke (sidecar-only) and handleSteamGoOfflineRequired push slot"
  - "useSteamGoOfflineNotice store + handleSteamGoOfflineRequiredSignal"
  - "SteamGoOfflineNotice dialog mounted in App.tsx"
affects: [54-09]
key-files:
  created:
    - src/frontend/state/SteamGoOfflineNotice.ts
    - src/frontend/state/__tests__/SteamGoOfflineNotice.test.ts
    - src/frontend/screens/Game/GamePage/components/SteamGoOfflineNotice.tsx
  modified:
    - src/backend/sidecar/steamAuthFlowRegistration.ts
    - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
    - src/preload/api/steam.ts
    - src/frontend/state/GlobalState.tsx
    - src/frontend/App.tsx
    - .planning/IPC-PORT-INVENTORY.md
key-decisions:
  - "Continue never logs on: it calls checkGuidedOfflineReady and re-runs the blocked action only on 'ready'"
  - "A second push while open replaces the payload and resets status to idle (latest action wins)"
  - "Redeem is not auto re-run: the dialog shows the redeem-again message and leaves only Cancel"
requirements-completed: [ROADMAP-SC6]
duration: 20min
completed: 2026-10-27
---

# Phase 54 Plan 07: Guided Go Offline dialog Summary

Backend-pushed `steamGoOfflineRequired` opens a dialog telling the user to choose Steam > Go Offline and press Continue; Continue asks the sidecar (`steamGoOfflineRetry`) whether Mac Steam reads Logged Off and only then re-runs the blocked refresh or install.

## Tasks

1. IPC wiring and store, test-first: RED `ce6b1ec8e` is not recorded by hash here; see `git log --grep "54-07"`. GREEN `c22c12961`. Store and census tests green (census 22/1).
2. Dialog, GlobalState registration, App mount: see `git log --grep "54-07"` (`feat(54-07): guided Go Offline dialog`).

## Behaviour

- Continue: `still-online` keeps the dialog open with the still-online line and dispatches nothing; `not-macos` closes; `ready` runs refresh via `refreshLibrary({ library: 'steam', origin: 'steam-go-offline-retry', runInBackground: true })`, install via `getGameInfo` + `installSteamGame`, redeem shows the redeem-again line.
- Cancel is always enabled and dispatches nothing. A rejection returns to idle with the `steam.goOffline.error` text. No copy promises Friends will recover (grep for "recover" is 0).
- `.planning/IPC-PORT-INVENTORY.md` totals raised 227 to 228 unique and 72 to 73 ported.

## Deviations from Plan

None in behaviour. The RED commit hash was not copied into this summary; the commit exists under the `54-07` prefix.

## Verification

Store and census jest green (77 tests), `src/frontend/state` project 247 tests green, `pnpm codecheck` green, scoped prettier green, eslint on touched files 0 errors (pre-existing warnings in GlobalState.tsx), `pnpm lint-translations:gamelib` 0 hard failures. Full `pnpm lint` was started but exceeded the shell timeout, so scoped eslint stands in for it. Not exercised live: the dialog has not been driven in a running app.

## Known Stubs

None.

## Self-Check: PASSED
