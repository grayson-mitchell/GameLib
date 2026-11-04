---
phase: 60-steam-overlay-in-bridged-games-on-macos
plan: 13
subsystem: steam-overlay
tags: [overlay, settings, macos, g2, g3, gap-closure]
requires: [60-11]
provides:
  - OVERLAY_ATTACH_DRM_TIMEOUT_MS and a clamped timeoutMs on watchOverlayAttach
  - getSettings() merges steamOverlayOverride for bottle-eligible titles
affects: []
tech-stack:
  added: []
  patterns: [per-title override merged over shared bottle settings]
key-files:
  created:
    - .planning/todos/pending/2026-11-04-bridge-game-settings-read-write-split.md
  modified:
    - src/backend/storeManagers/steam/bridge/overlay/overlayAttachWatch.ts
    - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayAttachWatch.test.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/frontend/screens/Settings/components/__tests__/SteamOverlayOverride.test.tsx
key-decisions:
  - "DRM route gets a 30 s attach window; TCP and fallback keep 10 s; watch stays log-only (D-11)"
  - "Other split keys are recorded as a todo, not fixed: per-key authority is a design question"
requirements-completed: [G2, G3, D-11, D-02]
duration: 25min
completed: 2026-11-04
---

# Phase 60 Plan 13: G2 attach window and G3 settings read path Summary

DRM-mode overlay launches now watch for gameoverlayui for 30 s (clamped timeoutMs, log line names the real window), and reopening a bottle-eligible game's settings returns its stored `steamOverlayOverride`.

## Tasks

1. G2 attach window: commit 47c192b0e. `watchOverlayAttach` takes `timeoutMs` clamped to [1000, 60000]; games.ts passes `OVERLAY_ATTACH_DRM_TIMEOUT_MS` only when `drm` is set.
2. G3 read path: commit 5d24cb8ae. Merged in `getSettings()` via `parseOverlayOverride(readStoredOverlayOverride(appId))`, 'on'/'off' only, original object returned unchanged when nothing applies (D1 identity kept).

## G3 root cause

Write path: `setSetting` -> `applyGameSetting` -> `GameConfig.get(appId).setSetting` writes `GamesConfig/<appId>.json`.
Read path: `requestGameSettings` -> `SteamGame.getSettings()`, which for bottle-eligible titles returned `getSteamBottleSettings()` plus only `steamEngineOverride`. So `steamOverlayOverride` never came back and the frontend defaulted to Automatic.

Failing run on the unfixed code (both new tests failed):

```
-   "steamOverlayOverride": "off",
-   "steamOverlayOverride": "on",
```

The frontend isolation test (loaded `off`/`on` renders as that value) passed unfixed, so the renderer read path is sound and the defect was backend-only.

## G3 settings split audit

| Key | Written (setSetting) | Read back by getSettings | Launch read |
| --- | --- | --- | --- |
| steamOverlayOverride | title GameConfig | now merged (this plan) | readStoredOverlayOverride from title file |
| steamEngineOverride | title GameConfig | merged (59-UAT G11) | readStoredEngineOverride from title file |
| launcherArgs, alternativeExe, targetExe | title GameConfig | shared bottle/global settings | launcher.ts L145 uses game.getSettings() (shared) |
| enviromentOptions, wrapperOptions | title GameConfig | shared bottle/global | same |
| beforeLaunchScriptPath, afterLaunchScriptPath | title GameConfig | shared bottle/global | same |
| preferedLanguage, verboseLogs, showFps, showMangohud | title GameConfig | shared bottle/global | same |
| lastUsedLaunchOption | title GameConfig | shared bottle/global | launcher.ts reads via getSettings() |

The audit was done by reading code paths (getSteamBottleSettings returns global settings plus bottle name/wineVersion), not by exercising each control. Todo created: `.planning/todos/pending/2026-11-04-bridge-game-settings-read-write-split.md` (severity medium, platform macos, ready code). Not fixed here.

## Deviations from Plan

**[Rule 3 - Blocking] games.test.ts overlayPolicy mock lacked `parseOverlayOverride`.** Added it via `jest.requireActual` to the mock so getSettings can call it.

## Verification

games.test.ts (655), overlayAttachWatch tests (15), SteamOverlayOverride tests (8), `pnpm codecheck`, `pnpm planning-gates` (12/12), prettier on touched files: pass. `pnpm lint` not re-judged beyond the known repo-wide ceiling.

## Self-Check: PASSED
