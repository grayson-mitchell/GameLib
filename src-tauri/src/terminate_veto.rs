use super::*;

/// The sidecar `send` channel whose listener runs `handleExit()` (`appShellFlowRegistration.ts`
/// `ipcMain.on('quit', ...)`) -- the same path the in-app quit takes.
const SIDECAR_QUIT_CHANNEL: &str = "quit";

/// The sidecar `invoke` channel answered by `ipcMain.handle('health', async () => 'ok')`
/// (`sidecar/handlers.ts`). Used only to prove the sidecar's JS thread is answering before a
/// routed quit hands the decision to it.
const SIDECAR_HEALTH_CHANNEL: &str = "health";

/// How long a routed quit waits for the health probe before falling back to `exit(0)`. Bounds
/// only the PROBE: once the sidecar has answered, `handleExit()` may show the "pending
/// operations" confirm, which waits on a human and must not be cut short by any clock.
const QUIT_PROBE_TIMEOUT: Duration = Duration::from_secs(3);

/// The quit routing policy shared by tray Quit, Cmd+Q (the macOS app menu) and the main-window
/// close (todos 2026-10-05 tray-quit-bypasses-the-pending-operations-confirm and
/// 2026-10-05 cmd-q-and-red-x-quit-bypass-the-pending-operations-confirm), with the two
/// sidecar operations injected so `#[cfg(test)]` can drive it.
///
/// `Ok(())` means the quit was handed to the sidecar's `handleExit()`, which either exits via
/// `app_exit` or -- the user answered "No" to the pending-operations confirm -- does nothing.
/// `Err` means the sidecar is dead or not answering, and the caller must exit directly: the
/// pre-fix behaviour, kept as the fallback so a routed quit can never become a no-op.
///
/// The probe runs on its own thread and is waited on with `recv_timeout`, so the bound also
/// covers a probe stuck behind the stdin mutex on a full pipe, not only a slow answer.
pub(crate) fn route_quit_via_sidecar<P, S>(probe: P, bound: Duration, send_quit: S) -> Result<(), String>
where
    P: FnOnce() -> Result<Value, String> + Send + 'static,
    S: FnOnce() -> Result<(), String>,
{
    let (tx, rx) = mpsc_channel::<Result<Value, String>>();
    thread::spawn(move || {
        let _ = tx.send(probe());
    });
    match rx.recv_timeout(bound) {
        Ok(Ok(_)) => send_quit(),
        Ok(Err(e)) => Err(format!("sidecar health probe failed: {e}")),
        Err(_) => Err(format!(
            "sidecar did not answer the health probe within {}ms",
            bound.as_millis()
        )),
    }
}

/// Every user-initiated quit: tray Quit, Cmd+Q (the macOS app-menu item installed by
/// `route_app_menu_quit_through_sidecar`) and the main-window close when the window is not
/// hiding to the tray. Routes through the sidecar's `handleExit()` so a pending operation gets
/// the same "pending operations" confirm as the in-app quit (Electron routed all of these there),
/// and falls back to `exit(0)` when there is no live sidecar to ask. `origin` names the gesture
/// in the shell log. Runs off the main thread: the probe blocks for up to `QUIT_PROBE_TIMEOUT`.
pub(crate) fn quit_via_sidecar(app_handle: &AppHandle, origin: &'static str) {
    let Some(state) = app_handle.try_state::<Arc<SidecarState>>() else {
        shell_diag(&format!(
            "quit ({origin}): no sidecar state -- exiting directly"
        ));
        app_handle.exit(0);
        return;
    };
    let state = state.inner().clone();
    let app_handle = app_handle.clone();
    thread::spawn(move || {
        let probe_state = state.clone();
        let routed = route_quit_via_sidecar(
            move || probe_state.invoke(SIDECAR_HEALTH_CHANNEL.to_string(), Vec::new()),
            QUIT_PROBE_TIMEOUT,
            || {
                state.write_frame(&SidecarRpcRequest {
                    id: state.next_id(),
                    kind: "send",
                    channel: SIDECAR_QUIT_CHANNEL.to_string(),
                    args: Vec::new(),
                })
            },
        );
        match routed {
            Ok(()) => shell_diag(&format!(
                "quit ({origin}): handed to the sidecar handleExit"
            )),
            Err(e) => {
                shell_diag(&format!("WARN: quit ({origin}): {e} -- exiting directly"));
                app_handle.exit(0);
            }
        }
    });
}

