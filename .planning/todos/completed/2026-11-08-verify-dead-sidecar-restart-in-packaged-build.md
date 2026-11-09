---
created: 2026-11-08
title: "Verify the dead-sidecar dialog's Restart brings back a working UI in a packaged build"
area: sidecar
severity: minor
platform: macos
ready: live-gate
source: "72-10 live macOS check, 2026-11-08"
files:
  - src-tauri/src/sidecar.rs
  - src-tauri/src/main.rs
---

## Problem

The 72-10 dead-sidecar dialog (Restart/Quit) was checked live under `tauri dev`. Restart relaunched the shell and booted a new sidecar cleanly (signInProbe pass complete), but the window was blank with a webview load error: `app.restart()` exits the process, `tauri dev` tears down its Vite server, and the relaunched binary's webview pointed at the dead devUrl. That is a dev-mode artifact, so the UI-after-restart half is unverified.

## Next

1. In a packaged (non-dev) build, `kill -9` the sidecar, click Restart, and confirm the relaunched app shows a working UI with a live sidecar.
2. Optionally exercise 72-08's fatal `uncaughtException` path (step 6 of the 72-10 check, not run) and confirm it raises the same dialog once.

## Resolution

Passed live on 2026-11-10 in a packaged build (`pnpm tauri:dev:packaged`, i.e. `tauri build --debug`; the webview loads the bundled `frontendDist`, not a devUrl). With the app up, `kill -9` of the sidecar (pid 60774) raised the dead-sidecar dialog; the operator clicked Restart. `gamelib-shell.log` records `exit requested (code=Some(2147483647))` 2 s later — tauri's `RESTART_EXIT_CODE`, which only the dialog's Restart branch produces — then the relaunched shell (pid 61096) spawned a new sidecar (pid 61105) that logged `signInProbe pass complete`. The operator confirmed a working UI.

Caveats: the `--debug` bundle spawns the sidecar via the dev path (`node build/main/sidecar.js`), not the SEA `gamelib-sidecar` binary, so the restart was not exercised against the SEA sidecar. A first attempt (shell pid 45615) ended in Quit (exit code 0) after a 45 s `keyring_get` timeout on the freshly built bundle; that is unrelated to the restart path. Step 2 (72-08's fatal `uncaughtException` path) was optional and not run.
