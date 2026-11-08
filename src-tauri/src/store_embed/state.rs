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

#[cfg(test)]
mod tests {
    use super::*;

    // ---- StoreEmbedState (Phase 40 Plan 07, D-22/D-25) ----
    //
    // Pure cursor-based history state machine, provable without a live `AppHandle` or webview
    // (same "prove the pure branch in isolation" discipline as `store_embed_navigation_policy`
    // above). D-25's verdict (`40-EMBED-API-VERIFICATION.md`) confirmed no native back/forward/
    // history API exists on either `tauri::webview::Webview` or `wry::WebView` -- this stack IS
    // the feature, not a convenience wrapper around one.

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_state_default_has_no_back_or_forward() {
        let state = StoreEmbedState::default();
        assert!(!state.can_go_back());
        assert!(!state.can_go_forward());
        assert_eq!(state.current_url(), None);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_state_push_three_then_back_twice_lands_on_first() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/".to_string());
        state.push("https://b.example/".to_string());
        state.push("https://c.example/".to_string());
        assert_eq!(state.current_url().as_deref(), Some("https://c.example/"));

        assert_eq!(state.go_back().as_deref(), Some("https://b.example/"));
        assert_eq!(state.go_back().as_deref(), Some("https://a.example/"));
        assert!(
            !state.can_go_back(),
            "no entry remains before the first push"
        );
        assert!(
            state.suppress_next_push,
            "go_back must arm the one-shot suppression flag for the confirming Finished event"
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_state_forward_once_after_back_returns_to_the_skipped_entry() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/".to_string());
        state.push("https://b.example/".to_string());
        state.go_back();
        assert!(state.can_go_forward());
        assert_eq!(state.go_forward().as_deref(), Some("https://b.example/"));
        assert!(!state.can_go_forward());
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_state_reload_does_not_push_a_duplicate_entry() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/".to_string());
        state.arm_reload_suppression();
        // Mirrors `on_page_load`'s Finished handler firing for the reload's own navigation.
        state.push("https://a.example/".to_string());
        assert_eq!(
            state.history.len(),
            1,
            "reload must not grow the history stack"
        );
        assert_eq!(state.current_url().as_deref(), Some("https://a.example/"));
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_state_back_moves_the_cursor_it_does_not_append_a_new_entry() {
        // Regression test for a defect class encountered while implementing this: a `go_back`
        // that appends the target URL to `history` (treating "go back" like "push") instead of
        // decrementing `cursor` in place. That version still returns the right URL from a
        // shallow "does the target URL come back out" check, but corrupts the stack --
        // `history.len()` grows on every back/forward pair, and a subsequent `can_go_forward()`
        // lies because the "forward" entry ends up BEHIND the cursor instead of ahead of it.
        // This assertion was verified RED against an append-based `go_back` before the
        // move-based fix below was applied -- see 40-07-SUMMARY.md for the observed failure.
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/".to_string());
        state.push("https://b.example/".to_string());
        state.push("https://c.example/".to_string());
        let history_len_before = state.history.len();

        state.go_back();

        assert_eq!(
            state.history.len(),
            history_len_before,
            "go_back must move the cursor, not append a new history entry"
        );
        assert!(
            state.can_go_forward(),
            "after moving back, the entry ahead of the cursor must still be reachable forward"
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_nav_state_json_reports_full_url_host_and_availability() {
        let mut state = StoreEmbedState::default();
        state.push("https://store.steampowered.com/app/440?utm_source=affiliate".to_string());
        state.push("https://example.com/next".to_string());
        state.go_back();

        let json = store_embed_nav_state_json(&state);
        assert_eq!(json["host"], "store.steampowered.com");
        assert_eq!(
            json["url"], "https://store.steampowered.com/app/440?utm_source=affiliate",
            "the full url is still carried on the wire for the frontend's own host-only \
             DISPLAY logic (D-23) -- this JSON is an internal payload, not what gets rendered"
        );
        assert_eq!(json["canGoBack"], false);
        assert_eq!(json["canGoForward"], true);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_nav_state_json_on_empty_state_is_all_empty_never_panics() {
        let state = StoreEmbedState::default();
        let json = store_embed_nav_state_json(&state);
        assert_eq!(json["url"], "");
        assert_eq!(json["host"], "");
        assert_eq!(json["canGoBack"], false);
        assert_eq!(json["canGoForward"], false);
    }

    // ---- GAP-D: the drain queue (quick task `260905-e61`, D-22, REQ-40-06) ----
    //
    // The seven tests above prove the cursor semantics and were all green while GAP-D shipped:
    // they measure what `push` does to the HISTORY, and GAP-D was that `push` did nothing to
    // carry that history anywhere. These five measure the missing half. Each was verified RED
    // against the pre-fix code (no `pending_nav_events` field at all, so they did not compile
    // -- the strongest possible red for an absent mechanism).

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_push_enqueues_a_nav_event_carrying_the_post_push_cursor_state() {
        // THE GAP-D REGRESSION TEST. An in-embed link click reaches `push()` via
        // `on_page_load`'s Finished handler and nothing else -- so if `push` queues nothing,
        // the renderer can never learn that `canGoBack` became true.
        let mut state = StoreEmbedState::default();
        state.push("https://af.gog.com/".to_string());
        state.push("https://www.gog.com/game/foo".to_string());

        let events = state.take_nav_events();
        assert_eq!(events.len(), 2, "one event per real navigation");

        assert_eq!(events[0]["host"], "af.gog.com");
        assert_eq!(
            events[0]["canGoBack"], false,
            "the first entry has nothing behind it"
        );

        assert_eq!(events[1]["url"], "https://www.gog.com/game/foo");
        assert_eq!(
            events[1]["host"], "www.gog.com",
            "the host label must follow the landing page, not stay frozen on the start URL's \
             host -- the exact user-visible symptom GAP-D reported on /store/gog"
        );
        assert_eq!(
            events[1]["canGoBack"], true,
            "Back must become available after an in-embed navigation"
        );
        assert_eq!(events[1]["canGoForward"], false);
    }

    // ---- StoreEmbedState::observe_live_url (quick 261102-sk8) ----
    //
    // gaming.amazon.com changes views via history.pushState, which fires no page load, so
    // `push()` from Finished never sees them. These prove the pure reconcile decision.

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_observe_spa_push_is_recorded() {
        let mut state = StoreEmbedState::default();
        state.push("https://gaming.amazon.com/home".to_string());
        state.take_nav_events();
        let claim = "https://gaming.amazon.com/claim/x";
        let generation = state.nav_generation();

        assert!(state.observe_live_url(claim, generation));
        assert_eq!(state.current_url().as_deref(), Some(claim));
        assert!(state.can_go_back());
        let events = state.take_nav_events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["canGoBack"], true);
        assert_eq!(events[0]["url"], claim);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_observe_equal_url_is_a_noop() {
        let mut state = StoreEmbedState::default();
        state.push("https://gaming.amazon.com/home".to_string());
        state.take_nav_events();
        let generation = state.nav_generation();

        assert!(!state.observe_live_url("https://gaming.amazon.com/home", generation));
        assert_eq!(state.history.len(), 1);
        assert!(state.take_nav_events().is_empty());
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_observe_while_suppressed_is_a_noop() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/a".to_string());
        state.push("https://a.example/b".to_string());
        state.go_back();
        state.take_nav_events();
        let generation = state.nav_generation();

        assert!(!state.observe_live_url("https://a.example/b", generation));
        assert_eq!(state.history.len(), 2);
        assert_eq!(state.cursor, 0);
        assert!(state.can_go_forward());
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_observe_while_page_loading_is_a_noop() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/a".to_string());
        state.begin_page_load();
        let generation = state.nav_generation();
        assert!(!state.observe_live_url("https://a.example/b", generation));
        assert_eq!(state.history.len(), 1);

        state.push("https://a.example/b".to_string());
        let generation = state.nav_generation();
        assert!(state.observe_live_url("https://a.example/c", generation));
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_observe_cross_origin_is_a_noop() {
        let mut state = StoreEmbedState::default();
        state.push("https://gaming.amazon.com/home".to_string());
        let generation = state.nav_generation();

        assert!(!state.observe_live_url("https://www.amazon.com/ap/signin", generation));
        assert_eq!(state.history.len(), 1);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_observe_on_empty_history_is_a_noop() {
        let mut state = StoreEmbedState::default();
        let generation = state.nav_generation();
        assert!(!state.observe_live_url("https://a.example/", generation));
        assert!(state.history.is_empty());
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_observe_with_stale_generation_is_a_noop() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/a".to_string());
        let stale = state.nav_generation();
        state.push("https://a.example/b".to_string());

        assert!(!state.observe_live_url("https://a.example/c", stale));
        assert_eq!(state.history.len(), 2);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_observe_query_only_change_replaces_in_place() {
        let mut state = StoreEmbedState::default();
        state.push("https://gaming.amazon.com/home".to_string());
        state.take_nav_events();
        let generation = state.nav_generation();
        let next = "https://gaming.amazon.com/home?ref=x";

        assert!(state.observe_live_url(next, generation));
        assert_eq!(state.history.len(), 1);
        assert_eq!(state.current_url().as_deref(), Some(next));
        assert!(!state.can_go_back());
        assert_eq!(state.take_nav_events().len(), 1);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_observe_page_initiated_back_moves_the_cursor() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/home".to_string());
        state.push("https://a.example/claim".to_string());
        state.take_nav_events();
        let generation = state.nav_generation();

        assert!(state.observe_live_url("https://a.example/home", generation));
        assert_eq!(state.cursor, 0);
        assert!(state.can_go_forward());
        assert_eq!(state.history.len(), 2);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_back_after_observed_push_returns_previous() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/home".to_string());
        let generation = state.nav_generation();
        assert!(state.observe_live_url("https://a.example/claim", generation));

        assert_eq!(state.go_back().as_deref(), Some("https://a.example/home"));
        state.push("https://a.example/home".to_string());
        assert_eq!(state.history.len(), 2);
        assert_eq!(state.cursor, 0);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_finished_after_observed_commit_does_not_double_push() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/a".to_string());
        let generation = state.nav_generation();
        assert!(state.observe_live_url("https://a.example/a2", generation));

        state.push("https://a.example/a2".to_string());
        assert_eq!(state.history.len(), 2);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_settle_same_origin_rewrite_after_back_replaces_in_place() {
        let t0 = std::time::Instant::now();
        let mut state = StoreEmbedState::default();
        state.push_at("https://luna.amazon.com/home".to_string(), t0);
        state.push_at("https://luna.amazon.com/claims/x".to_string(), t0);
        state.push_at("https://luna.amazon.com/claims/x/detail".to_string(), t0);
        assert_eq!(
            state.go_back().as_deref(),
            Some("https://luna.amazon.com/claims/x")
        );
        assert_eq!(
            state.push_at("https://luna.amazon.com/claims/x".to_string(), t0),
            None
        );
        state.take_nav_events();
        let generation = state.nav_generation();

        let outcome = state.observe_live_url_at(
            "https://luna.amazon.com/claims/x-canon",
            generation,
            t0 + std::time::Duration::from_millis(500),
        );
        assert_eq!(outcome, Some(StoreEmbedHistoryChange::Replaced));
        assert_eq!(state.history.len(), 3);
        assert_eq!(state.history[1], "https://luna.amazon.com/claims/x-canon");
        assert_eq!(state.history[2], "https://luna.amazon.com/claims/x/detail");
        assert!(state.can_go_back());
        assert!(state.can_go_forward());
        assert_eq!(state.take_nav_events().len(), 1);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_settle_rewrite_equal_to_next_entry_replaces_not_moves() {
        let t0 = std::time::Instant::now();
        let mut state = StoreEmbedState::default();
        state.push_at("https://luna.amazon.com/l1".to_string(), t0);
        state.push_at("https://luna.amazon.com/l1c".to_string(), t0);
        assert!(state.go_back().is_some());
        state.push_at("https://luna.amazon.com/l1".to_string(), t0);
        let generation = state.nav_generation();

        let outcome = state.observe_live_url_at(
            "https://luna.amazon.com/l1c",
            generation,
            t0 + std::time::Duration::from_millis(500),
        );
        assert_eq!(outcome, Some(StoreEmbedHistoryChange::Replaced));
        assert_eq!(state.cursor, 0);
        assert!(!state.can_go_back());
        assert_eq!(state.history.len(), 1);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_settle_cross_origin_finished_push_replaces() {
        let t0 = std::time::Instant::now();
        let mut state = StoreEmbedState::default();
        state.push_at("https://gaming.amazon.com/".to_string(), t0);
        state.push_at("https://luna.amazon.com/claim".to_string(), t0);
        assert!(state.go_back().is_some());
        state.push_at("https://gaming.amazon.com/".to_string(), t0);
        state.begin_page_load();

        let outcome = state.push_at(
            "https://luna.amazon.com/claims/home".to_string(),
            t0 + std::time::Duration::from_secs(1),
        );
        assert_eq!(outcome, Some(StoreEmbedHistoryChange::Replaced));
        assert_eq!(state.history.len(), 2);
        assert_eq!(state.history[0], "https://luna.amazon.com/claims/home");
        assert_eq!(state.cursor, 0);
        assert!(state.can_go_forward());
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_settle_expired_rewrite_appends_as_before() {
        let t0 = std::time::Instant::now();
        let mut state = StoreEmbedState::default();
        state.push_at("https://luna.amazon.com/home".to_string(), t0);
        state.push_at("https://luna.amazon.com/claims/x".to_string(), t0);
        state.push_at("https://luna.amazon.com/claims/x/detail".to_string(), t0);
        assert!(state.go_back().is_some());
        state.push_at("https://luna.amazon.com/claims/x".to_string(), t0);
        let generation = state.nav_generation();

        let outcome = state.observe_live_url_at(
            "https://luna.amazon.com/claims/x-canon",
            generation,
            t0 + STORE_EMBED_LANDING_SETTLE + std::time::Duration::from_millis(1),
        );
        assert_eq!(outcome, Some(StoreEmbedHistoryChange::Recorded));
        assert_eq!(state.history.len(), 3);
        assert_eq!(state.cursor, 2);
        assert_eq!(state.history[2], "https://luna.amazon.com/claims/x-canon");
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_settle_not_opened_by_a_plain_finished_push() {
        let t0 = std::time::Instant::now();
        let mut state = StoreEmbedState::default();
        state.push_at("https://a.example/a".to_string(), t0);
        assert_eq!(
            state.push_at("https://a.example/b".to_string(), t0),
            Some(StoreEmbedHistoryChange::Recorded)
        );
        let generation = state.nav_generation();

        let outcome = state.observe_live_url_at(
            "https://a.example/c",
            generation,
            t0 + std::time::Duration::from_millis(100),
        );
        assert_eq!(outcome, Some(StoreEmbedHistoryChange::Recorded));
        assert_eq!(state.history.len(), 3);
        assert_eq!(state.history[2], "https://a.example/c");
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_settle_repeated_back_terminates_under_rewrite_on_every_load() {
        fn rewrite(u: &str) -> String {
            if u.ends_with("/canon") {
                u.to_string()
            } else {
                format!("{u}/canon")
            }
        }
        let t0 = std::time::Instant::now();
        let mut state = StoreEmbedState::default();
        for p in ["h", "p1", "p2", "p3"] {
            state.push_at(format!("https://luna.amazon.com/{p}"), t0);
        }
        assert_eq!(state.cursor, 3);

        let mut t = t0;
        let mut successful_backs = 0;
        for _ in 0..10 {
            let Some(url) = state.go_back() else { break };
            successful_backs += 1;
            state.push_at(url.clone(), t);
            let rewritten = rewrite(&url);
            if rewritten != url {
                let generation = state.nav_generation();
                state.observe_live_url_at(
                    &rewritten,
                    generation,
                    t + std::time::Duration::from_millis(400),
                );
            }
            t += std::time::Duration::from_secs(2);
        }
        assert_eq!(successful_backs, 3);
        assert!(!state.can_go_back());
        assert_eq!(state.cursor, 0);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_take_nav_events_drains_rather_than_peeks() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/".to_string());

        assert_eq!(state.take_nav_events().len(), 1);
        assert!(
            state.take_nav_events().is_empty(),
            "a second drain with no navigation in between is a healthy idle state, not a \
             repeat of the first"
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_nav_event_queue_is_capped_oldest_dropped() {
        // T-34.4.1-09's shape, restated for this queue: a page navigating in a loop must not
        // grow the queue without bound between drains.
        let mut state = StoreEmbedState::default();
        for i in 0..(STORE_EMBED_NAV_EVENTS_CAP + 10) {
            state.push(format!("https://example.com/{i}"));
        }

        let events = state.take_nav_events();
        assert_eq!(events.len(), STORE_EMBED_NAV_EVENTS_CAP);
        assert_eq!(
            events[0]["url"], "https://example.com/10",
            "the OLDEST entries are the ones dropped -- the renderer applies the last event, \
             so dropping the freshest would defeat the drain"
        );
        assert_eq!(
            events[STORE_EMBED_NAV_EVENTS_CAP - 1]["url"],
            format!("https://example.com/{}", STORE_EMBED_NAV_EVENTS_CAP + 9)
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_clear_empties_the_nav_event_queue() {
        // D-21 teardown: leaving events behind would let the NEXT embed drain a previous
        // session's host straight into its chrome.
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/".to_string());
        state.clear();
        assert!(state.take_nav_events().is_empty());
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_select_store_drops_history_only_on_a_store_switch() {
        // Live 2026-10-30: Back on /store/gog walked into the Amazon pages visited before the
        // switch, because the one reused embed kept a single history across stores.
        let mut state = StoreEmbedState::default();
        assert!(state.select_store("amazon"));
        state.push("https://gaming.amazon.com/".to_string());
        state.push("https://gaming.amazon.com/home".to_string());

        assert!(
            !state.select_store("amazon"),
            "reopening the same store keeps its history"
        );
        assert!(state.can_go_back());

        assert!(state.select_store("gog"));
        assert!(!state.can_go_back());
        assert_eq!(state.current_url(), None);
        state.push("https://www.gog.com/en/".to_string());
        assert!(
            !state.can_go_back(),
            "the new store's first page has nothing behind it"
        );
        assert_eq!(state.go_back(), None);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_select_store_restores_a_returning_stores_own_history() {
        // Live 2026-10-30: GOG reopened at its remembered game page with Back greyed out,
        // because the switch away had dropped GOG's history instead of parking it.
        let mut state = StoreEmbedState::default();
        state.select_store("gog");
        state.push("https://www.gog.com/en/".to_string());
        state.push("https://www.gog.com/en/game/foo".to_string());

        state.select_store("steam");
        state.push("https://store.steampowered.com/".to_string());
        state.push("https://store.steampowered.com/app/1/".to_string());

        assert!(state.select_store("gog"));
        let _ = state.take_nav_events();
        // The reopen loads GOG's remembered page, which is the restored current entry.
        state.push("https://www.gog.com/en/game/foo".to_string());
        assert!(state.can_go_back(), "Back reaches GOG's home page again");
        let events = state.take_nav_events();
        assert_eq!(events.len(), 1, "the deduplicated push still reports state");
        assert_eq!(events[0]["canGoBack"], true);
        assert_eq!(
            state.go_back().as_deref(),
            Some("https://www.gog.com/en/"),
            "Back stays within GOG, never Steam"
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_first_open_at_a_remembered_page_seeds_the_home_beneath_it() {
        // Live 2026-10-31: Steam's first open of the session restored its remembered game page
        // onto an empty history, so Back was greyed instead of reaching the store home.
        let mut state = StoreEmbedState::default();
        state.select_store("steam");
        let game = "https://store.steampowered.com/app/3164500/Schedule_I/";
        state.prepare_open(game, Some("https://store.steampowered.com/"));
        assert!(state.take_nav_events().is_empty(), "nothing has loaded yet");
        state.push(game.to_string());
        assert!(state.can_go_back());
        assert_eq!(state.take_nav_events()[0]["canGoBack"], true);
        assert_eq!(
            state.go_back().as_deref(),
            Some("https://store.steampowered.com/")
        );
        assert!(
            !state.can_go_back(),
            "the home page is the bottom of the stack"
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_prepare_open_seeds_nothing_at_home_without_a_home_or_mid_history() {
        let home = "https://store.steampowered.com/";
        let mut state = StoreEmbedState::default();
        state.select_store("steam");
        state.prepare_open(home, Some(home));
        state.push(home.to_string());
        assert!(
            !state.can_go_back(),
            "opening at home has nothing behind it"
        );

        let mut wiki = StoreEmbedState::default();
        wiki.select_store("wiki");
        wiki.prepare_open("https://github.com/x/wiki", None);
        wiki.push("https://github.com/x/wiki".to_string());
        assert!(!wiki.can_go_back(), "no home url, no seed");

        // A store with history is never re-seeded: a different open URL is a normal push.
        state.push("https://store.steampowered.com/app/1/".to_string());
        state.prepare_open("https://store.steampowered.com/app/2/", Some(home));
        state.push("https://store.steampowered.com/app/2/".to_string());
        assert_eq!(
            state.go_back().as_deref(),
            Some("https://store.steampowered.com/app/1/")
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_reopen_on_the_current_entry_reports_state_before_the_load() {
        // Live 2026-10-31: the restored Back arrow took 1-2 s to appear on a return, because the
        // only event came from the reloaded page's Finished push.
        let mut state = StoreEmbedState::default();
        state.select_store("gog");
        state.push("https://www.gog.com/en/".to_string());
        state.push("https://www.gog.com/en/game/foo".to_string());
        let _ = state.take_nav_events();

        state.select_store("gog");
        state.prepare_open(
            "https://www.gog.com/en/game/foo",
            Some("https://af.gog.com/"),
        );
        let events = state.take_nav_events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["canGoBack"], true);
        assert_eq!(state.go_back().as_deref(), Some("https://www.gog.com/en/"));
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_push_of_the_current_url_does_not_add_an_entry() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/".to_string());
        state.push("https://b.example/".to_string());
        state.push("https://b.example/".to_string());
        assert_eq!(state.go_back().as_deref(), Some("https://a.example/"));
        assert!(!state.can_go_back());
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_state_push_from_middle_truncates_forward_entries() {
        // T-40-07-05: a fresh user-initiated push from a back-ed-up position (not a
        // history-driven move) must discard the entries ahead of the cursor -- exactly like a
        // browser tab: going back then clicking a new link erases the old "forward" branch.
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/".to_string());
        state.push("https://b.example/".to_string());
        state.push("https://c.example/".to_string());
        let back_target = state.go_back().unwrap(); // cursor -> b, suppress_next_push armed

        // Mirrors `on_page_load`'s Finished handler confirming the back-navigation landed --
        // suppressed, so it must NOT push a duplicate "b" entry.
        state.push(back_target);
        assert_eq!(
            state.history.len(),
            3,
            "the suppressed confirm-push must not grow history"
        );

        // The user's actual next navigation, made from the back-ed-up "b" position.
        state.push("https://d.example/".to_string());
        assert_eq!(state.current_url().as_deref(), Some("https://d.example/"));
        assert!(
            !state.can_go_forward(),
            "c must be gone once d is pushed from the b position"
        );
        assert_eq!(
            state.history,
            vec![
                "https://a.example/".to_string(),
                "https://b.example/".to_string(),
                "https://d.example/".to_string(),
            ]
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_suppressed_push_enqueues_nothing() {
        // The confirming Finished event of a back/forward/reload this process itself issued.
        // Its caller already received the identical state as that arm's return value.
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/".to_string());
        state.push("https://b.example/".to_string());
        let _ = state.take_nav_events();

        let back_target = state.go_back().unwrap();
        state.push(back_target);

        assert!(
            state.take_nav_events().is_empty(),
            "a suppressed push must not queue a duplicate of state the caller already has"
        );
    }
}
