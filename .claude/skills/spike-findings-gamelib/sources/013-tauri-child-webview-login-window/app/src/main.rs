// Spike 013 / 014a / 014b / 015 harness.
//
// One Tauri 2.11.5 app, four questions:
//
//   013  Can a child WebviewWindow load a LIVE login site, with a spoofed UA,
//        and can the parent observe every navigation? (the `<webview>` +
//        did-navigate relay that WebView/index.tsx does today)
//   014a Does the Rust cookie API (Webview::cookies / cookies_for_url) actually
//        return cookies on macOS — and can we TELL "empty" from "unsupported"?
//   014b What does the injected-JS document.cookie channel see instead?
//   015  Does the jar survive window close + app restart, and is it isolated?
//
// The design constraint that drives everything here: a read that returns zero
// cookies must never be reported as a bare `[]`. Every read is classified into
// an explicit verdict, and the classification is only allowed to say
// "genuinely empty" when a POSITIVE CONTROL proves the API is live.

mod control_server;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::webview::{Cookie, PageLoadEvent};
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder};

/// A standard Chrome UA — the same reinforcement the Humble flow needs
/// (`standardBrowserUserAgent()` in src/backend/humble/userAgent.ts).
const CHROME_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const HUMBLE_LOGIN_URL: &str = "https://www.humblebundle.com/login";

/// Captured in `setup()`. Every cookie read records whether it ran here — wry's
/// macOS implementation pumps `NSRunLoop::mainRunLoop()` while it waits
/// (wry-0.55.1/src/wkwebview/mod.rs:1465), which is only meaningful on the main
/// thread. Tauri's docs warn about a deadlock on Windows; nobody documents what
/// macOS does off-thread, so we measure it.
static MAIN_THREAD: OnceLock<std::thread::ThreadId> = OnceLock::new();

/// Set the first time ANY read returns at least one control cookie. This is the
/// single fact that makes a later empty read interpretable.
static API_PROVEN_LIVE: AtomicBool = AtomicBool::new(false);

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
    // No chrono dependency for a spike — hand-format UTC from the epoch.
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

// ─────────────────────────── cookie reporting ───────────────────────────

#[derive(Serialize, Clone)]
struct CookieOut {
    name: String,
    /// Real cookie VALUES are secrets (user.ts: "must NEVER be logged"). Control
    /// cookies we set ourselves are shown in full; everything else is redacted
    /// to a length + 3-char prefix, which is enough to prove identity/change
    /// across polls without ever writing a session token to disk.
    value: String,
    value_len: usize,
    domain: String,
    path: String,
    http_only: bool,
    secure: bool,
    same_site: String,
    expires: String,
}

#[derive(Serialize, Clone)]
struct ReadReport {
    api: String,
    webview: String,
    url: Option<String>,
    /// "main" | "worker" | "main (hopped)"
    thread: String,
    ok: bool,
    error: Option<String>,
    elapsed_ms: u128,
    count: usize,
    cookies: Vec<CookieOut>,
    control_cookies_seen: Vec<String>,
    /// THE POINT OF THE SPIKE. Never a bare `[]`.
    verdict: String,
    verdict_note: String,
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
        path: c.path().unwrap_or("<none>").to_string(),
        http_only: c.http_only().unwrap_or(false),
        secure: c.secure().unwrap_or(false),
        same_site: c
            .same_site()
            .map(|s| format!("{s:?}"))
            .unwrap_or_else(|| "<none>".into()),
        expires: c
            .expires()
            .map(|e| format!("{e:?}"))
            .unwrap_or_else(|| "<none>".into()),
    }
}

