//! Epic embed surface: the `EpicEmbedSurface` registry, KVO observers and surface fns (split from
//! `macos_epic_embed.rs`, Phase 71 D-14).

use super::*;

// SAFETY: a raw pointer value is not normally `Send`, but every address wrapped here is a bare
// address, reconstructed into a live reference (or into an owning `Retained<T>` via
// `Retained::from_raw`) only from within a main-thread closure -- identical shape and rationale
// to the LOCAL `SendPtr` `open_pristine_epic_login_window` (main.rs) declares for its own
// webview-content-view and event-monitor addresses. Declared locally here, not shared with that
// function's copy, because it is not reachable from a sibling module.
struct SendPtr(*mut c_void);
unsafe impl Send for SendPtr {}

/// The Epic embed's whole state: the retained `WKWebView`/delegate (parked as raw addresses via
/// `Retained::into_raw`, reconstructed via `Retained::from_raw` on `close()` to release them --
/// see `close()`'s own doc comment), the selection/visibility state machine
/// (`EpicEmbedVisibility`, `epic_embed_state.rs`), the last-observed top-level host (fed to `store_embed_navigation_policy`'s
/// `top_level_host` parameter exactly as `StoreEmbedState` feeds it for the Tauri-managed embed),
/// and the queued nav-state events `take_nav_events` drains.
#[derive(Default)]
pub(crate) struct EpicEmbedSurface {
    webview: Option<SendPtr>,
    delegate: Option<SendPtr>,
    /// `selected` (D-02), the renderer's own hide, and `challenged` (D-09/D-10) -- the three
    /// inputs the subview's `hidden` flag is DERIVED from (review findings 5/7/13). Changed only
    /// on the main thread, in the same step that applies the result via `apply_visibility`.
    pub(crate) visibility: EpicEmbedVisibility,
    pub(crate) top_level_host: Option<String>,
    pub(crate) pending_nav_events: Vec<Value>,
    /// Bumped on every `didStartProvisionalNavigation` (Phase 50 Plan 02). Read by
    /// `spawn_load_timeout_monitor`'s main-thread re-check: if a newer navigation has bumped
    /// this since the monitor's lock-only pre-check, the raise this tick was about to commit is
    /// stale and must not land -- the overwritten `nav_started_at` alone would still mostly work,
    /// but re-checking the generation under the SAME lock as the actual flag write closes the
    /// narrow window where a pre-check and a landing `didStartProvisionalNavigation` interleave.
    pub(crate) nav_generation: u64,
    /// `Some(t)` while a main-frame navigation is in flight with no `didFinishNavigation`/failure
    /// callback yet; `None` once one lands (success or failure), or freshly re-set to `Some` by
    /// the next `didStartProvisionalNavigation`. Read by `spawn_load_timeout_monitor` to compute
    /// elapsed time. Deliberately NOT touched by `hide()`/`show()`/`deselect()` -- see this
    /// module's own "Timer while hidden" doc comment, above.
    pub(crate) nav_started_at: Option<Instant>,
    /// `true` once `spawn_load_timeout_monitor` has raised the flag for the navigation currently
    /// in flight. Cleared by the next `didStartProvisionalNavigation` or by
    /// `didFinishNavigation`/`webViewWebContentProcessDidTerminate:` (D-11: every load starts
    /// fresh). NOT cleared by either failure hook (G-50-16, `epic_embed_clears_load_timeout`): a
    /// genuine failure still clears `nav_started_at` so the clock stops, but the raise itself
    /// survives, because the only navigation a failure hook can be reporting on is the one that
    /// just timed out.
    pub(crate) load_timed_out: bool,
    /// Monotonic count of navigations blocked specifically because their scheme was
    /// `EPIC_GAMES_LAUNCHER_SCHEME` (Phase 50 Plan 02, D-14) -- bumped in the
    /// `decidePolicyForNavigationAction` hook's `Block` arm, never decremented, never reset while
    /// the subview lives. A counter rather than a boolean, deliberately: the renderer DRAINS the
    /// nav-event ring and applies only the LAST event (`take_nav_events`), so a one-shot boolean
    /// flag could be coalesced away between two drains and the user would silently miss the
    /// notice. A counter that only ever increases lets the renderer show exactly one toast per
    /// increment it has not yet shown, even across a coalesced drain.
    pub(crate) blocked_launcher_scheme_count: u64,
    /// `true` once `webView:didCommitNavigation:` has landed for the navigation currently (or
    /// most recently) in flight (quick task 261014-vot). Set only by that hook; cleared only by
    /// `close()` and the cold `open()` path (a brand-new `WKWebView` has committed nothing).
    /// Deliberately NOT cleared by either failure hook: a failure after a successful commit still
    /// leaves a real current URL that `reload()` can act on -- the Launch 3 behaviour, where each
    /// Reload click on an already-committed page produced its own `-999` cancellation.
    pub(crate) has_committed: bool,
    /// The last URL chrome (not the page) asked this surface to load (quick task 261014-vot).
    /// Written at exactly the three CHROME-initiated `loadRequest` sites -- `open()`'s warm and
    /// cold paths and `navigate()` -- never by a delegate hook and never by a page-initiated
    /// navigation, because `reload()`'s first-commit fallback re-issues this URL verbatim.
    last_requested_url: Option<String>,
}

static EPIC_EMBED_SURFACE: OnceLock<Mutex<EpicEmbedSurface>> = OnceLock::new();

pub(crate) fn surface() -> &'static Mutex<EpicEmbedSurface> {
    EPIC_EMBED_SURFACE.get_or_init(|| Mutex::new(EpicEmbedSurface::default()))
}

/// `true` only when the Epic surface's `WKWebView` exists AND is the currently-selected store
/// embed -- `store_embed_set_bounds`/`hide`/`show`/`close` (main.rs) key their `#[cfg(target_os =
/// "macos")]` routing on this. Fails CLOSED (`false`) on a poisoned lock: a poisoned registry
/// means this module's own state is unknown, and routing every call to the Tauri-managed embed
/// path (which will itself report a clean "no embed open" error) is safer than routing into a
/// surface whose state cannot be trusted.
pub(crate) fn is_selected() -> bool {
    match surface().lock() {
        Ok(guard) => guard.visibility.selected() && guard.webview.is_some(),
        Err(_) => false,
    }
}

