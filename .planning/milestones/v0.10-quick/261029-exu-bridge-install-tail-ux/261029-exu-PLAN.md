---
phase: quick-261029-exu
plan: 01
type: quick
autonomous: true
files_modified:
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/games.ts
  - src/frontend/hooks/constants.ts
  - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
  - src/frontend/screens/DownloadManager/components/DownloadHero/index.tsx
  - src/frontend/screens/DownloadManager/components/DownloadHero/heroModel.ts
  - src/frontend/screens/DownloadManager/components/DownloadHero/index.css
  - public/locales/en/gamepage.json
  - tests for the above
---

# Quick 261029-exu: bridge install tail — one "installed", a phase label, no dead graph

## Problem (gamelib.log 2026-10-29, Grim Dawn 219990 reinstall)

- 10:37:55 depot download complete; 10:37:58 the ACF poller (source `bridge`) flipped the
  badge, sent `'done'`, fired "Installation Finished" AND "Restart Steam to finish installing"
  (the latter is wrong for a bridge game: nothing waits on a Steam restart). Play showed.
- 10:38:01-10:39:00 the install was still running: shared-redist depot + installers, then
  the DRM prefetch (261029-e2t). The game page swapped Play for a status label mid-way.
- The Downloads hero kept the finished download's 100% and a speed chart sampling 0 MB/s
  for ~65 s, reading as a stall.
- Found while mapping: `getStatusLabel` has no `'drm-setup'` entry (261029-d7v gap), so a
  tile/card would fall back to "Not installed".

## Change

1. **Poller (library.ts, `'installed'` branch):** for `source === 'bridge'` the installer owns
   completion. Still flip and persist `is_installed`, but send `status: 'installing'`,
   `context: 'steam-bridge-finishing'` instead of `'done'`, and skip both the "Installation
   Finished" and the "Restart Steam" toasts. The depot-skipped notice is unchanged.
2. **Installer (games.ts `installBridgeGameLeased`):** send the same finishing status when the
   tail starts (covers the poller landing after it) and again before the DRM prefetch (clears a
   stale redist label); in the existing `finally`, after `'done'`, fire the one "Installation
   Finished" toast.
3. **Labels:** `getStatusLabel` gains `'drm-setup'` and the `steam-bridge-finishing` context
   ("Finishing install…"); the game page status line shows it with the 14px spinner.
4. **Downloads hero:** a pure `heroPhase(status, context)` maps `redist`, `drm-setup` and
   installing+`steam-bridge-finishing` to a phase label. While a phase is active the bar is
   indeterminate, the progress/ETA line shows the phase text, and the speed chart is replaced
   by the same text.

## Tasks

### Task 1: backend completion ownership + frontend phase labels + tests

<verify>
- `npx jest src/backend/storeManagers/steam src/frontend/hooks src/frontend/screens/Game/GamePage src/frontend/screens/DownloadManager`
- `pnpm codecheck`
- `npx prettier --file-info` then `npx prettier --check` over exactly the written paths; eslint 0 errors
</verify>

<done>
A bridge install reads as installing until the installer's own `'done'`, fires exactly one
"Installation Finished" toast and no "Restart Steam" toast, and the Downloads hero names the
tail phase instead of showing a 0 MB/s graph.
</done>
