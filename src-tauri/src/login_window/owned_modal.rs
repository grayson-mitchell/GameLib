//! Owned + modal store login window on Windows/Linux (quick-261111-d7o). Child of `login_window`; sees its private items.
//!
//! Compiles nowhere on macOS: there the AppKit sheet (`sheet.rs`) owns this job, and every item
//! here is gated off macOS at the `mod` declaration in `login_window.rs`.
//!
//! The visible login window (Epic, GOG, Amazon and Humble all share one arm off macOS) is OWNED
//! by `main`: it stays above main, has no taskbar button of its own, and is centered over main.
//! On Windows main is also DISABLED while the login is up, and re-enabled and re-focused on every
//! close path through the single choke point `release_owned_login_modal`. On Linux the window is
//! GTK-modal and transient for main (best effort). Hidden reveal/clear windows are never owned,
//! never registered, and never disable main.
//!
//! This module uses the raw owner setters (`owner_raw` on Windows, `transient_for_raw` on Linux)
//! and NOT `WebviewWindowBuilder::parent()`: `parent()` returns `Result<Self>` and CONSUMES the
//! builder on `Err`, so a failed owner-handle read would turn into a failed login. The raw setters
//! are infallible once the native handle is in hand, and a miss here simply leaves the builder
//! untouched so the login opens exactly as before (free-floating, centered on screen, focused).

use super::*;

/// Labels of the visible login windows that currently hold `main` modal. A window is added by
/// `present_owned_login_window` and removed by `release_owned_login_modal`; main is re-enabled only
/// when the last label leaves.
static OWNED_LOGIN_LABELS: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// Run `f` over the registry. A poisoned lock is recovered rather than propagated, so a panic
/// elsewhere can never strand main disabled (T-d7o-01).
fn with_owned_labels<R>(f: impl FnOnce(&mut Vec<String>) -> R) -> R {
    let mut guard = OWNED_LOGIN_LABELS
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    f(&mut guard)
}

/// Add `label` to the registry. Idempotent: registering the same label twice leaves one entry.
fn owned_label_register(labels: &mut Vec<String>, label: &str) {
    if !labels.iter().any(|l| l == label) {
        labels.push(label.to_string());
    }
}

/// Remove `label` from the registry. Returns true only when the label was present AND the registry
/// is now empty, i.e. main must be re-enabled. A label that was never registered (a hidden
/// reveal/clear window) or was already released returns false and leaves the registry unchanged.
fn owned_label_release(labels: &mut Vec<String>, label: &str) -> bool {
    let before = labels.len();
    labels.retain(|l| l != label);
    labels.len() != before && labels.is_empty()
}

/// Try to make `main` the owner of the login window being built. On success returns the builder
/// with the native owner set, `skip_taskbar(true)` and `visible(false)` (built hidden so it can be
/// positioned before it ever paints, with no screen-center flash), plus main. Any miss returns the
/// builder untouched and `None` after one fixed-string log line (never a URL, origin or title,
/// T-34.4.1-106), and the caller keeps today's centered+focused behavior.
pub(crate) fn attach_login_owner<'a>(
    app: &AppHandle,
    builder: tauri::WebviewWindowBuilder<'a, tauri::Wry, AppHandle>,
) -> (
    tauri::WebviewWindowBuilder<'a, tauri::Wry, AppHandle>,
    Option<tauri::WebviewWindow>,
) {
    let Some(main) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        shell_eprintln!("[shell] humble_login_open: owner not attached (no main window)");
        return (builder, None);
    };
    if !matches!(main.is_visible(), Ok(true)) || !matches!(main.is_minimized(), Ok(false)) {
        shell_eprintln!("[shell] humble_login_open: owner not attached (main hidden or minimized)");
        return (builder, None);
    }
    #[cfg(windows)]
    let builder = match main.hwnd() {
        Ok(hwnd) => builder.owner_raw(hwnd),
        Err(e) => {
            shell_eprintln!(
                "[shell] humble_login_open: owner not attached (owner handle unavailable: {e})"
            );
            return (builder, None);
        }
    };
    #[cfg(target_os = "linux")]
    let builder = match main.gtk_window() {
        Ok(gw) => builder.transient_for_raw(&gw),
        Err(e) => {
            shell_eprintln!(
                "[shell] humble_login_open: owner not attached (owner handle unavailable: {e})"
            );
            return (builder, None);
        }
    };
    (builder.skip_taskbar(true).visible(false), Some(main))
}

