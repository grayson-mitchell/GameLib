---
phase: 54-steam-library-without-an-authenticated-cm-session-at-launch
plan: 08
subsystem: steam
tags: [steam, cm-session, lease, install, bridge, go-offline]
requires: [54-04, 54-05, 54-06]
provides:
  - "getExtraInfo and Play open no CM session"
  - "native and bridge installs hold one wrapped lease each, released in finally"
  - "go-offline refusal maps to { status: 'done', deferredToSetup: true }"
  - "bridge install fetches shared redists with allowLogon: true"
  - "Refresh backfills bridge launch targets on its held lease"
affects: [54-09, 54-10]
tech-stack:
  added: []
  patterns: ["lease-held split method (runNativeDepotDownloadLeased, installBridgeGameLeased)"]
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/__tests__/steamStartupKeyringDeferral.test.ts
    - src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts
    - src/backend/storeManagers/steam/__tests__/removeCopies.test.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
key-decisions:
  - "A go-offline refusal returns deferredToSetup (the guided dialog owns the next step); other refusals return classifyDepotError's not-signed-in copy"
  - "Lease acquired before resolveSteamInstallTarget and the crash breadcrumb, so a refused install leaves no residue"
  - "Backfill runs right after the bridge installed map is built inside the lease-held try, reusing that map"
requirements-completed: [ROADMAP-SC2, ROADMAP-SC3, ROADMAP-SC6, P54-SC1, P54-SC4]
duration: 50min
completed: 2026-10-27
---

# Phase 54 Plan 08: SteamGame on the session policy Summary

The game page and Play open nothing; native and bridge installs each hold one wrapped lease; Refresh repairs missing bridge launch targets.

## Tasks

1. Game page and Play logon-free: RED `d64008c95`, GREEN `3022c7c11`.
2. Install paths hold one lease: RED `19e19d52d`, GREEN `60ebaa968`.
3. Refresh backfills launch targets: RED `136f55fe3`, GREEN `6e5314244`.

## Behaviour delivered

- `getExtraInfo()` keeps a bare `noteSteamAuthTrigger('game-page')`; the `ensureConnected()` block is gone. games.ts has no non-comment `ensureConnected(`.
- Play is unchanged in behaviour (no `allowLogon`), now pinned by a test and a comment.
- `runNativeDepotDownload`: acquires `{ reason: 'user-install', guidedAction: 'install', appName }` after the client-ready checks and before target resolution and the breadcrumb; body moved to `runNativeDepotDownloadLeased`, lease released in `finally`.
- `install()` bridge prescreen: own `prescreen` lease, released right after `setBridgeSteamApiPrescreen`; a refusal returns the refusal result before any screening.
- `installBridgeGame`: provisioning holds no lease; the rest runs in `installBridgeGameLeased` under one lease; `deferredToSetup` from the download is returned untouched; the install-time `installSteamBridgeSharedRedists(..., undefined, { allowLogon: true })` runs last, fail-soft (54-05 hand-off honoured).
- `refresh()` calls `backfillBridgeLaunchTargets(client, ids)` (54-06 hand-off honoured) with the installed bridge ids, never on the ungranted path, rejection logged only.

## Deviations from Plan

**1. [Rule 3 - structure] Split methods instead of re-indenting under try.** Same approach as 54-05. Prettier re-indented the native body, so the games.ts diff is large but mechanical.

**2. Nested leases on bridge install.** The outer bridge lease plus the native depot run's own lease are both held (two acquires, two releases); the plan's "one lease" is per layer. Test pins this.

**3. Test default lease.** The shared `beforeEach` in games.test.ts, macArchKnownFixRouting.test.ts and removeCopies.test.ts now grants a default lease (resetMocks wipes factory defaults). macArchKnownFixRouting and removeCopies also import `SteamUser`.

**4. Weaker assertions where state is not observable.** The breadcrumb is a real (unmocked) store in games.test.ts, so "no breadcrumb" is asserted via `library` entry `steamResumePending`, and ordering of acquire vs breadcrumb is covered only against `resolveSteamInstallTarget` (breadcrumb is written after it). The "no markBridgeFailedThisSession on deferral" claim has no exported reader and is verified by code inspection only (the `deferredToSetup` early return precedes it).

## Known Stubs

None.

## Deferred Issues

None new. Pre-existing sidecar failures (`installFlows`, `runnerSliceRegistration`, `testContainment`) untouched.

## Threat Flags

None. T-54-33 to T-54-36 covered.

## Verification

`npx jest src/backend/storeManagers/steam`: 76 suites, 2992 tests green. `pnpm codecheck` green, scoped prettier green, eslint `--quiet` clean. Greps: non-comment `ensureConnected(` 0, `allowLogon: true` 1, `reason: 'prescreen'` 1, `if (downloadResult.deferredToSetup) return downloadResult` 1, `backfillBridgeLaunchTargets(` in library.ts 1, SteamUser. calls inside getExtraInfo 0.

## Self-Check: PASSED
