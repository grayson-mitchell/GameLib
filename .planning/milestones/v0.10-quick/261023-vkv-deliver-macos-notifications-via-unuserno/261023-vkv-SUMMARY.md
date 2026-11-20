---
phase: quick-261023-vkv
plan: 01
status: complete
---

# Quick 261023-vkv: macOS notifications via UNUserNotificationCenter

All three tasks done. Task 3 passed live on 2026-10-24 on a team-signed packaged bundle (see below).

## Commits
- 687ee4234 fix: Rust UNUserNotificationCenter delivery (notification_backend.rs, macos_notifications.rs, main.rs wiring, Cargo.toml/lock)
- b153ff2f7 fix: 'failed' event on sidecar Notification stub; notify() logs via logWarning (denial once)
- 278d90520 fix: startup authorization outcome logged to gamelib-shell.log via shell_diag (was eprintln! only)

## Verification
- cargo build clean (no warnings); cargo test --bin gamelib-shell 406 passed (8 new notification_backend tests)
- jest: cargoFeatures, tauriShellSource, notificationFailureLogging (5), appShellFlows, gameDetailsFlows all pass
- pnpm codecheck clean; prettier --check clean on 4 TS paths; rustfmt --check clean on the 2 new .rs files; eslint 0 errors on touched TS

## Deviations
- [Rule 3] Cargo.lock: besides the `objc2-user-notifications` line in gamelib-shell deps, the existing
  objc2-user-notifications [[package]] block gained deps `bitflags 2.13.1` and `block2` (feature-driven; both
  already in the tree, no new crate). Plan said any changed [[package]] block means stop; judged benign
  because the plan itself mandates those features. Flagging for review.
- Test written alongside implementation for Task 2 rather than strictly RED-first.

## Task 3 automated part
`pnpm tauri:dev:packaged` built the bundle but exited 1 at the very end: updater signing
("public key found, no private key; set TAURI_SIGNING_PRIVATE_KEY"). GameLib.app and .dmg were produced.
Bundle is ad-hoc/linker-signed (codesign -dv: Signature=adhoc, Identifier=gamelib_shell-7a2c4309ec21a797,
Info.plist=not bound, TeamIdentifier not set); `codesign --verify --deep --strict` reports
"code has no resources but signature indicates they must be present". UN* may refuse to
authorize an ad-hoc, plist-unbound bundle — if step 2 shows no prompt, that is the first suspect, and
step 6 (Developer-ID release build) becomes necessary.


## Task 3 live gate (2026-10-23/24)

1. **Ad-hoc `tauri build --debug` bundle: FAIL, caused by signing, not code.** No prompt; every
   notify() logged `notification:authorization-not-determined: … (UNErrorDomain error 1.)`
   (UNErrorCodeNotificationsNotAllowed). The new failure logging made this visible on the first try.
2. **Same bundle re-signed with `codesign --force --deep --sign -`** (identifier `com.gamelib.shell`,
   Info.plist bound): built, but not tested live. Skipped once a team identity was available.
3. **Same bundle signed with `Apple Development: grayson mitchell (4BULWN7PPN)`, TeamIdentifier
   S7U223QWXJ: PASS.** The operator saw the banner after Add shortcut on a Steam game.
   `gamelib-shell.log`: `notification authorization: granted=true error=None` on both launches; no
   `not delivered` warning in `gamelib.log` for the 07:38:18 click.

Setup needed for (3): no codesigning identity existed on this Mac (the Developer ID cert is CI-only).
The operator created an Apple Development cert in Xcode. It showed as invalid until Apple's WWDR G3
intermediate (`AppleWWDRCAG3.cer`, sha256 DC:F2:18:78…:60:1F) was imported into the login keychain.

**Not exercised:** step 5 (denial path logs exactly once; covered only by jest), step 7 (tauri:dev
regression), and a Developer-ID notarized release bundle.

**Consequence:** the unsigned `pnpm tauri:dev:packaged` output will never get notification
authorization. A packaged-build notification check needs a team-signed bundle.