/// Menu id of the custom macOS app-menu Quit item that replaces the predefined one. Deliberately
/// NOT `"quit"`: Tauri 2 delivers every menu event app-wide to every `on_menu_event` handler, and
/// the tray handler's `"quit"` arm would fire a second time for the same click.
#[cfg(target_os = "macos")]
pub(crate) const APP_MENU_QUIT_ID: &str = "app_menu_quit";

/// macOS Cmd+Q: swap the default app menu's predefined Quit for a custom item that routes through
/// `quit_via_sidecar` (todo 2026-10-05 cmd-q-and-red-x-quit-bypass-the-pending-operations-confirm).
///
/// Why a menu item and not an `ExitRequested` interceptor. `main()` never calls `.menu(...)`, so
/// macOS gets Tauri's `Menu::default`, whose app submenu ends in `PredefinedMenuItem::quit` -- the
/// item that carries Cmd+Q. muda maps it to the AppKit selector `terminate:`. tao 0.35.3's app
/// delegate implements NO `applicationShouldTerminate:` (only `applicationWillTerminate:`, which
/// goes straight to `Event::LoopDestroyed` -> `RunEvent::Exit`), so Cmd+Q never emits
/// `RunEvent::ExitRequested` and there is nothing to intercept; it bypassed `handleExit()` and
/// `shutdown_child()` killed a running download with no confirm. A custom item with the same
/// label and `CmdOrCtrl+Q` accelerator turns the gesture into an ordinary menu event instead.
///
/// Dock-menu Quit also sends `terminate:`; `macos_terminate_veto` covers it (todo 2026-10-08
/// dock-quit-and-logout-bypass-...), and lets a logout/shutdown through unasked.
///
/// Every failure (no menu, first item not a submenu, no Quit item, remove/insert error) logs a
/// WARN and leaves the default menu untouched: the fallback is the old unrouted Cmd+Q, never a
/// broken menu and never a panic inside `.setup()`.
#[cfg(target_os = "macos")]
pub(crate) fn route_app_menu_quit_through_sidecar(app: &AppHandle) {
    use tauri::menu::{MenuItem, MenuItemKind};

    let Some(menu) = app.menu() else {
        shell_diag("WARN: app menu: no app-wide menu -- Cmd+Q stays unrouted");
        return;
    };
    let items = match menu.items() {
        Ok(items) => items,
        Err(e) => {
            shell_diag(&format!(
                "WARN: app menu: could not list the menu ({e}) -- Cmd+Q stays unrouted"
            ));
            return;
        }
    };
    let Some(app_submenu) = items.first().and_then(|item| item.as_submenu()) else {
        shell_diag("WARN: app menu: first item is not the app submenu -- Cmd+Q stays unrouted");
        return;
    };
    let sub_items = match app_submenu.items() {
        Ok(items) => items,
        Err(e) => {
            shell_diag(&format!(
                "WARN: app menu: could not list the app submenu ({e}) -- Cmd+Q stays unrouted"
            ));
            return;
        }
    };
    let found = sub_items
        .iter()
        .enumerate()
        .find_map(|(index, item)| match item {
            MenuItemKind::Predefined(predefined) => match predefined.text() {
                Ok(label) if label.starts_with("Quit") => Some((index, label)),
                _ => None,
            },
            _ => None,
        });
    let Some((index, label)) = found else {
        shell_diag("WARN: app menu: no predefined Quit item found -- Cmd+Q stays unrouted");
        return;
    };
    let custom = match MenuItem::with_id(app, APP_MENU_QUIT_ID, &label, true, Some("CmdOrCtrl+Q")) {
        Ok(item) => item,
        Err(e) => {
            shell_diag(&format!(
                "WARN: app menu: could not build the custom Quit item ({e}) -- Cmd+Q stays unrouted"
            ));
            return;
        }
    };
    // Build the replacement BEFORE removing the original, so a failure above can never leave the
    // menu without a Quit. If the insert fails after the remove, put the predefined item back.
    let removed = match app_submenu.remove_at(index) {
        Ok(removed) => removed,
        Err(e) => {
            shell_diag(&format!(
                "WARN: app menu: could not remove the predefined Quit ({e}) -- Cmd+Q stays unrouted"
            ));
            return;
        }
    };
    if let Err(e) = app_submenu.insert(&custom, index) {
        shell_diag(&format!(
            "WARN: app menu: could not insert the custom Quit ({e}) -- restoring the predefined item"
        ));
        if let Some(original) = removed {
            let _ = app_submenu.insert(&original, index);
        }
        return;
    }
    app.on_menu_event(|app_handle, event| {
        if event.id().as_ref() == APP_MENU_QUIT_ID {
            quit_via_sidecar(app_handle, "Cmd+Q");
        }
    });
    shell_diag(&format!(
        "app menu: Quit (Cmd+Q) routed through the sidecar (id={APP_MENU_QUIT_ID})"
    ));
}

