// Spike 021 harness — can the login window be made un-losable behind the main
// window, without breaking input or the spike-020 autofill channels?
//
// Mechanisms under test, applied AT THE APPKIT LAYER so one implementation
// covers BOTH production login surfaces (wry WebviewWindow and the pristine raw
// WKWebView shell window — both are NSWindows underneath):
//
//   child  — [main addChildWindow:login ordered:NSWindowAbove]
//            (what Tauri's `.parent()` does): login rides above main, follows
//            window moves, cannot go behind it.
//   sheet  — [main beginSheet:login]: genuinely modal, slides out of the main
//            window's title bar, blocks interaction with main.
//   free   — baseline: a plain window, reproduces the "login got lost" problem.
//
// Layering claims get a PROGRAMMATIC oracle — NSApp.orderedWindows (front-to-
// back) + keyWindow + childWindows — logged before/after raising the main
// window over the login. Screenshots by CGWindowID supplement; human feel-check
// (drag, minimize, typing, autofill panel) closes it out.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder};

const CHROME_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const STORE_ORIGIN: &str = "http://127.0.0.1:17940";

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

// ─────────────────────────── AppKit helpers (macOS) ───────────────────────────

#[cfg(target_os = "macos")]
mod mac {
    use super::*;
    use objc2_app_kit::{NSApplication, NSWindow, NSWindowOrderingMode};

    /// Runs `f` on the main thread with AppKit access, blocking for the result.
    pub fn on_main<T: Send + 'static>(
        app: &AppHandle,
        f: impl FnOnce(objc2::MainThreadMarker) -> T + Send + 'static,
    ) -> Result<T, String> {
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let mtm = objc2::MainThreadMarker::new().expect("main thread");
            let _ = tx.send(f(mtm));
        })
        .map_err(|e| e.to_string())?;
        rx.recv_timeout(Duration::from_secs(10))
            .map_err(|e| format!("main-thread hop never returned: {e}"))
    }

    /// NSWindow for a Tauri window label. Only touch the returned reference on
    /// the main thread.
    pub fn ns_window_ptr(app: &AppHandle, label: &str) -> Result<usize, String> {
        let w = app
            .get_window(label)
            .ok_or_else(|| format!("no window '{label}'"))?;
        Ok(w.ns_window().map_err(|e| e.to_string())? as usize)
    }

    pub fn attach_child(app: &AppHandle, parent: &str, child: &str) -> Result<(), String> {
        let p = ns_window_ptr(app, parent)?;
        let c = ns_window_ptr(app, child)?;
        on_main(app, move |_mtm| {
            let parent: &NSWindow = unsafe { &*(p as *const NSWindow) };
            let child: &NSWindow = unsafe { &*(c as *const NSWindow) };
            unsafe { parent.addChildWindow_ordered(child, NSWindowOrderingMode::Above) };
        })
    }

    pub fn detach_child(app: &AppHandle, parent: &str, child: &str) -> Result<(), String> {
        let p = ns_window_ptr(app, parent)?;
        let c = ns_window_ptr(app, child)?;
        on_main(app, move |_mtm| {
            let parent: &NSWindow = unsafe { &*(p as *const NSWindow) };
            let child: &NSWindow = unsafe { &*(c as *const NSWindow) };
            unsafe { parent.removeChildWindow(child) };
        })
    }

    pub fn begin_sheet(app: &AppHandle, parent: &str, sheet: &str) -> Result<(), String> {
        let p = ns_window_ptr(app, parent)?;
        let s = ns_window_ptr(app, sheet)?;
        on_main(app, move |_mtm| {
            let parent: &NSWindow = unsafe { &*(p as *const NSWindow) };
            let sheet: &NSWindow = unsafe { &*(s as *const NSWindow) };
            unsafe { parent.beginSheet_completionHandler(sheet, None) };
        })
    }

    pub fn end_sheet(app: &AppHandle, parent: &str, sheet: &str) -> Result<(), String> {
        let p = ns_window_ptr(app, parent)?;
        let s = ns_window_ptr(app, sheet)?;
        on_main(app, move |_mtm| {
            let parent: &NSWindow = unsafe { &*(p as *const NSWindow) };
            let sheet: &NSWindow = unsafe { &*(s as *const NSWindow) };
            unsafe { parent.endSheet(sheet) };
        })
    }

    pub fn raise(app: &AppHandle, label: &str) -> Result<(), String> {
        let p = ns_window_ptr(app, label)?;
        on_main(app, move |_mtm| {
            let w: &NSWindow = unsafe { &*(p as *const NSWindow) };
            w.makeKeyAndOrderFront(None);
        })
    }

    pub fn miniaturize(app: &AppHandle, label: &str, un: bool) -> Result<(), String> {
        let p = ns_window_ptr(app, label)?;
        on_main(app, move |_mtm| {
            let w: &NSWindow = unsafe { &*(p as *const NSWindow) };
            if un {
                w.deminiaturize(None);
            } else {
                w.miniaturize(None);
            }
        })
    }

    /// The layering oracle: front-to-back window list + key window + child and
    /// sheet relationships + per-window state.
    pub fn order_report(app: &AppHandle) -> Result<serde_json::Value, String> {
        on_main(app, move |mtm| {
            use objc2::msg_send;
            use objc2::rc::Retained;
            use objc2_foundation::NSArray;
            let ns_app = NSApplication::sharedApplication(mtm);
            // `orderedWindows` and friends aren't in this feature set's generated
            // bindings — raw msg_send! bypasses the binding gates (same class of
            // move as 016's `windowNumber` convention).
            let ordered: Retained<NSArray<NSWindow>> =
                unsafe { msg_send![&*ns_app, orderedWindows] };
            let key = ns_app
                .keyWindow()
                .map(|w| w.title().to_string())
                .unwrap_or_else(|| "<none>".into());
            let windows: Vec<serde_json::Value> = ordered
                .iter()
                .map(|w| {
                    let children: Option<Retained<NSArray<NSWindow>>> =
                        unsafe { msg_send![&*w, childWindows] };
                    let children: Vec<String> = children
                        .map(|cs| cs.iter().map(|c| c.title().to_string()).collect())
                        .unwrap_or_default();
                    let sheet_parent: Option<Retained<NSWindow>> =
                        unsafe { msg_send![&*w, sheetParent] };
                    let is_sheet: bool = unsafe { msg_send![&*w, isSheet] };
                    serde_json::json!({
                        "title": w.title().to_string(),
                        "windowNumber": w.windowNumber() as i64,
                        "visible": w.isVisible(),
                        "miniaturized": w.isMiniaturized(),
                        "isSheet": is_sheet,
                        "sheetParent": sheet_parent.map(|p| p.title().to_string()),
                        "childWindows": children,
                    })
                })
                .collect();
            serde_json::json!({ "frontToBack": windows, "keyWindow": key })
        })
    }
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

