---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
reviewed: 2026-10-25T00:00:00Z
depth: standard
scope: gap round 52-36 (diff 1c295e3ea..HEAD)
files_reviewed: 8
files_reviewed_list:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src-tauri/src/notification_backend.rs
  - src-tauri/src/main.rs
  - src/backend/platform/index.ts
  - src/common/types/sidecarTransport.ts
  - src/backend/dialog/dialog.ts
  - src/backend/__tests__/notificationFailureLogging.test.ts
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
status: issues_found
---

# Phase 52: Code Review Report (gap round 52-36)

**Reviewed:** 2026-10-25
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

This round reviewed only the 52-36 changes: the in-app forwarded-SteamStub dialog in
`maybeNotifySteamStubForwarded`, the `backend_label` wire value that `notification_show` now
resolves, the `'show'` event in the platform `Notification` shim, and the delivery-result log in
`notify()`.

The wiring is correct. The labels match on both sides, the macOS UN path returns early so the
plugin label cannot be misreported, the body is never logged, and the launch order and session
gate are as planned. There are no blockers.

The main concern is the round's own goal, which is to make delivery observable. Two of the new
log lines claim more than the code can know:

- `accepted by UserNotifications` is logged for Provisional and Ephemeral grants, and for
  Authorized grants with alerts turned off. None of those show a banner.
- `dispatched=in-app-dialog+notify` is logged no matter what. The dialog it reports is as
  fire-and-forget as the OS banner it was added to back up.

One new test can never fail.

## Warnings

### WR-01: "accepted by UserNotifications" hides the authorization level and alert setting, so it can't tell a shown banner from a silent one

**File:** `src-tauri/src/macos_notifications.rs:136-139` (gate), `src-tauri/src/main.rs:7867-7874`, `src/backend/dialog/dialog.ts:113-122`
**Issue:** `deliver()` passes `authorization_gate` for `Authorized | Provisional | Ephemeral`
(`notification_backend.rs:70`). It returns `Ok(())` once `addNotificationRequest` completes
without error. The 52-36 arm turns every such `Ok` into the bare label `"user-notifications"`,
and `notify()` logs `accepted by UserNotifications`.

But a Provisional grant delivers quietly to Notification Center with no banner. So does an
Authorized grant whose `alertSetting`/`alertStyle` is None, or a run where Focus is active.
These are exactly the item-30 symptoms: the operator saw nothing although the settings looked
enabled. The new line logs the same text whether the banner appeared or not.

The bundled-app `granted=false` (UNErrorDomain 1) issue is already tracked by a todo. This
finding is about something else: the 52-36 log gives the triager nothing to separate those
cases. Read with the plan's wording ("a log can therefore tell an accepted notification from a
fire-and-forget hand-off"), the line looks like proof of display when it is not.
**Fix:** Keep the `UNNotificationSettings` already read in step (1) and return it with the
label. One option is a structured value `{ backend: "user-notifications", auth: "provisional",
alert: "disabled" }`. Another is an extended label such as
`user-notifications;auth=provisional;alert=0`. Log it:

```ts
// dialog.ts
`notify(): "${title}" accepted by UserNotifications (auth=${auth}, alerts=${alert})`
```

At minimum, return a distinct label or a warning for Provisional/Ephemeral, and for
`alertSetting != Enabled`.

### WR-02: The "throwing show listener does not escape" test can never fail

**File:** `src/backend/__tests__/notificationFailureLogging.test.ts:134-143`
**Issue:** The test has no assertion. If the `try/catch` around the `'show'` listener were
removed, the throw would still be swallowed: it would reject the `.then`, then fall into the
chained `.catch` (`platform/index.ts:647-665`), which console.warns and calls the `failed`
listeners. Nothing escapes in either case, so the test passes whether the guard is there or
not. It also misses the real regression, where a show-listener throw gets reported as a
notification failure.
**Fix:**

```ts
const failed = jest.fn()
n.on('failed', failed)
n.show()
await flush()
expect(console.warn).toHaveBeenCalledWith(
  "[electronStub] Notification 'show' listener threw:", 'boom')
expect(failed).not.toHaveBeenCalled()
```

### WR-03: `dispatched=in-app-dialog+notify` is logged unconditionally, so it proves no more than the OS banner did

