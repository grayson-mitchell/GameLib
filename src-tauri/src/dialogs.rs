//! Handlers for the `dialog_open`, `dialog_message` (including its error/warning branches) and
//! `dialog_save` rustInvoke channels, plus `two_button_choice` (Phase 71 D-04/D-07).

use super::*;

/// Which button of a two-button `dialog_message` was chosen: `Some(0)`, `Some(1)`, or `None`
/// when the dialog was dismissed (Esc / window close) without one. See the `dialog_message`
/// arm for why this reads rfd's raw result rather than the dialog plugin's.
///
/// rfd reports a click on an `OkCancelCustom` button as `Custom(<its label>)` on every desktop
/// backend; `Ok` is also accepted as buttons[0] in case a backend reports the first button
/// generically. Everything else -- `Cancel` above all, which is what a dismissal yields -- is
/// `None`, so the caller falls back to its declared `cancelId` instead of guessing a button.
pub(crate) fn two_button_choice(result: &rfd::MessageDialogResult, label0: &str, label1: &str) -> Option<u8> {
    match result {
        rfd::MessageDialogResult::Custom(s) if s == label0 => Some(0),
        rfd::MessageDialogResult::Custom(s) if s == label1 => Some(1),
        rfd::MessageDialogResult::Ok => Some(0),
        _ => None,
    }
}

/// Which button of a three-button `dialog_message` was chosen: `Some(0..=2)`, or `None` for a
/// dismissal or any result that is not a recognised click. `Yes`/`No` are accepted as buttons
/// 0/1 for backends that report standard variants for custom buttons. `Ok` is deliberately NOT
/// mapped: on a three-button box it can only come from a fallback, and a fallback must never
/// pick a button for the user -- the TS host maps `None` to the caller's `cancelId`.
pub(crate) fn three_button_choice(result: &rfd::MessageDialogResult, labels: &[String; 3]) -> Option<u8> {
    match result {
        rfd::MessageDialogResult::Custom(s) => labels.iter().position(|l| l == s).map(|i| i as u8),
        rfd::MessageDialogResult::Yes => Some(0),
        rfd::MessageDialogResult::No => Some(1),
        _ => None,
    }
}

/// Maps an `NSAlert.runModal()` response code to a button index. 1000/1001/1002 are
/// `NSAlertFirstButtonReturn` / `NSAlertSecondButtonReturn` / `NSAlertThirdButtonReturn`.
/// Everything else -- `NSModalResponseCancel` (0, what the Esc monitor stops the modal with),
/// `NSModalResponseAbort` and any unknown code -- is a dismissal (`None`), never a button.
// macOS NSAlert path only; still unit-tested on every OS, so unused (not dead) elsewhere.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub(crate) fn alert_response_choice(code: isize) -> Option<u8> {
    match code {
        1000 => Some(0),
        1001 => Some(1),
        1002 => Some(2),
        _ => None,
    }
}

/// True for an Esc key-down (macOS virtual keyCode 53) with no Shift/Control/Option/Command held.
/// `modifier_bits` is `NSEventModifierFlags` raw bits: Shift 1<<17, Control 1<<18, Option 1<<19,
/// Command 1<<20 (mask 0x1E0000). CapsLock/Fn/numeric-pad bits are ignored.
// macOS NSAlert path only; still unit-tested on every OS, so unused (not dead) elsewhere.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub(crate) fn is_bare_escape(key_code: u16, modifier_bits: usize) -> bool {
    const CHORD_MASK: usize = 0x1E_0000;
    key_code == 53 && modifier_bits & CHORD_MASK == 0
}

