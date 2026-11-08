//! Handler for the `notification_show` rustInvoke channel (Phase 71 D-07). A separate flat sibling
//! because `notification_backend.rs` is AppHandle-free and excluded from the combined shell
//! source (71-RESEARCH Pitfall 10); a pin over this body must still see it.

use super::*;

// Real OS notification (Phase 33 Plan 04, D-05). Backs `platform/index.ts`'s
// `Notification.show()`. Mirrors `dialog_message`'s args-parse idiom -- read an optional
// `title`/`body` from args[0]. No icon/nativeImage plumbing.
//
// Quick task 261023-vkv: on a packaged macOS bundle the notification goes through
// `macos_notifications::deliver` (`UNUserNotificationCenter`), and its `notification:*`
// Err strings reach the sidecar as a rejection (logged via `logWarning`). That path
// waits at most two `NOTIFICATION_COMPLETION_TIMEOUT`s on this worker thread. Dev and
// non-bundled runs, and Windows/Linux, use `tauri-plugin-notification` below, whose
// `show()` dispatches its work onto `tauri::async_runtime::spawn` and returns promptly.
pub(crate) fn rpc_notification_show(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    let opts = NotificationShowArgs::from_args(args)?;
    let title = opts.title.as_deref();
    let body = opts.body.as_deref();
    #[cfg(target_os = "macos")]
    if macos_notifications::backend()
        == notification_backend::NotificationBackend::UserNotifications
    {
        // Resolves `user-notifications;auth=..;alert=..;style=..`
        // (`notification_backend::user_notifications_label`): acceptance by UN* is not
        // proof of a banner, so the settings that decide that travel with it (52-REVIEW
        // WR-01).
        return macos_notifications::deliver(title, body).map(Value::String);
    }
    let mut builder = app.notification().builder();
    if let Some(title) = title {
        builder = builder.title(title);
    }
    if let Some(body) = body {
        builder = builder.body(body);
    }
    builder.show().map_err(|e| e.to_string())?;
    // Resolve the backend label, not null: it makes delivery observable, and the
    // plugin's Ok does not mean delivered (52-UAT item 30).
    Ok(Value::String(
        notification_backend::backend_label(
            notification_backend::NotificationBackend::Plugin,
        )
        .to_string(),
    ))
}
