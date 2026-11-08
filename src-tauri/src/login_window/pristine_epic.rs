//! Pristine Epic/GOG login webview (macOS): raw WKWebView with its own navigation delegate and no Tauri injection (Phase 71 D-12). Each item keeps its own cfg. Child of `login_window`; sees its private items.

use super::*;

// ---- Pristine Epic login webview (bounded "pristine-webview attempt", checkpoint response,
// 2026-08-03T18:00:00 superseding cycle, F-34.5-G6-01) ----
//
// User-directed bounded attempt: build Epic's login window as a raw WKWebView with ZERO Tauri
// initialization-script injection, so Talon (Epic's anti-bot) sees a Safari-like `window`
// surface instead of the CONFIRMED root cause (`window.isTauri`, `__TAURI_INTERNALS__`,
// `window.ipc`, 8 `__TAURI_PLUGIN_*`/`__TAURI_IIFE__` keys, notification-plugin `Notification`
// override -- proven non-configurable AND non-writable via 3-arm fingerprint elimination,
// debug file Evidence 2026-08-02). SIDLogin stays untouched as the working, live-verified
// primary path -- this is Epic's ALTERNATIVE tile only.
//
// MECHANISM: `tauri::WebviewWindowBuilder` (used by every other arm below, including THIS SAME
// arm for non-Epic runners) ALWAYS injects Tauri's core.js -- there is no public builder flag to
// suppress it, and the project's OWN `unstable` multiwebview spike confirmed even a
// Tauri-MANAGED CHILD webview still gets `window.__TAURI__`
// (`.claude/skills/spike-findings-gamelib/references/tauri-embedded-store-browser.md`,
// "window.__TAURI__ is injected into the remote store origin"). The only way to get a
// genuinely pristine WKWebView under this app is to bypass Tauri's webview construction
// entirely: build a WEBVIEW-LESS `tauri::WindowBuilder` window (native chrome only --
// title/size/center/close-detection are all `Window`-level, not `Webview`-level, APIs, so they
// still work) and construct a raw `WKWebView` ourselves via `objc2-web-kit` (already a project
// dependency -- see `humble_login_clear_cookies`'s own `with_webview()` +
// `objc2_web_kit::WKWebView` cast above for the established precedent of direct native WebKit
// access in this file), attached as the window's content view's only subview, with our OWN
// `WKNavigationDelegate` (via `objc2::define_class!`, pattern copied from wry's own
// `WryNavigationDelegate` -- `wry-0.55.1/src/wkwebview/class/wry_navigation_delegate.rs`, the
// exact same crate/version already vendored here) instead of Tauri's.
//
// CAPTURE MECHANISM SIMPLIFICATION: the Tauri-managed webview's only Rust-visible navigation
// signal was `on_page_load`, which never fires for the silently-refused localhost redirect --
// this investigation's own POST-AUTH root cause. This delegate uses
// `decidePolicyForNavigationAction`, which WebKit calls for EVERY
// navigation ATTEMPT, including ones it will go on to silently refuse -- so Epic's real
// `http://localhost:PORT/?code=...` redirect attempt is directly, natively observable, no
// in-page JS relay needed at all. Confirmed against `matchOAuthRedirect`
// (`backend/sidecar/oauthLoginCapture.ts`, `legendary` case): it requires ONLY
// `hostname === 'localhost'` + a non-empty `code` param, so pushing the FULL captured url as a
// `'finished'` `LoginWindowNavEvent` (the exact shape `push_login_window_event`/
// `login_event_value` already produce for every other runner's `on_page_load` hook) needs ZERO
// changes to `matchOAuthRedirect`, `oauthLoginCapture.ts`, `useTauriOAuthLogin.ts`, or
// `LoginWindowSeam` -- this delegate is a drop-in alternate PRODUCER for the same event queue,
// never a new consumer contract.
//
// SCOPE: Epic-only (`is_epic_login`, computed by the caller), macOS-only (`#[cfg(target_os =
// "macos")]`) -- GOG/Amazon/Humble and Epic-on-non-macOS keep the existing
// `WebviewWindowBuilder` path in this same arm, completely untouched.
//
// KNOWN, DELIBERATE SIMPLIFICATIONS for this bounded attempt (documented, not hidden):
//   - The navigation delegate is intentionally LEAKED (`std::mem::forget`) rather than tracked
//     in a label-keyed side table: `setNavigationDelegate` is a WEAK property (the vendored
//     `objc2-web-kit` binding's own doc comment), so an un-leaked delegate would be deallocated
//     the instant this function returns, silently breaking capture. A per-window delegate leak
//     is a small, bounded cost (one login window per attempt, closed by the user) -- acceptable
//     for a single bounded experiment, called out here rather than solved with a bigger
//     cross-thread-safe registry this cycle does not need.
//   - No `on_document_title_changed` equivalent -- the title is set once, from the opened
//     origin, and never updated. Cosmetic only, not needed to prove or disprove the 403
//     hypothesis.
//   - RESOLVED 2026-08-03 (live testing found the login hangs after the password step): the
//     delegate below now implements `WKUIDelegate` too, so JS `alert`/`confirm`/`prompt` present
//     real native `NSAlert` panels instead of silently hanging, and `window.open`/`target=_blank`
//     navigations (`targetFrame() == nil`, otherwise silently dropped by WebKit with no
//     UIDelegate) load into this SAME webview via `createWebViewWithConfiguration:` rather than
//     opening a second window -- `decidePolicyForNavigationAction` below does the identical
//     redirect as a belt-and-braces second layer.
#[cfg(target_os = "macos")]
use objc2::rc::Retained;
#[cfg(target_os = "macos")]
use objc2::runtime::{AnyObject, Bool, NSObject, ProtocolObject};
#[cfg(target_os = "macos")]
use objc2::{define_class, msg_send, DeclaredClass, MainThreadOnly};
#[cfg(target_os = "macos")]
use objc2_foundation::{NSObjectProtocol, NSPoint, NSRect, NSSize, NSString, NSURLRequest, NSURL};
#[cfg(target_os = "macos")]
use objc2_web_kit::{
    WKFrameInfo, WKNavigation, WKNavigationAction, WKNavigationActionPolicy, WKNavigationDelegate,
    WKUIDelegate, WKWebView, WKWebViewConfiguration, WKWindowFeatures,
};

