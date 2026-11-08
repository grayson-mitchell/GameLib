use super::*;

/// Create (or, if already open, navigate) the store/wiki embed child webview on `main`
/// (D-01/D-25). Idempotent: a second `store_embed_open` while one already exists under
/// `STORE_EMBED_LABEL` navigates it rather than creating a second child under the same label.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub(crate) fn store_embed_open(app: &AppHandle, args: &[Value]) -> Result<Value, String> {
    let (url, x, y, w, h, store_key, home_url) = store_embed_open_args(args)?;

    // Phase 50 Plan 01 (D-02): macOS routes the Epic store key to the raw-`WKWebView` surface
    // instead of this function's own Tauri-managed `add_child` embed below -- see
    // `macos_epic_embed`'s module doc comment for why. Every OTHER store key, on every platform,
    // falls through to the existing body unchanged; on macOS specifically it also deselects the
    // Epic surface first (hides it without destroying it) so switching the store tab away from
    // Epic doesn't leave the raw subview visible underneath the Tauri-managed embed this function
    // is about to create or reuse.
    //
    // The routing decision itself lives in `macos_epic_embed::surface_for_store_key` (Phase 50
    // Plan 01, Task 2) -- a pure, `AppHandle`-free helper mirroring `store_embed_navigation_policy`
    // below, unit-tested there because this call site, taking a real `AppHandle`, cannot be
    // constructed in a `#[test]`.
    #[cfg(target_os = "macos")]
    {
        match macos_epic_embed::surface_for_store_key(&store_key) {
            macos_epic_embed::EpicEmbedSurfaceSelection::EpicSurface => {
                // Phase 50 review finding 1: symmetric with `deselect()` on the other arm -- hide
                // the Tauri embed (if one exists) so a store switch to Epic never leaves it
                // visible over or under the raw subview (D-01/D-02: never both at once).
                if let Some(tauri_embed) = app.get_webview(STORE_EMBED_LABEL) {
                    tauri_embed
                        .hide()
                        .map_err(|e| format!("store_embed_open:hide-tauri-embed-failed:{e}"))?;
                }
                return macos_epic_embed::open(app, &url, x, y, w, h);
            }
            macos_epic_embed::EpicEmbedSurfaceSelection::TauriEmbed => {
                macos_epic_embed::deselect(app)?;
            }
        }
    }
    // Quick 261030-ts4: a switch to a different store swaps in that store's own history BEFORE
    // the new URL loads, so Back never crosses stores. Quick 261031: `prepare_open` then seeds
    // the store's home beneath a first open at a remembered page. The macOS Epic surface
    // returned above keeps its own native history and is unaffected.
    if let Ok(mut state) = store_embed_state().lock() {
        state.select_store(&store_key);
        state.prepare_open(url.as_str(), home_url.as_ref().map(tauri::Url::as_str));
    } else {
        shell_eprintln!("[shell] WARN: store_embed history registry poisoned -- continuing");
    }

    if let Some(existing) = app.get_webview(STORE_EMBED_LABEL) {
        // 260930-blh (2026-09-30, Linux) + 261001-svm (2026-10-01, macOS), both live-measured:
        // the renderer remounts on every return to a store route and calls `store_embed_open`
        // again, while the previous unmount left the embed HIDDEN and, via the slot's
        // ResizeObserver, moved to a zero rect on Linux. The SHOW step below is now shared across
        // platforms: navigating alone would leave the embed hidden on macOS too, exactly as the
        // 2026-10-01 measurement found. The rect is now re-applied on every platform (macOS/Windows
        // since the 2026-10-30 R7 fix: a return after a window resize otherwise painted the stale
        // size until the renderer's follow-up flush landed ~1 s later), behind the same zero-area
        // guard as `store_embed_set_bounds`.
        #[cfg(target_os = "linux")]
        {
            let rect = store_embed_linux_gtk_rect(x, y, w, h)
                .map_err(|e| e.replacen("store_embed_set_bounds:", "store_embed_open:", 1))?;
            linux_store_embed_layout::apply_bounds(&existing, rect)?;
        }
        // Defect B (R7): macOS/Windows also apply the given rect BEFORE showing, so a return
        // after a window resize paints at the new slot size at once instead of the stale one
        // until the renderer's follow-up flush lands. Same zero-area guard as set_bounds.
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        if !store_embed_rect_is_zero_area(w, h) {
            store_embed_apply_rect(app, &existing, x, y, w, h)
                .map_err(|e| e.replacen("store_embed_set_bounds:", "store_embed_open:", 1))?;
        }
        existing
            .show()
            .map_err(|e| format!("store_embed_open:show-failed:{e}"))?;
        existing
            .navigate(url)
            .map_err(|e| format!("store_embed_open:navigate-failed:{e}"))?;
        return Ok(Value::Null);
    }

    // Linux: convert the slot rect BEFORE creating anything, so a bad rect returns an error with
    // no side effects. The other Linux-only step below restructures main's GTK hierarchy.
    #[cfg(target_os = "linux")]
    let linux_rect = store_embed_linux_gtk_rect(x, y, w, h)
        .map_err(|e| e.replacen("store_embed_set_bounds:", "store_embed_open:", 1))?;

    let window = app
        .get_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| format!("store_embed_open:no-window:{MAIN_WINDOW_LABEL}"))?;

    let builder = tauri::WebviewBuilder::new(STORE_EMBED_LABEL, tauri::WebviewUrl::External(url))
        .user_agent(STORE_EMBED_USER_AGENT)
        // D-22: on_page_load, never on_navigation, per the 013-015 rule that carries over
        // unchanged -- main-frame-only per `40-EMBED-API-VERIFICATION.md` Q4.
        .on_page_load(|_webview, payload| {
            // Main frame only (see above), so this is the TOP-LEVEL host the `steam:` gate in
            // `store_embed_navigation_policy` needs. Recorded on `Started` too, so a page that
            // has begun replacing a Valve page is not still judged by the Valve host.
            if let Ok(mut host) = STORE_EMBED_TOP_LEVEL_HOST.lock() {
                *host = payload.url().host_str().map(str::to_string);
            }
            if payload.event() == tauri::webview::PageLoadEvent::Started {
                if let Ok(mut state) = store_embed_state().lock() {
                    state.begin_page_load();
                } else {
                    shell_eprintln!(
                        "[shell] WARN: store_embed history registry poisoned -- continuing"
                    );
                }
            }
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                if let Ok(mut state) = store_embed_state().lock() {
                    if state.push_at(payload.url().to_string(), std::time::Instant::now())
                        == Some(StoreEmbedHistoryChange::Replaced)
                    {
                        shell_eprintln!(
                            "[shell] store_embed: page load replaced host={}",
                            payload.url().host_str().unwrap_or("")
                        );
                    }
                } else {
                    shell_eprintln!(
                        "[shell] WARN: store_embed history registry poisoned -- continuing"
                    );
                }
            }
        })
        // D-29/T-40-04-02/03/09: named, unit-tested scheme policy (see
        // `store_embed_navigation_policy` above) replaces plan `40-02`'s bare log-only
        // placeholder. Fires for every frame including subframes, which is the coverage a
        // stateless blocker needs -- see that function's own doc comment for why this hook,
        // not `on_page_load`, is correct here.
        .on_navigation({
            let app_handle = app.clone();
            move |url| {
                // Fail closed on a poisoned lock: no known top-level host means no hand-off.
                let top_level_host = STORE_EMBED_TOP_LEVEL_HOST
                    .lock()
                    .ok()
                    .and_then(|host| host.clone());
                match store_embed_navigation_policy(url, top_level_host.as_deref()) {
                    StoreEmbedNavigationDecision::Allow => true,
                    StoreEmbedNavigationDecision::Block => false,
                    StoreEmbedNavigationDecision::Handoff => {
                        if !store_embed_handoff_admitted(&STORE_EMBED_STEAM_THROTTLE) {
                            shell_eprintln!(
                                "[shell] store_embed: steam: hand-off rate-limited -- dropped"
                            );
                            return false;
                        }
                        // Reuses the existing `open_external` command function directly -- never a
                        // second, duplicated `app.opener()` call site (D-28).
                        if let Err(e) = open_external(url.to_string(), app_handle.clone()) {
                            shell_eprintln!(
                                "[shell] store_embed: on_navigation handoff to open_external \
                             failed: {e}"
                            );
                        }
                        false
                    }
                }
            }
        })
        // D-28: a store page's `window.open()` popup is denied inside the embed's own frame
        // and routed to the system browser instead, where the URL bar and the user's password
        // manager both work -- neither exists inside an in-app child webview (T-40-04-05).
        // Rate-limited (todo 2026-10-05): the hook carries no user gesture, so without a cap
        // any frame could open system-browser tabs in a loop.
        //
        // The ONE exception (todo 2026-11-02): an OAuth authorize popup needs its opener. Amazon's
        // "link your Epic account" opens `https://www.epicgames.com/id/authorize` and finishes
        // through `window.opener`; handed to the system browser, the claim page spins forever and
        // a reload still offers "link account" (measured live on luna.amazon.com). That exact
        // shape (`StoreEmbedBrowserHandoffDecision::OpenInAppPopup`: https, host exactly
        // `www.epicgames.com`, path under `/id/`) opens an in-app popup sharing the embed's data
        // store. Everything else stays on the D-28 path. The popup is NOT throttled: its fixed
        // label permits one at a time, so a looping frame cannot stack windows.
        //
        // Phase 50 review: otherwise only http(s) popups are handed off -- see
        // `store_embed_browser_handoff_policy` for why `steam:` (which `open_external` itself
        // would accept) never is from a popup. Decided BEFORE the throttle, so a rejected or
        // `about:blank` popup cannot use up the slot. A launcher-scheme popup is simply rejected
        // here, as this embed's own navigation hook rejects that scheme (the D-14 counter exists
        // only on the macOS Epic surface).
        .on_new_window({
            let app_handle = app.clone();
            move |url, features| {
                use store_embed_handoff_policy::{
                    store_embed_browser_handoff_policy, StoreEmbedBrowserHandoffDecision,
                };
                let decision = store_embed_browser_handoff_policy(url.as_str());
                if decision == StoreEmbedBrowserHandoffDecision::OpenInAppPopup {
                    // Host and path only: the query string carries OAuth state.
                    shell_eprintln!(
                        "[shell] store_embed: window.open to {}{} -- opening in-app popup \
                         (opener kept, todo 2026-11-02)",
                        url.host_str().unwrap_or("?"),
                        url.path()
                    );
                    return match store_embed_open_link_popup(&app_handle, url, features) {
                        Ok(window) => tauri::webview::NewWindowResponse::Create { window },
                        Err(e) => {
                            shell_eprintln!(
                                "[shell] store_embed: in-app popup failed, denying: {e}"
                            );
                            tauri::webview::NewWindowResponse::Deny
                        }
                    };
                }
                if decision != StoreEmbedBrowserHandoffDecision::HandToSystemBrowser {
                    shell_eprintln!(
                        "[shell] store_embed: denied window.open request to scheme '{}' -- not \
                         routed to the system browser",
                        url.scheme()
                    );
                    return tauri::webview::NewWindowResponse::Deny;
                }
                if !store_embed_handoff_admitted(&STORE_EMBED_POPUP_THROTTLE) {
                    shell_eprintln!(
                        "[shell] store_embed: denied window.open request, rate-limited -- not \
                         routed to the system browser"
                    );
                    return tauri::webview::NewWindowResponse::Deny;
                }
                // Host and path only: the query string may carry tokens.
                shell_eprintln!(
                    "[shell] store_embed: denied window.open request to {}{}, routing to \
                     system browser (D-28)",
                    url.host_str().unwrap_or("?"),
                    url.path()
                );
                if let Err(e) = open_external(url.to_string(), app_handle.clone()) {
                    shell_eprintln!(
                        "[shell] store_embed: on_new_window handoff to open_external failed: {e}"
                    );
                }
                tauri::webview::NewWindowResponse::Deny
            }
        })
        // D-28: a store page cannot write to disk through the app. The download is refused
        // inside the embed and its URL is routed to the system browser instead (T-40-04-04).
        .on_download({
            let app_handle = app.clone();
            move |_webview, event| {
                if let tauri::webview::DownloadEvent::Requested { url, .. } = &event {
                    // Phase 50 review: the same http(s)-only policy as `on_new_window` and the
                    // raw Epic view's download path -- a download URL is page-chosen too, and
                    // `open_external`'s own allowlist (`steam`, `mailto`, ...) is not what decides
                    // what a store page may hand to the OS.
                    use store_embed_handoff_policy::{
                        store_embed_browser_handoff_policy, StoreEmbedBrowserHandoffDecision,
                    };
                    // A download is never an in-app popup: `OpenInAppPopup` is a popup-only
                    // exception, so for a download it means the same as a browser hand-off.
                    if !matches!(
                        store_embed_browser_handoff_policy(url.as_str()),
                        StoreEmbedBrowserHandoffDecision::HandToSystemBrowser
                            | StoreEmbedBrowserHandoffDecision::OpenInAppPopup
                    ) {
                        shell_eprintln!(
                            "[shell] store_embed: denied in-embed download with scheme '{}' -- \
                             not routed to the system browser",
                            url.scheme()
                        );
                        return false;
                    }
                    shell_eprintln!(
                        "[shell] store_embed: denied in-embed download, routing to system \
                         browser (D-28)"
                    );
                    if let Err(e) = open_external(url.to_string(), app_handle.clone()) {
                        shell_eprintln!(
                            "[shell] store_embed: on_download handoff to open_external \
                             failed: {e}"
                        );
                    }
                }
                false
            }
        });

    // Linux: main must already live in the Overlay BEFORE the embed is packed into the vbox, and
    // the embed is moved into the Overlay's Fixed straight after `add_child` returns.
    #[cfg(target_os = "linux")]
    linux_store_embed_layout::ensure_overlay(app)?;

    // macOS: same titlebar-band correction as `store_embed_apply_rect`.
    #[cfg(target_os = "macos")]
    let y = y + macos_epic_embed::main_window_content_top_inset(app)?;
    match window.add_child(
        builder,
        tauri::LogicalPosition::new(x, y),
        tauri::LogicalSize::new(w, h),
    ) {
        Ok(_webview) => {
            #[cfg(target_os = "linux")]
            if let Err(e) = linux_store_embed_layout::mount(app, &_webview, linux_rect) {
                // Main must never be left sharing the vbox with an unmounted embed.
                shell_eprintln!("[shell] store_embed(linux): error mount: {e}");
                let _ = _webview.close();
                if let Ok(mut state) = store_embed_state().lock() {
                    state.clear();
                }
                return Err(format!("store_embed_open:linux-mount-failed:{e}"));
            }
            Ok(Value::Null)
        }
        Err(e) => {
            shell_eprintln!("[shell] store_embed_open: child webview construction failed: {e}");
            Err(format!("store_embed_open:child-webview-failed:{e}"))
        }
    }
}

// ---- In-app store/wiki embed (Phase 40 Plan 02, D-01/D-03). Every arm is macOS + Linux
// (quick 260930-blh) + Windows (quick 261012-f25) per D-03's target-gated `unstable`
// feature; a target outside those three returns a legible error rather than silently
// compiling this section out (see the section doc comment above `STORE_EMBED_LABEL` for
// the full rationale). No shipped target compiles that branch. ----
pub(crate) fn rpc_store_embed_open(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    {
        store_embed_open(app, args)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("store_embed_open:unsupported-platform".to_string())
    }
}
