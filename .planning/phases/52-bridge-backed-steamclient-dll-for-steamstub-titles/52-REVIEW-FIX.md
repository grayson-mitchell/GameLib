---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
fixed_at: 2026-10-25T00:00:00Z
review_path: .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 52: Code Review Fix Report

**Fixed at:** 2026-10-25
**Source review:** .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 3 (WR-01..WR-03; IN-01..IN-05 out of scope)
- Fixed: 3
- Skipped: 0 (one optional part of WR-03 deferred, see below)

## Fixed Issues

### WR-01: "accepted by UserNotifications" hides the authorization level and alert setting

**Files modified:** `src-tauri/src/notification_backend.rs`, `src-tauri/src/macos_notifications.rs`, `src-tauri/src/main.rs`, `src/backend/dialog/dialog.ts`, `src/common/types/sidecarTransport.ts`, `src/backend/__tests__/notificationFailureLogging.test.ts`
**Commit:** 4afaf8fbe
**Status:** fixed: requires human verification (the macOS FFI read of `alertSetting`/`alertStyle` compiles and the pure label is unit-tested, but only a bundled-app run exercises it live)
**Applied fix:**

- `deliver()` reads `authorizationStatus`, `alertSetting` and `alertStyle` from the same `UNNotificationSettings` object. On success it returns the new pure `user_notifications_label()`, for example `user-notifications;auth=provisional;alert=disabled;style=none`.
- The `notification_show` arm resolves that string. The plugin label is unchanged.
- `notify()` splits the label on `;`. The `accepted by UserNotifications` substring is kept verbatim, and the settings are appended in brackets.
- Authorized + alerts enabled + banner/alert style stays a `logInfo` line ending "banner-eligible; display not confirmed (Focus is not visible to this check)".
- Every other combination (provisional, ephemeral, alerts disabled, style none) becomes a `logWarning` line that says macOS will not show a banner.
- A bare `user-notifications` label from an older shell logs "(presentation settings not reported; display not confirmable)".
- `RustNotificationBackendLabel` and the doc comments were widened and corrected to match.
- New tests: one Rust unit test, plus jest cases for the banner-eligible line, the four quiet cases, and the older-shell case.

### WR-02: The "throwing show listener does not escape" test can never fail

**Files modified:** `src/backend/__tests__/notificationFailureLogging.test.ts`
**Commit:** d7badc479
**Applied fix:** The test now registers a `failed` listener. It asserts the guard's own `"[electronStub] Notification 'show' listener threw:", 'boom'` warn and that `failed` is never called. Mutation check: with the per-listener try/catch removed from `platform/index.ts`, the test fails. With the guard restored, it passes.

### WR-03: `dispatched=in-app-dialog+notify` is logged unconditionally

**Files modified:** `src/backend/dialog/dialog.ts`, `src/backend/storeManagers/steam/games.ts`, `src/backend/storeManagers/steam/__tests__/games.test.ts`, `src/backend/utils.ts`
**Commit:** 2d59ea7a7
**Applied fix:**

- `showDialogBoxModalAuto` now returns `boolean`: `true` on the event branch, `sendFrontendMessage`'s own result otherwise, and `false` on the throw/native-fallback branch. Its comment states that `true` is not proof of display.
- `maybeNotifySteamStubForwarded` logs `[bridge-notice] appId=<id> dispatched=in-app-dialog+notify dialog-frame-sent=<bool> display=unconfirmed`. The recorded token is unchanged and only fields are added.
- Its doc comment no longer suggests the dialog is confirmable where the OS banner is not. It names the reasons the dialog is unconfirmable too: no renderer acknowledgement, a frame lost before `DialogHandler` subscribes, and the renderer holding one dialog at a time.
- The launch order (`cfg, setup, notify, dialog, wine`) and the per-session gate are unchanged.
- `utils.ts` had two `return showDialogBoxModalAuto(...)` sites in a `void` function, which the new return type made a TS error. Each now calls it, then `return`s. The behaviour is the same.
- Tests: the dispatch-log helper matches the stable prefix. The ordered-launch test asserts the full `dialog-frame-sent=true display=unconfirmed` line, and a new test covers `dialog-frame-sent=false`.

**Deferred (not built):** A real display acknowledgement would have `MessageBoxModal` mount/close emit a renderer-to-backend event, and the log would record that. It is a new cross-layer feature, not a fix. It is needed only if the re-gate requires proof of display, so it is left for a separate decision.

## Verification run

- `cargo fmt --check`: clean. `cargo build`: ok. `cargo test` in `src-tauri`: 408 passed, 0 failed, 2 ignored. Built against an APFS clone of the main target dir, with the gitignored sidecar binary and `build/` resources cloned into the worktree.
- `npx prettier --check` on exactly the changed TS paths for each commit: clean.
- `pnpm codecheck`: exit 0 after WR-01, and after WR-03 once the `utils.ts` change was in.
- jest:
  - `games.test.ts` + `notificationFailureLogging.test.ts`: 385 passed.
  - Wider set, 18 suites touching `showDialogBoxModalAuto` / the utils error path: 731 passed, 0 failed.
- Log tokens kept verbatim: `[bridge-notice] appId=<id> dispatched=in-app-dialog+notify`, `accepted by UserNotifications`, `handed to tauri-plugin-notification (delivery not confirmable)`, `was not delivered`.

---

_Fixed: 2026-10-25_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
