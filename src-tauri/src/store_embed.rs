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
        RustInvokeChannel::KeyringGet => rpc_keyring_get(channel, args),
        RustInvokeChannel::KeyringSet => rpc_keyring_set(channel, args),
        RustInvokeChannel::KeyringDelete => rpc_keyring_delete(channel, args),
        RustInvokeChannel::KeyringAvailable => rpc_keyring_available(channel, args),
        RustInvokeChannel::DialogOpen => rpc_dialog_open(args, app),
        RustInvokeChannel::DialogMessage => rpc_dialog_message(args, app),
        RustInvokeChannel::NotificationShow => rpc_notification_show(args, app),
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
        RustInvokeChannel::ShellShowItemInFolder => shell_open::shell_show_item_in_folder(app, args),
        // Open a path with the default program (Phase 33 Plan 04, D-05) via
        // `tauri-plugin-opener`'s `open_path`. Backs `platform/index.ts`'s `shell.openPath()`.
        // Same path-provenance note as `shell_show_item_in_folder` above (T-33-11).
        RustInvokeChannel::ShellOpenPath => shell_open::shell_open_path(app, args),
        RustInvokeChannel::ClipboardWriteText => rpc_clipboard_write_text(args, app),
        RustInvokeChannel::ClipboardReadText => rpc_clipboard_read_text(app),
        RustInvokeChannel::AppExit => rpc_app_exit(app),
        RustInvokeChannel::AppRelaunch => rpc_app_relaunch(app),
        RustInvokeChannel::AppHide => rpc_app_hide(app),
        RustInvokeChannel::MainWindowRaise => rpc_main_window_raise(app),
        RustInvokeChannel::MainWindowHide => rpc_main_window_hide(app),
        RustInvokeChannel::BridgeInvitePickerOpen => rpc_bridge_invite_picker_open(args, app),
        RustInvokeChannel::TraySetIcon => rpc_tray_set_icon(args, app),
        RustInvokeChannel::DialogSave => rpc_dialog_save(args, app),
        RustInvokeChannel::HumbleLoginOpen => rpc_humble_login_open(args, app),
        RustInvokeChannel::HumbleLoginCookies => rpc_humble_login_cookies(args, app),
        RustInvokeChannel::HumbleLoginTakeEvents => rpc_humble_login_take_events(args),
        RustInvokeChannel::HumbleLoginClose => rpc_humble_login_close(args, app),
        RustInvokeChannel::HumbleLoginClearCookies => rpc_humble_login_clear_cookies(args, app),
        RustInvokeChannel::HumbleRevealPost => rpc_humble_reveal_post(args, app),
        RustInvokeChannel::HumbleLoginClearStorage => rpc_humble_login_clear_storage(args, app),
        RustInvokeChannel::HumbleLoginCookiesForDomain => rpc_humble_login_cookies_for_domain(args, app),
        RustInvokeChannel::WakeLockStart => rpc_wake_lock_start(args),
        RustInvokeChannel::WakeLockStop => rpc_wake_lock_stop(args),
        RustInvokeChannel::ScanSteamApiImports => rpc_scan_steam_api_imports(args),
        RustInvokeChannel::ScanSteamDrm => rpc_scan_steam_drm(args),
        RustInvokeChannel::ScanSteamstubSection => rpc_scan_steamstub_section(args),
        RustInvokeChannel::ScanPeImportedDlls => rpc_scan_pe_imported_dlls(args),
        RustInvokeChannel::ScanContainedReal => rpc_scan_contained_real(args),
        RustInvokeChannel::ScanWinemacMetalExports => rpc_scan_winemac_metal_exports(args),
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

