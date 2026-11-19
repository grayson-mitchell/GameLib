---
created: 2026-11-18T00:00:00.000Z
title: '"Game Uninstalled" notification not seen on macOS (dev build), though notify() ran'
area: steam
severity: minor
platform: macos
ready: live-gate
files:
  - src/backend/dialog/dialog.ts
---

## Problem

Phase 81 live gate, item 9 (`81-HUMAN-UAT.md`, launch L2, 2026-11-18). The unadopted
uninstall of Wildermyth (763890) passed, and gamelib.log shows
`notify(): "Wildermyth" handed to tauri-plugin-notification (delivery not confirmable)`,
but the operator saw no "Game Uninstalled" notification. An earlier `notify()` in the same
launch (21:20:10) is not known to have been seen either.

Likely macOS delivery for the `pnpm tauri:dev` build (notification permission or the
bundle identity the dev binary runs under), not Phase 81 code. Investigation only.

## Direction

Check System Settings > Notifications for the dev app's entry and its permission state,
and the unified log for the notification request (`/usr/bin/log show --info`, see the
macOS TCC diagnosis memory). Compare with a packaged build. If dev builds simply cannot
deliver, record that and close; if packaged builds also drop it, it is a real defect.
`notify()` lives in `src/backend/dialog/dialog.ts`.

## Resolution

Not a defect: closed 2026-11-19 as investigation only, with no code change. Dev builds post notifications under Terminal's identity, and Terminal's notifications are denied on this Mac.

- **Which backend.** `select_notification_backend` (`src-tauri/src/notification_backend.rs`) always picks `tauri-plugin-notification` under `tauri dev`. That matches the log's `handed to tauri-plugin-notification`.
- **Which identity.** Under `tauri::is_dev()`, the plugin calls `notify_rust::set_application("com.apple.Terminal")` (`tauri-plugin-notification-2.3.3/src/desktop.rs:209`). So every dev notification is posted as Terminal, not as `com.gamelib.shell`.
- **What macOS did with it.** The unified log has four of these on 2026-11-18: 21:20:10, 21:23:21, 21:35:53 and 21:36:02. Each time, usernoted logged a `NotificationRecord app:"com.apple.Terminal"` (connection path `src-tauri/target/debug/gamelib-shell`). It flagged the record as ineligible, with `UNNotificationSettings ... authorizationStatus: Denied`, and still put it in Notification Center storage, logged with `visibility: []`. No banner was presented. Focus/DND was off (`outcome: allowed; reason: disabled`), so Focus was not the cause.
- **Packaged builds.** These use the `UNUserNotificationCenter` path under `com.gamelib.shell`. That path passed live on 2026-10-24 (quick 261023-vkv, team-signed bundle: the operator saw the banner).

To see notifications from a dev build, turn on Terminal in System Settings → Notifications. A dev build's notify() lines in gamelib.log say "delivery not confirmable" for this reason, so they are not evidence that a banner showed.
