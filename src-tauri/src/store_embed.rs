use super::*;

// ---- In-app store/wiki embed (Phase 40 Plan 02, D-01/D-03/D-17/D-18/D-21) ----
//
// A single child webview, created via the `unstable`-gated child-window constructor (see the
// one call site inside `store_embed_open` below) on the existing config-created `main` window
// (no window restructuring on macOS -- D-01). Every symbol below is macOS + Linux + Windows only
// per D-03's target-gated `unstable` feature (`src-tauri/Cargo.toml`: a macOS table, since quick
// 260930-blh a Linux table, and since quick 261012-f25 a Windows table); on Linux the layout is
// the application's own gtk Overlay/Fixed (`linux_store_embed_layout`, todo decision (a), spikes
// 028/029). Windows uses the macOS positioning path (`set_position`/`set_size`): spike 027 found
// WebView2 child webviews are real `WS_CHILD` HWNDs positioned by an unconditional
// `SetWindowPos`. A target outside those three gets a legible `:unsupported-platform` error from
// the dispatch arms below rather than compiling this section out silently (a silently-absent
// arm is indistinguishable from a dead channel); no shipped target compiles those arms.
//
// The API surface this section is written against was verified from vendored crate source, not
// documentation, in `40-EMBED-API-VERIFICATION.md` (D-25) -- most importantly: neither
// `tauri::webview::Webview` nor wry's `WebView` expose any back/forward/history method, so the
// `StoreEmbedState` history stack below (D-22) is the mechanism, not a fallback.

/// Fixed, non-`main`, non-`about` label for the store/wiki embed child webview (T-40-02-02:
/// never derived from a caller-supplied URL).
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub(crate) const STORE_EMBED_LABEL: &str = "store-embed";

/// Chrome UA sent by the store/wiki embed's child webview (D-17). MAINTAINED VALUE: this must
/// be a real, currently-shipping Chrome version, reviewed periodically -- NOT a synthetic
/// placeholder like `Chrome/200.0`, which does not exist and reads as obviously fake to any
/// store/wiki origin doing UA sniffing. Reviewed: 2026-09-04. Matches the `Chrome/142.0`
/// convention already used by this file's own reveal/clear-storage test fixtures
/// (`valid_reveal_args`/`valid_clear_storage_args`).
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
const STORE_EMBED_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
     AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

/// Per-drain cap on `StoreEmbedState::pending_nav_events`, oldest-dropped past this bound.
/// Mirrors `LOGIN_WINDOW_EVENTS_CAP` and its T-34.4.1-09 rationale exactly: a page that
/// navigates in a loop must not grow the queue without bound between
/// `store_embed_take_nav_events` drains. Oldest-dropped rather than newest-dropped because the
/// renderer only ever applies the LAST event -- discarding the freshest state to preserve a
/// stale one would defeat the drain entirely.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub(crate) const STORE_EMBED_NAV_EVENTS_CAP: usize = 50;

/// How long after a chrome-initiated navigation LANDS (back/forward/reload/navigate -- a
/// suppressed Finished) a new URL from the page is read as the page rewriting its own URL
/// rather than a user navigation, replacing the current history entry in place (quick
/// 261102-szs). luna.amazon.com's SPA rewrites its URL on boot after every full reload (live
/// 2026-11-02: 18 `recorded` steps for 18 Back presses, Back never disabling). The nav drain
/// polls every 250 ms; 3 s covers a slow boot while keeping short the window in which a
/// genuine user click is mis-read.
///
/// Trade-off: a real click within the window after a Back/Forward/Reload landing replaces the
/// current entry instead of adding a Back step. Limit: a boot rewrite slower than this still
/// adds a step -- the `recorded` diagnostic right after a Back shows it; tune this then.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub(crate) const STORE_EMBED_LANDING_SETTLE: Duration = Duration::from_secs(3);

/// What a history change did, for the shell diagnostic (host-only logging, D-23).
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum StoreEmbedHistoryChange {
    Recorded,
    Replaced,
    Moved,
}

#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
impl StoreEmbedHistoryChange {
    fn as_str(self) -> &'static str {
        match self {
            Self::Recorded => "recorded",
            Self::Replaced => "replaced",
            Self::Moved => "moved",
        }
    }
}

/// Ordered main-frame URL history for the store/wiki embed (D-22). Neither
/// `tauri::webview::Webview` nor wry's `WebView` expose a back/forward/history API
/// (`40-EMBED-API-VERIFICATION.md` Q1/Q2), so this Rust-side stack is the mechanism. Pure
/// bookkeeping behind one `Mutex`, same shape as `WakeLockRegistry` above: `on_page_load`
/// (main-frame-only, verified Q4) pushes; `store_embed_close` clears.
///
/// Phase 40 Plan 07 (D-22, T-40-07-05) adds cursor semantics on top of Plan 02's shipped
/// push/clear: `store_embed_back`/`forward`/`reload`/`navigate` below drive the cursor and this
/// registry through the one-shot `suppress_next_push` flag documented on `push()`.
///
/// GAP-D (quick task `260905-e61`, REQ-40-06) adds `pending_nav_events`. Until it existed the
/// inversion was HALF-BUILT: `on_page_load` mutated the cursor here and emitted nothing, so an
/// in-embed link click moved Rust's `can_go_back()` to true while the renderer's stayed false
/// forever -- Back greyed out, host label frozen at the START URL's host (most visible on
/// `/store/gog`, which starts on `af.gog.com` and lands on `www.gog.com`). The queue lives
/// INSIDE this struct, behind the same one `Mutex`, deliberately: an outboard queue would be a
/// second source of truth for a cursor position this struct already owns.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
#[derive(Default)]
pub(crate) struct StoreEmbedState {
    pub(crate) history: Vec<String>,
    pub(crate) cursor: usize,
    /// Navigation states awaiting a `store_embed_take_nav_events` drain, oldest first, capped
    /// at `STORE_EMBED_NAV_EVENTS_CAP`. Filled ONLY by a real (non-suppressed) `push()` -- see
    /// `enqueue_nav_event()` for why a suppressed push must enqueue nothing.
    pending_nav_events: Vec<Value>,
    /// One-shot flag (T-40-07-05): armed immediately before a history-driven navigation
    /// (`store_embed_back`/`forward`/`reload`) issues its `navigate()`/`reload()` call, and
    /// consumed by the very next `push()` -- the `on_page_load` Finished event that navigation
    /// itself produces. Without this, every back/forward/reload would re-push the URL it just
    /// navigated to as a NEW entry, so the stack would grow unboundedly while never actually
    /// moving backward -- exactly the append-instead-of-move defect this flag exists to
    /// prevent (see the failing-before-the-flag test below). A user-initiated navigation (a
    /// link clicked inside the embed, or `store_embed_navigate`) leaves this false, so it
    /// pushes normally.
    pub(crate) suppress_next_push: bool,
    /// The `storeKey` whose pages `history` holds (quick 261030-ts4). Steam, GOG and Amazon
    /// share this one reused webview, and a store switch only `navigate()`s it, so without this
    /// Back on `/store/gog` walked into the Amazon pages visited before the switch (live
    /// 2026-10-30). `select_store()` swaps histories when the key changes.
    store_key: Option<String>,
    /// Each other store's `(history, cursor)`, parked by `select_store()` while that store is
    /// not showing, so a return to it resumes its own Back history. Dropping it instead left
    /// Back greyed out on a store reopened at its remembered game page (live 2026-10-30).
    parked: HashMap<String, (Vec<String>, usize)>,
    /// True between an `on_page_load` Started and the next Finished `push()` (quick
    /// 261102-sk8). While set, `observe_live_url` records nothing: full loads are recorded by
    /// Finished, and a mid-load URL read can be a server-redirect intermediate.
    page_loading: bool,
    /// Bumped by every event that could invalidate a live-URL read taken before the state lock
    /// (page load start/finish, chrome back/forward/reload, store swap, close). The drain
    /// snapshots it, reads the URL lock-free, and `observe_live_url` discards the read if the
    /// generation moved in between.
    nav_generation: u64,
    /// End of the post-landing settle window (quick 261102-szs): stamped when a SUPPRESSED
    /// Finished (the landing of a chrome back/forward/reload/navigate) is seen by `push_at`.
    /// While `now < settle_until`, a new URL replaces `history[cursor]` instead of appending
    /// or moving. Never extended by a replace. The window does NOT follow a store's first load:
    /// that Finished is a non-suppressed push, and covering it would need a separate open-path
    /// arming flag. Worst case of an initial canonicalization rewrite is one extra Back step
    /// whose landing is itself settled, so it terminates.
    settle_until: Option<std::time::Instant>,
}

#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
impl StoreEmbedState {
    /// PURE: record a main-frame URL from `on_page_load`, OR consume a one-shot suppression
    /// armed by a history-driven navigation this code itself issued.
    ///
    /// If `suppress_next_push` is set, consumes it and returns without pushing -- the cursor
    /// already reflects the correct position (`go_back`/`go_forward` moved it before
    /// navigating; a reload leaves it untouched). Otherwise this is a genuinely new,
    /// user-initiated navigation: truncate any forward entries beyond the cursor (exactly as a
    /// browser does when you navigate away after going back), then push and move the cursor to
    /// the new last entry.
    ///
    /// A URL equal to the current entry is not appended again (quick 261030-ts4): a store
    /// reopened by `select_store()` loads its remembered page, which is usually the entry its
    /// restored cursor already points at. The event is still queued so the renderer learns the
    /// restored `canGoBack`.
    pub(crate) fn push(&mut self, url: String) {
        self.push_inner(url, None);
    }

    /// PURE: `push` that also drives the post-landing settle window (quick 261102-szs). A
    /// suppressed Finished opens the window; a non-suppressed one inside it replaces the
    /// current entry. Returns the history change, `None` when nothing was recorded.
    pub(crate) fn push_at(&mut self, url: String, now: std::time::Instant) -> Option<StoreEmbedHistoryChange> {
        self.push_inner(url, Some(now))
    }

    fn push_inner(
        &mut self,
        url: String,
        now: Option<std::time::Instant>,
    ) -> Option<StoreEmbedHistoryChange> {
        // A Finished push ends the load in flight even when suppressed.
        self.page_loading = false;
        self.nav_generation = self.nav_generation.wrapping_add(1);
        if self.suppress_next_push {
            self.suppress_next_push = false;
            if let Some(now) = now {
                self.settle_until = Some(now + STORE_EMBED_LANDING_SETTLE);
            }
            return None;
        }
        if self.current_url().as_deref() == Some(url.as_str()) {
            self.enqueue_nav_event();
            return None;
        }
        if self.in_settle_window(now) && !self.history.is_empty() {
            self.replace_current(url);
            return Some(StoreEmbedHistoryChange::Replaced);
        }
        let keep = self.cursor.saturating_add(1).min(self.history.len());
        self.history.truncate(keep);
        self.history.push(url);
        self.cursor = self.history.len() - 1;
        // GAP-D: enqueue AFTER the cursor has moved, never before -- the whole value of the
        // event is that its `canGoBack`/`canGoForward` are the post-navigation cursor's, the
        // same derivation every other arm reports.
        self.enqueue_nav_event();
        Some(StoreEmbedHistoryChange::Recorded)
    }

    /// PURE: whether `now` falls inside the post-landing settle window.
    fn in_settle_window(&self, now: Option<std::time::Instant>) -> bool {
        match (now, self.settle_until) {
            (Some(now), Some(until)) => now < until,
            _ => false,
        }
    }

    /// PURE: replaces `history[cursor]` with `url`, collapsing an adjacent duplicate this
    /// creates, then queues a nav event. On luna the rewrite target is usually the very entry
    /// Back just left, so without the collapse Back would walk through identical-looking
    /// duplicates.
    fn replace_current(&mut self, url: String) {
        self.history[self.cursor] = url;
        let current = self.history[self.cursor].clone();
        if self.history.get(self.cursor + 1) == Some(&current) {
            self.history.remove(self.cursor + 1);
        } else if self.cursor > 0 && self.history.get(self.cursor - 1) == Some(&current) {
            self.history.remove(self.cursor);
            self.cursor -= 1;
        }
        self.enqueue_nav_event();
    }

    /// PURE: marks a main-frame page load as in flight (`on_page_load` Started). Cleared by the
    /// next `push()`.
    pub(crate) fn begin_page_load(&mut self) {
        self.page_loading = true;
        self.nav_generation = self.nav_generation.wrapping_add(1);
    }

    /// PURE: the current navigation generation; see the `nav_generation` field.
    pub(crate) fn nav_generation(&self) -> u64 {
        self.nav_generation
    }

    /// PURE: decides whether `live_url` -- the embed's current URL as read from the native
    /// `Webview::url()` (never page-side JS; D-22/D-25 unchanged) -- is a same-document
    /// navigation worth recording, and records it. Returns whether state changed.
    ///
    /// Why: gaming.amazon.com changes views via `history.pushState`, which fires no page load,
    /// so the Finished-only `push()` never saw them and Back stayed disabled (live 2026-11-02,
    /// quick 261102-sk8).
    ///
    /// No-op (false, nothing queued) when: `observed_generation` is stale; a chrome-initiated
    /// back/forward/reload is in flight (`suppress_next_push`; a mid-back read would see the
    /// pre-navigation URL and truncate forward history); a page load is in flight; history is
    /// empty; the URL equals the current entry; either URL fails to parse; or the origins
    /// differ (a same-document navigation cannot change origin). Otherwise: a URL equal to the
    /// previous/next entry moves the cursor (page-initiated back/forward); a URL differing only
    /// in query/fragment replaces the current entry in place; anything else is pushed.
    ///
    /// Known limits: (a) a pushState changing only query/fragment is treated as a replace, so
    /// filter-style pushes create no Back steps -- chosen because tracking-param `replaceState`
    /// on load would otherwise insert a duplicate-looking entry and make Back ping-pong; (b) a
    /// path-changing `replaceState` is indistinguishable from pushState and adds an entry; (c)
    /// a page-initiated back to a URL equal to the previous entry moves the cursor, so a
    /// pushState to that same URL is also read as back -- harmless (Forward stays available);
    /// (d) detection lags by up to one nav poll (250 ms).
    ///
    /// Settle window (quick 261102-szs, `observe_live_url_at`): within
    /// `STORE_EMBED_LANDING_SETTLE` of a chrome navigation's landing, any new same-origin URL
    /// replaces the current entry in place instead of moving/appending. Live 2026-11-02: Back =
    /// full reload of luna.amazon.com, which `pushState`s to another path on boot; that
    /// rewrite equalled the next entry, so it moved the cursor forward again and Back looped
    /// 18 times. This legacy entry point never consults the window.
    pub(crate) fn observe_live_url(&mut self, live_url: &str, observed_generation: u64) -> bool {
        self.observe_inner(live_url, observed_generation, None)
            .is_some()
    }

    /// PURE: `observe_live_url` with the settle window; see its doc comment.
    pub(crate) fn observe_live_url_at(
        &mut self,
        live_url: &str,
        observed_generation: u64,
        now: std::time::Instant,
    ) -> Option<StoreEmbedHistoryChange> {
        self.observe_inner(live_url, observed_generation, Some(now))
    }

    fn observe_inner(
        &mut self,
        live_url: &str,
        observed_generation: u64,
        now: Option<std::time::Instant>,
    ) -> Option<StoreEmbedHistoryChange> {
        if observed_generation != self.nav_generation
            || self.suppress_next_push
            || self.page_loading
        {
            return None;
        }
        let current = self.current_url()?;
        if current == live_url {
            return None;
        }
        let (Ok(live), Ok(cur)) = (tauri::Url::parse(live_url), tauri::Url::parse(&current)) else {
            return None;
        };
        if live.origin() != cur.origin() {
            return None;
        }
        if self.in_settle_window(now) {
            self.replace_current(live_url.to_string());
            return Some(StoreEmbedHistoryChange::Replaced);
        }
        if self.cursor > 0
            && self.history.get(self.cursor - 1).map(String::as_str) == Some(live_url)
        {
            self.cursor -= 1;
            self.enqueue_nav_event();
            return Some(StoreEmbedHistoryChange::Moved);
        }
        if self.history.get(self.cursor + 1).map(String::as_str) == Some(live_url) {
            self.cursor += 1;
            self.enqueue_nav_event();
            return Some(StoreEmbedHistoryChange::Moved);
        }
        if live.path() == cur.path() {
            self.history[self.cursor] = live_url.to_string();
            self.enqueue_nav_event();
            return Some(StoreEmbedHistoryChange::Replaced);
        }
        self.push_inner(live_url.to_string(), None);
        Some(StoreEmbedHistoryChange::Recorded)
    }

    /// PURE: snapshots the current navigation state onto the drain queue (GAP-D, REQ-40-06),
    /// capped at `STORE_EMBED_NAV_EVENTS_CAP` with oldest-dropped.
    ///
    /// Called from `push()`'s non-suppressed path ONLY. A SUPPRESSED push is the confirming
    /// `on_page_load` Finished event of a back/forward/reload this process itself issued, and
    /// that caller already received the identical state as its arm's return value -- queueing
    /// it again would hand the renderer a second copy of state it has already applied. The
    /// early `return` in `push()` above is what enforces that, so this method is never reached
    /// on the suppressed path.
    fn enqueue_nav_event(&mut self) {
        let event = store_embed_nav_state_json(self);
        self.pending_nav_events.push(event);
        if self.pending_nav_events.len() > STORE_EMBED_NAV_EVENTS_CAP {
            self.pending_nav_events.remove(0);
        }
    }

    /// PURE: DRAINS (never merely reads) the queued navigation states -- the same
    /// drain-not-peek contract `humble_login_take_events` promises the sidecar. A second call
    /// with no navigation in between returns empty, which is a healthy idle state.
    pub(crate) fn take_nav_events(&mut self) -> Vec<Value> {
        std::mem::take(&mut self.pending_nav_events)
    }

    /// PURE: drop all recorded history. Called on `store_embed_close` (D-21 teardown).
    pub(crate) fn clear(&mut self) {
        self.history.clear();
        self.cursor = 0;
        self.suppress_next_push = false;
        self.settle_until = None;
        self.page_loading = false;
        self.nav_generation = self.nav_generation.wrapping_add(1);
        // D-21: a teardown must not leave events describing a history that no longer exists --
        // the next embed would drain them and render another session's host in its chrome.
        self.pending_nav_events.clear();
        self.store_key = None;
        self.parked.clear();
    }

    /// PURE: called by `store_embed_open` before it loads `store_key`'s URL. On a store switch,
    /// parks the outgoing store's history and restores the incoming store's (empty on its first
    /// visit), so Back never crosses into another store's pages yet still works on a store
    /// reopened mid-history. Reopening the same store changes nothing. Returns whether the
    /// histories were swapped.
    pub(crate) fn select_store(&mut self, store_key: &str) -> bool {
        if self.store_key.as_deref() == Some(store_key) {
            return false;
        }
        let outgoing = (std::mem::take(&mut self.history), self.cursor);
        if let Some(previous) = self.store_key.take() {
            if !outgoing.0.is_empty() {
                self.parked.insert(previous, outgoing);
            }
        }
        let (history, cursor) = self.parked.remove(store_key).unwrap_or_default();
        self.history = history;
        self.cursor = cursor;
        self.suppress_next_push = false;
        self.settle_until = None;
        self.page_loading = false;
        self.nav_generation = self.nav_generation.wrapping_add(1);
        // Queued events describe the outgoing store; the incoming page's push queues its own.
        self.pending_nav_events.clear();
        self.store_key = Some(store_key.to_string());
        true
    }

    /// PURE: called by `store_embed_open` after `select_store()`, before `url` loads.
    ///
    /// A store with no history yet that opens at a page other than its home (the last-URL
    /// restore reopens it at its remembered game page) gets `home_url` as the entry beneath, so
    /// Back reaches the store's home and stops there (quick 261031, live 2026-10-31: Steam
    /// opened at its remembered game page with Back greyed). The page's own Finished push then
    /// lands on top of it.
    ///
    /// A store reopened on the entry its history already points at reports that state now, not
    /// after the page finishes loading, so the restored Back shows without the 1-2 s load wait.
    pub(crate) fn prepare_open(&mut self, url: &str, home_url: Option<&str>) {
        if self.history.is_empty() {
            if let Some(home) = home_url.filter(|home| *home != url) {
                self.history.push(home.to_string());
                self.cursor = 0;
            }
            return;
        }
        if self.current_url().as_deref() == Some(url) {
            self.enqueue_nav_event();
        }
    }

    /// PURE: derived from the cursor, never stored as an independent flag that could drift
    /// (Task 1 acceptance criteria).
    pub(crate) fn can_go_back(&self) -> bool {
        self.cursor > 0
    }

    /// PURE: derived from the cursor, never stored as an independent flag that could drift.
    pub(crate) fn can_go_forward(&self) -> bool {
        !self.history.is_empty() && self.cursor + 1 < self.history.len()
    }

    /// PURE: moves the cursor back one entry and arms the one-shot suppression flag. Returns
    /// the URL to navigate to, or `None` if already at the oldest entry (the caller must not
    /// call `navigate()` in that case).
    pub(crate) fn go_back(&mut self) -> Option<String> {
        if !self.can_go_back() {
            return None;
        }
        self.cursor -= 1;
        self.suppress_next_push = true;
        self.settle_until = None;
        self.nav_generation = self.nav_generation.wrapping_add(1);
        self.history.get(self.cursor).cloned()
    }

    /// PURE: the mirror of `go_back` -- moves the cursor forward one entry and arms the same
    /// one-shot suppression flag.
    pub(crate) fn go_forward(&mut self) -> Option<String> {
        if !self.can_go_forward() {
            return None;
        }
        self.cursor += 1;
        self.suppress_next_push = true;
        self.settle_until = None;
        self.nav_generation = self.nav_generation.wrapping_add(1);
        self.history.get(self.cursor).cloned()
    }

    /// PURE: arms the one-shot suppression flag without moving the cursor -- used by
    /// `store_embed_reload`, which reloads the same URL and must not push a duplicate entry
    /// for it.
    pub(crate) fn arm_reload_suppression(&mut self) {
        self.suppress_next_push = true;
        self.settle_until = None;
        self.nav_generation = self.nav_generation.wrapping_add(1);
    }

    /// PURE: the URL the cursor currently points at, if any.
    pub(crate) fn current_url(&self) -> Option<String> {
        self.history.get(self.cursor).cloned()
    }
}

/// Builds the navigation state JSON every `store_embed_back`/`forward`/`reload`/`navigate` arm
/// returns (D-22/D-23): the current URL, its host (D-23 -- host only, never the full URL with
/// affiliate/session parameters, is the chrome's job to decide but the state must carry `host`
/// for it to use), and back/forward availability DERIVED from the cursor -- there is no handle
/// to synchronously ask, so this state IS the read. Field names match
/// `StoreEmbedNavEvent` (`src/backend/store/storeEmbedSeam.ts`) exactly: `url`, `host`,
/// `canGoBack`, `canGoForward`.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub(crate) fn store_embed_nav_state_json(state: &StoreEmbedState) -> Value {
    let url = state.current_url().unwrap_or_default();
    let host = tauri::Url::parse(&url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_string))
        .unwrap_or_default();
    serde_json::json!({
        "url": url,
        "host": host,
        "canGoBack": state.can_go_back(),
        "canGoForward": state.can_go_forward(),
    })
}

#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
static STORE_EMBED_STATE: OnceLock<Mutex<StoreEmbedState>> = OnceLock::new();

#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
fn store_embed_state() -> &'static Mutex<StoreEmbedState> {
    STORE_EMBED_STATE.get_or_init(|| Mutex::new(StoreEmbedState::default()))
}

/// Parse `store_embed_open`'s `{ url, x, y, w, h, storeKey }` args. Extracted pure-parse, same
/// discipline as `reveal_post_args`/`clear_storage_args` above: the decision is testable without
/// a window. `storeKey` (Phase 50 Plan 01) is read with the same `.and_then(...).ok_or_else(...)`
/// chain as every other field here -- required, never defaulted -- so `store_embed_open` always
/// knows which store is opening and can route macOS's Epic key to `macos_epic_embed::open`
/// (D-02) before this parse result is used for anything else.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub(crate) fn store_embed_open_args(
    args: &[Value],
) -> Result<(tauri::Url, f64, f64, f64, f64, String, Option<tauri::Url>), String> {
    let a = StoreEmbedOpenArgs::from_args(args)?;
    // Parsed with `tauri::Url`; a parse failure returns a prefixed `Err`, never a fallback URL
    // (T-40-02-01).
    let url = tauri::Url::parse(&a.url).map_err(|e| format!("store_embed_open:bad-url:{e}"))?;
    // Optional (quick 261031): the store's home page, seeded beneath a first open at a remembered
    // page. Absent or null means no seed; present but unparseable is an error, never a fallback.
    let home_url = match a.home_url.as_deref() {
        None => None,
        Some(home_str) => Some(
            tauri::Url::parse(home_str).map_err(|e| format!("store_embed_open:bad-home-url:{e}"))?,
        ),
    };
    Ok((url, a.x, a.y, a.w, a.h, a.store_key, home_url))
}

