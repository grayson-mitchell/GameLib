---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 36
subsystem: notifications / steam bridge launch
tags: [steamstub, notice, in-app-dialog, notification-delivery-log, tauri]
requires: [52-34, 52-35]
provides:
  - in-app dialog for the forwarded SteamStub notice
  - per-notification delivery-result log naming the backend
affects: [52-37]
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src-tauri/src/notification_backend.rs
    - src-tauri/src/main.rs
    - src/common/types/sidecarTransport.ts
    - src/backend/platform/index.ts
    - src/backend/dialog/dialog.ts
    - src/backend/__tests__/notificationFailureLogging.test.ts
decisions:
  - "Forwarded SteamStub notice is shown as an in-app dialog (showDialogBoxModalAuto, MESSAGE) in addition to notify(), inside the existing per-title session gate"
  - "notification_show resolves a backend label string ('user-notifications' | 'plugin') instead of null; the shim emits an Electron-shaped 'show' event; notify() logs the result"
metrics:
  tasks: 2
  files: 8
  completed: 2026-10-25
---

# Phase 52 Plan 36: In-app forwarded SteamStub notice and notification delivery log Summary

The forwarded SteamStub notice now also appears as a GameLib in-app dialog (once per title per session), and every OS notification logs which backend accepted it and whether delivery is confirmable.

## What changed

- **Task 1** (`1b2b4ab69` RED, `99798077c` GREEN): `maybeNotifySteamStubForwarded` hoists the 52-33 title/body strings, calls `notify()` then `showDialogBoxModalAuto({title, message, type:'MESSAGE'})`, and logs `[bridge-notice] appId=<id> dispatched=in-app-dialog+notify`. Launch order is now cfg, setup, notify, dialog, wine. The 52-34 trigger log line, the session gate and the unforwarded notice are unchanged.
- **Task 2** (`40e7093a9` RED, `8fdd8cdb2` GREEN): Rust `backend_label()` (cargo-tested); `notification_show` arm resolves the label on both paths; `Notification.show()` emits a `'show'` event with it (string only, else undefined); `notify()` logs `accepted by UserNotifications`, `handed to tauri-plugin-notification (delivery not confirmable)`, or `handed off (delivery not confirmable)`. The body is never logged. `RustNotificationBackendLabel` type exported.

## Verification

Steam backend jest (2313), notification/shell jest files (381), cargo test notification_backend, cargo build, cargo fmt --check, pnpm codecheck, eslint (0 errors, warnings pre-existing), scoped prettier all green. The git-log gate confirms the 52-36 commits touch only the eight planned files.

## Deviations from Plan

None. The plan was executed as written.

## Known Stubs

None.

## Notes for 52-37

The live effect is unverified here: it needs a rebuilt shell (the Rust arm changed) and a re-gate. The delivery log lines only distinguish accepted UserNotifications from plugin hand-off.

## Self-Check: PASSED

All four task commits exist in git log; the eight modified files exist.
