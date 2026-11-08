//! Epic embed WKNavigationDelegate/WKUIDelegate: `EpicEmbedNavDelegate`, failure/scheme/download/
//! termination/JS-dialog handlers (split from `macos_epic_embed.rs`, Phase 71 D-14).

use super::*;


/// Holds the `AppHandle` the delegate's `WKUIDelegate` popup hook (Phase 50 Plan 02, D-12) needs
/// to call `crate::open_external` -- `open()`'s own `app: &AppHandle` parameter is already in
/// scope at the one construction site (`EpicEmbedNavDelegate::new`, below), so this stores an
/// owned clone the SAME way `EpicPristineNavDelegateIvars { event_label: String }` (main.rs)
/// stores its own owned, non-`Copy` state via `set_ivars`.
pub(crate) struct EpicEmbedNavDelegateIvars {
    app: AppHandle,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = EpicEmbedNavDelegateIvars]
    pub(crate) struct EpicEmbedNavDelegate;

    unsafe impl NSObjectProtocol for EpicEmbedNavDelegate {}

    impl EpicEmbedNavDelegate {
        // Review finding 12: the KVO sink for `EPIC_EMBED_KVO_KEY_PATHS` (see
        // `add_nav_observers`). Queues through the SAME bounded ring (`enqueue_nav_event`,
        // oldest dropped at `EPIC_EMBED_NAV_EVENTS_CAP`) every delegate callback uses, and skips
        // a state identical to the newest one already queued -- one `pushState` notifies up to
        // three keys, and every ordinary navigation notifies them alongside the delegate
        // callbacks.
        #[unsafe(method(observeValueForKeyPath:ofObject:change:context:))]
        fn observe_value_for_key_path(
            &self,
            key_path: Option<&NSString>,
            object: Option<&AnyObject>,
            change: Option<&AnyObject>,
            context: *mut c_void,
        ) {
            if context != epic_embed_kvo_context() {
                // SAFETY: forwards an observation this class did not register to `NSObject`'s own
                // implementation, with the exact arguments received -- Apple's KVO contract.
                unsafe {
                    let _: () = msg_send![
                        super(self),
                        observeValueForKeyPath: key_path,
                        ofObject: object,
                        change: change,
                        context: context
                    ];
                }
                return;
            }
            let Some(webview) = object.and_then(|o| o.downcast_ref::<WKWebView>()) else {
                return;
            };
            let event = nav_state_json(webview);
            if let Ok(mut guard) = surface().lock() {
                let flagged = epic_nav_state_with_flags(event.clone(), guard.nav_flags());
                if epic_kvo_event_is_new(guard.pending_nav_events.last(), &flagged) {
                    guard.enqueue_nav_event(event);
                }
            } else {
                crate::shell_diag(
                    "WARN: macos_epic_embed surface registry poisoned -- continuing"
                );
            }
        }
    }

    unsafe impl WKNavigationDelegate for EpicEmbedNavDelegate {
        #[unsafe(method(webView:decidePolicyForNavigationAction:decisionHandler:))]
        fn navigation_policy(
            &self,
            webview: &WKWebView,
            action: &WKNavigationAction,
            handler: &block2::Block<dyn Fn(WKNavigationActionPolicy)>,
        ) {
            let url_string = unsafe {
                action
                    .request()
                    .URL()
                    .and_then(|u| u.absoluteString())
                    .map(|s| s.to_string())
                    .unwrap_or_default()
            };
            let top_level_host = surface()
                .lock()
                .ok()
                .and_then(|guard| guard.top_level_host.clone());
            let parsed_url = tauri::Url::parse(&url_string);
            // Calls the EXACT existing scheme-policy function `store_embed_navigation_policy`
            // (main.rs) uses for the Tauri-managed embed -- one navigation-policy decision
            // function for the whole app, not a second, competing implementation here.
            let decision = match &parsed_url {
                Ok(url) => crate::store_embed_navigation_policy(url, top_level_host.as_deref()),
                Err(_) => {
                    crate::shell_diag(
                        "macos_epic_embed: blocked an unparsable navigation URL"
                    );
                    crate::StoreEmbedNavigationDecision::Block
                }
            };
            let policy = match decision {
                crate::StoreEmbedNavigationDecision::Allow => WKNavigationActionPolicy::Allow,
                crate::StoreEmbedNavigationDecision::Block => {
                    // Phase 50 Plan 02 (D-14): a block whose URL's scheme is the Epic Games
                    // Launcher's own custom scheme bumps a monotonic counter instead of (or
                    // rather, in addition to) the ordinary blocked-navigation log line below --
                    // see `EpicEmbedSurface::blocked_launcher_scheme_count`'s own doc comment for
                    // why a counter. Every OTHER blocked scheme keeps the existing behaviour
                    // unchanged: no counter bump, no extra nav event, just this cancel.
                    let is_launcher_scheme = parsed_url
                        .as_ref()
                        .map(|u| u.scheme() == EPIC_GAMES_LAUNCHER_SCHEME)
                        .unwrap_or(false);
                    if is_launcher_scheme {
                        epic_embed_record_launcher_scheme_block(webview, "navigation");
                    }
                    WKNavigationActionPolicy::Cancel
                }
                // The Epic surface's top-level host is never a Valve host, so a `Handoff`
                // decision is unreachable in practice here -- logged and cancelled rather than
                // allowed, since there is no steam:// handoff path on this surface.
                crate::StoreEmbedNavigationDecision::Handoff => {
                    crate::shell_diag(
                        "macos_epic_embed: Handoff decision reached on the Epic surface \
                         -- its top-level host is never a Valve host; cancelling rather than \
                         allowing"
                    );
                    WKNavigationActionPolicy::Cancel
                }
            };
            (*handler).call((policy,));
        }

        // Quick task 261014-vot: the ONE writer of `has_committed` -- see that field's own doc
        // comment on why `reload()` needs this as its discriminator. Touches no other field;
        // `didFinishNavigation`/`didStartProvisionalNavigation` already own the rest of the
        // lifecycle.
        #[unsafe(method(webView:didCommitNavigation:))]
        fn did_commit_navigation(&self, _webview: &WKWebView, _navigation: Option<&WKNavigation>) {
            if let Ok(mut guard) = surface().lock() {
                guard.has_committed = true;
            } else {
                crate::shell_diag(
                    "WARN: macos_epic_embed surface registry poisoned -- continuing"
                );
            }
        }

        #[unsafe(method(webView:didFinishNavigation:))]
        fn did_finish_navigation(&self, webview: &WKWebView, _navigation: Option<&WKNavigation>) {
            let url_string = unsafe {
                webview
                    .URL()
                    .and_then(|u| u.absoluteString())
                    .map(|s| s.to_string())
                    .unwrap_or_default()
            };
            let host = tauri::Url::parse(&url_string)
                .ok()
                .and_then(|parsed| parsed.host_str().map(str::to_string));
            // Quick task 261014-vot: the todo's own `## Suggested instrument` -- until now this
            // hook spoke only on failure, so absence of log lines after a Reload click could not
            // distinguish "nothing happened" from "it worked silently". Host only (T-28-04).
            crate::shell_diag(&format!(
                "macos_epic_embed: didFinishNavigation succeeded -- host: {}",
                host.as_deref().unwrap_or("<unknown>")
            ));
            let event = nav_state_json(webview);
            if let Ok(mut guard) = surface().lock() {
                guard.top_level_host = host;
                // A genuine finish is NOT a timeout (Phase 50 Plan 02): clear both the
                // in-flight clock and any flag a slow-but-eventually-successful load raised.
                guard.nav_started_at = None;
                if epic_embed_clears_load_timeout(EpicEmbedNavLifecycle::NavigationFinished) {
                    guard.load_timed_out = false;
                }
                guard.enqueue_nav_event(event);
            } else {
                crate::shell_diag(
                    "WARN: macos_epic_embed surface registry poisoned -- continuing"
                );
            }
        }

        // Phase 50 Plan 02: the remaining three `WKNavigationDelegate` lifecycle hooks. All
        // four (this one plus `did_finish_navigation`, above, and the two failure hooks, below)
        // are main-frame-only by the delegate's own contract per RESEARCH.md's vendored-crate
        // confirmation -- no extra frame filtering is added, and none of the four carry a
        // frame-info parameter to filter on even if it were wanted.
        #[unsafe(method(webView:didStartProvisionalNavigation:))]
        fn did_start_provisional_navigation(
            &self,
            webview: &WKWebView,
            _navigation: Option<&WKNavigation>,
        ) {
            let event = nav_state_json(webview);
            if let Ok(mut guard) = surface().lock() {
                guard.nav_generation = guard.nav_generation.wrapping_add(1);
                guard.nav_started_at = Some(Instant::now());
                if epic_embed_clears_load_timeout(
                    EpicEmbedNavLifecycle::ProvisionalNavigationStarted
                ) {
                    guard.load_timed_out = false;
                }
                // D-11: every load starts fresh. Clearing the challenge also un-hides the
                // subview the challenge hid, when nothing else keeps it hidden -- a challenge the
                // page clears by navigating itself away no longer strands a hidden surface with
                // no Try again (review finding 7).
                let hidden = guard.visibility.set_challenged(false);
                guard.enqueue_nav_event(event);
                drop(guard);
                apply_visibility(webview, hidden);
            } else {
                crate::shell_diag(
                    "WARN: macos_epic_embed surface registry poisoned -- continuing"
                );
            }
        }

        #[unsafe(method(webView:didFailNavigation:withError:))]
        fn did_fail_navigation(
            &self,
            webview: &WKWebView,
            _navigation: Option<&WKNavigation>,
            error: &NSError,
        ) {
            epic_embed_handle_navigation_failure(webview, error, "didFailNavigation");
        }

        #[unsafe(method(webView:didFailProvisionalNavigation:withError:))]
        fn did_fail_provisional_navigation(
            &self,
            webview: &WKWebView,
            _navigation: Option<&WKNavigation>,
            error: &NSError,
        ) {
            epic_embed_handle_navigation_failure(webview, error, "didFailProvisionalNavigation");
        }

        // Phase 50 Plan 02 (D-09): the method chain below is the one RESEARCH.md's Pattern 4
        // verified against the vendored crate sources this phase pinned -- see
        // `epic_embed_response_is_challenged`'s own doc comment for the full detection rule and
        // why the header check is primary and the host/path check is a fallback only.
        #[unsafe(method(webView:decidePolicyForNavigationResponse:decisionHandler:))]
        fn decide_policy_for_navigation_response(
            &self,
            webview: &WKWebView,
            navigation_response: &WKNavigationResponse,
            handler: &block2::Block<dyn Fn(WKNavigationResponsePolicy)>,
        ) {
            // Phase 50 review (T-40-04-04 parity): a download -- any frame -- is the one response
            // this hook DOES cancel; `epic_embed_route_download` hands it to the system browser.
            if epic_embed_route_download(&self.ivars().app, navigation_response) {
                (*handler).call((WKNavigationResponsePolicy::Cancel,));
                return;
            }
            // A subframe response (e.g. Epic's own sign-in form's Turnstile widget) is never
            // evaluated at all -- RESEARCH Pitfall 2.
            if unsafe { navigation_response.isForMainFrame() } {
                let response = unsafe { navigation_response.response() };
                // Read the URL-derived host/path BEFORE downcasting -- `downcast()` below
                // consumes `response` (it hands back the original `Retained` only on the `Err`
                // arm, which the header read below discards via `.ok()`), so anything needed
                // from the un-downcast `NSURLResponse` has to be read first.
                let (host, path) = response
                    .URL()
                    .map(|nsurl| {
                        let url_string = nsurl
                            .absoluteString()
                            .map(|s| s.to_string())
                            .unwrap_or_default();
                        tauri::Url::parse(&url_string)
                            .map(|u| {
                                (
                                    u.host_str().unwrap_or_default().to_string(),
                                    u.path().to_string(),
                                )
                            })
                            .unwrap_or_default()
                    })
                    .unwrap_or_default();
                let header_value = response
                    .downcast::<NSHTTPURLResponse>()
                    .ok()
                    .and_then(|http_response| {
                        let key = NSString::from_str("cf-mitigated");
                        http_response.valueForHTTPHeaderField(&key)
                    })
                    .map(|v| v.to_string());
                if epic_embed_response_is_challenged(header_value.as_deref(), &host, &path) {
                    crate::shell_diag(
                        "macos_epic_embed: main-frame response flagged as challenged \
                         (D-09)"
                    );
                    // D-10: Rust owns the hide -- a visible subview would paint over the panel
                    // the renderer is about to show in the same slot. Applied as the derived
                    // visibility, so a later `show()` cannot undo it (review finding 5).
                    if let Ok(mut guard) = surface().lock() {
                        let hidden = guard.visibility.set_challenged(true);
                        let event = nav_state_json(webview);
                        guard.enqueue_nav_event(event);
                        drop(guard);
                        apply_visibility(webview, hidden);
                    } else {
                        crate::shell_diag(
                            "WARN: macos_epic_embed surface registry poisoned -- \
                             continuing"
                        );
                        apply_visibility(webview, true);
                    }
                }
            }
            // This hook OBSERVES; it never blocks. Cancelling here would leave the user a blank
            // rectangle instead of the `WebviewUnavailablePanel` the renderer shows once
            // `challenged` is `true` -- hiding the subview above is this module's job, not
            // WebKit's.
            (*handler).call((WKNavigationResponsePolicy::Allow,));
        }

        // Phase 50 review: without this hook a WebContent crash left a blank surface with no
        // event and no timeout. See `epic_embed_handle_content_process_termination`.
        #[unsafe(method(webViewWebContentProcessDidTerminate:))]
        fn web_content_process_did_terminate(&self, webview: &WKWebView) {
            epic_embed_handle_content_process_termination(webview);
        }
    }

    unsafe impl WKUIDelegate for EpicEmbedNavDelegate {
        // D-12: unlike `EpicPristineNavDelegate`'s own version of this hook (main.rs), which
        // loads the popup's request IN PLACE because the login-seam rule keeps an OAuth popup
        // inside the login window -- that rule does not apply to ordinary store browsing. Hands
        // the request off to the system browser instead, through the SAME throttle the
        // Tauri-managed embed's own `window.open` hook (`store_embed_open`'s `on_new_window`,
        // main.rs) shares, so neither surface can double-admit against the other (T-50-05). Never
        // creates a second window: always returns `None`.
        #[unsafe(method_id(webView:createWebViewWithConfiguration:forNavigationAction:windowFeatures:))]
        fn create_web_view_for_navigation_action(
            &self,
            webview: &WKWebView,
            _configuration: &WKWebViewConfiguration,
            action: &WKNavigationAction,
            _window_features: &WKWindowFeatures,
        ) -> Option<Retained<WKWebView>> {
            let url_string = unsafe {
                action
                    .request()
                    .URL()
                    .and_then(|u| u.absoluteString())
                    .map(|s| s.to_string())
                    .unwrap_or_default()
            };
            // No early `return` here (Rule 3): `define_class!`'s `method_id` expansion converts
            // only the function body's TAIL expression to `RetainedReturnValue` -- an explicit
            // `return None;` bypasses that conversion and fails to type-check. Both outcomes
            // below therefore fall through to the single trailing `None`.
            //
            // Phase 50 review: the scheme policy is decided FIRST and the throttle is consulted
            // only for a popup that would actually be handed off -- `open_external`'s own
            // allowlist includes `steam`, so handing it everything let any frame
            // `window.open('steam://...')` past `store_embed_navigation_policy`'s Valve gate.
            // See `store_embed_browser_handoff_policy` for the full rule.
            use crate::store_embed_handoff_policy::{
                store_embed_browser_handoff_policy, StoreEmbedBrowserHandoffDecision as Popup,
            };
            match store_embed_browser_handoff_policy(&url_string) {
                // `OpenInAppPopup` is the Tauri-managed embed's exception (Amazon's Epic-link
                // popup, todo 2026-11-02). This raw Epic view keeps its current behaviour: that
                // URL is handed to the system browser like any other http(s) popup (D-12).
                Popup::HandToSystemBrowser | Popup::OpenInAppPopup => {
                    if crate::store_embed_handoff_admitted(&crate::STORE_EMBED_POPUP_THROTTLE) {
                        crate::shell_diag(
                            "macos_epic_embed: denied window.open request, routing to \
                             the system browser (D-12)"
                        );
                        if let Err(e) = crate::open_external(url_string, self.ivars().app.clone()) {
                            crate::shell_diag(&format!(
                                "macos_epic_embed: popup hand-off to open_external \
                                 failed: {e}"
                            ));
                        }
                    } else {
                        crate::shell_diag(
                            "macos_epic_embed: denied window.open request, rate-limited \
                             -- not routed to the system browser"
                        );
                    }
                }
                // D-14: a popup to the launcher scheme is the same user-visible attempt as a
                // navigation to it, so it gets the same counter bump (and so the same toast).
                Popup::RejectLauncherScheme => {
                    epic_embed_record_launcher_scheme_block(webview, "window.open request");
                }
                Popup::Reject => {
                    crate::shell_diag(
                        "macos_epic_embed: denied window.open request to a non-http(s) \
                         or blank URL -- not routed to the system browser"
                    );
                }
            }
            None
        }

        // D-13, as hardened by the Phase 50 review (`epic_embed_js_dialog`'s module doc has the
        // full rule and why native dialogs stay rather than wry's ignore-all): shown only for a
        // main-frame dialog on the visible surface, one at a time, rate-limited, as a sheet on
        // the main window titled with the page origin. A refused dialog gets wry's answer
        // (alert just completes). Every path calls the completion handler exactly once -- now,
        // or from the sheet's own completion handler.
        #[unsafe(method(webView:runJavaScriptAlertPanelWithMessage:initiatedByFrame:completionHandler:))]
        fn run_js_alert(
            &self,
            webview: &WKWebView,
            message: &NSString,
            frame: &WKFrameInfo,
            completion_handler: &block2::Block<dyn Fn()>,
        ) {
            let Some((mtm, window, origin)) = epic_embed_js_dialog_admit(webview, frame, "alert")
            else {
                (*completion_handler).call(());
                return;
            };
            let done = completion_handler.copy();
            epic_embed_begin_js_dialog_sheet(
                mtm,
                &window,
                &origin,
                &message.to_string(),
                false,
                None,
                move |_response, _text| (*done).call(()),
            );
        }

        /// Same rule as `run_js_alert` above, for JS `confirm()`; a refused one returns `false`.
        #[unsafe(method(webView:runJavaScriptConfirmPanelWithMessage:initiatedByFrame:completionHandler:))]
        fn run_js_confirm(
            &self,
            webview: &WKWebView,
            message: &NSString,
            frame: &WKFrameInfo,
            completion_handler: &block2::Block<dyn Fn(Bool)>,
        ) {
            let Some((mtm, window, origin)) = epic_embed_js_dialog_admit(webview, frame, "confirm")
            else {
                (*completion_handler).call((Bool::NO,));
                return;
            };
            let done = completion_handler.copy();
            epic_embed_begin_js_dialog_sheet(
                mtm,
                &window,
                &origin,
                &message.to_string(),
                true,
                None,
                move |confirmed, _text| (*done).call((Bool::from(confirmed),)),
            );
        }

        /// Same rule as `run_js_alert` above, for JS `prompt()`: the entered text on OK, `nil`
        /// on Cancel or when refused -- `WKUIDelegate`'s documented dismiss answer.
        #[unsafe(method(webView:runJavaScriptTextInputPanelWithPrompt:defaultText:initiatedByFrame:completionHandler:))]
        fn run_js_prompt(
            &self,
            webview: &WKWebView,
            prompt: &NSString,
            default_text: Option<&NSString>,
            frame: &WKFrameInfo,
            completion_handler: &block2::Block<dyn Fn(*mut NSString)>,
        ) {
            let Some((mtm, window, origin)) = epic_embed_js_dialog_admit(webview, frame, "prompt")
            else {
                (*completion_handler).call((std::ptr::null_mut(),));
                return;
            };
            let done = completion_handler.copy();
            let default_text_owned = default_text.map(|s| s.to_string()).unwrap_or_default();
            epic_embed_begin_js_dialog_sheet(
                mtm,
                &window,
                &origin,
                &prompt.to_string(),
                true,
                Some(&default_text_owned),
                move |confirmed, text| match text.filter(|_| confirmed) {
                    Some(text) => {
                        let ns_text = NSString::from_str(&text);
                        (*done).call((Retained::as_ptr(&ns_text) as *mut NSString,));
                    }
                    None => (*done).call((std::ptr::null_mut(),)),
                },
            );
        }
    }
);

