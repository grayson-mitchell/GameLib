---
phase: 62-module-boundaries-and-decomposition
plan: 14
subsystem: backend
tags: [launcher, store-hooks, boundaries, ratchet]
requires: [62-13]
provides:
  - storeLaunchHooks (Record<Runner, StoreLaunchHooks>) in src/backend/storeManagers/index.ts
affects: [62-15]
key-files:
  modified:
    - src/backend/storeManagers/index.ts
    - src/backend/launcher.ts
    - .dependency-cruiser-known-violations.json
    - meta/boundaryRatchet.cjs
    - src/backend/__tests__/launcher_launchSingleFlight.test.ts
    - src/backend/storeManagers/legendary/__tests__/epicOfflineMode.test.ts
  created:
    - src/backend/__tests__/storeLaunchHooks.test.ts
key-decisions:
  - "Hook table typed with `satisfies Record<Runner, StoreLaunchHooks>` then re-exported widened to `Record<Runner, StoreLaunchHooks>` so call sites can write `storeLaunchHooks[runner].hook?.()`"
  - "gog's 'launching' status message moved into gog's prepareLaunch hook so launcher.ts holds no gog literal"
  - "Per-store switches (wrapper env, appName index) became Record<Runner, ...> lookups; identity checks use isStore"
requirements-completed: [D-13, D-14, D-02, D-16]
completed: 2026-11-07
---

# Phase 62 Plan 14: launcher.ts through storeLaunchHooks Summary

**launcher.ts now reaches store managers only through `storeManagers/index`; all 14 runner-literal sites are gone, the launcher depcruise baseline is empty and BACKEND_CEILING dropped 65 to 51.**

## Tasks
1. Hook table plus 11-case test: `efedc33d4`
2. Repoint launcher.ts, convert sites, shrink baseline and ceiling: `95932815b`

## Deviations from Plan
- [Rule 1] The R8 source gate in `epicOfflineMode.test.ts` asserted the expired-flag read lived in launcher.ts; it moved to the hook, so the gate now asserts exactly one read inside the legendary `resolveOfflineMode` hook, none in launcher.ts, and one hook call from launcher.ts (teeth specimen retained).
- [Rule 3] `launcher_launchSingleFlight.test.ts` mock of `backend/storeManagers` gained `storeLaunchHooks: { legendary: {} }`. Assertions unchanged.
- The Steam bottle persist is now awaited through the hook (was a sync call after the dynamic import); the hook is still lazy-imported.
- `.dependency-cruiser-known-violations.json` is now `[]` (all 9 entries were launcher ones).

## Verification
codecheck, lint, boundaries (backend 51/51), find-deadcode, prettier, build:sidecar-sea and smoke:sidecar pass. Full Backend jest: only the 4 baseline failures that run in that project (games, bottle, tauriShellSource, macArchKnownFixRouting).

## Self-Check: PASSED
