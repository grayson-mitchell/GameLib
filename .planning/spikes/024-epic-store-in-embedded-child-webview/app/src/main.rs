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
/// Spike 024 SUBJECT: Epic's storefront. The 2026-08-03 Talon 403 was measured on the
/// LOGIN endpoint (`/id/api/email/exists`); whether store PAGES are policed the same way
/// inside a Tauri-managed child webview (which does carry the injected globals) has never
/// been observed. That is the whole question here.
const EPIC_STORE_URL: &str = "https://store.epicgames.com/en-US/";
/// RUN 2 (2026-09-05): the URL GameLib would ACTUALLY ship. `WebView/index.tsx:143` builds
/// `https://www.epicgames.com/store/{lang}/` and `storeEmbedOrigins.ts:44` records the same.
/// That is a DIFFERENT HOST from `store.epicgames.com` above -- same `epicgames.com` apex, so
/// the origin table covers both, but `www.epicgames.com` is the host that serves the login
/// flow whose `/id/api/email/exists` returned the confirmed 403. Run 1 proved the host that is
/// NOT configured; this arm closes that gap rather than inferring across it.
const EPIC_STORE_CONFIGURED_URL: &str = "https://www.epicgames.com/store/en-US/";
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


// ─────────────── spike 024 runs 12+ (quick 261012-7f2): PRISTINE raw WKWebView arm ───────────────
//
// Run 11 (quick 261011-ws7) left ONE candidate standing: the Tauri-managed child webview itself.
// The cheapest test of candidate 1 (Tauri's injected init scripts) is the construction the
// shipped app already uses for Epic's LOGIN window -- `open_pristine_epic_login_window`
// (`src-tauri/src/main.rs`): a webview-less `tauri::WindowBuilder` window with a raw `WKWebView`
// attached by hand, so NO Tauri initialization script ever reaches the page. Ported here (minus
// its OAuth-capture delegate and Cmd+V plumbing, which are irrelevant to a storefront) with one
// deliberate difference: the store is `nonPersistentDataStore()`, fresh per window, so every arm
// is a COLD jar by construction -- the shipped window's `defaultDataStore()` on this machine holds
// the operator's signed-in Epic session, and a render there would be the warm-jar confound run 11
// was built to exclude. Same ephemeral shape as run 11's Safari Private Window.

/// `SPIKE_PRISTINE=1` enables PHASE P in the autorun.
fn autorun_pristine() -> bool {
    matches!(std::env::var("SPIKE_PRISTINE").as_deref(), Ok("1") | Ok("true"))
}

#[cfg(target_os = "macos")]
thread_local! {
    /// Main-thread-only slot for the live pristine arm: `Retained<WKWebView>` is not `Send`, and
    /// every touch (build, read, probe, close) happens inside an `on_main` closure anyway.
    /// Third field: whether PHASE P built the window itself (close it) or borrowed the MAIN
    /// window (`SPIKE_PRISTINE_INMAIN=1`, quick 261012-8gu -- remove the subview, keep the window).
    static PRISTINE: std::cell::RefCell<Option<(tauri::Window, objc2::rc::Retained<objc2_web_kit::WKWebView>, bool)>> =
        const { std::cell::RefCell::new(None) };
}

