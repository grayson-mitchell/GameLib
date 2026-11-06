---
phase: 60-steam-overlay-in-bridged-games-on-macos
plan: 02
subsystem: steam-bridge
tags: [overlay, macos, known-fixes, policy, fail-open]
requires: []
provides:
  - GameSettings.steamOverlayOverride tri-state (D-02)
  - tier-1 known-fix key steamGameOverlay, accepts only "off" (D-03)
  - overlayPolicy (resolveOverlayEnabled, readStoredOverlayOverride, isAbnormalOverlayExit)
  - overlayNotice (OverlayStep, overlayStepError, formatOverlayNoticeLine, OVERLAY_STEP_TEXT)
  - overlayPaths (buildOverlayPaths)
affects: [60-05, 60-06, 60-07, 60-08, 60-09]
tech-stack:
  added: []
  patterns: [mirror of DRM notice/paths modules, direct config-file read at launch]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/overlay/overlayPolicy.ts
    - src/backend/storeManagers/steam/bridge/overlay/overlayNotice.ts
    - src/backend/storeManagers/steam/bridge/overlay/overlayPaths.ts
    - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayPolicy.test.ts
    - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayNotice.test.ts
    - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayPaths.test.ts
    - src/backend/__tests__/knownFixesOverlay.test.ts
  modified:
    - src/common/types.ts
    - src/backend/knownFixes.ts
key-decisions:
  - "steamGameOverlay is a fix, not a routing key (not in TIER1_ROUTING_KEYS)"
  - "OVERLAY_ABNORMAL_EXIT_WINDOW_MS = 30000"
requirements-completed: [D-01, D-02, D-03, D-08, D-10]
duration: 12min
completed: 2026-11-02
---

# Phase 60 Plan 02: Overlay policy, notice and path foundations Summary

Pure, tested contracts for overlay precedence (default on; user beats known fix both ways), the launch-time per-game reader, the fail-open step/notice line, the D-10 abnormal-exit predicate and the sibling `steam-bridge/overlay/` path module, plus the tier-1 `steamGameOverlay: "off"` known-fix key.

## Commits
- 76b11637a: setting type and known-fix key
- d3f7775fd: overlayPolicy
- 49a19f8cb: overlayNotice and overlayPaths

## Deviations from Plan

- knownFixReportDrift.test.ts did not pin the tier-1 key list, so it was left unchanged.
- Behavior Test 4 (tier-2 profile rejects the key) is covered indirectly: `filterTier2Profile` is unexported, so the test asserts the key is in TIER1_KNOWN_FIX_KEYS, which makes the tier-2 filter reject it.

Otherwise none. `pnpm codecheck`, eslint, prettier and all targeted jest suites (93 tests) pass. `pnpm lint` was run as eslint scoped to the touched paths only.

## Known Stubs
None.

## Self-Check: PASSED