/// Height (logical px) of the band at the top of the window's content view that the renderer's
/// viewport does NOT cover: the visible native titlebar. Tauri's `TitleBarStyle::Visible` keeps
/// `NSWindowStyleMaskFullSizeContentView` set, so the content view -- the parent wry positions a
/// child webview in -- spans the whole window, while the main webview's page starts BELOW an
/// opaque titlebar. A rect measured in the renderer (`getBoundingClientRect`) therefore sits
/// `inset` px lower in content-view coordinates. Under `Overlay` (transparent titlebar) the page
/// runs under the titlebar, so the two origins agree and the inset is 0; without
/// full-size-content-view `contentLayoutRect` equals the view's bounds, also 0. Read fresh on
/// every call so a runtime `setTitleBarStyle` toggle is picked up by the next geometry write.
/// Main thread only.
fn content_top_inset(ns_view: &NSView) -> f64 {
    let Some(window) = ns_view.window() else {
        return 0.0;
    };
    if window.titlebarAppearsTransparent() {
        return 0.0;
    }
    let inset = ns_view.bounds().size.height - window.contentLayoutRect().size.height;
    if inset.is_finite() && inset > 0.0 {
        inset
    } else {
        0.0
    }
}

/// Resolves [`content_top_inset`] for the main window from any thread (marshalled to the main
/// thread, same shape as `set_bounds`). The Tauri-managed store embed (main.rs) adds the result
/// to its renderer-space `y` before `Webview::set_position`.
pub(crate) fn main_window_content_top_inset(app: &AppHandle) -> Result<f64, String> {
    let window = app
        .get_window(crate::MAIN_WINDOW_LABEL)
        .ok_or_else(|| format!("store_embed_inset:no-window:{}", crate::MAIN_WINDOW_LABEL))?;
    let (tx, rx) = mpsc_channel::<Result<f64, String>>();
    if let Err(e) = app.run_on_main_thread(move || {
        let result: Result<f64, String> = (|| {
            let ns_view_ptr = window
                .ns_view()
                .map_err(|e| format!("store_embed_inset:ns_view-failed:{e}"))?;
            // SAFETY: resolved and retained on the main thread -- see `open()`'s doc comment.
            let ns_view: Retained<NSView> = unsafe { Retained::retain(ns_view_ptr as *mut NSView) }
                .ok_or_else(|| "store_embed_inset:ns_view-null".to_string())?;
            Ok(content_top_inset(&ns_view))
        })();
        let _ = tx.send(result);
    }) {
        return Err(format!("store_embed_inset:dispatch-failed:{e}"));
    }
    match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(r) => r,
        Err(_) => Err("store_embed_inset:main-thread-timeout".to_string()),
    }
}

/// Converts a renderer-space rect (`useStoreEmbedHost`'s `flush()` is the ONLY rect source --
/// D-18, "single geometry oracle": no size-tracking autoresizing mask, no Rust-side resize
/// heuristic; see `top_pinned_autoresizing_mask` for the one edge-pinning mask) into an
/// `NSRect` in `ns_view`'s own coordinate space. Ported verbatim from spike 024's own conditional
/// -- `NSView`'s coordinate origin is bottom-left UNLESS the view opts into `isFlipped() == true`
/// (top-left, matching web/CSS convention), and the subview-attach target's flip state
/// is not assumed either way here. `y` is shifted by [`content_top_inset`] first, the same
/// correction the Tauri-managed embed applies, so a visible titlebar does not lift the subview.
fn rect_to_ns_rect(ns_view: &NSView, x: f64, y: f64, w: f64, h: f64) -> NSRect {
    let y = y + content_top_inset(ns_view);
    let bounds = ns_view.bounds();
    let origin_y = if ns_view.isFlipped() {
        y
    } else {
        bounds.size.height - y - h
    };
    NSRect::new(NSPoint::new(x, origin_y), NSSize::new(w, h))
}

/// Review finding 12: the `WKWebView` properties observed with KVO. WebKit fires NONE of the
/// navigation-delegate callbacks for a same-document navigation (`history.pushState`/
/// `replaceState`, fragment changes) -- exactly how Epic's client-side router changes pages -- so
/// without these the renderer's URL, Back/Forward state and `last-url-epic` froze on the last
/// full load. KVO, not an injected page script: the native properties are observable as-is, and
/// nothing is added to Epic's page (the same no-injection reason D-22's native-history choice
/// rests on).
const EPIC_EMBED_KVO_KEY_PATHS: [&str; 3] = ["URL", "canGoBack", "canGoForward"];

/// Tag for this module's own KVO registrations: `observeValueForKeyPath:` forwards any other
/// context to `super`, per Apple's KVO contract. Only its ADDRESS is used.
static EPIC_EMBED_KVO_CONTEXT: u8 = 0;

pub(crate) fn epic_embed_kvo_context() -> *mut c_void {
    std::ptr::addr_of!(EPIC_EMBED_KVO_CONTEXT) as *mut c_void
}

/// Registers `delegate` for `EPIC_EMBED_KVO_KEY_PATHS` on `webview`. Exactly one call site, in
/// `open()`'s cold path, paired with exactly one `remove_nav_observers` in `close()` -- KVO keeps
/// an UNRETAINED observer pointer, so the delegate must never be released while registered.
fn add_nav_observers(webview: &WKWebView, delegate: &EpicEmbedNavDelegate) {
    for key in EPIC_EMBED_KVO_KEY_PATHS {
        // SAFETY: `delegate` implements `observeValueForKeyPath:ofObject:change:context:` (see
        // `EpicEmbedNavDelegate`), and the context is a 'static address.
        unsafe {
            webview.addObserver_forKeyPath_options_context(
                delegate,
                &NSString::from_str(key),
                NSKeyValueObservingOptions::New,
                epic_embed_kvo_context(),
            );
        }
    }
}

/// The inverse of `add_nav_observers` -- called by `close()` while both objects are still alive,
/// before either is released.
fn remove_nav_observers(webview: &WKWebView, delegate: &EpicEmbedNavDelegate) {
    for key in EPIC_EMBED_KVO_KEY_PATHS {
        // SAFETY: removes exactly the registrations `add_nav_observers` made (same observer, key
        // path and context).
        unsafe {
            webview.removeObserver_forKeyPath_context(
                delegate,
                &NSString::from_str(key),
                epic_embed_kvo_context(),
            );
        }
    }
}

/// Review finding 14: the autoresizing mask that keeps the subview's TOP edge where the renderer
/// put it while the window resizes between two throttled `flush()` rects -- what wry sets on its
/// own child webviews (`ViewMinYMargin`, wry-0.55.1 `wkwebview/mod.rs`), the Tauri-managed
/// sibling this subview sits next to. Without it, a non-flipped (bottom-left origin) parent keeps
/// the subview's distance from the window BOTTOM, so on a resize/zoom/fullscreen it drifts
/// against the slot until the next rect lands. Neither variant sets `ViewWidthSizable`/
/// `ViewHeightSizable`: size never tracks the parent, so `flush()` stays the only geometry
/// authority (D-18; this narrows, not reverses, RESEARCH.md Pitfall 4 -- which is about a
/// size-tracking mask competing with the renderer). Flip-aware, like `rect_to_ns_rect`: in a
/// flipped parent the top margin is the min-Y one, so the flexible margin is max-Y instead.
fn top_pinned_autoresizing_mask(parent_is_flipped: bool) -> NSAutoresizingMaskOptions {
    if parent_is_flipped {
        NSAutoresizingMaskOptions::ViewMaxYMargin
    } else {
        NSAutoresizingMaskOptions::ViewMinYMargin
    }
}

