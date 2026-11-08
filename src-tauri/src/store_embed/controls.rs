use super::*;

/// D-21: hide on route leave, never close -- the embed's state and history registry survive.
/// Returns a distinguishable error when the label is absent, never a silent `Ok`.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
fn store_embed_hide(app: &AppHandle) -> Result<Value, String> {
    // Phase 50 Plan 01 (D-01/D-02): the Epic surface and the Tauri embed are never visible at
    // once, so whichever one is selected owns this call exclusively -- route there and return.
    #[cfg(target_os = "macos")]
    {
        if macos_epic_embed::is_selected() {
            return macos_epic_embed::hide(app);
        }
    }
    let webview = app
        .get_webview(STORE_EMBED_LABEL)
        .ok_or_else(|| format!("store_embed_hide:no-webview:{STORE_EMBED_LABEL}"))?;
    webview
        .hide()
        .map_err(|e| format!("store_embed_hide:failed:{e}"))?;
    Ok(Value::Null)
}

/// D-21: show after a prior hide. Returns a distinguishable error when the label is absent,
/// never a silent `Ok`.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
fn store_embed_show(app: &AppHandle) -> Result<Value, String> {
    // Phase 50 Plan 01 (D-01/D-02): symmetric with `store_embed_hide` above.
    #[cfg(target_os = "macos")]
    {
        if macos_epic_embed::is_selected() {
            return macos_epic_embed::show(app);
        }
    }
    let webview = app
        .get_webview(STORE_EMBED_LABEL)
        .ok_or_else(|| format!("store_embed_show:no-webview:{STORE_EMBED_LABEL}"))?;
    webview
        .show()
        .map_err(|e| format!("store_embed_show:failed:{e}"))?;
    Ok(Value::Null)
}

/// D-21: close only at teardown -- unlike `store_embed_hide`, this also clears the history
/// registry (D-22), since a closed embed's history is not meant to survive into the next open.
/// Returns a distinguishable error when the label is absent, never a silent `Ok`.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
fn store_embed_close(app: &AppHandle) -> Result<Value, String> {
    // Phase 50 Plan 01 (D-01/D-02): app teardown closes BOTH surfaces, not whichever one is
    // currently selected -- close the Epic surface first, then fall through to the existing
    // Tauri-embed body below rather than returning early. Neither subview may outlive the app.
    #[cfg(target_os = "macos")]
    {
        macos_epic_embed::close(app)?;
    }
    let webview = app
        .get_webview(STORE_EMBED_LABEL)
        .ok_or_else(|| format!("store_embed_close:no-webview:{STORE_EMBED_LABEL}"))?;
    webview
        .close()
        .map_err(|e| format!("store_embed_close:failed:{e}"))?;
    if let Ok(mut state) = store_embed_state().lock() {
        state.clear();
    }
    Ok(Value::Null)
}

/// Drains the navigation states queued by `on_page_load`'s Finished handler (GAP-D, D-22,
/// REQ-40-06). Takes an `AppHandle` only to read the embed's live URL (native `Webview::url()`,
/// no page-side JS) and reconcile same-document navigations (quick 261102-sk8). The queue lives
/// in the process-static `STORE_EMBED_STATE`, NOT on the webview handle -- which is the point. The 013-015 rule is that a poller must be
/// anchored to a SURVIVOR, and the embed's handle dies with the embed; this state does not, so
/// a drain issued while the embed is closed resolves an empty array rather than erroring.
///
/// A poisoned lock IS surfaced as an error here, unlike the `on_page_load` push path (which
/// logs and continues rather than panicking a webview navigation callback). The asymmetry is
/// deliberate: a failed push loses one event, while a failed drain that resolved `[]` would be
/// indistinguishable from a healthy idle channel -- exactly the F-34.4.2-19 defect class this
/// seam's per-field coercion exists to prevent one layer up.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
fn store_embed_take_nav_events(app: &AppHandle) -> Result<Value, String> {
    // Phase 50 Plan 02 (D-01/D-02): the Epic surface queues its OWN nav events
    // (`macos_epic_embed::EpicEmbedSurface::pending_nav_events`) -- route there when it is the
    // selected surface, symmetric with `store_embed_hide`/`show`/`close` above.
    #[cfg(target_os = "macos")]
    {
        if macos_epic_embed::is_selected() {
            return macos_epic_embed::take_nav_events();
        }
    }
    // Never call into the webview while holding the state lock: the main-thread `on_page_load`
    // handler takes that lock and `Webview::url()` round-trips to the main thread, so holding
    // it across the read can deadlock.
    let generation = store_embed_state()
        .lock()
        .map_err(|_| "store_embed_take_nav_events:history-registry-poisoned".to_string())?
        .nav_generation();
    let live_url = app
        .get_webview(STORE_EMBED_LABEL)
        .and_then(|webview| webview.url().ok());
    let mut state = store_embed_state()
        .lock()
        .map_err(|_| "store_embed_take_nav_events:history-registry-poisoned".to_string())?;
    if let Some(live) = live_url {
        if let Some(change) =
            state.observe_live_url_at(live.as_str(), generation, std::time::Instant::now())
        {
            shell_eprintln!(
                "[shell] store_embed: same-document navigation {} host={}",
                change.as_str(),
                live.host_str().unwrap_or("")
            );
        }
    }
    Ok(Value::Array(state.take_nav_events()))
}

