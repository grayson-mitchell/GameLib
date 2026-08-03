// Spike 020 harness — can macOS Keychain / iCloud Passwords (or a third-party
// password manager) offer autofill inside the app's login webviews?
//
// Two webview surfaces, matching production:
//   (a) a wry-created Tauri `WebviewWindow` (every store's standard login window)
//   (b) a PRISTINE raw WKWebView in a Tauri shell window (Epic's login surface —
//       no Tauri/wry injection; adapted from src-tauri's
//       `open_pristine_epic_login_window`, minus the OAuth-specific delegate)
//
// The autofill verdicts themselves are HUMAN observations (does the key icon /
// AutoFill dropdown / save-password prompt appear?). The harness's job is to
// stand up both surfaces against (1) the spike-019 DummyStore form and (2) a
// real-HTTPS login page (controls for the loopback-HTTP variable), plus record
// the observations into the same forensic log both sides already use.
//
// Externally-driven screenshot evidence (conventions, spike 016): every window's
// NSWindow.windowNumber (== CGWindowID) is logged so `screencapture -l<id>` can
// photograph the exact window.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, Once};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder};

const CHROME_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const STORE_ORIGIN: &str = "http://127.0.0.1:17940";

/// NSWindow pointer of the CURRENT pristine window (0 = none). The Cmd+V/C/X/A/Z
/// key-equivalent monitor (installed once, below) re-dispatches Edit actions only
/// when the key window IS this window — same fix `open_pristine_epic_login_window`
/// ships, simplified to a single pristine window at a time.
static PRISTINE_NS_WINDOW: AtomicUsize = AtomicUsize::new(0);
static MONITOR_ONCE: Once = Once::new();

// ─────────────────────────── forensic log ───────────────────────────

struct Logger {
    events: Mutex<Vec<serde_json::Value>>,
    file: Mutex<std::fs::File>,
    app: Mutex<Option<AppHandle>>,
    started: Instant,
}

impl Logger {
    fn new(path: &std::path::Path) -> Self {
        let file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .expect("open run.log");
        Logger {
            events: Mutex::new(Vec::new()),
            file: Mutex::new(file),
            app: Mutex::new(None),
            started: Instant::now(),
        }
    }

    fn log(&self, category: &str, message: &str, data: serde_json::Value) {
        let event = serde_json::json!({
            "t": iso_now(),
            "ms": self.started.elapsed().as_millis() as u64,
            "category": category,
            "message": message,
            "data": data,
        });
        {
            use std::io::Write;
            let line = serde_json::to_string(&event).unwrap_or_default();
            eprintln!("[{category}] {message} {}", event["data"]);
            if let Ok(mut f) = self.file.lock() {
                let _ = writeln!(f, "{line}");
                let _ = f.flush();
            }
        }
        if let Ok(mut v) = self.events.lock() {
            v.push(event.clone());
        }
        if let Ok(app) = self.app.lock() {
            if let Some(app) = app.as_ref() {
                let _ = app.emit("spike-log", event);
            }
        }
    }
}

fn iso_now() -> String {
    let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = d.as_secs();
    let ms = d.subsec_millis();
    let days = secs / 86_400;
    let tod = secs % 86_400;
    let (y, mo, da) = civil_from_days(days as i64);
    format!(
        "{y:04}-{mo:02}-{da:02}T{:02}:{:02}:{:02}.{ms:03}Z",
        tod / 3600,
        (tod % 3600) / 60,
        tod % 60
    )
}

/// Howard Hinnant's civil_from_days.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

// ─────────────────────────── commands ───────────────────────────

struct State {
    log: Arc<Logger>,
}

#[tauri::command]
fn env_report(state: tauri::State<'_, State>) -> serde_json::Value {
    let v = serde_json::json!({
        "storeOrigin": STORE_ORIGIN,
        "autorun": std::env::var("SPIKE_AUTORUN").ok(),
        "macos": cfg!(target_os = "macos"),
    });
    state.log.log("env", "environment", v.clone());
    v
}

