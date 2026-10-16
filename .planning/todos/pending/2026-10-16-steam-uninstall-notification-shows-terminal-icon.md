---
created: 2026-10-16
title: "Uninstall notification shows a terminal icon instead of the GameLib icon"
source: operator observation during D-UAT-10 live gate (Child of Light uninstall, macOS)
area: notifications
files: []
severity: minor
platform: macos
ready: code
---

The "Game Uninstalled" notification raised after uninstalling a bottled Steam game on macOS carries a
terminal icon rather than the GameLib icon. Seen under `pnpm tauri:dev`; not yet checked whether a
packaged build shows the same (dev notifications on macOS are commonly attributed to the launching
terminal, so measure the packaged `.app` before changing code).