/// Opens the login surface as a plain wry WebviewWindow ("free" mode — modal
/// attachment happens separately via attach/sheet commands so mode changes are
/// probeable at runtime on the SAME window).
#[tauri::command]
fn open_login(
    app: AppHandle,
    state: tauri::State<'_, State>,
    label: String,
    url: String,
) -> Result<String, String> {
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.close();
        std::thread::sleep(Duration::from_millis(250));
    }
    let parsed = Url::parse(&url).map_err(|e| e.to_string())?;
    let log_page = state.log.clone();
    let label_page = label.clone();
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .title(format!("login — {label}"))
        .inner_size(560.0, 680.0)
        .user_agent(CHROME_UA)
        .on_page_load(move |_w, payload| {
            log_page.log(
                "navigation",
                "on_page_load",
                serde_json::json!({
                    "window": label_page,
                    "url": payload.url().as_str(),
                    "event": match payload.event() {
                        PageLoadEvent::Started => "started",
                        PageLoadEvent::Finished => "finished",
                    },
                }),
            );
        })
        .build()
        .map_err(|e| e.to_string())?;
    state
        .log
        .log("window", "opened login", serde_json::json!({ "label": label, "url": url }));
    Ok(label)
}

macro_rules! mac_cmd {
    ($name:ident, $call:expr) => {
        #[cfg(target_os = "macos")]
        #[tauri::command]
        fn $name(
            app: AppHandle,
            state: tauri::State<'_, State>,
            label: String,
        ) -> Result<(), String> {
            let r = $call(&app, "main", &label);
            state.log.log(
                "modal",
                stringify!($name),
                serde_json::json!({ "label": label, "result": format!("{r:?}") }),
            );
            r
        }
        #[cfg(not(target_os = "macos"))]
        #[tauri::command]
        fn $name(_app: AppHandle, _state: tauri::State<'_, State>, _label: String) -> Result<(), String> {
            Err("macOS-only".into())
        }
    };
}

mac_cmd!(attach_child, mac::attach_child);
mac_cmd!(detach_child, mac::detach_child);
mac_cmd!(begin_sheet, mac::begin_sheet);
mac_cmd!(end_sheet, mac::end_sheet);