#[cfg(target_os = "macos")]
struct EpicPristineNavDelegateIvars {
    event_label: String,
}

#[cfg(target_os = "macos")]
define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = EpicPristineNavDelegateIvars]
    struct EpicPristineNavDelegate;

    unsafe impl NSObjectProtocol for EpicPristineNavDelegate {}

    unsafe impl WKNavigationDelegate for EpicPristineNavDelegate {
        #[unsafe(method(webView:decidePolicyForNavigationAction:decisionHandler:))]
        fn navigation_policy(
            &self,
            webview: &WKWebView,
            action: &WKNavigationAction,
            handler: &block2::Block<dyn Fn(WKNavigationActionPolicy)>,
        ) {
            // Mirrors this file's OTHER `on_navigation` cancellation arms
            // (`humble_reveal_post`): never `eprintln!`s the captured url
            // (T-34.4.1-21/T-28-04) -- it is a live OAuth authorization code.
            let url_string = unsafe {
                action
                    .request()
                    .URL()
                    .and_then(|u| u.absoluteString())
                    .map(|s| s.to_string())
                    .unwrap_or_default()
            };
            let is_redirect_attempt = tauri::Url::parse(&url_string)
                .map(|parsed| parsed.host_str() == Some("localhost"))
                .unwrap_or(false);
            if is_redirect_attempt {
                push_login_window_event(
                    self.ivars().event_label.as_str(),
                    login_event_value("finished", &url_string),
                );
                (*handler).call((WKNavigationActionPolicy::Cancel,));
                return;
            }
            // New-window navigations (`targetFrame` nil: `window.open`/`target=_blank`) are NOT
            // redirected here. `WKUIDelegate::createWebViewWithConfiguration:` below is the
            // documented hook and handles them. A nil-`targetFrame` cancel-and-reload arm lived
            // here briefly (2026-08-03) and blanked the window: WebKit reports a nil `targetFrame`
            // for the FIRST main-frame load of a fresh `WKWebView` too -- the frame does not exist
            // yet -- so the initial `loadRequest` cancelled and re-issued itself forever and Epic's
            // page never rendered. Live-confirmed regression; do not reinstate.
            //
            // Observability parity with every OTHER runner's `on_page_load` hook, which pushes one
            // event per main-frame navigation. `oauthLoginCapture`'s poll loop logs the HOSTNAME
            // ONLY (T-34.5-G6-11) and de-duplicates consecutive same-host lines, so a live
            // authorization code can never reach the log through this path, and a non-matching
            // event is simply logged and dropped by `matchOAuthRedirect`. Without this the
            // pristine window was the ONLY login window in the app that logged no navigation at
            // all: the 2026-08-03T20:13 live timeout could not be diagnosed because nothing
            // recorded whether Epic ever attempted its post-password redirect. Main frame only --
            // this method also fires for every iframe (Epic's login embeds several), which would
            // swamp the log and defeat the de-duplication.
            let is_main_frame = unsafe {
                action
                    .targetFrame()
                    .map(|frame| frame.isMainFrame())
                    .unwrap_or(false)
            };
            if is_main_frame {
                push_login_window_event(
                    self.ivars().event_label.as_str(),
                    login_event_value("nav", &url_string),
                );
            }
            (*handler).call((WKNavigationActionPolicy::Allow,));
        }

        // quick-261029-osq: keeps the GOG sheet's native bar origin label current. Reads the
        // COMMITTED main-frame URL from the webview (a shell-side value, never page content or
        // the document title -- T-osq-01). WebKit calls this on the main thread, so the registry
        // is updated directly. A no-op for Epic, which has no bar registered.
        #[unsafe(method(webView:didCommitNavigation:))]
        fn did_commit_navigation(&self, webview: &WKWebView, _navigation: Option<&WKNavigation>) {
            let committed = unsafe {
                webview
                    .URL()
                    .and_then(|u| u.absoluteString())
                    .map(|s| s.to_string())
            };
            if let Some(parsed) = committed.and_then(|u| tauri::Url::parse(&u).ok()) {
                set_native_login_bar_origin_on_main(
                    self.ivars().event_label.as_str(),
                    &parsed.origin().ascii_serialization(),
                );
            }
        }
    }

    unsafe impl WKUIDelegate for EpicPristineNavDelegate {
        // `window.open`/`target=_blank` navigations otherwise silently refused by WebKit (see
        // `navigation_policy`'s own comment above) -- this is the DOCUMENTED hook
        // (`WKUIDelegate`'s own doc comment: "If you do not implement this method, the web view
        // will cancel the navigation"). Never creates a second window: loads the popup's request
        // into the SAME webview that asked for it and returns `None` so WebKit never allocates a
        // second `WKWebView`.
        #[unsafe(method_id(webView:createWebViewWithConfiguration:forNavigationAction:windowFeatures:))]
        fn create_web_view_for_navigation_action(
            &self,
            webview: &WKWebView,
            _configuration: &WKWebViewConfiguration,
            action: &WKNavigationAction,
            _window_features: &WKWindowFeatures,
        ) -> Option<Retained<WKWebView>> {
            unsafe {
                webview.loadRequest(&action.request());
            }
            None
        }

        // Without a `WKUIDelegate`, JS `alert()` is a silent no-op (the module doc comment's now-
        // resolved "KNOWN, DELIBERATE SIMPLIFICATION" above) -- live testing found this is why
        // Epic's login hangs after the password step. Presents a real modal `NSAlert` and always
        // calls the completion handler exactly once, on every path.
        #[unsafe(method(webView:runJavaScriptAlertPanelWithMessage:initiatedByFrame:completionHandler:))]
        fn run_js_alert(
            &self,
            _webview: &WKWebView,
            message: &NSString,
            _frame: &WKFrameInfo,
            completion_handler: &block2::Block<dyn Fn()>,
        ) {
            if let Some(mtm) = objc2::MainThreadMarker::new() {
                present_native_js_alert(mtm, &message.to_string());
            }
            (*completion_handler).call(());
        }

        /// Same rationale as `run_js_alert` above, for JS `confirm()`. Always calls the
        /// completion handler exactly once.
        #[unsafe(method(webView:runJavaScriptConfirmPanelWithMessage:initiatedByFrame:completionHandler:))]
        fn run_js_confirm(
            &self,
            _webview: &WKWebView,
            message: &NSString,
            _frame: &WKFrameInfo,
            completion_handler: &block2::Block<dyn Fn(Bool)>,
        ) {
            let confirmed = objc2::MainThreadMarker::new()
                .map(|mtm| present_native_js_confirm(mtm, &message.to_string()))
                .unwrap_or(false);
            (*completion_handler).call((Bool::from(confirmed),));
        }

        /// Same rationale as `run_js_alert` above, for JS `prompt()`. Always calls the completion
        /// handler exactly once: a live `NSTextField` accessory view collects the entered text on
        /// OK, `nil` on Cancel or if no main-thread marker is available (never dropped either
        /// way).
        #[unsafe(method(webView:runJavaScriptTextInputPanelWithPrompt:defaultText:initiatedByFrame:completionHandler:))]
        fn run_js_prompt(
            &self,
            _webview: &WKWebView,
            prompt: &NSString,
            default_text: Option<&NSString>,
            _frame: &WKFrameInfo,
            completion_handler: &block2::Block<dyn Fn(*mut NSString)>,
        ) {
            let default_text_owned = default_text.map(|s| s.to_string()).unwrap_or_default();
            let entered = objc2::MainThreadMarker::new().and_then(|mtm| {
                present_native_js_prompt(mtm, &prompt.to_string(), &default_text_owned)
            });
            match entered {
                Some(text) => {
                    let ns_text = NSString::from_str(&text);
                    (*completion_handler).call((Retained::as_ptr(&ns_text) as *mut NSString,));
                }
                None => (*completion_handler).call((std::ptr::null_mut(),)),
            }
        }
    }
);

