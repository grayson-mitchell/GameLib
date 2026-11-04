---
phase: quick-261105-ast
plan: 01
subsystem: steam-engine-notices
tags: [toast, overlay, steam, i18n]
status: implemented-unverified-live
key-files:
  modified:
    - src/common/types/steam.ts
    - src/backend/storeManagers/steam/engine/engineState.ts
    - src/backend/storeManagers/steam/engine/__tests__/engineState.test.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - public/locales/en/gamelib.json
    - src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx
    - src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx
metrics:
  completed: 2026-11-05
---

# Quick 261105-ast: Overlay early-exit notice as an in-app toast

The "Game closed soon after starting" notice is now a non-blocking toast in the SteamEngineLaunchNotice stack, fed by a new `exitNotice` push, instead of a modal dialog that raised the main window.

## Commits
- e56c7d81d: backend (exitNotice field, publishOverlayExitNotice, games.ts swap, en body)
- 1962f8ee0: frontend third toast slot + tests

## What changed
- `publishOverlayExitNotice(appId)` mirrors publishOverlayNotice, shared seq counter.
- `maybeReportOverlayAbnormalExit`: keeps detection and the `[bridge-notice]` warning; now push + logInfo `pushed=` + OS `notify`. No dialog, no `raiseMainWindow`.
- en body: "The game exited within 30 seconds with the Steam overlay on. If this is a crash and keeps happening, try turning the overlay off in this game's settings: Run > Steam overlay." (catalog and defaultValues). i18n baseline untouched.
- Frontend: third independent stream, own waiting latch (frozen until GameLib visible+focused, then 8 s), hover pause, dismiss, once per seq, rendered first in the region.

## Deviations
- [Rule 3] Added three `eslint-disable-next-line react-hooks/exhaustive-deps` comments in the component for the new hooks, matching the sibling streams' deliberate dependency keys, so the change adds no new lint warnings.

## Gate results
- Backend jest (engineState, games, overlayNotice): 3 suites, 731 tests passed.
- Frontend jest (component + hardcodedStringGate + i18nParserConfig + genI18nGateScope): 4 suites passed, 233 passed, 1 skipped.
- `tsc --noEmit`: exit 0 (both tasks). Scoped prettier: exit 0.
- `pnpm lint`: exit 1, 0 errors, but over the warning cap in both lanes (src 1135 vs max 1130; tests 665 vs max 661). Not caused by this change: per-file warning counts for touched files are unchanged or lower than HEAD~1 (games.ts 79 -> 78, others equal; component hook warnings back to the original 5). The cap overrun is pre-existing/unrelated drift.

## Operator live check (not yet done)
1. Restart `pnpm tauri:dev` (dev does not rebuild the sidecar; confirm sidecar.js mtime).
2. Launch a bridged game with the Steam overlay on, quit it within 30 s.
3. Expect the toast with the new wording and no dialog or window raise. `tauri dev` delivers no system notification; that half is only observable in a packaged build.

## Self-Check: PASSED
Both commits exist; listed files present; only explicit paths staged.