/// The 024 probe body, shared by the child-embed arm (`probe_embed`) and the pristine arm.
/// Exfiltrates by top-level navigation, never `fetch` (see `probe_embed`'s doc comment).
fn probe_script(tag: &str) -> String {
    format!(
        r#"(function(){{
  var out;
  try {{
    var names = ['isTauri','__TAURI__','__TAURI_INTERNALS__','ipc'];
    var present = names.filter(function(k){{ return k in window; }});
    var plug = Object.keys(window).filter(function(k){{
      return k.indexOf('__TAURI_PLUGIN_') === 0 || k.indexOf('__TAURI_IIFE__') === 0;
    }});
    var t = ((document.body && document.body.innerText) || '').replace(/\s+/g,' ').trim().slice(0,300);
    var res = [];
    try {{ res = performance.getEntriesByType('resource').slice(-6).map(function(e){{ return e.name.replace(/^https?:\/\//,'').slice(0,70); }}); }} catch (e) {{}}
    var nav = null;
    try {{ var n = performance.getEntriesByType('navigation')[0]; nav = n ? {{ status: n.responseStatus, type: n.type, redirects: n.redirectCount }} : null; }} catch (e) {{}}
    out = {{ href: location.href, title: document.title, globals: present,
             plugins: plug, textHead: t, bodyLen: (document.body ? document.body.innerHTML.length : 0),
             ready: document.readyState, docLen: document.documentElement.outerHTML.length,
             head: (document.head ? document.head.innerHTML : '').replace(/\s+/g,' ').slice(0,900),
             nav: nav, res: res }};
  }} catch (e) {{ out = {{ err: String(e) }}; }}
  location.href = 'http://localhost:17913/report?tag={tag}&ua=' + encodeURIComponent(navigator.userAgent) + '&probe=' + encodeURIComponent(JSON.stringify(out));
}})();"#
    )
}

/// MAIN THREAD ONLY. Builds the pristine window + raw WKWebView, loads `url`, parks both in
/// `PRISTINE`. Returns the window number for `screencapture -l`.
#[cfg(target_os = "macos")]
fn pristine_create(app: &AppHandle, label: &str, url: &str, user_agent: Option<&str>, in_main: bool) -> Result<serde_json::Value, String> {
    use objc2_foundation::{NSPoint, NSRect, NSSize, NSString, NSURLRequest, NSURL};
    use objc2_web_kit::{WKWebView, WKWebViewConfiguration, WKWebsiteDataStore};

    let mtm = objc2::MainThreadMarker::new().ok_or("pristine_create: not on main thread")?;
    // Quick 261012-8gu (runs 17+): `in_main` attaches the raw WKWebView as a subview of the MAIN
    // window's content view -- beside Tauri's own webview, at the child embed's exact rect -- so
    // the attachment variable is put back while the injection variable stays removed. The two
    // were confirmed as a pair by runs 12-16; this separates them, and it is also the embed shape
    // the product wants.
    let window = if in_main {
        app.get_window("main").ok_or("pristine_create: no main window")?
    } else {
        tauri::WindowBuilder::new(app, label)
            .inner_size(900.0, 700.0)
            .center()
            .focused(true)
            .theme(Some(tauri::Theme::Light))
            .title(format!("pristine · {label}"))
            .build()
            .map_err(|e| format!("pristine_create: window build failed: {e}"))?
    };
    let ns_view_ptr = window.ns_view().map_err(|e| format!("pristine_create: ns_view failed: {e}"))?;
    // SAFETY: the content view of a window we hold a live handle to, on the main thread.
    let ns_view: &objc2_app_kit::NSView = unsafe { &*(ns_view_ptr as *const objc2_app_kit::NSView) };
    let frame = if in_main {
        // The child embed's rect (`290,96 760x560` logical, top-left origin). AppKit content
        // views are bottom-left unless flipped; tao's view may be either, so ask.
        let bounds = ns_view.bounds();
        let (x, y, w, h) = (290.0, 96.0, 760.0, 560.0);
        let origin_y = if ns_view.isFlipped() { y } else { bounds.size.height - y - h };
        NSRect::new(NSPoint::new(x, origin_y), NSSize::new(w, h))
    } else {
        ns_view.frame()
    };

    let config = unsafe { WKWebViewConfiguration::new(mtm) };
    let store = unsafe { WKWebsiteDataStore::nonPersistentDataStore(mtm) };
    unsafe { config.setWebsiteDataStore(&store) };
    let webview = unsafe { WKWebView::initWithFrame_configuration(mtm.alloc(), frame, &config) };
    if !in_main {
        webview.setAutoresizingMask(
            objc2_app_kit::NSAutoresizingMaskOptions::ViewWidthSizable
                | objc2_app_kit::NSAutoresizingMaskOptions::ViewHeightSizable,
        );
    }
    if let Some(ua) = user_agent {
        unsafe { webview.setCustomUserAgent(Some(&NSString::from_str(ua))) };
    }
    ns_view.addSubview(&webview);

    let nsurl = NSURL::URLWithString(&NSString::from_str(url)).ok_or("pristine_create: bad url")?;
    let request = NSURLRequest::requestWithURL(&nsurl);
    unsafe { webview.loadRequest(&request) };

    let number = ns_window_number(&window);
    let frame_json = serde_json::json!({ "x": frame.origin.x, "y": frame.origin.y, "w": frame.size.width, "h": frame.size.height, "flipped": ns_view.isFlipped() });
    PRISTINE.with(|slot| *slot.borrow_mut() = Some((window, webview, !in_main)));
    Ok(serde_json::json!({
        "label": label, "url": url, "uaOverride": user_agent, "isolatedStore": "nonPersistentDataStore",
        "tauriInjection": "none (raw WKWebView, no WebviewBuilder)", "windowNumber": number,
        "attachment": if in_main { "subview of the MAIN window's content view" } else { "own WindowBuilder window" },
        "frame": frame_json,
    }))
}

/// MAIN THREAD ONLY. What the Rust side can see without touching the page: `title` and `URL`.
#[cfg(target_os = "macos")]
fn pristine_read() -> serde_json::Value {
    PRISTINE.with(|slot| match &*slot.borrow() {
        Some((_, webview, _)) => {
            let title = unsafe { webview.title() }.map(|s| s.to_string());
            let url = unsafe { webview.URL() }
                .and_then(|u| u.absoluteString())
                .map(|s| s.to_string());
            let loading = unsafe { webview.isLoading() };
            serde_json::json!({ "title": title, "url": url, "isLoading": loading })
        }
        None => serde_json::json!({ "error": "no pristine webview" }),
    })
}

/// MAIN THREAD ONLY. Runs the 024 probe in the pristine page (navigation exfil to `/report`).
#[cfg(target_os = "macos")]
fn pristine_probe(tag: &str) -> serde_json::Value {
    use objc2_foundation::NSString;
    PRISTINE.with(|slot| match &*slot.borrow() {
        Some((_, webview, _)) => {
            let js = NSString::from_str(&probe_script(tag));
            unsafe { webview.evaluateJavaScript_completionHandler(&js, None) };
            serde_json::json!({ "ok": true })
        }
        None => serde_json::json!({ "error": "no pristine webview" }),
    })
}

/// MAIN THREAD ONLY. Closes the pristine window and drops the webview (and its ephemeral store).
#[cfg(target_os = "macos")]
fn pristine_close() -> serde_json::Value {
    match PRISTINE.with(|slot| slot.borrow_mut().take()) {
        Some((window, webview, owns_window)) => {
            if !owns_window {
                // Borrowed MAIN window: detach the subview, leave the window alone.
                webview.removeFromSuperview();
                drop(webview);
                return serde_json::json!({ "closed": true, "detached": "removeFromSuperview" });
            }
            drop(webview);
            match window.close() {
                Ok(()) => serde_json::json!({ "closed": true }),
                Err(e) => serde_json::json!({ "error": e.to_string() }),
            }
        }
        None => serde_json::json!({ "error": "no pristine window" }),
    }
}

/// Worker-thread helper: photograph a window by number into the spike directory.
fn screenshot_window(number: Option<isize>, file_stem: &str) -> serde_json::Value {
    let Some(number) = number else {
        return serde_json::json!({ "error": "no window number" });
    };
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join(format!("{file_stem}.png"));
    let status = std::process::Command::new("screencapture")
        .args(["-l", &number.to_string(), "-x", "-o"])
        .arg(&path)
        .status();
    match status {
        Ok(st) if st.success() => serde_json::json!({ "path": path.display().to_string() }),
        Ok(st) => serde_json::json!({ "error": format!("screencapture exited {st}") }),
        Err(e) => serde_json::json!({ "error": e.to_string() }),
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
        // Quick 261011-w8j: `SPIKE_UA=<string>` substitutes an explicit UA for the Chrome
        // one so other identities (the login window's `EpicGamesLauncher`, a full Safari
        // string) can be measured through the same path. Unset keeps runs 1-5 behaviour.
        let ua = std::env::var("SPIKE_UA").ok().filter(|v| !v.trim().is_empty());
        builder = builder.user_agent(ua.as_deref().unwrap_or(CHROME_UA));
    }
    if isolated_store {
        builder = builder.data_store_identifier(*b"gamelibspike016\0");
    }

    state.log.log(
        "embed",
        "add_child",
        serde_json::json!({
            "url": url, "spoofUa": spoof_ua, "isolatedStore": isolated_store,
            "uaOverride": if spoof_ua { std::env::var("SPIKE_UA").ok() } else { None },
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

/// Spike 024 measurement channel. Reads the LIVE page state from inside the embed and
/// exfiltrates it by TOP-LEVEL NAVIGATION to the local control server -- deliberately not
/// `fetch`, because an https store page cannot issue an http subresource request (mixed
/// content is blocked by WebKit) and a silent block would look exactly like a blocked page.
/// This is the same navigation-exfil channel `report_response` already serves.
///
/// Runs AFTER the page has settled, so it cannot influence what Talon fingerprinted at load.
fn probe_embed(app: AppHandle, label: &str, tag: &str) -> Result<(), String> {
    let webview = app
        .get_webview(label)
        .ok_or_else(|| format!("no webview '{label}'"))?;
    let script = probe_script(tag);
    webview.eval(&script).map_err(|e| e.to_string())
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

/// `SPIKE_SPOOF_UA` -- unset or anything but `0`/`false` keeps the historical behaviour
/// (Chrome 131 UA, what runs 1-5 all sent). `0`/`false` leaves `WebviewBuilder::user_agent`
/// untouched so the embed presents WKWebView's default `Version/x Safari/x` string.
fn autorun_spoof_ua() -> bool {
    match std::env::var("SPIKE_SPOOF_UA") {
        Ok(v) => !matches!(v.trim(), "0" | "false" | "FALSE" | "no"),
        Err(_) => true,
    }
}

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

    // ── SPIKE 024 runs 12+ (quick 261012-7f2) ── PHASE P: the pristine arm. Runs BEFORE the
    // child-embed phases so the embed's known challenge stays in the same run as a same-session
    // NEGATIVE control, and the Steam control comes first so a dead network or broken harness
    // cannot be misread as a pass. Each arm is its own window on its own fresh ephemeral store.
    #[cfg(target_os = "macos")]
    if autorun_pristine() {
        let ua = std::env::var("SPIKE_PRISTINE_UA").ok().filter(|v| !v.trim().is_empty());
        let run = std::env::var("SPIKE_RUN").unwrap_or_else(|_| "x".into());
        let in_main = matches!(std::env::var("SPIKE_PRISTINE_INMAIN").as_deref(), Ok("1") | Ok("true"));
        let long_sample = matches!(std::env::var("SPIKE_PRISTINE_LONG").as_deref(), Ok("1") | Ok("true"));
        log.log(
            "autorun",
            "=== PHASE P (024 runs 12+): PRISTINE raw WKWebView, cold nonPersistent store, zero Tauri injection ===",
            serde_json::json!({ "uaOverride": ua, "run": run, "inMain": in_main, "longSample": long_sample }),
        );
        for (tag, url, note) in [
            ("steam", STEAM_STORE_URL, "POSITIVE CONTROL: known-good in the child embed (spike 016) and in Safari"),
            ("epic-configured", EPIC_STORE_CONFIGURED_URL, "SUBJECT (the URL that would actually ship, www.epicgames.com)"),
            ("epic-alt", EPIC_STORE_URL, "SUBJECT (store.epicgames.com -- the host run 1 measured)"),
        ] {
            let label = format!("pristine-{tag}");
            log.log("autorun", "--- PHASE P arm ---", serde_json::json!({ "arm": tag, "url": url, "note": note }));
            let (l, u, ua2) = (label.clone(), url.to_string(), ua.clone());
            let v = on_main(Box::new(move |app| match pristine_create(&app, &l, &u, ua2.as_deref(), in_main) {
                Ok(v) => v,
                Err(e) => serde_json::json!({ "error": e }),
            }));
            step(&format!("Pa[{tag}] pristine_create (WindowBuilder + raw WKWebView, nonPersistentDataStore)"), &v);
            if v.get("error").is_some() {
                continue;
            }
            let number = v.get("windowNumber").and_then(|n| n.as_i64()).map(|n| n as isize);

            // Same generous settle as the embed arm, then a second sample at ~40 s: run 11 read
            // the Safari title at 25 s and 45 s, and runs 2-3 were still on the interstitial at
            // 21 s -- two samples separate "slow" from "challenged".
            std::thread::sleep(Duration::from_secs(20));
            let v = on_main(Box::new(|_app| pristine_read()));
            step(&format!("Pb[{tag}] title/url at 20 s"), &v);
            let v = screenshot_window(number, &format!("shot-pristine-{tag}-run{run}-20s"));
            step(&format!("Pb[{tag}] screenshot at 20 s"), &v);

            std::thread::sleep(Duration::from_secs(20));
            let v = on_main(Box::new(|_app| pristine_read()));
            step(&format!("Pc[{tag}] title/url at 40 s"), &v);
            let v = screenshot_window(number, &format!("shot-pristine-{tag}-run{run}-40s"));
            step(&format!("Pc[{tag}] screenshot at 40 s"), &v);

            // Quick 261012-8gu: runs 12-16 left 4 of 10 Epic loads half-parsed at 40 s and never
            // looked again. A third sample at 120 s says whether a stall completes or is terminal.
            if long_sample && tag != "steam" {
                std::thread::sleep(Duration::from_secs(80));
                let v = on_main(Box::new(|_app| pristine_read()));
                step(&format!("Pc2[{tag}] title/url at 120 s"), &v);
                let v = screenshot_window(number, &format!("shot-pristine-{tag}-run{run}-120s"));
                step(&format!("Pc2[{tag}] screenshot at 120 s"), &v);
            }

            let t = format!("pristine-{tag}");
            let v = on_main(Box::new(move |_app| pristine_probe(&t)));
            step(&format!("Pd[{tag}] probe (evaluateJavaScript + navigation exfil)"), &v);
            std::thread::sleep(Duration::from_secs(5));

            let v = on_main(Box::new(|_app| pristine_close()));
            step(&format!("Pe[{tag}] close"), &v);
            std::thread::sleep(Duration::from_secs(1));
        }
    }

    log.log("autorun", "=== PHASE 1 (016 KILL-SHOT): add_child on the config-created main window ===", serde_json::json!({ "spoofUa": autorun_spoof_ua(), "spoofUaEnv": std::env::var("SPIKE_SPOOF_UA").ok() }));
    let v = on_main(Box::new(|app| {
        let state = app.state::<State>();
        // Quick 261011-w8j: the UA spoof was a CONSTANT across runs 1-5 (always `true`
        // here, always ticked in the panel) and the README never named it as a variable.
        // `SPIKE_SPOOF_UA=0` sends WKWebView's own UA instead so the two can be separated.
        let spoof_ua = autorun_spoof_ua();
        match create_embed(
            app.clone(), state,
            format!("{}/set", control_server::ORIGIN),
            spoof_ua, false,
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

        // ── SPIKE 024 ── Two arms through the SAME embed, same session, minutes apart.
        // Steam is the POSITIVE CONTROL: spike 016 proved it renders here, so if Steam also
        // fails this run the harness is broken and the Epic result means nothing.
        for (tag, url, note) in [
            (
                "epic-configured",
                EPIC_STORE_CONFIGURED_URL,
                "SUBJECT (the URL that would actually ship, www.epicgames.com)",
            ),
            (
                "epic-alt",
                EPIC_STORE_URL,
                "SUBJECT (store.epicgames.com -- the host run 1 measured)",
            ),
            ("steam", STEAM_STORE_URL, "POSITIVE CONTROL: known-good from spike 016"),
        ] {
            log.log(
                "autorun",
                "=== PHASE 3 (024): a REAL store page in the embed ===",
                serde_json::json!({ "arm": tag, "url": url, "note": note }),
            );
            let u = url.to_string();
            let v = on_main(Box::new(move |app| {
                let state = app.state::<State>();
                match navigate_embed(app.clone(), state, EMBED_LABEL.into(), u.clone()) {
                    Ok(()) => serde_json::json!({ "ok": true }),
                    Err(e) => serde_json::json!({ "error": e }),
                }
            }));
            step(&format!("3a[{tag}] navigate embed"), &v);

            // Generous settle: Talon challenges are async and can replace the document late.
            std::thread::sleep(Duration::from_secs(15));

            // What the Rust side can see without touching the page at all.
            let v = on_main(Box::new(|app| match app.get_webview(EMBED_LABEL) {
                Some(w) => serde_json::json!({
                    "url": w.url().map(|u| u.to_string()).unwrap_or_else(|e| format!("<err {e}>")),
                }),
                None => serde_json::json!({ "error": "embed missing" }),
            }));
            step(&format!("3b[{tag}] embed url after settle"), &v);

            // Photograph BEFORE probing -- the probe navigates the embed away.
            log.log(
                "autorun",
                "SCREENSHOT WINDOW NOW (screencapture -l<windowNumber>)",
                serde_json::json!({ "arm": tag, "sleeping_secs": 6 }),
            );
            std::thread::sleep(Duration::from_secs(6));

            let t = tag.to_string();
            let v = on_main(Box::new(move |app| {
                match probe_embed(app.clone(), EMBED_LABEL, &t) {
                    Ok(()) => serde_json::json!({ "ok": true }),
                    Err(e) => serde_json::json!({ "error": e }),
                }
            }));
            step(&format!("3c[{tag}] probe (eval + navigation exfil)"), &v);
            std::thread::sleep(Duration::from_secs(5));
        }

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