fn classify(
    ok: bool,
    error: &Option<String>,
    cookies: &[CookieOut],
    control_seen: &[String],
) -> (String, String) {
    if !ok {
        return (
            "UNSUPPORTED_OR_ERROR".into(),
            format!(
                "The API returned Err — this is a LOUD failure, distinguishable from empty: {}",
                error.clone().unwrap_or_default()
            ),
        );
    }
    if !control_seen.is_empty() {
        API_PROVEN_LIVE.store(true, Ordering::SeqCst);
    }
    if !cookies.is_empty() {
        return (
            "SUPPORTED_NONEMPTY".into(),
            format!("{} cookie(s) returned; API is demonstrably live.", cookies.len()),
        );
    }
    if API_PROVEN_LIVE.load(Ordering::SeqCst) {
        (
            "SUPPORTED_BUT_EMPTY".into(),
            "Zero cookies, but a control cookie was successfully read earlier in this \
             session, so the API works on this platform. This empty result is a REAL \
             'not logged in yet' — safe for a watchForLogin-style poll to keep waiting on."
                .into(),
        )
    } else {
        (
            "UNDECIDABLE".into(),
            "Zero cookies AND the API has never returned a control cookie this session. \
             'Empty jar' and 'no-op API' are INDISTINGUISHABLE here. A watchForLogin-style \
             poll would spin silently forever on exactly this result. Load the control \
             origin first."
                .into(),
        )
    }
}

fn build_report(
    api: &str,
    label: &str,
    url: Option<String>,
    thread: &str,
    started: Instant,
    result: Result<Vec<Cookie<'static>>, String>,
) -> ReadReport {
    let elapsed_ms = started.elapsed().as_millis();
    let (ok, error, cookies) = match result {
        Ok(c) => (true, None, c.iter().map(to_out).collect::<Vec<_>>()),
        Err(e) => (false, Some(e), Vec::<CookieOut>::new()),
    };
    let control_cookies_seen: Vec<String> = cookies
        .iter()
        .filter(|c| control_server::CONTROL_COOKIES.iter().any(|(n, _)| *n == c.name))
        .map(|c| c.name.clone())
        .collect();
    let (verdict, verdict_note) = classify(ok, &error, &cookies, &control_cookies_seen);
    ReadReport {
        api: api.to_string(),
        webview: label.to_string(),
        url,
        thread: thread.to_string(),
        ok,
        error,
        elapsed_ms,
        count: cookies.len(),
        cookies,
        control_cookies_seen,
        verdict,
        verdict_note,
    }
}

fn thread_kind() -> &'static str {
    match MAIN_THREAD.get() {
        Some(id) if *id == std::thread::current().id() => "main",
        _ => "worker",
    }
}

fn read_now(app: &AppHandle, label: &str, url: Option<&str>) -> ReadReport {
    let started = Instant::now();
    let window = match app.get_webview_window(label) {
        Some(w) => w,
        None => {
            return build_report(
                "n/a",
                label,
                url.map(str::to_string),
                thread_kind(),
                started,
                Err(format!("no webview window labelled '{label}'")),
            )
        }
    };
    match url {
        Some(u) => {
            let parsed = match Url::parse(u) {
                Ok(p) => p,
                Err(e) => {
                    return build_report(
                        "cookies_for_url",
                        label,
                        Some(u.to_string()),
                        thread_kind(),
                        started,
                        Err(format!("bad url: {e}")),
                    )
                }
            };
            let r = window.cookies_for_url(parsed).map_err(|e| e.to_string());
            build_report(
                "cookies_for_url",
                label,
                Some(u.to_string()),
                thread_kind(),
                started,
                r,
            )
        }
        None => {
            let r = window.cookies().map_err(|e| e.to_string());
            build_report("cookies", label, None, thread_kind(), started, r)
        }
    }
}

// ─────────────────────────── commands ───────────────────────────

struct State {
    log: Arc<Logger>,
}

#[tauri::command]
fn env_report(state: tauri::State<'_, State>) -> serde_json::Value {
    let v = serde_json::json!({
        "tauri": "2.11.5 (Cargo.lock-pinned, matches src-tauri)",
        "wry": "0.55.1",
        "controlOrigin": control_server::ORIGIN,
        "humbleUrl": HUMBLE_LOGIN_URL,
        "mainThreadCaptured": MAIN_THREAD.get().is_some(),
    });
    state.log.log("env", "environment", v.clone());
    v
}

