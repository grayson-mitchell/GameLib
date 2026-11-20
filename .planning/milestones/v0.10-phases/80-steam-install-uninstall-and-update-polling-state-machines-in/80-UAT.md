---
status: complete
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
source: [80-REVIEW.md (iteration 2), 80-REVIEW-FIX-A.md, 80-REVIEW-FIX-B.md, 80-REVIEW-FIX-C.md, 80-HUMAN-UAT.md]
started: 2026-11-17
updated: 2026-11-17
---

## Scope

80-HUMAN-UAT.md (items 1-9) passed on 2026-11-16, before the two code-review fix rounds (27 + 6 `fix(80):` commits).
This session re-runs the core flows on the fixed build and live-checks the fixes that the review marked "not live-verified".

## Launch recipe

Run `pnpm build:sidecar` first: `build/main/sidecar.js` (Nov 16 23:22) is older than the last backend commit (23:27).
Check its mtime, then launch with `pnpm tauri:dev` (never `tauri:dev:run`). Do not set `GAMELIB_STEAM_POLLS`.

## Current Test

[testing complete]

## Tests

### 1. Cold start after the review fixes
expected: Quit GameLib fully, rebuild the sidecar, launch with `pnpm tauri:dev`. The app boots with no error in the dev terminal, the Steam library loads, and installed Steam games show Play. The dev terminal shows no repeating `replay … ack timeout` lines in the first minute.
result: pass

### 2. Steam install still finishes
expected: Install a small Steam game from GameLib (or via `steam://install/<appId>`). Progress moves, the game reaches Play (or the restart hold for a depot install), and the "Installation Finished" notification fires once.
result: pass

### 3. Steam uninstall still finishes
expected: Uninstall a Steam game from GameLib. It returns to not-installed, the "Game Uninstalled" notification fires once, and its folder under steamapps/common is gone. Other installed games in the same library still show Play.
result: pass

### 4. Launch, quit, relaunch quickly (A/WR-02 running-poll stop/start race)
expected: Launch WazHack (264160) from GameLib, quit it, and launch it again within a couple of seconds. Each run shows exactly one Playing and one Done, and after the second quit the game does not stay stuck on Playing.
result: pass

### 5. Steam restart during a download (A-WR-09 monitor restart)
expected: Start a Steam-driven install, then quit Steam and start it again while the download is still running. Once Steam resumes the download, GameLib's progress starts moving again within about 10 seconds and the install finishes with one "Installation Finished".
result: pass

### 6. GameLib quits promptly (B outbox retry thread)
expected: With no game running, quit GameLib from the menu or Cmd+Q. The app and the dev process exit within about 2 seconds, with no hang. `ps aux | grep -E 'sidecar|nettop'` shows no leftover GameLib process.
result: pass — ps after quit showed only the grep itself; no sidecar or nettop left.

### 7. Windows launch goes Launching → Playing → Done (C/WR-01)
expected: On the Windows machine, launch a Steam game from GameLib. The status goes Launching, then Playing, then Done after quitting, and never flips back to Launching while the game is running or after it has exited.
result: pass

### 8. Bridged-game uninstall removes only that game (C/EXTRA-01)
expected: Uninstall a bridged (bottle) Steam game that shares a bottle with at least one other installed game. Only that game's folder is removed. The other game still launches, and the "Game Uninstalled" notification fires. If you have no shared-bottle setup, reply "skip" with the reason.
result: skipped
reason: Operator has no shared-bottle setup; bridge bottles are per-game (`GameLibSteamBridge-<appId>`) and shared instances are being retired. The nested/escaping-installdir refusal is covered by the C/EXTRA-01 Jest tests.

## Summary

total: 8
passed: 7
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

[none yet]
