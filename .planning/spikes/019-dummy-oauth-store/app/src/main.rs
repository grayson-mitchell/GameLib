// Spike 019 harness — a Tauri login window driving a LOCAL OAuth 2.0
// authorization-code-grant provider ("DummyStore", store-server.mjs).
//
// The question: given a fully-controlled fake store, can the app's login window
// drive the entire code-grant flow end to end — form → authorize → redirect with
// code → token exchange → authenticated profile — with every step observable?
//
// The auth-code capture pattern under test is NAVIGATION OBSERVATION: the Rust
// side watches `on_page_load` for the redirect_uri and lifts `code`/`state` out
// of the query string, then emits them to the control panel. No callback server
// in the app, no remote-page IPC (which 014b proved is ACL-denied anyway).
//
// This harness is the shared substrate for spikes 020 (Keychain autofill) and
// 021 (modal login window).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder};

/// Same Chrome UA the real login flows spoof (spike 013: mandatory, not reinforcement).
const CHROME_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const STORE_ORIGIN: &str = "http://127.0.0.1:17940";
const CALLBACK_PREFIX: &str = "http://127.0.0.1:17940/callback";

static AUTORUN_DONE: AtomicBool = AtomicBool::new(false);

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

fn redact(v: &str) -> String {
    if v.is_empty() {
        "<empty>".into()
    } else {
        let head: String = v.chars().take(3).collect();
        format!("{head}…<{} chars>", v.len())
    }
}

// ─────────────────────────── commands ───────────────────────────

struct State {
    log: Arc<Logger>,
}

#[tauri::command]
fn env_report(state: tauri::State<'_, State>) -> serde_json::Value {
    let v = serde_json::json!({
        "tauri": "2.x (Cargo.lock-pinned, shares src-tauri target dir)",
        "storeOrigin": STORE_ORIGIN,
        "callbackPrefix": CALLBACK_PREFIX,
        "autorun": std::env::var("SPIKE_AUTORUN").ok(),
    });
    state.log.log("env", "environment", v.clone());
    v
}

#[tauri::command]
fn store_origin() -> String {
    STORE_ORIGIN.to_string()
}

#[tauri::command]
fn open_login(
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
    let log_nav = state.log.clone();
    let log_page = state.log.clone();
    let label_nav = label.clone();
    let label_page = label.clone();
    let app_page = app.clone();

    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .title(format!("DummyStore login — {label}"))
        .inner_size(560.0, 720.0)
        .on_navigation(move |u| {
            // Logged for the record; per spike 013 this ALSO fires for subframes,
            // so no logic hangs off it.
            log_nav.log(
                "navigation",
                "on_navigation",
                serde_json::json!({ "window": label_nav, "url": u.as_str() }),
            );
            true
        })
        .on_page_load(move |_w, payload| {
            let url = payload.url().as_str().to_string();
            let event = match payload.event() {
                PageLoadEvent::Started => "started",
                PageLoadEvent::Finished => "finished",
            };
            log_page.log(
                "navigation",
                "on_page_load",
                serde_json::json!({ "window": label_page, "url": url, "event": event }),
            );

            // THE CAPTURE: the redirect_uri arrived in the login window.
            // Fire on Started so the code reaches the app before the landing
            // page even paints — the modal/close UX in 021 wants that timing.
            if url.starts_with(CALLBACK_PREFIX) && event == "started" {
                if let Ok(parsed) = Url::parse(&url) {
                    let mut code = None;
                    let mut oauth_state = None;
                    let mut error = None;
                    for (k, v) in parsed.query_pairs() {
                        match k.as_ref() {
                            "code" => code = Some(v.to_string()),
                            "state" => oauth_state = Some(v.to_string()),
                            "error" => error = Some(v.to_string()),
                            _ => {}
                        }
                    }
                    log_page.log(
                        "oauth",
                        "authorization code CAPTURED via navigation observation",
                        serde_json::json!({
                            "window": label_page,
                            "code": redact(code.as_deref().unwrap_or("")),
                            "state": oauth_state,
                            "error": error,
                        }),
                    );
                    let _ = app_page.emit(
                        "oauth-code",
                        serde_json::json!({
                            "window": label_page,
                            "code": code,
                            "state": oauth_state,
                            "error": error,
                        }),
                    );
                }
            }
        });

    if spoof_ua {
        builder = builder.user_agent(CHROME_UA);
    }

    state.log.log(
        "window",
        "opening login window",
        serde_json::json!({ "label": label, "url": url, "spoofUa": spoof_ua }),
    );

    match builder.build() {
        Ok(_) => {
            state
                .log
                .log("window", "opened", serde_json::json!({ "label": label }));
            Ok(label)
        }
        Err(e) => {
            let msg = e.to_string();
            state
                .log
                .log("window", "open-failed", serde_json::json!({ "error": msg }));
            Err(msg)
        }
    }
}

#[tauri::command]
fn close_login(app: AppHandle, state: tauri::State<'_, State>, label: String) -> Result<(), String> {
    match app.get_webview_window(&label) {
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

/// The UI calls this when a scripted run finishes (either verdict). Exits the
/// process when SPIKE_AUTORUN_EXIT is set so the run is drivable from a script.
#[tauri::command]
fn autorun_complete(
    app: AppHandle,
    state: tauri::State<'_, State>,
    success: bool,
    summary: serde_json::Value,
) {
    AUTORUN_DONE.store(true, Ordering::SeqCst);
    state.log.log(
        "autorun",
        if success { "=== COMPLETE: SUCCESS ===" } else { "=== COMPLETE: FAILURE ===" },
        summary,
    );
    let _ = export_log(app.state::<State>());
    if std::env::var("SPIKE_AUTORUN_EXIT").is_ok() {
        std::thread::sleep(Duration::from_millis(300));
        app.exit(if success { 0 } else { 1 });
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
            close_login,
            log_from_ui,
            export_log,
            autorun_complete,
        ])
        .setup(move |app| {
            if let Ok(mut slot) = logger.app.lock() {
                *slot = Some(app.handle().clone());
            }
            logger.log(
                "app",
                "started",
                serde_json::json!({ "storeOrigin": STORE_ORIGIN }),
            );
            if std::env::var("SPIKE_AUTORUN").is_ok() {
                let handle = app.handle().clone();
                let log = logger.clone();
                std::thread::spawn(move || {
                    // Let the control panel finish loading, then hand it the wheel.
                    std::thread::sleep(Duration::from_millis(1500));
                    log.log("autorun", "signalling UI to start scripted flow", serde_json::json!({}));
                    let _ = handle.emit("autorun-start", serde_json::json!({ "autologin": true }));

                    // Watchdog: a hung scripted run must fail loudly, not hang CI.
                    std::thread::sleep(Duration::from_secs(90));
                    if !AUTORUN_DONE.load(Ordering::SeqCst) {
                        log.log(
                            "autorun",
                            "WATCHDOG: scripted run never completed within 90s",
                            serde_json::json!({}),
                        );
                        let _ = export_log(handle.state::<State>());
                        if std::env::var("SPIKE_AUTORUN_EXIT").is_ok() {
                            handle.exit(2);
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running spike app");
}