#[tauri::command]
fn open_login(
    app: AppHandle,
    state: tauri::State<'_, State>,
    label: String,
    url: String,
    spoof_ua: bool,
    incognito: bool,
    isolated_store: bool,
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

    // 014b channel A: can a REMOTE page invoke back into Rust at all?
    let init = r#"
(function () {
  window.__SPIKE_IPC__ = 'pending';
  function tryInvoke(stage) {
    try {
      if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
        window.__TAURI__.core
          .invoke('report_from_page', { stage: stage, cookie: document.cookie || '', href: location.href })
          .then(function () { window.__SPIKE_IPC__ = 'ok@' + stage; })
          .catch(function (e) { window.__SPIKE_IPC__ = 'rejected: ' + e; });
      } else {
        window.__SPIKE_IPC__ = 'no __TAURI__ global on this origin';
      }
    } catch (e) {
      window.__SPIKE_IPC__ = 'threw: ' + e;
    }
  }
  tryInvoke('init');
  document.addEventListener('DOMContentLoaded', function () { tryInvoke('domcontentloaded'); });
})();
"#;

    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .title(format!("spike login — {label}"))
        .inner_size(1100.0, 820.0)
        .initialization_script(init)
        .incognito(incognito)
        .on_navigation(move |u| {
            // This is the Tauri equivalent of the `did-navigate` /
            // `did-navigate-in-page` relay that drives notifyLoginNavigated().
            log_nav.log(
                "navigation",
                "on_navigation",
                serde_json::json!({ "window": label_nav, "url": u.as_str() }),
            );
            true
        })
        .on_page_load(move |w, payload| {
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
                    "title": w.title().unwrap_or_default(),
                }),
            );
        });

    if spoof_ua {
        builder = builder.user_agent(CHROME_UA);
    }
    if isolated_store {
        // 015: macOS 14+/iOS 17+ only. The nearest thing Tauri has to Electron's
        // session.fromPartition('persist:humble').
        builder = builder.data_store_identifier(*b"gamelibspike015\0");
    }

    state.log.log(
        "window",
        "opening",
        serde_json::json!({
            "label": label, "url": url, "spoofUa": spoof_ua,
            "incognito": incognito, "isolatedStore": isolated_store
        }),
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
fn navigate(app: AppHandle, label: String, url: String) -> Result<(), String> {
    let w = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("no window '{label}'"))?;
    let parsed = Url::parse(&url).map_err(|e| e.to_string())?;
    w.navigate(parsed).map_err(|e| e.to_string())
}

/// Sync command → whatever thread Tauri runs sync commands on.
#[tauri::command]
fn read_cookies_sync(
    app: AppHandle,
    state: tauri::State<'_, State>,
    label: String,
    url: Option<String>,
) -> ReadReport {
    let report = read_now(&app, &label, url.as_deref());
    state.log.log(
        "cookie-read",
        &format!("{} [{}] {}", report.api, report.thread, report.verdict),
        serde_json::to_value(&report).unwrap_or_default(),
    );
    report
}

/// Async command → Tauri's async runtime worker thread.
#[tauri::command]
async fn read_cookies_async(
    app: AppHandle,
    state: tauri::State<'_, State>,
    label: String,
    url: Option<String>,
) -> Result<ReadReport, String> {
    let report = read_now(&app, &label, url.as_deref());
    state.log.log(
        "cookie-read",
        &format!("{} [{}] {}", report.api, report.thread, report.verdict),
        serde_json::to_value(&report).unwrap_or_default(),
    );
    Ok(report)
}

/// Async command that explicitly hops to the main thread first — the shape a
/// real sidecar/backend poller would have to use if off-thread reads misbehave.
#[tauri::command]
async fn read_cookies_on_main(
    app: AppHandle,
    state: tauri::State<'_, State>,
    label: String,
    url: Option<String>,
) -> Result<ReadReport, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let app2 = app.clone();
    app.run_on_main_thread(move || {
        let r = read_now(&app2, &label, url.as_deref());
        let _ = tx.send(r);
    })
    .map_err(|e| e.to_string())?;
    let mut report = rx
        .recv_timeout(Duration::from_secs(10))
        .map_err(|e| format!("main-thread read never returned: {e}"))?;
    report.thread = "main (hopped)".into();
    state.log.log(
        "cookie-read",
        &format!("{} [{}] {}", report.api, report.thread, report.verdict),
        serde_json::to_value(&report).unwrap_or_default(),
    );
    Ok(report)
}

