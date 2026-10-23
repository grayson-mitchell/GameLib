---
created: 2026-10-17
title: "Packaged macOS build delivers no OS notifications — the signed .app never registers with Notification Center"
source: quick task 261017-cwf, measured live on macOS 26 (Darwin 25.6.0) while actioning the dev-mode terminal-icon todo
area: notifications
files:
  - src-tauri/src/main.rs
  - src/backend/platform/index.ts
  - src/backend/dialog/dialog.ts
severity: major
platform: macos
ready: code
---

Every `notify()` call in a packaged macOS GameLib is dropped silently. Measured 2026-10-17 on two
packaged builds, with the sidecar handler proven to run each time
(`SteamGame.removeShortcuts not implemented` logged, `[GATE-cwf] removeShortcut done false` logged):

- `tauri build --debug` bundle (ad-hoc signed, 0.8.0, Oct 15): 3 arms via the inspector console
  plus 2 more via a direct binary launch with stderr captured. No banner on either display, nothing
  in Notification Centre, and the sidecar's `[electronStub] Notification.show(): notification_show
  failed:` warning never printed — the Rust relay returned Ok.
- Developer-ID-signed release bundle (`src-tauri/target/release/bundle/macos/GameLib.app`, 0.8.0,
  Oct 12, Team `S7U223QWXJ`): one arm via the real UI (7 Days to Die → dots menu → Remove shortcuts).
  Same result: no banner, nothing in Notification Centre.
- System Settings → Notifications lists no `GameLib` entry before or after either run (the list goes
  `Google Chrome for Testing` → `Heroic`). Terminal is listed with Badges, Sounds, Desktop — which is
  why the dev build's notifications DO appear, carrying Terminal's icon.

Mechanism, from the vendored sources:

- `tauri-plugin-notification` 2.3.3 `desktop.rs:209-213`: on macOS it calls
  `notify_rust::set_application(if tauri::is_dev() { "com.apple.Terminal" } else { identifier })`.
  `tauri::is_dev()` is `!cfg!(feature = "custom-protocol")` (tauri 2.11.5 `lib.rs:308`), so every
  `pnpm tauri:dev` run attributes to Terminal by design — the terminal icon in the dev build is not
  a GameLib defect.
- `notify-rust` 4.18.0 → `mac-notification-sys` 0.6.15 delivers through the deprecated
  `NSUserNotificationCenter` (`objc/notify.m:79`). `setApplication` only checks
  `LSCopyApplicationURLsForBundleIdentifier` (`notify.m:22`) — `com.gamelib.shell` resolves to three
  bundles on this Mac, so it passes — and `sendNotification`'s outcome is discarded by the plugin
  (`let _ = notification.show()` on a spawned task, `desktop.rs:218`).
- The plugin's desktop `request_permission()` / `permission_state()` return `Granted` unconditionally
  (`desktop.rs:61-67`); nothing ever asks macOS for notification authorization, and on this macOS
  the legacy path neither prompts nor auto-registers the app. Three failure modes are therefore
  invisible: the plugin ignores the delivery result, the sidecar stub only `console.warn`s on a
  relay rejection, and the packaged shell's stderr is `/dev/null` (`lsof -p <pid> -a -d 1,2`).

Fix direction: deliver through `UNUserNotificationCenter` from Rust (objc2 `UserNotifications`,
request `.alert | .sound` authorization once at startup, keep the current path as the
`tauri::is_dev()` fallback since UN* requires a real bundle), and surface a delivery failure
somewhere a packaged build can see it — the sidecar log, not stderr. Verify on a packaged build, not
`tauri:dev`: the dev build cannot reproduce this because it borrows Terminal's authorization. The
"Game Uninstalled" toast named in the original todo is one of the ~15 `notify()` callers affected
(install/uninstall/move finished, download paused/canceled/failed, shortcuts, wine manager, repair).

Evidence: `.planning/quick/261017-cwf-fix-the-macos-game-uninstalled-notificat/evidence/`.

## Closed 2026-10-24 — quick 261023-vkv

Packaged macOS builds now deliver through `UNUserNotificationCenter`
(`src-tauri/src/macos_notifications.rs`, backend choice in `notification_backend.rs`). Startup
requests `.alert | .sound` once and registers a `willPresent` delegate so banners show while
GameLib is frontmost. `tauri:dev` and non-`.app` runs keep `tauri-plugin-notification`. Failures
come back as `notification:*` strings that `notify()` logs via `logWarning` (a denial once per
process); the startup authorization outcome goes to `gamelib-shell.log`.

Commits: `687ee4234` (Rust delivery), `b153ff2f7` (sidecar failure logging), `278d90520`
(startup authorization to the shell log).

Verified live 2026-10-24 on the packaged bundle signed with an Apple Development identity (Team
S7U223QWXJ): banner shown, `granted=true error=None`. The same bundle ad-hoc/linker-signed (as
`tauri build --debug` emits it) is refused with `UNErrorDomain error 1` and no prompt, so a
packaged-build notification check needs a team-signed bundle. Not exercised live: the denial path,
the `tauri:dev` regression, and a notarized Developer-ID release.
