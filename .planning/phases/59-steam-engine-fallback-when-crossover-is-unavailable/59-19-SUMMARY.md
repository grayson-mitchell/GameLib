---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 19
subsystem: frontend
tags: [steam, engine-fallback, gap-closure, notice]
requires: [59-15, 59-17]
provides:
  - SteamEngineLaunchNotice (app-level in-app fallback notice)
  - Visible reason text on the built-in engine badge
key-files:
  created:
    - src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx
    - src/frontend/components/UI/SteamEngineLaunchNotice/index.scss
    - src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx
  modified:
    - src/frontend/screens/Game/GamePage/components/EngineBadge.tsx
    - src/frontend/screens/Game/GamePage/components/__tests__/EngineBadge.test.tsx
    - src/frontend/screens/Game/GamePage/index.css
    - src/frontend/App.tsx
decisions:
  - "Notice acquires store-embed suppression while visible (like HumbleExpiryToast) so the native embed cannot cover it"
  - "Shown once per launchNotice.seq via a highest-seq ref; page re-fetches (launchNotice null) never re-show it"
metrics:
  completed: 2026-11-02
  tasks: 2
requirements: [D-06]
---

# Phase 59 Plan 19: In-app fallback notice Summary

A launch that drops to the built-in engine now announces the reason inside the app (dismissible, 8 s auto-hide, role=status), and the badge shows the reason as visible text.

## Tasks

1. Badge reason as visible text: commit 7651a60fb.
2. SteamEngineLaunchNotice mounted after HumbleExpiryToast in App.tsx: commit 3931a231d. Tests use a minimal hand-rolled hook runtime (no jsdom), 7 cases covering each behavior bullet plus unknown reason (T-59-72).

## Deviations from Plan

- [Rule 2] Added `useSuppressStoreEmbedWhile` so the native embed does not hide the notice.
- `pnpm lint` was not run to completion (known pre-existing meta/gen_vtables.ts error); `npx eslint` on touched files has 0 errors. `pnpm codecheck` passes.

## Self-Check: PASSED
