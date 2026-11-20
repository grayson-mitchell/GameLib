---
phase: quick-261029-exu
plan: 01
status: complete
key-files:
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/games.ts
    - src/frontend/hooks/constants.ts
    - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
    - src/frontend/screens/DownloadManager/components/DownloadHero/index.tsx
    - src/frontend/screens/DownloadManager/components/DownloadHero/heroModel.ts
    - src/frontend/screens/DownloadManager/components/DownloadHero/index.css
    - public/locales/en/gamepage.json
  created:
    - src/frontend/hooks/__tests__/statusLabel.bridgeTail.test.ts
metrics:
  completed: 2026-10-29
---

# Quick 261029-exu: bridge install tail — one "installed", a phase label, no dead graph

- **Poller** (`library.ts`, `'installed'` branch, `source === 'bridge'`): still flips and
  persists `is_installed`, but sends `installing` / `steam-bridge-finishing`
  (`STEAM_BRIDGE_FINISHING_CONTEXT`) instead of `done`, and fires neither "Installation
  Finished" nor "Restart Steam to finish installing" (the latter was always wrong for a bridge
  game). Depot-skipped notice unchanged.
- **Installer** (`games.ts`): finishing status at the start of the tail and before the DRM
  prefetch; `done` plus the one "Installation Finished" toast in the tail's `finally`. The
  `installBridgeGame` wrapper sends `done` on any error result or throw from the leased part,
  since the poller no longer clears the status on those paths (CEG, shim failure).
- **Labels**: `getStatusLabel` gains `'drm-setup'` — missing since 261029-d7v, so a tile/card
  would have fallen back to "Not installed" — and the finishing context ("Finishing install…").
  Game page status line shows it with the 14px spinner.
- **Downloads hero**: `heroPhase()` maps `redist`, `drm-setup` and finishing to a phase; the
  bar goes indeterminate (static under reduced motion), the progress/ETA line shows the phase
  label, and the speed chart is hidden for the phase.

## Commits

- 64168d694 fix: poller/installer completion ownership, labels, hero phase, tests
- dcb7c79db fix: game-page MainButton disabled + "Finishing install…" while installed AND installing (live-test follow-up)

## Verification

- `npx jest src/backend/storeManagers/steam src/frontend`: 339 suites, 7868 pass (1 skipped).
- New tests: bridge poller flips `is_installed`, sends finishing not `done`, no toasts;
  `heroPhase` mapping; `getStatusLabel` for `drm-setup` and the finishing context.
- `pnpm codecheck` clean; prettier clean on every written path (`gamepage.json` is
  prettier-ignored, JSON-parsed instead); eslint 0 errors.

## Deviations

- Planner/executor agents skipped; orchestrator wrote plan and change inline.
- Two uncommitted files from the parallel debug session `drm-stage-winebus-hid-spin`
  (`stageDrmBottle.ts` and its test) were left untouched and not committed.

## Live test (2026-10-29 11:07-11:11, Grim Dawn reinstall)

- Log: poller flip at 11:10:32 sent no `done` and no toast; redists 11:10:56-11:11:35; DRM
  prefetch cache hit; `Finished Installation` + exactly one notify at 11:11:37. No
  restart-Steam toast. Operator: "all looks good".
- **Gap found:** the game page still showed Play right after the flip, then "Installing
  Redistributables". Cause: `MainButton.disabledPlayButtons` had `redist`/`drm-setup` but not
  `installing` — a Steam game was never `is_installed` and `installing` at once before this
  task. Fixed in dcb7c79db (regression test fails on the old button, passes on the fix). The
  library tile was already correct (`isInstalling && isSteam` is checked before `isInstalled`).

## Not verified live (after dcb7c79db)

Needs a fresh bridge install (restart tauri dev first). Expected: no Play and no toast at the
ACF flip; status "Finishing install…" → "Installing Redistributables (…)" → "Preparing Steam DRM
support (…)" (only if DRM files are not cached) → one "Installation Finished" toast with Play;
Downloads hero shows the phase text over an indeterminate bar.
