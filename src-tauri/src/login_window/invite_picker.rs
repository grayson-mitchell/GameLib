//! Handler for the `bridge_invite_picker_open` rustInvoke channel (Phase 71 D-07, D-12): opens or
//! reuses the dedicated `bridge-invite` window. Child of `login_window`; sees its private items.

use super::*;

/// Label of the dedicated Tauri window that hosts the Steam bridge invite picker (quick
/// 261101-llf). Never `main` or `about`, and never carries the `external-` prefix, so it matches
/// exactly one capability: `capabilities/bridge-invite-picker.json`.
pub(crate) const BRIDGE_INVITE_WINDOW_LABEL: &str = "bridge-invite";

/// Build the app-relative URL (query included) the invite picker window loads. Pure, so the
/// injection surface is unit-tested without an `AppHandle`. Both ids end up in a URL, so they are
/// re-validated here even though the sidecar already produced them: `app_id` must be 1-10 ASCII
/// digits and `ack_id` must be 1-64 characters of `[0-9A-Za-z-]`. `& # % /` and spaces are all
/// rejected. The frontend parser (`src/common/bridgeInvitePicker.ts`) validates the same shape.
pub(crate) fn bridge_invite_picker_path(app_id: &str, ack_id: &str) -> Result<String, String> {
    if app_id.is_empty() || app_id.len() > 10 || !app_id.bytes().all(|b| b.is_ascii_digit()) {
        return Err("bridge_invite_picker_open:bad-app-id".to_string());
    }
    if ack_id.is_empty()
        || ack_id.len() > 64
        || !ack_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err("bridge_invite_picker_open:bad-ack-id".to_string());
    }
    Ok(format!(
        "index.html?window={BRIDGE_INVITE_WINDOW_LABEL}&appId={app_id}&ackId={ack_id}"
    ))
}

/// Navigation allow-list for the invite picker window: GameLib's own bundle origin only
/// (`tauri://localhost`, `http(s)://tauri.localhost`) or the configured dev server's origin.
/// Anything else (remote pages, `file:`, `about:`) is refused, so remote content can never load
/// into a window that holds a capability.
pub(crate) fn bridge_invite_nav_allowed(url: &tauri::Url, dev_url: Option<&tauri::Url>) -> bool {
    let bundle = match (url.scheme(), url.host_str()) {
        ("tauri", Some("localhost")) => true,
        ("http" | "https", Some("tauri.localhost")) => true,
        _ => false,
    };
    bundle || dev_url.is_some_and(|dev| url.origin() == dev.origin())
}

/// macOS focus bookkeeping for the invite picker: remember which app was frontmost (the game) so
/// closing the picker hands focus back to it instead of promoting the GameLib main window.
#[cfg(target_os = "macos")]
pub(crate) mod macos_invite_focus {
    use objc2::rc::Retained;
    use objc2::runtime::{AnyObject, Bool};
    use objc2::{class, msg_send};
    use std::sync::Mutex;

    #[derive(Clone, Copy)]
    pub struct PickerRestore {
        pub prev_pid: i32,
        pub app_was_hidden: bool,
        pub main_hidden_by_picker: bool,
    }

    pub static RESTORE: Mutex<Option<PickerRestore>> = Mutex::new(None);

    pub fn lock() -> std::sync::MutexGuard<'static, Option<PickerRestore>> {
        RESTORE.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Pid of the frontmost application and whether GameLib is Cmd+H-hidden. Main thread only.
    pub fn snapshot() -> (Option<i32>, bool) {
        let ws: Retained<AnyObject> = unsafe { msg_send![class!(NSWorkspace), sharedWorkspace] };
        let front: Option<Retained<AnyObject>> = unsafe { msg_send![&*ws, frontmostApplication] };
        let pid = front.map(|f| {
            let pid: i32 = unsafe { msg_send![&*f, processIdentifier] };
            pid
        });
        let ns_app: Retained<AnyObject> =
            unsafe { msg_send![class!(NSApplication), sharedApplication] };
        let hidden: Bool = unsafe { msg_send![&*ns_app, isHidden] };
        (pid, hidden.as_bool())
    }

    /// Re-activate the application with `pid`. Main thread only.
    pub fn activate(pid: i32) {
        let running: Option<Retained<AnyObject>> = unsafe {
            msg_send![class!(NSRunningApplication), runningApplicationWithProcessIdentifier: pid]
        };
        if let Some(r) = running {
            // NSApplicationActivateIgnoringOtherApps (2): deprecated on macOS 14+ but still
            // honoured, and the only way to force the hand-back when the picker is key.
            let _: Bool = unsafe { msg_send![&*r, activateWithOptions: 2usize] };
        }
    }
}