/// Disposition returned by `store_embed_navigation_policy` (D-29, T-40-04-02/03/09). Kept as an
/// enum rather than a bare `bool` so the `Handoff` case (steam://) is impossible to confuse with
/// plain `Allow` at the call site -- both return `false` to `on_navigation`'s underlying `bool`
/// contract, but only `Handoff` carries the side effect of opening the URL externally.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum StoreEmbedNavigationDecision {
    /// Allow the navigation to proceed inside the embed. Ordinary `http`/`https` (D-28): no
    /// origin allowlist, so store checkout keeps working end to end.
    Allow,
    /// Block the navigation inside the embed. No side effect beyond the log.
    Block,
    /// Block the navigation inside the embed AND hand `url` to the OS via the existing
    /// `open_external` path (steam:// rungameid links reachable from a store page).
    Handoff,
}

/// Named, unit-tested scheme policy for `store_embed_open`'s `on_navigation` hook (D-29,
/// T-40-04-02/03/09), replacing the bare `|_url| true` placeholder plan `40-02` left in place.
///
/// `on_navigation` -- not `on_page_load` -- is the correct hook for this BLOCKER. `on_navigation`
/// fires for every frame including subframes/iframes (`40-EMBED-API-VERIFICATION.md` Q4; spike
/// 013 measured 5 of 8 `on_navigation` events firing for third-party iframes on this exact wry
/// build), which is exactly the coverage a stateless blocker needs: a store page cannot smuggle a
/// `gamelib://` navigation past this policy by hiding it in an iframe. `on_page_load` stays
/// main-frame-only by construction (the WKNavigationDelegate contract) and is reserved for
/// deadline-armed relays that must observe exactly one authoritative main-frame event (the
/// `013-015` rule the login flows above follow) -- it is the wrong hook for a control with no
/// deadline and no need to ignore subframes.
///
/// Pure and side-effect-free so it can be proven by `#[cfg(test)] mod tests` without constructing
/// a `Webview`. The caller (the `on_navigation` closure in `store_embed_open` below) is
/// responsible for the one side effect the `Handoff` variant implies -- calling the existing
/// `open_external` command function directly, never a second, duplicated opener call.
///
/// `steam:` HAND-OFF IS GATED ON THE TOP-LEVEL PAGE, NOT ON THE FRAME (todo 2026-10-05
/// store-embed-hands-off-steam-urls-and-popups-from-any-frame). The ask was "main-frame `steam:`
/// navigations only", but `on_navigation` cannot tell frames apart: tauri 2.11.5's hook is
/// `Fn(&Url) -> bool` and wry 0.55.1's `navigation_handler` is `Fn(String) -> bool` -- no frame,
/// no gesture, no initiator. So the safe behaviour available is: hand `steam:` off only while the
/// embed's top-level page (`top_level_host`, recorded from the main-frame-only `on_page_load`) is
/// a Valve host, where the store's own install/launch buttons live; block it everywhere else,
/// including the default when no page has loaded yet. An iframe embedded IN a Valve page can still
/// trigger a hand-off -- the caller's `STORE_EMBED_STEAM_THROTTLE` caps that at one per
/// `STORE_EMBED_HANDOFF_MIN_GAP`.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub(crate) fn store_embed_navigation_policy(
    url: &tauri::Url,
    top_level_host: Option<&str>,
) -> StoreEmbedNavigationDecision {
    let scheme = url.scheme();
    if scheme == "gamelib" {
        // The sharpest edge in the phase (T-40-04-02): a store page driving the app's own deep
        // link would let it act with the app's own IPC surface. Scheme-only in the log --
        // never the full URL -- matching `open_external_scheme_check`'s T-28-04 convention.
        shell_eprintln!(
            "[shell] store_embed: blocked in-embed navigation to the app's own scheme \
             ('gamelib') -- T-40-04-02"
        );
        return StoreEmbedNavigationDecision::Block;
    }
    if scheme == "http" || scheme == "https" {
        return StoreEmbedNavigationDecision::Allow;
    }
    if scheme == "steam" {
        if top_level_host.is_some_and(store_embed_is_valve_host) {
            return StoreEmbedNavigationDecision::Handoff;
        }
        // Scheme-only in the log, as above -- never the steam: URL itself.
        shell_eprintln!(
            "[shell] store_embed: blocked steam: hand-off -- the top-level page is not a Valve \
             host"
        );
        return StoreEmbedNavigationDecision::Block;
    }
    // Default-deny (T-40-04-03): any scheme outside the enumerated set above, not an allowlist
    // of known-bad schemes. A future store/wiki origin registering some other custom scheme
    // falls here automatically rather than needing a new arm added reactively.
    shell_eprintln!(
        "[shell] store_embed: blocked in-embed navigation to unrecognized scheme '{scheme}'"
    );
    StoreEmbedNavigationDecision::Block
}

/// Whether `host` is Valve's store or community site (or a subdomain of either) -- the pages
/// whose own buttons legitimately produce `steam:` links. Exact apex or a `.`-prefixed suffix,
/// so `evilsteampowered.com` does not match.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
fn store_embed_is_valve_host(host: &str) -> bool {
    ["steampowered.com", "steamcommunity.com"]
        .iter()
        .any(|apex| host == *apex || host.ends_with(&format!(".{apex}")))
}

/// Minimum gap between two hand-offs of the same kind out of the store embed (a `steam:` URL to
/// the Steam client, or a `window.open` popup to the system browser). Neither hook carries a user
/// gesture, so a page -- or an ad frame inside it -- could otherwise fire them in a loop.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
const STORE_EMBED_HANDOFF_MIN_GAP: Duration = Duration::from_secs(2);

/// Admits at most one hand-off per `min_gap`. Pure apart from its own `last` field, so the
/// rate-limit decision is unit-testable with constructed `Instant`s.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
#[derive(Debug, Default)]
pub(crate) struct HandoffThrottle {
    last: Option<std::time::Instant>,
}

#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
impl HandoffThrottle {
    pub(crate) fn admit(&mut self, now: std::time::Instant, min_gap: Duration) -> bool {
        if let Some(last) = self.last {
            if now.saturating_duration_since(last) < min_gap {
                return false;
            }
        }
        self.last = Some(now);
        true
    }
}

/// Label of the single in-app OAuth link popup; a second `window.open` while it is up fails to
/// build (duplicate label) and is denied, which is the cap on stacking.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
const STORE_EMBED_LINK_POPUP_LABEL: &str = "store-embed-link-popup";

/// Builds the in-app popup for an allowlisted OAuth authorize `window.open` (see the
/// `on_new_window` comment). `window_features` carries the opener's webview configuration /
/// environment / related view, so the popup shares the embed's data store and cookies and keeps
/// `window.opener`. A plain titled window, deliberately not a child or sheet: child attachment
/// was measured live-broken on macOS (login-window-ux-macos spike findings, D-C). Navigation is
/// limited to http(s); `window.close()` from the page closes it.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
fn store_embed_open_link_popup(
    app: &AppHandle,
    url: tauri::Url,
    features: tauri::webview::NewWindowFeatures,
) -> Result<tauri::WebviewWindow, String> {
    tauri::WebviewWindowBuilder::new(
        app,
        STORE_EMBED_LINK_POPUP_LABEL,
        tauri::WebviewUrl::External("about:blank".parse().map_err(|e| format!("{e}"))?),
    )
    .window_features(features)
    .user_agent(STORE_EMBED_USER_AGENT)
    .title(format!("Sign in - {}", url.host_str().unwrap_or("")))
    .inner_size(520.0, 700.0)
    .center()
    .on_navigation(|u| matches!(u.scheme(), "https" | "http" | "about"))
    .build()
    .map_err(|e| e.to_string())
}

#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
static STORE_EMBED_STEAM_THROTTLE: Mutex<HandoffThrottle> =
    Mutex::new(HandoffThrottle { last: None });

#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub(crate) static STORE_EMBED_POPUP_THROTTLE: Mutex<HandoffThrottle> =
    Mutex::new(HandoffThrottle { last: None });

/// The embed's current top-level host, recorded from `on_page_load` (main frame only) and read
/// by the `on_navigation` closure for `store_embed_navigation_policy`'s `steam:` gate.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
static STORE_EMBED_TOP_LEVEL_HOST: Mutex<Option<String>> = Mutex::new(None);

/// Take one admission from `throttle`, failing CLOSED on a poisoned lock: a refused hand-off is
/// the safe direction for a gate whose job is to stop unrequested ones.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub(crate) fn store_embed_handoff_admitted(throttle: &Mutex<HandoffThrottle>) -> bool {
    match throttle.lock() {
        Ok(mut guard) => guard.admit(std::time::Instant::now(), STORE_EMBED_HANDOFF_MIN_GAP),
        Err(_) => false,
    }
}

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

/// Parse `store_embed_set_bounds`'s `{ x, y, w, h }` args, all logical px.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub(crate) fn store_embed_set_bounds_args(args: &[Value]) -> Result<(f64, f64, f64, f64), String> {
    let a = StoreEmbedSetBoundsArgs::from_args(args)?;
    Ok((a.x, a.y, a.w, a.h))
}

/// Convert the renderer's logical-px slot rect into the `i32` rect GTK's container API takes.
///
/// GTK's integer API FORCES rounding on Linux (`Fixed::move_` / `set_size_request` take `i32`).
/// This is a Linux-only statement and is NOT a relaxation of D-18's no-rounding rule on macOS,
/// where `set_position`/`set_size` still receive the renderer's `f64` verbatim. `f64::round`
/// rounds half away from zero; spike 026's fractional slot rect (290.5, 96.5, 760.25, 560.75)
/// becomes (291, 97, 760, 561).
///
/// Rejected, each with a named error rather than a clamp or a saturating `as i32`:
/// - non-finite input (`NaN`, infinities);
/// - a value that does not fit in `i32` after rounding;
/// - a negative width or height, because GTK reads `-1` as "unset" and passing it through would
///   silently change the meaning. A negative x/y IS legal (the slot is partly scrolled off, and
///   `GtkFixed` accepts it).
#[cfg(target_os = "linux")]
pub(crate) fn store_embed_linux_gtk_rect(
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<(i32, i32, i32, i32), String> {
    for (name, v) in [("x", x), ("y", y), ("w", w), ("h", h)] {
        if !v.is_finite() {
            return Err(format!("store_embed_set_bounds:non-finite:{name}"));
        }
    }
    let to_i32 = |name: &str, v: f64| -> Result<i32, String> {
        let r = v.round();
        if r < f64::from(i32::MIN) || r > f64::from(i32::MAX) {
            return Err(format!("store_embed_set_bounds:out-of-range:{name}"));
        }
        Ok(r as i32)
    };
    let (xi, yi, wi, hi) = (
        to_i32("x", x)?,
        to_i32("y", y)?,
        to_i32("w", w)?,
        to_i32("h", h)?,
    );
    if wi < 0 || hi < 0 {
        return Err("store_embed_set_bounds:negative-size".to_string());
    }
    Ok((xi, yi, wi, hi))
}

/// True when a slot rect has no area. The renderer's `ResizeObserver` reports `0,0,0x0` when the
/// slot unmounts (a route change, or the Epic panel replacing the slot), and by then the embed is
/// hidden. Applying that rect would park the embed at (0,0) with no usable size, and the next
/// `show()` would draw it over the app chrome (measured live, quick 260930-blh). The Linux branch
/// therefore keeps the last real geometry for a zero-area rect and logs that it did.
#[cfg(target_os = "linux")]
pub(crate) fn store_embed_linux_rect_is_zero_area(rect: (i32, i32, i32, i32)) -> bool {
    rect.2 == 0 || rect.3 == 0
}

/// The macOS sibling of the guard above, on the renderer's `f64` logical rect rather than a
/// converted `i32` one (macOS takes the rect verbatim -- see `store_embed_linux_gtk_rect`'s own
/// note that rounding is a Linux-only consequence of GTK's integer API).
///
/// Since quick 261012-f25 this guard covers Windows too: a 0x0 rect would be applied verbatim by
/// WebView2's `SetWindowPos`, the same hazard measured on macOS. The Windows half is by
/// construction and unmeasured live.
///
/// Measured live on macOS 2026-10-01 (quick 261001-svm), AFTER that task's `show()` fix had
/// already landed: `/store/gog` -> `/store/epic` -> `/store/gog` left the embed invisible even
/// though it was by then being SHOWN. `window.api.storeEmbedShow()` did not bring it back and a
/// bounds flush alone DID, which is what identifies the surviving cause as geometry, not
/// visibility. The Epic panel replaces the slot while the hook stays mounted, so the slot's
/// ResizeObserver reports a final 0x0 rect that this function's caller used to apply verbatim;
/// nothing on macOS re-applies a real rect afterwards, so the embed stayed 0x0 until a genuine
/// window resize. Once in that state even a `/library` round trip stayed blank -- also measured.
///
/// This is the same deliberate deviation from D-18's "apply the oracle's rect verbatim" that the
/// Linux branch took on 2026-09-30, and it carries the same accepted edge: a slot that genuinely
/// collapses to zero area WHILE VISIBLE now keeps its old geometry instead of vanishing. That
/// edge remains unmeasured on both platforms.
/// Non-finite input is folded into the same "not a usable geometry" answer rather than given its
/// own error: Linux rejects `NaN`/infinities during its `i32` conversion, and macOS has no
/// conversion step to reject them in, so this is where they stop. Spelled with `is_finite` and
/// `<=` rather than the shorter `!(w > 0.0)` -- that form also catches `NaN`, but clippy's
/// `neg_cmp_op_on_partial_ord` fires on it twice and the crate's warning ceiling is pinned.
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub(crate) fn store_embed_rect_is_zero_area(w: f64, h: f64) -> bool {
    !w.is_finite() || !h.is_finite() || w <= 0.0 || h <= 0.0
}

/// The one line the Linux layout logs once the embed's geometry has settled. Geometry only --
/// never a URL. `requested` is what the renderer asked for (rounded); `embed` and `main` are the
/// MEASURED GTK allocations (embed relative to main's origin, main relative to the overlay);
/// `vbox` is the measured size of the container holding the overlay. A live run is judged by
/// `check_settled.py` over these lines: embed == requested AND main == (0, 0, vbox_w, vbox_h).
#[cfg(target_os = "linux")]
pub(crate) fn store_embed_linux_settled_line(
    requested: (i32, i32, i32, i32),
    embed: (i32, i32, i32, i32),
    main: (i32, i32, i32, i32),
    vbox: (i32, i32),
) -> String {
    format!(
        "[shell] store_embed(linux): settled requested={},{},{}x{} embed={},{},{}x{} \
         main={},{},{}x{} vbox={}x{}",
        requested.0,
        requested.1,
        requested.2,
        requested.3,
        embed.0,
        embed.1,
        embed.2,
        embed.3,
        main.0,
        main.1,
        main.2,
        main.3,
        vbox.0,
        vbox.1
    )
}

/// D-18: the renderer is the SOLE geometry writer; this arm applies whatever it sends VERBATIM
/// via `set_position`/`set_size` -- no clamping, offsetting, rounding, or default-supplying.
/// Spike 017 measured that two geometry writers silently last-write-wins with no error, so this
/// function is the ONLY place in the Rust tree that may call `Webview::set_position` or
/// `Webview::set_size` on the embed (T-40-02-03). Do not add a second call site, and do not add
/// a "sensible default bounds" fallback here -- that is exactly the second writer D-18 forbids.
///
/// On Linux the sole writer is the `#[cfg(target_os = "linux")]` branch below
/// (`linux_store_embed_layout::apply_bounds`, a `gtk::Fixed::move_` + `set_size_request` +
/// `queue_resize`), plus
/// the one initial `put` in `linux_store_embed_layout::mount` -- mirroring `add_child`'s initial
/// rect on macOS. `Webview::set_position`/`set_size` are never called on Linux: wry's `set_bounds`
/// is a silent no-op there unless the widget's parent is already a fixed container, so calling
/// them would be both dead and a second writer.
///
/// On Windows the sole writer is the same `set_position`/`set_size` pair as macOS (quick
/// 261012-f25). wry's WebView2 `set_bounds` is an unconditional `SetWindowPos` (spike 027 README,
/// step 5), measured at 0 px error at scale 1.25 on the spike harness. It has not yet been
/// measured in the shipped app.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub(crate) fn store_embed_set_bounds(app: &AppHandle, args: &[Value]) -> Result<Value, String> {
    let (x, y, w, h) = store_embed_set_bounds_args(args)?;
    // Phase 50 Plan 01 (D-18): when the Epic surface is selected, it is the sole owner of this
    // rect -- route there and return, rather than also re-applying it to the (hidden) Tauri
    // embed below, which would make `set_bounds` a second geometry writer for whichever surface
    // isn't currently showing.
    #[cfg(target_os = "macos")]
    {
        if macos_epic_embed::is_selected() {
            return macos_epic_embed::set_bounds(app, x, y, w, h);
        }
    }
    #[cfg(target_os = "linux")]
    let linux_rect = store_embed_linux_gtk_rect(x, y, w, h)?;
    let webview = app
        .get_webview(STORE_EMBED_LABEL)
        .ok_or_else(|| format!("store_embed_set_bounds:no-webview:{STORE_EMBED_LABEL}"))?;
    #[cfg(target_os = "linux")]
    {
        if store_embed_linux_rect_is_zero_area(linux_rect) {
            shell_eprintln!(
                "[shell] store_embed(linux): ignored zero-area bounds (slot unmounted); \
                 keeping the last real geometry"
            );
            return Ok(Value::Null);
        }
        linux_store_embed_layout::apply_bounds(&webview, linux_rect)?;
        return Ok(Value::Null);
    }
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        if store_embed_rect_is_zero_area(w, h) {
            shell_eprintln!(
                "[shell] store_embed({}): ignored zero-area bounds (slot unmounted); \
                 keeping the last real geometry",
                std::env::consts::OS
            );
            return Ok(Value::Null);
        }
        store_embed_apply_rect(app, &webview, x, y, w, h)?;
        Ok(Value::Null)
    }
}

/// macOS/Windows: the single `set_position`/`set_size` writer for the Tauri-managed embed (see
/// `store_embed_set_bounds`' doc comment). On macOS `y` gains the visible titlebar's height first
/// (`macos_epic_embed::main_window_content_top_inset`): wry positions a child in the content
/// view, which under `TitleBarStyle::Visible` spans the titlebar the renderer's viewport starts
/// below. The renderer's rect stays the only rect source (D-18); this is a coordinate-space
/// correction, not a fallback rect. Callers have already applied the zero-area guard.
#[cfg(any(target_os = "macos", target_os = "windows"))]
fn store_embed_apply_rect(
    app: &AppHandle,
    webview: &tauri::Webview,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let y = y + macos_epic_embed::main_window_content_top_inset(app)?;
    #[cfg(not(target_os = "macos"))]
    let _ = app;
    webview
        .set_position(tauri::LogicalPosition::new(x, y))
        .map_err(|e| format!("store_embed_set_bounds:set_position-failed:{e}"))?;
    webview
        .set_size(tauri::LogicalSize::new(w, h))
        .map_err(|e| format!("store_embed_set_bounds:set_size-failed:{e}"))?;
    Ok(())
}

/// Linux layout for the store/wiki embed (quick 260930-blh; strategy (a) of
/// `.planning/todos/completed/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md`,
/// spikes 028/029). Public Tauri Linux API plus stock gtk-rs only -- no `tauri-runtime-wry`/wry
/// patch.
///
/// The layout: on the FIRST open, the main webview's widget moves out of the shared
/// `default_vbox()` into an application-created `gtk::Overlay`, packed into the vbox at main's old
/// position with expand/fill. A `gtk::Fixed` is that Overlay's only overlay child
/// (`set_overlay_pass_through(true)`, so clicks outside the embed reach main). The embed webview
/// Tauri packed into the vbox is then moved into that Fixed and positioned with
/// `Fixed::move_` + `set_size_request`. The Fixed is NEVER a vbox sibling of main (spike 029
/// measured main squeezed to 61-125px when it was).
///
/// Every GTK call runs on the GTK main thread through `Webview::with_webview`; the callers are
/// `rustInvoke` workers, so a bounded `recv_timeout` cannot deadlock.
#[cfg(target_os = "linux")]
pub(crate) mod linux_store_embed_layout {
    use super::{store_embed_linux_settled_line, AppHandle, MAIN_WINDOW_LABEL};
    use gtk::prelude::*;
    use std::cell::Cell;
    use std::time::Duration;
    use tauri::Manager;

    const OVERLAY_NAME: &str = "gamelib-store-embed-overlay";
    const FIXED_NAME: &str = "gamelib-store-embed-fixed";
    const GTK_DISPATCH_TIMEOUT: Duration = Duration::from_secs(10);
    const SETTLE_MS: u64 = 500;

    type Rect = (i32, i32, i32, i32);

    thread_local! {
        /// Bumped on every scheduled settled-log; a timer fires only if it is still current, so
        /// sustained motion logs one line per settle rather than one per frame. GTK main thread only.
        static SETTLE_GENERATION: Cell<u64> = const { Cell::new(0) };
    }

