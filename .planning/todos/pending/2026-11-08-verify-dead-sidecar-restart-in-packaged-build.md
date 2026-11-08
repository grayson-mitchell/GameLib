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