/// Parse `store_embed_navigate`'s `{ url }` arg.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub(crate) fn store_embed_navigate_args(args: &[Value]) -> Result<tauri::Url, String> {
    let a = StoreEmbedNavigateArgs::from_args(args)?;
    // No fallback URL on a parse failure (same discipline as `store_embed_open_args`).
    tauri::Url::parse(&a.url).map_err(|e| format!("store_embed_navigate:bad-url:{e}"))
}

/// Phase 40 Plan 07 (D-22/D-25): moves the history cursor back one entry and navigates the
/// embed there. Returns the navigation state (`store_embed_nav_state_json`) derived from the
/// cursor's NEW position -- there is no handle to synchronously ask, so this state IS the read.
///
/// ZERO page-side JS injection: this calls `Webview::navigate(Url)`, the vendored-source-verified
/// mechanism (`40-EMBED-API-VERIFICATION.md` Q1/Q2), never `eval()` or any evaluated history
/// call in the page. The 2026-08-03 Talon root-cause identified document-side injection as the
/// confirmed fingerprint vector -- D-22 makes avoiding it a hard rule for every arm in this
/// section, not a preference, and this comment is the reason a future reader reaching for
/// `eval` here should stop.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
fn store_embed_back(app: &AppHandle) -> Result<Value, String> {
    // Phase 50 Plan 02 (D-01/D-02): the Epic surface owns its own NATIVE back/forward via
    // `WKWebView::goBack()`/`canGoBack()` -- it tracks no Rust-side history stack (see
    // `macos_epic_embed`'s module doc comment). Route there when it is the selected surface,
    // symmetric with `store_embed_hide`/`show`/`close` above.
    #[cfg(target_os = "macos")]
    {
        if macos_epic_embed::is_selected() {
            return macos_epic_embed::back(app);
        }
    }
    let webview = app
        .get_webview(STORE_EMBED_LABEL)
        .ok_or_else(|| format!("store_embed_back:no-webview:{STORE_EMBED_LABEL}"))?;
    let (target_url, json) = {
        let mut state = store_embed_state()
            .lock()
            .map_err(|_| "store_embed_back:history-registry-poisoned".to_string())?;
        let Some(target_url) = state.go_back() else {
            return Err("store_embed_back:no-back-entry".to_string());
        };
        (target_url, store_embed_nav_state_json(&state))
    };
    let parsed_url = tauri::Url::parse(&target_url)
        .map_err(|e| format!("store_embed_back:bad-recorded-url:{e}"))?;
    webview
        .navigate(parsed_url)
        .map_err(|e| format!("store_embed_back:navigate-failed:{e}"))?;
    Ok(json)
}

/// The mirror of `store_embed_back` -- see its doc comment for the shared rationale (D-22/D-25,
/// ZERO page-side JS injection via `Webview::navigate(Url)`, never `eval`).
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
fn store_embed_forward(app: &AppHandle) -> Result<Value, String> {
    // Phase 50 Plan 02 (D-01/D-02): symmetric with `store_embed_back` above.
    #[cfg(target_os = "macos")]
    {
        if macos_epic_embed::is_selected() {
            return macos_epic_embed::forward(app);
        }
    }
    let webview = app
        .get_webview(STORE_EMBED_LABEL)
        .ok_or_else(|| format!("store_embed_forward:no-webview:{STORE_EMBED_LABEL}"))?;
    let (target_url, json) = {
        let mut state = store_embed_state()
            .lock()
            .map_err(|_| "store_embed_forward:history-registry-poisoned".to_string())?;
        let Some(target_url) = state.go_forward() else {
            return Err("store_embed_forward:no-forward-entry".to_string());
        };
        (target_url, store_embed_nav_state_json(&state))
    };
    let parsed_url = tauri::Url::parse(&target_url)
        .map_err(|e| format!("store_embed_forward:bad-recorded-url:{e}"))?;
    webview
        .navigate(parsed_url)
        .map_err(|e| format!("store_embed_forward:navigate-failed:{e}"))?;
    Ok(json)
}