    /// Run `f` on the GTK main thread against one webview's widget. `with_webview`'s own `Ok` is
    /// NOT proof the closure ran (the queued closure can be dropped), so the result is awaited
    /// over a channel with a bounded timeout.
    fn on_gtk_thread<T: Send + 'static>(
        webview: &tauri::Webview,
        op: &str,
        f: impl FnOnce(gtk::Widget) -> Result<T, String> + Send + 'static,
    ) -> Result<T, String> {
        let (tx, rx) = std::sync::mpsc::channel();
        webview
            .with_webview(move |pw| {
                let widget: gtk::Widget = pw.inner().upcast();
                let _ = tx.send(f(widget));
            })
            .map_err(|e| format!("{op}:with-webview-failed:{e}"))?;
        rx.recv_timeout(GTK_DISPATCH_TIMEOUT)
            .map_err(|_| format!("{op}:gtk-dispatch-timeout"))?
    }

    fn find_child_named(container: &gtk::Container, name: &str) -> Option<gtk::Widget> {
        container
            .children()
            .into_iter()
            .find(|c| c.widget_name().as_str() == name)
    }

    /// Idempotently restructure the main window's GTK hierarchy: main -> Overlay(main, Fixed).
    pub fn ensure_overlay(app: &AppHandle) -> Result<(), String> {
        let main = app
            .get_webview(MAIN_WINDOW_LABEL)
            .ok_or_else(|| format!("store_embed_open:no-webview:{MAIN_WINDOW_LABEL}"))?;
        let app2 = app.clone();
        on_gtk_thread(&main, "store_embed_open", move |main_w| {
            let parent = main_w
                .parent()
                .ok_or_else(|| "store_embed_open:linux-main-has-no-parent".to_string())?;
            if parent.widget_name().as_str() == OVERLAY_NAME {
                return Ok(());
            }
            let window = app2
                .get_window(MAIN_WINDOW_LABEL)
                .ok_or_else(|| format!("store_embed_open:no-window:{MAIN_WINDOW_LABEL}"))?;
            let vbox = window
                .default_vbox()
                .map_err(|e| format!("store_embed_open:default-vbox-failed:{e}"))?;
            let vbox_w: gtk::Widget = vbox.clone().upcast();
            if parent != vbox_w {
                // Never restructure a hierarchy we do not recognise.
                return Err(format!(
                    "store_embed_open:linux-unexpected-main-parent:{}",
                    parent.type_().name()
                ));
            }
            let pos = vbox.child_position(&main_w);
            vbox.remove(&main_w);
            let overlay = gtk::Overlay::new();
            overlay.set_widget_name(OVERLAY_NAME);
            overlay.add(&main_w);
            let fixed = gtk::Fixed::new();
            fixed.set_widget_name(FIXED_NAME);
            overlay.add_overlay(&fixed);
            overlay.set_overlay_pass_through(&fixed, true);
            vbox.pack_start(&overlay, true, true, 0);
            vbox.reorder_child(&overlay, pos);
            overlay.show();
            fixed.show();
            main_w.show();
            main_w.grab_focus();
            Ok(())
        })
    }

    /// Move the freshly `add_child`-ed embed out of the vbox and into the pass-through Fixed at
    /// `rect`.
    pub fn mount(app: &AppHandle, embed: &tauri::Webview, rect: Rect) -> Result<(), String> {
        let app2 = app.clone();
        on_gtk_thread(embed, "store_embed_open", move |embed_w| {
            let window = app2
                .get_window(MAIN_WINDOW_LABEL)
                .ok_or_else(|| format!("store_embed_open:no-window:{MAIN_WINDOW_LABEL}"))?;
            let vbox = window
                .default_vbox()
                .map_err(|e| format!("store_embed_open:default-vbox-failed:{e}"))?;
            let overlay_w = find_child_named(vbox.upcast_ref(), OVERLAY_NAME)
                .ok_or_else(|| "store_embed_open:linux-no-overlay".to_string())?;
            let overlay = overlay_w
                .clone()
                .downcast::<gtk::Overlay>()
                .map_err(|_| "store_embed_open:linux-no-overlay".to_string())?;
            let fixed = find_child_named(overlay.upcast_ref(), FIXED_NAME)
                .and_then(|w| w.downcast::<gtk::Fixed>().ok())
                .ok_or_else(|| "store_embed_open:linux-no-fixed".to_string())?;
            if let Some(old_parent) = embed_w
                .parent()
                .and_then(|p| p.downcast::<gtk::Container>().ok())
            {
                old_parent.remove(&embed_w);
            }
            fixed.put(&embed_w, rect.0, rect.1);
            embed_w.set_size_request(rect.2, rect.3);
            embed_w.show();
            schedule_settled_log(&embed_w, rect);
            Ok(())
        })
    }

    /// The sole Linux geometry writer after the initial `put` in `mount` (D-18).
    ///
    /// `queue_resize()` follows `set_size_request` on purpose: GTK 3.24 only queues a resize from
    /// `set_size_request` when the widget is VISIBLE. D-21 hides the embed on route leave and the
    /// existing-embed branch of `store_embed_open` applies the rect BEFORE `show()`, so without it
    /// a rect applied while hidden lands at the new position with the old cached size -- and the
    /// renderer's identical follow-up rect cannot repair it, because `set_size_request` then sees
    /// no change. Measured 2026-11-05 on Linux (R2/R6/R7 stale embed size), quick 261105-q1j.
    pub fn apply_bounds(embed: &tauri::Webview, rect: Rect) -> Result<(), String> {
        on_gtk_thread(embed, "store_embed_set_bounds", move |embed_w| {
            let fixed = embed_w
                .parent()
                .filter(|p| p.widget_name().as_str() == FIXED_NAME)
                .and_then(|p| p.downcast::<gtk::Fixed>().ok())
                // A set_bounds racing a first open lands here: distinguishable, never a silent Ok.
                .ok_or_else(|| "store_embed_set_bounds:linux-not-mounted".to_string())?;
            fixed.move_(&embed_w, rect.0, rect.1);
            embed_w.set_size_request(rect.2, rect.3);
            embed_w.queue_resize();
            schedule_settled_log(&embed_w, rect);
            Ok(())
        })
    }

    /// Debounced measurement log. GTK main thread only.
    fn schedule_settled_log(embed_w: &gtk::Widget, requested: Rect) {
        let generation = SETTLE_GENERATION.with(|g| {
            let next = g.get().wrapping_add(1);
            g.set(next);
            next
        });
        let embed_w = embed_w.clone();
        gtk::glib::timeout_add_local_once(Duration::from_millis(SETTLE_MS), move || {
            if SETTLE_GENERATION.with(|g| g.get()) != generation {
                return;
            }
            // Closed since scheduling: nothing to measure.
            let Some(fixed) = embed_w.parent() else {
                return;
            };
            let Some(overlay) = fixed
                .parent()
                .and_then(|p| p.downcast::<gtk::Overlay>().ok())
            else {
                return;
            };
            let Some(main_w) = overlay.child() else {
                shell_eprintln!(
                    "[shell] store_embed(linux): error settled-log: overlay has no main child"
                );
                return;
            };
            let (Some(embed_pos), Some(main_pos)) = (
                embed_w.translate_coordinates(&main_w, 0, 0),
                main_w.translate_coordinates(&overlay, 0, 0),
            ) else {
                shell_eprintln!(
                    "[shell] store_embed(linux): error settled-log: translate_coordinates failed"
                );
                return;
            };
            let Some(vbox) = overlay.parent() else { return };
            shell_eprintln!(
                "{}",
                store_embed_linux_settled_line(
                    requested,
                    (
                        embed_pos.0,
                        embed_pos.1,
                        embed_w.allocated_width(),
                        embed_w.allocated_height()
                    ),
                    (
                        main_pos.0,
                        main_pos.1,
                        main_w.allocated_width(),
                        main_w.allocated_height()
                    ),
                    (vbox.allocated_width(), vbox.allocated_height()),
                )
            );
        });
    }
}

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

/// Which button of a two-button `dialog_message` was chosen: `Some(0)`, `Some(1)`, or `None`
/// when the dialog was dismissed (Esc / window close) without one. See the `dialog_message`
/// arm for why this reads rfd's raw result rather than the dialog plugin's.
///
/// rfd reports a click on an `OkCancelCustom` button as `Custom(<its label>)` on every desktop
/// backend; `Ok` is also accepted as buttons[0] in case a backend reports the first button
/// generically. Everything else -- `Cancel` above all, which is what a dismissal yields -- is
/// `None`, so the caller falls back to its declared `cancelId` instead of guessing a button.
pub(crate) fn two_button_choice(result: &rfd::MessageDialogResult, label0: &str, label1: &str) -> Option<u8> {
    match result {
        rfd::MessageDialogResult::Custom(s) if s == label0 => Some(0),
        rfd::MessageDialogResult::Custom(s) if s == label1 => Some(1),
        rfd::MessageDialogResult::Ok => Some(0),
        _ => None,
    }
}

