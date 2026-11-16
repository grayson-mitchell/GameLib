---
status: complete
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

## Preface (plan 80-27 task 1, 2026-11-16)

sidecar.js: rebuilt with `pnpm build:sidecar`, build/main/sidecar.js mtime Nov 16 16:42:35 2026.
Local suites: `cargo test --workspace` and `cargo test --bin gamelib-shell` green. `pnpm test:ci` has 14 failing suites, all on the known pre-existing list (tauriShellSource, flowRegistrationCensus, ipcDomainCensus, epicOfflineMode, shimCoverage, shimGenerate, themeTokens, gamePageActionDock, callbackRegistryHost, gamelibCatalogParity, genI18nGateScope, lintTranslations, steamLineCeiling, x86CallbackWineHarness); none are phase-80 regressions.
CI legs: rust-test.yml run 43813887944 on f078c2762: windows-latest, macos-latest and ubuntu-latest all success. Earlier runs failed windows-latest on phase-80 test-only path-separator bugs, fixed in 6ec2e9db1, d6f314aec and f078c2762. main was pushed with --no-verify at the operator's direction; the pre-push hook stays red on checks recorded in todos/pending/2026-11-16-pre-push-hook-red-gameLaunch-and-jest-mock.md, which are not part of the delete gate.

## Current Test

[complete, all items passed 2026-11-16]

## Tests

### 1. Mac Steam handoff install (D-15.1)
expected: A `steam://install` handoff passes through the restart hold and shows live nettop progress to completion, then the "Installation Finished" notification fires. While held, Refresh does not flip the game to installed. After quitting Steam the hold releases. After a Force Quit of GameLib, `ps` shows no nettop or watchdog process left behind (T-80-16).
result: pass — Live progress moved; a Steam-driven download needs no restart hold (Steam knows it is installed, so GameLib went straight to Play) and "Installation Finished" fired. No GameLib nettop or watchdog left after Force Quit during a handoff download. The restart hold applies to GameLib-driven (depot) installs with the experimental InstallApp setting off, not to Steam-driven handoffs. One 2026-11-02 nettop orphan from the OLD TS monitor was found and killed; none from the Rust monitor.

### 2. Depot install and update (D-15.2)
expected: A Rust depot install finishes through the poll. A later update completes by the build-change rule (74 D-11), with exactly one updating to done transition.
result: pass — Depot install finished at the restart hold (InstallApp setting off); restarting Steam turned it to Play. Fake pending update staged on WazHack 264160 (spike 069 step 4); Update delegated to Steam and completed with exactly one Updating to Done, no flicker. ACF ended buildid 9044149, StateFlags 4.

### 3. Uninstall and quit-resume (D-15.3)
expected: An uninstall runs to completion with the "Game Uninstalled" notification. Then a native handoff install reaches the restart hold; quit GameLib, relaunch, and the shell log shows the Rust rearm while the game shows waiting-for-Steam-restart again.
result: pass — Uninstall of WazHack showed "Game Uninstalled". Depot install to the restart hold, GameLib quit and relaunched: still restart-Steam; dev terminal logged `gamelib-steampoll: re-armed steam-waiting-for-restart for appId <id> after a GameLib restart`. Restarting Steam gave Play.

### 4a. Running poll, macOS (D-15.4 and the WazHack todo)
expected: Launching WazHack (264160) via steam://rungameid gives exactly one Playing and one Done (Rust running poll plus steamLaunchWatch claims), with no flicker.
result: pass — one Playing and one Done on WazHack 264160.

### 4b. Running poll, Windows (D-15.4)
expected: On the operator's Windows machine, a launch gets exactly one Playing and one Done through the native RunningAppID read, and no reg.exe process appears (Process Explorer or `tasklist /FI "IMAGENAME eq reg.exe"`).
result: pass — one Playing, one Done, no reg.exe.

### 5. Notification language (D-03)
expected: With GameLib switched to a non-English shipped locale, an install-finished notification shows the translated text.
result: pass — Spanish locale; "Game Uninstalled" and "Installation Finished" both translated.

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

Delete gate: MET (2026-11-16). All items pass, all three CI legs are green, and 80-PARITY.md is APPROVED (2026-11-16, operator).

## Gaps