/// macOS three-button prompt as an in-process `NSAlert` (see `rpc_dialog_message`). Must run on
/// the main thread. A scoped local key monitor turns a bare Esc into a dismissal; it is removed
/// before this returns.
#[cfg(target_os = "macos")]
fn show_three_button_alert_macos(
    mtm: objc2::MainThreadMarker,
    title: &str,
    message: &str,
    level: rfd::MessageLevel,
    labels: &[String; 3],
) -> Option<u8> {
    use objc2_app_kit::{NSAlert, NSAlertStyle, NSApplication, NSEvent, NSEventMask};
    use objc2_foundation::NSString;

    let alert = NSAlert::new(mtm);
    alert.setAlertStyle(match level {
        rfd::MessageLevel::Info => NSAlertStyle::Informational,
        rfd::MessageLevel::Warning => NSAlertStyle::Warning,
        rfd::MessageLevel::Error => NSAlertStyle::Critical,
    });
    alert.setMessageText(&NSString::from_str(title));
    alert.setInformativeText(&NSString::from_str(message));
    for label in labels {
        alert.addButtonWithTitle(&NSString::from_str(label));
    }
    let alert_window = alert.window();
    let handler_window = alert_window.clone();
    // Reads ONLY keyCode() and modifierFlags() -- never characters() (T-74-88).
    let handler = block2::RcBlock::new(
        move |event: std::ptr::NonNull<NSEvent>| -> *mut NSEvent {
            // SAFETY: AppKit hands local monitor handlers a valid, live NSEvent for this call.
            let event_ref = unsafe { event.as_ref() };
            if !is_bare_escape(event_ref.keyCode(), event_ref.modifierFlags().0) {
                return event.as_ptr();
            }
            let Some(mtm) = objc2::MainThreadMarker::new() else {
                return event.as_ptr();
            };
            let app = NSApplication::sharedApplication(mtm);
            match app.modalWindow() {
                Some(w) if std::ptr::eq(&*w, &*handler_window) => {
                    app.stopModalWithCode(objc2_app_kit::NSModalResponseCancel);
                    std::ptr::null_mut()
                }
                _ => event.as_ptr(),
            }
        },
    );
    // SAFETY: the handler is a valid block; AppKit copies it when registering.
    let monitor = unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::KeyDown, &handler) };
    if monitor.is_none() {
        shell_eprintln!("[shell] WARN: launch-prompt esc monitor: addLocalMonitorForEventsMatchingMask failed -- Esc will not dismiss");
    }
    let code = alert.runModal();
    if let Some(token) = monitor {
        // SAFETY: `token` is the object the add call returned; this is its only removal.
        unsafe { NSEvent::removeMonitor(&token) };
    }
    alert_response_choice(code)
}

// Native folder picker (Phase 30 Plan 03, D-09/REQ-30-07): blocks the calling thread
// until the user picks or cancels, so callers MUST dispatch this on a spawned worker
// thread, never the reader thread (T-30-13 — same reasoning as the keyring arms above,
// a modal OS prompt must not head-of-line block other pending rustInvokes). Returns the
// picked path as a string, or `Value::Null` on cancel — never an error on cancel, which
// is a normal user choice, not a failure.
// WR-01: honor the forwarded Electron `OpenDialogOptions.properties`. The options
// object crosses the wire as `args[0]` and used to be ignored entirely, so EVERY
// caller got a directory picker — including the `properties: ['openFile']` call
// sites (Settings/CustomWineProton's Wine/Proton binary, SideloadDialog's exe +
// cover images, GameSubMenu) which then received a path that can never be a valid
// binary/image. Default stays "folder" so the plan-30-03 install-location path is
// unchanged when no properties are supplied.
//
// Quick task 260902-8wc (closes item 2 of the folded todo
// `2026-08-24-opendialog-is-missing-from-long-running-channels-...`): `properties` used
// to be the ONLY key read here, so `title`, `defaultPath` and `filters` crossed the wire
// and were dropped on the floor. That made this the one dialog arm in this file that
// discards its caller's options -- `dialog_save` below already honours defaultPath and
// filters, and `dialog_message` already honours title and buttons.
//
// It was also an aggravating factor for the timeout bug that todo was filed for: with no
// start directory the picker opens wherever macOS last left it, so the user must navigate
// manually, which is exactly what pushed the interaction past the (since-removed) 60s
// bound on the outer `openDialog` channel.
//
// `buttonLabel` is received and still cannot be honoured: tauri-plugin-dialog 2.7.2's
// `FileDialogBuilder` exposes add_filter / set_directory / set_file_name / set_title /
// set_can_create_directories and NO confirm-button-label setter. Recorded here so the
// next reader does not re-derive it -- the callers that send it (PathSelectionBox,
// SideloadDialog, Tools, GameSubMenu) get the OS default label.
pub(crate) fn rpc_dialog_open(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    let options = DialogOpenArgs::from_args(args)?;
    let wants_file = options
        .properties
        .as_ref()
        .map(|props| {
            let has_dir = props.iter().any(|p| p == "openDirectory");
            let has_file = props.iter().any(|p| p == "openFile");
            has_file && !has_dir
        })
        .unwrap_or(false);
    let mut builder = app.dialog().file();
    if let Some(title) = options.title.as_deref().filter(|s| !s.is_empty()) {
        builder = builder.set_title(title);
    }
    // Electron's `defaultPath` may name either a directory or a file; AppKit/rfd only
    // accepts a DIRECTORY as the start location. Resolve to the nearest existing
    // directory and pass nothing when there isn't one -- handing the panel a path that
    // does not exist is worse than handing it none, because rfd then falls back
    // inconsistently across platforms rather than to the OS's last-used location.
    if let Some(default_path) = options.default_path.as_deref().filter(|s| !s.is_empty()) {
        let candidate = std::path::Path::new(default_path);
        let start_dir = if candidate.is_dir() {
            Some(candidate)
        } else {
            candidate.parent().filter(|parent| parent.is_dir())
        };
        if let Some(start_dir) = start_dir {
            builder = builder.set_directory(start_dir);
        }
    }
    // File pickers only. A folder picker ignores extension filters, so forwarding them
    // there would be noise. The parse mirrors `dialog_save`'s below verbatim -- same
    // wire shape, same `name`/`extensions` keys.
    if wants_file {
        if let Some(filters) = options.filters.as_ref() {
            for filter in filters {
                let name = filter.name.as_deref().unwrap_or("");
                let extensions: Vec<&str> = filter
                    .extensions
                    .as_ref()
                    .map(|arr| arr.iter().map(String::as_str).collect())
                    .unwrap_or_default();
                builder = builder.add_filter(name, &extensions);
            }
        }
    }
    let picked = if wants_file {
        builder.blocking_pick_file()
    } else {
        builder.blocking_pick_folder()
    };
    match picked {
        Some(path) => Ok(Value::String(path.to_string())),
        None => Ok(Value::Null),
    }
}