/// 014b channel B — the side channel that works even when remote-origin IPC is
/// denied: stuff `document.cookie` into `document.title` and read the title
/// back from Rust.
#[tauri::command]
async fn read_document_cookie(
    app: AppHandle,
    state: tauri::State<'_, State>,
    label: String,
) -> Result<serde_json::Value, String> {
    let w = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("no window '{label}'"))?;
    let original = w.title().unwrap_or_default();
    let marker = "SPIKE_DC::";
    w.eval(&format!(
        "document.title = {marker:?} + (document.cookie || '<empty>') + '::IPC=' + (window.__SPIKE_IPC__ || 'unset');"
    ))
    .map_err(|e| e.to_string())?;

    let started = Instant::now();
    let mut got: Option<String> = None;
    while started.elapsed() < Duration::from_secs(3) {
        std::thread::sleep(Duration::from_millis(60));
        if let Ok(t) = w.title() {
            if let Some(rest) = t.strip_prefix(marker) {
                got = Some(rest.to_string());
                break;
            }
        }
    }
    let _ = w.set_title(&original);

    let (cookie_part, ipc_part) = match &got {
        Some(s) => match s.split_once("::IPC=") {
            Some((c, i)) => (c.to_string(), i.to_string()),
            None => (s.clone(), "unknown".to_string()),
        },
        None => (String::new(), "unknown".to_string()),
    };
    let names: Vec<String> = cookie_part
        .split(';')
        .filter_map(|kv| kv.split('=').next())
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty() && n != "<empty>")
        .collect();

    let v = serde_json::json!({
        "channel": "document.title side-channel",
        "window": label,
        "ok": got.is_some(),
        "elapsedMs": started.elapsed().as_millis() as u64,
        "documentCookieNames": names,
        "documentCookieRaw": if cookie_part.contains("spike_") || cookie_part == "<empty>" {
            cookie_part.clone()
        } else {
            format!("<redacted {} chars>", cookie_part.len())
        },
        "remoteIpcStatus": ipc_part,
        "note": if got.is_none() {
            "eval → title never came back; the JS channel itself is the failure, not the cookie"
        } else if names.is_empty() {
            "document.cookie is EMPTY — note this is ALSO what HttpOnly-only jars look like"
        } else {
            "document.cookie visible; compare names against the Rust read to find HttpOnly gaps"
        }
    });
    state
        .log
        .log("cookie-read", "document.cookie (title channel)", v.clone());
    Ok(v)
}

/// Invoked by the injected script IF remote-origin IPC is permitted.
#[tauri::command]
fn report_from_page(
    state: tauri::State<'_, State>,
    stage: String,
    cookie: String,
    href: String,
) -> bool {
    let names: Vec<String> = cookie
        .split(';')
        .filter_map(|kv| kv.split('=').next())
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty())
        .collect();
    state.log.log(
        "remote-ipc",
        "page invoked Rust",
        serde_json::json!({ "stage": stage, "href": href, "documentCookieNames": names }),
    );
    true
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
        "apiProvenLive": API_PROVEN_LIVE.load(Ordering::SeqCst),
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
// `SPIKE_AUTORUN=1 cargo run` drives the whole probe sequence without a human
// clicking, so the evidence is reproducible and diffable. The interactive UI
// still exists — this just guarantees the same 20 reads happen in the same
// order every time.