#[tauri::command]
fn store_origin() -> String {
    STORE_ORIGIN.to_string()
}

/// Surface (a): the standard wry-created login WebviewWindow.
#[tauri::command]
fn open_wry_login(
    app: AppHandle,
    state: tauri::State<'_, State>,
    label: String,
    url: String,
    spoof_ua: bool,
) -> Result<String, String> {
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.close();
        std::thread::sleep(Duration::from_millis(250));
    }
    let parsed = Url::parse(&url).map_err(|e| e.to_string())?;
    let log_page = state.log.clone();
    let label_page = label.clone();

    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .title(format!("wry login — {label}"))
        .inner_size(560.0, 720.0)
        .on_page_load(move |_w, payload| {
            log_page.log(
                "navigation",
                "on_page_load (wry)",
                serde_json::json!({
                    "window": label_page,
                    "url": payload.url().as_str(),
                    "event": match payload.event() {
                        PageLoadEvent::Started => "started",
                        PageLoadEvent::Finished => "finished",
                    },
                }),
            );
        });
    if spoof_ua {
        builder = builder.user_agent(CHROME_UA);
    }
    state.log.log(
        "window",
        "opening wry login window",
        serde_json::json!({ "label": label, "url": url, "spoofUa": spoof_ua }),
    );
    builder.build().map_err(|e| e.to_string())?;
    state
        .log
        .log("window", "opened (wry)", serde_json::json!({ "label": label }));
    Ok(label)
}

