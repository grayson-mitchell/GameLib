---
created: 2026-11-20T23:30:00Z
title: "Live-check GOG Windows elevation: one setup prompt, no keep-saved-games dialog"
area: gog-install
severity: medium
platform: windows
ready: live-gate
files:
  - src/backend/storeManagers/gog/windowsElevation.ts
  - src/backend/storeManagers/gog/setup.ts
  - src/backend/storeManagers/gog/games.ts
---

## Problem

Quick task 261120-uzn changed how GOG runs elevated programs on Windows. The Windows uninstall now passes the full Galaxy switch set (`/VERYSILENT /ProductId /galaxyclient /KEEPSAVES` plus `/dir`) with every value as a single-quoted PowerShell literal, so the keep-saved-games dialog should not appear and an install path with a space reaches the uninstaller at all. GOG setup now queues its elevated steps (script interpreter, support executables, every redist) and runs them under one UAC prompt instead of one per step. A single step still elevates directly, and an oversized batch falls back to one prompt per step.

Tests prove the arguments arrive verbatim through real PowerShell 5.1, but they run without elevation. No UAC behaviour was observed live.

## What to check

Run in `pnpm tauri:dev` on Windows.

- Install Balrum. Expect exactly one UAC prompt, naming Windows PowerShell, and the VC++ redist actually installed.
- Decline that prompt once. Expect setup to finish with a warning in the GOG log and no further prompts.
- Uninstall Balrum. Expect one UAC prompt, no keep-saved-games dialog, and the saves kept.
- Uninstall a GOG game whose folder name has a space. Expect the uninstaller to run.
- Note whether the hidden inner PowerShell window stays hidden under elevation.

## Uninstall UAC (investigated, kept)

The uninstall keeps its UAC prompt on purpose. No GOG `unins000.exe` existed on the machine where this was planned, so its manifest could not be read. Launched without elevation it would either self-elevate (the same single prompt) or run unelevated and fail to remove machine-wide registry entries that the elevated setup step wrote, leaving them orphaned while the files are deleted anyway. One prompt per uninstall is the honest floor for now.

To settle it, read the embedded manifest of an installed game's `unins000.exe` (`requestedExecutionLevel`) and check whether its setup wrote machine-wide registry keys. Drop elevation only if the uninstaller is `asInvoker` AND nothing machine-wide needs removing.

## Trade-off

The single setup prompt now shows Windows PowerShell with an encoded command instead of each installer's own name. The per-step `Running elevated ...` lines in the GOG log are the record of what was approved.
