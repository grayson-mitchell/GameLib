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