/// Present the (still hidden) owned login window: register it, hook the release listener, show it,
/// focus it, and on Windows disable main. `owner` is the main window `attach_login_owner` returned.
pub(crate) fn present_owned_login_window(
    app: &AppHandle,
    window: &tauri::WebviewWindow,
    owner: &tauri::WebviewWindow,
    label: &str,
) {
    #[cfg(not(windows))]
    let _ = owner;
    // 1. Register.
    with_owned_labels(|labels| owned_label_register(labels, label));
    // 2. Second close listener. Aliased so it is not mistaken for the main window's quit-routing
    // close handler by the shell-source gates that locate that one (invite_picker.rs does the
    // same). Never vetoes the close. The close-requested variant covers the title-bar close and
    // `humble_login_close`'s `window.close()`; `Destroyed` is the catch-all for `destroy()` and
    // owner teardown.
    {
        use tauri::WindowEvent as LoginWinEvt;
        let app_for_release = app.clone();
        let label_for_release = label.to_string();
        window.on_window_event(move |event| {
            if matches!(
                event,
                LoginWinEvt::CloseRequested { .. } | LoginWinEvt::Destroyed
            ) {
                release_owned_login_modal(&app_for_release, &label_for_release);
            }
        });
    }
    // (positioning goes here)
    // 3. Show. A window that is not on screen must never leave main disabled.
    if let Err(e) = window.show() {
        shell_eprintln!("[shell] WARN: humble_login_open: '{label}' owned window show failed: {e}");
        release_owned_login_modal(app, label);
        return;
    }
    // 4. Focus.
    if let Err(e) = window.set_focus() {
        shell_eprintln!(
            "[shell] WARN: humble_login_open: '{label}' owned window focus failed: {e}"
        );
    }
    // (Linux GTK modal goes here)
    // 5. Windows: disable main on the main thread, only while the label is still registered. The
    // release listener also runs on the main thread, so a close that landed first has already
    // removed the label and the disable is skipped.
    #[cfg(windows)]
    {
        let owner_for_disable = owner.clone();
        let app_for_disable = app.clone();
        let label_for_disable = label.to_string();
        let queued = app.run_on_main_thread(move || {
            let still_registered =
                with_owned_labels(|labels| labels.iter().any(|l| l == &label_for_disable));
            if !still_registered {
                return;
            }
            if let Err(e) = owner_for_disable.set_enabled(false) {
                shell_eprintln!(
                    "[shell] WARN: humble_login_open: '{label_for_disable}' could not disable main: {e}"
                );
                release_owned_login_modal(&app_for_disable, &label_for_disable);
            }
        });
        if let Err(e) = queued {
            shell_eprintln!(
                "[shell] WARN: humble_login_open: '{label}' could not queue main disable: {e}"
            );
            release_owned_login_modal(app, label);
            return;
        }
    }
    // 6.
    shell_eprintln!("[shell] humble_login_open: '{label}' presented owned by main (modal)");
}

/// The single choke point for every close path. Idempotent: the close-requested listener and then
/// `Destroyed` both fire for one window, and main is re-enabled once only.
fn release_owned_login_modal(app: &AppHandle, label: &str) {
    if !with_owned_labels(|labels| owned_label_release(labels, label)) {
        return;
    }
    let Some(main) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        shell_eprintln!("[shell] humble_login_open: '{label}' released; main window gone");
        return;
    };
    #[cfg(windows)]
    if let Err(e) = main.set_enabled(true) {
        shell_eprintln!("[shell] WARN: humble_login_open: '{label}' could not re-enable main: {e}");
    }
    if let Err(e) = main.set_focus() {
        shell_eprintln!("[shell] WARN: humble_login_open: '{label}' could not re-focus main: {e}");
    }
    shell_eprintln!("[shell] humble_login_open: '{label}' released; main re-enabled and focused");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_adds_the_label_and_is_idempotent() {
        let mut labels = Vec::new();
        owned_label_register(&mut labels, "login-1");
        assert_eq!(labels, vec!["login-1".to_string()]);
        owned_label_register(&mut labels, "login-1");
        assert_eq!(labels.len(), 1);
    }

    #[test]
    fn releasing_an_unregistered_label_is_a_no_op() {
        let mut labels = vec!["login-1".to_string()];
        assert!(!owned_label_release(&mut labels, "hidden-clear-2"));
        assert_eq!(labels, vec!["login-1".to_string()]);
        let mut empty: Vec<String> = Vec::new();
        assert!(!owned_label_release(&mut empty, "hidden-clear-2"));
        assert!(empty.is_empty());
    }

    #[test]
    fn main_is_re_enabled_only_when_the_last_label_leaves() {
        let mut labels = Vec::new();
        owned_label_register(&mut labels, "a");
        owned_label_register(&mut labels, "b");
        assert!(!owned_label_release(&mut labels, "a"));
        assert!(owned_label_release(&mut labels, "b"));
    }

    #[test]
    fn releasing_twice_re_enables_once_only() {
        let mut labels = Vec::new();
        owned_label_register(&mut labels, "a");
        assert!(owned_label_release(&mut labels, "a"));
        assert!(!owned_label_release(&mut labels, "a"));
    }
}