#[cfg(target_os = "macos")]
impl EpicPristineNavDelegate {
    fn new(event_label: String, mtm: objc2::MainThreadMarker) -> Retained<Self> {
        let delegate = mtm
            .alloc::<EpicPristineNavDelegate>()
            .set_ivars(EpicPristineNavDelegateIvars { event_label });
        unsafe { msg_send![super(delegate), init] }
    }
}

/// Presents a native, modal `NSAlert` for JS `alert()` (single OK button). Runs synchronously
/// (`runModal`) -- WebKit always invokes `WKUIDelegate` methods on the main thread, so this never
/// competes with the `run_on_main_thread` dispatch `open_pristine_epic_login_window` uses for
/// setup, only with itself (and only one modal alert can be on-screen at a time regardless).
#[cfg(target_os = "macos")]
fn present_native_js_alert(mtm: objc2::MainThreadMarker, message: &str) {
    let alert = objc2_app_kit::NSAlert::new(mtm);
    alert.setMessageText(&NSString::from_str(message));
    alert.addButtonWithTitle(&NSString::from_str("OK"));
    alert.runModal();
}

/// Presents a native, modal `NSAlert` for JS `confirm()` (OK/Cancel). Returns `true` only when
/// the user picked the first ("OK") button.
#[cfg(target_os = "macos")]
fn present_native_js_confirm(mtm: objc2::MainThreadMarker, message: &str) -> bool {
    let alert = objc2_app_kit::NSAlert::new(mtm);
    alert.setMessageText(&NSString::from_str(message));
    alert.addButtonWithTitle(&NSString::from_str("OK"));
    alert.addButtonWithTitle(&NSString::from_str("Cancel"));
    alert.runModal() == objc2_app_kit::NSAlertFirstButtonReturn
}