/// Shared body for the two navigation-failure hooks (Phase 50 Plan 02): a genuine failure is NOT
/// a timeout -- it clears `nav_started_at` so the clock stops, but (G-50-16,
/// `epic_embed_clears_load_timeout`) NOT `load_timed_out`: the only navigation a failure hook can
/// be reporting on is the one the monitor already timed out, so the raise and its banner survive.
/// The user still sees WebKit's own failure through the logged line, not a second notice.
/// Factored out because `didFailNavigation`/`didFailProvisionalNavigation` differ only in which
/// delegate method called them, which `caller` names for the log line.
fn epic_embed_handle_navigation_failure(webview: &WKWebView, error: &NSError, caller: &str) {
    let description = error.localizedDescription().to_string();
    crate::shell_diag(&format!("macos_epic_embed: {caller} -- {description}"));
    let event = nav_state_json(webview);
    if let Ok(mut guard) = surface().lock() {
        guard.nav_started_at = None;
        if epic_embed_clears_load_timeout(EpicEmbedNavLifecycle::NavigationFailed) {
            guard.load_timed_out = false;
        }
        guard.enqueue_nav_event(event);
    } else {
        crate::shell_diag("WARN: macos_epic_embed surface registry poisoned -- continuing");
    }
}

/// D-14: counts one blocked Epic Games Launcher attempt and queues a nav event carrying the new
/// count. Shared by the navigation-policy hook and the `window.open` popup hook (Phase 50
/// review), so both entry points to the launcher scheme raise the same one-shot toast. `what`
/// names the entry point for the log line -- scheme only, never the URL (T-28-04).
fn epic_embed_record_launcher_scheme_block(webview: &WKWebView, what: &str) {
    crate::shell_diag(&format!(
        "macos_epic_embed: blocked a {what} to the Epic Games Launcher scheme \
         ('{EPIC_GAMES_LAUNCHER_SCHEME}') -- D-14"
    ));
    if let Ok(mut guard) = surface().lock() {
        guard.blocked_launcher_scheme_count = guard.blocked_launcher_scheme_count.saturating_add(1);
        let event = nav_state_json(webview);
        guard.enqueue_nav_event(event);
    } else {
        crate::shell_diag("WARN: macos_epic_embed surface registry poisoned -- continuing");
    }
}