// Native message/error dialog (Phase 31 Plan 02, D-03/REQ-31-03/REQ-31-05): backs both
// `dialog.showMessageBox` and `dialog.showErrorBox` on the platformApi side. Default
// kind is Info when unspecified; the showErrorBox caller always sends `kind:"error"`.
// Runs on the existing spawned worker thread (same
// modal-dialog-must-not-block-the-reader-thread reasoning as `dialog_open` above).
//
// Phase 33 Plan 03 (D-06): an optional 2-element `buttons` array renders a real
// two-button confirm (`OkCancelCustom`) instead of the OK-only default. A 3-element array
// renders `YesNoCancelCustom` (Phase 74 gap closure); a dismissal or unrecognised result is
// `null`, never index 0. On macOS the three-button prompt is an in-process NSAlert (rfd's
// parentless macOS path is an out-of-process CFUserNotification with no Esc for custom
// labels); Esc is a dismissal (null), never an index.
//
// Returns the chosen button's index (`0` / `1`), or `null` when the dialog was
// DISMISSED (Esc / window close) without a button -- platformApi maps `null` to the
// caller's `cancelId`, Electron's own dismissal semantics. Todo 2026-10-05
// dialog-dismiss: this used to return `blocking_show()`'s bool, which is `false` for a
// dismissal AND for buttons[1], so Esc on Windows/Linux resolved as buttons[1] -- the
// destructive "Yes" for `askForceUninstall` and `handleExit`.
//
// The two-button case calls `rfd` directly, NOT the plugin's
// `blocking_show_with_result()`: tauri-plugin-dialog 2.7.2's
// `desktop::show_message_dialog` unconditionally remaps rfd's `Cancel` to
// `Custom(<second label>)` for `OkCancelCustom` (a workaround for GTK), so through the
// plugin a dismissal is indistinguishable from buttons[1] on every API it offers. rfd
// 0.16.0 itself reports `Custom(label)` for a click and `Cancel` for a dismissal on all
// three desktop backends (gtk3, win_cid, macos). The dialog is shown the way the plugin
// shows it: built and `show()`n on the main thread, awaited on a spawned thread, with
// the plugin's default title (the package name). Single-button / no-`buttons` calls
// keep the plugin's OK-only dialog.
pub(crate) fn rpc_dialog_message(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    let opts = DialogMessageArgs::from_args(args)?;
    let message = opts.message.clone().unwrap_or_default();
    let kind = opts
        .kind
        .as_deref()
        .map(|s| match s {
            "error" => MessageDialogKind::Error,
            "warning" => MessageDialogKind::Warning,
            _ => MessageDialogKind::Info,
        })
        .unwrap_or(MessageDialogKind::Info);
    let title = opts.title.clone();
    if let Some(btns) = opts.buttons.as_ref().filter(|b| b.len() == 2 || b.len() == 3) {
        let label0 = btns[0].clone();
        let label1 = btns[1].clone();
        let label2 = btns.get(2).cloned();
        let title = title.unwrap_or_else(|| app.package_info().name.clone());
        // The plugin's own `From<MessageDialogKind> for rfd::MessageLevel`, so the
        // level matches what the OK-only path below renders.
        let level: rfd::MessageLevel = kind.into();
        #[cfg(target_os = "macos")]
        if let Some(l2) = &label2 {
            // rfd's parentless macOS path is an out-of-process CFUserNotification with no Esc
            // for custom labels, so three-button prompts use an in-process NSAlert instead.
            let labels = [label0.clone(), label1.clone(), l2.clone()];
            let (tx, rx) = mpsc_channel::<Option<u8>>();
            app.run_on_main_thread(move || {
                let choice = match objc2::MainThreadMarker::new() {
                    Some(mtm) => show_three_button_alert_macos(mtm, &title, &message, level, &labels),
                    None => None,
                };
                let _ = tx.send(choice);
            })
            .map_err(|e| e.to_string())?;
            let choice = rx.recv().map_err(|e| e.to_string())?;
            return Ok(choice.map_or(Value::Null, Value::from));
        }
        let buttons = match &label2 {
            Some(l2) => rfd::MessageButtons::YesNoCancelCustom(label0.clone(), label1.clone(), l2.clone()),
            None => rfd::MessageButtons::OkCancelCustom(label0.clone(), label1.clone()),
        };
        let (tx, rx) = mpsc_channel::<rfd::MessageDialogResult>();
        app.run_on_main_thread(move || {
            let shown = rfd::AsyncMessageDialog::new()
                .set_title(&title)
                .set_description(&message)
                .set_level(level)
                .set_buttons(buttons)
                .show();
            thread::spawn(move || {
                let _ = tx.send(tauri::async_runtime::block_on(shown));
            });
        })
        .map_err(|e| e.to_string())?;
        let result = rx.recv().map_err(|e| e.to_string())?;
        let choice = match label2 {
            Some(l2) => three_button_choice(&result, &[label0, label1, l2]),
            None => two_button_choice(&result, &label0, &label1),
        };
        return Ok(choice.map_or(Value::Null, Value::from));
    }
    let mut builder = app.dialog().message(message).kind(kind);
    if let Some(title) = title {
        builder = builder.title(title);
    }
    // OK-only: `true` is its one button; anything else is a dismissal.
    Ok(if builder.blocking_show() {
        Value::from(0)
    } else {
        Value::Null
    })
}

// Native save-file dialog (Phase 31 Plan 02, D-03/REQ-31-03): same `Option<FilePath>`
// shape as `dialog_open`'s pick_folder/pick_file arm -- `Some(path)` is the chosen path,
// `None` is a healthy user cancel (never an error). Runs on the same spawned worker
// thread.
pub(crate) fn rpc_dialog_save(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    let opts = DialogSaveArgs::from_args(args)?;
    let mut builder = app.dialog().file();
    if let Some(file_name) = opts.default_path.as_deref() {
        builder = builder.set_file_name(file_name);
    }
    if let Some(filters) = opts.filters.as_ref() {
        for filter in filters {
            let name = filter.name.as_deref().unwrap_or("");
            let extensions: Vec<&str> = filter
                .extensions
                .as_ref()
                .map(|arr| arr.iter().map(String::as_str).collect())
                .unwrap_or_default();
            builder = builder.add_filter(name, &extensions);
        }
    }
    match builder.blocking_save_file() {
        Some(path) => Ok(Value::String(path.to_string())),
        None => Ok(Value::Null),
    }
}