/// Also dispatches `dialog_open` (Phase 30 Plan 03). `app` is threaded through for that arm:
/// the folder picker is reached via the AppHandle, not via `args` — the picked path comes
/// FROM the OS dialog, never INTO it from the renderer/sidecar (T-30-11/T-30-12).
pub(crate) fn dispatch_rust_channel(channel: &str, args: &[Value], app: &AppHandle) -> Result<Value, String> {
    // Exhaustive over the generated enum (67-11, D-13): a channel in `RUST_INVOKE_CHANNELS` with no
    // arm below is a compile error, and an unknown wire name never reaches the match.
    let Some(ch) = RustInvokeChannel::from_name(channel) else {
        return Err(format!("rustInvoke:unknown-channel:{channel}"));
    };
    match ch {
        // OBSERVABILITY, not a root-cause fix (34.4.1 gap cycle 2 plan 26, F-9). F-9's cause is
        // NOT established by this plan -- the missing-entry hypothesis's harness verdict is
        // recorded in `keyring_read_timing_hypothesis_absent_vs_present_entry`'s doc comment and
        // in `34.4.1-26-SUMMARY.md`. What this wrapper DOES do: bound the wait on
        // `entry.get_password()` at `KEYRING_READ_TIMEOUT`, well under the sidecar's own 60s
        // `RUST_INVOKE_TIMEOUT_MS` (`sidecarRpc.ts`), so a blocked read (e.g. an unanswered
        // Keychain prompt -- `phase-28-keyring-complete`'s Deny -> `PlatformFailure(-128)` is a
        // real, reachable state) fails fast as a NAMED `keyring:timeout` instead of silently
        // consuming the sidecar's whole RPC budget and surfacing as an unattributable generic
        // RPC timeout. It does NOT make a blocking Keychain call return faster -- the worker
        // thread is abandoned on timeout, not cancelled (`bounded_keyring_read`'s own doc
        // comment).
        //
        // Sibling arms deliberately NOT wrapped: `keyring_set` and `keyring_delete` below keep
        // their original unbounded synchronous shape. Reads (`keyring_get`) fire transparently
        // and repeatedly behind the scenes on every credential/csrf lookup (the read-count
        // defect this gap cycle's `deferred-items.md` traces as F-9's likely amplifier); writes
        // and deletes fire only on an explicit user action (sign-in, disconnect) the user is
        // already actively engaged with, at far lower frequency, so a modal prompt there is a
        // single expected step in a flow the user just started, not a silent stall behind an
        // unrelated background call. `keyring_available` (below `keyring_delete`) is likewise
        // left unwrapped: it exists as a read-adjacent probe and would be a natural Task-scope
        // candidate for a later plan, but this plan's own harness and fix are scoped to the
        // exact `keyring_get` signature F-9 was observed on.
        RustInvokeChannel::KeyringGet => {
            let a = KeyringGetArgs::from_args(args)?;
            let account = keyring_account(a.slot.as_deref().unwrap_or(KEYRING_DEFAULT_SLOT))?;
            let result = bounded_keyring_read(KEYRING_READ_TIMEOUT, move || {
                let outcome =
                    Entry::new(KEYRING_SERVICE, account).and_then(|entry| entry.get_password());
                keyring_get_result(outcome)
            });
            // Four explicit branches, each emitting exactly one line: the Ok arm is split on
            // `keyring_get_outcome()`'s own discriminant (Found vs. Absent) rather than folded
            // into one dynamically-dispatched call, so the Found/Absent distinction is visible
            // at this call site and not just inside the pure classifier it delegates to.
            match &result {
                Ok(v) if keyring_get_outcome(v) == KeyringOutcome::Found => {
                    shell_diag(&keyring_outcome_message(
                        channel,
                        account,
                        KeyringOutcome::Found,
                    ));
                }
                Ok(_) => {
                    shell_diag(&keyring_outcome_message(
                        channel,
                        account,
                        KeyringOutcome::Absent,
                    ));
                }
                Err(e) if e == "keyring:timeout" => {
                    shell_diag(&format!(
                        "keyring {channel} timed out after {KEYRING_READ_TIMEOUT:?} (worker thread abandoned, not cancelled -- see KEYRING_READ_TIMEOUT's doc comment)"
                    ));
                }
                Err(e) => {
                    shell_diag(&format!("keyring {channel} failed: {e}"));
                }
            }
            result
        }
        RustInvokeChannel::KeyringSet => {
            let a = KeyringSetArgs::from_args(args)?;
            let account = keyring_account(a.slot.as_deref().unwrap_or(KEYRING_DEFAULT_SLOT))?;
            match Entry::new(KEYRING_SERVICE, account) {
                Ok(entry) => match entry.set_password(&a.secret) {
                    Ok(()) => {
                        shell_diag(&keyring_outcome_message(
                            channel,
                            account,
                            KeyringOutcome::Stored,
                        ));
                        Ok(Value::Bool(true))
                    }
                    Err(e) => {
                        // The emitter has no parameter capable of carrying the secret
                        // (threat T-28-04): `keyring_outcome_message`'s types forbid it,
                        // and `secret` is never passed to it -- channel + error only,
                        // enforced by construction rather than by this comment alone.
                        shell_diag(&format!("keyring {channel} failed: {e:?}"));
                        Err(format!("keyring:unavailable:{e}"))
                    }
                },
                Err(e) => {
                    shell_diag(&format!("keyring {channel} failed: {e:?}"));
                    Err(format!("keyring:unavailable:{e}"))
                }
            }
        }
        RustInvokeChannel::KeyringDelete => {
            let a = KeyringDeleteArgs::from_args(args)?;
            let account = keyring_account(a.slot.as_deref().unwrap_or(KEYRING_DEFAULT_SLOT))?;
            match Entry::new(KEYRING_SERVICE, account) {
                Ok(entry) => match entry.delete_credential() {
                    // Deleting an already-absent entry is success, not an error -- and the
                    // two arms below now differ in their logged token while remaining
                    // identical in their returned result.
                    Ok(()) => {
                        shell_diag(&keyring_outcome_message(
                            channel,
                            account,
                            KeyringOutcome::Deleted,
                        ));
                        Ok(Value::Bool(true))
                    }
                    Err(keyring::Error::NoEntry) => {
                        shell_diag(&keyring_outcome_message(
                            channel,
                            account,
                            KeyringOutcome::Absent,
                        ));
                        Ok(Value::Bool(true))
                    }
                    Err(e) => {
                        shell_diag(&format!("keyring {channel} failed: {e:?}"));
                        Err(format!("keyring:unavailable:{e}"))
                    }
                },
                Err(e) => {
                    shell_diag(&format!("keyring {channel} failed: {e:?}"));
                    Err(format!("keyring:unavailable:{e}"))
                }
            }
        }
        // NON-PROMPTING since quick-260905-l8g. This arm used to call `entry.get_password()` on
        // the caller's REAL slot, which is a full secret read: it raised a macOS authorization
        // dialog exactly like `keyring_get`, while being documented as a cheap capability probe.
        // Logging that prompt (quick-260905-jx3) and teaching the startup gate to see it
        // (quick-260905-kd0) were mitigations; this removes the channel.
        //
        // The slot argument is still parsed and still validated, so `keyring:unknown-slot` remains
        // the contract for an unrecognised slot -- but it deliberately no longer selects the item
        // looked up. The question this arm answers is slot-INDEPENDENT, which is what its own
        // documentation always claimed ("Backend works, whether or not a token is currently
        // stored") and what `SidecarHumbleSecretStore.isAvailable()` already relies on ("a
        // Keychain that is reachable for one slot is reachable for the other").
        //
        // Accepted semantic narrowing, stated rather than buried: a user who DENIES the dialog for
        // a real item used to drive this to `false`. It now stays `true`, because denying access
        // to one item does not make the backend unavailable. The one affected caller is
        // `humble/user.ts`'s `encryptionDegraded` flag; a failed write is reported by
        // `setSecret()`'s own error handling, not by this probe.
        RustInvokeChannel::KeyringAvailable => {
            // Conversion-only (quick 261001-p0s), deliberately: a capability probe against a
            // never-written account has no slot-scoped outcome worth a `KeyringOutcome`
            // token, unlike the three arms above. Its `Ok(_)` branch already emits a loud
            // WARNING, which is the one event here worth reading; this does not re-create
            // the blind spot being closed elsewhere in this `match`, it just carries no
            // success emission of its own.
            //
            // Validated for its rejection contract, intentionally unused for the lookup.
            let a = KeyringAvailableArgs::from_args(args)?;
            let _validated_slot =
                keyring_account(a.slot.as_deref().unwrap_or(KEYRING_DEFAULT_SLOT))?;
            match Entry::new(KEYRING_SERVICE, KEYRING_REACHABILITY_PROBE_ACCOUNT) {
                Ok(entry) => match entry.get_password() {
                    // THE expected healthy answer. The backend answered, and answered that this
                    // deliberately-never-written account holds nothing -- which is exactly the
                    // fast, ACL-free path this probe is built on.
                    Err(keyring::Error::NoEntry) => Ok(Value::Bool(true)),
                    // Reachable, but something wrote to a reserved account. The backend is
                    // demonstrably up so the honest answer is still `true`, but this must be loud:
                    // an item here means the probe has re-acquired an ACL and may prompt again.
                    Ok(_) => {
                        shell_diag(&format!(
                            "keyring {channel}: WARNING -- a value exists at the reserved probe account; the reachability probe may raise an authorization prompt again (see KEYRING_REACHABILITY_PROBE_ACCOUNT)"
                        ));
                        Ok(Value::Bool(true))
                    }
                    // A *successful* report of unavailability (D-06's honest-unavailable signal),
                    // not an error — the caller asked "is it available", and the honest answer
                    // here is "no".
                    Err(e) => {
                        shell_diag(&format!("keyring {channel} failed: {e:?}"));
                        Ok(Value::Bool(false))
                    }
                },
                Err(e) => {
                    shell_diag(&format!("keyring {channel} failed: {e:?}"));
                    Ok(Value::Bool(false))
                }
            }
        }
        // Native folder picker (Phase 30 Plan 03, D-09/REQ-30-07): blocks the calling thread
        // until the user picks or cancels, so callers MUST dispatch this on a spawned worker
        // thread, never the reader thread (T-30-13 — same reasoning as the keyring arms above,
        // a modal OS prompt must not head-of-line block other pending rustInvokes). Returns the
        // picked path as a string, or `Value::Null` on cancel — never an error on cancel, which
        // is a normal user choice, not a failure.
        // WR-01: honor the forwarded Electron `OpenDialogOptions.properties`. The options
        // object crosses the wire as `args[0]` and used to be ignored entirely, so EVERY
        // caller got a directory picker — including the `properties: ['openFile']` call
        // sites (Settings/CustomWineProton's Wine/Proton binary, SideloadDialog's exe +
        // cover images, GameSubMenu) which then received a path that can never be a valid
        // binary/image. Default stays "folder" so the plan-30-03 install-location path is
        // unchanged when no properties are supplied.
        //
        // Quick task 260902-8wc (closes item 2 of the folded todo
        // `2026-08-24-opendialog-is-missing-from-long-running-channels-...`): `properties` used
        // to be the ONLY key read here, so `title`, `defaultPath` and `filters` crossed the wire
        // and were dropped on the floor. That made this the one dialog arm in this file that
        // discards its caller's options -- `dialog_save` below already honours defaultPath and
        // filters, and `dialog_message` already honours title and buttons.
        //
        // It was also an aggravating factor for the timeout bug that todo was filed for: with no
        // start directory the picker opens wherever macOS last left it, so the user must navigate
        // manually, which is exactly what pushed the interaction past the (since-removed) 60s
        // bound on the outer `openDialog` channel.
        //
        // `buttonLabel` is received and still cannot be honoured: tauri-plugin-dialog 2.7.2's
        // `FileDialogBuilder` exposes add_filter / set_directory / set_file_name / set_title /
        // set_can_create_directories and NO confirm-button-label setter. Recorded here so the
        // next reader does not re-derive it -- the callers that send it (PathSelectionBox,
        // SideloadDialog, Tools, GameSubMenu) get the OS default label.
        RustInvokeChannel::DialogOpen => {
            let options = DialogOpenArgs::from_args(args)?;
            let wants_file = options
                .properties
                .as_ref()
                .map(|props| {
                    let has_dir = props.iter().any(|p| p == "openDirectory");
                    let has_file = props.iter().any(|p| p == "openFile");
                    has_file && !has_dir
                })
                .unwrap_or(false);
            let mut builder = app.dialog().file();
            if let Some(title) = options.title.as_deref().filter(|s| !s.is_empty()) {
                builder = builder.set_title(title);
            }
            // Electron's `defaultPath` may name either a directory or a file; AppKit/rfd only
            // accepts a DIRECTORY as the start location. Resolve to the nearest existing
            // directory and pass nothing when there isn't one -- handing the panel a path that
            // does not exist is worse than handing it none, because rfd then falls back
            // inconsistently across platforms rather than to the OS's last-used location.
            if let Some(default_path) = options.default_path.as_deref().filter(|s| !s.is_empty()) {
                let candidate = std::path::Path::new(default_path);
                let start_dir = if candidate.is_dir() {
                    Some(candidate)
                } else {
                    candidate.parent().filter(|parent| parent.is_dir())
                };
                if let Some(start_dir) = start_dir {
                    builder = builder.set_directory(start_dir);
                }
            }
            // File pickers only. A folder picker ignores extension filters, so forwarding them
            // there would be noise. The parse mirrors `dialog_save`'s below verbatim -- same
            // wire shape, same `name`/`extensions` keys.
            if wants_file {
                if let Some(filters) = options.filters.as_ref() {
                    for filter in filters {
                        let name = filter.name.as_deref().unwrap_or("");
                        let extensions: Vec<&str> = filter
                            .extensions
                            .as_ref()
                            .map(|arr| arr.iter().map(String::as_str).collect())
                            .unwrap_or_default();
                        builder = builder.add_filter(name, &extensions);
                    }
                }
            }
            let picked = if wants_file {
                builder.blocking_pick_file()
            } else {
                builder.blocking_pick_folder()
            };
            match picked {
                Some(path) => Ok(Value::String(path.to_string())),
                None => Ok(Value::Null),
            }
        }
        // Native message/error dialog (Phase 31 Plan 02, D-03/REQ-31-03/REQ-31-05): backs both
        // `dialog.showMessageBox` and `dialog.showErrorBox` on the platformApi side. Default
        // kind is Info when unspecified; the showErrorBox caller always sends `kind:"error"`.
        // Runs on the existing spawned worker thread (same
        // modal-dialog-must-not-block-the-reader-thread reasoning as `dialog_open` above).
        //
        // Phase 33 Plan 03 (D-06): an optional 2-element `buttons` array renders a real
        // two-button confirm (`OkCancelCustom`) instead of the OK-only default.
        //
        // Returns the chosen button's index (`0` / `1`), or `null` when the dialog was
        // DISMISSED (Esc / window close) without a button -- platformApi maps `null` to the
        // caller's `cancelId`, Electron's own dismissal semantics. Todo 2026-10-05
        // dialog-dismiss: this used to return `blocking_show()`'s bool, which is `false` for a
        // dismissal AND for buttons[1], so Esc on Windows/Linux resolved as buttons[1] -- the
        // destructive "Yes" for `askForceUninstall` and `handleExit`.
        //
        // The two-button case calls `rfd` directly, NOT the plugin's
        // `blocking_show_with_result()`: tauri-plugin-dialog 2.7.2's
        // `desktop::show_message_dialog` unconditionally remaps rfd's `Cancel` to
        // `Custom(<second label>)` for `OkCancelCustom` (a workaround for GTK), so through the
        // plugin a dismissal is indistinguishable from buttons[1] on every API it offers. rfd
        // 0.16.0 itself reports `Custom(label)` for a click and `Cancel` for a dismissal on all
        // three desktop backends (gtk3, win_cid, macos). The dialog is shown the way the plugin
        // shows it: built and `show()`n on the main thread, awaited on a spawned thread, with
        // the plugin's default title (the package name). Single-button / no-`buttons` calls
        // keep the plugin's OK-only dialog.
        RustInvokeChannel::DialogMessage => {
            let opts = DialogMessageArgs::from_args(args)?;
            let message = opts.message.clone().unwrap_or_default();
            let kind = opts
                .kind
                .as_deref()
                .map(|s| match s {
                    "error" => MessageDialogKind::Error,
                    "warning" => MessageDialogKind::Warning,
                    _ => MessageDialogKind::Info,
                })
                .unwrap_or(MessageDialogKind::Info);
            let title = opts.title.clone();
            if let Some(btns) = opts.buttons.as_ref().filter(|b| b.len() == 2) {
                let label0 = btns[0].clone();
                let label1 = btns[1].clone();
                let title = title.unwrap_or_else(|| app.package_info().name.clone());
                // The plugin's own `From<MessageDialogKind> for rfd::MessageLevel`, so the
                // level matches what the OK-only path below renders.
                let level: rfd::MessageLevel = kind.into();
                let buttons = rfd::MessageButtons::OkCancelCustom(label0.clone(), label1.clone());
                let (tx, rx) = mpsc_channel::<rfd::MessageDialogResult>();
                app.run_on_main_thread(move || {
                    let shown = rfd::AsyncMessageDialog::new()
                        .set_title(&title)
                        .set_description(&message)
                        .set_level(level)
                        .set_buttons(buttons)
                        .show();
                    thread::spawn(move || {
                        let _ = tx.send(tauri::async_runtime::block_on(shown));
                    });
                })
                .map_err(|e| e.to_string())?;
                let result = rx.recv().map_err(|e| e.to_string())?;
                return Ok(
                    two_button_choice(&result, &label0, &label1).map_or(Value::Null, Value::from)
                );
            }
            let mut builder = app.dialog().message(message).kind(kind);
            if let Some(title) = title {
                builder = builder.title(title);
            }
            // OK-only: `true` is its one button; anything else is a dismissal.
            Ok(if builder.blocking_show() {
                Value::from(0)
            } else {
                Value::Null
            })
        }
        // Real OS notification (Phase 33 Plan 04, D-05). Backs `platform/index.ts`'s
        // `Notification.show()`. Mirrors `dialog_message`'s args-parse idiom -- read an optional
        // `title`/`body` from args[0]. No icon/nativeImage plumbing.
        //
        // Quick task 261023-vkv: on a packaged macOS bundle the notification goes through
        // `macos_notifications::deliver` (`UNUserNotificationCenter`), and its `notification:*`
        // Err strings reach the sidecar as a rejection (logged via `logWarning`). That path
        // waits at most two `NOTIFICATION_COMPLETION_TIMEOUT`s on this worker thread. Dev and
        // non-bundled runs, and Windows/Linux, use `tauri-plugin-notification` below, whose
        // `show()` dispatches its work onto `tauri::async_runtime::spawn` and returns promptly.
        RustInvokeChannel::NotificationShow => {
            let opts = NotificationShowArgs::from_args(args)?;
            let title = opts.title.as_deref();
            let body = opts.body.as_deref();
            #[cfg(target_os = "macos")]
            if macos_notifications::backend()
                == notification_backend::NotificationBackend::UserNotifications
            {
                // Resolves `user-notifications;auth=..;alert=..;style=..`
                // (`notification_backend::user_notifications_label`): acceptance by UN* is not
                // proof of a banner, so the settings that decide that travel with it (52-REVIEW
                // WR-01).
                return macos_notifications::deliver(title, body).map(Value::String);
            }
            let mut builder = app.notification().builder();
            if let Some(title) = title {
                builder = builder.title(title);
            }
            if let Some(body) = body {
                builder = builder.body(body);
            }
            builder.show().map_err(|e| e.to_string())?;
            // Resolve the backend label, not null: it makes delivery observable, and the
            // plugin's Ok does not mean delivered (52-UAT item 30).
            Ok(Value::String(
                notification_backend::backend_label(
                    notification_backend::NotificationBackend::Plugin,
                )
                .to_string(),
            ))
        }
        // Reveal a path in the OS file manager (Phase 33 Plan 04, D-05) via
        // `tauri-plugin-opener`'s `reveal_item_in_dir` (already installed for `open_external`).
        // Backs `platform/index.ts`'s `shell.showItemInFolder()`. The path originates from
        // in-app backend callers, not renderer free-text (T-33-11) -- forwarded to the vetted
        // opener plugin's own scoping, not a raw shell-out.
        //
        // macOS SELECTION FIX (debug session `finder-reveal-no-selection`, 2026-08-23,
        // REQ-34.3-11 item 2 / G1): `reveal_item_in_dir` opens the correct folder 100% of the
        // time, but its selection step is a SEPARATE, systemic macOS/AppKit defect -- see
        // `macos_finder_reselect_workaround` below for the mechanism and evidence. The
        // follow-up call is a no-op on other platforms.
        RustInvokeChannel::ShellShowItemInFolder => {
            shell_open::shell_show_item_in_folder(app, args)
        }
        // Open a path with the default program (Phase 33 Plan 04, D-05) via
        // `tauri-plugin-opener`'s `open_path`. Backs `platform/index.ts`'s `shell.openPath()`.
        // Same path-provenance note as `shell_show_item_in_folder` above (T-33-11).
        RustInvokeChannel::ShellOpenPath => {
            shell_open::shell_open_path(app, args)
        }
        // Write text to the OS clipboard (Phase 34.3 Plan 03, D-01/D-02, REQ-34.3-03) via
        // `tauri-plugin-clipboard-manager`'s `app.clipboard().write_text()`. Backs
        // `platform/index.ts`'s `clipboard.writeText()`. This arm and `clipboard_read_text`
        // below are the ONLY two new `dispatch_rust_channel` arms the entire 34.3 slice adds
        // -- D-02's zero-renderer-capability-grant stance holds (capabilities/default.json is
        // untouched; the plugin has no `js_init_script`, confirmed by 34.3-RESEARCH.md Q2).
        RustInvokeChannel::ClipboardWriteText => {
            let a = ClipboardWriteTextArgs::from_args(args)?;
            app.clipboard()
                .write_text(a.text)
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        // Read text from the OS clipboard (Phase 34.3 Plan 03, D-01/D-02, REQ-34.3-03) via
        // `tauri-plugin-clipboard-manager`'s `app.clipboard().read_text()`. Backs the
        // sidecar's `clipboardReadText` handler (D-04 -- the read path bypasses
        // `platformApi`'s sync stub and awaits this rustInvoke directly, since a sync
        // function structurally cannot await a Rust round-trip). Safe to call `read_text()`
        // here specifically because `dispatch_rust_channel` always runs on a
        // `thread::spawn`'d worker thread (see `start_reader`), never the main/reader thread
        // -- the plugin's own `desktop.rs` docstring warns `read_text()` must not be called on
        // the main thread (Linux deadlock risk). A future refactor that moves dispatch onto
        // the reader thread must not silently reintroduce that deadlock.
        RustInvokeChannel::ClipboardReadText => {
            clipboard_read_value(app.clipboard().read_text().map_err(|e| e.to_string()))
        }
        // Exit the real Tauri process (Phase 33 Plan 04, D-05 app lifecycle essentials) via
        // `AppHandle::exit()`. Backs `platform/index.ts`'s `app.exit()`/`app.quit()`. Only two
        // sidecar-reachable call sites invoke this (`resetHeroic()`, the uninstall/quit exit
        // path) -- both deliberate user/exit actions (T-33-12, accepted DoS disposition).
        RustInvokeChannel::AppExit => {
            if let Some(state) = app.try_state::<Arc<SidecarState>>() {
                state.begin_shutdown();
            }
            app.exit(0);
            Ok(Value::Null)
        }
        // Restart the real Tauri process (Phase 33 Plan 04, D-05 app lifecycle essentials) via
        // `AppHandle::restart()`. Backs `platform/index.ts`'s `app.relaunch()`. `restart()` never
        // returns (`-> !`) -- it either restarts the process directly (main thread) or blocks
        // this spawned worker thread until the process exits (background thread), which is safe
        // since the whole process is about to go away regardless.
        //
        // Phase 34.3 Plan 03 D-05 / REQ-34.3-06 (RESOLVED, no code change needed): dispatch_rust_channel
        // always runs on a thread::spawn'd worker thread (see start_reader above), never the main
        // thread, so this app.restart() call is always restart()'s BACKGROUND-THREAD branch -- it sets
        // restart_on_exit=true and requests exit through the real event loop, rather than the
        // main-thread branch that skips RunEvent::Exit entirely. That exit request fires
        // tauri::RunEvent::Exit, and this file's own .run(...) closure (below main()) calls
        // state.shutdown_child() on exactly that event -- BEFORE the process re-execs. Therefore there
        // is no orphan-sidecar window for this codebase's calling pattern, and no extra
        // state.shutdown_child() call belongs here -- adding one would be dead code inviting the next
        // reader to wonder why it is duplicated. Verified against tauri 2.11.5's vendored source (the
        // exact version this crate's Cargo.lock pins) by direct read of app.rs's restart()/run()/
        // make_run_event_loop_callback() -- see 34.3-RESEARCH.md Q1 for the full evidence chain.
        // restart()'s "skip the events" branch applies ONLY when restart() is called on the main
        // thread, which this call site never is.
        // Empirical confirmation is REQ-34.3-11's live-gate item 4 (a PACKAGED build: resetHeroic
        // leaves exactly ONE sidecar process), not a Rust unit test -- a #[cfg(test)] test structurally
        // cannot drive a live winit/tao event loop. One residual not traced here: the exact delivery
        // guarantee of runtime_handle.request_exit(...) inside tauri-runtime-wry -- the same mechanism
        // every existing app.exit() call in this codebase already depends on; the live-gate item above
        // is where that residual closes empirically.
        RustInvokeChannel::AppRelaunch => {
            if let Some(state) = app.try_state::<Arc<SidecarState>>() {
                state.begin_shutdown();
            }
            app.restart();
        }
        // Hide the real Tauri application (quick/260815-vvz) via `AppHandle::hide()`. Backs
        // `platform/index.ts`'s `app.hide()`, whose one reachable caller is
        // `raiseFrontmostBottledProcess`'s (`bottle.ts`) ~18s-miss yield fallback for bottled
        // Steam install/uninstall -- when no matching installer/uninstaller window can be
        // raised within that window, GameLib steps aside instead of staying in front of an
        // invisible Steam confirm dialog (the root cause `steam-bottle-uninstall-reverts.md`
        // records).
        //
        // `AppHandle::hide()` (tauri 2.11.5, `src/app.rs:1095-1104`) only exists
        // `#[cfg(target_os = "macos")]` -- exact parity with real Electron's own `app.hide()`,
        // which is macOS-only there too. An ungated call would not compile off macOS, so the
        // two branches are `#[cfg]`-split; the non-macOS branch is a loud `eprintln!` declaring
        // the no-op (never a silent lie), converging on the same `Ok(Value::Null)`.
        //
        // Thread-safety: `dispatch_rust_channel` always runs on a `thread::spawn`'d worker
        // thread (see `clipboard_read_text`'s comment above and `start_reader`), never the
        // main/reader thread -- so `AppHandle::hide()` always takes its
        // `RuntimeOrDispatch::RuntimeHandle(h) => h.hide()?` branch, which posts to the real
        // event loop rather than calling the runtime directly. Same mechanism the already-
        // shipped `app_exit`/`app_relaunch` arms above rely on.
        RustInvokeChannel::AppHide => {
            #[cfg(target_os = "macos")]
            {
                app.hide().map_err(|e| e.to_string())?;
            }
            #[cfg(not(target_os = "macos"))]
            {
                shell_eprintln!(
                    "[dispatch_rust_channel] app_hide: declared no-op off macOS -- \
                     AppHandle::hide() does not exist on this platform, exact parity with real \
                     Electron's own macOS-only app.hide()"
                );
            }
            Ok(Value::Null)
        }
        // Bring the main window to the front before a bridge-notice dialog. Same three calls as
        // the tray About arm (`open_about_window_from_tray`); takes no args, so there is no
        // injection surface. A missing window is reported, not fatal. The invite
        // picker no longer uses this (quick 261101-llf); bridge-notice dialogs still do.
        RustInvokeChannel::MainWindowRaise => {
            let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
                return Err("main_window_raise:no-main-window".to_string());
            };
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
            // AppKit ignores this when GameLib is already active, so it only bounces the Dock icon when activation was declined with a game frontmost.
            #[cfg(target_os = "macos")]
            let _ = window.request_user_attention(Some(tauri::UserAttentionType::Critical));
            Ok(Value::Null)
        }
        // Open (or reuse) the dedicated `bridge-invite` window that hosts the Steam bridge invite
        // picker (quick 261101-llf). Replaces the 58-36 `main_window_raise` + push, which dragged
        // the whole GameLib window over the game. `args[0]` is `{ appId, ackId }`; both are
        // re-validated by `bridge_invite_picker_path` because they land in a URL. The main window
        // is touched only to re-hide it after a Cmd+H-hidden GameLib was unhidden by activation.
        RustInvokeChannel::BridgeInvitePickerOpen => {
            let a = BridgeInvitePickerOpenArgs::from_args(args)?;
            let (appid, ack) = (a.app_id.as_str(), a.ack_id.as_str());
            let path = bridge_invite_picker_path(appid, ack)?;

            // Record the frontmost app (the game) BEFORE the picker takes focus. A re-open keeps
            // the first record so the game's pid is never replaced by GameLib's own.
            #[cfg(target_os = "macos")]
            {
                let (tx, rx) = mpsc_channel::<(Option<i32>, bool)>();
                app.run_on_main_thread(move || {
                    let _ = tx.send(macos_invite_focus::snapshot());
                })
                .map_err(|e| e.to_string())?;
                let (pid, hidden) = rx.recv().map_err(|e| e.to_string())?;
                let mut rec = macos_invite_focus::lock();
                if rec.is_none() {
                    if let Some(pid) = pid.filter(|p| *p != std::process::id() as i32) {
                        *rec = Some(macos_invite_focus::PickerRestore {
                            prev_pid: pid,
                            app_was_hidden: hidden,
                            main_hidden_by_picker: false,
                        });
                    }
                }
            }

            let window = if let Some(existing) = app.get_webview_window(BRIDGE_INVITE_WINDOW_LABEL)
            {
                let url = existing
                    .url()
                    .and_then(|u| {
                        u.join(&path)
                            .map_err(|e| tauri::Error::InvalidUrl(e.into()))
                    })
                    .map_err(|e| format!("bridge_invite_picker_open:build-failed:{e}"))?;
                existing
                    .navigate(url)
                    .map_err(|e| format!("bridge_invite_picker_open:build-failed:{e}"))?;
                existing
            } else {
                let dev_url = app.config().build.dev_url.clone();
                // `.title(..)` is a fixed string: WR-07's forged-title concern covers REMOTE login
                // windows; this one loads GameLib's own bundle.
                //
                // `always_on_top(true)` is deliberate, unlike the login windows: the picker must
                // float over a frontmost game even when macOS declines to activate GameLib.
                let built = tauri::WebviewWindowBuilder::new(
                    app,
                    BRIDGE_INVITE_WINDOW_LABEL,
                    tauri::WebviewUrl::App(path.into()),
                )
                .title("Invite a friend")
                .inner_size(520.0, 640.0)
                .resizable(false)
                .maximizable(false)
                .minimizable(false)
                .always_on_top(true)
                .center()
                .focused(true)
                .on_navigation(move |url| bridge_invite_nav_allowed(url, dev_url.as_ref()))
                .build()
                .map_err(|e| format!("bridge_invite_picker_open:build-failed:{e}"))?;
                #[cfg(target_os = "macos")]
                {
                    let app_for_event = app.clone();
                    // Aliased so this handler is not mistaken for the main window's quit-routing
                    // `CloseRequested` handler by the shell-source gates that locate that one.
                    use tauri::WindowEvent as PickerEvt;
                    built.on_window_event(move |event| match event {
                        // Hand focus back to the game BEFORE the window is gone, so AppKit does
                        // not promote the main window to key. Not prevented: the close proceeds.
                        PickerEvt::CloseRequested { .. } => {
                            let prev = macos_invite_focus::lock().map(|r| r.prev_pid);
                            if let Some(pid) = prev {
                                macos_invite_focus::activate(pid);
                            }
                        }
                        PickerEvt::Destroyed => {
                            let rec = macos_invite_focus::lock().take();
                            if rec.is_some_and(|r| r.main_hidden_by_picker) {
                                if let Some(main) =
                                    app_for_event.get_webview_window(MAIN_WINDOW_LABEL)
                                {
                                    let _ = main.show();
                                }
                                // Back-to-back show + hide restores the pre-invite Cmd+H state.
                                let _ = app_for_event.hide();
                            }
                        }
                        _ => {}
                    });
                }
                built
            };
            let _ = window.set_focus();

            // GameLib was Cmd+H-hidden: activating it unhid every window, including main.
            #[cfg(target_os = "macos")]
            {
                let mut rec = macos_invite_focus::lock();
                if let Some(r) = rec.as_mut().filter(|r| r.app_was_hidden) {
                    if let Some(main) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                        let _ = main.hide();
                        r.main_hidden_by_picker = true;
                    }
                }
            }
            Ok(Value::Null)
        }
        // Swap the real Tauri tray's icon (Phase 34.1 Plan 06, D-11). Backs the sidecar's
        // `changeTrayColor` registration (`appShellFlowRegistration.ts`), which reads
        // `trayIconVariant` from `GlobalConfig` and forwards it here as `{ variant }` (auto /
        // light / dark; pinned by `meta/fixtures/tray-set-icon-wire-args.json`). Still the
        // ONLY tray-icon `dispatch_rust_channel` arm -- D-01 keeps window chrome renderer-side
        // with zero new Rust arms.
        RustInvokeChannel::TraySetIcon => {
            // Wire-compat (kept deliberately, not tidied into a hard error): the generated
            // `TraySetIconArgs` accepts exactly the three shipped variants, but an unrecognised
            // variant or the retired `{ dark }` shape has always resolved to Auto here (pinned by
            // `tray_variant_wire_contract_retired_dark_bool_shape_is_auto_not_dark`). So a
            // `from_args` failure falls back to the lenient Auto mapping instead of erroring.
            let mode = match TraySetIconArgs::from_args(args) {
                Ok(a) => match a.variant {
                    TraySetIconArgsVariant::Auto => TrayIconMode::Auto,
                    TraySetIconArgsVariant::Light => TrayIconMode::Light,
                    TraySetIconArgsVariant::Dark => TrayIconMode::Dark,
                },
                Err(_) => {
                    if let Some(raw) = tray_set_icon_variant_str(args) {
                        // Length only, never the value (T-260930-lyk-01/05).
                        shell_eprintln!(
                            "[shell] WARN: tray_set_icon: unrecognised variant ({} bytes) -- treating as auto",
                            raw.len()
                        );
                    }
                    tray_set_icon_mode_from_args(args)
                }
            };
            store_tray_icon_mode(mode);
            let system_uses_light_theme = if mode == TrayIconMode::Auto {
                read_system_uses_light_theme()
            } else {
                None
            };
            if mode == TrayIconMode::Auto && system_uses_light_theme.is_none() {
                shell_eprintln!(
                    "[shell] tray_set_icon: SystemUsesLightTheme unreadable -- Auto falling back to the light glyph"
                );
            }
            let dark = resolve_tray_icon_dark(mode, system_uses_light_theme);
            match app.tray_by_id(TRAY_ICON_ID) {
                Some(tray) => {
                    // Atomic icon+template-flag update (tauri 2.11.5, `tray/mod.rs:569-599`):
                    // calling `set_icon` followed by `set_icon_as_template` separately causes a
                    // visible flicker on macOS as the icon renders twice. Falls back to plain
                    // `set_icon` on Windows/Linux, where `is_template` is a documented no-op.
                    tray.set_icon_with_as_template(Some(tray_image(dark)), tray_is_template())
                        .map_err(|e| e.to_string())?;
                }
                // A missing tray is not an error condition -- it may have legitimately
                // failed to build at startup (T-34.1-22); log and resolve successfully.
                None => shell_eprintln!(
                    "[shell] tray_set_icon: no tray found with id {TRAY_ICON_ID:?}, skipping"
                ),
            }
            Ok(Value::Null)
        }
        // Native save-file dialog (Phase 31 Plan 02, D-03/REQ-31-03): same `Option<FilePath>`
        // shape as `dialog_open`'s pick_folder/pick_file arm -- `Some(path)` is the chosen path,
        // `None` is a healthy user cancel (never an error). Runs on the same spawned worker
        // thread.
        RustInvokeChannel::DialogSave => {
            let opts = DialogSaveArgs::from_args(args)?;
            let mut builder = app.dialog().file();
            if let Some(file_name) = opts.default_path.as_deref() {
                builder = builder.set_file_name(file_name);
            }
            if let Some(filters) = opts.filters.as_ref() {
                for filter in filters {
                    let name = filter.name.as_deref().unwrap_or("");
                    let extensions: Vec<&str> = filter
                        .extensions
                        .as_ref()
                        .map(|arr| arr.iter().map(String::as_str).collect())
                        .unwrap_or_default();
                    builder = builder.add_filter(name, &extensions);
                }
            }
            match builder.blocking_save_file() {
                Some(path) => Ok(Value::String(path.to_string())),
                None => Ok(Value::Null),
            }
        }
        // Open a fail-closed child login window on any https URL (Phase 34.4.1 Plan 01,
        // D-01/D-02, REQ-34.4.1-01/REQ-34.4.1-09). Runner-agnostic by design: nothing
        // here knows what Humble is. `.user_agent()` is MANDATORY, not reinforcement --
        // Tauri's default macOS UA carries no browser product token at all (spike 013).
        // Deliberately NO `.title()` call (WR-07 anti-phishing: the loaded document's
        // own title must show, never a hard-coded "GameLib"). The relay is wired to
        // `on_page_load` (main-frame Started/Finished only), NEVER `on_navigation` --
        // spike 013 measured 5 of 8 `on_navigation` events as third-party iframes, and
        // relaying those would let an ad frame re-arm the sidecar's login-watch deadline
        // forever (Pitfall 2).
        //
        // F-4 fix (Phase 34.4.1 Plan 18, T-34.4.1-79/T-34.4.1-82): the live gate found
        // the VISIBLE login window too small for Humble's login form plus a Humble
        // Guard / OTP step, and lost behind other applications once the operator
        // switched away to fetch a code. `.inner_size()`/`.center()`/`.focused(true)`
        // below fix both, applied ONLY when `visible` is true -- the SAME arm also
        // builds the hidden reveal/clear windows (disconnect's clear, reveal-POST),
        // and sizing/centering/raising one of those would be wasted work at best and
        // a visible flash at worst, on a path whose whole design is that nothing is
        // shown (T-34.4.1-82). `.focused(true)` raises-and-focuses ONCE on creation,
        // deliberately NOT `.always_on_top(true)`: a permanent flag would force the
        // operator to fight past the login window to reach the very password-manager
        // window or OS credential prompt they switched away to use, trading one
        // findability problem for a worse one.
        //
        // WR-07 CORRECTION (Phase 34.4.1 Plan 24, research Pitfall 3 in the flesh): an
        // earlier version of this comment claimed WR-07 was "enforced by the grep gate
        // in this plan's own acceptance criteria, not by intent alone." That claim was
        // FALSE and misdirected two live gate operators, both of whom reported the
        // title bar read the framework default, "Tauri app" -- neither Humble's own
        // title (what WR-07 requires) nor a hard-coded "GameLib" (what WR-07
        // prohibits). A grep gate proving `.title(` is never hard-coded can only
        // establish the ABSENCE of the prohibited value; it structurally cannot
        // establish the PRESENCE of the required one. Omitting `.title()` does NOT by
        // itself make the OS window title track the loaded document's title -- that
        // assumption was never spiked. Tauri's documented mechanism for this (an
        // in-source example at `tauri-2.11.5/src/webview/mod.rs:564-567`) is the
        // title-tracking builder callback wired below, inside the same `if visible`
        // block as the F-4 presentation calls -- a hidden reveal/clear window has no
        // title bar for a title to matter on. That callback sets ONLY the OS window
        // title; it grants no capability and does not touch the fail-closed label
        // scheme (`next_login_window_label()`, REQ-34.4.1-09) in any way. WR-07's
        // negative half (no hard-coded title) stays grep-provable, unchanged; WR-07's
        // positive half (Humble's own title actually shows) is provable only LIVE --
        // see plan 24's SUMMARY and plan 29 item 1, the only thing that closes it.
        //
        // ANTI-PHISHING ORIGIN (Phase 34.5 Plan 27, F-34.5-G6-04, T-34.5-G6-22/23/39): the
        // title-tracking callback above shows the loaded DOCUMENT's title -- a value the
        // remote page fully controls -- and nothing else. That is NOT an origin indicator:
        // an attacker-influenced or redirected login page can title itself anything,
        // including a string designed to look like a real address bar (T-34.5-G6-23), and
        // this window has no address bar of its own for the operator to check instead.
        // `login_window_title()` fixes this by prefixing the SHELL-RESOLVED origin --
        // derived from the validated URL this arm already holds, never from page content
        // -- ahead of the document title, unconditionally. The origin is seeded from the
        // open URL immediately after `.build()` (visible from the moment the window
        // appears, not only after the first title event) and kept current via the SAME
        // `on_page_load` hook this arm already trusts for the login relay above --
        // main-frame `Started`/`Finished` only, NEVER `on_navigation`: spike 013 measured
        // 5 of 8 `on_navigation` events as third-party iframes, the callback carries no
        // frame-type flag to filter them, and an iframe overwriting the title bar's origin
        // would be the exact inverse of the guarantee this exists to provide
        // (T-34.5-G6-39). This is the SAME rule the login relay above already follows, now
        // also covering the title's origin source -- one convention, not two. The origin
        // is shared between the `on_page_load` hook and the `on_document_title_changed`
        // hook via `current_origin` (an `Arc<Mutex<String>>`) so a title change arriving
        // between navigations is still composed against the page's CURRENT host, never a
        // stale one.
        //
        // LIGHT INTERFACE STYLE (Phase 34.5 Plan 27, F-34.5-G6-05): the developer's live
        // gate report was verbatim "the text was black on black so could not tell my cut
        // and paste worked until i highlighted" on Amazon's verification-code field. The
        // likely mechanism is a dark `prefers-color-scheme` the webview inherits from the
        // host system, mismatched against a page stylesheet that only sets text colour.
        // `.theme(Some(tauri::Theme::Light))` below (the builder method at
        // `tauri-2.11.5/src/webview/webview_window.rs:882`, "Forces a theme or uses the
        // system settings if None was provided") requests a light interface style on our
        // OWN window -- it changes what the page is TOLD, not what it runs. No CSS or
        // script is injected into the third-party credential page (that would trade a
        // legibility defect for a materially worse security posture: running script in a
        // live credential context). Applied ONLY inside `if visible`, matching every other
        // presentation-only call in this arm -- the hidden reveal/clear windows have no
        // user-visible rendering. FALSIFIABLE, not assumed closed: if plan 34.5-28's live
        // check still shows unreadable text, `prefers-color-scheme` was not the mechanism
        // and this fix must be recorded as NOT closing F-34.5-G6-05.
        RustInvokeChannel::HumbleLoginOpen => {
            let open_args = HumbleLoginOpenArgs::from_args(args)?;
            let url = login_window_parse_url(&open_args.url)?;
            let origin = url.origin().ascii_serialization();
            // Epic-only scoping for the pristine-webview route below -- computed BEFORE `url`
            // moves into the builder below, since this is the only signal this runner-agnostic
            // arm has (see `EPIC_LOGIN_HOST`'s own doc comment).
            #[cfg_attr(not(target_os = "macos"), allow(unused_variables))]
            let is_epic_login = matches!(url.host_str(), Some(EPIC_LOGIN_HOST));
            // quick-261029-o1w / quick-261029-utr: GOG and Epic are pristine, presented as a sheet
            // and take part in the single-flight latch below, so both route AFTER the latch
            // (host-keyed only).
            #[cfg_attr(not(target_os = "macos"), allow(unused_variables))]
            let is_gog_login = matches!(url.host_str(), Some(GOG_LOGIN_HOST));
            let visible = open_args.visible;
            let user_agent = open_args.user_agent.as_str();
            let label = next_login_window_label();
            let event_label = label.clone();
            // Pristine-webview route (F-34.5-G6-01): Epic's and GOG's login windows use a
            // Tauri-injection-free WKWebView on macOS instead of this arm's own
            // `WebviewWindowBuilder` path below. See `open_pristine_epic_login_window`'s own
            // doc comment (above) for the mechanism. Since quick-261029-utr the route is taken
            // AFTER the single-flight latch below, through `open_pristine_login_sheet`, for both
            // hosts. Every other runner (and Epic/GOG on non-macOS) falls through to the
            // existing, completely untouched code below. `url` is only moved into the pristine
            // branch when it is actually taken (`return` on the same expression), so the
            // unconditional uses of `url` further down this arm remain valid.
            // T-34.4.2-39 single-flight guard (Phase 34.4.2 Plan 14): refuse a second VISIBLE
            // login window while one is already pending (armed here, not yet resolved) or
            // presented (`PRESENTED_LOGIN_SHEETS` non-empty), so AppKit is never asked to queue
            // a second `beginSheet:` behind the first -- the concrete failure mode this closes
            // is typing one store's password into another store's just-arrived sheet. Sits
            // AFTER the pristine-route variables above and BEFORE the pristine route and the
            // builder below (quick-261029-utr: Epic's old pre-latch exemption, D-D, is lifted),
            // so a refused request never gets a window built. Scoped to `visible`
            // only -- hidden reveal/clear windows (e.g. the Humble health-check/disconnect
            // routes in `src/backend/humble/user.ts`, both `visible: false`) never arm or are
            // refused by this latch.
            //
            // HONEST BOUNDARY: this guard arms at `humble_login_open`, the earliest point this
            // shell can know a login is being opened. It does NOT cover the interval between
            // the user's click and this call -- on the Amazon path that interval is the ~7-8s
            // nile PyInstaller-onefile spawn (F-34.4.2-06), during which the shell has been
            // told nothing. Concretely: if the user clicks Amazon then Humble during that
            // window, Humble presents and Amazon is REFUSED -- the user's first click loses.
            // That is a deliberate trade (an explicit, logged refusal is strictly safer than an
            // unrequested sheet arriving over a dismissed one) and a residual, not full
            // coverage -- see `34.4.2-PLATFORM-SCOPE.md`'s Plan 14 entry.
            //
            // Deliberately `if visible == true {`, NOT the bare `if visible {` this arm uses
            // everywhere else: Plan 08 Test 1 (`tauriShellSource.test.ts`) locates the ORIGINAL
            // `if visible {` block (the builder-setup one containing
            // `login_chrome_css_script(`) via `code.indexOf('if visible {')`, the FIRST
            // occurrence. This guard is required to sit textually BEFORE that block (see the
            // ordering requirement above -- both must be before the same
            // `tauri::WebviewWindowBuilder::new(` call), so an identical bare condition here
            // would make `indexOf` resolve to THIS block instead and silently break that
            // pre-existing test. The comparison changes nothing about the runtime check
            // (`visible` is already a `bool`); `if (visible) {` was tried first and rejected --
            // it compiles but trips rustc's own `unused_parens` warning, violating this file's
            // zero-warnings bar.
            #[cfg(target_os = "macos")]
            if visible == true {
                let now = std::time::Instant::now();
                let mut pending_guard = PENDING_VISIBLE_LOGIN_WINDOW
                    .lock()
                    .map_err(|_| "humble_login_open:pending-lock-poisoned".to_string())?;
                // Expire a stale latch in passing (T-34.4.2-41): a flow that panicked, hung
                // upstream, or was killed mid-flight must not block every later sign-in for the
                // life of the process.
                if let Some((stale_label, armed_at)) = pending_guard.clone() {
                    let age = now.duration_since(armed_at);
                    if pending_login_entry_is_stale(age) {
                        shell_eprintln!(
                            "[shell] humble_login_open: pending login window latch for '{stale_label}' expired after {age:?} (TTL {PENDING_VISIBLE_LOGIN_WINDOW_TTL:?}) -- treating as absent"
                        );
                        *pending_guard = None;
                    }
                }
                let incumbent = pending_guard
                    .as_ref()
                    .map(|(pending_label, _)| pending_label.clone())
                    .or_else(|| {
                        PRESENTED_LOGIN_SHEETS
                            .lock()
                            .ok()
                            .and_then(|guard| guard.as_ref().and_then(|list| list.first().cloned()))
                    });
                if let Some(incumbent_label) = incumbent {
                    shell_eprintln!(
                        "[shell] humble_login_open: REFUSED visible login window '{label}' -- '{incumbent_label}' is already pending or presented (T-34.4.2-39 single-flight)"
                    );
                    return Err("humble_login_open:login-already-in-progress".to_string());
                }
                *pending_guard = Some((label.clone(), now));
                shell_eprintln!(
                    "[shell] humble_login_open: visible login window '{label}' armed as the single pending login flow (T-34.4.2-39)"
                );
            }
            // quick-261029-o1w (GOG) and quick-261029-utr (Epic): the pristine window, presented
            // as a sheet. Placed AFTER the latch so a refused second login never builds a window
            // and both stores arm the latch. `store` comes only from the validated URL host.
            #[cfg(target_os = "macos")]
            if is_epic_login || is_gog_login {
                let store = if is_epic_login { "epic" } else { "gog" };
                return open_pristine_login_sheet(app, &label, url, visible, user_agent, store);
            }
            // Shared last-known main-frame origin (Phase 34.5 Plan 27): seeded from the
            // validated open URL so it is never empty, updated only from `on_page_load`
            // (main-frame only, per this arm's own doc comment above), and read by
            // `on_document_title_changed` so a title change is always composed against
            // the CURRENT host, not the one the window opened on.
            let current_origin = Arc::new(Mutex::new(origin.clone()));
            // CR-01 fix (gap cycle following 34.4.2-LIVE-GATE-RERUN.md's FAIL 0/6): on macOS
            // this window is the sheet CANDIDATE `present_login_window_as_sheet` attempts to
            // attach further down this arm, after `.build()`. `beginSheet:completionHandler:`
            // expects to be the thing that orders the sheet window in and makes it key --
            // building it `.visible(true)`/`.focused(true)` here races that call (tao/wry
            // orders the window in and takes key status synchronously during `.build()`,
            // strictly BEFORE `beginSheet:` ever runs), so AppKit silently does not attach it
            // and the window is left as an ordinary titled window (F-34.4.2-03). So on macOS
            // the sheet candidate is ALWAYS built `.visible(false)` regardless of this arm's
            // own `visible` argument -- presentation happens exclusively through
            // `present_login_window_as_sheet`'s `beginSheet:` call below, with an explicit
            // visible-fallback (see the `sheet_presented` block further down this arm) so a
            // failed attach never leaves the user looking at nothing. Windows/Linux have no
            // sheet concept and keep exactly today's behavior (REQ-34.4.2-08).
            #[cfg(target_os = "macos")]
            let initial_visible = false;
            #[cfg(not(target_os = "macos"))]
            let initial_visible = visible;
            let mut builder =
                tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::External(url))
                    .user_agent(user_agent)
                    .visible(initial_visible);
            if visible {
                let title_origin = Arc::clone(&current_origin);
                // D-29-05 (Phase 34.4.1 gap cycle 3, plan 33): a PROVISIONAL title, so the
                // window never presents as the framework default "Tauri app". Root cause was
                // established from ordering evidence: `presentation requested` precedes the
                // first `title change applied len=22` in the same scrollback, and the interval
                // between them is a titleless window showing the application default.
                //
                // WR-07 IS NOT RE-OPENED, and the distinction is the whole point. WR-07
                // prohibits a hard-coded APPLICATION title -- "the loaded document's own title
                // must show, never a hard-coded 'GameLib'". It does not prohibit an
                // ORIGIN-DERIVED one. `origin` here is `url.origin().ascii_serialization()`
                // (line ~3718), the trustworthy value WR-07 wants shown first, NEVER page
                // content; `login_window_title(&origin, None)` is the same composer the OTHER
                // arms in this file already build with. A static string here -- "GameLib",
                // "Signing in..." -- would be the prohibited thing.
                //
                // This is deliberately the WEAKER of the two guarantees: it establishes only
                // that the bar is never the framework default. The document title still
                // arrives via `on_document_title_changed` below and is APPENDED after this
                // origin -- `origin — document title` (`login_window_title`, main.rs:2083,
                // T-34.5-G6-23) -- never a replacement of it, which is WR-07's actual
                // requirement. That composed title now SURVIVES `PageLoadEvent::Finished`: the
                // `on_page_load` `set_title` refresh below is guarded `Started`-only (quick
                // 260927-o3h); before that guard, the `Finished` pass overwrote it with the
                // bare origin again. The recorded asymmetry stands and is why this comment
                // exists: a grep gate proving `.title(` is never hard-coded can only establish
                // the ABSENCE of the prohibited value -- it structurally cannot establish the
                // PRESENCE of the required one. Only the live gate can.
                //
                // Scoped to `if visible` on purpose: the same arm builds the hidden
                // reveal/clear windows, which have no title bar for a title to matter on
                // (T-34.4.1-82).
                builder = builder.title(login_window_title(&origin, None));
                // Quick task 261003-nsk (D-3) narrowed this from 900 to 572; the operator
                // narrowed it again to 464x592 on 2026-10-03. Measured both times, never a
                // taste call -- `CGWindowListCopyWindowInfo([.optionOnScreenOnly])` against
                // the live `gamelib-shell` pid returned exactly one on-screen login window:
                // w=572 h=700 for the nsk reading, w=464 h=592 for this one (stable across
                // two samples 2s apart).
                //
                // Reading CGWindowList OUTER bounds back into `.inner_size` is sound here
                // and is calibrated, not assumed: the nsk default of 572x700 measured as
                // exactly 572x700, so this window carries no chrome between the two (it is
                // presented as a sheet, which renders no title bar at all -- F-34.5-G6-16).
                //
                // Shared by EVERY runner this arm opens a visible window for (GOG, Amazon,
                // Humble) -- `humble_login_open` takes no `runner` argument by design,
                // so there is no per-runner size and this value moves all of them together.
                // `open_pristine_epic_login_window`'s own `.inner_size(900.0, 700.0)` is a
                // DIFFERENT form layout and stays 900 (D-3) -- see that function's own call
                // site, untouched.
                // quick-261029-osq: stays 592. The old injected bar overlaid the page's top
                // 32px, so the visible page area was already 464x560; the native 32pt bar plus a
                // 560pt webview shows the same area, so the operator-approved size is unchanged.
                builder = builder.inner_size(464.0, 592.0);
                // CR-01 fix (continued): `.center()`/`.focused(true)` are AppKit-owned
                // concerns once this window becomes a sheet -- `beginSheet:` positions the
                // sheet under the parent's title bar and gives it key status itself, so
                // pre-setting them here on macOS would be immediately overridden (harmless)
                // when attachment succeeds, but WOULD be exactly the race described above
                // when it does not run first. The visible-fallback path (below) calls
                // `.center()`/`.set_focus()` itself if attachment is not confirmed, so macOS
                // loses nothing on the failure path either. Windows/Linux keep the original,
                // unconditional immediate center+focus.
                #[cfg(not(target_os = "macos"))]
                {
                    builder = builder.center().focused(true);
                }
                builder = builder
                    .theme(Some(tauri::Theme::Light))
                    .on_document_title_changed(move |window, title| {
                        // Never .unwrap() on a live user-facing path (T-34.4.1-108): a
                        // stale title bar is a cosmetic defect, a panic here would kill
                        // the login flow outright. Never logs the title string itself
                        // (T-34.4.1-106, remote page content must never reach an
                        // uploadable log) -- only the fact that a change was applied
                        // and its LENGTH, the only machine evidence able to
                        // distinguish "the hook never fired" from "the hook fired and
                        // the OS ignored it" if plan 29's operator still sees the
                        // framework default title. `origin_now` is read from the
                        // shared `current_origin` (Phase 34.5 Plan 27) rather than
                        // recomputed here, so this composed title always reflects the
                        // most recent MAIN-FRAME origin, never this callback's own
                        // page-content input.
                        // D-29-04 (Phase 34.4.1 gap cycle 3, plan 33): an EMPTY document
                        // title is now a no-op, not an applied change. WebKit reports a
                        // transient empty title mid-navigation -- the live gate saw the
                        // sequence 22 -> 0 -> 42 -- and applying it dropped the document
                        // title from the bar and back again, because
                        // `login_window_title(origin, Some(""))` falls through its
                        // `!title.is_empty()` guard to the bare origin. The composer was
                        // already correct; the defect was that this callback CALLED it
                        // with a value it should have discarded.
                        //
                        // Explicitly NOT the cause of the `Tauri app` flash (D-29-05),
                        // which is fixed separately below. That was proposed and REFUTED
                        // by ordering: the flash is one-way and completes before the
                        // FIRST title application (len=22), whereas len=0 fires only
                        // after the bar already reads the document's own title. Filed on
                        // its own merits as a latent smell, and fixed as one.
                        //
                        // The skip is still logged. "The hook fired and we ignored it"
                        // and "the hook never fired" are different diagnoses, and the
                        // length is the only machine evidence separating them -- the same
                        // reason the applied branch logs a length and never the string
                        // (T-34.4.1-106: remote page content must never reach an
                        // uploadable log).
                        if title.is_empty() {
                            shell_eprintln!(
                                "[shell] humble_login_open: title change SKIPPED len=0 (empty document title; previous title retained)"
                            );
                            return;
                        }
                        let origin_now = title_origin
                            .lock()
                            .map(|guard| guard.clone())
                            .unwrap_or_default();
                        let composed = login_window_title(&origin_now, Some(&title));
                        let _ = window.set_title(&composed);
                        shell_eprintln!(
                            "[shell] humble_login_open: title change applied len={}",
                            title.len()
                        );
                    });
                // quick-261029-osq: the in-page cancel strip, origin banner and scrollbar inset
                // that used to be injected here are gone. On macOS the sheet's chrome (32pt dark
                // bar, origin label, native x) is a native AppKit bar installed after `.build()`
                // by `install_native_login_bar`, with the webview inset below it. Esc still
                // routes through `request_login_sheet_cancel`.
                //
                // Login-chrome CSS injection (quick task 260822-di1, D-2). Deliberately NOT
                // `#[cfg(target_os = "macos")]`: this substitutes for nothing platform-specific --
                // Humble's marketing footer is visual noise on Windows and Linux too, so it runs
                // unconditionally inside this `if visible` block on every platform.
                builder = builder.initialization_script(&login_chrome_css_script());
                shell_eprintln!(
                    "[shell] humble_login_open: login chrome CSS injected for '{label}'"
                );
                // F-4 machine record (Phase 34.4.1 Plan 24): `.focused(true)` above is
                // a ONE-SHOT raise-on-creation with no persistent state to inspect
                // afterwards, so without this line there is no record of what
                // presentation the operator was actually looking at -- F-4's raised
                // half has now gone UNOBSERVED across two live gates
                // (34.4.1-LIVE-GATE-RERUN.md Item 3). This line records only that
                // sizing/centring/one-shot-focus were REQUESTED and that a persistent
                // pin was deliberately NOT requested (research confirms the platform
                // offers only one or the other, never both, and a persistent pin would
                // trap the operator behind this window when they switch to a password
                // manager -- exactly the switch F-4's observation asks them to
                // perform). It does NOT prove the window actually raised; that
                // observation belongs to plan 29 item 1 alone. `light_theme_requested`
                // records only that Plan 27's `.theme(Some(tauri::Theme::Light))` call
                // above was REQUESTED, mirroring this line's existing discipline --
                // whether the field actually rendered legibly is plan 34.5-28's live
                // check alone. MOVED to after `.build()` by Phase 34.4.2 Plan 02 (still
                // gated on this same `if visible` intent) so it can also record
                // `sheet_presented` -- see the print call after `window` exists, below.
            }
            // Dev-only diagnostic instrumentation (epic-login-non-interactive
            // investigation, 2026-08-02): injects `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`
            // (defined above, near `LOGIN_WINDOW_EVENTS_CAP`) as a Tauri
            // `initialization_script()` on this window BEFORE `.build()` runs --
            // initialization scripts execute before any page script, so this captures
            // Epic's own bootstrap failure instead of only what survives to a later
            // console read. Gated identically to this arm's `open_devtools()` call
            // below -- `#[cfg(debug_assertions)]` AND `if visible` -- so it can never
            // reach a packaged build.
            //
            // THIRD GATE ADDED 2026-08-02, and it DEFAULTS OFF: `GAMELIB_LOGIN_DIAG=1`.
            // This script is an `initialization_script`, so it runs BEFORE Epic's own
            // bundle and replaces `XMLHttpRequest.prototype.open/send` and
            // `window.fetch`. Epic's anti-bot service (Talon) fingerprints the page
            // environment and ships a 6-15 KB attestation payload; patched network
            // primitives on the prototype chain are a canonical automation signal.
            // `/id/api/email/exists` returns a deterministic HTTP 403 whose on-screen
            // copy is the stock anti-bot challenge ("enable javascript and cookies to
            // continue"), and EVERY 403 observation in
            // `.planning/debug/epic-login-non-interactive.md` postdates the commit that
            // added this script (`bf5394a20`) -- before it, symptoms were blank pages
            // and timeouts, never a 403. So the instrumentation is a live suspect for
            // CAUSING the defect it was added to observe, and it must be switchable
            // WITHOUT a rebuild so both arms can be compared in one sitting.
            // Off by default is the safer direction: a diagnostic that perturbs its own
            // measurement should be opt-in, not something a routine dev run inherits.
            #[cfg(debug_assertions)]
            if visible && std::env::var("GAMELIB_LOGIN_DIAG").as_deref() == Ok("1") {
                builder = builder.initialization_script(DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT);
                shell_eprintln!(
                    "[shell] humble_login_open: GAMELIB-DIAG init script INJECTED for '{label}' (GAMELIB_LOGIN_DIAG=1)"
                );
            }
            let page_load_origin = Arc::clone(&current_origin);
            // Owned clones for the macOS native-bar origin refresh inside `on_page_load`
            // (quick-261029-osq): `update_native_login_bar_origin` needs an `AppHandle` and the
            // window label, and `on_page_load` takes a `move` closure.
            #[cfg(target_os = "macos")]
            let app_for_origin = app.clone();
            #[cfg(target_os = "macos")]
            let label_for_origin = label.clone();
            let window = builder
                .on_page_load(move |window, payload| {
                    let (kind, is_started) = match payload.event() {
                        tauri::webview::PageLoadEvent::Started => ("started", true),
                        tauri::webview::PageLoadEvent::Finished => ("finished", false),
                    };
                    let event = login_event_value(kind, payload.url().as_str());
                    push_login_window_event(&event_label, event);
                    // Main-frame-only origin refresh (Phase 34.5 Plan 27): this hook is
                    // ALREADY the arm's trusted main-frame-only signal (see the
                    // ANTI-PHISHING ORIGIN comment above) -- never `on_navigation`,
                    // which spike 013 measured as 5-of-8 third-party-iframe noise. Gated
                    // on `visible` because this same closure also fires for the hidden
                    // reveal/clear windows this arm builds, which have no title bar for
                    // a title to matter on.
                    if visible {
                        let new_origin = payload.url().origin().ascii_serialization();
                        if let Ok(mut guard) = page_load_origin.lock() {
                            *guard = new_origin.clone();
                        }
                        // `Started`-only guard (quick 260927-o3h; D-01, D-02, D-05). Before
                        // this guard, the `Finished` pass through this closure called
                        // `set_title(&login_window_title(&new_origin, None))` again with
                        // `None` for the document title, overwriting the composed `origin —
                        // document title` that `on_document_title_changed` had already set --
                        // Windows and Linux showed the bare origin forever. Filed and accepted
                        // as a deviation during the Phase 38 Windows sitting (`38-W03`) before
                        // being fixed here by quick task 260927-o3h.
                        //
                        // The guard sits on this ONE line, not on the enclosing `if visible {`
                        // block: the `page_load_origin` write above and the macOS
                        // `update_native_login_bar_origin` call below both still need to
                        // run on `Finished`, to keep the trusted main-frame origin and the
                        // native bar's origin label current.
                        if is_started {
                            let _ = window.set_title(&login_window_title(&new_origin, None));
                        }
                        // Native bar label re-text on main-frame origin change (quick-261029-osq;
                        // supersedes the Phase 34.5 Plan 52 in-page banner eval). KEPT alongside,
                        // never replacing, the `set_title` call above -- Windows/Linux still render
                        // the OS title; the native bar is macOS's substitute for it. `new_origin`
                        // is the shell-validated main-frame URL's origin, never page content
                        // (T-osq-01). Never `.unwrap()` on a live user-facing path (T-34.4.1-108):
                        // a stale label is cosmetic. Logs the LENGTH only, never the origin string
                        // (T-34.4.1-106).
                        #[cfg(target_os = "macos")]
                        {
                            update_native_login_bar_origin(
                                &app_for_origin,
                                &label_for_origin,
                                &new_origin,
                            );
                            shell_eprintln!(
                                "[shell] humble_login_open: origin banner updated len={}",
                                new_origin.len()
                            );
                        }
                    }
                })
                .build()
                .map_err(|e| format!("humble_login_open:build-failed:{e}"))?;
            // AppKit SHEET presentation (Phase 34.4.2 Plan 07, REQ-34.4.2-01/02) -- macOS
            // only. Supersedes Plan 02's child-window attachment per the operator's binding
            // design decision of 2026-08-04 (`34.4.2-LIVE-GATE.md`'s "Binding Design
            // Decision" section): the child-window mechanism went live-CONFIRMED broken
            // (F-34.4.2-01/-02). Presents a VISIBLE login window as a sheet on `main`
            // immediately once it exists. Hidden reveal/clear windows this arm also builds
            // are never presented. The pristine Epic and GOG login windows are presented by
            // `open_pristine_login_sheet`, which returns before this point (quick-261029-utr
            // lifted the REQ-34.4.2-10 Epic descope). On Windows/Linux
            // the login window keeps exactly today's free-floating behavior -- declared
            // UNVERIFIED here, matching the skill's Constraints section.
            // quick-261029-osq: install the native bar (and inset the webview below it) BEFORE the
            // sheet is presented, and confirm it over mpsc. A sheet whose bar is unconfirmed would
            // have no visible exit (T-34.4.2-15 / T-osq-02), so it is never presented -- the
            // free-standing visible fallback below (with the OS close button) runs instead.
            // `Ok` from `with_webview` does not prove the closure ran (see
            // `humble_login_clear_cookies`' macOS branch), hence the mpsc round-trip.
            #[cfg(target_os = "macos")]
            let native_bar_installed = if visible {
                let (bar_tx, bar_rx) = mpsc_channel::<bool>();
                let bar_app = app.clone();
                let bar_label = label.clone();
                let bar_origin = origin.clone();
                match window.with_webview(move |pw| {
                    let ok = (|| -> bool {
                        let Some(mtm) = objc2::MainThreadMarker::new() else {
                            return false;
                        };
                        // SAFETY: `pw.inner()` is a live `WKWebView*` for the duration of a
                        // `with_webview` closure running on the main thread (mtm proves it).
                        let wk: &objc2_app_kit::NSView = unsafe { &*pw.inner().cast() };
                        let Some(container) = (unsafe { wk.superview() }) else {
                            return false;
                        };
                        install_native_login_bar(
                            &container,
                            wk,
                            &bar_origin,
                            bar_app,
                            bar_label,
                            mtm,
                        );
                        true
                    })();
                    let _ = bar_tx.send(ok);
                }) {
                    Ok(()) => bar_rx
                        .recv_timeout(LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT)
                        .unwrap_or(false),
                    Err(_) => false,
                }
            } else {
                false
            };
            #[cfg(target_os = "macos")]
            if visible && !native_bar_installed {
                shell_eprintln!(
                    "[shell] WARN: humble_login_open: '{label}' native login bar unconfirmed -- not presenting as a sheet (no visible exit)"
                );
            }
            #[cfg(target_os = "macos")]
            let sheet_presented = if visible && native_bar_installed {
                // F-34.4.2-04 fix (checkpoint response, 2026-08-04, post commit 751521663):
                // the first live hardware run of the CR-01/CR-02 fix reported a symptom
                // CHANGE -- no window at all (not even the pre-fix free-standing one) plus a
                // spinner that never cleared, i.e. worse than F-34.4.2-03, not better. That
                // shape is exactly what a stall ANYWHERE inside `present_login_window_as_sheet`
                // (including tauri's own unbounded internal `.ns_window()` getters --
                // `LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT`'s own doc comment, above) would look
                // like: if the call never returns, this arm's fallback below (which exists
                // SPECIFICALLY to guarantee visibility) never runs either, because it is
                // gated on `sheet_presented`, which would never get assigned.
                //
                // Racing the WHOLE attempt on its own thread against an independent, bounded
                // watchdog decouples "the fallback is guaranteed to run" from "whatever
                // `present_login_window_as_sheet` is doing eventually finishes" -- the
                // reasoning_checkpoint's own explicit constraint ("never block the main thread
                // waiting on a closure queued to the main thread") is satisfied doubly here:
                // this wait happens on a worker thread exactly like the pre-existing recv
                // calls in this file already do, and it can no longer be starved by a stall
                // this file does not control.
                let (watchdog_tx, watchdog_rx) = mpsc_channel::<bool>();
                let app_for_sheet = app.clone();
                let label_for_sheet = label.clone();
                thread::spawn(move || {
                    let attached = present_login_window_as_sheet(&app_for_sheet, &label_for_sheet);
                    let _ = watchdog_tx.send(attached);
                });
                match watchdog_rx.recv_timeout(LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT) {
                    Ok(attached) => attached,
                    Err(_) => {
                        shell_eprintln!(
                            "[shell] WARN: humble_login_open: '{label}' sheet-attach watchdog exceeded {LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT:?} -- present_login_window_as_sheet has not returned (see that function's own diagnostics for where it last logged); treating as unconfirmed and falling back now rather than waiting further"
                        );
                        false
                    }
                }
            } else {
                false
            };
            #[cfg(not(target_os = "macos"))]
            let sheet_presented = false;
            // T-34.4.2-39 resolution path 1 of 3 (Phase 34.4.2 Plan 14): sheet presentation
            // CONFIRMED -- clear the pending-login latch now that this request has resolved to
            // an on-screen sheet, membership in `PRESENTED_LOGIN_SHEETS` (set inside
            // `present_login_window_as_sheet`'s own `register_presented_login_sheet` call)
            // taking over as this label's "in progress" signal from here on.
            #[cfg(target_os = "macos")]
            if sheet_presented {
                clear_pending_visible_login_window(&label);
            }
            // CR-01 visible-fallback (gap cycle following 34.4.2-LIVE-GATE-RERUN.md's FAIL
            // 0/6): this window was built `.visible(false)` on macOS specifically so
            // `beginSheet:` could be the one to reveal it as a sheet (see the builder-setup
            // block above). If `present_login_window_as_sheet` did not confirm attachment
            // (CR-02's read-back), the window is otherwise ordered nowhere, offscreen, and
            // non-key -- the user would see nothing at all, strictly worse than the
            // free-standing-window symptom this fix was written for. `window.show()` +
            // `window.set_focus()` (post-`.build()` `WebviewWindow` methods, not the builder's
            // own `.center()`/`.inner_size()`/`.focused(true)`/`on_document_title_changed`
            // presentation calls Test 559 scopes to the `if visible {` block above -- this is
            // deliberately a DIFFERENT, later code path, not a second copy of those) restore
            // visibility and key status; none of these calls are fatal to the login flow
            // (T-34.1-22 discipline), so failures here are logged, not propagated. Position is
            // whatever AppKit's default placement is for a window shown without `.center()`
            // having run -- acceptable: an off-center but genuinely visible/focused window is
            // still strictly better than the invisible one this fallback exists to prevent.
            #[cfg(target_os = "macos")]
            if visible && !sheet_presented {
                shell_eprintln!(
                    "[shell] WARN: humble_login_open: '{label}' sheet attachment unconfirmed -- falling back to a free-standing visible window"
                );
                let _ = window.show();
                let _ = window.set_focus();
                // T-34.4.2-39 resolution path 2 of 3 (Phase 34.4.2 Plan 14): the visible
                // fallback also resolves this request -- the window is genuinely on screen
                // (just not as a sheet), so the latch must clear here too, not only on the
                // sheet-confirmed path above.
                clear_pending_visible_login_window(&label);
            }
            if visible {
                // F-4 machine record (Phase 34.4.1 Plan 24) -- see this arm's
                // builder-setup block above for the full "why record this at all"
                // rationale. `sheet_presented` (Phase 34.4.2 Plan 07's sheet-presentation
                // switch, superseding Plan 02's differently-named field) is recorded here;
                // this print still runs AFTER `.build()`/presentation so it can be included.
                shell_eprintln!(
                    "[shell] humble_login_open: presentation requested visible=true width=900 height=700 center=true focus_once=true persistent_pin=false light_theme_requested=true sheet_presented={sheet_presented}"
                );
            }
            // Quick task 260803-eee Task 5: close-detection, added AFTER `.build()` because
            // `on_window_event` is a method on the built `WebviewWindow` handle
            // (`tauri-2.11.5/src/webview/webview_window.rs:1524`), not on the builder --
            // confirmed by direct read of the vendored crate source, mirroring this arm's own
            // established discipline of checking the crate before adding a hook (see the WR-07
            // CORRECTION comment above).
            //
            // THE BUG THIS FIXES: closing this window (any way -- clicking its close button,
            // Cmd+W, the OS window-close gesture) produced NO signal at all on the JS side.
            // `oauthLoginCapture.ts`'s `captureOAuthLogin` kept polling forever until its
            // five-minute deadline, so cancelling a GOG/Epic/Amazon sign-in never resolved
            // `{ status: 'cancelled' }` -- the frontend hook stayed on `awaiting` and the
            // cancel-path navigation fix (Task 4, `onCancelled`/`handleTauriOAuthCancelled`)
            // could never fire, because the outcome it depends on never arrived.
            //
            // `WindowEvent::Destroyed`, not `CloseRequested`: `CloseRequested` fires BEFORE the
            // window is actually gone and exists so a handler can call `api.prevent_close()` --
            // this arm never wants to prevent closing, only observe that it happened, and
            // `Destroyed` is the point that is actually true. Pushed onto the SAME
            // `LOGIN_WINDOW_EVENTS` queue via the SAME `push_login_window_event` helper the
            // `on_page_load` hook above already uses -- one relay mechanism, not two. Fires for
            // ANY window this arm builds (hidden reveal/clear windows included, not gated on
            // `visible`) -- harmless for those, since nothing calls `takeEvents()` on a
            // reveal/clear window's label. F-34.4.2-19 fix: `humble/user.ts`'s own
            // `takeEvents()` consumer (`watchForLogin()`) now settles `{ status: 'error' }`
            // immediately on a `'closed'` entry, rather than discovering the window's absence
            // one poll tick later via a `no-window` cookie-read error (see `loginWindowSeam.ts`'s
            // `LoginWindowNavEvent` doc comment for the full cross-consumer safety argument). No
            // url to relay -- `""`, never a partial/stale navigation url that could be mistaken
            // for one.
            //
            // NOT a race with this arm's own `humble_login_close` (a few match arms below):
            // every caller that closes a window programmatically (`captureOAuthLogin`'s
            // `settle()`, `humble_login_close` itself) does so only AFTER it has already decided
            // the real outcome and stopped consuming events for that label -- so a `'closed'`
            // event produced by that SAME programmatic close is written to a queue nothing reads
            // again, never observed as a spurious cancel.
            let close_event_label = label.clone();
            #[cfg(target_os = "macos")]
            let app_for_dismiss = app.clone();
            window.on_window_event(move |event| {
                if matches!(event, tauri::WindowEvent::Destroyed) {
                    push_login_window_event(&close_event_label, login_event_value("closed", ""));
                    // Mirror of the presentation call above (Phase 34.4.2 Plan 07,
                    // REQ-34.4.2-01/02): unconditional (not gated on `visible`) because a
                    // hidden reveal/clear window was never presented in the first place, so
                    // dismissing it is a guaranteed no-op given the membership gate -- see
                    // `dismiss_login_window_sheet`'s own doc comment.
                    #[cfg(target_os = "macos")]
                    dismiss_login_window_sheet(&app_for_dismiss, &close_event_label);
                    #[cfg(target_os = "macos")]
                    forget_native_login_bar(&app_for_dismiss, &close_event_label);
                    // T-34.4.2-39 resolution path 3 of 3 (Phase 34.4.2 Plan 14): a destroyed
                    // window resolves this request too, whichever way it got there (sheet
                    // dismissed via the cancel strip/Esc, closed while still an unattached
                    // free-standing fallback window, or closed programmatically before either
                    // ran). Unconditional like `dismiss_login_window_sheet` above -- a hidden
                    // reveal/clear window never armed the latch in the first place, so clearing
                    // it here is a guaranteed no-op for those (label-matched, see this
                    // function's own doc comment).
                    #[cfg(target_os = "macos")]
                    clear_pending_visible_login_window(&close_event_label);
                }
            });
            // Seed the title from the validated open URL's origin (Phase 34.5 Plan 27) so
            // it is visible from the moment the window appears, rather than only after the
            // first `on_page_load`/`on_document_title_changed` event.
            if visible {
                let _ = window.set_title(&login_window_title(&origin, None));
            }
            // Dev-only diagnostic (epic-login-non-interactive investigation, 2026-08-01,
            // F-34.5-G6-01): `open_devtools()` is already forced for the "main" webview
            // above (the main-window devtools block in `main()`'s `.setup()`, guarded by the
            // same #[cfg(debug_assertions)]), but
            // THIS arm builds the login window (`loginwin-N-*`) that all five runners share
            // -- and it has never had devtools wired up. That gap left the login page's own
            // JS console unread across four debug cycles despite it being the one webview
            // that renders third-party OAuth pages (Epic, GOG, Amazon, Humble). Gated on
            // `visible` to match every other presentation-only call in this arm (the hidden
            // reveal/clear windows built elsewhere in this file are unaffected) and on
            // `#[cfg(debug_assertions)]` so it can never reach a packaged build. Skipped on
            // Linux through `should_auto_open_devtools`: gated on mechanism (the docked-inspector
            // attach races page boot there), not measured on this window, and applied because
            // the race is not specific to our page.
            #[cfg(debug_assertions)]
            if visible && should_auto_open_devtools(std::env::consts::OS) {
                window.open_devtools();
                shell_eprintln!(
                    "[shell] humble_login_open: devtools opened for '{label}' (debug build)"
                );
            } else if visible {
                shell_eprintln!(
                    "[shell] humble_login_open: devtools NOT auto-opened for '{label}' on linux (debug build) -- the inspector attach races page boot; right-click > Inspect Element opens it"
                );
            }
            Ok(Value::String(label))
        }
        // Return the FULL unfiltered cookie count (`total`) alongside a domain/name
        // filtered `matched` list (Phase 34.4.1 Plan 01, D-02, REQ-34.4.1-01). `total` is
        // the liveness proof (34.4.1-RESEARCH.md Pattern 3) -- the sidecar's poll can
        // distinguish "the jar is genuinely empty" from "the API is silently dead", the
        // `navigator-clipboard-noops-under-tauri` failure shape. The wry cookies-for-url
        // shortcut MUST NOT appear anywhere in this file -- see `cookie_domain_matches`
        // above (the ONLY domain comparison this file uses). This arm
        // never logs a cookie value (T-34.4.1-02); values are returned only to the
        // caller's own explicit request over the already-allowlisted rustInvoke channel.
        //
        // F-34.4.2-12 / D-F2 (gap cycle 4): this is the LOGIN-POLL direction used by
        // `watchForLogin()`, the one call site the original F-34.4.2-12 fix (`6bad86227`)
        // deliberately left out of scope (see that debug session's own `## Residual
        // Risks`). It is mechanically the identical hazard as `humble_login_cookies_for_domain`
        // and `humble_login_clear_cookies`'s `count_matching` closure below: wry's blocking
        // `WebviewWindow::cookies()` resolves to `wait_for_blocking_operation`, which
        // reentrantly pumps `NSRunLoop::mainRunLoop()` from inside tao's
        // `EventLoopHandler::with_callback` -- already holding tao's own handler `Mutex` for
        // the whole user-event dispatch -- and can self-deadlock the main thread. The poll
        // path has NEVER been observed to wedge live (its trigger shape is one call per poll
        // tick against a settled, already-visible window, not a burst against a
        // freshly-created hidden one) -- this closes a latent, mechanically-identical risk,
        // not a measured defect. Same fix, same reasoning as the already-proven sites: never
        // call wry's own blocking getter here on macOS; read the SAME window's own
        // `WKHTTPCookieStore` natively via an async completion handler instead -- the
        // calling closure only registers the callback and returns immediately, so it never
        // blocks inside tao's `with_callback` critical section and never needs (or
        // triggers) a reentrant run-loop pump. The poll direction of `cookie_domain_matches`
        // (caller-supplied host FIRST, the cookie's own domain second -- 34.4.1 Plan 22, F-6
        // Defect A) is deliberately UNCHANGED by this rewrite; `cookies_for_url()` still must
        // never appear anywhere in this file.
        RustInvokeChannel::HumbleLoginCookies => {
            let a = HumbleLoginCookiesArgs::from_args(args)?;
            let label = a.label.as_str();
            let host = a.host.as_str();
            let names: Vec<&str> = a.names.iter().map(String::as_str).collect();
            let window = app
                .get_webview_window(label)
                .ok_or_else(|| format!("humble_login:no-window:{label}"))?;

            #[cfg(target_os = "macos")]
            {
                let (tx, rx) = mpsc_channel::<Result<(usize, Vec<Value>), String>>();
                let filter_host = host.to_string();
                let filter_names: Vec<String> = names.iter().map(|n| n.to_string()).collect();
                if let Err(e) = window.with_webview(move |webview| {
                    let outcome: Result<(), String> = (|| {
                        // Bound but not otherwise read -- see `count_matching`'s identical
                        // `_mtm` binding, above, for why this is kept as a live safety proof.
                        let _mtm = objc2::MainThreadMarker::new().ok_or_else(|| {
                            "humble_login_cookies:no-main-thread-marker".to_string()
                        })?;
                        // SAFETY: mirrors `humble_login_cookies_for_domain`'s own cast --
                        // `webview.inner()` is a live `WKWebView*` for the duration of a
                        // `with_webview` closure running on the main thread; `mtm` proves
                        // this closure is running on the main thread.
                        let view: &objc2_web_kit::WKWebView = unsafe { &*webview.inner().cast() };
                        let data_store = unsafe { view.configuration().websiteDataStore() };
                        let cookie_store = unsafe { data_store.httpCookieStore() };
                        let host_for_filter = filter_host.clone();
                        let names_for_filter = filter_names.clone();
                        let tx_fetch = tx.clone();
                        // SAFETY: `getAllCookies` hands the completion handler a valid, live
                        // array pointer for the duration of this call; `tx_fetch` outlives it.
                        let completion = block2::RcBlock::new(
                            move |cookies: std::ptr::NonNull<
                                objc2_foundation::NSArray<objc2_foundation::NSHTTPCookie>,
                            >| {
                                let cookies_ref = unsafe { cookies.as_ref() };
                                let all_cookies = cookies_ref.to_vec();
                                let total = all_cookies.len();
                                // Never logs a cookie value (T-34.4.1-02) -- names and
                                // domains are read only to feed the pure comparison filters
                                // below, values only into the returned JSON payload the
                                // caller already explicitly requested over the
                                // already-allowlisted rustInvoke channel. POLL direction,
                                // deliberately preserved: the caller-supplied host is the
                                // FIRST argument to `cookie_domain_matches`, the cookie's own
                                // domain the second (34.4.1 Plan 22, F-6 Defect A) -- the
                                // opposite order from the census arm above.
                                let matched: Vec<Value> = all_cookies
                                    .into_iter()
                                    .filter(|c| {
                                        cookie_domain_matches(
                                            &host_for_filter,
                                            Some(&c.domain().to_string()),
                                        )
                                    })
                                    .filter(|c| {
                                        names_for_filter.is_empty()
                                            || names_for_filter
                                                .iter()
                                                .any(|n| n.as_str() == c.name().to_string())
                                    })
                                    .map(|c| {
                                        serde_json::json!({
                                            "name": c.name().to_string(),
                                            "domain": c.domain().to_string(),
                                            "value": c.value().to_string()
                                        })
                                    })
                                    .collect();
                                let _ = tx_fetch.send(Ok((total, matched)));
                            },
                        );
                        unsafe {
                            cookie_store.getAllCookies(&completion);
                        }
                        Ok(())
                    })();
                    if let Err(e) = outcome {
                        let _ = tx.send(Err(e));
                    }
                }) {
                    return Err(format!("humble_login_cookies:dispatch:{e}"));
                }
                match rx.recv_timeout(CLEAR_COOKIES_TIMEOUT) {
                    Ok(Ok((total, matched))) => {
                        Ok(serde_json::json!({ "total": total, "matched": matched }))
                    }
                    Ok(Err(e)) => Err(e),
                    Err(_) => Err("humble_login_cookies:timeout".to_string()),
                }
            }

            // Non-macOS: unchanged wry getter path -- F-34.4.2-12's reentrant-pump
            // mechanism is macOS/WebKit/tao-specific; no live evidence implicates the
            // `webview2`/`webkitgtk` backends, so this path is left exactly as it was (D-09
            // discipline: declare unverified, never silently assume broken or fixed).
            #[cfg(not(target_os = "macos"))]
            {
                let all = window.cookies().map_err(|e| e.to_string())?;
                let total = all.len();
                let matched: Vec<Value> = all
                    .into_iter()
                    .filter(|c| cookie_domain_matches(host, c.domain()))
                    .filter(|c| names.is_empty() || names.contains(&c.name()))
                    .map(|c| {
                        serde_json::json!({
                            "name": c.name(),
                            "domain": c.domain().unwrap_or_default(),
                            "value": c.value()
                        })
                    })
                    .collect();
                Ok(serde_json::json!({ "total": total, "matched": matched }))
            }
        }
        // Drain (not merely read) `label`'s queued navigation events (Phase 34.4.1 Plan
        // 01, REQ-34.4.1-03's navigation relay contract). An absent/never-navigated label
        // resolves an empty array -- a healthy state, not an error.
        RustInvokeChannel::HumbleLoginTakeEvents => {
            let a = HumbleLoginTakeEventsArgs::from_args(args)?;
            let label = a.label.as_str();
            let mut guard = LOGIN_WINDOW_EVENTS
                .lock()
                .map_err(|_| "humble_login_take_events:lock-poisoned".to_string())?;
            let events = guard
                .as_mut()
                .and_then(|map| map.remove(label))
                .unwrap_or_default();
            Ok(Value::Array(events))
        }
        // Close the login window (Phase 34.4.1 Plan 01, D-01). A missing label is a
        // healthy "already closed" state, not an error -- resolves `Bool(false)` rather
        // than erroring, the same D-08 "no window is not a phase failure" shape as
        // `tray_set_icon`'s missing-tray branch above.
        RustInvokeChannel::HumbleLoginClose => {
            let a = HumbleLoginCloseArgs::from_args(args)?;
            let label = a.label.as_str();
            // The pristine Epic login window (`open_pristine_epic_login_window`) is a PLAIN
            // `tauri::Window` with a raw `WKWebView` attached, never a Tauri-managed
            // `WebviewWindow` -- so `get_webview_window(label)` can never find it, for ANY
            // label. This arm used to fall straight through to `Ok(false)`, which the
            // TypeScript side treats as a NON-FATAL close failure (`oauthLoginCapture`'s
            // `settle()` swallows it deliberately, so a close failure cannot fail a login that
            // already succeeded). Net effect: after a fully SUCCESSFUL Epic login the window
            // just stayed on screen, with nothing logged anywhere. Third instance of this exact
            // structural bug -- `humble_login_clear_cookies` (cookies surviving logout) and this
            // one both came from resolving a pristine window through a webview-only lookup.
            // `get_window` finds both kinds, so every other runner's behaviour is unchanged and
            // the pristine window now closes through the same path.
            let closed = match app.get_webview_window(label) {
                Some(window) => {
                    window.close().map_err(|e| e.to_string())?;
                    true
                }
                // `get_window` requires the `unstable` Tauri feature, which D-03
                // (`src-tauri/Cargo.toml`) deliberately scopes to
                // `[target.'cfg(target_os = "macos")'.dependencies]` only -- so this fallback
                // must itself be target-gated, matching the convention already used by every
                // other `unstable`-gated call in this file (e.g. `dispatch_rust_channel`'s
                // "store_embed_open" arm above). The window this fallback exists to find
                // (`open_pristine_epic_login_window`'s raw-WKWebView `Window`, never a managed
                // `WebviewWindow`) is itself `#[cfg(target_os = "macos")]`-gated and can never
                // exist on Linux/Windows, so resolving `false` there changes no real behavior --
                // it is the same "missing label is a healthy already-closed state" contract this
                // arm documents above.
                None => {
                    #[cfg(target_os = "macos")]
                    {
                        match app.get_window(label) {
                            Some(window) => {
                                window.close().map_err(|e| e.to_string())?;
                                true
                            }
                            None => false,
                        }
                    }
                    #[cfg(not(target_os = "macos"))]
                    {
                        false
                    }
                }
            };
            if closed {
                if let Ok(mut guard) = LOGIN_WINDOW_EVENTS.lock() {
                    if let Some(map) = guard.as_mut() {
                        map.remove(label);
                    }
                }
            }
            Ok(Value::Bool(closed))
        }
        // Domain-SCOPED cookie clear (Phase 34.4.1 Plan 01/23, D-08, REQ-34.4.1-06, threat
        // T-34.4.1-03/-98/-99/-100/-101/-102).
        //
        // What the live gate measured (plan 20 item 3): 25 `delete_cookie()` calls, every
        // one `Ok(())`, the jar shrank by exactly 1. All 23 Humble cookies survived. Two
        // INDEPENDENT bugs, both fixed by Plan 23:
        //   1. The returned count used to be the pre-loop size of the matched set,
        //      computed BEFORE the delete loop ran below -- an ATTEMPTED count that could
        //      never report failure. Fixed
        //      on EVERY platform (not just macOS): the count returned now is always
        //      `verified_delete_count(before_matching, after_matching)`, a re-read taken
        //      AFTER the removal actually ran.
        //   2. On macOS specifically: wry's `delete_cookie()`
        //      (wry-0.55.1/src/wkwebview/mod.rs:1248-1267) hands `WKHTTPCookieStore`'s
        //      `deleteCookie` a FRESHLY RECONSTRUCTED `NSHTTPCookie` built from
        //      `cookie_into_wkwebview()`; the completion handler fires unconditionally --
        //      "the operation was processed", not "a cookie was found". The identical
        //      round-trip-loses-a-property bug shape is a filed WebKit defect,
        //      bugs.webkit.org #184938. `Ok(())` was never evidence of anything on this
        //      platform. Fixed by bypassing the round trip entirely (see the macOS branch
        //      below).
        //
        // D-08 is non-negotiable on every platform: never `clear_all_browsing_data()`
        // (wry-0.55.1/src/lib.rs:2137) or any other blanket wipe -- the jar is app-wide and
        // will hold Epic/GOG/Amazon cookies once Phase 34.5 lands. The macOS branch below
        // uses `WKWebsiteDataRecord.displayName()` filtering (domain-suffix, the same
        // discipline `cookie_domain_matches` uses) rather than a bulk API.
        RustInvokeChannel::HumbleLoginClearCookies => {
            let a = HumbleLoginClearCookiesArgs::from_args(args)?;
            let label = a.label.as_str();
            let domain = a.domain.as_str();
            let existing_window = app.get_webview_window(label);

            // Epic pristine-window fallback (macOS only; see
            // `clear_default_data_store_cookies_for_domain`'s own doc comment for the full
            // defect this closes). `open_pristine_epic_login_window` never registers a
            // Tauri-managed `WebviewWindow` under ITS label -- `existing_window` is
            // structurally always `None` for it, for every label, fresh or stale -- so this
            // branch is gated on BOTH "no such webview window" AND "the domain being cleared
            // is one of Epic's own", the only combination `legendary/user.ts`'s
            // `clearEpicCookies` step can ever produce.
            //
            // Phase 35 plan 09 (D-09-CORRECTED): the domain check now spans the whole
            // `EPIC_COOKIE_DOMAINS` set, not the single `epicgames.com` literal it used to be,
            // because `clearEpicCookies` now calls this arm once PER Epic-owned apex. Widening
            // it is what makes the four sibling domains reachable at all -- passing
            // `fortnite.com` to the old single-literal guard fell straight through to
            // `humble_login:no-window:{label}`, an ERROR rather than a clear. The guard stays
            // NARROW for every other storefront, and that property is asserted in both
            // directions by `epic_cookie_domain_matches_*` in this file's own `mod tests`
            // rather than merely claimed in this comment.
            //
            // Phase 40 plan 04 (D-15, T-40-04-07): OR'd with `store_logout_cookie_domain_matches`
            // so GOG and Amazon reach the SAME no-window fallback via their own sentinel labels
            // (`GOG_COOKIE_CLEAR_NO_WINDOW_LABEL`/`AMAZON_COOKIE_CLEAR_NO_WINDOW_LABEL`,
            // `gog/user.ts`/`nile/user.ts`) -- neither store opens a Tauri-managed window at
            // logout time, so `existing_window` is structurally `None` for them too, same as
            // Epic's pristine window. `EPIC_COOKIE_DOMAINS` itself is left untouched.
            //
            // Single caller-routing statement for BOTH cookie arms (this one and the sibling
            // `humble_login_cookies_for_domain` census arm below, which points HERE instead of
            // carrying its own copy -- a second copy drifting out of sync with this one is what
            // produced the contradiction this note replaces, twice over). This arm has exactly
            // four production callers, cited by symbol rather than line number because line
            // numbers are what drifted last time:
            //   * Humble's `disconnect()` (`humble/user.ts`) passes a REAL label, from its own
            //     `seam.open()` call.
            //   * Epic's `clearEpicCookies` (`legendary/user.ts`), GOG's
            //     `clearGogCookiesForLogout` (`gog/user.ts`) and Amazon's
            //     `clearAmazonCookiesForLogout` (`nile/user.ts`) all pass SENTINEL labels that
            //     can never name a live window: `EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL`,
            //     `GOG_COOKIE_CLEAR_NO_WINDOW_LABEL`, `AMAZON_COOKIE_CLEAR_NO_WINDOW_LABEL`.
            //
            // On macOS: Humble ALONE reaches the window-based branch below, because it alone
            // has a real Tauri-registered window -- `existing_window.is_none()` is already
            // false for it, so it never depends on the domain check below at all. The other
            // three all take THIS fallback instead: Epic via `epic_cookie_domain_matches`, GOG
            // and Amazon via `store_logout_cookie_domain_matches`.
            //
            // On Windows/Linux: this whole fallback is compiled out
            // (`#[cfg(target_os = "macos")]` below -- it never even runs there). GOG's and
            // Amazon's helpers (`clearGogCookiesForLogout`, `clearAmazonCookiesForLogout`)
            // return early before ever calling this arm off macOS, and `clearEpicCookies`'s own
            // `isMac` ternary opens a REAL hidden window and passes ITS real label there
            // instead of the sentinel. So off macOS every caller that reaches this arm at all
            // carries a real window label, and no caller is expected to hit the
            // `humble_login:no-window:{label}` error below by design -- this is NOT the same
            // claim as the macOS paragraph above, and writing it as though it were is the exact
            // drift this note replaces.
            #[cfg(target_os = "macos")]
            if existing_window.is_none()
                && (epic_cookie_domain_matches(domain)
                    || store_logout_cookie_domain_matches(domain))
            {
                return clear_default_data_store_cookies_for_domain(app, domain);
            }

            let window =
                existing_window.ok_or_else(|| format!("humble_login:no-window:{label}"))?;

            // The SAME clear-direction filter as before (unedited by Plan 23, Plan 22
            // already proved it correct against Defect A): the cookie's OWN domain first,
            // the caller's fixed target second. Used for BOTH the before- and after-reads,
            // on every platform, so `verified_delete_count`'s subtraction is meaningful.
            //
            // F-34.4.2-12 fix (`.planning/debug/humble-disconnect-main-wedge.md`): on macOS
            // this closure must NEVER call wry's own blocking `WebviewWindow::cookies()`
            // getter. That getter blocks the calling closure inside
            // `wait_for_blocking_operation`'s reentrant `NSRunLoop` pump
            // (wry-0.55.1/src/wkwebview/mod.rs:1446), and when this arm's caller
            // (`dispatch_rust_channel`, always a `thread::spawn`'d worker thread) has its
            // request serviced from INSIDE tao's `EventLoopHandler::with_callback`
            // (`app_state.rs:78`, which holds tao's own handler `Mutex` for the whole
            // user-event dispatch), that reentrant pump can let AppKit's redraw path
            // (`handle_redraw` -> `handle_nonuser_event`) try to relock the SAME mutex the
            // outer frame already holds -- a real, live-reproduced (2/2) main-thread
            // self-deadlock, confirmed by a full hung-process sample (4185/4185 samples in
            // the identical state; see the debug session's Evidence for the backtrace and
            // durable evidence file paths). This is a hard deadlock, not a slow path: no
            // timeout on this call's own `rx.recv()` would help, because the main thread is
            // blocked BELOW that level, inside wry's internals.
            //
            // Fixed the SAME way this arm's own removal branch (below) and
            // `clear_default_data_store_cookies_for_domain` (above) already read/removed
            // cookies safely: `with_webview()` -> `WKHTTPCookieStore.getAllCookies()` via an
            // async completion handler, with the wait on a plain `mpsc_channel` done on the
            // CALLING (worker) thread, never nested inside the main-thread closure itself --
            // that closure only registers the completion block and returns immediately, so it
            // never blocks main-thread control flow and never needs (or triggers) a reentrant
            // run-loop pump. Root-cause fix, not a timing mitigation.
            #[cfg(target_os = "macos")]
            let count_matching = |w: &tauri::WebviewWindow| -> Result<usize, String> {
                let (tx, rx) = mpsc_channel::<Result<usize, String>>();
                let target_domain = domain.to_string();
                if let Err(e) = w.with_webview(move |webview| {
                    let outcome: Result<(), String> = (|| {
                        // Bound but not otherwise read -- kept as the live proof (per its own
                        // type's invariant) that this closure is genuinely running on the
                        // main thread, the same safety receipt `mtm` serves everywhere else
                        // in this file even where no ObjC call actually takes it as an arg.
                        let _mtm = objc2::MainThreadMarker::new().ok_or_else(|| {
                            "humble_login_clear_cookies:count-matching:no-main-thread-marker"
                                .to_string()
                        })?;
                        // SAFETY: mirrors this arm's own removal-branch cast, below --
                        // `webview.inner()` is a live `WKWebView*` for the duration of a
                        // `with_webview` closure running on the main thread (tauri's own doc
                        // guarantee); `mtm` proves this closure is running on the main thread.
                        let view: &objc2_web_kit::WKWebView = unsafe { &*webview.inner().cast() };
                        let data_store = unsafe { view.configuration().websiteDataStore() };
                        let cookie_store = unsafe { data_store.httpCookieStore() };
                        let target = target_domain.clone();
                        let tx_fetch = tx.clone();
                        // SAFETY: `getAllCookies` hands the completion handler a valid, live
                        // array pointer for the duration of this call; `tx_fetch` outlives it.
                        let completion = block2::RcBlock::new(
                            move |cookies: std::ptr::NonNull<
                                objc2_foundation::NSArray<objc2_foundation::NSHTTPCookie>,
                            >| {
                                let cookies_ref = unsafe { cookies.as_ref() };
                                // Never logged (T-34.4.1-02) -- each cookie's domain is read
                                // only to feed the pure, count-only `cookie_domain_matches`
                                // filter, never printed.
                                let count = cookies_ref
                                    .to_vec()
                                    .iter()
                                    .filter(|cookie| {
                                        cookie_domain_matches(
                                            &cookie.domain().to_string(),
                                            Some(&target),
                                        )
                                    })
                                    .count();
                                let _ = tx_fetch.send(Ok(count));
                            },
                        );
                        unsafe {
                            cookie_store.getAllCookies(&completion);
                        }
                        Ok(())
                    })();
                    if let Err(e) = outcome {
                        let _ = tx.send(Err(e));
                    }
                }) {
                    return Err(format!(
                        "humble_login_clear_cookies:count-matching:dispatch:{e}"
                    ));
                }
                match rx.recv_timeout(CLEAR_COOKIES_TIMEOUT) {
                    Ok(inner) => inner,
                    Err(_) => Err("humble_login_clear_cookies:count-matching:timeout".to_string()),
                }
            };
            // Non-macOS: unchanged wry getter path -- F-34.4.2-12's reentrant-pump mechanism
            // is macOS/WebKit/tao-specific (`wait_for_blocking_operation`'s `NSRunLoop` pump
            // colliding with tao's Cocoa-only `EventLoopHandler` mutex); no live evidence
            // implicates the `webview2`/`webkitgtk` backends, so this path is left exactly as
            // it was (D-09 discipline: declare unverified, never silently assume broken or
            // fixed).
            #[cfg(not(target_os = "macos"))]
            let count_matching = |w: &tauri::WebviewWindow| -> Result<usize, String> {
                Ok(w.cookies()
                    .map_err(|e| e.to_string())?
                    .into_iter()
                    .filter(|c| match c.domain() {
                        Some(d) => cookie_domain_matches(d, Some(domain)),
                        None => false,
                    })
                    .count())
            };

            let before_matching = count_matching(&window)?;
            // Nothing to remove -- `verified_delete_count` would return 0 regardless, and
            // this also means a window that never authenticated never touches the macOS
            // with_webview/WKWebsiteDataStore path below at all (behavior bullet in Task
            // 1's own test, re-asserted here at the arm level).
            if before_matching == 0 {
                return Ok(Value::Number(0.into()));
            }

            #[cfg(target_os = "macos")]
            {
                // ---- macOS: WKWebsiteDataStore, never wry's delete_cookie() (Plan 23). ----
                //
                // Threading (source-verified against tauri-runtime-wry-2.11.4's
                // `send_user_message`/`webview_getter!`, NOT assumed from spike 016's raw
                // measurement -- see this plan's SUMMARY for the full reasoning): this arm
                // always runs on a SPAWNED WORKER THREAD (`start_reader`'s `rustInvoke`
                // dispatch does `thread::spawn` before calling `dispatch_rust_channel`),
                // never the tao main thread `with_webview()`'s own doc comment describes.
                // Off the main thread, `Dispatcher::with_webview()` posts the closure via
                // `context.proxy.send_event(...)` and returns `Ok(())` IMMEDIATELY, BEFORE
                // the closure has run (`send_user_message` only runs a message inline when
                // `current_thread().id() == context.main_thread_id`). Spike 016 measured
                // `closure_ran_immediately_after_return=true`, but that measurement's
                // trigger was a WKWebView navigation-delegate callback
                // (`humble_login_open`'s `on_page_load` hook), which genuinely does run on
                // the OS main thread -- a DIFFERENT call site from this arm's real one, and
                // not representative of it. So this arm does NOT rely on `with_webview`'s
                // return for synchrony: it uses the exact channel-plus-wait shape
                // `humble_reveal_post`/`humble_login_clear_storage` already use (a plain
                // `mpsc_channel` + `rx.recv_timeout`) -- the same blocking-on-a-channel
                // pattern `window.cookies()` above already relies on internally
                // (`webview_getter!`'s own `rx.recv()`). No `NSRunLoop` pump is needed here
                // (unlike the throwaway spike016 probe, which ran ON the main thread and
                // would have deadlocked its own run loop by blocking on it): the WORKER
                // thread blocks, the MAIN thread's own event loop keeps servicing the
                // completion handler independently.
                let (tx, rx) = mpsc_channel::<()>();
                let domain_for_closure = domain.to_string();
                // `with_webview`'s `Ok(())` here is NOT proof the closure ran (see above) --
                // only used to detect a structural dispatch failure (no such webview/event
                // loop gone).
                if let Err(e) = window.with_webview(move |webview| {
                    let Some(mtm) = objc2::MainThreadMarker::new() else {
                        // Structurally should not happen inside with_webview's closure
                        // (T-34.4.1-101); fail safe by signalling "done, nothing removed"
                        // rather than hanging the worker thread until CLEAR_COOKIES_TIMEOUT.
                        let _ = tx.send(());
                        return;
                    };
                    // SAFETY: tauri's own `with_webview` doc example casts
                    // `webview.inner()` to `&objc2_web_kit::WKWebView` on macOS verbatim --
                    // this mirrors that example exactly. The reference is valid for the
                    // closure's duration (tauri guarantees `inner()` is a live `WKWebView*`
                    // while the closure runs on the main thread, per its own doc comment).
                    // This is the ONLY raw pointer cast in this arm, confined to the
                    // closure `with_webview()` hands back for the label the caller already
                    // resolved through `app.get_webview_window(label)` above -- the same
                    // fail-closed, generated-label window every other arm in this file
                    // addresses (T-34.4.1-101, D-01).
                    let view: &objc2_web_kit::WKWebView = unsafe { &*webview.inner().cast() };
                    let data_store = unsafe { view.configuration().websiteDataStore() };
                    let data_store_for_removal = data_store.clone();
                    // SAFETY: `mtm` proves this closure is running on the main thread.
                    let all_types =
                        unsafe { objc2_web_kit::WKWebsiteDataStore::allWebsiteDataTypes(mtm) };
                    let tx_fetch = tx.clone();
                    let target_domain = domain_for_closure.clone();
                    let fetch_completion = block2::RcBlock::new(
                        move |records: std::ptr::NonNull<
                            objc2_foundation::NSArray<objc2_web_kit::WKWebsiteDataRecord>,
                        >| {
                            // SAFETY: WebKit hands the completion handler a valid, live
                            // array pointer for the duration of this call.
                            let records_ref = unsafe { records.as_ref() };
                            let all_records: Vec<
                                objc2::rc::Retained<objc2_web_kit::WKWebsiteDataRecord>,
                            > = records_ref.to_vec();
                            let matching_records: Vec<&objc2_web_kit::WKWebsiteDataRecord> =
                                all_records
                                    .iter()
                                    .filter(|record| {
                                        // SAFETY: `displayName()` is a simple ObjC accessor;
                                        // `record` is a live, retained object from
                                        // `all_records`. Never logged (T-34.4.1-39/-75/-91)
                                        // -- passed only into the pure, count-only
                                        // `website_data_record_matches_domain` filter.
                                        let display_name =
                                            unsafe { record.displayName() }.to_string();
                                        website_data_record_matches_domain(
                                            &display_name,
                                            &target_domain,
                                        )
                                    })
                                    .map(|record| &**record)
                                    .collect();
                            if matching_records.is_empty() {
                                let _ = tx_fetch.send(());
                                return;
                            }
                            // Scoped to WKWebsiteDataTypeCookies PLUS the native HTTP
                            // disk/memory cache -- a matched record may also carry
                            // localStorage/IndexedDB/Cache-Storage(fetch) data for the same
                            // domain; `humble_login_clear_storage` (a separate,
                            // already-shipped step) owns THOSE, via injected JS
                            // (localStorage.clear()/indexedDB/`caches`/service-worker
                            // unregister).
                            //
                            // CORRECTION (260928-qvr, the twin site
                            // `epic-cold-jar-login-timeout` deliberately left unfixed --
                            // `.planning/debug/resolved/epic-cold-jar-login-timeout.md`):
                            // this comment previously read "cache data... Plans 15/16's
                            // separate origin-scoped storage clear owns those other
                            // categories", which conflated two distinct WebKit concepts.
                            // The JS-observable `caches` Cache Storage API
                            // (`WKWebsiteDataTypeFetchCache`) IS covered by
                            // `humble_login_clear_storage`'s injected script. WebKit's own
                            // native HTTP resource cache
                            // (`WKWebsiteDataTypeDiskCache`/`WKWebsiteDataTypeMemoryCache`)
                            // is NOT -- there is no JS API for it, only this native
                            // `removeDataOfTypes` call. Left uncovered here, this branch
                            // would share the exact stale-authenticated-content replay gap
                            // the default-store branch above was fixed for. Adding the two
                            // disk/memory-cache types closes that gap for this branch's
                            // sole confirmed caller (Humble's `disconnect()` -- see this
                            // quick task's SUMMARY for the full caller audit), still scoped
                            // to `matching_records` (this domain only) -- not a blanket
                            // wipe (REQ-34.4.1-06). `removeDataOfTypes` still removes only
                            // the types named here, never the whole record, so
                            // localStorage/IndexedDB remain the storage-clear step's
                            // business.
                            //
                            // SAFETY: `WKWebsiteDataTypeCookies`/
                            // `WKWebsiteDataTypeDiskCache`/`WKWebsiteDataTypeMemoryCache`
                            // are valid static `NSString`s this crate exposes; reading an
                            // extern static is the only unsafe part of this line.
                            let cookies_type: &objc2_foundation::NSString =
                                unsafe { objc2_web_kit::WKWebsiteDataTypeCookies };
                            let disk_cache_type: &objc2_foundation::NSString =
                                unsafe { objc2_web_kit::WKWebsiteDataTypeDiskCache };
                            let memory_cache_type: &objc2_foundation::NSString =
                                unsafe { objc2_web_kit::WKWebsiteDataTypeMemoryCache };
                            let cookies_type_set = objc2_foundation::NSSet::from_slice(&[
                                cookies_type,
                                disk_cache_type,
                                memory_cache_type,
                            ]);
                            let matched_record_count = matching_records.len();
                            let records_array =
                                objc2_foundation::NSArray::from_slice(&matching_records);
                            let tx_remove = tx_fetch.clone();
                            let remove_completion = block2::RcBlock::new(move || {
                                let _ = tx_remove.send(());
                            });
                            shell_eprintln!(
                                "[shell] humble_login_clear_cookies: window branch evicting cookies + HTTP disk/memory cache for {matched_record_count} matching data record(s) (domain-scoped, count only)"
                            );
                            // SAFETY: `data_store_for_removal` is a live object obtained
                            // on the main thread above; `cookies_type_set`/
                            // `records_array` are freshly built, live objects;
                            // `remove_completion` outlives the call (WebKit retains the
                            // block for the duration of its async operation).
                            unsafe {
                                data_store_for_removal
                                    .removeDataOfTypes_forDataRecords_completionHandler(
                                        &cookies_type_set,
                                        &records_array,
                                        &remove_completion,
                                    );
                            }
                        },
                    );
                    // SAFETY: `data_store`/`all_types` are live objects obtained above on
                    // the main thread; `fetch_completion` outlives the call.
                    unsafe {
                        data_store
                            .fetchDataRecordsOfTypes_completionHandler(&all_types, &fetch_completion);
                    }
                }) {
                    shell_eprintln!(
                        "[shell] humble_login_clear_cookies: with_webview dispatch failed: {e}"
                    );
                    return Err(format!("humble_login_clear_cookies:dispatch:{e}"));
                }

                if rx.recv_timeout(CLEAR_COOKIES_TIMEOUT).is_err() {
                    shell_eprintln!(
                        "[shell] humble_login_clear_cookies: WKWebsiteDataStore removal timed out waiting for the completion signal"
                    );
                    // Fall through to the re-read below regardless -- a timeout means the
                    // SIGNAL was missed, not necessarily that nothing happened. The
                    // verified count must always come from a re-read (binding constraint
                    // 2), never from whether this signal arrived.
                }

                let after_matching = count_matching(&window)?;
                Ok(Value::Number(
                    verified_delete_count(before_matching, after_matching).into(),
                ))
            }

            #[cfg(windows)]
            {
                // ---- Windows: ICoreWebView2CookieManager directly, never wry's
                // delete_cookie() (debug webview2-delete-cookie-noop). ----
                //
                // MEASURED broken (Phase 38 sitting 5, item 38-W06): every `delete_cookie()`
                // returned `Ok`, the verified delta was 0 for both populated Epic domains.
                // Root cause, source-verified: wry-0.55.1's `delete_cookie`
                // (webview2/mod.rs:1681-1689) rebuilds the cookie via `cookie_into_win32`,
                // which reads `cookie::Cookie::domain()` -- and cookie-0.18.1's `domain()`
                // (lib.rs:777-785) STRIPS a leading `.`. WebView2 treats `.epicgames.com`
                // and `epicgames.com` as different domains, so every domain cookie became a
                // `DeleteCookie` for a host-only cookie that does not exist: `S_OK`, nothing
                // removed. The same round-trip-loses-a-property shape as the macOS bug above.
                //
                // Fix: enumerate with `GetCookies` and hand `DeleteCookie` the ORIGINAL
                // `ICoreWebView2Cookie` objects, so no property is ever reconstructed. The
                // match mirrors `count_matching` exactly (leading dot stripped, then
                // `cookie_domain_matches`), so the removal set is the census set.
                //
                // Two further live-measured facts (2026-09-26, Windows 11 WebView2) shape the
                // rest of this arm:
                //   - `DeleteCookie` is ASYNC: unrealengine.com's cookie was still present on
                //     the first re-read and gone on the second. Hence the settle loop.
                //   - `DeleteCookie` cannot remove a PARTITIONED (CHIPS) cookie. Cloudflare's
                //     `cf_clearance` on `.www.epicgames.com` survived it with `S_OK` and an
                //     unchanged value while `__cf_bm`, identical domain/path/flags, was
                //     removed. CDP `Network.deleteCookies` with the cookie's `partitionKey`
                //     removed it (`issued=1 partitioned=1`, then `after=0`). Hence the CDP
                //     pass for survivors.
                //
                // Threading: this arm runs on a spawned worker thread (see the macOS arm's
                // note), so `with_webview` posts the closure to the main thread and returns
                // at once. The worker blocks on `rx`; the main thread's own message loop
                // services the `GetCookies` completion. The closure never blocks.
                use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_2;
                use windows::core::{Interface, PCWSTR, PWSTR};

                let (tx, rx) = mpsc_channel::<()>();
                let target_domain = domain.to_string();
                if let Err(e) = window.with_webview(move |webview| {
                    let tx_done = tx.clone();
                    let outcome = (|| -> windows::core::Result<()> {
                        // SAFETY: `controller()` is tauri's live `ICoreWebView2Controller`
                        // for this window, valid for the closure's duration on the main
                        // thread; every call below is a plain COM method on it or on
                        // objects it hands back.
                        let core = unsafe { webview.controller().CoreWebView2()? }
                            .cast::<ICoreWebView2_2>()?;
                        let manager = unsafe { core.CookieManager()? };
                        let manager_for_delete = manager.clone();
                        let handler = webview2_com::GetCookiesCompletedHandler::create(
                            Box::new(move |error_code, list| {
                                let result = (|| -> windows::core::Result<()> {
                                    error_code?;
                                    let Some(list) = list else {
                                        return Ok(());
                                    };
                                    let mut count = 0u32;
                                    unsafe { list.Count(&mut count)? };
                                    for idx in 0..count {
                                        let cookie = unsafe { list.GetValueAtIndex(idx)? };
                                        let mut raw = PWSTR::null();
                                        unsafe { cookie.Domain(&mut raw)? };
                                        // Never logged (T-34.4.1-02) -- read only to feed
                                        // the count-only domain filter.
                                        let raw_domain = webview2_com::take_pwstr(raw);
                                        let host =
                                            raw_domain.strip_prefix('.').unwrap_or(&raw_domain);
                                        if cookie_domain_matches(host, Some(&target_domain)) {
                                            // A refused delete is logged and the sweep
                                            // continues -- one bad cookie must not strand
                                            // the rest. The re-read still measures it.
                                            if let Err(e) = unsafe {
                                                manager_for_delete.DeleteCookie(&cookie)
                                            } {
                                                shell_eprintln!(
                                                    "[shell] humble_login_clear_cookies: DeleteCookie refused: {e}"
                                                );
                                            }
                                        }
                                    }
                                    Ok(())
                                })();
                                let _ = tx_done.send(());
                                result
                            }),
                        );
                        unsafe { manager.GetCookies(PCWSTR::null(), &handler)? };
                        Ok(())
                    })();
                    if outcome.is_err() {
                        // Signal "done" rather than hang the worker until the timeout; the
                        // re-read below still measures whatever actually happened.
                        let _ = tx.send(());
                    }
                }) {
                    shell_eprintln!(
                        "[shell] humble_login_clear_cookies: with_webview dispatch failed: {e}"
                    );
                    return Err(format!("humble_login_clear_cookies:dispatch:{e}"));
                }

                if rx.recv_timeout(CLEAR_COOKIES_TIMEOUT).is_err() {
                    shell_eprintln!(
                        "[shell] humble_login_clear_cookies: WebView2 cookie removal timed out waiting for the completion signal"
                    );
                    // Fall through to the re-read regardless, as the macOS arm does.
                }

                // `DeleteCookie` is fire-and-forget: it returns before the browser process
                // has applied the removal. A bounded settle re-reads until the matched set
                // is empty or the window closes. The returned count is still the measured
                // delta of the LAST re-read, never an attempted count -- a removal that
                // genuinely failed still reports 0 after the window.
                let settle_deadline = std::time::Instant::now() + CLEAR_COOKIES_SETTLE;
                let mut after_matching = count_matching(&window)?;
                let mut settle_rereads = 0u32;
                while after_matching > 0 && std::time::Instant::now() < settle_deadline {
                    thread::sleep(Duration::from_millis(100));
                    after_matching = count_matching(&window)?;
                    settle_rereads += 1;
                }
                // Counts only, never a cookie name or value. Tells the live gate whether the
                // removal landed synchronously (0 re-reads) or needed the settle window.
                shell_eprintln!(
                    "[shell] humble_login_clear_cookies: before={before_matching} after={after_matching} settle_rereads={settle_rereads}"
                );
                if after_matching > 0 {
                    // Survivors of `DeleteCookie`: partitioned (CHIPS) cookies, which that API
                    // cannot address (measured, see this arm's header). CDP
                    // `Network.deleteCookies` takes the partition key. A CDP failure is logged,
                    // not returned -- the re-read below still measures whatever actually
                    // happened, and the TS guard fails closed on a residual. Cost: a domain
                    // holding a partitioned cookie waits out the first settle window (2s)
                    // before this pass runs.
                    match webview2_cdp_delete_matching_cookies(&window, domain) {
                        Ok((issued, partitioned)) => shell_eprintln!(
                            "[shell] humble_login_clear_cookies: CDP cleanup issued={issued} partitioned={partitioned}"
                        ),
                        Err(e) => shell_eprintln!(
                            "[shell] humble_login_clear_cookies: CDP cleanup failed: {e}"
                        ),
                    }
                    let cdp_deadline = std::time::Instant::now() + CLEAR_COOKIES_SETTLE;
                    after_matching = count_matching(&window)?;
                    while after_matching > 0 && std::time::Instant::now() < cdp_deadline {
                        thread::sleep(Duration::from_millis(100));
                        after_matching = count_matching(&window)?;
                    }
                    shell_eprintln!(
                        "[shell] humble_login_clear_cookies: after CDP cleanup after={after_matching}"
                    );
                }
                Ok(Value::Number(
                    verified_delete_count(before_matching, after_matching).into(),
                ))
            }

            #[cfg(all(not(target_os = "macos"), not(windows)))]
            {
                // ---- Linux: UNVERIFIED on the existing wry `delete_cookie()` path (D-09,
                // REQ-34.4.1-13). Both measured platforms have now shown wry's
                // `delete_cookie` round trip losing a property (macOS: the NSHTTPCookie
                // rebuild; Windows: cookie-0.18's `domain()` dropping the leading dot, see
                // the Windows arm above). wry's `webkitgtk` `delete_cookie`
                // (webkitgtk/mod.rs:1086) rebuilds via `cookie_into_soup_cookie`, which reads
                // the same stripped `domain()` (webkitgtk/mod.rs:975-979), so this arm is
                // SUSPECTED broken for domain cookies, but it has never been measured on a
                // Linux machine and is DECLARED unverified, never silently assumed fixed
                // (nor silently assumed broken).
                let matching: Vec<_> = window
                    .cookies()
                    .map_err(|e| e.to_string())?
                    .into_iter()
                    .filter(|c| match c.domain() {
                        Some(d) => cookie_domain_matches(d, Some(domain)),
                        None => false,
                    })
                    .collect();
                for cookie in matching {
                    window.delete_cookie(cookie).map_err(|e| e.to_string())?;
                }
                let after_matching = count_matching(&window)?;
                Ok(Value::Number(
                    verified_delete_count(before_matching, after_matching).into(),
                ))
            }
        }
        // Issue the reveal-key POST from a hidden, on-demand child window's own JS `fetch()`
        // (Phase 34.4.1 Plan 04, D-07/D-08, REQ-34.4.1-05) -- the ONE structurally-new option
        // for humblePostRequest's transport under Tauri, because a genuine WKWebView network
        // stack is the one place a real browser TLS/HTTP fingerprint exists. Never logs the
        // script, the body, the csrf token or the response payload (T-34.4.1-21/T-28-04
        // convention) -- only channel names and generic error text ever reach `eprintln!`.
        //
        // Every exit path below closes the window before returning (D-08 -- no idle
        // authenticated window persists between reveals):
        //   - bad-args / window-build-failure: no window was ever created, nothing to close.
        //   - script injection failure: closed immediately below, then returns the error.
        //   - success / script-parse-failure / timeout (after `rx.recv_timeout`): the single
        //     close call right after the recv covers all three of these outcomes at once.
        RustInvokeChannel::HumbleRevealPost => {
            let parsed = reveal_post_args(args)?;
            let label = next_login_window_label();
            let (tx, rx) = mpsc_channel::<String>();
            let window = match tauri::WebviewWindowBuilder::new(
                app,
                &label,
                tauri::WebviewUrl::External(parsed.origin_url.clone()),
            )
            .user_agent(&parsed.user_agent)
            .visible(false) // D-08: hidden, on-demand -- never the login flow's own visible window
            .on_navigation(move |url| {
                if url.host_str() == Some(REVEAL_EXFIL_HOST) {
                    if let Some((_, payload)) = url.query_pairs().find(|(k, _)| k == "data") {
                        let _ = tx.send(payload.into_owned());
                    }
                    // Cancel -- gamelib.invalid is RFC 2606 reserved and never actually
                    // resolves regardless (Open Question 1), but this is the real guard.
                    return false;
                }
                true
            })
            .build()
            {
                Ok(w) => w,
                Err(e) => {
                    shell_eprintln!("[shell] humble_reveal_post: window build failed: {e}");
                    return Err(format!("humble_reveal_post:window:{e}"));
                }
            };

            let script = reveal_post_script(
                &parsed.path,
                &parsed.body,
                parsed.csrf_token.as_deref(),
                REVEAL_EXFIL_HOST,
            );
            if let Err(e) = window.eval(&script) {
                let _ = window.close(); // close site 1: script injection itself failed
                shell_eprintln!("[shell] humble_reveal_post: script injection failed: {e}");
                return Err(format!("humble_reveal_post:script:{e}"));
            }

            let outcome = rx.recv_timeout(REVEAL_POST_TIMEOUT);
            let _ = window.close(); // close site 2: covers success, parse-failure AND timeout below

            match outcome {
                Ok(raw) => serde_json::from_str::<Value>(&raw).map_err(|e| {
                    shell_eprintln!("[shell] humble_reveal_post: exfil payload parse failed: {e}");
                    format!("humble_reveal_post:script:{e}")
                }),
                Err(_) => Err("humble_reveal_post:timeout".to_string()),
            }
        }
        // Origin-scoped storage clear (34.4.1 gap cycle plan 15, F-6 BLOCKING,
        // REQ-34.4.1-06/REQ-34.4.1-GAP-03). Same hidden-window + navigation-intercept-exfil
        // template as `humble_reveal_post` above, reused verbatim for its timeout/close
        // discipline. Never logs the origin, the storage contents, key names or the exfil
        // payload (T-34.4.1-21/T-28-04 convention) -- only the channel name and generic error
        // text ever reach `eprintln!`.
        //
        // Every exit path below closes the window before returning (D-08 -- no idle
        // authenticated window persists after a clear):
        //   - bad-args / window-build-failure: no window was ever created, nothing to close.
        //   - script injection failure: closed immediately below, then returns the error.
        //   - success / script-parse-failure / timeout (after `rx.recv_timeout`): the single
        //     close call right after the recv covers all three of these outcomes at once.
        RustInvokeChannel::HumbleLoginClearStorage => {
            let parsed = clear_storage_args(args)?;
            let label = next_login_window_label();
            let (tx, rx) = mpsc_channel::<String>();
            let window = match tauri::WebviewWindowBuilder::new(
                app,
                &label,
                tauri::WebviewUrl::External(parsed.origin_url.clone()),
            )
            .user_agent(&parsed.user_agent)
            .visible(false) // D-08: hidden, on-demand -- never a visible login window
            .on_navigation(move |url| {
                if url.host_str() == Some(REVEAL_EXFIL_HOST) {
                    if let Some((_, payload)) = url.query_pairs().find(|(k, _)| k == "data") {
                        let _ = tx.send(payload.into_owned());
                    }
                    // Cancel -- gamelib.invalid is RFC 2606 reserved and never actually
                    // resolves regardless (mirrors humble_reveal_post's Open Question 1
                    // disposition), but this is the real guard.
                    return false;
                }
                true
            })
            .build()
            {
                Ok(w) => w,
                Err(e) => {
                    shell_eprintln!("[shell] humble_login_clear_storage: window build failed: {e}");
                    return Err(format!("humble_login_clear_storage:window:{e}"));
                }
            };

            let script = clear_storage_script(REVEAL_EXFIL_HOST);
            if let Err(e) = window.eval(&script) {
                let _ = window.close(); // close site 1: script injection itself failed
                shell_eprintln!("[shell] humble_login_clear_storage: script injection failed: {e}");
                return Err(format!("humble_login_clear_storage:script:{e}"));
            }

            let outcome = rx.recv_timeout(CLEAR_STORAGE_TIMEOUT);
            let _ = window.close(); // close site 2: covers success, parse-failure AND timeout below

            match outcome {
                Ok(raw) => serde_json::from_str::<Value>(&raw).map_err(|e| {
                    shell_eprintln!(
                        "[shell] humble_login_clear_storage: exfil payload parse failed: {e}"
                    );
                    format!("humble_login_clear_storage:script:{e}")
                }),
                Err(_) => Err("humble_login_clear_storage:timeout".to_string()),
            }
        }
        // Correctly-directed domain-scoped cookie read (Phase 34.4.1 Plan 22, F-6 Defect A,
        // REQ-34.4.1-GAP-07). `cookie_domain_matches` (above) is directional: `host == d ||
        // host.ends_with(".{d}")` only ever fires when `host` is the NARROWER string. The
        // existing `humble_login_cookies` arm passes the caller's `host` first -- exactly
        // right for `watchForLogin()`'s question ("does this cookie's domain cover the page
        // I am on?"), proven correct by spike 014a, and left UNCHANGED here. It is exactly
        // WRONG for the disconnect census's question ("does this cookie belong to the target
        // domain or any of its subdomains?"): with a FIXED apex as `host`, the suffix branch
        // can never fire, so a caller passing a fixed domain through that arm only ever
        // matches cookies whose domain attribute is the bare target string, silently
        // undercounting every leading-dot- and subdomain-scoped cookie (spike 016 measured
        // this live: total=33, that arm's direction=29, this arm's direction=33/33 -- see
        // `34.4.1-SPIKE-016-FINDINGS.md`). This arm exists SOLELY to answer that second
        // question -- it filters with the cookie's OWN domain first, the caller's fixed
        // target second, mirroring `humble_login_clear_cookies`'s (unchanged) filter exactly.
        // Two arms exist, not one, because the two call sites ask two different questions of
        // the same directional function; collapsing them would break the login poll to fix
        // the census. Same `total`-is-the-liveness-proof contract, same never-`cookies_for_url()`
        // / never-`clear_all_browsing_data()` discipline, same never-logs-a-cookie-value
        // discipline (T-34.4.1-02, T-34.4.1-94) as `humble_login_cookies` above.
        RustInvokeChannel::HumbleLoginCookiesForDomain => {
            let a = HumbleLoginCookiesForDomainArgs::from_args(args)?;
            let label = a.label.as_str();
            let domain = a.domain.as_str();
            let names: Vec<&str> = a.names.iter().map(String::as_str).collect();
            let existing_window = app.get_webview_window(label);

            // Epic pristine-window fallback (macOS only; D-35-29-01). Structurally identical
            // to `humble_login_clear_cookies`'s own fallback above, deliberately so: the two
            // arms had the SAME defect and only the clear half had been fixed, which is why
            // the clear ran while the census that judges it returned nothing on every host of
            // every live logout. See `default_data_store_cookies_for_domain`'s doc comment
            // for the mechanism and the wry-round-trip accounting it preserves.
            //
            // Gated on BOTH "no such webview window" AND "the domain is one of Epic's own",
            // the only combination `legendary/user.ts`'s census can ever produce.
            //
            // Phase 40 plan 04 (D-15, T-40-04-07/-08): OR'd with
            // `store_logout_cookie_domain_matches`, mirroring the sibling widening in
            // `humble_login_clear_cookies` above -- GOG/Amazon's before/after cookie census
            // needs the SAME no-window path their clear already takes, or the census would
            // always read `no-window:{label}` and never prove the clear did anything.
            //
            // Caller routing (who reaches THIS branch vs. the window-based read below, on
            // which platform) is NOT restated here -- it lives once, in
            // `humble_login_clear_cookies`'s own "Single caller-routing statement" note above,
            // to keep it from drifting out of sync the way it just did. This arm's callers are
            // the SAME four, reached through `seam.cookiesForDomain` rather than
            // `seam.clearCookies`, and Epic's census reuses the very same `label` binding
            // `clearEpicCookies`'s `isMac` ternary already produced for the clear call -- so
            // the routing is identical, not merely similar.
            #[cfg(target_os = "macos")]
            if existing_window.is_none()
                && (epic_cookie_domain_matches(domain)
                    || store_logout_cookie_domain_matches(domain))
            {
                return default_data_store_cookies_for_domain(app, domain, &names);
            }

            let window = existing_window
                .ok_or_else(|| format!("humble_login_cookies_for_domain:no-window:{label}"))?;

            // F-34.4.2-12 fix (see `humble_login_clear_cookies`'s `count_matching` closure,
            // above, for the full mechanism this closes): this arm is disconnect's cookie
            // census (`readCensus()`), called TWICE against the SAME just-created hidden
            // window in quick succession, alongside `count_matching`'s own two calls -- four
            // wry `.cookies()` round trips against one freshly-created, still-rendering
            // WKWebView was the reproduced deadlock's exact trigger shape (live sample:
            // 4185/4185 samples in the identical self-deadlocked state). Same fix, same
            // reasoning: never call wry's own blocking `WebviewWindow::cookies()` getter here
            // on macOS; read the SAME window's own `WKHTTPCookieStore` natively via an async
            // completion handler instead -- the calling closure only registers the callback
            // and returns immediately, so it never blocks inside tao's `with_callback`
            // critical section and never needs (or triggers) a reentrant run-loop pump.
            #[cfg(target_os = "macos")]
            {
                let (tx, rx) = mpsc_channel::<Result<(usize, Vec<Value>), String>>();
                let target_domain = domain.to_string();
                let target_names: Vec<String> = names.iter().map(|n| n.to_string()).collect();
                if let Err(e) = window.with_webview(move |webview| {
                    let outcome: Result<(), String> = (|| {
                        // Bound but not otherwise read -- see `count_matching`'s identical
                        // `_mtm` binding, above, for why this is kept as a live safety proof.
                        let _mtm = objc2::MainThreadMarker::new().ok_or_else(|| {
                            "humble_login_cookies_for_domain:no-main-thread-marker".to_string()
                        })?;
                        // SAFETY: mirrors `humble_login_clear_cookies`'s own removal-branch
                        // cast -- `webview.inner()` is a live `WKWebView*` for the duration of
                        // a `with_webview` closure running on the main thread; `mtm` proves
                        // this closure is running on the main thread.
                        let view: &objc2_web_kit::WKWebView = unsafe { &*webview.inner().cast() };
                        let data_store = unsafe { view.configuration().websiteDataStore() };
                        let cookie_store = unsafe { data_store.httpCookieStore() };
                        let filter_domain = target_domain.clone();
                        let filter_names = target_names.clone();
                        let tx_fetch = tx.clone();
                        // SAFETY: `getAllCookies` hands the completion handler a valid, live
                        // array pointer for the duration of this call; `tx_fetch` outlives it.
                        let completion = block2::RcBlock::new(
                            move |cookies: std::ptr::NonNull<
                                objc2_foundation::NSArray<objc2_foundation::NSHTTPCookie>,
                            >| {
                                let cookies_ref = unsafe { cookies.as_ref() };
                                let all_cookies = cookies_ref.to_vec();
                                let total = all_cookies.len();
                                // Never logs a cookie value (T-34.4.1-02/T-34.4.1-94) -- names
                                // and domains are read only to feed the pure comparison
                                // filters below, values only into the returned JSON payload
                                // the caller already explicitly requested over the
                                // already-allowlisted rustInvoke channel.
                                let matched: Vec<Value> = all_cookies
                                    .into_iter()
                                    .filter(|c| {
                                        cookie_domain_matches(
                                            &c.domain().to_string(),
                                            Some(&filter_domain),
                                        )
                                    })
                                    .filter(|c| {
                                        filter_names.is_empty()
                                            || filter_names
                                                .iter()
                                                .any(|n| n.as_str() == c.name().to_string())
                                    })
                                    .map(|c| {
                                        serde_json::json!({
                                            "name": c.name().to_string(),
                                            "domain": c.domain().to_string(),
                                            "value": c.value().to_string()
                                        })
                                    })
                                    .collect();
                                let _ = tx_fetch.send(Ok((total, matched)));
                            },
                        );
                        unsafe {
                            cookie_store.getAllCookies(&completion);
                        }
                        Ok(())
                    })();
                    if let Err(e) = outcome {
                        let _ = tx.send(Err(e));
                    }
                }) {
                    return Err(format!("humble_login_cookies_for_domain:dispatch:{e}"));
                }
                match rx.recv_timeout(CLEAR_COOKIES_TIMEOUT) {
                    Ok(Ok((total, matched))) => {
                        Ok(serde_json::json!({ "total": total, "matched": matched }))
                    }
                    Ok(Err(e)) => Err(e),
                    Err(_) => Err("humble_login_cookies_for_domain:timeout".to_string()),
                }
            }

            // Non-macOS: unchanged wry getter path -- see `count_matching`'s own non-macOS
            // branch, above, for why this is left as-is (D-09 discipline).
            #[cfg(not(target_os = "macos"))]
            {
                let all = window.cookies().map_err(|e| e.to_string())?;
                let total = all.len();
                let matched: Vec<Value> = all
                    .into_iter()
                    .filter(|c| match c.domain() {
                        Some(d) => cookie_domain_matches(d, Some(domain)),
                        None => false,
                    })
                    .filter(|c| names.is_empty() || names.contains(&c.name()))
                    .map(|c| {
                        serde_json::json!({
                            "name": c.name(),
                            "domain": c.domain().unwrap_or_default(),
                            "value": c.value()
                        })
                    })
                    .collect();
                Ok(serde_json::json!({ "total": total, "matched": matched }))
            }
        }
        // Take an OS power assertion (Phase 35 Plan 08, D-08, REQ-35-06). Backs
        // `platform/index.ts`'s `powerSaveBlocker.start()`, which until this plan returned `-1`
        // and held nothing. `args[0]` is one of exactly two Electron kind strings; anything
        // else is REJECTED by `wake_lock_kind` rather than defaulted (threat T-35-32).
        //
        // Like the clipboard arms, this is a `dispatch_rust_channel` arm and NOT a
        // `generate_handler!` command: the caller is the sidecar over `requestRustInvoke`, and
        // `generate_handler!` is the renderer's surface. Registering it there would be dead
        // code that also handed the webview a power-management capability it has no use for,
        // against D-02's zero-renderer-capability-grant stance.
        RustInvokeChannel::WakeLockStart => {
            let a = WakeLockStartArgs::from_args(args)?;
            let id = wake_lock_start(&a.kind)?;
            Ok(Value::from(id))
        }
        // Release exactly the assertion `args[0]` names (Phase 35 Plan 08, D-08, REQ-35-06).
        // An id outside u32 range cannot name a live assertion, so it is rejected as bad args
        // rather than truncated into one that could name somebody else's lock.
        RustInvokeChannel::WakeLockStop => {
            let a = WakeLockStopArgs::from_args(args)?;
            let id = u32::try_from(a.id).map_err(|_| "wake_lock_stop:bad-args".to_string())?;
            wake_lock_stop(id)?;
            Ok(Value::Null)
        }
        // Phase 63 (D-03): executable scanners. Each arm is a one-line pass-through to the
        // Tauri-free gamelib-scan crate, the same dispatch the headless gamelib-scan-cli uses.
        // dispatch_rust_channel arms, not generate_handler! commands: the caller is the sidecar
        // over `requestRustInvoke`, and the renderer gets no scanner capability.
        RustInvokeChannel::ScanSteamApiImports => {
            ScanSteamApiImportsArgs::from_args(args)?;
            gamelib_scan::dispatch("scan_steam_api_imports", args)
        }
        RustInvokeChannel::ScanSteamDrm => {
            ScanSteamDrmArgs::from_args(args)?;
            gamelib_scan::dispatch("scan_steam_drm", args)
        }
        RustInvokeChannel::ScanSteamstubSection => {
            ScanSteamstubSectionArgs::from_args(args)?;
            gamelib_scan::dispatch("scan_steamstub_section", args)
        }
        RustInvokeChannel::ScanPeImportedDlls => {
            ScanPeImportedDllsArgs::from_args(args)?;
            gamelib_scan::dispatch("scan_pe_imported_dlls", args)
        }
        RustInvokeChannel::ScanContainedReal => {
            ScanContainedRealArgs::from_args(args)?;
            gamelib_scan::dispatch("scan_contained_real", args)
        }
        RustInvokeChannel::ScanWinemacMetalExports => {
            ScanWinemacMetalExportsArgs::from_args(args)?;
            gamelib_scan::dispatch("scan_winemac_metal_exports", args)
        }
        // ---- In-app store/wiki embed (Phase 40 Plan 02, D-01/D-03). Every arm is macOS + Linux
        // (quick 260930-blh) + Windows (quick 261012-f25) per D-03's target-gated `unstable`
        // feature; a target outside those three returns a legible error rather than silently
        // compiling this section out (see the section doc comment above `STORE_EMBED_LABEL` for
        // the full rationale). No shipped target compiles that branch. ----
        RustInvokeChannel::StoreEmbedOpen => {
            #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
            {
                store_embed_open(app, args)
            }
            #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
            {
                Err("store_embed_open:unsupported-platform".to_string())
            }
        }
        RustInvokeChannel::StoreEmbedSetBounds => {
            #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
            {
                store_embed_set_bounds(app, args)
            }
            #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
            {
                Err("store_embed_set_bounds:unsupported-platform".to_string())
            }
        }
        RustInvokeChannel::StoreEmbedHide => {
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
        RustInvokeChannel::StoreEmbedShow => {
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
        RustInvokeChannel::StoreEmbedClose => {
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
        RustInvokeChannel::StoreEmbedTakeNavEvents => {
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
        RustInvokeChannel::StoreEmbedBack => {
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
        RustInvokeChannel::StoreEmbedForward => {
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
        RustInvokeChannel::StoreEmbedReload => {
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
        RustInvokeChannel::StoreEmbedNavigate => {
            #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
            {
                store_embed_navigate(app, args)
            }
            #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
            {
                Err("store_embed_navigate:unsupported-platform".to_string())
            }
        }
    }
}