/// The ONE `setHidden` writer for the Epic subview (review findings 5/7). `hidden` is always an
/// `EpicEmbedVisibility` transition's result -- never a caller's own boolean -- so the renderer's
/// hide/show and the Rust-owned challenge hide (D-10) can no longer overwrite each other. Main
/// thread only, like every `WKWebView` call here.
pub(crate) fn apply_visibility(webview: &WKWebView, hidden: bool) {
    webview.setHidden(hidden);
}

/// Builds the `{url, host, canGoBack, canGoForward, surface}` nav-state event for the Epic
/// surface -- the first four field names and shapes match `store_embed_nav_state_json`'s (main.rs)
/// wire contract exactly, so the frontend's existing nav-state consumer needs no Epic-specific
/// branch beyond reading the new `surface` field this module adds. `host` is derived by parsing
/// `webview.URL()`'s `absoluteString()` through `tauri::Url`, the same technique
/// `store_embed_nav_state_json` itself uses, rather than any native `NSURL` host accessor.
///
/// Deliberately reads `canGoBack()`/`canGoForward()` LIVE off the webview on every call, rather
/// than requesting objc2-web-kit's `WKBackForwardList` feature and inspecting the list object --
/// the two booleans are exactly what `WKBackForwardList.backItem`/`.forwardItem` being
/// `nil`-or-not would tell us, at the cost of a whole extra Cargo feature and binding surface
/// this module's own "no Rust-side history stack" doc comment (above) already explains is
/// unnecessary: there is nothing this surface needs from the list beyond these two checks and
/// `goBack()`/`goForward()`, which are already available on `WKWebView` itself.
pub(crate) fn nav_state_json(webview: &WKWebView) -> Value {
    let url_string = unsafe {
        webview
            .URL()
            .and_then(|u| u.absoluteString())
            .map(|s| s.to_string())
            .unwrap_or_default()
    };
    let host = tauri::Url::parse(&url_string)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_string))
        .unwrap_or_default();
    let can_go_back = unsafe { webview.canGoBack() };
    let can_go_forward = unsafe { webview.canGoForward() };
    serde_json::json!({
        "url": url_string,
        "host": host,
        "canGoBack": can_go_back,
        "canGoForward": can_go_forward,
        "surface": "epic",
    })
}

impl EpicEmbedSurface {
    /// Pushes `event` onto the pending queue, dropping the OLDEST entry once
    /// `EPIC_EMBED_NAV_EVENTS_CAP` is exceeded -- see that constant's doc comment for the
    /// rationale. A method (not a free function taking `&mut EpicEmbedSurface`) so it is
    /// callable identically on a locked `MutexGuard` (auto-deref) and on a bare, lock-free
    /// struct value in a unit test -- see `epic_embed_enqueue_nav_event_tests`, below.
    ///
    /// Merges the surface's current `loadTimedOut`/`challenged`/`blockedLauncherSchemeCount`
    /// flags (Phase 50 Plan 02) onto `event` right before pushing, so every one of this module's
    /// several enqueue call sites automatically carries current flag state without each one
    /// separately threading it through its own `nav_state_json()` call. The merge itself is
    /// `epic_nav_state_with_flags` (`epic_embed_state.rs`) -- the SAME function the direct-return
    /// path in `navigate_webview_on_main_thread` uses (review finding 2).
    pub(crate) fn enqueue_nav_event(&mut self, event: Value) {
        let event = epic_nav_state_with_flags(event, self.nav_flags());
        self.pending_nav_events.push(event);
        if self.pending_nav_events.len() > EPIC_EMBED_NAV_EVENTS_CAP {
            self.pending_nav_events.remove(0);
        }
    }

    /// The flag values every Epic nav state carries, read at the instant it is built.
    pub(crate) fn nav_flags(&self) -> EpicEmbedNavFlags {
        EpicEmbedNavFlags {
            load_timed_out: self.load_timed_out,
            challenged: self.visibility.challenged(),
            blocked_launcher_scheme_count: self.blocked_launcher_scheme_count,
        }
    }
}

/// Spawns the Epic surface's one load-timeout monitor thread (Phase 50 Plan 02). Exactly ONE
/// call site -- inside `open()`'s cold path, right after a fresh subview is parked -- so a page
/// that navigates in a loop can never spawn a second thread (T-50-07); the same thread serves
/// every navigation for the life of the surface, and the loop exits only once the surface no
/// longer holds a webview (i.e. after `close()`).
///
/// The loop sleeps 1 second, then takes a cheap LOCK-ONLY pre-check with NO webview touch --
/// every `WKWebView` accessor is main-thread-only and this is a plain worker thread -- and reads
/// `nav_started_at`/`load_timed_out` to decide whether a raise LOOKS needed, snapshotting the
/// surface's current `nav_generation` alongside that decision.
///
/// A positive pre-check dispatches to the main thread via `run_on_main_thread` to RE-VALIDATE
/// under the lock before committing the raise -- a double-checked-lock pattern, not a
/// webview-touching one, since nothing here needs the webview itself until the very end (building
/// the enqueued event). The re-check both recomputes elapsed time from whatever `nav_started_at`
/// holds AT THAT MOMENT and compares `nav_generation` against the snapshot: re-deriving elapsed
/// from the live value would already be self-consistent on its own (a newer
/// `didStartProvisionalNavigation` overwrites `nav_started_at` with a fresh instant, so elapsed
/// naturally stops looking timed-out), but comparing the generation too makes the supersede rule
/// ("a navigation that starts while a previous one is still in flight supersedes it") an explicit,
/// documented check rather than an emergent property of one field's overwrite semantics.
fn spawn_load_timeout_monitor(app: AppHandle) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(1));

        let (generation_snapshot, needs_raise) = match surface().lock() {
            Ok(guard) => {
                if guard.webview.is_none() {
                    return;
                }
                let needs = !guard.load_timed_out
                    && guard.nav_started_at.is_some_and(|t| {
                        epic_embed_load_timed_out(t.elapsed(), EPIC_EMBED_LOAD_TIMEOUT)
                    });
                (guard.nav_generation, needs)
            }
            Err(_) => return,
        };

        if !needs_raise {
            continue;
        }

        let _ = app.run_on_main_thread(move || {
            let Ok(mut guard) = surface().lock() else {
                return;
            };
            if guard.webview.is_none() {
                return;
            }
            // "with an unchanged generation": a newer `didStartProvisionalNavigation` landing
            // between the pre-check above and this dispatch running would have bumped
            // `nav_generation`, and that is what makes this stale raise supersede rather than
            // fire against the NEW navigation.
            if guard.nav_generation != generation_snapshot {
                return;
            }
            let still_timed_out = !guard.load_timed_out
                && guard.nav_started_at.is_some_and(|t| {
                    epic_embed_load_timed_out(t.elapsed(), EPIC_EMBED_LOAD_TIMEOUT)
                });
            if !still_timed_out {
                return;
            }
            guard.load_timed_out = true;
            guard.nav_started_at = None;
            crate::shell_diag(&format!(
                "macos_epic_embed: load timed out past {EPIC_EMBED_LOAD_TIMEOUT:?}"
            ));
            let webview_ptr = guard.webview.as_ref().map(|p| p.0);
            if let Some(ptr) = webview_ptr {
                // SAFETY: see `open()`'s warm path -- identical reasoning; the lock just taken
                // guarantees `webview` is still the live pointer `open()`'s cold path parked.
                let webview: &WKWebView = unsafe { &*(ptr as *const WKWebView) };
                let event = nav_state_json(webview);
                guard.enqueue_nav_event(event);
            }
        });
    });
}

