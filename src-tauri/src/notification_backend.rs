//! Quick task 261023-vkv: the cfg-free, pure half of macOS notification delivery.
//!
//! `macos_notifications` (macOS-only, objc2 FFI) does the actual `UNUserNotificationCenter`
//! work; everything that can be decided without touching AppKit lives here so `cargo test`
//! covers it on every OS: which backend to use, how an authorization status maps onto the
//! `notification:*` error-string contract the sidecar matches on, and the completion timeout.

use std::time::Duration;

/// Bounded wait for each `UNUserNotificationCenter` completion handler. Well under the
/// sidecar's 60s `RUST_INVOKE_TIMEOUT_MS`, same reasoning as `KEYRING_READ_TIMEOUT`: a wedged
/// OS daemon must surface as a named error, never as the generic sidecar RPC timeout.
pub const NOTIFICATION_COMPLETION_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NotificationBackend {
    /// `tauri-plugin-notification` (dev builds, non-bundled binaries, other OSes).
    Plugin,
    /// `UNUserNotificationCenter` (packaged macOS `.app`).
    UserNotifications,
}

/// UN* needs a real bundle: outside one, `currentNotificationCenter` raises
/// "bundleProxyForCurrentProcess is nil". `tauri dev` also deliberately keeps the plugin path.
pub fn select_notification_backend(
    is_dev: bool,
    bundle_identifier: Option<&str>,
    bundle_path_is_app: bool,
) -> NotificationBackend {
    if is_dev || bundle_identifier.is_none() || !bundle_path_is_app {
        NotificationBackend::Plugin
    } else {
        NotificationBackend::UserNotifications
    }
}

/// The wire value the `notification_show` arm resolves (mirrored by
/// `RustNotificationBackendLabel` in `src/common/types/sidecarTransport.ts`), so the sidecar
/// can log which backend took a notification.
pub fn backend_label(backend: NotificationBackend) -> &'static str {
    match backend {
        NotificationBackend::Plugin => "plugin",
        NotificationBackend::UserNotifications => "user-notifications",
    }
}

/// The `notification_show` wire value for a request `UNUserNotificationCenter` accepted, e.g.
/// `user-notifications;auth=provisional;alert=disabled;style=none`. The prefix is
/// `backend_label(UserNotifications)`; the fields come from the `UNNotificationSettings` read on
/// the same call (52-REVIEW WR-01). Acceptance alone does not mean a banner was shown:
/// Provisional and Ephemeral grants, or an Authorized grant whose alerts are disabled or whose
/// alert style is None, deliver quietly to Notification Center. Focus / Do Not Disturb is not
/// in `UNNotificationSettings`, so no field here can rule it out.
pub fn user_notifications_label(
    auth: AuthStatus,
    alert_setting: isize,
    alert_style: isize,
) -> String {
    format!(
        "{};auth={};alert={};style={}",
        backend_label(NotificationBackend::UserNotifications),
        auth_status_name(auth),
        notification_setting_name(alert_setting),
        alert_style_name(alert_style)
    )
}

fn auth_status_name(status: AuthStatus) -> String {
    match status {
        AuthStatus::NotDetermined => "not-determined".to_string(),
        AuthStatus::Denied => "denied".to_string(),
        AuthStatus::Authorized => "authorized".to_string(),
        AuthStatus::Provisional => "provisional".to_string(),
        AuthStatus::Ephemeral => "ephemeral".to_string(),
        AuthStatus::Unknown(n) => format!("unknown({n})"),
    }
}

/// `UNNotificationSetting` raw values.
fn notification_setting_name(raw: isize) -> String {
    match raw {
        0 => "not-supported".to_string(),
        1 => "disabled".to_string(),
        2 => "enabled".to_string(),
        n => format!("unknown({n})"),
    }
}

