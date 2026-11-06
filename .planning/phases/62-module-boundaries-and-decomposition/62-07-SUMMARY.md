---
phase: 62-module-boundaries-and-decomposition
plan: 07
subsystem: backend/storeManagers/steam
tags: [refactor, mechanical-lift, decomposition, games.ts, launch]
requires: ["62-06"]
provides:
  - steam/gameLaunchOverlay.ts (7 overlay methods as free functions taking steamGame)
  - steam/gameBridgeLaunch.ts (launchBridgeGame, runBridgeLaunch, launchBridgeGameBody, fireBridgeWineLaunch)
  - steam/gameLaunch.ts (11 core launch methods)
affects: [62-08]
key-files:
  created:
    - src/backend/storeManagers/steam/gameLaunchOverlay.ts
    - src/backend/storeManagers/steam/gameBridgeLaunch.ts
    - src/backend/storeManagers/steam/gameLaunch.ts
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
key-decisions:
  - "OVERLAY_INPUT_FIX_CODE/ROUTES and OVERLAY_EXIT_GRACE_MS moved into the modules that are their only users (L6b free-symbol stop resolved at the source, not by a runtime import back into games.ts)."
metrics:
  tasks: 2
  commits: 3
  completed: 2026-11-06
---

# Phase 62 Plan 07: Launch cluster lifts Summary

Overlay (7), bridge launch (4) and core launch (11) method clusters left SteamGame via the 62-06 mechanical `this` -> `steamGame` lift using the same scratchpad `lift.cjs`; each keeps a non-async delegating stub.

## Commits

| Commit | What |
| ------ | ---- |
| eeebf5af7 | overlay -> gameLaunchOverlay.ts (356 lines) |
| e2ce07c25 | bridge launch -> gameBridgeLaunch.ts (1,134 lines) |
| 81a5e1bef | core launch -> gameLaunch.ts (837 lines) |

`games.ts`: 4,666 -> 2,617 lines.

## Deviations from Plan

**1. [Rule 3] Free module consts moved with their users.** The lift script's L6b check stopped on `OVERLAY_INPUT_FIX_CODE`, `OVERLAY_INPUT_FIX_ROUTES` (overlay) and `OVERLAY_EXIT_GRACE_MS` (bridge). Each had no other consumer in games.ts, so the declarations moved into the new module.

**2. [Rule 3] games.test.ts source scan repointed.** The "en/gamelib.json holds the 11 keys" case reads source text for the `gamelib:steam.bridge.drm.title/detail` t() defaults, which moved to `gameLaunch.ts`; the file list now includes it (2-line change, same precedent as 62-05 for gameDrmLaunch.ts). No behavioral test changed.

**3. Plan criteria not met as written.**
- "games.ts under 2,000 lines": actual 2,617. The plan estimate (~2,240 lines for the cluster) counted gaps/JSDoc that stay with stubs; same overestimate as 62-06. Further reduction belongs to the remaining clusters (62-08).
- "`steamGame.launchDrmModeGame(` in gameLaunch.ts >= 1": the call to `launchDrmModeGame` lives in `fireBridgeWineLaunch`, so it is in `gameBridgeLaunch.ts` (1 hit) via the stub, which is what keeps the prototype spy intercepting. gameLaunch.ts only defines it.

## De-`private`d members (L4, for 62-08 re-narrowing todo)

Core launch commit: `showEngineDialog`, `launchBridgeGame`. Bridge commit: `maybeNotifyBridgeLimited`, `maybeNotifyDrmModeFailed`, `sendLaunchDone`, `notifyCrossoverRequired`, `selectLaunchEngine`, `onBridgeLaunchDeadline`, `readLaunchExeCegMarkers`, `launchDrmModeGame`, `prepareTcpOverlay`, `runBridgeLaunch`, `launchBridgeGameBody`, `fireBridgeWineLaunch`. Overlay commit: `resolveLaunchOverlay`, `notifyOverlaySetupFailed`, `overlayInputLine`, `overlayInputArg`, `logOverlayInputOutcome`, `overlayProbeArg`.

## Verification

- `pnpm codecheck` green; `pnpm lint` 0 errors; `pnpm boundaries` green (16 known, ratchet 136/65); `pnpm find-deadcode` 44/0; prettier clean.
- No new module imports another split module except type-only `./games` and the already-existing `gameDrmLaunch`/`gameSessionState`/`gameProtocolUrl` leaves; none import gameInstall/gameEligibility/gameLaunchOverlay.
- `logSecretGate` green. Backend jest: only the 4 pre-existing baseline failures in the Backend project; full-suite result below.

## Cleanup candidates (62-08)

- Re-narrow `private` on the de-privated members above.
- Stale "games.ts" references in lifted comments.

## Threat Flags

None. Bodies moved with only `this` -> `steamGame` substitution.

## Self-Check: PASSED

gameLaunchOverlay.ts, gameBridgeLaunch.ts, gameLaunch.ts exist; commits eeebf5af7, e2ce07c25, 81a5e1bef in git log.