/// Opens (cold) or re-shows and re-navigates (warm) the Epic `WKWebView` subview.
///
/// **Main-thread marshalling**: identical shape to `open_pristine_epic_login_window` (main.rs) --
/// a worker-thread `mpsc` channel plus `app.run_on_main_thread(closure)`, with the outer function
/// blocking on `rx.recv_timeout`. Departs from that function's OLDER pattern in exactly the way
/// `login_window_ns_window_retained`'s doc comment (main.rs) documents as the corrected, safe
/// one: `window.ns_view()` is resolved, AND immediately retained via `Retained::retain`, from
/// INSIDE this closure -- never on the worker thread before dispatch. `ns_view()`/`ns_window()`
/// return an AUTORELEASED address whose validity is bounded by the resolving thread's own
/// autorelease pool, so resolving on the main thread (where this closure already runs) is what
/// makes the retain meaningful; resolving on the worker thread first (the older pattern) relies on
/// that pool not having drained yet, which `login_window_ns_window_retained`'s own doc comment
/// calls out as the latent hazard quick task 260930-q11 found. `send_user_message`
/// (tauri-runtime-wry) short-circuits inline when already on the main thread, so this cannot
/// self-deadlock even though `open()` itself may be invoked FROM the main thread by some callers.
pub(crate) fn open(
    app: &AppHandle,
    url: &tauri::Url,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<Value, String> {
    let window = app
        .get_window(crate::MAIN_WINDOW_LABEL)
        .ok_or_else(|| format!("epic_embed_open:no-window:{}", crate::MAIN_WINDOW_LABEL))?;
    let url_string = url.to_string();
    // Cloned up front so the cold path below can hand an OWNED `AppHandle` to
    // `spawn_load_timeout_monitor` -- the monitor thread outlives this whole call.
    let app_for_monitor = app.clone();
    // Same reason, separately: `app.clone()` directly inside the `move ||` below would move the
    // borrowed `app: &AppHandle` PARAMETER into the closure, not an owned value -- and
    // `run_on_main_thread` requires `'static` (E0521). Clone to an owned value out here instead,
    // for the delegate's own `AppHandle` (D-12's popup hook).
    let app_for_delegate = app.clone();

    let (tx, rx) = mpsc_channel::<Result<(), String>>();
    if let Err(e) = app.run_on_main_thread(move || {
        let result: Result<(), String> = (|| {
            let mtm = MainThreadMarker::new()
                .ok_or_else(|| "epic_embed_open:not-on-main-thread".to_string())?;

            // Review finding 10: every fallible step runs BEFORE the first view mutation. A nil
            // NSURL used to surface only after the cold path had already `addSubview`ed a webview
            // it then never parked in `surface()` (an orphan that intercepts clicks forever), or
            // after the warm path had already re-shown a view it never re-selected.
            let nsurl = NSURL::URLWithString(&NSString::from_str(&url_string))
                .ok_or_else(|| "epic_embed_open:bad-nsurl".to_string())?;

            // Resolve AND retain on the main thread -- see this function's doc comment above.
            let ns_view_ptr = window
                .ns_view()
                .map_err(|e| format!("epic_embed_open:ns_view-failed:{e}"))?;
            // SAFETY: `ns_view_ptr` was just resolved above, on this same main thread, inside the
            // same expression chain that retains it immediately below -- the autorelease pool
            // that would otherwise reclaim it is this thread's own, and the retain happens before
            // control returns to any caller that could drain it.
            let ns_view: Retained<NSView> = unsafe { Retained::retain(ns_view_ptr as *mut NSView) }
                .ok_or_else(|| "epic_embed_open:ns_view-null".to_string())?;
            let frame = rect_to_ns_rect(&ns_view, x, y, w, h);

            let existing_webview_ptr = surface()
                .lock()
                .map_err(|_| "epic_embed_open:surface-poisoned".to_string())?
                .webview
                .as_ref()
                .map(|p| p.0);

            if let Some(ptr) = existing_webview_ptr {
                // Warm path: a subview already exists -- re-apply bounds, un-hide, navigate only
                // if the URL actually differs, and re-select.
                // SAFETY: `ptr` is the address `Retained::into_raw` produced at a prior cold
                // `open()`, below -- it is released ONLY by `close()`, which clears this field
                // under the same lock first, so a non-`None` value here is always still live.
                let webview: &WKWebView = unsafe { &*(ptr as *const WKWebView) };
                webview.setFrame(frame);
                let current_url = unsafe {
                    webview
                        .URL()
                        .and_then(|u| u.absoluteString())
                        .map(|s| s.to_string())
                };
                // D-11 ("no session memory of a challenge"): a route entry onto a surface still
                // parked on a challenge loads fresh even when the URL is unchanged -- otherwise
                // the derived visibility would keep it hidden behind the panel on every return.
                // Without a standing challenge the warm path still navigates only on a URL change
                // (D-04: a plain show reloads nothing).
                let (load, hidden) = {
                    let mut guard = surface()
                        .lock()
                        .map_err(|_| "epic_embed_open:surface-poisoned".to_string())?;
                    let challenged = guard.visibility.challenged();
                    if challenged {
                        guard.visibility.set_challenged(false);
                    }
                    let load = challenged || current_url.as_deref() != Some(url_string.as_str());
                    if load {
                        guard.last_requested_url = Some(url_string.clone());
                    }
                    (load, guard.visibility.open())
                };
                apply_visibility(webview, hidden);
                if load {
                    let request = NSURLRequest::requestWithURL(&nsurl);
                    unsafe {
                        webview.loadRequest(&request);
                    }
                }
                let event = nav_state_json(webview);
                let mut guard = surface()
                    .lock()
                    .map_err(|_| "epic_embed_open:surface-poisoned".to_string())?;
                guard.enqueue_nav_event(event);
                return Ok(());
            }

            // Cold path: build the subview from scratch.
            let config = unsafe { WKWebViewConfiguration::new(mtm) };
            // Shared process-wide jar (L-3 locked decision) -- deliberately NOT
            // `nonPersistentDataStore` (spike-only, forbidden in production).
            let data_store = unsafe { WKWebsiteDataStore::defaultDataStore(mtm) };
            unsafe {
                config.setWebsiteDataStore(&data_store);
            }
            let webview: Retained<WKWebView> =
                unsafe { WKWebView::initWithFrame_configuration(mtm.alloc(), frame, &config) };
            webview.setAutoresizingMask(top_pinned_autoresizing_mask(ns_view.isFlipped()));

            // [ASSUMED] (D-06, RESEARCH.md Assumptions Log A1): key-value coding with the
            // drawing-background key set to a boxed `false` is standard, long-documented Apple
            // KVC usage for making a WKWebView paint transparently so the styled placeholder
            // shows through the slot until Epic's own page paints -- but it has NO in-repo
            // precedent and `objc2-web-kit` exposes no typed method for it, so this reaches
            // `objc2`'s raw `msg_send!` instead. If the key name or value type is wrong, this
            // call SILENTLY NO-OPS rather than erroring, leaving the subview opaque. The live
            // gate's cold-jar arm (plan 06) is the measurement for this, not a test; a no-op
            // there should produce a todo recording the measurement, never a first-paint-signal
            // mechanism, which D-06 already rules out as unnecessary.
            unsafe {
                let draws_background_false = NSNumber::new_bool(false);
                let key = NSString::from_str("drawsBackground");
                let _: () = msg_send![&*webview, setValue: &*draws_background_false, forKey: &*key];
            }

            // The delegate's own `AppHandle` clone, for its `WKUIDelegate` popup hook (D-12) --
            // separate from `app_for_monitor` above, which the monitor thread owns instead.
            let delegate = EpicEmbedNavDelegate::new(mtm, app_for_delegate.clone());
            unsafe {
                webview.setNavigationDelegate(Some(ProtocolObject::from_ref(&*delegate)));
            }
            unsafe {
                webview.setUIDelegate(Some(ProtocolObject::from_ref(&*delegate)));
            }

            // The ONLY subview-attach call site in this module.
            ns_view.addSubview(&webview);

            let request = NSURLRequest::requestWithURL(&nsurl);
            unsafe {
                webview.loadRequest(&request);
            }

            let event = nav_state_json(&webview);
            // The one fallible step left after `addSubview` (finding 10): on a poisoned registry
            // detach the subview again rather than leave an unparked orphan on the window.
            let Ok(mut guard) = surface().lock() else {
                webview.removeFromSuperview();
                return Err("epic_embed_open:surface-poisoned".to_string());
            };
            // Park the retained webview/delegate as raw addresses -- released only by `close()`
            // via `Retained::from_raw` (see that function's doc comment).
            let webview_ptr = Retained::into_raw(webview) as *mut c_void;
            let delegate_ptr = Retained::into_raw(delegate) as *mut c_void;
            guard.webview = Some(SendPtr(webview_ptr));
            guard.delegate = Some(SendPtr(delegate_ptr));
            let hidden = guard.visibility.open();
            guard.top_level_host = None;
            // A brand-new `WKWebView` has committed nothing -- write both explicitly rather than
            // leaning on `Default` (quick task 261014-vot).
            guard.last_requested_url = Some(url_string.clone());
            guard.has_committed = false;
            guard.enqueue_nav_event(event);
            drop(guard);
            // SAFETY: both are the `+1`s just parked above; nothing can release them before this
            // same main-thread closure returns, and `close()` removes the observers before it
            // releases either.
            let (webview, delegate) = unsafe {
                (
                    &*(webview_ptr as *const WKWebView),
                    &*(delegate_ptr as *const EpicEmbedNavDelegate),
                )
            };
            // Registered with the surface lock NOT held: a KVO callback runs synchronously inside
            // whichever WebKit call changed the property, and it takes that lock itself.
            add_nav_observers(webview, delegate);
            apply_visibility(webview, hidden);
            // The ONLY `spawn_load_timeout_monitor` call site -- see its own doc comment for why
            // exactly one monitor thread must exist per surface, regardless of navigation count.
            spawn_load_timeout_monitor(app_for_monitor);
            Ok(())
        })();
        let _ = tx.send(result);
    }) {
        return Err(format!("epic_embed_open:dispatch-failed:{e}"));
    }

    match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(Ok(())) => Ok(Value::Null),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("epic_embed_open:main-thread-timeout".to_string()),
    }
}

