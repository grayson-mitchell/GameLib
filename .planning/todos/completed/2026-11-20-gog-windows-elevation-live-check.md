---
created: 2026-11-20T23:30:00Z
title: "Live-check GOG Windows elevation: one setup prompt, no keep-saved-games dialog"
area: gog-install
severity: medium
platform: windows
ready: live-gate
status: CLOSED
resolution: 'Live-checked on Windows 11 2026-11-27: 4 of 5 PASS; the saves FAIL fixed by quick 261127-v8b (fc573a723, 60f03419c)'
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

## Live check result (2026-11-27)

Run in `pnpm tauri:dev` on Windows 11. Log: `%LOCALAPPDATA%\gamelib\logs\gamelib.log`. Four of the
five items passed; the saves part of the uninstall item failed and is fixed (see below).

1. Install Balrum (1769415595): PASS. The log at 19:01:37 shows three `Running elevated` lines
   (ISI scriptinterpreter.exe, MSVC2010 vcredist_x86, vcredist_x64), then `Running 3 elevated
   steps under one prompt`, and no `Elevated step exited` warning. The operator saw exactly one
   UAC prompt, naming PowerShell. Both "Microsoft Visual C++ 2010 x86/x64 Redistributable -
   10.0.40219" have InstallDate 20261127, and Balrum's
   `HKLM\SOFTWARE\WOW6432Node\...\Uninstall\1769415595_is1` key was written.
2. Decline the prompt (Balrum reinstall, 22:27:12): PASS for the prompt behaviour. The log shows
   `Running 3 elevated steps under one prompt`, then `[WARNING] Elevated step exited with code 1
   stderrLength=476`, and no further prompts. BUT GameLib then showed an "installed" toast and the
   store lists Balrum as installed with no unins000.exe and no setup applied. Filed as
   `2026-11-27-gog-declined-setup-uac-reports-install-success.md`.
3. Uninstall Balrum (19:10:21): PASS for the prompt and the dialog. One UAC prompt, no
   keep-saved-games dialog. Command: `unins000.exe /VERYSILENT /ProductId=1769415595 /galaxyclient
   /KEEPSAVES /dir=...`. The HKLM `_is1` key was removed and the run finished at 19:10:36. FAIL for
   "saves kept": the operator made a save, and Balrum's gogSaves location is
   `C:\Users\grays\Games\GameLib\Balrum\files\saves`, inside the install folder. After the
   uninstall the whole folder was gone, with no copy anywhere and no cloud sync on exit.
4. Folder name with a space (Alan Wake 1207659037, `C:\Users\grays\Games\GameLib\Alan Wake`):
   PASS. The install was a single elevated step (direct elevation, one prompt). The uninstall at
   22:05:46 logged `Running elevated ...\Alan Wake\unins000.exe ... /dir=...\Alan Wake`. The HKLM
   `1207659037_is1` key was removed, which proves the uninstaller ran; it finished at 22:05:53.
5. Hidden inner PowerShell window: PASS. The operator saw no console window, only toasts.

### Saves FAIL: cause and fix

`unins000.exe /KEEPSAVES` did keep the saves. Then `uninstall()` in `gog/games.ts` ran its guarded
delete over the whole install folder (`guardedRemoveTree(... removalRequest(install_path))`), which
removed them. Fixed by quick 261127-v8b: `gog/keepSaves.ts` works out the save folders that lie
inside the install folder (the stored `gogSaves` plus GOG's cached `<?INSTALL?>` templates, read
offline), and the delete now goes around them, one target per remaining entry, through the same
Rust guard with the install folder as each target's trust root. Commits fc573a723 (stored save
folders, end to end) and 60f03419c (the cached templates and the edge cases). A folder that cannot
be listed fails the uninstall instead of widening to a whole-tree delete. A live Balrum uninstall
re-run is the remaining proof: the GOG log should show the "Kept 1 save folder(s)" line and
`files\saves` should survive.

What the fix does not cover: a save location equal to the install folder itself is still deleted
with the game, and a warning is logged. Saves outside the install folder were never touched.

### Uninstall UAC: settled, elevation kept

Balrum's `unins000.exe` (Inno Setup) has an embedded manifest of
`requestedExecutionLevel level="asInvoker"`, but the binary carries
`requireAdministrator`/`highestAvailable` strings (Inno self-elevation), and its setup wrote a
machine-wide HKLM uninstall key. The condition for dropping elevation (`asInvoker` AND nothing
machine-wide) fails, so the uninstall keeps its single UAC prompt.

### Follow-ups

- `2026-11-27-gog-declined-setup-uac-reports-install-success.md` (item 2)
- `2026-11-27-gog-setup-uac-prompt-names-powershell-not-game.md` (operator feedback: the setup
  prompt names "Windows PowerShell", which was "bit unclear that is the game install")
