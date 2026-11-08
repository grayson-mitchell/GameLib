use super::*;

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
pub(crate) const STORE_EMBED_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
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
    pub(crate) fn as_str(self) -> &'static str {
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
pub(crate) fn store_embed_state() -> &'static Mutex<StoreEmbedState> {
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