/// Re-applies a renderer-provided rect to the already-open Epic subview. Named, logged error on
/// every failure path, same discipline as `store_embed_set_bounds` (main.rs).
pub(crate) fn set_bounds(app: &AppHandle, x: f64, y: f64, w: f64, h: f64) -> Result<Value, String> {
    let window = app.get_window(crate::MAIN_WINDOW_LABEL).ok_or_else(|| {
        format!(
            "epic_embed_set_bounds:no-window:{}",
            crate::MAIN_WINDOW_LABEL
        )
    })?;

    let (tx, rx) = mpsc_channel::<Result<(), String>>();
    if let Err(e) = app.run_on_main_thread(move || {
        let result: Result<(), String> = (|| {
            let webview_ptr = surface()
                .lock()
                .map_err(|_| "epic_embed_set_bounds:surface-poisoned".to_string())?
                .webview
                .as_ref()
                .map(|p| p.0)
                .ok_or_else(|| "epic_embed_set_bounds:no-webview".to_string())?;
            // SAFETY: see `open()`'s warm path -- identical reasoning.
            let webview: &WKWebView = unsafe { &*(webview_ptr as *const WKWebView) };

            let ns_view_ptr = window
                .ns_view()
                .map_err(|e| format!("epic_embed_set_bounds:ns_view-failed:{e}"))?;
            // SAFETY: resolved and retained on the main thread -- see `open()`'s doc comment.
            let ns_view: Retained<NSView> = unsafe { Retained::retain(ns_view_ptr as *mut NSView) }
                .ok_or_else(|| "epic_embed_set_bounds:ns_view-null".to_string())?;
            let frame = rect_to_ns_rect(&ns_view, x, y, w, h);
            webview.setFrame(frame);
            Ok(())
        })();
        let _ = tx.send(result);
    }) {
        return Err(format!("epic_embed_set_bounds:dispatch-failed:{e}"));
    }

    match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(Ok(())) => Ok(Value::Null),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("epic_embed_set_bounds:main-thread-timeout".to_string()),
    }
}