/// `UNAlertStyle` raw values.
fn alert_style_name(raw: isize) -> String {
    match raw {
        0 => "none".to_string(),
        1 => "banner".to_string(),
        2 => "alert".to_string(),
        n => format!("unknown({n})"),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthStatus {
    NotDetermined,
    Denied,
    Authorized,
    Provisional,
    Ephemeral,
    Unknown(isize),
}

pub fn auth_status_from_raw(raw: isize) -> AuthStatus {
    match raw {
        0 => AuthStatus::NotDetermined,
        1 => AuthStatus::Denied,
        2 => AuthStatus::Authorized,
        3 => AuthStatus::Provisional,
        4 => AuthStatus::Ephemeral,
        n => AuthStatus::Unknown(n),
    }
}

/// Maps an authorization status onto the error-string contract mirrored by
/// `RUST_NOTIFICATION_AUTH_DENIED_PREFIX` in `src/common/types/sidecarTransport.ts`.
pub fn authorization_gate(status: AuthStatus, startup_error: Option<&str>) -> Result<(), String> {
    match status {
        AuthStatus::Authorized | AuthStatus::Provisional | AuthStatus::Ephemeral => Ok(()),
        AuthStatus::Denied => Err("notification:authorization-denied".to_string()),
        AuthStatus::NotDetermined => Err(match startup_error {
            Some(e) => format!("notification:authorization-not-determined: {e}"),
            None => "notification:authorization-not-determined".to_string(),
        }),
        AuthStatus::Unknown(n) => Err(format!("notification:authorization-denied (status {n})")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: Option<&str> = Some("com.gamelib.shell");

    #[test]
    fn dev_always_uses_plugin() {
        assert_eq!(
            select_notification_backend(true, ID, true),
            NotificationBackend::Plugin
        );
        assert_eq!(
            select_notification_backend(true, None, false),
            NotificationBackend::Plugin
        );
    }

    #[test]
    fn no_bundle_identifier_uses_plugin() {
        assert_eq!(
            select_notification_backend(false, None, true),
            NotificationBackend::Plugin
        );
    }

    #[test]
    fn non_app_bundle_path_uses_plugin() {
        assert_eq!(
            select_notification_backend(false, ID, false),
            NotificationBackend::Plugin
        );
    }

    #[test]
    fn packaged_app_uses_user_notifications() {
        assert_eq!(
            select_notification_backend(false, ID, true),
            NotificationBackend::UserNotifications
        );
    }

    #[test]
    fn backend_labels_are_the_wire_values() {
        assert_eq!(
            backend_label(NotificationBackend::UserNotifications),
            "user-notifications"
        );
        assert_eq!(backend_label(NotificationBackend::Plugin), "plugin");
    }

    #[test]
    fn user_notifications_label_carries_auth_and_alert_settings() {
        assert_eq!(
            user_notifications_label(AuthStatus::Authorized, 2, 1),
            "user-notifications;auth=authorized;alert=enabled;style=banner"
        );
        assert_eq!(
            user_notifications_label(auth_status_from_raw(3), 1, 0),
            "user-notifications;auth=provisional;alert=disabled;style=none"
        );
        assert_eq!(
            user_notifications_label(AuthStatus::Ephemeral, 0, 2),
            "user-notifications;auth=ephemeral;alert=not-supported;style=alert"
        );
        assert_eq!(
            user_notifications_label(AuthStatus::Unknown(9), 5, 6),
            "user-notifications;auth=unknown(9);alert=unknown(5);style=unknown(6)"
        );
    }

    #[test]
    fn deliverable_statuses_pass() {
        for raw in [2, 3, 4] {
            assert_eq!(authorization_gate(auth_status_from_raw(raw), None), Ok(()));
        }
    }

    #[test]
    fn denied_and_not_determined_map_to_contract_strings() {
        let denied = authorization_gate(AuthStatus::Denied, None).unwrap_err();
        assert!(denied.starts_with("notification:authorization-denied"));
        let nd = authorization_gate(AuthStatus::NotDetermined, None).unwrap_err();
        assert_eq!(nd, "notification:authorization-not-determined");
    }

    #[test]
    fn unknown_status_maps_to_denied_with_number() {
        assert_eq!(
            authorization_gate(auth_status_from_raw(7), None).unwrap_err(),
            "notification:authorization-denied (status 7)"
        );
    }

    #[test]
    fn not_determined_carries_startup_error() {
        assert_eq!(
            authorization_gate(AuthStatus::NotDetermined, Some("boom")).unwrap_err(),
            "notification:authorization-not-determined: boom"
        );
    }
}