/// Download routing for the raw view (Phase 50 review, T-40-04-04 parity with the Tauri embed's
/// `on_download`, main.rs): returns `true` when `navigation_response` is a download
/// (`navigation_response_is_download`: a type the view cannot show, or an `attachment`
/// disposition), in which case the caller cancels it. Before returning, the URL is handed to the
/// system browser through `open_external` -- but only if the shared popup policy would hand it
/// off (http(s) only, so a page cannot reach `open_external`'s `steam`/`mailto` arms this way)
/// and the shared `STORE_EMBED_POPUP_THROTTLE` admits it, since a frame could otherwise loop
/// downloads into browser tabs. Everything else is dropped with a scheme-free log line.
fn epic_embed_route_download(app: &AppHandle, navigation_response: &WKNavigationResponse) -> bool {
    use crate::store_embed_handoff_policy::{
        navigation_response_is_download, store_embed_browser_handoff_policy,
        StoreEmbedBrowserHandoffDecision,
    };
    let can_show_mime_type = unsafe { navigation_response.canShowMIMEType() };
    let response = unsafe { navigation_response.response() };
    let url_string = response
        .URL()
        .and_then(|u| u.absoluteString())
        .map(|s| s.to_string())
        .unwrap_or_default();
    let content_disposition = response
        .downcast::<NSHTTPURLResponse>()
        .ok()
        .and_then(|http_response| {
            http_response.valueForHTTPHeaderField(&NSString::from_str("Content-Disposition"))
        })
        .map(|v| v.to_string());
    if !navigation_response_is_download(can_show_mime_type, content_disposition.as_deref()) {
        return false;
    }
    // `OpenInAppPopup` is a popup-only exception (Amazon's embed); a download is handed to the
    // system browser exactly as before.
    if !matches!(
        store_embed_browser_handoff_policy(&url_string),
        StoreEmbedBrowserHandoffDecision::HandToSystemBrowser
            | StoreEmbedBrowserHandoffDecision::OpenInAppPopup
    ) {
        crate::shell_diag(
            "macos_epic_embed: denied in-embed download from a non-http(s) URL -- not \
             routed to the system browser",
        );
    } else if crate::store_embed_handoff_admitted(&crate::STORE_EMBED_POPUP_THROTTLE) {
        crate::shell_diag(
            "macos_epic_embed: denied in-embed download, routing to the system browser \
             (T-40-04-04)",
        );
        if let Err(e) = crate::open_external(url_string, app.clone()) {
            crate::shell_diag(&format!(
                "macos_epic_embed: download hand-off to open_external failed: {e}"
            ));
        }
    } else {
        crate::shell_diag(
            "macos_epic_embed: denied in-embed download, rate-limited -- not routed to \
             the system browser",
        );
    }
    true
}