/// Shared main-thread marshalling for the four navigation arms below (`back`/`forward`/
/// `reload`/`navigate`) -- identical `mpsc`/`run_on_main_thread`/`recv_timeout` shape to
/// `open()`/`set_bounds()`/`set_hidden()` above, factored out because all four arms do exactly
/// the same three things: resolve the parked webview, run a native navigation call on it, and
/// return the resulting `nav_state_json()` -- merged with the surface's current flags through
/// `epic_nav_state_with_flags`, exactly as `enqueue_nav_event` merges a queued one. Review
/// finding 2: this used to return the bare `nav_state_json()`, which has `surface: "epic"` but
/// none of the flags `coerceNavState` (`storeEmbedFlowRegistration.ts`) requires on an Epic
/// state, so every back/forward/reload/navigate result from this surface reached the renderer
/// as `{ status: 'error' }`. `op` names the caller for the error prefix, same
/// discipline as `set_hidden`'s own `op` parameter. `action` runs ENTIRELY on the main thread,
/// inside the same closure that resolves the webview pointer -- never on the calling (worker)
/// thread -- matching every other main-thread-marshalled call in this module.
fn navigate_webview_on_main_thread(
    app: &AppHandle,
    op: &str,
    action: impl FnOnce(&WKWebView) + Send + 'static,
) -> Result<Value, String> {
    let (tx, rx) = mpsc_channel::<Result<Value, String>>();
    let op_owned = op.to_string();
    if let Err(e) = app.run_on_main_thread(move || {
        let result: Result<Value, String> = (|| {
            let webview_ptr = surface()
                .lock()
                .map_err(|_| format!("{op_owned}:surface-poisoned"))?
                .webview
                .as_ref()
                .map(|p| p.0)
                .ok_or_else(|| format!("{op_owned}:no-webview"))?;
            // SAFETY: see `open()`'s warm path -- identical reasoning.
            let webview: &WKWebView = unsafe { &*(webview_ptr as *const WKWebView) };
            action(webview);
            let state = nav_state_json(webview);
            let flags = surface()
                .lock()
                .map_err(|_| format!("{op_owned}:surface-poisoned"))?
                .nav_flags();
            Ok(epic_nav_state_with_flags(state, flags))
        })();
        let _ = tx.send(result);
    }) {
        return Err(format!("{op}:dispatch-failed:{e}"));
    }

    match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(Ok(json)) => Ok(json),
        Ok(Err(e)) => Err(e),
        Err(_) => Err(format!("{op}:main-thread-timeout")),
    }
}

/// Moves to the previous entry in the native `WKBackForwardList`. A no-op (never an error)
/// returning the CURRENT, unchanged nav state when `canGoBack()` is already `false` -- there is
/// no Rust-side stack to consult, so "nothing to go back to" is read straight off the webview
/// rather than from any local bookkeeping (see this module's own doc comment on why there is no
/// history stack here).
pub(crate) fn back(app: &AppHandle) -> Result<Value, String> {
    navigate_webview_on_main_thread(app, "epic_embed_back", |webview| unsafe {
        if webview.canGoBack() {
            webview.goBack();
        }
    })
}

/// The mirror of `back()` -- see its doc comment for the shared no-op-when-unavailable
/// rationale.
pub(crate) fn forward(app: &AppHandle) -> Result<Value, String> {
    navigate_webview_on_main_thread(app, "epic_embed_forward", |webview| unsafe {
        if webview.canGoForward() {
            webview.goForward();
        }
    })
}

/// Re-issues the webview's current page (quick task 261014-vot). Two branches, decided by
/// `epic_embed_reload_action`: on a surface that has committed at least one main-frame
/// navigation, `WKWebView::reload()` -- byte-for-byte the old behaviour, and the one that must
/// stay unchanged (Launch 3: each Reload click on an already-committed page produced its own
/// `-999` cancellation). On a surface that has never committed, `WKWebView::reload()` is a no-op
/// (WebKit's `FrameLoader::reload` returns early on an empty current-request URL), so this
/// instead re-issues `last_requested_url` via `loadRequest`. Either way, never touches
/// `canGoBack`/`canGoForward` -- a reload must leave the native back/forward list, and therefore
/// the resulting nav state's availability flags, unchanged.
pub(crate) fn reload(app: &AppHandle) -> Result<Value, String> {
    navigate_webview_on_main_thread(app, "epic_embed_reload", |webview| {
        // Read-then-drop: the guard must not still be held when `loadRequest`/`reload` run below
        // -- both fire `didStartProvisionalNavigation` synchronously, which takes this same lock
        // (`navigate()` is the in-module precedent for this exact drop-before-call shape).
        let (has_committed, last_requested_url) = match surface().lock() {
            Ok(guard) => (guard.has_committed, guard.last_requested_url.clone()),
            Err(_) => {
                crate::shell_diag("WARN: macos_epic_embed surface registry poisoned -- continuing");
                (true, None)
            }
        };
        match epic_embed_reload_action(has_committed, last_requested_url.is_some()) {
            EpicEmbedReloadAction::LoadLastRequested => {
                let url_string =
                    last_requested_url.expect("LoadLastRequested implies a last-requested URL");
                match NSURL::URLWithString(&NSString::from_str(&url_string)) {
                    Some(nsurl) => {
                        crate::shell_diag(
                            "macos_epic_embed: reload arrived before the first commit -- \
                             re-issuing the last requested URL",
                        );
                        let request = NSURLRequest::requestWithURL(&nsurl);
                        unsafe {
                            webview.loadRequest(&request);
                        }
                    }
                    None => {
                        crate::shell_diag("macos_epic_embed: reload() given an unparsable URL");
                        unsafe {
                            webview.reload();
                        }
                    }
                }
            }
            EpicEmbedReloadAction::NativeReload => unsafe {
                webview.reload();
            },
        }
    })
}

/// Loads `url` in the Epic subview via `WKWebView::loadRequest()` -- the same
/// `NSURL`/`NSURLRequest` construction `open()` uses for both its cold and warm paths. A second,
/// later `navigate()` call (or any ordinary link click) naturally makes the FIRST page
/// `canGoBack`-reachable once the second one finishes loading -- the native back/forward list
/// does this automatically, with nothing for this function to track.
pub(crate) fn navigate(app: &AppHandle, url: &tauri::Url) -> Result<Value, String> {
    let url_string = url.to_string();
    navigate_webview_on_main_thread(app, "epic_embed_navigate", move |webview| {
        let Some(nsurl) = NSURL::URLWithString(&NSString::from_str(&url_string)) else {
            crate::shell_diag("macos_epic_embed: navigate() given an unparsable URL");
            return;
        };
        // D-11: every navigate() call starts fresh -- a challenge banner from the PREVIOUS page
        // must not survive a `Try again`/new-URL load. Mirrors
        // `did_start_provisional_navigation`'s own clear, for the page-initiated-navigation case
        // this chrome-initiated one does not otherwise go through.
        // Clearing it also un-hides the subview the challenge hid (D-10's "Try again ... shows
        // it"), through the same derived visibility every other writer uses (review finding 7).
        match surface().lock() {
            Ok(mut guard) => {
                guard.last_requested_url = Some(url_string.clone());
                let hidden = guard.visibility.set_challenged(false);
                drop(guard);
                apply_visibility(webview, hidden);
            }
            Err(_) => {
                crate::shell_diag("WARN: macos_epic_embed surface registry poisoned -- continuing")
            }
        }
        let request = NSURLRequest::requestWithURL(&nsurl);
        unsafe {
            webview.loadRequest(&request);
        }
    })
}