/// Surface (b): a pristine raw WKWebView inside a plain Tauri shell window — the
/// Epic-login construction, minus the OAuth navigation delegate (DummyStore needs
/// no popup/alert handling for a login-form probe).
#[cfg(target_os = "macos")]
#[tauri::command]
fn open_pristine_login(
    app: AppHandle,
    state: tauri::State<'_, State>,
    label: String,
    url: String,
    spoof_ua: bool,
) -> Result<String, String> {
    use objc2_foundation::{NSString, NSURL, NSURLRequest};
    use objc2_web_kit::{WKWebView, WKWebViewConfiguration};

    if let Some(existing) = app.get_window(&label) {
        let _ = existing.close();
        std::thread::sleep(Duration::from_millis(250));
    }

    let window = tauri::WindowBuilder::new(&app, &label)
        .title(format!("pristine login — {label}"))
        .inner_size(560.0, 720.0)
        .visible(true)
        .focused(true)
        .build()
        .map_err(|e| format!("pristine window build failed: {e}"))?;

    // Clear the monitor's target when this window dies.
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            PRISTINE_NS_WINDOW.store(0, Ordering::SeqCst);
        }
    });

    struct SendPtr(*mut std::ffi::c_void);
    unsafe impl Send for SendPtr {}

    let ns_view_ptr = window
        .ns_view()
        .map_err(|e| format!("ns_view failed: {e}"))?;
    let ns_view_addr = SendPtr(ns_view_ptr);
    let url_owned = url.clone();
    let ua = spoof_ua.then(|| CHROME_UA.to_string());

    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    app.run_on_main_thread(move || {
        let ns_view_addr = ns_view_addr;
        let result: Result<(), String> = (|| {
            let mtm = objc2::MainThreadMarker::new().ok_or("no main-thread marker")?;
            // SAFETY: the command thread is blocked on rx below, so the window —
            // and its content view — outlive this closure.
            let ns_view: &objc2_app_kit::NSView =
                unsafe { &*(ns_view_addr.0 as *const objc2_app_kit::NSView) };
            let frame = ns_view.frame();

            let config = unsafe { WKWebViewConfiguration::new(mtm) };
            let webview: objc2::rc::Retained<WKWebView> =
                unsafe { WKWebView::initWithFrame_configuration(mtm.alloc(), frame, &config) };
            webview.setAutoresizingMask(
                objc2_app_kit::NSAutoresizingMaskOptions::ViewWidthSizable
                    | objc2_app_kit::NSAutoresizingMaskOptions::ViewHeightSizable,
            );
            if let Some(ua) = &ua {
                unsafe { webview.setCustomUserAgent(Some(&NSString::from_str(ua))) };
            }
            #[cfg(debug_assertions)]
            unsafe {
                webview.setInspectable(true);
            }

            ns_view.addSubview(&webview);
            if let Some(ns_window) = ns_view.window() {
                // Paste/Edit shortcuts: promote the webview to first responder and
                // record this NSWindow for the (single, app-lifetime) key monitor.
                let _ = ns_window.makeFirstResponder(Some(&webview));
                PRISTINE_NS_WINDOW.store(
                    objc2::rc::Retained::as_ptr(&ns_window) as usize,
                    Ordering::SeqCst,
                );
                install_edit_key_monitor();
            }

            let ns_url = unsafe { NSURL::URLWithString(&NSString::from_str(&url_owned)) }
                .ok_or("bad url")?;
            let request = unsafe { NSURLRequest::requestWithURL(&ns_url) };
            unsafe {
                webview.loadRequest(&request);
            }
            // Deliberate leak for the spike's lifetime — the webview must outlive
            // this closure and the window owns no Rust-side handle to it.
            std::mem::forget(webview);
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;

    rx.recv_timeout(Duration::from_secs(10))
        .map_err(|e| format!("pristine setup never returned: {e}"))??;

    state.log.log(
        "window",
        "opened (pristine raw WKWebView)",
        serde_json::json!({ "label": label, "url": url, "spoofUa": spoof_ua }),
    );
    Ok(label)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn open_pristine_login(
    _app: AppHandle,
    _state: tauri::State<'_, State>,
    _label: String,
    _url: String,
    _spoof_ua: bool,
) -> Result<String, String> {
    Err("pristine WKWebView surface is macOS-only".into())
}

/// Cmd+V/C/X/A/Z re-dispatch for the pristine window — the same key-equivalent
/// delivery fix `open_pristine_epic_login_window` ships (tao's NSWindow subclass
/// eats key equivalents before the main-menu traversal). Installed once; scoped
/// to whichever NSWindow `PRISTINE_NS_WINDOW` currently names.
#[cfg(target_os = "macos")]
fn install_edit_key_monitor() {
    MONITOR_ONCE.call_once(|| {
        let handler = block2::RcBlock::new(
            move |event: std::ptr::NonNull<objc2_app_kit::NSEvent>| -> *mut objc2_app_kit::NSEvent {
                let event_ref = unsafe { event.as_ref() };
                let flags = event_ref.modifierFlags();
                let is_plain_command = flags
                    .contains(objc2_app_kit::NSEventModifierFlags::Command)
                    && !flags.intersects(
                        objc2_app_kit::NSEventModifierFlags::Control
                            | objc2_app_kit::NSEventModifierFlags::Option,
                    );
                let action = is_plain_command
                    .then(|| event_ref.charactersIgnoringModifiers())
                    .flatten()
                    .map(|s| s.to_string().to_lowercase())
                    .and_then(|s| match s.as_str() {
                        "v" => Some(objc2::sel!(paste:)),
                        "c" => Some(objc2::sel!(copy:)),
                        "x" => Some(objc2::sel!(cut:)),
                        "a" => Some(objc2::sel!(selectAll:)),
                        "z" => Some(objc2::sel!(undo:)),
                        _ => None,
                    });
                if let Some(sel) = action {
                    let target = PRISTINE_NS_WINDOW.load(Ordering::SeqCst);
                    if target != 0 {
                        if let Some(mtm) = objc2::MainThreadMarker::new() {
                            let ns_app = objc2_app_kit::NSApplication::sharedApplication(mtm);
                            let is_pristine_key = ns_app
                                .keyWindow()
                                .is_some_and(|kw| objc2::rc::Retained::as_ptr(&kw) as usize == target);
                            if is_pristine_key {
                                let _ = unsafe { ns_app.sendAction_to_from(sel, None, None) };
                                return std::ptr::null_mut();
                            }
                        }
                    }
                }
                event.as_ptr()
            },
        );
        // Leaked for the app's lifetime — spike-acceptable; production keeps a
        // removable token (see src-tauri's monitor_slot teardown).
        let _ = unsafe {
            objc2_app_kit::NSEvent::addLocalMonitorForEventsMatchingMask_handler(
                objc2_app_kit::NSEventMask::KeyDown,
                &handler,
            )
        };
    });
}

#[tauri::command]
fn close_window(app: AppHandle, state: tauri::State<'_, State>, label: String) -> Result<(), String> {
    match app.get_window(&label) {
        Some(w) => {
            w.close().map_err(|e| e.to_string())?;
            state
                .log
                .log("window", "closed", serde_json::json!({ "label": label }));
            Ok(())
        }
        None => Err(format!("no window '{label}'")),
    }
}

/// NSWindow.windowNumber (== CGWindowID) for `screencapture -l<id>` evidence.
#[cfg(target_os = "macos")]
#[tauri::command]
fn window_number(app: AppHandle, label: String) -> Result<i64, String> {
    let window = app
        .get_window(&label)
        .ok_or_else(|| format!("no window '{label}'"))?;
    let ns_window_ptr = window.ns_window().map_err(|e| e.to_string())? as usize;
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let ns_window: &objc2_app_kit::NSWindow =
            unsafe { &*(ns_window_ptr as *const objc2_app_kit::NSWindow) };
        let n: objc2_foundation::NSInteger = ns_window.windowNumber();
        let _ = tx.send(n as i64);
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn window_number(_app: AppHandle, _label: String) -> Result<i64, String> {
    Err("macOS-only".into())
}

#[tauri::command]
fn log_from_ui(
    state: tauri::State<'_, State>,
    category: String,
    message: String,
    data: serde_json::Value,
) {
    state.log.log(&category, &message, data);
}

#[tauri::command]
fn export_log(state: tauri::State<'_, State>) -> Result<String, String> {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or("no parent dir")?
        .to_path_buf();
    let path = dir.join("events-export.json");
    let events = state.log.events.lock().map_err(|e| e.to_string())?.clone();
    let summary = serde_json::json!({
        "exportedAt": iso_now(),
        "eventCount": events.len(),
        "events": events,
    });
    std::fs::write(&path, serde_json::to_string_pretty(&summary).unwrap_or_default())
        .map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

fn main() {
    let spike_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf();
    let logger = Arc::new(Logger::new(&spike_dir.join("run.log")));
    let state = State { log: logger.clone() };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            env_report,
            store_origin,
            open_wry_login,
            open_pristine_login,
            close_window,
            window_number,
            log_from_ui,
            export_log,
        ])
        .setup(move |app| {
            if let Ok(mut slot) = logger.app.lock() {
                *slot = Some(app.handle().clone());
            }
            logger.log("app", "started", serde_json::json!({ "storeOrigin": STORE_ORIGIN }));
            if std::env::var("SPIKE_AUTORUN").is_ok() {
                // Smoke mode: open BOTH surfaces on the DummyStore form and log
                // their CGWindowIDs so an external script can photograph them.
                let handle = app.handle().clone();
                let log = logger.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(1500));
                    let login_url = format!("{STORE_ORIGIN}/login");
                    let s = handle.state::<State>();
                    let r1 = open_wry_login(handle.clone(), s, "login-wry".into(), login_url.clone(), true);
                    let s = handle.state::<State>();
                    let r2 = open_pristine_login(handle.clone(), s, "login-pristine".into(), login_url, true);
                    std::thread::sleep(Duration::from_millis(2500));
                    let n1 = window_number(handle.clone(), "login-wry".into());
                    let n2 = window_number(handle.clone(), "login-pristine".into());
                    log.log(
                        "autorun",
                        "SMOKE READY",
                        serde_json::json!({
                            "wry": { "open": format!("{r1:?}"), "windowNumber": format!("{n1:?}") },
                            "pristine": { "open": format!("{r2:?}"), "windowNumber": format!("{n2:?}") },
                        }),
                    );
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running spike app");
}