/// Presents a native, modal `NSAlert` for JS `prompt()` (OK/Cancel plus a single-line
/// `NSTextField` accessory view seeded with `default_text`). Returns the entered text on OK,
/// `None` on Cancel -- matching `WKUIDelegate`'s own documented completion-handler contract
/// ("Pass the entered text if the user chose OK, otherwise nil").
#[cfg(target_os = "macos")]
fn present_native_js_prompt(
    mtm: objc2::MainThreadMarker,
    prompt: &str,
    default_text: &str,
) -> Option<String> {
    let alert = objc2_app_kit::NSAlert::new(mtm);
    alert.setMessageText(&NSString::from_str(prompt));
    alert.addButtonWithTitle(&NSString::from_str("OK"));
    alert.addButtonWithTitle(&NSString::from_str("Cancel"));

    let field_frame = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(300.0, 24.0));
    let text_field = objc2_app_kit::NSTextField::initWithFrame(mtm.alloc(), field_frame);
    text_field.setStringValue(&NSString::from_str(default_text));
    alert.setAccessoryView(Some(&text_field));

    if alert.runModal() == objc2_app_kit::NSAlertFirstButtonReturn {
        Some(text_field.stringValue().to_string())
    } else {
        None
    }
}

/// Builds Epic's login window as a genuinely pristine WKWebView (no Tauri injection at all --
/// see the module-level doc comment above this function for the full mechanism and rationale).
/// Runs on whatever thread `dispatch_rust_channel` itself runs on (a spawned worker thread, per
/// this arm's own established convention -- see `humble_login_clear_cookies`'s threading doc
/// comment above) and internally hops to the OS main thread via `AppHandle::run_on_main_thread`
/// for every objc2/AppKit/WebKit call, exactly the "worker blocks on a channel, main thread does
/// the real work" shape `humble_login_clear_cookies` already established for this same
/// main-thread-confinement problem.
#[cfg(target_os = "macos")]
pub(crate) fn open_pristine_epic_login_window(
    app: &AppHandle,
    label: &str,
    url: tauri::Url,
    visible: bool,
    user_agent: &str,
    as_sheet: bool,
) -> Result<Value, String> {
    let origin = url.origin().ascii_serialization();
    let event_label = label.to_string();

    // quick-261029-o1w: `as_sheet` builds the window ordered-out (not visible, not focused,
    // not centred) so `beginSheet:` is the call that reveals it. `as_sheet == false` is
    // Epic's free-floating path and is unchanged.
    let mut window_builder = tauri::WindowBuilder::new(app, label).visible(visible && !as_sheet);
    if visible {
        // The GOG sheet uses the 464x592 size every other login sheet uses (the
        // `humble_login_open` arm's own `.inner_size(464.0, 592.0)`); Epic stays 900x700.
        window_builder = if as_sheet {
            window_builder.inner_size(464.0, 592.0)
        } else {
            window_builder.inner_size(900.0, 700.0)
        };
        window_builder = window_builder
            .theme(Some(tauri::Theme::Light))
            .title(login_window_title(&origin, None));
        if !as_sheet {
            window_builder = window_builder.center().focused(true);
        }
    }
    let window = window_builder
        .build()
        .map_err(|e| format!("humble_login_open:pristine:build-failed:{e}"))?;

    // SAFETY (Send across the `run_on_main_thread`/`on_window_event` boundaries in this
    // function): a raw pointer value is not normally `Send`, but this is a bare address,
    // reconstructed into a live reference only from within a main-thread closure. Reused for two
    // addresses: the webview's content-view pointer just below, and (further down) the `NSEvent`
    // local monitor token the Cmd+V/C/X/A/Z fix installs.
    struct SendPtr(*mut std::ffi::c_void);
    unsafe impl Send for SendPtr {}

    // Cmd+V (and Cmd+C/X/A/Z) key-equivalent fix: holds the `NSEvent` local monitor token once
    // it's installed (further below, after the webview exists) so the close hook just below can
    // remove it via `NSEvent::removeMonitor`. Unlike `EpicPristineNavDelegate` -- which this
    // section's own doc comment above deliberately `std::mem::forget`s for the app's whole
    // lifetime -- a leaked monitor would keep intercepting Cmd+V/C/X/A/Z key-down events
    // app-wide (scoped out by the key-window check below, but still running on every keystroke)
    // for as long as the process lives, so it MUST be torn down on close instead.
    let monitor_slot: Arc<Mutex<Option<SendPtr>>> = Arc::new(Mutex::new(None));

    // Close-detection: IDENTICAL mechanism/semantics to the existing arm's own
    // `WindowEvent::Destroyed` hook (Quick task 260803-eee Task 5) -- same queue, same helper,
    // same "closed" event shape, so `oauthLoginCapture.ts`'s cancel-on-close branch needs no
    // changes for this window either.
    let close_event_label = event_label.clone();
    let monitor_slot_for_close = Arc::clone(&monitor_slot);
    let app_for_close = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            push_login_window_event(&close_event_label, login_event_value("closed", ""));
            // Tear down the Cmd+V/C/X/A/Z local event monitor, if the main-thread setup below
            // ever installed one -- see `monitor_slot`'s doc comment above.
            if let Ok(mut guard) = monitor_slot_for_close.lock() {
                if let Some(monitor_ptr) = guard.take() {
                    let _ = app_for_close.run_on_main_thread(move || {
                        // Forces Rust 2021 disjoint closure capture to move in the WHOLE
                        // `SendPtr` wrapper (same reason as the `ns_view_addr` rebinding above),
                        // not just its inner `*mut c_void` field, which would bypass the
                        // wrapper's `Send` impl entirely and fail to compile.
                        let monitor_ptr = monitor_ptr;
                        // SAFETY: `monitor_ptr` is the address
                        // `addLocalMonitorForEventsMatchingMask:handler:` returned below;
                        // `removeMonitor:` is the documented way to release it, and this is the
                        // only call site that ever does so for this token.
                        let monitor: &AnyObject = unsafe { &*(monitor_ptr.0 as *const AnyObject) };
                        unsafe {
                            objc2_app_kit::NSEvent::removeMonitor(monitor);
                        }
                    });
                }
            }
        }
    });

    let ns_view_ptr = window
        .ns_view()
        .map_err(|e| format!("humble_login_open:pristine:ns_view-failed:{e}"))?;
    // SAFETY: see `SendPtr`'s doc comment above -- reconstructed into a live reference only
    // INSIDE the main-thread closure below, which is guaranteed to run before `window` (still
    // alive on THIS function's own stack via the blocking `rx.recv_timeout` below) could
    // possibly be dropped.
    let ns_view_addr = SendPtr(ns_view_ptr);
    let url_string = url.to_string();
    let user_agent_owned = user_agent.to_string();
    let main_thread_label = event_label.clone();
    let monitor_slot_for_main = Arc::clone(&monitor_slot);
    let app_for_native_cancel = app.clone();
    let origin_for_bar = origin.clone();

    let (tx, rx) = mpsc_channel::<Result<(), String>>();
    if let Err(e) = app.run_on_main_thread(move || {
        // Forces Rust 2021 disjoint closure capture to move in the WHOLE `SendPtr` wrapper
        // (which has an explicit `unsafe impl Send`), not just its inner `*mut c_void` field --
        // without this rebinding, precise capture analysis captures `ns_view_addr.0` directly
        // (since that's the only path ever referenced below), bypassing the wrapper's `Send`
        // impl entirely and failing to compile.
        let ns_view_addr = ns_view_addr;
        let result: Result<(), String> = (|| {
            let mtm = objc2::MainThreadMarker::new()
                .ok_or_else(|| "humble_login_open:pristine:no-main-thread-marker".to_string())?;
            // SAFETY: `ns_view_addr` was obtained from this SAME window's `ns_view()` just
            // before dispatch, on the same call this closure is part of -- the window (and
            // therefore its content view) is still alive, since the caller is blocked on
            // `rx.recv_timeout` below and cannot have dropped it yet.
            let ns_view: &objc2_app_kit::NSView =
                unsafe { &*(ns_view_addr.0 as *const objc2_app_kit::NSView) };
            let frame = ns_view.frame();

            let config = unsafe { WKWebViewConfiguration::new(mtm) };
            let webview: Retained<WKWebView> = unsafe {
                WKWebView::initWithFrame_configuration(mtm.alloc(), frame, &config)
            };
            webview.setAutoresizingMask(
                objc2_app_kit::NSAutoresizingMaskOptions::ViewWidthSizable
                    | objc2_app_kit::NSAutoresizingMaskOptions::ViewHeightSizable,
            );
            unsafe {
                webview.setCustomUserAgent(Some(&NSString::from_str(&user_agent_owned)));
            }
            // Dev-only Web Inspector, gated identically to this file's existing
            // `window.open_devtools()` gate for the main (Tauri-managed) webview above -- the key
            // diagnostic tool for the NEXT live run of this window. `setInspectable` is
            // WKWebView-macOS-13.3+; unavailable in release builds, matching the project's
            // existing debug-only devtools convention.
            #[cfg(debug_assertions)]
            unsafe {
                webview.setInspectable(true);
            }

            let delegate = EpicPristineNavDelegate::new(main_thread_label.clone(), mtm);
            unsafe {
                webview.setNavigationDelegate(Some(ProtocolObject::from_ref(&*delegate)));
            }
            // Intentional leak -- see this section's "KNOWN, DELIBERATE SIMPLIFICATIONS" doc
            // comment above.
            std::mem::forget(delegate);

            ns_view.addSubview(&webview);
            // quick-261029-osq: the sheet's native bar (shared with the injected sheets) insets
            // the webview below its 32pt band; Epic (`as_sheet == false`) gets none and its
            // webview keeps filling the window.
            if as_sheet {
                install_native_login_bar(
                    ns_view,
                    &webview,
                    &origin_for_bar,
                    app_for_native_cancel.clone(),
                    main_thread_label.clone(),
                    mtm,
                );
            }
            // Paste (Cmd+V) -- and every other Edit-menu key equivalent -- routes via
            // `[NSApp sendAction:to:from:]` to the KEY window's first responder; `addSubview`
            // alone does not promote the new subview into the responder chain. Without this, the
            // long password this window exists to let the user paste (rather than hand-type)
            // silently goes nowhere. `tauri-2.11.5/src/app.rs` (`Builder::build`,
            // `enable_macos_default_menu` defaults to `true`, `Menu::default`'s own "Edit" submenu
            // already includes `PredefinedMenuItem::paste`) confirms this app already gets a
            // standard macOS Edit menu for free -- `main()` never calls `.menu(...)` or
            // `.enable_macos_default_menu(false)`, so no new menu needs building here, only this
            // first-responder promotion.
            if let Some(ns_window) = ns_view.window() {
                if !ns_window.makeFirstResponder(Some(&webview)) {
                    shell_eprintln!(
                        "[shell] WARN: humble_login_open:pristine: makeFirstResponder declined for '{main_thread_label}' -- paste may not reach the login form"
                    );
                }

                // Key-equivalent delivery fix (live-confirmed 2026-08-03): choosing Edit > Paste
                // from the menu bar pastes into the login form correctly -- proving the webview
                // IS first responder and DOES handle `paste:` -- but pressing Cmd+V does nothing.
                // The gap is purely in *key-equivalent delivery*: tao's `NSWindow` subclass
                // consumes the raw Cmd+V `NSEvent` before AppKit's `performKeyEquivalent:`
                // main-menu traversal ever sees it (a known class of tao/wry issue). Rather than
                // patch tao, install a narrowly-scoped local event monitor that re-dispatches the
                // five standard Edit-menu actions through the EXACT SAME `sendAction:to:from:`
                // path the menu bar itself already uses successfully, and let every other event
                // -- including these same shortcuts in every OTHER window -- fall through
                // completely unchanged.
                let monitor_ns_window = ns_window.clone();
                let monitor_handler = block2::RcBlock::new(
                    move |event: std::ptr::NonNull<
                        objc2_app_kit::NSEvent,
                    >|
                          -> *mut objc2_app_kit::NSEvent {
                        // SAFETY: AppKit hands local monitor handlers a valid, live `NSEvent`
                        // for the duration of this call.
                        let event_ref = unsafe { event.as_ref() };
                        let flags = event_ref.modifierFlags();
                        // Command held, WITHOUT Control/Option, so this never steals any other
                        // chord (e.g. Cmd+Opt+I devtools).
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
                            if let Some(mtm) = objc2::MainThreadMarker::new() {
                                let ns_app = objc2_app_kit::NSApplication::sharedApplication(mtm);
                                // SAFETY: `mtm` proves this handler is running on the main
                                // thread, as AppKit guarantees for local monitor callbacks.
                                let is_this_window = ns_app.keyWindow().is_some_and(|key_window| {
                                    std::ptr::eq(&*key_window, &*monitor_ns_window)
                                });
                                if is_this_window {
                                    // SAFETY: `sel` is one of the five hardcoded, valid Cocoa
                                    // selectors above; nil target/sender lets AppKit walk the
                                    // normal responder chain, exactly like the Edit menu's own
                                    // items already do successfully.
                                    let _ = unsafe {
                                        ns_app.sendAction_to_from(sel, None, None)
                                    };
                                    // Consumed: every OTHER window (and every non-matching
                                    // event) falls through via the `event.as_ptr()` return below
                                    // instead.
                                    return std::ptr::null_mut();
                                }
                            }
                        }
                        event.as_ptr()
                    },
                );
                // SAFETY: `monitor_handler` is a valid block; AppKit copies it internally when
                // registering the monitor (the standard Cocoa block-parameter convention for
                // handlers a callee stores beyond the call), so it outliving this call is not
                // required.
                let monitor_token = unsafe {
                    objc2_app_kit::NSEvent::addLocalMonitorForEventsMatchingMask_handler(
                        objc2_app_kit::NSEventMask::KeyDown,
                        &monitor_handler,
                    )
                };
                match monitor_token {
                    Some(token) => {
                        // Transfers ownership of the +1 retain count
                        // `addLocalMonitorForEventsMatchingMask:handler:` returned into a bare
                        // address -- NOT a leak, unlike the navigation delegate's
                        // `std::mem::forget` above: `NSEvent::removeMonitor` in the close hook
                        // above is the release, called exactly once, when this window closes.
                        let ptr = Retained::into_raw(token) as *mut std::ffi::c_void;
                        if let Ok(mut guard) = monitor_slot_for_main.lock() {
                            *guard = Some(SendPtr(ptr));
                        }
                    }
                    None => {
                        shell_eprintln!(
                            "[shell] WARN: humble_login_open:pristine: addLocalMonitorForEventsMatchingMask failed for '{main_thread_label}' -- Cmd+V/C/X/A/Z may not reach the login form"
                        );
                    }
                }
            } else {
                shell_eprintln!(
                    "[shell] WARN: humble_login_open:pristine: no NSWindow for '{main_thread_label}' -- cannot promote webview to first responder"
                );
            }

            let nsurl = NSURL::URLWithString(&NSString::from_str(&url_string))
                .ok_or_else(|| "humble_login_open:pristine:bad-nsurl".to_string())?;
            let request = NSURLRequest::requestWithURL(&nsurl);
            unsafe {
                webview.loadRequest(&request);
            }
            Ok(())
        })();
        let _ = tx.send(result);
    }) {
        return Err(format!("humble_login_open:pristine:dispatch-failed:{e}"));
    }

    match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(Ok(())) => {
            shell_eprintln!(
                "[shell] humble_login_open: pristine WKWebView built for '{label}' (zero Tauri injection, F-34.5-G6-01 bounded attempt)"
            );
            Ok(Value::String(label.to_string()))
        }
        Ok(Err(e)) => Err(e),
        Err(_) => Err("humble_login_open:pristine:main-thread-timeout".to_string()),
    }
}