/// Shared `hide`/`show` implementation -- `op` names the caller for the error prefix, mirroring
/// `store_embed_hide`/`store_embed_show`'s (main.rs) separate named-error discipline without
/// duplicating the whole dispatch body twice. `user_hidden` is the RENDERER's request only: the
/// applied flag is `EpicEmbedVisibility`'s derived answer, so `show()` cannot reveal a page the
/// challenge hook hid (review finding 5, D-10).
fn set_hidden(app: &AppHandle, user_hidden: bool, op: &str) -> Result<Value, String> {
    let (tx, rx) = mpsc_channel::<Result<(), String>>();
    let op_owned = op.to_string();
    if let Err(e) = app.run_on_main_thread(move || {
        let result: Result<(), String> = (|| {
            let (webview_ptr, hidden) = {
                let mut guard = surface()
                    .lock()
                    .map_err(|_| format!("{op_owned}:surface-poisoned"))?;
                let webview_ptr = guard
                    .webview
                    .as_ref()
                    .map(|p| p.0)
                    .ok_or_else(|| format!("{op_owned}:no-webview"))?;
                let hidden = if user_hidden {
                    guard.visibility.hide()
                } else {
                    guard.visibility.show()
                };
                (webview_ptr, hidden)
            };
            // SAFETY: see `open()`'s warm path -- identical reasoning.
            let webview: &WKWebView = unsafe { &*(webview_ptr as *const WKWebView) };
            apply_visibility(webview, hidden);
            Ok(())
        })();
        let _ = tx.send(result);
    }) {
        return Err(format!("{op}:dispatch-failed:{e}"));
    }

    match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(Ok(())) => Ok(Value::Null),
        Ok(Err(e)) => Err(e),
        Err(_) => Err(format!("{op}:main-thread-timeout")),
    }
}

pub(crate) fn hide(app: &AppHandle) -> Result<Value, String> {
    set_hidden(app, true, "epic_embed_hide")
}

pub(crate) fn show(app: &AppHandle) -> Result<Value, String> {
    set_hidden(app, false, "epic_embed_show")
}

/// Removes the Epic subview from the view hierarchy and releases its retained webview and
/// delegate. Called unconditionally on app teardown (`store_embed_close`'s macOS arm falls
/// through to the existing Tauri-embed close body rather than returning early, so BOTH surfaces
/// get torn down) and whenever the user explicitly closes the store embed while Epic is selected.
///
/// **Release mechanics**: `Retained::from_raw` (objc2-0.6.4 `src/rc/retained.rs:215`)
/// reconstructs ownership of the exact `+1` retain `open()`'s cold path parked via
/// `Retained::into_raw` (`:257`) -- `.take()` on the surface's `Option<SendPtr>` fields means this
/// is the ONLY place that can ever reconstruct that ownership, so it exactly balances the single
/// retain with a single release (`impl Drop for Retained<T>`, `:740`). The webview is removed from
/// its superview BEFORE being dropped (while still a valid reference) rather than relying on
/// `Drop` to also handle view-hierarchy teardown. The delegate's `setNavigationDelegate` is a WEAK
/// property (see `EpicPristineNavDelegate`'s own module doc comment on this exact objc2-web-kit
/// binding, main.rs), so this retained handle is the delegate's ONLY strong reference and dropping
/// it here is the real deallocation, not a double-free of some second owner.
pub(crate) fn close(app: &AppHandle) -> Result<Value, String> {
    let (tx, rx) = mpsc_channel::<Result<(), String>>();
    if let Err(e) = app.run_on_main_thread(move || {
        let result: Result<(), String> = (|| {
            let (webview_ptr, delegate_ptr) = {
                let mut guard = surface()
                    .lock()
                    .map_err(|_| "epic_embed_close:surface-poisoned".to_string())?;
                let webview_ptr = guard.webview.take();
                let delegate_ptr = guard.delegate.take();
                guard.visibility.reset();
                guard.top_level_host = None;
                guard.pending_nav_events.clear();
                guard.has_committed = false;
                guard.last_requested_url = None;
                (webview_ptr, delegate_ptr)
            };

            // SAFETY: see this function's doc comment above.
            let webview =
                webview_ptr.and_then(|ptr| unsafe { Retained::from_raw(ptr.0 as *mut WKWebView) });
            // SAFETY: see this function's doc comment above.
            let delegate = delegate_ptr
                .and_then(|ptr| unsafe { Retained::from_raw(ptr.0 as *mut EpicEmbedNavDelegate) });
            if let Some(webview) = webview {
                // Review finding 12: KVO holds the delegate UNRETAINED -- deregister while both
                // are alive, before either is released below.
                if let Some(delegate) = &delegate {
                    remove_nav_observers(&webview, delegate);
                }
                webview.removeFromSuperview();
                drop(webview);
            }
            if let Some(delegate) = delegate {
                drop(delegate);
            }
            Ok(())
        })();
        let _ = tx.send(result);
    }) {
        return Err(format!("epic_embed_close:dispatch-failed:{e}"));
    }

    match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(Ok(())) => Ok(Value::Null),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("epic_embed_close:main-thread-timeout".to_string()),
    }
}

/// Hides and deselects the Epic surface WITHOUT removing the subview -- called by
/// `store_embed_open` (main.rs, D-02) before its existing body runs, for every non-Epic store key,
/// so that switching the store tab away from Epic hides the raw subview underneath the
/// Tauri-managed embed that then opens. A cheap no-op (not an error) when the Epic surface has
/// never been opened -- `store_embed_open` calls this unconditionally on EVERY non-Epic open,
/// including the very first store any session ever opens, and that must never surface an error.
///
/// Review finding 13: the selection change and the hide happen in ONE main-thread step. The old
/// shape hid on the main thread and then wrote `selected = false` back on the calling worker
/// thread, so an Epic `open()` landing in between was left visible but marked unselected -- and
/// every later hide/show/set_bounds then routed to the Tauri embed instead. Whether the surface
/// is selected is decided inside the closure, never from a worker-thread pre-check.
pub(crate) fn deselect(app: &AppHandle) -> Result<Value, String> {
    // The only worker-thread shortcut: a surface that has never been opened has nothing to hide,
    // so the common non-Epic open pays no main-thread hop. Fails closed (no-op) on a poisoned
    // lock, matching `is_selected()`.
    if !surface()
        .lock()
        .map(|g| g.webview.is_some())
        .unwrap_or(false)
    {
        return Ok(Value::Null);
    }
    let (tx, rx) = mpsc_channel::<Result<(), String>>();
    if let Err(e) = app.run_on_main_thread(move || {
        let result: Result<(), String> = (|| {
            let (webview_ptr, hidden) = {
                let mut guard = surface()
                    .lock()
                    .map_err(|_| "epic_embed_deselect:surface-poisoned".to_string())?;
                let Some(hidden) = guard.visibility.deselect() else {
                    return Ok(());
                };
                guard.pending_nav_events.clear();
                (guard.webview.as_ref().map(|p| p.0), hidden)
            };
            if let Some(ptr) = webview_ptr {
                // SAFETY: see `open()`'s warm path -- identical reasoning.
                apply_visibility(unsafe { &*(ptr as *const WKWebView) }, hidden);
            }
            Ok(())
        })();
        let _ = tx.send(result);
    }) {
        return Err(format!("epic_embed_deselect:dispatch-failed:{e}"));
    }

    match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(Ok(())) => Ok(Value::Null),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("epic_embed_deselect:main-thread-timeout".to_string()),
    }
}

