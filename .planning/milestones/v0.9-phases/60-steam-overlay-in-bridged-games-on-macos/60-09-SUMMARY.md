---
phase: 60-steam-overlay-in-bridged-games-on-macos
plan: 09
subsystem: steam-bridge-overlay
tags: [overlay, launch, diagnostics, sidecar]
requires: [60-02, 60-04, 60-06, 60-08]
provides:
  - D-11 attach watch wired into fireBridgeWineLaunch
  - D-15 overlay wine log and capped overlay_shim forwarding
  - D-10 abnormal-exit notice
affects: [src/backend/storeManagers/steam/games.ts]
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
key-decisions:
  - "D-10 toggle link is a text pointer (Advanced > Steam overlay) via showEngineDialog (notify + in-app modal); an inline button would need a settings deep link that does not exist (orchestrator resolution 4)"
  - "runWineCommand resolves a numeric code, so wrapperCode is real; a missing code or a rejection is treated as unknown (abnormal)"
metrics:
  tasks: 2
  completed: 2026-11-03
---

# Phase 60 Plan 09: Overlay post-launch wiring Summary

Overlay-injected launches (TCP and DRM) now start a bounded attach watcher, copy up to 50 sanitised `overlay_shim` lines into the launch log (TCP also gets a bounded wine log under `<appFolder>/steam-bridge/overlay/trace/`), and show a one-shot message pointing at Advanced > Steam overlay when the game dies within 30 s.

## What changed

- `overlayInjected` is set only where tokens were actually applied (DRM env ok with tokens, or TCP `appendCxEnvTokens` ok). Every new behaviour is gated on it, so non-overlay launches get no watcher, no onOutput option and no D-10 check.
- Watch: `startAttachWatch` is single-shot, called from the monitor's `onFirstMatch` or, with no monitor, right after spawn. It is `void`ed (wrapped in `Promise.resolve().catch`), never awaited.
- Output: `onOutput` writes to the DRM wine log and/or overlay wine log, then the shim forwarder. The overlay log is closed in the winePromise finally. A null overlay log is tolerated.
- D-10: `maybeReportOverlayAbnormalExit` is single-shot, driven by onStopped, winePromise settle (both arms) and a 3 s `OVERLAY_EXIT_GRACE_MS` timer that is `unref`'d and cleared on decision. No retry; runWineCommand is called once.
- Tests: 14 new cases in games.test.ts ("post-launch" describe), plus the overlayPolicy mock now exposes the real `isAbnormalOverlayExit`, and new mocks for overlayAttachWatch and overlayWineLog.

## Deviations from Plan

**1. Single commit for both tasks.** Both tasks edit the same closure in fireBridgeWineLaunch and share one test describe, so they landed in one commit (`05b22464c`) instead of two.

**2. [Rule 3] Test cleanup.** The new tests arm launch deadlines (module-level registry counted by later Phase 59 tests); afterEach calls the monitor's first match to stand them down.

## Verification

- `pnpm exec jest src/backend/storeManagers/steam`: 4378 passed, 2 skipped
- `pnpm codecheck`, `pnpm smoke:sidecar`, `prettier --check`: pass
- eslint on the two files: 0 errors (warnings pre-existing)
- Known pre-existing failures (not touched): lint in meta/gen_vtables.ts, lint-translations, i18n-churn-guard.

## Known Stubs

None.

## Self-Check: PASSED

Commit 05b22464c exists; both modified files present.
