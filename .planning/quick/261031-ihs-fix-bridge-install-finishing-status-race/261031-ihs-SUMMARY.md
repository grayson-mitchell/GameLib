---
phase: quick-261031-ihs
plan: 01
subsystem: steam-bridge-install
tags: [steam, bridge, install, race]
key-files:
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
metrics:
  completed: 2026-10-31
---

# Quick 261031-ihs: Bridge install "Finishing install..." race

A per-appId finalized marker (`markBridgeInstallFinalized` / `clearBridgeInstallFinalized` / `isBridgeInstallFinalized` in library.ts) now gates the bridge ACF poller's finishing status, so the installer's `done` can no longer be overwritten.

## What changed
- library.ts: module-private Set plus three exports. The poller's 'installed' branch skips only the `gameStatusUpdate` when source is bridge and the marker is set. The marker is read synchronously at the send site. The library flip, persist, pushGameToLibrary and depot-skipped notice are unchanged, and the poller never clears the marker.
- games.ts: `installBridgeGameLeased` clears the marker first, before the depot download starts the poller. The tail's `finally` and the wrapper's `clearFinishing` (error and throw paths) mark it just before sending `done`.
- Tests: library.test (tail first sends no status but still flips and pushes; poller first shows finishing; reinstall reset; per-appId scoping) and games.test (success finalizes, marker unset during the redist step, stale marker cleared at start, one toast, CEG error path marks and sends done).

## Commits
- 7578c3d4d: library.ts marker and poller gate, with tests
- 6212bdd66: games.ts call sites, with tests

## Verification
- `npx jest src/backend/storeManagers/steam`: 97 suites passed.
- `npx tsc --noEmit -p .`: clean.
- `npx prettier --check` on the four files: clean.
- `graphify update .` run.
- The wider frontend jest run in the plan's verification section was not run; no frontend files changed.

## Deviations
None. Test (not plan) detail: the toast assertion counts `notify` calls (1) rather than matching the body text, since i18n is mocked in games.test.

## Operator note
This ordering cannot be reproduced on demand. Confirm on the next bridge install (restart tauri dev first, since it does not rebuild the sidecar). When the tail beats the poller, the log shows "install polling complete ... badge flipped" after "Installation Finished", and the UI ends on Play, not "Finishing install...".

## Self-Check: PASSED
Both commits exist; the four files are modified as described.