/// Disposition returned by `surface_for_store_key` -- which surface (D-02) should serve a given
/// `storeKey` on macOS. Follows `store_embed_navigation_policy`'s (main.rs) precedent exactly:
/// pure, side-effect-free, named, and unit-tested, because the real `AppHandle` plumbing around
/// it (constructing a live `AppHandle` in a `#[test]`) cannot be.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum EpicEmbedSurfaceSelection {
    /// The raw `WKWebView` surface this module owns.
    EpicSurface,
    /// The existing Tauri-managed `add_child` embed (`store_embed_open`'s own body, main.rs).
    TauriEmbed,
}

/// Factored out of `store_embed_open`'s (main.rs) former inline `store_key ==
/// EPIC_EMBED_STORE_KEY` comparison (Phase 50 Plan 01, Task 2) so the routing decision is a named,
/// pure, unit-tested function rather than an unexercised `if` the caller's own tests cannot reach
/// without an `AppHandle`. Takes a bare `&str`, not a `&AppHandle` or any wrapper -- the decision
/// depends on nothing else.
pub(crate) fn surface_for_store_key(store_key: &str) -> EpicEmbedSurfaceSelection {
    if store_key == EPIC_EMBED_STORE_KEY {
        EpicEmbedSurfaceSelection::EpicSurface
    } else {
        EpicEmbedSurfaceSelection::TauriEmbed
    }
}

#[cfg(test)]
mod surface_for_store_key_tests {
    use super::*;

    #[test]
    fn epic_key_routes_to_the_epic_surface() {
        assert_eq!(
            surface_for_store_key(EPIC_EMBED_STORE_KEY),
            EpicEmbedSurfaceSelection::EpicSurface
        );
    }

    #[test]
    fn every_other_configured_store_key_routes_to_the_tauri_embed() {
        for key in ["gog", "amazon", "steam", "humble"] {
            assert_eq!(
                surface_for_store_key(key),
                EpicEmbedSurfaceSelection::TauriEmbed,
                "store key: {key}"
            );
        }
    }

    #[test]
    fn empty_key_routes_to_the_tauri_embed() {
        assert_eq!(
            surface_for_store_key(""),
            EpicEmbedSurfaceSelection::TauriEmbed
        );
    }

    #[test]
    fn unrecognised_key_routes_to_the_tauri_embed() {
        assert_eq!(
            surface_for_store_key("totally-unconfigured-store"),
            EpicEmbedSurfaceSelection::TauriEmbed
        );
    }
}

/// Drains and returns the Epic surface's queued nav-state events. No `AppHandle` needed --
/// mirrors `store_embed_take_nav_events`'s (main.rs) own `AppHandle`-free shape. Surfaces a
/// poisoned lock as an error rather than silently returning an empty array, matching that
/// function's asymmetric-from-push discipline (the push paths above log-and-continue on a
/// poisoned lock; draining is the one place silence would hide dropped events from the caller).
pub(crate) fn take_nav_events() -> Result<Value, String> {
    let mut guard = surface()
        .lock()
        .map_err(|_| "epic_embed_take_nav_events:surface-poisoned".to_string())?;
    Ok(Value::Array(std::mem::take(&mut guard.pending_nav_events)))
}

#[cfg(test)]
mod epic_embed_enqueue_nav_event_tests {
    use super::*;

    // RED (Phase 50 Plan 02, Task 1): `EpicEmbedSurface::enqueue_nav_event` does not exist yet --
    // `enqueue_event` below is still a free function taking `&mut EpicEmbedSurface`, matching the
    // plan's OLDER naming. This test (and the module's own call sites) is written against the
    // plan's literal target shape -- a method on the struct -- so it fails to compile until the
    // GREEN commit restructures `enqueue_event` into `EpicEmbedSurface::enqueue_nav_event`.
    #[test]
    fn epic_embed_drops_the_oldest_entry_once_the_cap_is_exceeded() {
        let mut surface_state = EpicEmbedSurface::default();
        for i in 0..(EPIC_EMBED_NAV_EVENTS_CAP + 5) {
            surface_state.enqueue_nav_event(serde_json::json!({ "i": i }));
        }
        assert_eq!(
            surface_state.pending_nav_events.len(),
            EPIC_EMBED_NAV_EVENTS_CAP
        );
        // The oldest 5 entries (i = 0..=4) were dropped -- the remaining window starts at 5 and
        // ends at cap + 4, proving the NEWEST entry always survives.
        assert_eq!(surface_state.pending_nav_events.first().unwrap()["i"], 5);
        assert_eq!(
            surface_state.pending_nav_events.last().unwrap()["i"],
            EPIC_EMBED_NAV_EVENTS_CAP + 4
        );
    }
}

#[cfg(test)]
mod epic_embed_take_nav_events_tests {
    use super::*;

    #[test]
    fn epic_embed_a_second_drain_with_no_navigation_in_between_returns_empty_without_erroring() {
        {
            let mut guard = surface().lock().expect("surface lock");
            guard.pending_nav_events.clear();
            guard.enqueue_nav_event(serde_json::json!({ "url": "https://store.epicgames.com/" }));
        }

        let first = take_nav_events().expect("first drain succeeds");
        assert_eq!(
            first.as_array().expect("result is an array").len(),
            1,
            "first drain returns the one queued event"
        );

        // Idle drain: nothing navigated between the two calls. An empty array is the healthy
        // idle state, not an error -- `take_nav_events` must not fail just because the queue
        // happens to be empty.
        let second = take_nav_events().expect("second drain succeeds without erroring");
        assert_eq!(
            second.as_array().expect("result is an array").len(),
            0,
            "idle drain returns an empty array, never an error"
        );
    }
}