/// Reloads the embed's current page. Arms the one-shot suppression flag FIRST (T-40-07-05) so
/// the `on_page_load` Finished event this reload produces does not push a duplicate history
/// entry for the same URL -- reload must leave the stack unchanged. Calls `Webview::reload()`,
/// never `eval('location.reload()')` (D-22's zero-page-side-JS-injection rule, see
/// `store_embed_back`'s doc comment).
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
fn store_embed_reload(app: &AppHandle) -> Result<Value, String> {
    // Phase 50 Plan 02 (D-01/D-02): symmetric with `store_embed_hide`/`show`/`close` above --
    // the Epic surface's `reload()` re-issues the webview's own current URL, leaving
    // `canGoBack`/`canGoForward` unchanged, matching this arm's own suppression discipline.
    #[cfg(target_os = "macos")]
    {
        if macos_epic_embed::is_selected() {
            return macos_epic_embed::reload(app);
        }
    }
    let webview = app
        .get_webview(STORE_EMBED_LABEL)
        .ok_or_else(|| format!("store_embed_reload:no-webview:{STORE_EMBED_LABEL}"))?;
    let json = {
        let mut state = store_embed_state()
            .lock()
            .map_err(|_| "store_embed_reload:history-registry-poisoned".to_string())?;
        state.arm_reload_suppression();
        store_embed_nav_state_json(&state)
    };
    webview
        .reload()
        .map_err(|e| format!("store_embed_reload:failed:{e}"))?;
    Ok(json)
}

/// The arm plan `40-09`'s deep-link and route-change paths use (T-40-07 interfaces contract).
/// A `store_embed_navigate` call is ITSELF the user-initiated event, so it pushes the new URL
/// immediately -- like a browser's `history.pushState` -- rather than waiting for
/// `on_page_load`'s Finished event to land asynchronously after the network round trip;
/// waiting would return a stale nav state to the caller. It then arms the one-shot suppression
/// flag so that same Finished event (which WILL still fire for this navigation) does not
/// double-push the URL this call already recorded. Pushing truncates any forward entries past
/// the cursor, exactly like a user-initiated navigation (D-22).
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub(crate) fn store_embed_navigate(app: &AppHandle, args: &[Value]) -> Result<Value, String> {
    let url = store_embed_navigate_args(args)?;
    // Phase 50 Plan 02 (D-01/D-02): symmetric with `store_embed_hide`/`show`/`close` above.
    #[cfg(target_os = "macos")]
    {
        if macos_epic_embed::is_selected() {
            return macos_epic_embed::navigate(app, &url);
        }
    }
    let webview = app
        .get_webview(STORE_EMBED_LABEL)
        .ok_or_else(|| format!("store_embed_navigate:no-webview:{STORE_EMBED_LABEL}"))?;
    let json = {
        let mut state = store_embed_state()
            .lock()
            .map_err(|_| "store_embed_navigate:history-registry-poisoned".to_string())?;
        state.push(url.to_string());
        state.arm_reload_suppression();
        store_embed_nav_state_json(&state)
    };
    webview
        .navigate(url)
        .map_err(|e| format!("store_embed_navigate:navigate-failed:{e}"))?;
    Ok(json)
}

pub(crate) fn rpc_store_embed_hide(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    StoreEmbedHideArgs::from_args(args)?;
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    {
        store_embed_hide(app)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("store_embed_hide:unsupported-platform".to_string())
    }
}

pub(crate) fn rpc_store_embed_show(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    StoreEmbedShowArgs::from_args(args)?;
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    {
        store_embed_show(app)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("store_embed_show:unsupported-platform".to_string())
    }
}

pub(crate) fn rpc_store_embed_close(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    StoreEmbedCloseArgs::from_args(args)?;
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    {
        store_embed_close(app)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("store_embed_close:unsupported-platform".to_string())
    }
}

// GAP-D (quick task `260905-e61`, D-22, REQ-40-06): the arm that carries an IN-EMBED
// navigation back to the renderer. Without it the four arms below only ever reported
// state for navigations the USER's own chrome initiated, so clicking a link inside the
// embed moved this process's cursor while the renderer's `canGoBack` stayed false
// forever. Drains, never peeks -- same contract as `humble_login_take_events` above.
pub(crate) fn rpc_store_embed_take_nav_events(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    StoreEmbedTakeNavEventsArgs::from_args(args)?;
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    {
        store_embed_take_nav_events(app)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("store_embed_take_nav_events:unsupported-platform".to_string())
    }
}

// Phase 40 Plan 07 (D-22/D-25): the four navigation arms. Each returns the navigation
// state (`store_embed_nav_state_json`) derived from the Rust-owned cursor -- there is
// no `canGoBack()`-style handle to query, so this pushed/returned state IS the read
// (control inverts: Rust pushes, the frontend never polls).
pub(crate) fn rpc_store_embed_back(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    StoreEmbedBackArgs::from_args(args)?;
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    {
        store_embed_back(app)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("store_embed_back:unsupported-platform".to_string())
    }
}

pub(crate) fn rpc_store_embed_forward(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    StoreEmbedForwardArgs::from_args(args)?;
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    {
        store_embed_forward(app)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("store_embed_forward:unsupported-platform".to_string())
    }
}

pub(crate) fn rpc_store_embed_reload(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    StoreEmbedReloadArgs::from_args(args)?;
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    {
        store_embed_reload(app)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("store_embed_reload:unsupported-platform".to_string())
    }
}

pub(crate) fn rpc_store_embed_navigate(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    {
        store_embed_navigate(app, args)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("store_embed_navigate:unsupported-platform".to_string())
    }
}
