// Spike 016 / 017 / 018 harness.
//
// One Tauri 2.11.5 app (`unstable` feature), three questions:
//
//   016  Can `Window::add_child` put a SECOND webview INSIDE the main window,
//        loading an external store URL with a spoofed UA, while the app's own
//        webview keeps rendering around it? (the in-app store browser shape —
//        what Electron's `<webview>` tag does for WebView/index.tsx today)
//   017  Can JS-reported layout rects drive the child's bounds (resize sync,
//        hide/show, destroy) accurately enough for a "store tab" UX?
//   018  Do the spike 013–015 findings carry over to CHILD webviews: does
//        `cookies()` work on the child handle, does `on_page_load` fire, and
//        is the jar shared with the main webview by default?
//
// Everything runs against the same loopback control server as spike 013, so
// the UA override and the cookie jar have server-side oracles, not just the
// APIs' own claims about themselves.

mod control_server;

use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::webview::{Cookie, PageLoadEvent, WebviewBuilder};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url, WebviewUrl};

/// Same Chrome UA the Humble flow needs (`standardBrowserUserAgent()`).
const CHROME_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/// A real store page — the actual target of the in-app store browser.
const STEAM_STORE_URL: &str = "https://store.steampowered.com/app/440/Team_Fortress_2/";
const GOG_STORE_URL: &str = "https://www.gog.com/en/games";

const EMBED_LABEL: &str = "store-embed";

static MAIN_THREAD: OnceLock<std::thread::ThreadId> = OnceLock::new();

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

// ─────────────────────────── cookie reporting (018) ───────────────────────────

#[derive(Serialize, Clone)]
struct CookieOut {
    name: String,
    value: String,
    value_len: usize,
    domain: String,
    http_only: bool,
    secure: bool,
}

fn redact(name: &str, value: &str) -> String {
    if name.starts_with("spike_") {
        value.to_string()
    } else if value.is_empty() {
        String::new()
    } else {
        let head: String = value.chars().take(3).collect();
        format!("{head}…<redacted {} chars>", value.len())
    }
}

fn to_out(c: &Cookie<'static>) -> CookieOut {
    CookieOut {
        name: c.name().to_string(),
        value: redact(c.name(), c.value()),
        value_len: c.value().len(),
        domain: c.domain().unwrap_or("<none>").to_string(),
        http_only: c.http_only().unwrap_or(false),
        secure: c.secure().unwrap_or(false),
    }
}

/// NSWindow.windowNumber == CGWindowID — lets the autorun photograph THIS
/// window with `screencapture -l<id>` (works even when occluded).
fn ns_window_number(window: &tauri::Window) -> Option<isize> {
    #[cfg(target_os = "macos")]
    {
        if let Ok(ptr) = window.ns_window() {
            let obj = ptr as *mut objc2::runtime::AnyObject;
            let num: isize = unsafe { objc2::msg_send![&*obj, windowNumber] };
            return Some(num);
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
    }
    None
}

fn thread_kind() -> &'static str {
    match MAIN_THREAD.get() {
        Some(id) if *id == std::thread::current().id() => "main",
        _ => "worker",
    }
}

// ─────────────────────────── commands ───────────────────────────

struct State {
    log: Arc<Logger>,
}

#[tauri::command]
fn env_report(state: tauri::State<'_, State>) -> serde_json::Value {
    let v = serde_json::json!({
        "tauri": "2.11.5 (Cargo.lock-pinned, matches src-tauri) + `unstable` feature",
        "wry": "0.55.1",
        "controlOrigin": control_server::ORIGIN,
        "steamStoreUrl": STEAM_STORE_URL,
        "gogStoreUrl": GOG_STORE_URL,
    });
    state.log.log("env", "environment", v.clone());
    v
}