// Open (or reuse) the dedicated `bridge-invite` window that hosts the Steam bridge invite
// picker (quick 261101-llf). Replaces the 58-36 `main_window_raise` + push, which dragged
// the whole GameLib window over the game. `args[0]` is `{ appId, ackId }`; both are
// re-validated by `bridge_invite_picker_path` because they land in a URL. The main window
// is touched only to re-hide it after a Cmd+H-hidden GameLib was unhidden by activation.
pub(crate) fn rpc_bridge_invite_picker_open(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    let a = BridgeInvitePickerOpenArgs::from_args(args)?;
    let (appid, ack) = (a.app_id.as_str(), a.ack_id.as_str());
    let path = bridge_invite_picker_path(appid, ack)?;

    // Record the frontmost app (the game) BEFORE the picker takes focus. A re-open keeps
    // the first record so the game's pid is never replaced by GameLib's own.
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = mpsc_channel::<(Option<i32>, bool)>();
        app.run_on_main_thread(move || {
            let _ = tx.send(macos_invite_focus::snapshot());
        })
        .map_err(|e| e.to_string())?;
        let (pid, hidden) = rx.recv().map_err(|e| e.to_string())?;
        let mut rec = macos_invite_focus::lock();
        if rec.is_none() {
            if let Some(pid) = pid.filter(|p| *p != std::process::id() as i32) {
                *rec = Some(macos_invite_focus::PickerRestore {
                    prev_pid: pid,
                    app_was_hidden: hidden,
                    main_hidden_by_picker: false,
                });
            }
        }
    }

    let window = if let Some(existing) = app.get_webview_window(BRIDGE_INVITE_WINDOW_LABEL)
    {
        let url = existing
            .url()
            .and_then(|u| {
                u.join(&path)
                    .map_err(|e| tauri::Error::InvalidUrl(e.into()))
            })
            .map_err(|e| format!("bridge_invite_picker_open:build-failed:{e}"))?;
        existing
            .navigate(url)
            .map_err(|e| format!("bridge_invite_picker_open:build-failed:{e}"))?;
        existing
    } else {
        let dev_url = app.config().build.dev_url.clone();
        // `.title(..)` is a fixed string: WR-07's forged-title concern covers REMOTE login
        // windows; this one loads GameLib's own bundle.
        //
        // `always_on_top(true)` is deliberate, unlike the login windows: the picker must
        // float over a frontmost game even when macOS declines to activate GameLib.
        let built = tauri::WebviewWindowBuilder::new(
            app,
            BRIDGE_INVITE_WINDOW_LABEL,
            tauri::WebviewUrl::App(path.into()),
        )
        .title("Invite a friend")
        .inner_size(520.0, 640.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .always_on_top(true)
        .center()
        .focused(true)
        .on_navigation(move |url| bridge_invite_nav_allowed(url, dev_url.as_ref()))
        .build()
        .map_err(|e| format!("bridge_invite_picker_open:build-failed:{e}"))?;
        #[cfg(target_os = "macos")]
        {
            let app_for_event = app.clone();
            // Aliased so this handler is not mistaken for the main window's quit-routing
            // `CloseRequested` handler by the shell-source gates that locate that one.
            use tauri::WindowEvent as PickerEvt;
            built.on_window_event(move |event| match event {
                // Hand focus back to the game BEFORE the window is gone, so AppKit does
                // not promote the main window to key. Not prevented: the close proceeds.
                PickerEvt::CloseRequested { .. } => {
                    let prev = macos_invite_focus::lock().map(|r| r.prev_pid);
                    if let Some(pid) = prev {
                        macos_invite_focus::activate(pid);
                    }
                }
                PickerEvt::Destroyed => {
                    let rec = macos_invite_focus::lock().take();
                    if rec.is_some_and(|r| r.main_hidden_by_picker) {
                        if let Some(main) =
                            app_for_event.get_webview_window(MAIN_WINDOW_LABEL)
                        {
                            let _ = main.show();
                        }
                        // Back-to-back show + hide restores the pre-invite Cmd+H state.
                        let _ = app_for_event.hide();
                    }
                }
                _ => {}
            });
        }
        built
    };
    let _ = window.set_focus();

    // GameLib was Cmd+H-hidden: activating it unhid every window, including main.
    #[cfg(target_os = "macos")]
    {
        let mut rec = macos_invite_focus::lock();
        if let Some(r) = rec.as_mut().filter(|r| r.app_was_hidden) {
            if let Some(main) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                let _ = main.hide();
                r.main_hidden_by_picker = true;
            }
        }
    }
    Ok(Value::Null)
}
