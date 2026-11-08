//! Handler for the `bridge_invite_picker_open` rustInvoke channel (Phase 71 D-07, D-12): opens or
//! reuses the dedicated `bridge-invite` window. Child of `login_window`; sees its private items.

use super::*;

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