fn autorun(app: AppHandle, log: Arc<Logger>) {
    let read_main = |label: &str, url: Option<&str>| -> ReadReport {
        let (tx, rx) = std::sync::mpsc::channel();
        let app2 = app.clone();
        let label = label.to_string();
        let url = url.map(str::to_string);
        let dispatched = app
            .run_on_main_thread(move || {
                let _ = tx.send(read_now(&app2, &label, url.as_deref()));
            })
            .is_ok();
        if !dispatched {
            log.log("autorun", "run_on_main_thread failed", serde_json::json!({}));
        }
        rx.recv_timeout(Duration::from_secs(15))
            .unwrap_or_else(|e| {
                build_report(
                    "cookies",
                    "?",
                    None,
                    "main (hopped)",
                    Instant::now(),
                    Err(format!("main-thread read never returned: {e}")),
                )
            })
    };

    let announce = |report: &ReadReport, step: &str| {
        log.log(
            "autorun",
            step,
            serde_json::to_value(report).unwrap_or_default(),
        );
    };

    let open = |label: &str, url: &str, spoof: bool, incognito: bool, store: bool| {
        let (tx, rx) = std::sync::mpsc::channel();
        let app2 = app.clone();
        let (label, url) = (label.to_string(), url.to_string());
        let _ = app.run_on_main_thread(move || {
            let state = app2.state::<State>();
            let r = open_login(app2.clone(), state, label, url, spoof, incognito, store);
            let _ = tx.send(r);
        });
        let _ = rx.recv_timeout(Duration::from_secs(10));
    };

    let doc_cookie = |label: &str| {
        let (tx, rx) = std::sync::mpsc::channel();
        let app2 = app.clone();
        let label = label.to_string();
        let label_eval = label.clone();
        let _ = app.run_on_main_thread(move || {
            // The title side-channel needs the main thread to eval + poll, but
            // polling would block the main thread. Kick off the eval here and
            // read the title from the autorun thread instead.
            if let Some(w) = app2.get_webview_window(&label_eval) {
                let _ = w.eval(
                    "document.title = 'SPIKE_DC::' + (document.cookie || '<empty>') + '::IPC=' + (window.__SPIKE_IPC__ || 'unset');",
                );
            }
            let _ = tx.send(());
        });
        let _ = rx.recv_timeout(Duration::from_secs(5));
        std::thread::sleep(Duration::from_millis(700));
        let (tx2, rx2) = std::sync::mpsc::channel();
        let app3 = app.clone();
        let label2 = label.clone();
        let _ = app.run_on_main_thread(move || {
            let t = app3
                .get_webview_window(&label2)
                .and_then(|w| w.title().ok())
                .unwrap_or_default();
            let _ = tx2.send(t);
        });
        let title = rx2.recv_timeout(Duration::from_secs(5)).unwrap_or_default();
        let payload = title.strip_prefix("SPIKE_DC::").unwrap_or("<no channel>");
        let (cookie_part, ipc_part) = payload.split_once("::IPC=").unwrap_or((payload, "unknown"));
        let names: Vec<String> = cookie_part
            .split(';')
            .filter_map(|kv| kv.split('=').next())
            .map(|n| n.trim().to_string())
            .filter(|n| !n.is_empty() && n != "<empty>")
            .collect();
        log.log(
            "autorun",
            "document.cookie (title channel)",
            serde_json::json!({
                "window": label,
                "channelOk": title.starts_with("SPIKE_DC::"),
                "documentCookieNames": names,
                "remoteIpcStatus": ipc_part,
                "raw": if cookie_part.contains("spike_") || cookie_part == "<empty>" {
                    cookie_part.to_string()
                } else {
                    format!("<redacted {} chars>", cookie_part.len())
                }
            }),
        );
    };

    log.log("autorun", "=== PHASE 0: baseline, before any cookie exists ===", serde_json::json!({}));
    announce(&read_main("main", None), "0a cookies() on the MAIN app webview (tauri:// origin)");

    log.log("autorun", "=== PHASE 1: positive control ===", serde_json::json!({}));
    open("login-control", &format!("{}/set", control_server::ORIGIN), false, false, false);
    std::thread::sleep(Duration::from_millis(1500));
    announce(&read_main("login-control", None), "1a cookies()");
    announce(
        &read_main("login-control", Some(control_server::ORIGIN)),
        "1b cookies_for_url(http://localhost:17913)",
    );
    announce(
        &read_main("login-control", Some("http://127.0.0.1:17913")),
        "1c cookies_for_url(http://127.0.0.1:17913) — H1 domain-equality probe",
    );
    doc_cookie("login-control");

    log.log("autorun", "=== PHASE 2: independent oracle (/probe echoes the Cookie header) ===", serde_json::json!({}));
    let (tx, rx) = std::sync::mpsc::channel();
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(w) = app2.get_webview_window("login-control") {
            if let Ok(u) = Url::parse(&format!("{}/probe", control_server::ORIGIN)) {
                let _ = w.navigate(u);
            }
        }
        let _ = tx.send(());
    });
    let _ = rx.recv_timeout(Duration::from_secs(5));
    std::thread::sleep(Duration::from_millis(1500));

    log.log("autorun", "=== PHASE 3: H2 — thread behaviour ===", serde_json::json!({}));
    log.log("autorun", "3a about to call cookies() DIRECTLY from a worker thread (wry pumps the MAIN run loop while waiting). If the process dies here, that IS the finding.", serde_json::json!({}));
    let worker_report = read_now(&app, "login-control", None);
    announce(&worker_report, "3a cookies() from a WORKER thread");

    log.log("autorun", "=== PHASE 4: live site — humblebundle.com (anonymous) ===", serde_json::json!({}));
    open("login-humble", HUMBLE_LOGIN_URL, true, false, false);
    std::thread::sleep(Duration::from_secs(9));
    announce(&read_main("login-humble", None), "4a cookies() on the Humble window");
    announce(
        &read_main("login-humble", Some("https://www.humblebundle.com")),
        "4b cookies_for_url(https://www.humblebundle.com) — the URL watchForLogin uses",
    );
    announce(
        &read_main("login-humble", Some("https://humblebundle.com")),
        "4c cookies_for_url(https://humblebundle.com) — apex, H1 probe",
    );
    doc_cookie("login-humble");

    log.log("autorun", "=== PHASE 5: isolation (015) — can OTHER webviews see that jar? ===", serde_json::json!({}));
    announce(&read_main("main", None), "5a cookies() on the MAIN app webview");
    announce(&read_main("login-control", None), "5b cookies() on the CONTROL window");

    log.log("autorun", "=== PHASE 6: lifetime — read after the window closes ===", serde_json::json!({}));
    let (tx, rx) = std::sync::mpsc::channel();
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(w) = app2.get_webview_window("login-humble") {
            let _ = w.close();
        }
        let _ = tx.send(());
    });
    let _ = rx.recv_timeout(Duration::from_secs(5));
    std::thread::sleep(Duration::from_millis(1200));
    announce(
        &read_main("login-humble", None),
        "6a cookies() AFTER the login window was closed",
    );
    announce(
        &read_main("login-control", None),
        "6b cookies() on the surviving control window (does Humble's jar persist app-wide?)",
    );

    log.log(
        "autorun",
        "=== COMPLETE ===",
        serde_json::json!({ "apiProvenLive": API_PROVEN_LIVE.load(Ordering::SeqCst) }),
    );

    if std::env::var("SPIKE_AUTORUN_EXIT").is_ok() {
        let state = app.state::<State>();
        if let Ok(p) = export_log(state) {
            log.log("autorun", "exported", serde_json::json!({ "path": p }));
        }
        std::thread::sleep(Duration::from_millis(300));
        app.exit(0);
    }
}