/// What `applicationShouldTerminate:` should answer for a `terminate:` that did not come from
/// the app menu. `NSTerminateNow` lets AppKit proceed to `applicationWillTerminate:` (the
/// pre-existing unrouted exit); `NSTerminateCancel` swallows the request so the sidecar's
/// `handleExit()` can ask first and `app_exit` do the real exit.
///
/// Two reasons to let it through unasked. A system power-off (logout, restart, shutdown) must
/// never be blocked behind a modal: macOS would show "application canceled logout". And once the
/// shell is already exiting (`exiting`), a second veto would turn the confirmed quit into a no-op.
#[cfg(target_os = "macos")]
#[derive(Debug, PartialEq, Eq)]
enum TerminateReply {
    Now,
    Cancel,
}

#[cfg(target_os = "macos")]
fn terminate_reply(power_off: bool, exiting: bool) -> TerminateReply {
    if power_off || exiting {
        TerminateReply::Now
    } else {
        TerminateReply::Cancel
    }
}

#[cfg(target_os = "macos")]
pub(crate) mod macos_terminate_veto {
    use super::{quit_via_sidecar, shell_diag, terminate_reply, TerminateReply};
    use objc2::ffi::class_addMethod;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
    use objc2::{class, msg_send, sel, MainThreadMarker};
    use objc2_app_kit::NSApplication;
    use objc2_foundation::{NSNotification, NSNotificationCenter, NSString};
    use std::ffi::c_char;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::OnceLock;
    use tauri::AppHandle;

    static APP: OnceLock<AppHandle> = OnceLock::new();
    /// Set by the `NSWorkspaceWillPowerOffNotification` observer, which macOS posts before it asks
    /// applications to quit for a logout, restart or shutdown.
    static POWER_OFF: AtomicBool = AtomicBool::new(false);
    /// Set once the shell has begun its own exit (`RunEvent::ExitRequested { code: Some(_) }`).
    static EXITING: AtomicBool = AtomicBool::new(false);

    pub fn mark_exiting() {
        EXITING.store(true, Ordering::SeqCst);
    }

    const NS_TERMINATE_NOW: usize = 1;
    const NS_TERMINATE_CANCEL: usize = 0;