/// THE 016 QUESTION: add a child webview to the (config-created) main window.
#[tauri::command]
fn create_embed(
    app: AppHandle,
    state: tauri::State<'_, State>,
    url: String,
    spoof_ua: bool,
    isolated_store: bool,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<serde_json::Value, String> {
    if let Some(existing) = app.get_webview(EMBED_LABEL) {
        let _ = existing.close();
        std::thread::sleep(Duration::from_millis(250));
    }

    let parsed = Url::parse(&url).map_err(|e| e.to_string())?;
    let window = app
        .get_window("main")
        .ok_or("no window 'main' — get_window returned None for the config-created window")?;

    let log_nav = state.log.clone();
    let log_page = state.log.clone();

    let mut builder = WebviewBuilder::new(EMBED_LABEL, WebviewUrl::External(parsed))
        .on_navigation(move |u| {
            log_nav.log(
                "navigation",
                "embed on_navigation",
                serde_json::json!({ "url": u.as_str() }),
            );
            true
        })
        .on_page_load(move |_w, payload| {
            log_page.log(
                "navigation",
                "embed on_page_load",
                serde_json::json!({
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
    if isolated_store {
        builder = builder.data_store_identifier(*b"gamelibspike016\0");
    }

    state.log.log(
        "embed",
        "add_child",
        serde_json::json!({
            "url": url, "spoofUa": spoof_ua, "isolatedStore": isolated_store,
            "requested": { "x": x, "y": y, "w": w, "h": h },
            "thread": thread_kind(),
        }),
    );

    let started = Instant::now();
    match window.add_child(
        builder,
        LogicalPosition::new(x, y),
        LogicalSize::new(w, h),
    ) {
        Ok(webview) => {
            let bounds = webview.bounds().map(|b| format!("{b:?}")).unwrap_or_default();
            let v = serde_json::json!({
                "label": EMBED_LABEL,
                "elapsedMs": started.elapsed().as_millis() as u64,
                "boundsReadback": bounds,
                "windowWebviews": window.webviews().iter().map(|w| w.label().to_string()).collect::<Vec<_>>(),
                "windowNumber": ns_window_number(&window),
            });
            state.log.log("embed", "add_child OK", v.clone());
            Ok(v)
        }
        Err(e) => {
            let msg = e.to_string();
            state
                .log
                .log("embed", "add_child FAILED", serde_json::json!({ "error": msg }));
            Err(msg)
        }
    }
}

/// THE 017 QUESTION: JS-measured rect → native child bounds.
#[tauri::command]
fn set_embed_bounds(
    app: AppHandle,
    state: tauri::State<'_, State>,
    label: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    quiet: Option<bool>,
) -> Result<serde_json::Value, String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("no webview '{label}'"))?;
    let started = Instant::now();
    webview
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    webview
        .set_size(LogicalSize::new(w, h))
        .map_err(|e| e.to_string())?;
    let pos = webview.position().map_err(|e| e.to_string())?;
    let size = webview.size().map_err(|e| e.to_string())?;
    let scale = webview
        .window()
        .scale_factor()
        .map_err(|e| e.to_string())?;
    let v = serde_json::json!({
        "requestedLogical": { "x": x, "y": y, "w": w, "h": h },
        "readbackPhysical": { "x": pos.x, "y": pos.y, "w": size.width, "h": size.height },
        "readbackLogical": {
            "x": pos.x as f64 / scale, "y": pos.y as f64 / scale,
            "w": size.width as f64 / scale, "h": size.height as f64 / scale
        },
        "scaleFactor": scale,
        "elapsedMs": started.elapsed().as_millis() as u64,
    });
    if !quiet.unwrap_or(false) {
        state.log.log("bounds", "set_bounds round-trip", v.clone());
    }
    Ok(v)
}

#[tauri::command]
fn set_embed_visible(
    app: AppHandle,
    state: tauri::State<'_, State>,
    label: String,
    visible: bool,
) -> Result<(), String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("no webview '{label}'"))?;
    let r = if visible { webview.show() } else { webview.hide() };
    state.log.log(
        "embed",
        if visible { "show" } else { "hide" },
        serde_json::json!({ "label": label, "ok": r.is_ok(), "error": r.as_ref().err().map(|e| e.to_string()) }),
    );
    r.map_err(|e| e.to_string())
}

#[tauri::command]
fn destroy_embed(app: AppHandle, state: tauri::State<'_, State>, label: String) -> Result<(), String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("no webview '{label}'"))?;
    webview.close().map_err(|e| e.to_string())?;
    state
        .log
        .log("embed", "destroyed", serde_json::json!({ "label": label }));
    Ok(())
}

#[tauri::command]
fn navigate_embed(app: AppHandle, state: tauri::State<'_, State>, label: String, url: String) -> Result<(), String> {
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("no webview '{label}'"))?;
    let parsed = Url::parse(&url).map_err(|e| e.to_string())?;
    state
        .log
        .log("embed", "navigate", serde_json::json!({ "label": label, "url": url }));
    webview.navigate(parsed).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_webviews(app: AppHandle, state: tauri::State<'_, State>) -> serde_json::Value {
    let all: Vec<serde_json::Value> = app
        .webviews()
        .iter()
        .map(|(label, w)| {
            serde_json::json!({
                "label": label,
                "window": w.window().label().to_string(),
                "url": w.url().map(|u| u.to_string()).unwrap_or_else(|e| format!("<err {e}>")),
                "boundsPhysical": w.bounds().map(|b| format!("{b:?}")).unwrap_or_else(|e| format!("<err {e}>")),
            })
        })
        .collect();
    let v = serde_json::json!({ "count": all.len(), "webviews": all });
    state.log.log("embed", "list_webviews", v.clone());
    v
}

/// THE 018 QUESTION (cookies leg): does `cookies()` work on a CHILD handle,
/// and what does the MAIN handle see of the same jar?
#[tauri::command]
fn read_cookies(
    app: AppHandle,
    state: tauri::State<'_, State>,
    label: String,
) -> serde_json::Value {
    let started = Instant::now();
    let result = match app.get_webview(&label) {
        Some(w) => w.cookies().map_err(|e| e.to_string()),
        None => Err(format!("no webview '{label}'")),
    };
    let (ok, error, cookies) = match result {
        Ok(c) => (true, None, c.iter().map(to_out).collect::<Vec<_>>()),
        Err(e) => (false, Some(e), Vec::new()),
    };
    let control_seen: Vec<String> = cookies
        .iter()
        .filter(|c| control_server::CONTROL_COOKIES.iter().any(|(n, _)| *n == c.name))
        .map(|c| c.name.clone())
        .collect();
    let v = serde_json::json!({
        "api": "cookies",
        "webview": label,
        "thread": thread_kind(),
        "ok": ok,
        "error": error,
        "elapsedMs": started.elapsed().as_millis() as u64,
        "count": cookies.len(),
        "controlCookiesSeen": control_seen,
        "cookies": cookies,
    });
    state.log.log("cookie-read", "cookies()", v.clone());
    v
}

/// Probe B: the "documented" multiwebview shape — a bare Window (no webview)
/// plus TWO children: an app-origin panel and an external store webview.
#[tauri::command]
fn create_multi_window(app: AppHandle, state: tauri::State<'_, State>) -> Result<serde_json::Value, String> {
    if let Some(w) = app.get_window("multi") {
        let _ = w.close();
        std::thread::sleep(Duration::from_millis(250));
    }
    let window = tauri::window::WindowBuilder::new(&app, "multi")
        .title("probe B — bare Window + two child webviews")
        .inner_size(1100.0, 720.0)
        .build()
        .map_err(|e| format!("WindowBuilder.build: {e}"))?;

    let panel = WebviewBuilder::new("multi-panel", WebviewUrl::App("index.html".into()));
    window
        .add_child(panel, LogicalPosition::new(0.0, 0.0), LogicalSize::new(320.0, 720.0))
        .map_err(|e| format!("add_child(panel): {e}"))?;

    let log_page = state.log.clone();
    let store = WebviewBuilder::new(
        "multi-store",
        WebviewUrl::External(Url::parse(GOG_STORE_URL).map_err(|e| e.to_string())?),
    )
    .user_agent(CHROME_UA)
    .on_page_load(move |_w, payload| {
        log_page.log(
            "navigation",
            "multi-store on_page_load",
            serde_json::json!({
                "url": payload.url().as_str(),
                "event": match payload.event() {
                    PageLoadEvent::Started => "started",
                    PageLoadEvent::Finished => "finished",
                },
            }),
        );
    });
    window
        .add_child(store, LogicalPosition::new(320.0, 0.0), LogicalSize::new(780.0, 720.0))
        .map_err(|e| format!("add_child(store): {e}"))?;

    let labels: Vec<String> = window.webviews().iter().map(|w| w.label().to_string()).collect();
    let v = serde_json::json!({ "window": "multi", "webviews": labels, "windowNumber": ns_window_number(&window) });
    state.log.log("embed", "probe B window built", v.clone());
    Ok(v)
}

#[tauri::command]
fn close_multi_window(app: AppHandle, state: tauri::State<'_, State>) -> Result<(), String> {
    let w = app.get_window("multi").ok_or("no window 'multi'")?;
    w.close().map_err(|e| e.to_string())?;
    state.log.log("embed", "probe B window closed", serde_json::json!({}));
    Ok(())
}

#[tauri::command]
fn log_from_ui(state: tauri::State<'_, State>, category: String, message: String, data: serde_json::Value) {
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

#[tauri::command]
fn control_origin() -> String {
    control_server::ORIGIN.to_string()
}

// ─────────────────────────── scripted autorun ───────────────────────────
//
// `SPIKE_AUTORUN=1 cargo run` drives the full 016→017→018 sequence without a
// human clicking. The interactive control panel still exists for the visual
// verification (compositing, input, scrolling) that a log cannot capture.

fn autorun(app: AppHandle, log: Arc<Logger>) {
    // Helpers hop to the main thread like the real backend would; add_child
    // does its own internal main-thread dispatch either way (window/mod.rs:1129).
    let on_main = |f: Box<dyn FnOnce(AppHandle) -> serde_json::Value + Send>| -> serde_json::Value {
        let (tx, rx) = std::sync::mpsc::channel();
        let app2 = app.clone();
        let _ = app.run_on_main_thread(move || {
            let _ = tx.send(f(app2));
        });
        rx.recv_timeout(Duration::from_secs(20))
            .unwrap_or_else(|e| serde_json::json!({ "error": format!("main-thread call never returned: {e}") }))
    };

    let step = |name: &str, v: &serde_json::Value| {
        log.log("autorun", name, v.clone());
    };

    log.log("autorun", "=== PHASE 0: baseline ===", serde_json::json!({}));
    let v = on_main(Box::new(|app| {
        let state = app.state::<State>();
        list_webviews(app.clone(), state)
    }));
    step("0a list_webviews before anything (expect exactly ['main'])", &v);

    log.log("autorun", "=== PHASE 1 (016 KILL-SHOT): add_child on the config-created main window ===", serde_json::json!({}));
    let v = on_main(Box::new(|app| {
        let state = app.state::<State>();
        match create_embed(
            app.clone(), state,
            format!("{}/set", control_server::ORIGIN),
            true, false,
            290.0, 96.0, 760.0, 560.0,
        ) {
            Ok(v) => v,
            Err(e) => serde_json::json!({ "error": e }),
        }
    }));
    step("1a create_embed → control origin /set (UA + cookie oracles server-side)", &v);
    let embed_created = v.get("error").is_none();
    std::thread::sleep(Duration::from_millis(2000));

    if !embed_created {
        log.log(
            "autorun",
            "=== ABORT: add_child failed — 016 INVALIDATED on the primary path; probe B still runs ===",
            serde_json::json!({}),
        );
    } else {
        let v = on_main(Box::new(|app| {
            let state = app.state::<State>();
            list_webviews(app.clone(), state)
        }));
        step("1b list_webviews (expect main + store-embed, same window)", &v);

        log.log("autorun", "=== PHASE 2 (016): /probe — server echoes Cookie header + UA of the EMBED ===", serde_json::json!({}));
        let v = on_main(Box::new(|app| {
            let state = app.state::<State>();
            match navigate_embed(app.clone(), state, EMBED_LABEL.into(), format!("{}/probe", control_server::ORIGIN)) {
                Ok(()) => serde_json::json!({ "ok": true }),
                Err(e) => serde_json::json!({ "error": e }),
            }
        }));
        step("2a navigate embed to /probe", &v);
        std::thread::sleep(Duration::from_millis(1500));

        log.log("autorun", "=== PHASE 3 (016): a REAL store page in the embed ===", serde_json::json!({}));
        let v = on_main(Box::new(|app| {
            let state = app.state::<State>();
            match navigate_embed(app.clone(), state, EMBED_LABEL.into(), STEAM_STORE_URL.into()) {
                Ok(()) => serde_json::json!({ "ok": true }),
                Err(e) => serde_json::json!({ "error": e }),
            }
        }));
        step("3a navigate embed to the Steam store", &v);
        std::thread::sleep(Duration::from_secs(10));

        log.log("autorun", "=== PHASE 4 (017): bounds round-trips, hide/show ===", serde_json::json!({}));
        for (i, (x, y, w, h)) in [
            (290.0, 96.0, 900.0, 700.0),
            (10.0, 400.0, 400.0, 300.0),
            (290.5, 96.5, 760.25, 560.75), // fractional CSS px — the WKWebView grid gotcha zone
        ]
        .iter()
        .enumerate()
        {
            let (x, y, w, h) = (*x, *y, *w, *h);
            let v = on_main(Box::new(move |app| {
                let state = app.state::<State>();
                match set_embed_bounds(app.clone(), state, EMBED_LABEL.into(), x, y, w, h, Some(false)) {
                    Ok(v) => v,
                    Err(e) => serde_json::json!({ "error": e }),
                }
            }));
            step(&format!("4{} set_bounds({x},{y},{w},{h}) round-trip", (b'a' + i as u8) as char), &v);
            std::thread::sleep(Duration::from_millis(400));
        }
        let v = on_main(Box::new(|app| {
            let state = app.state::<State>();
            match set_embed_visible(app.clone(), state, EMBED_LABEL.into(), false) {
                Ok(()) => serde_json::json!({ "ok": true }),
                Err(e) => serde_json::json!({ "error": e }),
            }
        }));
        step("4d hide()", &v);
        std::thread::sleep(Duration::from_millis(600));
        let v = on_main(Box::new(|app| {
            let state = app.state::<State>();
            match set_embed_visible(app.clone(), state, EMBED_LABEL.into(), true) {
                Ok(()) => serde_json::json!({ "ok": true }),
                Err(e) => serde_json::json!({ "error": e }),
            }
        }));
        step("4e show()", &v);

        log.log("autorun", "=== PHASE 5 (018): cookies on child vs main handle ===", serde_json::json!({}));
        let v = on_main(Box::new(|app| {
            let state = app.state::<State>();
            read_cookies(app.clone(), state, EMBED_LABEL.into())
        }));
        step("5a cookies() on the CHILD handle (expect control + steam cookies)", &v);
        let v = on_main(Box::new(|app| {
            let state = app.state::<State>();
            read_cookies(app.clone(), state, "main".into())
        }));
        step("5b cookies() on the MAIN handle (default shared jar? — 015 said yes for windows)", &v);
    }

    log.log("autorun", "=== PHASE 6 (016 probe B): bare Window + two children ===", serde_json::json!({}));
    let v = on_main(Box::new(|app| {
        let state = app.state::<State>();
        match create_multi_window(app.clone(), state) {
            Ok(v) => v,
            Err(e) => serde_json::json!({ "error": e }),
        }
    }));
    step("6a create_multi_window", &v);
    std::thread::sleep(Duration::from_secs(6));
    let v = on_main(Box::new(|app| {
        let state = app.state::<State>();
        list_webviews(app.clone(), state)
    }));
    step("6b list_webviews with probe B alive", &v);
    let v = on_main(Box::new(|app| {
        let state = app.state::<State>();
        match close_multi_window(app.clone(), state) {
            Ok(()) => serde_json::json!({ "ok": true }),
            Err(e) => serde_json::json!({ "error": e }),
        }
    }));
    step("6c close probe B window", &v);
    std::thread::sleep(Duration::from_millis(800));

    if embed_created {
        log.log("autorun", "=== PHASE 7: destroy the embed; handle lifetime after close ===", serde_json::json!({}));
        let v = on_main(Box::new(|app| {
            let state = app.state::<State>();
            match destroy_embed(app.clone(), state, EMBED_LABEL.into()) {
                Ok(()) => serde_json::json!({ "ok": true }),
                Err(e) => serde_json::json!({ "error": e }),
            }
        }));
        step("7a destroy_embed", &v);
        std::thread::sleep(Duration::from_millis(800));
        let v = on_main(Box::new(|app| {
            let state = app.state::<State>();
            list_webviews(app.clone(), state)
        }));
        step("7b list_webviews after destroy (expect ['main'] again)", &v);
        let v = on_main(Box::new(|app| {
            let state = app.state::<State>();
            read_cookies(app.clone(), state, EMBED_LABEL.into())
        }));
        step("7c cookies() on the DESTROYED child (expect loud error — 015's handle-lifetime rule)", &v);

        log.log("autorun", "=== PHASE 8 (018): data_store_identifier isolation on a CHILD webview ===", serde_json::json!({}));
        // Discriminator: the SHARED jar holds Steam-store cookies from phase 3.
        // A genuinely isolated child jar is fresh — it must see the control
        // cookies its own /set visit installs but NOT the Steam cookies.
        let v = on_main(Box::new(|app| {
            let state = app.state::<State>();
            match create_embed(
                app.clone(), state,
                format!("{}/set", control_server::ORIGIN),
                true, true,
                290.0, 96.0, 760.0, 560.0,
            ) {
                Ok(v) => v,
                Err(e) => serde_json::json!({ "error": e }),
            }
        }));
        step("8a create_embed ISOLATED → control /set", &v);
        std::thread::sleep(Duration::from_millis(2000));
        let v = on_main(Box::new(|app| {
            let state = app.state::<State>();
            read_cookies(app.clone(), state, EMBED_LABEL.into())
        }));
        step("8b cookies() on the ISOLATED child (expect spike_* present, Steam cookies ABSENT)", &v);
        let v = on_main(Box::new(|app| {
            let state = app.state::<State>();
            read_cookies(app.clone(), state, "main".into())
        }));
        step("8c cookies() on MAIN (expect Steam cookies still present — shared jar untouched)", &v);
        let v = on_main(Box::new(|app| {
            let state = app.state::<State>();
            match destroy_embed(app.clone(), state, EMBED_LABEL.into()) {
                Ok(()) => serde_json::json!({ "ok": true }),
                Err(e) => serde_json::json!({ "error": e }),
            }
        }));
        step("8d destroy isolated embed", &v);
    }

    log.log("autorun", "=== COMPLETE ===", serde_json::json!({}));

    if std::env::var("SPIKE_AUTORUN_EXIT").is_ok() {
        let state = app.state::<State>();
        if let Ok(p) = export_log(state) {
            log.log("autorun", "exported", serde_json::json!({ "path": p }));
        }
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

    let log_for_server = logger.clone();
    let server_log: control_server::LogFn = Arc::new(move |c, m, d| log_for_server.log(c, m, d));
    if let Err(e) = control_server::start(server_log) {
        eprintln!("control server failed to bind: {e}");
    }

    let state = State { log: logger.clone() };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            env_report,
            create_embed,
            set_embed_bounds,
            set_embed_visible,
            destroy_embed,
            navigate_embed,
            list_webviews,
            read_cookies,
            create_multi_window,
            close_multi_window,
            log_from_ui,
            export_log,
            control_origin,
        ])
        .setup(move |app| {
            let _ = MAIN_THREAD.set(std::thread::current().id());
            if let Ok(mut slot) = logger.app.lock() {
                *slot = Some(app.handle().clone());
            }
            logger.log(
                "app",
                "started",
                serde_json::json!({
                    "mainThread": format!("{:?}", std::thread::current().id()),
                    "controlOrigin": control_server::ORIGIN,
                    "unstableFeature": true,
                }),
            );
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
