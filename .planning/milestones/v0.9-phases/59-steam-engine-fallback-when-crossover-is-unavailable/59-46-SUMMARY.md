---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 46
subsystem: steam-launch
tags: [bridge-launch, in-flight-guard, gap-closure, G26]
requires: []
provides:
  - "Per-appId bridgeLaunchesInFlight guard; a second Play joins the in-flight launch"
  - "steam.bridge.alreadyLaunching catalogue key"
affects: [src/backend/storeManagers/steam/games.ts]
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - public/locales/en/gamelib.json
requirements-completed: [G26]
completed: 2026-11-03
---

# Phase 59 Plan 46: G26 concurrent bridge launches Summary

A second Play of the same appId during bridge pre-flight now joins the in-flight launch and shows a non-modal "already starting" notice, so only one engine switch touches the bottle at a time.

## What changed

- `bridgeLaunchesInFlight` (module-level `Map<string, Promise<boolean>>`) next to `nativeInstallsInFlight`. The entry is set synchronously before any await.
- `launchBridgeGame()` is now a thin wrapper: if an entry exists it logs `bridge launch already in progress`, calls `notify()` with the game title and the new key, and returns the existing promise. Otherwise it runs `runBridgeLaunch()` (the old body, unchanged, including the owner-only `clearEngineSelection`) and releases the entry in a `finally` only if it is still the owner's.
- The join path never opens a modal, never marks the bridge failed and never sends steamBridgeSetupRequired.
- Catalogue key `steam.bridge.alreadyLaunching` added (gamelib.json only; translation.json untouched).
- Default decision (join + notify) is as stated in the plan; override by returning `false` silently or dropping the notify call.

## Verification

- 6 `G26:` tests (single body run, log + one notify and no modal, release on resolve, reject for both callers and release, owner-only clear on false, different appIds independent). games.test.ts: 639 passed.
- prettier, eslint (0 errors, pre-existing warnings), `pnpm codecheck`, `pnpm smoke:sidecar` all exit 0.

## Deviations from Plan

None - plan executed exactly as written. (Prettier check on gamelib.json skipped as the plan notes it is prettier-ignored.)

## Commits

- 86118d41b: fix(59-46): one bridge launch per appId (G26)

## Self-Check: PASSED
