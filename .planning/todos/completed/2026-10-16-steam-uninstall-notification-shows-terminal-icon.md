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

## Closed

Closed 2026-10-17 by quick task 261017-cwf
(`.planning/quick/261017-cwf-fix-the-macos-game-uninstalled-notificat/`). No code change.

The terminal icon is dev-mode behaviour of `tauri-plugin-notification` 2.3.3 itself, not a GameLib
defect: `desktop.rs:209-213` calls `notify_rust::set_application("com.apple.Terminal")` whenever
`tauri::is_dev()` is true, which is every `pnpm tauri:dev` run (`is_dev()` is
`!cfg!(feature = "custom-protocol")`). A packaged build attributes to `com.gamelib.shell` instead.

Measured as the todo asked, on the packaged `.app` — and the packaged answer is worse than a wrong
icon: both the ad-hoc-signed `--debug` bundle and the Developer-ID-signed 0.8.0 release bundle
deliver NO notification at all on this macOS 26 Mac. The sidecar handler ran every time (log lines
prove it), the Rust relay returned Ok, and nothing reached a banner, Notification Centre, or the
System Settings → Notifications app list, where `GameLib` never appears. That is now its own
`major` todo: `2026-10-17-packaged-macos-build-delivers-no-notifications.md`.
