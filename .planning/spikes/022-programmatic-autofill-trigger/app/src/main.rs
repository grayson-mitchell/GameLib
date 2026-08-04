// Spike 022 — can the macOS AutoFill → Passwords panel be triggered PROGRAMMATICALLY,
// so an in-field affordance (a key glyph in the password box) reproduces the browser
// experience spike 020 found is otherwise unreachable?
//
// Graded outcome ladder, decided by evidence:
//   L3  a direct call opens the Passwords panel            → ~full browser parity
//   L2  a synthesized event pops the real context menu at the field, AutoFill included
//                                                          → one extra click, still a huge win
//   L1  neither works                                      → fall back to 020's hint text
//
// Probe channels (all public API — no private selector is CALLED without first being
// discovered by runtime introspection, and anything private is reported as such):
//   A. objc runtime introspection — dump WKWebView's own selectors matching
//      autofill/password/credential, so we know what surface even exists.
//   B. `willOpenMenu:withEvent:` on a WKWebView SUBCLASS (the documented AppKit hook,
//      per iCab's write-up) — capture the exact NSMenu WebKit builds for a right-click
//      in a password field, dump every item (title, identifier, action, target, submenu).
//   C. `menuForEvent:` with a synthesized right-click — does the menu exist synchronously?
//   D. Post a synthesized rightMouseDown/Up into the window — does the REAL menu appear?
//   E. Re-invoke the AutoFill item captured in B (sendAction / performActionForItemAtIndex).
//
// Field coordinates come through `WKWebView.title` — that IS `document.title` (unlike
// spike 014b's dead end, which was the *NSWindow* title WebKit never feeds).

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, Manager};

const CHROME_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const STORE_ORIGIN: &str = "http://127.0.0.1:17940";

/// Live pristine WKWebView (our subclass) — set on creation.
static PRISTINE_WEBVIEW: AtomicUsize = AtomicUsize::new(0);

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