/// `webViewWebContentProcessDidTerminate:` (Phase 50 review): reloads, matching wry's -- and so
/// the Tauri embed's -- default, and queues a nav event so the renderer is never left waiting on a
/// load that will not report. It also re-arms the load-timeout clock (bumping `nav_generation`
/// like a fresh `didStartProvisionalNavigation`), so if the reload never starts the 45 s timeout
/// banner and its Try again still surface instead of a silently blank rectangle.
///
/// **Deliberately inconsistent with the public `reload()` as of quick task 261014-vot.** The
/// public `reload()` now has a first-commit fallback (`epic_embed_reload_action`); this hook's
/// bare `webview.reload()` below does not, and is left unchanged in that task -- a content-process
/// termination has no `last_requested_url` reasoning behind it yet, no test and no live
/// observation, so the inconsistency is recorded here rather than silently carried or fixed on
/// the strength of the public path's reasoning alone. The 45 s timeout re-arm above remains this
/// hook's backstop either way.
fn epic_embed_handle_content_process_termination(webview: &WKWebView) {
    crate::shell_diag("macos_epic_embed: WebContent process terminated -- reloading");
    if let Ok(mut guard) = surface().lock() {
        guard.nav_generation = guard.nav_generation.wrapping_add(1);
        guard.nav_started_at = Some(Instant::now());
        if epic_embed_clears_load_timeout(EpicEmbedNavLifecycle::ContentProcessTerminated) {
            guard.load_timed_out = false;
        }
        let event = nav_state_json(webview);
        guard.enqueue_nav_event(event);
    } else {
        crate::shell_diag("WARN: macos_epic_embed surface registry poisoned -- continuing");
    }
    unsafe {
        webview.reload();
    }
}