#[cfg(target_os = "macos")]
#[tauri::command]
fn raise_window(app: AppHandle, state: tauri::State<'_, State>, label: String) -> Result<(), String> {
    let r = mac::raise(&app, &label);
    state
        .log
        .log("modal", "raise_window", serde_json::json!({ "label": label, "result": format!("{r:?}") }));
    r
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn miniaturize_window(
    app: AppHandle,
    state: tauri::State<'_, State>,
    label: String,
    un: bool,
) -> Result<(), String> {
    let r = mac::miniaturize(&app, &label, un);
    state.log.log(
        "modal",
        "miniaturize_window",
        serde_json::json!({ "label": label, "un": un, "result": format!("{r:?}") }),
    );
    r
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn order_report(app: AppHandle, state: tauri::State<'_, State>, note: String) -> Result<serde_json::Value, String> {
    let r = mac::order_report(&app)?;
    state
        .log
        .log("oracle", &format!("order_report: {note}"), r.clone());
    Ok(r)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn raise_window(_app: AppHandle, _state: tauri::State<'_, State>, _label: String) -> Result<(), String> {
    Err("macOS-only".into())
}
#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn miniaturize_window(_a: AppHandle, _s: tauri::State<'_, State>, _label: String, _un: bool) -> Result<(), String> {
    Err("macOS-only".into())
}
#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn order_report(_a: AppHandle, _s: tauri::State<'_, State>, _note: String) -> Result<serde_json::Value, String> {
    Err("macOS-only".into())
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

/// Scripted probe sequence — the programmatic half of the spike. Human
/// feel-checks (drag, typing, autofill panel inside each mode) follow manually.
#[cfg(target_os = "macos")]
fn autorun(app: AppHandle, log: Arc<Logger>) {
    let s = || app.state::<State>();
    let login_url = format!("{STORE_ORIGIN}/login");
    let step = |msg: &str| log.log("autorun", msg, serde_json::json!({}));

    step("=== PHASE 1: baseline (free window) — reproduce 'login gets lost' ===");
    let _ = open_login(app.clone(), s(), "login".into(), login_url.clone());
    std::thread::sleep(Duration::from_millis(2000));
    let _ = order_report(app.clone(), s(), "1a after open (login should be front)".into());
    let _ = mac::raise(&app, "main");
    std::thread::sleep(Duration::from_millis(600));
    let _ = order_report(app.clone(), s(), "1b after raising MAIN over a FREE login (login now behind = the bug)".into());

    step("=== PHASE 2: child-window attachment ===");
    let _ = attach_child(app.clone(), s(), "login".into());
    std::thread::sleep(Duration::from_millis(400));
    let _ = order_report(app.clone(), s(), "2a after attach_child (login should list as main's child)".into());
    let _ = mac::raise(&app, "main");
    std::thread::sleep(Duration::from_millis(600));
    let _ = order_report(app.clone(), s(), "2b after raising MAIN over a CHILD login (login should STAY in front)".into());

    step("=== PHASE 3: minimize behavior with child attached ===");
    let _ = miniaturize_window(app.clone(), s(), "main".into(), false);
    std::thread::sleep(Duration::from_millis(1200));
    let _ = order_report(app.clone(), s(), "3a after miniaturizing MAIN (does the child follow or detach?)".into());
    let _ = miniaturize_window(app.clone(), s(), "main".into(), true);
    std::thread::sleep(Duration::from_millis(1200));
    let _ = order_report(app.clone(), s(), "3b after deminiaturizing MAIN".into());

    step("=== PHASE 4: sheet mode ===");
    let _ = detach_child(app.clone(), s(), "login".into());
    let _ = begin_sheet(app.clone(), s(), "login".into());
    std::thread::sleep(Duration::from_millis(1500));
    let _ = order_report(app.clone(), s(), "4a after beginSheet (isSheet/sheetParent should be set)".into());
    let _ = mac::raise(&app, "main");
    std::thread::sleep(Duration::from_millis(600));
    let _ = order_report(app.clone(), s(), "4b after raising MAIN under a SHEET login".into());
    let _ = end_sheet(app.clone(), s(), "login".into());
    std::thread::sleep(Duration::from_millis(800));
    let _ = order_report(app.clone(), s(), "4c after endSheet".into());

    log.log("autorun", "=== SCRIPTED PHASES COMPLETE — window numbers for screenshots ===", serde_json::json!({}));
    let _ = order_report(app.clone(), s(), "final".into());

    if std::env::var("SPIKE_AUTORUN_EXIT").is_ok() {
        let _ = export_log(app.state::<State>());
        std::thread::sleep(Duration::from_millis(300));
        app.exit(0);
    }
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
            open_login,
            attach_child,
            detach_child,
            begin_sheet,
            end_sheet,
            raise_window,
            miniaturize_window,
            order_report,
            close_window,
            log_from_ui,
            export_log,
        ])
        .setup(move |app| {
            if let Ok(mut slot) = logger.app.lock() {
                *slot = Some(app.handle().clone());
            }
            logger.log("app", "started", serde_json::json!({ "storeOrigin": STORE_ORIGIN }));
            #[cfg(target_os = "macos")]
            if std::env::var("SPIKE_AUTORUN").is_ok() {
                let handle = app.handle().clone();
                let log = logger.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(1500));
                    autorun(handle, log);
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running spike app");
}
