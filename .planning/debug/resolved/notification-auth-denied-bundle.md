---
status: resolved
trigger: "Notification authorization fails (granted=false, UNErrorDomain error 1) on the bundled GameLib.app although GameLib notifications are enabled in System Settings"
created: 2026-10-26
updated: 2026-10-26
source_todo: .planning/todos/pending/2026-10-25-notification-authorization-fails-on-bundled-app-despite-settings-enabled.md
---

## Symptoms

- **Expected:** At launch, the bundled `src-tauri/target/debug/bundle/macos/GameLib.app` logs
  `notification authorization: granted=true`. Forwarded notices (e.g. the SteamStub notice) log
  `accepted by UserNotifications` and appear as macOS banners.
- **Actual:** gamelib-shell.log logs
  `notification authorization: granted=false error=Some("The operation couldn't be completed. (UNErrorDomain error 1.)")`
  at launch. At Play, the delivery result is
  `was not delivered (notification:authorization-not-determined ...)`. No banner appears.
- **Errors:** UNErrorDomain error 1 = `UNErrorCodeNotificationsNotAllowed`.
- **Timeline:** Seen during the 52-37 item-32 live gate (Grim Dawn 219990, pid 48423, logs in
  /tmp/gamelib-gate-52x-20261024T182235Z). It is not known whether this has ever worked on a
  bundled debug build.
- **Reproduction:** Build the debug bundle, launch GameLib.app, and read the authorization line
  in gamelib-shell.log. The operator says GameLib notifications are enabled in System Settings →
  Notifications.

## Known state (unverified as cause)

- Info.plist CFBundleIdentifier: `com.gamelib.shell`
- `codesign -dv`: `Identifier=gamelib_shell-7a2c4309ec21a797`, `Signature=adhoc`,
  `TeamIdentifier=not set`
- Hypothesis from the todo: ad-hoc signing yields a code-signing identifier that does not match
  the bundle id and changes per build, so usernoted evaluates a different identity than the one
  enabled in System Settings.

## Relevant files

- src-tauri/src/macos_notifications.rs:106
- src-tauri/src/notification_backend.rs:70
- src/backend/dialog/dialog.ts

## Current Focus

- hypothesis: bundle is only linker-signed (Info.plist not bound, no sealed resources), so the identity usernoted sees is not com.gamelib.shell
- fix applied: bundle.macOS.signingIdentity "-" in src-tauri/tauri.macos.conf.json (env APPLE_SIGNING_IDENTITY still overrides for release)
- next_action: operator rebuilds bundle, relaunches, checks granted= line (checkpoint)

## Evidence

- codesign -dv on the bundle: flags=adhoc,linker-signed, Info.plist=not bound, Sealed Resources=none, Identifier=gamelib_shell-<hash>.
- log show 17:46:23: UserNotifications logs [com.gamelib.shell] requesting auth, completes in 3ms with didGrant 0 hasError 1; usernoted logs no com.gamelib.shell connection or authorization record at all (only Terminal-attributed gamelib-shell for dev binary).
- lsd logs -67062 (errSecCSUnsigned) for the bundle and "registered launch-disabled".
- Copy of bundle re-signed with codesign --force --deep -s - : Identifier=com.gamelib.shell, Info.plist entries=15, Sealed Resources v2, verify --deep --strict OK.

## Eliminated

- Missing request options: Alert|Sound (options 6) is normal; not the cause.
- Signature stability per-build as sole cause: refined; real issue is unbound Info.plist/linker-only signature.

## Resolution

root_cause: Tauri debug bundle is left with only the linker's ad-hoc signature (Info.plist unbound, no sealed resources), so usernoted cannot associate it with com.gamelib.shell and refuses authorization (UNErrorDomain 1).
fix: bundle.macOS.signingIdentity "-" so tauri codesigns the whole bundle.
verification: live gate 2026-10-26 — granted=true (pid 60575); Grim Dawn SteamStub notice accepted by UserNotifications, banner seen
files_changed: [src-tauri/tauri.macos.conf.json]