    extern "C-unwind" fn should_terminate(
        _this: &AnyObject,
        _cmd: Sel,
        _sender: *mut AnyObject,
    ) -> usize {
        let reply = terminate_reply(
            POWER_OFF.load(Ordering::SeqCst),
            EXITING.load(Ordering::SeqCst),
        );
        match (reply, APP.get()) {
            (TerminateReply::Cancel, Some(app)) => {
                quit_via_sidecar(app, "Dock Quit");
                NS_TERMINATE_CANCEL
            }
            // No handle to route with: never cancel what cannot be re-issued.
            _ => NS_TERMINATE_NOW,
        }
    }

    /// Add `applicationShouldTerminate:` to the class of tao's app delegate (tao 0.35.3 implements
    /// only `applicationWillTerminate:`) and watch for a system power-off. Every failure logs a
    /// WARN and leaves Dock Quit on the old unrouted exit; never a panic inside `.setup()`.
    pub fn install(app: &AppHandle) {
        let _ = APP.set(app.clone());
        let Some(mtm) = MainThreadMarker::new() else {
            shell_diag("WARN: terminate veto: not on the main thread -- Dock Quit stays unrouted");
            return;
        };
        let Some(delegate) = NSApplication::sharedApplication(mtm).delegate() else {
            shell_diag("WARN: terminate veto: no app delegate yet -- Dock Quit stays unrouted");
            return;
        };
        let delegate_obj: &AnyObject = unsafe { &*(&*delegate as *const _ as *const AnyObject) };
        let class: &AnyClass = delegate_obj.class();
        // SAFETY: `should_terminate` matches `-(NSApplicationTerminateReply)applicationShouldTerminate:(id)`
        // (encoding `Q@:@`); the class is registered and the selector is not yet implemented on it.
        let added = unsafe {
            class_addMethod(
                class as *const AnyClass as *mut AnyClass,
                sel!(applicationShouldTerminate:),
                std::mem::transmute::<
                    extern "C-unwind" fn(&AnyObject, Sel, *mut AnyObject) -> usize,
                    Imp,
                >(should_terminate),
                c"Q@:@".as_ptr() as *const c_char,
            )
        };
        if !added.as_bool() {
            shell_diag(&format!(
                "WARN: terminate veto: class_addMethod refused on {} -- Dock Quit stays unrouted",
                class.name().to_string_lossy()
            ));
            return;
        }
        // Power-off observer. The token must outlive the process, so it is leaked on purpose.
        let workspace: Retained<AnyObject> =
            unsafe { msg_send![class!(NSWorkspace), sharedWorkspace] };
        let center: Retained<NSNotificationCenter> =
            unsafe { msg_send![&*workspace, notificationCenter] };
        let name = NSString::from_str("NSWorkspaceWillPowerOffNotification");
        let block = block2::RcBlock::new(|_: std::ptr::NonNull<NSNotification>| {
            POWER_OFF.store(true, Ordering::SeqCst);
        });
        let token = unsafe {
            center.addObserverForName_object_queue_usingBlock(Some(&name), None, None, &block)
        };
        std::mem::forget(token);
        shell_diag(&format!(
            "terminate veto: applicationShouldTerminate: added to {} (Dock Quit routed through the sidecar)",
            class.name().to_string_lossy()
        ));
    }
}

#[cfg(all(test, target_os = "macos"))]
mod terminate_reply_tests {
    use super::{terminate_reply, TerminateReply};

    #[test]
    fn a_plain_terminate_is_cancelled_so_the_sidecar_can_ask() {
        assert_eq!(terminate_reply(false, false), TerminateReply::Cancel);
    }

    #[test]
    fn a_power_off_is_never_blocked() {
        assert_eq!(terminate_reply(true, false), TerminateReply::Now);
    }

    #[test]
    fn a_quit_already_in_progress_is_never_vetoed_again() {
        assert_eq!(terminate_reply(false, true), TerminateReply::Now);
    }
}