/// Admission state for this surface's JS dialog sheets -- see `crate::epic_embed_js_dialog`.
static EPIC_EMBED_JS_DIALOG_GATE: Mutex<crate::epic_embed_js_dialog::JsDialogGate> =
    Mutex::new(crate::epic_embed_js_dialog::JsDialogGate::new());

/// Gathers the facts `JsDialogGate::admit` decides on (main frame? surface selected, unhidden,
/// in a visible window with no sheet already up? page origin showable?) and takes the one open
/// slot. Returns the main-thread marker, the window to attach the sheet to and the origin to
/// title it with; `None` (logged, kind only -- never the page text) means refused, and the
/// caller answers WebKit with the wry-parity default.
fn epic_embed_js_dialog_admit(
    webview: &WKWebView,
    frame: &WKFrameInfo,
    kind: &str,
) -> Option<(MainThreadMarker, Retained<objc2_app_kit::NSWindow>, String)> {
    use crate::epic_embed_js_dialog::{js_dialog_origin_label, EPIC_EMBED_JS_DIALOG_MIN_GAP};
    let mtm = MainThreadMarker::new()?;
    let is_main_frame = unsafe { frame.isMainFrame() };
    let window = webview
        .window()
        .filter(|w| w.isVisible() && w.attachedSheet().is_none());
    let surface_visible =
        window.is_some() && is_selected() && !webview.isHiddenOrHasHiddenAncestor();
    let page_url = unsafe {
        webview
            .URL()
            .and_then(|u| u.absoluteString())
            .map(|s| s.to_string())
            .unwrap_or_default()
    };
    let origin = js_dialog_origin_label(&page_url);
    let admitted = origin.is_some()
        && match EPIC_EMBED_JS_DIALOG_GATE.lock() {
            Ok(mut gate) => gate.admit(
                is_main_frame,
                surface_visible,
                Instant::now(),
                EPIC_EMBED_JS_DIALOG_MIN_GAP,
            ),
            // Fail closed, like `store_embed_handoff_admitted` (main.rs).
            Err(_) => false,
        };
    match (admitted, window, origin) {
        (true, Some(window), Some(origin)) => Some((mtm, window, origin)),
        _ => {
            crate::shell_diag(&format!(
                "macos_epic_embed: refused a JS {kind} dialog (subframe, hidden surface, \
                 opaque origin or rate limit) -- answered with the default"
            ));
            None
        }
    }
}

