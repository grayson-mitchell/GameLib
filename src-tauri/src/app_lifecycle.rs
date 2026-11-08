//! Handlers for the app-lifecycle rustInvoke channels `app_exit`, `app_relaunch`, `app_hide`,
//! `main_window_raise` and `main_window_hide` (Phase 71 D-07).

use super::*;

// Exit the real Tauri process (Phase 33 Plan 04, D-05 app lifecycle essentials) via
// `AppHandle::exit()`. Backs `platform/index.ts`'s `app.exit()`/`app.quit()`. Only two
// sidecar-reachable call sites invoke this (`resetHeroic()`, the uninstall/quit exit
// path) -- both deliberate user/exit actions (T-33-12, accepted DoS disposition).
pub(crate) fn rpc_app_exit(app: &AppHandle) -> Result<Value, String> {
    if let Some(state) = app.try_state::<Arc<SidecarState>>() {
        state.begin_shutdown();
    }
    app.exit(0);
    Ok(Value::Null)
}

// Restart the real Tauri process (Phase 33 Plan 04, D-05 app lifecycle essentials) via
// `AppHandle::restart()`. Backs `platform/index.ts`'s `app.relaunch()`. `restart()` never
// returns (`-> !`) -- it either restarts the process directly (main thread) or blocks
// this spawned worker thread until the process exits (background thread), which is safe
// since the whole process is about to go away regardless.
//
// Phase 34.3 Plan 03 D-05 / REQ-34.3-06 (RESOLVED, no code change needed): dispatch_rust_channel
// always runs on a thread::spawn'd worker thread (see start_reader above), never the main
// thread, so this app.restart() call is always restart()'s BACKGROUND-THREAD branch -- it sets
// restart_on_exit=true and requests exit through the real event loop, rather than the
// main-thread branch that skips RunEvent::Exit entirely. That exit request fires
// tauri::RunEvent::Exit, and this file's own .run(...) closure (below main()) calls
// state.shutdown_child() on exactly that event -- BEFORE the process re-execs. Therefore there
// is no orphan-sidecar window for this codebase's calling pattern, and no extra
// state.shutdown_child() call belongs here -- adding one would be dead code inviting the next
// reader to wonder why it is duplicated. Verified against tauri 2.11.5's vendored source (the
// exact version this crate's Cargo.lock pins) by direct read of app.rs's restart()/run()/
// make_run_event_loop_callback() -- see 34.3-RESEARCH.md Q1 for the full evidence chain.
// restart()'s "skip the events" branch applies ONLY when restart() is called on the main
// thread, which this call site never is.
// Empirical confirmation is REQ-34.3-11's live-gate item 4 (a PACKAGED build: resetHeroic
// leaves exactly ONE sidecar process), not a Rust unit test -- a #[cfg(test)] test structurally
// cannot drive a live winit/tao event loop. One residual not traced here: the exact delivery
// guarantee of runtime_handle.request_exit(...) inside tauri-runtime-wry -- the same mechanism
// every existing app.exit() call in this codebase already depends on; the live-gate item above
// is where that residual closes empirically.
pub(crate) fn rpc_app_relaunch(app: &AppHandle) -> Result<Value, String> {
    if let Some(state) = app.try_state::<Arc<SidecarState>>() {
        state.begin_shutdown();
    }
    app.restart();
}

// Hide the real Tauri application (quick/260815-vvz) via `AppHandle::hide()`. Backs
// `platform/index.ts`'s `app.hide()`, whose one reachable caller is
// `raiseFrontmostBottledProcess`'s (`bottle.ts`) ~18s-miss yield fallback for bottled
// Steam install/uninstall -- when no matching installer/uninstaller window can be
// raised within that window, GameLib steps aside instead of staying in front of an
// invisible Steam confirm dialog (the root cause `steam-bottle-uninstall-reverts.md`
// records).
//
// `AppHandle::hide()` (tauri 2.11.5, `src/app.rs:1095-1104`) only exists
// `#[cfg(target_os = "macos")]` -- exact parity with real Electron's own `app.hide()`,
// which is macOS-only there too. An ungated call would not compile off macOS, so the
// two branches are `#[cfg]`-split; the non-macOS branch is a loud `eprintln!` declaring
// the no-op (never a silent lie), converging on the same `Ok(Value::Null)`.
//
// Thread-safety: `dispatch_rust_channel` always runs on a `thread::spawn`'d worker
// thread (see `clipboard_read_text`'s comment above and `start_reader`), never the
// main/reader thread -- so `AppHandle::hide()` always takes its
// `RuntimeOrDispatch::RuntimeHandle(h) => h.hide()?` branch, which posts to the real
// event loop rather than calling the runtime directly. Same mechanism the already-
// shipped `app_exit`/`app_relaunch` arms above rely on.
#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]
pub(crate) fn rpc_app_hide(app: &AppHandle) -> Result<Value, String> {
    #[cfg(target_os = "macos")]
    {
        app.hide().map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        shell_eprintln!(
            "[dispatch_rust_channel] app_hide: declared no-op off macOS -- \
             AppHandle::hide() does not exist on this platform, exact parity with real \
             Electron's own macOS-only app.hide()"
        );
    }
    Ok(Value::Null)
}

// Bring the main window to the front before a bridge-notice dialog. Same three calls as
// the tray About arm (`open_about_window_from_tray`); takes no args, so there is no
// injection surface. A missing window is reported, not fatal. The invite
// picker no longer uses this (quick 261101-llf); bridge-notice dialogs still do.
pub(crate) fn rpc_main_window_raise(app: &AppHandle) -> Result<Value, String> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Err("main_window_raise:no-main-window".to_string());
    };
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    // AppKit ignores this when GameLib is already active, so it only bounces the Dock icon when activation was declined with a game frontmost.
    #[cfg(target_os = "macos")]
    let _ = window.request_user_attention(Some(tauri::UserAttentionType::Critical));
    Ok(Value::Null)
}

// Hide GameLib for a game launch (quick 261108-kpc). Takes no args, so there is no
// injection surface. On macOS this is `AppHandle::hide()` (Cmd+H semantics), NOT
// `window.hide()`: there is no `RunEvent::Reopen` handler, so a hidden NSWindow could not
// be restored from the Dock, whereas a hidden app is unhidden natively by a Dock click,
// activation or `set_focus`. Elsewhere the main window is hidden and restored by the tray
// Show item or by relaunching (the focus sentinel shows + focuses it). Same worker-thread
// reasoning as the `AppHide` arm above.
pub(crate) fn rpc_main_window_hide(app: &AppHandle) -> Result<Value, String> {
    #[cfg(target_os = "macos")]
    {
        app.hide().map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
            return Err("main_window_hide:no-main-window".to_string());
        };
        let _ = window.hide();
    }
    Ok(Value::Null)
}