/// The subclass's menu hook has no `State` access — it logs through this.
static GLOBAL_LOG: Mutex<Option<Arc<Logger>>> = Mutex::new(None);
fn glog(category: &str, message: &str, data: serde_json::Value) {
    if let Ok(guard) = GLOBAL_LOG.lock() {
        if let Some(l) = guard.as_ref() {
            l.log(category, message, data);
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

// ─────────────────────────── macOS probe core ───────────────────────────

#[cfg(target_os = "macos")]
mod mac {
    use super::*;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyObject, Sel};
    use objc2::{define_class, msg_send, sel, DefinedClass, MainThreadOnly};
    use objc2_app_kit::{NSApplication, NSEvent, NSEventType, NSMenu, NSMenuItem, NSView, NSWindow};
    use objc2_foundation::{NSPoint, NSRect, NSSize, NSString, NSURL, NSURLRequest};
    use objc2_web_kit::{WKWebView, WKWebViewConfiguration};

    /// The AutoFill menu item captured by `willOpenMenu:` — (target ptr, action sel,
    /// owning menu ptr, index). Re-invoked by probe E.
    pub static CAPTURED: Mutex<Option<(usize, Sel, usize, isize, String)>> = Mutex::new(None);

    /// Last menu seen by `willOpenMenu:`, RETAINED so it can be re-dumped after the
    /// menu has actually been displayed. Discriminates "AutoFill is inserted later"
    /// from "synthesized events don't qualify for AutoFill".
    pub static LAST_MENU: Mutex<Option<usize>> = Mutex::new(None);

    /// Re-dump the retained menu — call AFTER a menu has been on screen.
    pub fn redump_last_menu() -> Result<serde_json::Value, String> {
        let ptr = LAST_MENU
            .lock()
            .map_err(|e| e.to_string())?
            .ok_or("no menu captured yet — right-click a password field first")?;
        let menu: &NSMenu = unsafe { &*(ptr as *const NSMenu) };
        let items = dump_menu(menu, 0);
        capture_autofill(menu);
        Ok(serde_json::json!({
            "itemCount": menu.numberOfItems(),
            "items": items,
        }))
    }

    #[derive(Default)]
    pub struct SpikeWebViewIvars;

    define_class!(
        // Subclassing WKWebView is the DOCUMENTED way to see the context menu
        // (`willOpenMenu:withEvent:` / `didCloseMenu:withEvent:` are NSView API).
        #[unsafe(super(WKWebView))]
        #[thread_kind = MainThreadOnly]
        #[ivars = SpikeWebViewIvars]
        pub struct SpikeWebView;

        impl SpikeWebView {
            #[unsafe(method(willOpenMenu:withEvent:))]
            fn will_open_menu(&self, menu: &NSMenu, event: &NSEvent) {
                let tree = dump_menu(menu, 0);
                let titles: Vec<String> = tree
                    .iter()
                    .filter_map(|i| i["title"].as_str().map(str::to_string))
                    .collect();
                glog(
                    "menu",
                    "willOpenMenu — WebKit built this context menu",
                    serde_json::json!({
                        "itemCount": menu.numberOfItems(),
                        "titles": titles,
                        "items": tree,
                    }),
                );
                capture_autofill(menu);
                // Retain so a later re-dump can see items the system inserts
                // AFTER this hook (the trust-vs-timing discriminator).
                let retained: Retained<NSMenu> = unsafe { Retained::retain(menu as *const NSMenu as *mut NSMenu) }
                    .expect("retain menu");
                if let Ok(mut g) = LAST_MENU.lock() {
                    *g = Some(Retained::as_ptr(&retained) as usize);
                }
                std::mem::forget(retained);
                unsafe { msg_send![super(self), willOpenMenu: menu, withEvent: event] }
            }

            #[unsafe(method(didCloseMenu:withEvent:))]
            fn did_close_menu(&self, menu: &NSMenu, event: Option<&NSEvent>) {
                glog("menu", "didCloseMenu", serde_json::json!({}));
                unsafe { msg_send![super(self), didCloseMenu: menu, withEvent: event] }
            }
        }
    );

    /// Recursively dump an NSMenu: title, identifier, action selector, target class,
    /// enabled state, submenu.
    pub fn dump_menu(menu: &NSMenu, depth: usize) -> Vec<serde_json::Value> {
        if depth > 3 {
            return vec![serde_json::json!("<max depth>")];
        }
        let mut out = Vec::new();
        for i in 0..menu.numberOfItems() {
            let Some(item) = (unsafe { menu.itemAtIndex(i) }) else { continue };
            let title = unsafe { item.title() }.to_string();
            let action: Option<Sel> = unsafe { item.action() };
            let target: Option<Retained<AnyObject>> = unsafe { item.target() };
            let identifier: Option<Retained<NSString>> = unsafe { msg_send![&*item, identifier] };
            let submenu = unsafe { item.submenu() };
            out.push(serde_json::json!({
                "index": i as i64,
                "title": title,
                "identifier": identifier.map(|s| s.to_string()),
                "action": action.map(|s| s.name().to_string_lossy().into_owned()),
                "targetClass": target.as_ref().map(|t| t.class().name().to_string_lossy().into_owned()),
                "enabled": unsafe { item.isEnabled() },
                "separator": unsafe { item.isSeparatorItem() },
                "submenu": submenu.map(|sm| serde_json::Value::Array(dump_menu(&sm, depth + 1))),
            }));
        }
        out
    }

    /// Find an AutoFill/Passwords item anywhere in the tree and remember how to fire it.
    fn capture_autofill(menu: &NSMenu) {
        fn walk(menu: &NSMenu, depth: usize) -> Option<(usize, Sel, usize, isize, String)> {
            if depth > 3 {
                return None;
            }
            for i in 0..menu.numberOfItems() {
                let item = (unsafe { menu.itemAtIndex(i) })?;
                let title = unsafe { item.title() }.to_string();
                let lower = title.to_lowercase();
                if lower.contains("autofill") || lower.contains("password") {
                    let action = unsafe { item.action() };
                    let target = unsafe { item.target() };
                    if let Some(action) = action {
                        return Some((
                            target
                                .map(|t| Retained::as_ptr(&t) as usize)
                                .unwrap_or(0),
                            action,
                            menu as *const NSMenu as usize,
                            i,
                            title,
                        ));
                    }
                    // An item with a submenu but no action (e.g. "AutoFill" → "Passwords…")
                    if let Some(sm) = unsafe { item.submenu() } {
                        if let Some(found) = walk(&sm, depth + 1) {
                            return Some(found);
                        }
                    }
                }
                if let Some(sm) = unsafe { item.submenu() } {
                    if let Some(found) = walk(&sm, depth + 1) {
                        return Some(found);
                    }
                }
            }
            None
        }
        match walk(menu, 0) {
            Some(found) => {
                glog(
                    "menu",
                    "AutoFill item CAPTURED",
                    serde_json::json!({
                        "title": found.4,
                        "action": found.1.name().to_string_lossy().into_owned(),
                        "hasTarget": found.0 != 0,
                        "menuIndex": found.3 as i64,
                    }),
                );
                if let Ok(mut g) = CAPTURED.lock() {
                    *g = Some(found);
                }
            }
            None => glog(
                "menu",
                "no AutoFill/Passwords item found in this menu",
                serde_json::json!({}),
            ),
        }
    }

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
        rx.recv_timeout(Duration::from_secs(15))
            .map_err(|e| format!("main-thread hop never returned: {e}"))
    }

    /// Probe A — what autofill-shaped surface does WKWebView actually expose?
    pub fn introspect() -> serde_json::Value {
        use objc2::runtime::AnyClass;
        let mut found: Vec<serde_json::Value> = Vec::new();
        for class_name in ["SpikeWebView", "WKWebView", "NSView", "NSResponder"] {
            let Some(cls) = AnyClass::get(&std::ffi::CString::new(class_name).unwrap()) else {
                continue;
            };
            let mut hits: Vec<String> = Vec::new();
            for m in cls.instance_methods().iter() {
                let name: String = m.name().name().to_string_lossy().into_owned();
                let l = name.to_lowercase();
                if l.contains("autofill")
                    || l.contains("password")
                    || l.contains("credential")
                    || l.contains("keychain")
                {
                    hits.push(name);
                }
            }
            hits.sort();
            found.push(serde_json::json!({
                "class": class_name,
                "matchCount": hits.len(),
                "selectors": hits,
            }));
        }
        serde_json::json!({ "classes": found })
    }

    pub fn pristine_webview() -> Result<&'static SpikeWebView, String> {
        let p = PRISTINE_WEBVIEW.load(Ordering::SeqCst);
        if p == 0 {
            return Err("no pristine webview — open it first".into());
        }
        Ok(unsafe { &*(p as *const SpikeWebView) })
    }

    /// Ask the page (via `document.title`, which IS `WKWebView.title`) where the
    /// password field is, and focus it. Returns the field centre in WINDOW coords.
    pub fn password_field_point(wv: &SpikeWebView) -> Result<NSPoint, String> {
        // Also report what `elementFromPoint` finds at the centre we're about to
        // click: without this, a mis-converted coordinate silently probes the WRONG
        // field and its menu is misread as evidence about password fields.
        let js = r#"(function(){
            var el = document.getElementById('password') ||
                     document.querySelector('input[type=password]');
            if (!el) { document.title = 'RECT:none'; return; }
            el.focus();
            var r = el.getBoundingClientRect();
            var cx = r.x + r.width/2, cy = r.y + r.height/2;
            var hit = document.elementFromPoint(cx, cy) || {};
            document.title = 'RECT:' + JSON.stringify({
              x:r.x, y:r.y, w:r.width, h:r.height,
              hitId: hit.id || null, hitTag: hit.tagName || null, hitType: hit.type || null
            });
        })();"#;
        unsafe {
            wv.evaluateJavaScript_completionHandler(&NSString::from_str(js), None);
        }
        // The eval is async; poll the title briefly.
        let deadline = Instant::now() + Duration::from_secs(3);
        let mut rect: Option<(f64, f64, f64, f64)> = None;
        while Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(80));
            let title = unsafe { wv.title() }.map(|s| s.to_string()).unwrap_or_default();
            if let Some(payload) = title.strip_prefix("RECT:") {
                if payload == "none" {
                    return Err("no password field on this page".into());
                }
                let v: serde_json::Value =
                    serde_json::from_str(payload).map_err(|e| e.to_string())?;
                rect = Some((
                    v["x"].as_f64().unwrap_or(0.0),
                    v["y"].as_f64().unwrap_or(0.0),
                    v["w"].as_f64().unwrap_or(0.0),
                    v["h"].as_f64().unwrap_or(0.0),
                ));
                glog(
                    "probe",
                    "elementFromPoint at the click centre",
                    serde_json::json!({
                        "hitId": v["hitId"], "hitTag": v["hitTag"], "hitType": v["hitType"],
                    }),
                );
                break;
            }
        }
        let (x, y, w, h) = rect.ok_or("password field rect never arrived via document.title")?;
        let view: &NSView = unsafe { &*(wv as *const SpikeWebView as *const NSView) };
        let bounds = view.bounds();
        // CSS px (top-left origin) → view coords (bottom-left origin) → window coords.
        let in_view = NSPoint::new(x + w / 2.0, bounds.size.height - (y + h / 2.0));
        let in_window = unsafe { view.convertPoint_toView(in_view, None) };
        glog(
            "probe",
            "password field located",
            serde_json::json!({
                "cssRect": { "x": x, "y": y, "w": w, "h": h },
                "viewPoint": { "x": in_view.x, "y": in_view.y },
                "windowPoint": { "x": in_window.x, "y": in_window.y },
            }),
        );
        Ok(in_window)
    }

    fn synth_event(
        ty: NSEventType,
        point: NSPoint,
        window: &NSWindow,
        click: isize,
    ) -> Option<Retained<NSEvent>> {
        unsafe {
            NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
                ty,
                point,
                objc2_app_kit::NSEventModifierFlags::empty(),
                0.0,
                window.windowNumber(),
                None,
                0,
                click,
                1.0,
            )
        }
    }

    /// Probe C — is a menu available synchronously via `menuForEvent:`?
    pub fn menu_for_event(wv: &SpikeWebView) -> Result<serde_json::Value, String> {
        let point = password_field_point(wv)?;
        let view: &NSView = unsafe { &*(wv as *const SpikeWebView as *const NSView) };
        let window = view.window().ok_or("webview has no window")?;
        let ev = synth_event(NSEventType::RightMouseDown, point, &window, 1)
            .ok_or("could not synthesize event")?;
        let menu: Option<Retained<NSMenu>> = unsafe { msg_send![view, menuForEvent: &*ev] };
        Ok(match menu {
            Some(m) => serde_json::json!({
                "menuReturned": true,
                "itemCount": m.numberOfItems(),
                "items": dump_menu(&m, 0),
            }),
            None => serde_json::json!({ "menuReturned": false }),
        })
    }

    /// Photograph the region around the login window — the popped menu is its OWN
    /// window, so a per-window `-l<id>` grab (016's convention) would MISS it; a
    /// region grab scoped to this window's screen rect catches the menu without
    /// sweeping in unrelated windows.
    pub fn screenshot_region_around(wv: &SpikeWebView, path: &str) -> Result<String, String> {
        let view: &NSView = unsafe { &*(wv as *const SpikeWebView as *const NSView) };
        let window = view.window().ok_or("no window")?;
        let f = window.frame();
        let screen_h = objc2_app_kit::NSScreen::mainScreen(unsafe { objc2::MainThreadMarker::new_unchecked() })
            .map(|s| s.frame().size.height)
            .unwrap_or(1080.0);
        // NSWindow frame is bottom-left origin; screencapture -R is top-left.
        // EXACTLY the window rect: the menu pops inside it, and a wider region
        // sweeps in the user's unrelated windows (016's convention: delete those
        // on sight — better not to capture them at all).
        let (x, y) = (f.origin.x, screen_h - (f.origin.y + f.size.height));
        let (w, h) = (f.size.width, f.size.height);
        let region = format!("{:.0},{:.0},{:.0},{:.0}", x.max(0.0), y.max(0.0), w, h);
        let out = std::process::Command::new("/usr/sbin/screencapture")
            .args(["-x", "-o", &format!("-R{region}"), path])
            .status()
            .map_err(|e| e.to_string())?;
        Ok(format!("region={region} status={out}"))
    }

    /// Probe D — post a real synthesized right-click; WebKit should build and show
    /// the genuine menu (and our `willOpenMenu:` hook should fire).
    pub fn synth_right_click(wv: &SpikeWebView, mtm: objc2::MainThreadMarker) -> Result<serde_json::Value, String> {
        let point = password_field_point(wv)?;
        let view: &NSView = unsafe { &*(wv as *const SpikeWebView as *const NSView) };
        let window = view.window().ok_or("webview has no window")?;
        window.makeKeyAndOrderFront(None);
        let down = synth_event(NSEventType::RightMouseDown, point, &window, 1)
            .ok_or("could not synthesize rightMouseDown")?;
        let up = synth_event(NSEventType::RightMouseUp, point, &window, 1)
            .ok_or("could not synthesize rightMouseUp")?;
        let app = NSApplication::sharedApplication(mtm);
        unsafe {
            app.postEvent_atStart(&down, false);
            app.postEvent_atStart(&up, false);
        }
        Ok(serde_json::json!({
            "posted": ["rightMouseDown", "rightMouseUp"],
            "windowPoint": { "x": point.x, "y": point.y },
            "note": "watch for a willOpenMenu log line and a visible menu",
        }))
    }

    /// Probe C2 — pop the `menuForEvent:` menu ourselves at the field.
    pub fn popup_menu_at_field(wv: &SpikeWebView) -> Result<serde_json::Value, String> {
        let point = password_field_point(wv)?;
        let view: &NSView = unsafe { &*(wv as *const SpikeWebView as *const NSView) };
        let window = view.window().ok_or("webview has no window")?;
        let ev = synth_event(NSEventType::RightMouseDown, point, &window, 1)
            .ok_or("could not synthesize event")?;
        let menu: Option<Retained<NSMenu>> = unsafe { msg_send![view, menuForEvent: &*ev] };
        let menu = menu.ok_or("menuForEvent: returned nil — nothing to pop up")?;
        unsafe { NSMenu::popUpContextMenu_withEvent_forView(&menu, &ev, view) };
        Ok(serde_json::json!({ "poppedUp": true, "itemCount": menu.numberOfItems() }))
    }

    /// Probe E — re-fire the AutoFill item captured earlier by `willOpenMenu:`.
    pub fn invoke_captured(mtm: objc2::MainThreadMarker, mode: &str) -> Result<serde_json::Value, String> {
        let captured = CAPTURED
            .lock()
            .map_err(|e| e.to_string())?
            .clone()
            .ok_or("nothing captured yet — right-click a password field once first")?;
        let (target_ptr, action, menu_ptr, index, title) = captured;
        match mode {
            "sendAction" => {
                let app = NSApplication::sharedApplication(mtm);
                let target: Option<&AnyObject> = if target_ptr != 0 {
                    Some(unsafe { &*(target_ptr as *const AnyObject) })
                } else {
                    None
                };
                let sent: bool = unsafe { app.sendAction_to_from(action, target, None) };
                Ok(serde_json::json!({
                    "mode": "NSApp.sendAction",
                    "item": title,
                    "action": action.name().to_string_lossy().into_owned(),
                    "sent": sent,
                }))
            }
            "performItem" => {
                // NOTE: the menu was built for a PAST hit test; this may be stale.
                let menu: &NSMenu = unsafe { &*(menu_ptr as *const NSMenu) };
                unsafe { menu.performActionForItemAtIndex(index) };
                Ok(serde_json::json!({
                    "mode": "NSMenu.performActionForItemAtIndex",
                    "item": title,
                    "index": index as i64,
                }))
            }
            other => Err(format!("unknown mode '{other}'")),
        }
    }

    /// Build the pristine window + our WKWebView subclass.
    pub fn open_pristine(app: &AppHandle, label: &str, url: &str) -> Result<(), String> {
        if let Some(existing) = app.get_window(label) {
            let _ = existing.close();
            std::thread::sleep(Duration::from_millis(250));
        }
        let window = tauri::WindowBuilder::new(app, label)
            .title(format!("pristine (subclassed) — {label}"))
            .inner_size(560.0, 720.0)
            .visible(true)
            .focused(true)
            .build()
            .map_err(|e| e.to_string())?;

        window.on_window_event(move |event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                PRISTINE_WEBVIEW.store(0, Ordering::SeqCst);
            }
        });

        struct SendPtr(*mut std::ffi::c_void);
        unsafe impl Send for SendPtr {}
        let ns_view_addr = SendPtr(window.ns_view().map_err(|e| e.to_string())?);
        let url_owned = url.to_string();

        on_main(app, move |mtm| -> Result<(), String> {
            let ns_view_addr = ns_view_addr;
            let ns_view: &NSView = unsafe { &*(ns_view_addr.0 as *const NSView) };
            let frame = ns_view.frame();
            let config = unsafe { WKWebViewConfiguration::new(mtm) };

            let this = mtm.alloc::<SpikeWebView>().set_ivars(SpikeWebViewIvars);
            let webview: Retained<SpikeWebView> = unsafe {
                msg_send![super(this), initWithFrame: frame, configuration: &*config]
            };
            let as_view: &NSView = unsafe { &*(&*webview as *const SpikeWebView as *const NSView) };
            as_view.setAutoresizingMask(
                objc2_app_kit::NSAutoresizingMaskOptions::ViewWidthSizable
                    | objc2_app_kit::NSAutoresizingMaskOptions::ViewHeightSizable,
            );
            unsafe {
                let wk: &WKWebView = &webview;
                wk.setCustomUserAgent(Some(&NSString::from_str(CHROME_UA)));
                #[cfg(debug_assertions)]
                wk.setInspectable(true);
            }
            ns_view.addSubview(as_view);
            if let Some(w) = ns_view.window() {
                let _ = w.makeFirstResponder(Some(as_view));
            }
            let ns_url = unsafe { NSURL::URLWithString(&NSString::from_str(&url_owned)) }
                .ok_or("bad url")?;
            let request = unsafe { NSURLRequest::requestWithURL(&ns_url) };
            unsafe {
                let wk: &WKWebView = &webview;
                wk.loadRequest(&request);
            }
            PRISTINE_WEBVIEW.store(Retained::as_ptr(&webview) as usize, Ordering::SeqCst);
            std::mem::forget(webview);
            let _ = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(0.0, 0.0));
            let _ = sel!(paste:);
            Ok(())
        })?
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
        "macos": cfg!(target_os = "macos"),
    });
    state.log.log("env", "environment", v.clone());
    v
}