**File:** `src/backend/storeManagers/steam/games.ts:2806-2811`, `src/backend/dialog/dialog.ts:33-59`
**Issue:** The new doc comment says an OS banner "cannot prove the notice was shown", and gives
that as the reason for the dialog. But `showDialogBoxModalAuto` returns `void`, and the code
ignores `sendFrontendMessage`'s boolean. In the sidecar, `sendFrontendMessage` always returns
`true` anyway: the stub window's `isDestroyed()` is a constant `false` (`platform/index.ts:747,774`).
The frame is then forwarded as a SidecarNotification, with no acknowledgement that a listener
was mounted.

A launch that reaches this branch before `DialogHandler` has subscribed loses the dialog
silently, yet still logs `dispatched=in-app-dialog+notify`. Examples are a protocol/CLI launch
during renderer boot, or a reload. On top of that, `GlobalState.handleShowDialogModal` holds one
dialog at a time (`GlobalState.tsx:814-819`), so any later `showDialog` replaces this notice
unseen. In the re-gate, the log line will be read as "the operator saw it", and it cannot carry
that weight.
**Fix:** Return the `sendFrontendMessage` result from `showDialogBoxModalAuto`'s non-event branch
and log what actually happened, e.g. `dispatched=in-app-dialog:${sent}+notify`. If the re-gate
needs proof of display, have `MessageBoxModal` mount/close emit a renderer-to-backend
acknowledgement, and log that instead. At minimum, reword the doc comment so it does not
suggest the dialog is confirmable.

## Info

### IN-01: `RustNotificationBackendLabel` is exported but nothing uses it, so the mirror is unenforced

**File:** `src/common/types/sidecarTransport.ts:196-197`, `src/backend/dialog/dialog.ts:113-120`, `src/backend/platform/index.ts:633`
**Issue:** No file imports the type. `dialog.ts` compares raw string literals, and the shim
passes any string through (`typeof result === 'string'`). If the Rust label were renamed, the
log would silently degrade to "handed off" with no type error.
**Fix:** Type the listener parameter as `backend?: RustNotificationBackendLabel`, narrow it in
the shim with a guard, and use a `switch` with an exhaustive `never` default in `dialog.ts`.

### IN-02: `.then(...).catch(...)` routes then-handler failures to the `failed` listeners

**File:** `src/backend/platform/index.ts:629-665`
**Issue:** The `.catch` also catches anything thrown inside the `.then` body outside the
per-listener `try`. That would emit `failed` ("was not delivered") for a notification that was
in fact accepted. This can't happen today, but the shape invites it.
**Fix:** Use `.then(onFulfilled, onRejected)` so the two outcomes stay separate.

### IN-03: The separate-session-gates test does not check dialog counts

**File:** `src/backend/storeManagers/steam/__tests__/games.test.ts:2461-2482`
**Issue:** The test asserts nothing about `dialogMock`. A regression where the unforwarded
notice also opened the dialog, or where the forwarded dialog was gated on the unforwarded set,
would pass.
**Fix:** Add `expect(dialogMock).not.toHaveBeenCalled()` after the first launch and
`expect(dialogMock).toHaveBeenCalledTimes(1)` after the second.

### IN-04: The shim header comment is stale

**File:** `src/backend/platform/index.ts:578-587`
**Issue:** The comment still says `show()` forwards "inside a try/catch". It also documents only
the `'failed'` event; only the `on()` comment was updated for `'show'`.
**Fix:** Add one sentence about the `'show'` event and its `(event, backend label | undefined)`
payload, and correct the try/catch wording.

### IN-05: The forwarded-notice dialog has no OK button

**File:** `src/backend/storeManagers/steam/games.ts:2807`
**Issue:** No `buttons` are passed, so `MessageBoxModal` renders an empty footer, with only the
header close button. Other in-app notices pass `[{ text: i18next.t('box.ok', 'OK') }]`
(`shellFilesFlowRegistration.ts:276`, `appShellFlowRegistration.ts:437`).
**Fix:** Pass `buttons: [{ text: i18next.t('box.ok', 'OK') }]`, and update the test's
`toHaveBeenCalledWith` to match.

---

_Reviewed: 2026-10-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
