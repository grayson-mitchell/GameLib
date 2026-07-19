---
phase: 03-game-operations
plan: "03"
subsystem: steam-game-ui
tags: [steam, install, uninstall, ui, modal-bypass, settings-hide, checkpoint]
dependency_graph:
  requires: [03-02-SUMMARY]
  provides: [Steam-only action surface, Steam install hand-off, Steam uninstall hand-off]
  affects:
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Game/GamePage/components/MainButton.tsx
    - src/frontend/screens/Game/GamePage/components/SettingsButton.tsx
    - src/frontend/screens/Game/GameSubMenu/index.tsx
tech_stack:
  added: []
  patterns:
    - runner !== 'steam' guard at MainButton install onClick (falls through to handleInstall)
    - gameInfo.runner === 'steam' branch in GamePage handleInstall — window.api.install directly, no modal
    - gameInfo.runner === 'steam' guard in SettingsButton — returns null (hides Settings cog)
    - isSteam = runner === 'steam' flag in GameSubMenu — hides Wine-specific actions
    - Direct window.api.uninstall() call for steam in GameSubMenu (bypasses UninstallModal, D-05)
key_files:
  created: []
  modified:
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Game/GamePage/components/MainButton.tsx
    - src/frontend/screens/Game/GamePage/components/SettingsButton.tsx
    - src/frontend/screens/Game/GameSubMenu/index.tsx
decisions:
  - "MainButton modal bypass uses runner !== 'steam' inline in onClick (not extracted) — same pattern as isSideloaded guard"
  - "GamePage handleInstall adds steam branch before !is_installed check — ensures not-installed steam clicks always bypass handleModal()"
  - "SettingsButton guard lives inside the component (not at GamePage call site) — single responsibility, consistent with is_installed guard pattern"
  - "GameSubMenu uninstall onClick uses inline isSteam branch — direct window.api.uninstall(appName, runner, false, false) for steam (false/false = no prefix/settings delete, which are Wine concepts)"
metrics:
  duration: "~5 min"
  completed: "2026-06-28"
  tasks_completed: 2
  files_changed: 4
---

# Phase 3 Plan 3: Steam UI Action Surface Summary

Steam GamePage and GameSubMenu expose only Play, Install, and Uninstall for Steam games — all Wine-specific Heroic actions are hidden, and Install/Uninstall hand off directly to Steam without GamerLib modals (D-04, D-05).

## What Was Built

**MainButton.tsx (install onClick guard)** — Added `gameInfo.runner !== 'steam'` to the not-installed condition that gates `openInstallGameModal`. For Steam not-installed games the modal branch is skipped; the click falls through to `handleInstall(is_installed)` which routes to the steam branch in GamePage. This is the critical bypass — without it, not-installed Steam clicks are intercepted by the modal before `handleInstall` is ever reached.

**GamePage/index.tsx (handleInstall steam branch)** — Inserted a `gameInfo.runner === 'steam' && !is_installed` early return before the existing `!is_installed && !isInstalling → handleModal()` guard. For steam not-installed games it calls `window.api.install({ appName, path: '', runner: 'steam', ... })` directly. The backend `SteamGame.install()` receives this and fires `shell.openExternal('steam://install/{appId}')`. No GamerLib install-location dialog is shown (D-04).

**SettingsButton.tsx (steam null guard)** — Extended the early-return from `!gameInfo.is_installed` to `!gameInfo.is_installed || gameInfo.runner === 'steam'`. The Settings cog never renders for any Steam game (installed or not).

**GameSubMenu/index.tsx (isSteam guard + direct uninstall)** — Added `const isSteam = runner === 'steam'` alongside `isSideloaded` (line 89). Added `&& !isSteam` to all four guarded blocks: Force Update, Move Game, Change Install Location, Verify/Repair. Changed the Uninstall button onClick: for steam, calls `window.api.uninstall(appName, runner, false, false)` directly (false/false = no Wine prefix or settings deletion); for non-steam, unchanged `setShowUninstallModal(true)`.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Steam install hand-off + hide Settings (MainButton, GamePage handleInstall, SettingsButton) | d6fc9f5 | MainButton.tsx, index.tsx (GamePage), SettingsButton.tsx |
| 2 | GameSubMenu isSteam guard + direct Steam uninstall (D-04, D-05) | d942459 | GameSubMenu/index.tsx |
| 3 | End-to-end verification checkpoint | (awaiting human) | — |

## Verification

- `npm run codecheck`: **clean (no type errors)** — verified after each task
- `grep -n "steam"` in MainButton.tsx: runner guard at line 209
- `grep -n "steam"` in SettingsButton.tsx: runner guard at line 13
- `grep -n "runner === 'steam'"` in GamePage/index.tsx: steam branch at line 612
- `grep -n "isSteam"` in GameSubMenu/index.tsx: defined at 89, used at 323, 336, 346, 355, 364

## Deviations from Plan

None — plan executed exactly as written. Both guards are present in both locations as required (MainButton intercepts before handleInstall; handleInstall has the steam branch as the belt-and-suspenders path for any caller that bypasses MainButton).

## Known Stubs

None. All wiring is live: MainButton falls through to handleInstall, handleInstall calls window.api.install for steam, GameSubMenu calls window.api.uninstall for steam. No placeholder values flow to the UI.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes beyond those in the plan's threat model.

- T-03-01 mitigated: Frontend passes appName to window.api.install/uninstall; backend SteamGame routes through `buildSteamProtocolUrl` (03-01 chokepoint) which enforces numeric appId.
- T-03-05 accepted: Direct uninstall bypass is intentional per D-05 — Steam's own confirmation dialog is the sole confirmation prompt.

## Self-Check: PASSED

- src/frontend/screens/Game/GamePage/index.tsx: FOUND (steam branch at line 612)
- src/frontend/screens/Game/GamePage/components/MainButton.tsx: FOUND (runner guard at line 209)
- src/frontend/screens/Game/GamePage/components/SettingsButton.tsx: FOUND (runner guard at line 13)
- src/frontend/screens/Game/GameSubMenu/index.tsx: FOUND (isSteam at line 89, used at 323/336/346/355/364)
- Commit d6fc9f5 (Task 1): FOUND
- Commit d942459 (Task 2): FOUND
- npm run codecheck: clean after both tasks