#[tauri::command]
fn store_origin() -> String {
    STORE_ORIGIN.to_string()
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn open_pristine(app: AppHandle, state: tauri::State<'_, State>, url: String) -> Result<(), String> {
    let r = mac::open_pristine(&app, "login-pristine", &url);
    state.log.log(
        "window",
        "open pristine (subclassed WKWebView)",
        serde_json::json!({ "url": url, "result": format!("{r:?}") }),
    );
    r
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn probe_introspect(state: tauri::State<'_, State>) -> serde_json::Value {
    let v = mac::introspect();
    state
        .log
        .log("probe", "A · runtime introspection (autofill-shaped selectors)", v.clone());
    v
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn probe_menu_for_event(app: AppHandle, state: tauri::State<'_, State>) -> Result<serde_json::Value, String> {
    let r = mac::on_main(&app, |_mtm| {
        mac::pristine_webview().and_then(mac::menu_for_event)
    })??;
    state.log.log("probe", "C · menuForEvent: at the password field", r.clone());
    Ok(r)
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn probe_popup_menu(app: AppHandle, state: tauri::State<'_, State>) -> Result<serde_json::Value, String> {
    let r = mac::on_main(&app, |_mtm| {
        mac::pristine_webview().and_then(mac::popup_menu_at_field)
    })??;
    state.log.log("probe", "C2 · popUpContextMenu at the password field", r.clone());
    Ok(r)
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn probe_synth_right_click(app: AppHandle, state: tauri::State<'_, State>) -> Result<serde_json::Value, String> {
    let r = mac::on_main(&app, |mtm| {
        mac::pristine_webview().and_then(|wv| mac::synth_right_click(wv, mtm))
    })??;
    state.log.log("probe", "D · synthesized right-click posted", r.clone());
    Ok(r)
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn probe_invoke_captured(
    app: AppHandle,
    state: tauri::State<'_, State>,
    mode: String,
) -> Result<serde_json::Value, String> {
    let r = mac::on_main(&app, move |mtm| mac::invoke_captured(mtm, &mode))??;
    state.log.log("probe", "E · re-invoke captured AutoFill item", r.clone());
    Ok(r)
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn probe_redump_menu(app: AppHandle, state: tauri::State<'_, State>) -> Result<serde_json::Value, String> {
    let r = mac::on_main(&app, |_m| mac::redump_last_menu())??;
    state
        .log
        .log("probe", "B2 · RE-dump of the retained menu (post-display)", r.clone());
    Ok(r)
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

/// Scripted probe sequence, so the evidence is reproducible rather than
/// click-dependent (conventions, 013). Probe B needs a context menu to EXIST —
/// probe D's synthesized right-click is what should produce one, so B's verdict
/// falls out of whether `willOpenMenu` logged anything afterwards.
#[cfg(target_os = "macos")]
fn autorun(app: AppHandle, log: Arc<Logger>) {
    std::thread::sleep(Duration::from_millis(1500));
    let step = |m: &str| log.log("autorun", m, serde_json::json!({}));

    step("=== A: runtime introspection ===");
    log.log("probe", "A · autofill-shaped selectors", mac::introspect());

    step("=== opening pristine (subclassed) login window ===");
    let _ = mac::open_pristine(&app, "login-pristine", &format!("{STORE_ORIGIN}/login"));
    std::thread::sleep(Duration::from_secs(3));

    step("=== C: menuForEvent: at the password field ===");
    let c = mac::on_main(&app, |_m| mac::pristine_webview().and_then(mac::menu_for_event));
    log.log("probe", "C · menuForEvent:", serde_json::json!({ "result": format!("{c:?}") }));

    step("=== D: post a synthesized right-click (expect willOpenMenu to fire) ===");
    let d = mac::on_main(&app, |mtm| {
        mac::pristine_webview().and_then(|wv| mac::synth_right_click(wv, mtm))
    });
    log.log("probe", "D · synthesized right-click", serde_json::json!({ "result": format!("{d:?}") }));
    std::thread::sleep(Duration::from_secs(3));

    let captured = mac::CAPTURED.lock().ok().and_then(|g| g.clone()).is_some();
    log.log(
        "autorun",
        "=== B verdict: did WebKit build a menu we could capture? ===",
        serde_json::json!({ "autofillItemCaptured": captured }),
    );

    if captured {
        step("=== E: re-invoke the captured AutoFill item ===");
        for mode in ["sendAction", "performItem"] {
            let r = mac::on_main(&app, move |mtm| mac::invoke_captured(mtm, mode));
            log.log("probe", "E · re-invoke", serde_json::json!({ "mode": mode, "result": format!("{r:?}") }));
            std::thread::sleep(Duration::from_secs(2));
        }
    }

    step("=== D2: synthesized click again, then PHOTOGRAPH the displayed menu ===");
    let d2 = mac::on_main(&app, |mtm| {
        mac::pristine_webview().and_then(|wv| mac::synth_right_click(wv, mtm))
    });
    log.log("probe", "D2 · click posted", serde_json::json!({ "result": format!("{d2:?}") }));
    std::thread::sleep(Duration::from_millis(900));
    let shot = mac::on_main(&app, |_m| {
        mac::pristine_webview()
            .and_then(|wv| mac::screenshot_region_around(wv, "../menu-with-autofill.png"))
    });
    log.log(
        "probe",
        "D2 · screenshot of the on-screen menu",
        serde_json::json!({ "result": format!("{shot:?}") }),
    );
    std::thread::sleep(Duration::from_millis(500));

    step("=== C2: popUpContextMenu at the field ===");
    let c2 = mac::on_main(&app, |_m| mac::pristine_webview().and_then(mac::popup_menu_at_field));
    log.log("probe", "C2 · popUpContextMenu", serde_json::json!({ "result": format!("{c2:?}") }));

    log.log("autorun", "=== SCRIPTED PROBES COMPLETE — human confirms what is on screen ===", serde_json::json!({}));
    let _ = export_log(app.state::<State>());
}

fn main() {
    let spike_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf();
    let logger = Arc::new(Logger::new(&spike_dir.join("run.log")));
    if let Ok(mut g) = GLOBAL_LOG.lock() {
        *g = Some(logger.clone());
    }
    let state = State { log: logger.clone() };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            env_report,
            store_origin,
            open_pristine,
            probe_introspect,
            probe_menu_for_event,
            probe_popup_menu,
            probe_synth_right_click,
            probe_invoke_captured,
            probe_redump_menu,
            log_from_ui,
            export_log,
        ])
        .setup(move |app| {
            if let Ok(mut slot) = logger.app.lock() {
                *slot = Some(app.handle().clone());
            }
            logger.log("app", "started", serde_json::json!({}));
            #[cfg(target_os = "macos")]
            if std::env::var("SPIKE_AUTORUN").is_ok() {
                let handle = app.handle().clone();
                let log = logger.clone();
                std::thread::spawn(move || autorun(handle, log));
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running spike app");
}