/// Round 2. Three things round 1 could not answer:
///   014b — the document.title side-channel FAILED (Tauri's `title()` is the
///          native NSWindow title; WKWebView never syncs document.title into
///          it), so document.cookie was never actually observed. Replaced with
///          a navigation-exfil channel through the control server.
///   013  — the UA override was never verified against a real request.
///   015  — data_store_identifier isolation, and persistence across a restart.
fn autorun_b(app: AppHandle, log: Arc<Logger>) {
    let on_main = |f: Box<dyn FnOnce(AppHandle) + Send>| {
        let (tx, rx) = std::sync::mpsc::channel();
        let app2 = app.clone();
        let _ = app.run_on_main_thread(move || {
            f(app2);
            let _ = tx.send(());
        });
        let _ = rx.recv_timeout(Duration::from_secs(10));
    };

    let read_main = |label: &str, url: Option<&str>| -> ReadReport {
        let (tx, rx) = std::sync::mpsc::channel();
        let app2 = app.clone();
        let label = label.to_string();
        let url = url.map(str::to_string);
        let _ = app.run_on_main_thread(move || {
            let _ = tx.send(read_now(&app2, &label, url.as_deref()));
        });
        rx.recv_timeout(Duration::from_secs(15)).unwrap_or_else(|e| {
            build_report(
                "cookies",
                "?",
                None,
                "main (hopped)",
                Instant::now(),
                Err(format!("read never returned: {e}")),
            )
        })
    };

    let announce = |report: &ReadReport, step: &str| {
        log.log("autorun", step, serde_json::to_value(report).unwrap_or_default());
    };

    let open = |label: &str, url: &str, spoof: bool, incognito: bool, store: bool| {
        let (tx, rx) = std::sync::mpsc::channel();
        let app2 = app.clone();
        let (label, url) = (label.to_string(), url.to_string());
        let _ = app.run_on_main_thread(move || {
            let state = app2.state::<State>();
            let _ = tx.send(open_login(app2.clone(), state, label, url, spoof, incognito, store));
        });
        let _ = rx.recv_timeout(Duration::from_secs(10));
    };

    // The working 014b channel: make the page navigate to our own origin with
    // document.cookie in the query string.
    let exfil = |label: &str, tag: &str| {
        let script = format!(
            r#"(function () {{
  try {{
    var q = '?tag={tag}'
      + '&dc=' + encodeURIComponent(document.cookie || '')
      + '&ipc=' + encodeURIComponent(String(window.__SPIKE_IPC__ || 'unset'))
      + '&tauri=' + encodeURIComponent(String(!!(window.__TAURI__ && window.__TAURI__.core)))
      + '&origin=' + encodeURIComponent(location.origin)
      + '&ua=' + encodeURIComponent(navigator.userAgent);
    location.assign('{origin}/report' + q);
  }} catch (e) {{
    location.assign('{origin}/report?tag={tag}&dc=&ipc=' + encodeURIComponent('exfil threw: ' + e));
  }}
}})();"#,
            origin = control_server::ORIGIN
        );
        let label = label.to_string();
        let (tx, rx) = std::sync::mpsc::channel();
        let app2 = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Some(w) = app2.get_webview_window(&label) {
                let _ = w.eval(&script);
            }
            let _ = tx.send(());
        });
        let _ = rx.recv_timeout(Duration::from_secs(5));
        std::thread::sleep(Duration::from_millis(2500));
    };

    log.log("autorun", "=== ROUND 2 PHASE A: persistence across app restart ===", serde_json::json!({}));
    announce(
        &read_main("main", None),
        "A1 cookies() at cold start, BEFORE opening any window (did round 1's jar survive process exit?)",
    );

    log.log("autorun", "=== ROUND 2 PHASE B: UA override + document.cookie channel ===", serde_json::json!({}));
    open("login-control", &format!("{}/set", control_server::ORIGIN), true, false, false);
    std::thread::sleep(Duration::from_millis(1800));
    exfil("login-control", "control");
    announce(
        &read_main("login-control", Some(control_server::ORIGIN)),
        "B2 cookies_for_url(control origin) — the Rust-side counterpart of the same jar",
    );

    log.log("autorun", "=== ROUND 2 PHASE C: isolated data store (015 partition parity) ===", serde_json::json!({}));
    open("login-isolated", HUMBLE_LOGIN_URL, true, false, true);
    std::thread::sleep(Duration::from_secs(9));
    announce(
        &read_main("login-isolated", None),
        "C1 cookies() on the ISOLATED-store window",
    );
    announce(
        &read_main("main", None),
        "C2 cookies() on the MAIN webview — if this differs from C1, data_store_identifier really partitions",
    );
    announce(
        &read_main("login-isolated", Some("https://humblebundle.com")),
        "C3 cookies_for_url(apex) on the isolated window",
    );
    exfil("login-isolated", "humble-isolated");

    log.log(
        "autorun",
        "=== ROUND 2 COMPLETE ===",
        serde_json::json!({ "apiProvenLive": API_PROVEN_LIVE.load(Ordering::SeqCst) }),
    );
    let _ = on_main;

    if std::env::var("SPIKE_AUTORUN_EXIT").is_ok() {
        let state = app.state::<State>();
        let _ = export_log(state);
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
            open_login,
            close_login,
            navigate,
            read_cookies_sync,
            read_cookies_async,
            read_cookies_on_main,
            read_document_cookie,
            report_from_page,
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
                }),
            );
            if let Ok(round) = std::env::var("SPIKE_AUTORUN") {
                let handle = app.handle().clone();
                let log = logger.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(1200));
                    if round == "2" {
                        autorun_b(handle, log);
                    } else {
                        autorun(handle, log);
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running spike app");
}