/// Shows an admitted JS dialog as a sheet on `window` -- window-modal, never `runModal()`'s
/// app-modal loop -- titled with `origin` and carrying the capped page text. OK only, or OK and
/// Cancel when `with_cancel` (confirm/prompt); `prompt_default` adds the `prompt()` text field.
/// `on_done(confirmed, entered_text)` runs exactly once, from the sheet's completion handler,
/// after the gate slot is released.
fn epic_embed_begin_js_dialog_sheet(
    mtm: MainThreadMarker,
    window: &objc2_app_kit::NSWindow,
    origin: &str,
    message: &str,
    with_cancel: bool,
    prompt_default: Option<&str>,
    on_done: impl Fn(bool, Option<String>) + 'static,
) {
    use objc2_app_kit::{NSAlert, NSAlertFirstButtonReturn, NSModalResponse, NSTextField};
    let alert = NSAlert::new(mtm);
    alert.setMessageText(&NSString::from_str(&format!("{origin} says:")));
    alert.setInformativeText(&NSString::from_str(
        &crate::epic_embed_js_dialog::js_dialog_message_text(message),
    ));
    alert.addButtonWithTitle(&NSString::from_str("OK"));
    if with_cancel {
        alert.addButtonWithTitle(&NSString::from_str("Cancel"));
    }
    let text_field = prompt_default.map(|default_text| {
        let frame = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(300.0, 24.0));
        let field = NSTextField::initWithFrame(mtm.alloc(), frame);
        field.setStringValue(&NSString::from_str(default_text));
        alert.setAccessoryView(Some(&field));
        field
    });
    // The handler owns a reference to the alert until it runs, so the alert outlives its sheet
    // however AppKit holds it; `take()` drops that reference inside the handler, so the
    // alert -> handler -> alert cycle is broken once the sheet ends rather than leaking.
    let keep_alert = std::cell::RefCell::new(Some(alert.clone()));
    let handler = block2::RcBlock::new(move |response: NSModalResponse| {
        let _alert = keep_alert.borrow_mut().take();
        if let Ok(mut gate) = EPIC_EMBED_JS_DIALOG_GATE.lock() {
            gate.close(Instant::now());
        }
        let confirmed = response == NSAlertFirstButtonReturn;
        on_done(
            confirmed,
            text_field.as_ref().map(|f| f.stringValue().to_string()),
        );
    });
    alert.beginSheetModalForWindow_completionHandler(window, Some(&handler));
}

impl EpicEmbedNavDelegate {
    pub(crate) fn new(mtm: MainThreadMarker, app: AppHandle) -> Retained<Self> {
        let delegate = mtm
            .alloc::<EpicEmbedNavDelegate>()
            .set_ivars(EpicEmbedNavDelegateIvars { app });
        unsafe { msg_send![super(delegate), init] }
    }
}
