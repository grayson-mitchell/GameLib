---
status: pending
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
source: [80-CONTEXT.md D-15, 80-PARITY.md, todos/pending/2026-11-14-macos-wazhack-single-playing-done-check.md]
started: 2026-11-16
updated: 2026-11-16
---

## Launch recipe

Run `pnpm build:sidecar`, then check that `src-tauri/target/.../sidecar.js` has an mtime newer than the
last backend change (`tauri dev` does not rebuild the sidecar), then launch with `pnpm tauri:dev`.
The polls flag is at its rust default after plan 80-26: do not set `GAMELIB_STEAM_POLLS`.
Offline steps: turn the network off only for the action itself, then back on before reporting.

## Current Test

[awaiting operator, run by plan 80-27]

## Tests

### 1. Mac Steam handoff install (D-15.1)
expected: A `steam://install` handoff passes through the restart hold and shows live nettop progress to completion, then the "Installation Finished" notification fires. While held, Refresh does not flip the game to installed. After quitting Steam the hold releases. After a Force Quit of GameLib, `ps` shows no nettop or watchdog process left behind (T-80-16).
result: pending

### 2. Depot install and update (D-15.2)
expected: A Rust depot install finishes through the poll. A later update completes by the build-change rule (74 D-11), with exactly one updating to done transition.
result: pending

### 3. Uninstall and quit-resume (D-15.3)
expected: An uninstall runs to completion with the "Game Uninstalled" notification. Then a native handoff install reaches the restart hold; quit GameLib, relaunch, and the shell log shows the Rust rearm while the game shows waiting-for-Steam-restart again.
result: pending

### 4a. Running poll, macOS (D-15.4 and the WazHack todo)
expected: Launching WazHack (264160) via steam://rungameid gives exactly one Playing and one Done (Rust running poll plus steamLaunchWatch claims), with no flicker.
result: pending

### 4b. Running poll, Windows (D-15.4)
expected: On the operator's Windows machine, a launch gets exactly one Playing and one Done through the native RunningAppID read, and no reg.exe process appears (Process Explorer or `tasklist /FI "IMAGENAME eq reg.exe"`).
result: pending

### 5. Notification language (D-03)
expected: With GameLib switched to a non-English shipped locale, an install-finished notification shows the translated text.
result: pending

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
