---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 19
subsystem: bridge-drm-routing
tags: [gap-closure, D-12, D-13, D-17, drm-mode]
requires: []
provides:
  - "detectLaunchDrmWrapper(bottleDir, exePath) -> { drmWrapper, drmExe } (UE-aware SteamStub resolver)"
  - "Gap 2 closed by 939ed1618 (landed before this plan executed)"
  - "Gap 11 todo"
affects: [56-21, 56-26]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/drm/drmScanExe.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/drmScanExe.test.ts
    - .planning/todos/pending/2026-10-28-ranch-simulator-not-routed-to-drm-mode.md
  modified: []
decisions:
  - "D-12 reading: a UE title's Shipping exe counts as part of the launch exe's scan; no allowlist, no per-title override"
metrics:
  duration: "10m"
  completed: 2026-10-29
requirements: [D-12, D-13, D-17]
---

# Phase 56 Plan 19: Route notice + UE-aware DRM resolver Summary

Task 1 was already delivered by quick task `939ed1618` (with tests in `88597aedd`); Task 2 added a pure resolver that reports Ranch-style UE titles as SteamStub via their Shipping exe.

## Tasks

1. Route notice consults DRM routing (Gap 2): no new code. `bridgeRoute.ts` row 7 already imports `resolveBridgeMode` and sets `noticeRequired: false` for a DRM-mode miss; `bridgeRoute.test.ts` covers steamstub miss, Grim Dawn shape, and known-bad carried. The existing non-DRM line is kept. CEG precedence is held by earlier rows (row 4) rather than a CEG-marker arg (row 7 passes `undefined`), which is equivalent.
2. UE-aware resolver and Ranch todo (commit `0680ff754`): `detectLaunchDrmWrapper` scans the launch exe, then each Shipping exe from `findUnrealLayout`, requiring `realpath` containment in the bottle (T-56-19-01). Never throws. Six tests pass. Todo carries severity/platform/ready frontmatter; `pnpm planning-gates` 12/12.

## Deviations from Plan

- [Already done] Task 1 landed in `939ed1618`/`88597aedd` before execution; not redone. The plan's two extra cases (userRoute 'bridge', knownFixDrm 'ceg' with steamstub) were not added as new tests; those paths are untouched rows 4-6.

## Self-Check: PASSED
