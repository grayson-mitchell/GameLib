---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 21
subsystem: steam-install
tags: [steam, install, engine-fallback, crossover, gap-closure]
requires: [59-16, 59-20]
provides:
  - installBridgeGame checks sign-in first, falls back on any CrossOver create failure, runs redists on the owning engine
affects: [src/backend/storeManagers/steam/games.ts]
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/utils/aborthandler/aborthandler.ts
decisions:
  - "G2: the auth lease is held across provisioning (acquireAuthenticated documents no restriction on lease length; only the idle timer after the last release closes the session). No non-holding pre-check was needed."
  - "Install cancel signal: an existing appId controller is reused (via new getAbortSignal) and left alone; otherwise a provisioning-scoped controller is created and deleted right after provisioning."
requirements-completed: [D-01, D-04, D-05, D-09]
duration: ~25m
completed: 2026-11-02
---

# Phase 59 Plan 21: Install ordering and engine-correct redists Summary

installBridgeGame now acquires the Steam auth lease before any engine download or bottle creation, falls back to the built-in engine on CROSSOVER_CREATE_FAILED as well as timeout/missing, runs install-time redists on the engine that owns the bottle, and stops before wineboot when the engine download is aborted.

## What shipped

- **G2 approach:** the auth lease is held across provisioning (one try/finally releases it on every path). The provisioning body moved to `provisionBridgeBottleForInstall`.
- **WR-02:** `CROSSOVER_CREATE_FAILED` joins the fallback condition; the warning names the code.
- **CR-02:** `resolveInstallEngineSettings` returns `buildFallbackGameSettings(bottle, engine)` for built-in-engine bottles, stock CrossOver settings for CrossOver bottles, and for an existing bottle runs `decideLaunchEngine` + `prepareBottleForEngine` (no `setEngineSelection`). Unavailable or failed prep skips the redists with a logged warning; the install completes.
- **WR-11:** `ensureBuiltInEngineForInstall(pin, signal?)` passes the signal to `ensurePinnedEngine`; an aborted download returns before `provisionBridgeBottle`. Cancel signal source: reused the existing appId controller when `hasAbortController` is true (not deleted), else the provisioning-scoped controller (deleted after provisioning).
- **WR-04:** `prefetchBridgeDrmDownloads` persists `writeBridgeModeVerdict` from `resolveBridgeMode`; CEG markers are read once, only for a steamstub exe.

## Deviations from Plan

**1. [Rule 3 - Blocking] Added `getAbortSignal(id)` export to aborthandler.ts.** Reusing an existing controller's signal needs a getter; the module exposed only `hasAbortController`. Small additive export (not in the plan's files_modified).

**2. Tasks 1 and 2 shipped in one commit (9f6084fc8).** Both rewrite the same install function and share tests, so they were not separable cleanly.

**3. Verify substitution:** `pnpm lint` replaced by `npx eslint` over touched files (0 errors, only pre-existing warnings). `npx tsc --noEmit` and `tsc -p tsconfig.meta.json --noEmit` (codecheck) are clean. One existing test ("provisioning holds none") was updated to the new lease-first contract.

## Verification

games.test.ts 554 passed; aborthandler tests 11 passed; prettier applied to all three files.

## Known Stubs

None.

## Self-Check: PASSED
Commit 9f6084fc8 exists; files modified as listed.
