---
created: 2026-10-25
title: "Notification authorization fails (granted=false, UNErrorDomain error 1) on the bundled GameLib.app although GameLib notifications are enabled in System Settings"
source: 52-37 item 32 live gate (operator report + gamelib-shell.log)
area: notifications
files:
  - src-tauri/src/macos_notifications.rs:106
  - src-tauri/src/notification_backend.rs:70
  - src/backend/dialog/dialog.ts
severity: medium
platform: macos
ready: live-gate
---

## Problem

During the 52-37 item-32 gate (Grim Dawn 219990, bundled
`src-tauri/target/debug/bundle/macos/GameLib.app`, pid 48423), gamelib-shell.log recorded at
launch:

```
notification authorization: granted=false error=Some("The operation couldn't be completed. (UNErrorDomain error 1.)")
```

At Play, the forwarded-notice delivery result was
`was not delivered (notification:authorization-not-determined ...)`. Session logs are archived in
/tmp/gamelib-gate-52x-20261024T182235Z, and 52-UAT item 32 records the details.

UNErrorDomain error 1 is `UNErrorCodeNotificationsNotAllowed`. The operator confirmed that GameLib
notifications **are enabled** in System Settings → Notifications. No macOS banner appeared for the
forwarded SteamStub notice. The in-app dialog from 52-36 did appear, so item 32's pass channel was
unaffected. Every OS notification GameLib sends from this build is therefore lost, and the
52-36 delivery-result log line is the only evidence of it.

## Observed signing state (2026-10-25, not yet confirmed as the cause)

- `Info.plist` CFBundleIdentifier: `com.gamelib.shell`
- `codesign -dv` on the bundle: `Identifier=gamelib_shell-7a2c4309ec21a797`, `Signature=adhoc`,
  `TeamIdentifier=not set`

**Hypothesis:** with ad-hoc signing, the code-signing identifier does not match the bundle id and
changes from build to build. If so, the System Settings entry the operator enabled may belong to
an earlier build or identity, and UserNotifications treats this build as not allowed. This is a
hypothesis only and has not been tested.

## Solution

TBD. Starting points:

1. Run `log show --predicate 'subsystem == "com.apple.UserNotifications"'` around a fresh launch
   to see which bundle/identity usernoted evaluates.
2. Sign the debug bundle with a stable identifier (`codesign -s - -i com.gamelib.shell`, or a
   development identity), relaunch, and see whether `granted=` flips.
3. Check whether more than one GameLib entry exists in System Settings → Notifications, or
   whether resetting the entry and re-prompting clears it.
4. Done-when: a live launch of the bundle logs `granted=true`, and the forwarded-SteamStub notice
   logs `accepted by UserNotifications` and is seen as a banner.

## Cause and fix (2026-10-26)

The hypothesis above was close but not exact. The per-build identifier was a symptom. The cause
was that Tauri left the debug bundle with only the linker's ad-hoc signature:
`flags=adhoc,linker-signed`, `Info.plist=not bound`, `Sealed Resources=none`. UserNotifications
requested authorization as `[com.gamelib.shell]` and failed in 3ms. usernoted kept no
`com.gamelib.shell` record. lsd logged -67062 (errSecCSUnsigned). Without a bound Info.plist,
usernoted could not tie the process to the bundle id enabled in System Settings, so it answered
UNErrorDomain 1. The request options (`Alert|Sound`) were ruled out. Debug session:
`.planning/debug/resolved/notification-auth-denied-bundle.md`.

Fix: `"signingIdentity": "-"` under `bundle.macOS` in `src-tauri/tauri.macos.conf.json`. Tauri now
ad-hoc signs the whole bundle on every build. A release build with the signing secrets still
gets its identity from `APPLE_SIGNING_IDENTITY` (`release-tauri.yml`). That override is not
verified in CI. A release build without the secrets now gets a whole-bundle ad-hoc signature
instead of a linker-only one.

## Live gate passed (2026-10-26)

- Rebuilt bundle: `Identifier=com.gamelib.shell`, `Info.plist entries=15`,
  `Sealed Resources version=2`, `flags=adhoc,runtime`.
- Launch (pid 60575): `notification authorization: granted=true error=None`.
- System Settings → Notifications shows one GameLib entry.
- Play Grim Dawn (219990): `notify(): "Steam DRM check not supported" accepted by
  UserNotifications (auth=authorized, alert=enabled, style=banner)`. The operator saw the banner.

A local `pnpm tauri build --debug` exits with "A public key has been found, but no private key"
from the updater-artifact step after the `.app` is built. Add
`--config '{"bundle":{"createUpdaterArtifacts":false}}'` to skip that step.
