//! Phase 50 Plan 01: a RAW `WKWebView` subview for the Epic store, attached directly as a
//! sibling of Tauri's own child webview on the main window's content view -- NOT a
//! `tauri::WebviewBuilder`/`add_child` (wry) child webview, which is what every other store uses
//! via `store_embed_open` in `main.rs`.
//!
//! Why Epic alone gets a second, parallel surface: spike 024 measured Epic's Cloudflare
//! Turnstile challenge the Tauri-managed child webview EVERY time, while a raw `WKWebView` --
//! even attached as a subview inside the SAME main window -- was never challenged across 16/16
//! runs. See `.planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/
//! 50-RESEARCH.md` and the spike-findings skill's "Tauri embedded store browser" area for the
//! full evidence. This module is the "add-alongside, accepted debt" response: a second, Epic-only
//! surface rather than generalizing `StoreEmbedState` (main.rs) into a keyed map. The whole
//! module compiles only on macOS -- gated by its OWN `mod` declaration in `main.rs`
//! (`#[cfg(target_os = "macos")] mod macos_epic_embed;`) -- so every item below is reachable only
//! under `#[cfg(target_os = "macos")]` by construction; `#![cfg(target_os = "macos")]` is added
//! here too, defensively, so this file self-gates even if that declaration attribute were ever
//! dropped.
//!
//! **Why this surface tracks NO Rust-side history stack** (Phase 50 Plan 02, D-22): the
//! Tauri-managed embed (`StoreEmbedState`, main.rs) needs its own `history: Vec<String>` +
//! `cursor: usize` because `tauri::webview::Webview`/`wry::WebView` expose no native
//! back/forward API at all (`40-EMBED-API-VERIFICATION.md` Q1/Q2) -- D-22's whole Rust-side
//! stack exists to COMPENSATE for that absence. A raw `WKWebView` has the real thing:
//! `canGoBack()`/`canGoForward()`/`goBack()`/`goForward()` read and drive Apple's own
//! `WKBackForwardList` directly. Re-deriving a parallel Rust-side stack here would duplicate
//! state two systems could disagree about, for strictly less information than the native list
//! already tracks -- so `back()`/`forward()`/`reload()`/`navigate()` below call straight through
//! to the native methods instead, and `nav_state_json()` reads `URL()`/`canGoBack()`/
//! `canGoForward()` live off the webview itself.
//!
//! **Decision: the load-timeout timer keeps running while the tab is hidden** (Phase 50 Plan 02,
//! answering RESEARCH.md Open Question 1). `spawn_load_timeout_monitor`'s loop consults nothing
//! about visibility, and `hide()`/`deselect()` do not touch `nav_started_at`. This is deliberate,
//! not an oversight: a timed-out banner that is already correct the instant the tab becomes
//! visible again beats a reset that would silently extend a real stall for as long as the user
//! leaves the tab hidden. Only `close()` ends the monitor thread.
#![cfg(target_os = "macos")]

use std::ffi::c_void;
use std::sync::mpsc::channel as mpsc_channel;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use objc2::rc::Retained;
use objc2::runtime::{Bool, NSObject, ProtocolObject};
use objc2::{define_class, msg_send, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::NSView;
use objc2_foundation::{
    NSError, NSHTTPURLResponse, NSNumber, NSObjectProtocol, NSPoint, NSRect, NSSize, NSString,
    NSURLRequest, NSURL,
};
use objc2_web_kit::{
    WKFrameInfo, WKNavigation, WKNavigationAction, WKNavigationActionPolicy, WKNavigationDelegate,
    WKNavigationResponse, WKNavigationResponsePolicy, WKUIDelegate, WKWebView,
    WKWebViewConfiguration, WKWebsiteDataStore, WKWindowFeatures,
};
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::epic_embed_state::{epic_nav_state_with_flags, EpicEmbedNavFlags, EpicEmbedVisibility};

/// The `storeKey` value `store_embed_open_args` (main.rs) parses that routes to THIS module
/// instead of the existing `tauri::WebviewBuilder` embed path -- `store_embed_open`'s own routing
/// (D-02) compares the parsed key against this constant.
pub(crate) const EPIC_EMBED_STORE_KEY: &str = "epic";

/// Epic Games Launcher's own custom URL scheme (D-14). A navigation to it is blocked like any
/// other scheme `store_embed_navigation_policy` (main.rs) does not recognize -- this module's
/// only addition is bumping `EpicEmbedSurface::blocked_launcher_scheme_count` specifically for
/// this scheme, so the renderer can show the one-shot "Install from your Library instead" toast
/// D-14 specifies rather than the generic blocked-navigation log line every other foreign scheme
/// gets.
const EPIC_GAMES_LAUNCHER_SCHEME: &str = "com.epicgames.launcher";

/// Cap on `EpicEmbedSurface::pending_nav_events`, below -- mirrors `STORE_EMBED_NAV_EVENTS_CAP`'s
/// (main.rs) oldest-dropped discipline: an unbounded queue would be a denial-of-service surface
/// if the frontend ever stopped draining it via `take_nav_events`. When the cap is hit the OLDEST
/// queued event is dropped, never the newest -- the frontend always sees the most recent nav
/// state, even if it has fallen behind.
pub(crate) const EPIC_EMBED_NAV_EVENTS_CAP: usize = 50;

/// Bound for the Epic surface's load-timeout flag (Phase 50 Plan 02). 45 seconds matches this
/// project's existing bound idiom (Phase 49 D-01), clears nearly every observed healthy cold
/// Epic load (spike 024: 11 of 16 runs rendered by 40 s), and surfaces the stopped-document-
/// stream stall well before the 120 s the spike sampled at. `spawn_load_timeout_monitor` (below)
/// is the ONLY consumer that reads this constant to decide when to raise
/// `EpicEmbedSurface::load_timed_out` -- the frontend never re-derives this number, so there is
/// exactly one place it lives. Declared as a `Duration`, not a raw integer, so every comparison
/// site stays unit-correct with no secondary "seconds vs. millis" conversion to get wrong.
pub(crate) const EPIC_EMBED_LOAD_TIMEOUT: Duration = Duration::from_secs(45);

/// Pure boundary check for `EPIC_EMBED_LOAD_TIMEOUT` (Phase 50 Plan 02): `true` once `elapsed`
/// has reached or passed `bound`, matching this project's existing `>=`-at-the-bound idiom
/// (Phase 49 D-01) rather than a strict `>` that would leave the exact-boundary instant
/// classified as "not yet timed out" for one more monitor tick. A free function -- no
/// `&AppHandle`, no webview -- so `cargo test` can cover the boundary without a live `WKWebView`,
/// exactly as `store_embed_navigation_policy` (main.rs) is factored. The one call site is
/// `spawn_load_timeout_monitor`, below.
fn epic_embed_load_timed_out(elapsed: Duration, bound: Duration) -> bool {
    elapsed >= bound
}

#[cfg(test)]
mod epic_embed_load_timed_out_tests {
    use super::*;

    #[test]
    fn just_under_the_bound_is_not_timed_out() {
        let elapsed = EPIC_EMBED_LOAD_TIMEOUT - Duration::from_millis(1);
        assert!(!epic_embed_load_timed_out(elapsed, EPIC_EMBED_LOAD_TIMEOUT));
    }

    #[test]
    fn exactly_at_the_bound_is_timed_out() {
        assert!(epic_embed_load_timed_out(
            EPIC_EMBED_LOAD_TIMEOUT,
            EPIC_EMBED_LOAD_TIMEOUT
        ));
    }

    #[test]
    fn just_over_the_bound_is_timed_out() {
        let elapsed = EPIC_EMBED_LOAD_TIMEOUT + Duration::from_millis(1);
        assert!(epic_embed_load_timed_out(elapsed, EPIC_EMBED_LOAD_TIMEOUT));
    }
}

/// The Cloudflare challenge host RESEARCH.md's Pattern 4 names as the fallback signal (D-09).
/// Matched with the SAME exact-or-dot-suffix discipline `store_embed_is_valve_host` (main.rs)
/// already uses -- never a substring test on the whole URL, which `store_embed_is_valve_host`'s
/// own doc comment and T-50-06 both call out as the boundary mistake that shipped F-34.4.2-19.
const EPIC_EMBED_CHALLENGE_HOST: &str = "challenges.cloudflare.com";

/// The challenge-platform path prefix RESEARCH.md's Pattern 4 names as the other half of the
/// fallback signal (D-09).
const EPIC_EMBED_CHALLENGE_PATH_PREFIX: &str = "/cdn-cgi/challenge-platform/";

/// Pure classifier for whether a main-frame response is a Cloudflare challenge (Phase 50 Plan 02,
/// D-09). Takes no `&AppHandle` and no webview -- only the already-extracted
/// `cf-mitigated` header value (if any) and the response URL's already-parsed host/path -- so
/// `cargo test` can cover every branch with plain string literals, exactly as
/// `epic_embed_load_timed_out` (above) and `store_embed_is_valve_host` (main.rs) are factored.
///
/// The PRIMARY signal is `header_value`: `true` only for a case-insensitive exact match on the
/// literal `"challenge"`, `false` for any other value including absent. The host/path match is a
/// FALLBACK, consulted ONLY when `header_value` is `None` -- this ordering is load-bearing, not
/// incidental: Epic's own sign-in form embeds a Cloudflare Turnstile widget as a SUBFRAME
/// resource load to `challenges.cloudflare.com`, so treating that host as a REQUEST-level signal
/// trips on every normal sign-in (RESEARCH.md Pitfall 2; the spike's nav log recorded exactly
/// this pattern on runs that rendered fine). Promoting the header check to the only signal that
/// matters whenever it is present, and reaching for the host/path check only in the header's
/// total absence, is what keeps that false positive from reappearing here -- the caller is
/// additionally responsible for only ever calling this with a MAIN-FRAME response's own
/// properties (`isForMainFrame()`, checked by the one call site in
/// `decide_policy_for_navigation_response`, below), never a subframe's.
///
/// `host`/`path` are matched exactly like `store_embed_is_valve_host`: an exact match or a
/// dot-prefixed suffix match for the host (`host == apex || host.ends_with(".{apex}")`), and an
/// exact prefix match for the path -- never a substring match anywhere on the whole URL string.
fn epic_embed_response_is_challenged(header_value: Option<&str>, host: &str, path: &str) -> bool {
    if let Some(value) = header_value {
        return value.eq_ignore_ascii_case("challenge");
    }
    host == EPIC_EMBED_CHALLENGE_HOST
        || host.ends_with(&format!(".{EPIC_EMBED_CHALLENGE_HOST}"))
        || path.starts_with(EPIC_EMBED_CHALLENGE_PATH_PREFIX)
}

#[cfg(test)]
mod epic_embed_response_is_challenged_tests {
    use super::*;

    #[test]
    fn header_value_challenge_is_a_challenge() {
        assert!(epic_embed_response_is_challenged(
            Some("challenge"),
            "store.epicgames.com",
            "/en-US/"
        ));
    }

    #[test]
    fn header_value_challenge_in_mixed_case_is_a_challenge() {
        assert!(epic_embed_response_is_challenged(
            Some("ChAlLeNgE"),
            "store.epicgames.com",
            "/en-US/"
        ));
    }

    #[test]
    fn an_unrelated_header_value_is_not_a_challenge() {
        assert!(!epic_embed_response_is_challenged(
            Some("bypass"),
            "store.epicgames.com",
            "/en-US/"
        ));
    }

    #[test]
    fn header_absent_with_a_non_matching_host_and_path_is_not_a_challenge() {
        assert!(!epic_embed_response_is_challenged(
            None,
            "store.epicgames.com",
            "/en-US/"
        ));
    }

    #[test]
    fn header_absent_with_the_cloudflare_challenge_host_is_a_challenge() {
        assert!(epic_embed_response_is_challenged(
            None,
            "challenges.cloudflare.com",
            "/en-US/"
        ));
    }

    #[test]
    fn header_absent_with_the_challenge_platform_path_prefix_is_a_challenge() {
        assert!(epic_embed_response_is_challenged(
            None,
            "store.epicgames.com",
            "/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"
        ));
    }

    #[test]
    fn a_host_that_merely_ends_with_the_challenge_hosts_characters_without_a_dot_boundary_is_not_a_challenge(
    ) {
        assert!(!epic_embed_response_is_challenged(
            None,
            "notchallenges.cloudflare.com",
            "/en-US/"
        ));
    }
}

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
struct EpicEmbedSurface {
    webview: Option<SendPtr>,
    delegate: Option<SendPtr>,
    /// `selected` (D-02), the renderer's own hide, and `challenged` (D-09/D-10) -- the three
    /// inputs the subview's `hidden` flag is DERIVED from (review findings 5/7/13). Changed only
    /// on the main thread, in the same step that applies the result via `apply_visibility`.
    visibility: EpicEmbedVisibility,
    top_level_host: Option<String>,
    pending_nav_events: Vec<Value>,
    /// Bumped on every `didStartProvisionalNavigation` (Phase 50 Plan 02). Read by
    /// `spawn_load_timeout_monitor`'s main-thread re-check: if a newer navigation has bumped
    /// this since the monitor's lock-only pre-check, the raise this tick was about to commit is
    /// stale and must not land -- the overwritten `nav_started_at` alone would still mostly work,
    /// but re-checking the generation under the SAME lock as the actual flag write closes the
    /// narrow window where a pre-check and a landing `didStartProvisionalNavigation` interleave.
    nav_generation: u64,
    /// `Some(t)` while a main-frame navigation is in flight with no `didFinishNavigation`/failure
    /// callback yet; `None` once one lands (success or failure), or freshly re-set to `Some` by
    /// the next `didStartProvisionalNavigation`. Read by `spawn_load_timeout_monitor` to compute
    /// elapsed time. Deliberately NOT touched by `hide()`/`show()`/`deselect()` -- see this
    /// module's own "Timer while hidden" doc comment, above.
    nav_started_at: Option<Instant>,
    /// `true` once `spawn_load_timeout_monitor` has raised the flag for the navigation currently
    /// in flight. Cleared by the next `didStartProvisionalNavigation` or by `didFinishNavigation`/
    /// either failure hook (D-11: every load starts fresh, and a genuine failure is not a
    /// timeout).
    load_timed_out: bool,
    /// Monotonic count of navigations blocked specifically because their scheme was
    /// `EPIC_GAMES_LAUNCHER_SCHEME` (Phase 50 Plan 02, D-14) -- bumped in the
    /// `decidePolicyForNavigationAction` hook's `Block` arm, never decremented, never reset while
    /// the subview lives. A counter rather than a boolean, deliberately: the renderer DRAINS the
    /// nav-event ring and applies only the LAST event (`take_nav_events`), so a one-shot boolean
    /// flag could be coalesced away between two drains and the user would silently miss the
    /// notice. A counter that only ever increases lets the renderer show exactly one toast per
    /// increment it has not yet shown, even across a coalesced drain.
    blocked_launcher_scheme_count: u64,
}

static EPIC_EMBED_SURFACE: OnceLock<Mutex<EpicEmbedSurface>> = OnceLock::new();

fn surface() -> &'static Mutex<EpicEmbedSurface> {
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

/// Converts a renderer-space rect (`useStoreEmbedHost`'s `flush()` is the ONLY rect source --
/// D-18, "single geometry oracle": no autoresizing mask, no Rust-side resize heuristic) into an
/// `NSRect` in `ns_view`'s own coordinate space. Ported verbatim from spike 024's own conditional
/// -- `NSView`'s coordinate origin is bottom-left UNLESS the view opts into `isFlipped() == true`
/// (top-left, matching web/CSS convention), and the subview-attach target's flip state
/// is not assumed either way here.
fn rect_to_ns_rect(ns_view: &NSView, x: f64, y: f64, w: f64, h: f64) -> NSRect {
    let bounds = ns_view.bounds();
    let origin_y = if ns_view.isFlipped() {
        y
    } else {
        bounds.size.height - y - h
    };
    NSRect::new(NSPoint::new(x, origin_y), NSSize::new(w, h))
}

/// The ONE `setHidden` writer for the Epic subview (review findings 5/7). `hidden` is always an
/// `EpicEmbedVisibility` transition's result -- never a caller's own boolean -- so the renderer's
/// hide/show and the Rust-owned challenge hide (D-10) can no longer overwrite each other. Main
/// thread only, like every `WKWebView` call here.
fn apply_visibility(webview: &WKWebView, hidden: bool) {
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
fn nav_state_json(webview: &WKWebView) -> Value {
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
    fn enqueue_nav_event(&mut self, event: Value) {
        let event = epic_nav_state_with_flags(event, self.nav_flags());
        self.pending_nav_events.push(event);
        if self.pending_nav_events.len() > EPIC_EMBED_NAV_EVENTS_CAP {
            self.pending_nav_events.remove(0);
        }
    }

    /// The flag values every Epic nav state carries, read at the instant it is built.
    fn nav_flags(&self) -> EpicEmbedNavFlags {
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
            eprintln!(
                "[shell] macos_epic_embed: load timed out past {EPIC_EMBED_LOAD_TIMEOUT:?}"
            );
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
                    (load, guard.visibility.open())
                };
                apply_visibility(webview, hidden);
                if load {
                    let nsurl = NSURL::URLWithString(&NSString::from_str(&url_string))
                        .ok_or_else(|| "epic_embed_open:bad-nsurl".to_string())?;
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
                let _: () =
                    msg_send![&*webview, setValue: &*draws_background_false, forKey: &*key];
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

            let nsurl = NSURL::URLWithString(&NSString::from_str(&url_string))
                .ok_or_else(|| "epic_embed_open:bad-nsurl".to_string())?;
            let request = NSURLRequest::requestWithURL(&nsurl);
            unsafe {
                webview.loadRequest(&request);
            }

            let event = nav_state_json(&webview);
            // Park the retained webview/delegate as raw addresses -- released only by `close()`
            // via `Retained::from_raw` (see that function's doc comment).
            let webview_ptr = Retained::into_raw(webview) as *mut c_void;
            let delegate_ptr = Retained::into_raw(delegate) as *mut c_void;
            let mut guard = surface()
                .lock()
                .map_err(|_| "epic_embed_open:surface-poisoned".to_string())?;
            guard.webview = Some(SendPtr(webview_ptr));
            guard.delegate = Some(SendPtr(delegate_ptr));
            let hidden = guard.visibility.open();
            guard.top_level_host = None;
            guard.enqueue_nav_event(event);
            drop(guard);
            // SAFETY: `webview_ptr` is the `+1` just parked above; nothing can release it before
            // this same main-thread closure returns.
            apply_visibility(unsafe { &*(webview_ptr as *const WKWebView) }, hidden);
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
    let window = app
        .get_window(crate::MAIN_WINDOW_LABEL)
        .ok_or_else(|| format!("epic_embed_set_bounds:no-window:{}", crate::MAIN_WINDOW_LABEL))?;

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

/// Re-issues the webview's own current page via `WKWebView::reload()`. Never touches
/// `canGoBack`/`canGoForward` -- a reload must leave the native back/forward list, and
/// therefore the resulting nav state's availability flags, unchanged.
pub(crate) fn reload(app: &AppHandle) -> Result<Value, String> {
    navigate_webview_on_main_thread(app, "epic_embed_reload", |webview| unsafe {
        webview.reload();
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
            eprintln!("[shell] macos_epic_embed: navigate() given an unparsable URL");
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
                let hidden = guard.visibility.set_challenged(false);
                drop(guard);
                apply_visibility(webview, hidden);
            }
            Err(_) => {
                eprintln!("[shell] WARN: macos_epic_embed surface registry poisoned -- continuing")
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
                (webview_ptr, delegate_ptr)
            };

            if let Some(ptr) = webview_ptr {
                // SAFETY: see this function's doc comment above.
                if let Some(webview) = unsafe { Retained::from_raw(ptr.0 as *mut WKWebView) } {
                    webview.removeFromSuperview();
                    drop(webview);
                }
            }
            if let Some(ptr) = delegate_ptr {
                // SAFETY: see this function's doc comment above.
                if let Some(delegate) =
                    unsafe { Retained::from_raw(ptr.0 as *mut EpicEmbedNavDelegate) }
                {
                    drop(delegate);
                }
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
        for key in ["gog", "amazon", "zoom", "steam", "humble"] {
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

/// Holds the `AppHandle` the delegate's `WKUIDelegate` popup hook (Phase 50 Plan 02, D-12) needs
/// to call `crate::open_external` -- `open()`'s own `app: &AppHandle` parameter is already in
/// scope at the one construction site (`EpicEmbedNavDelegate::new`, below), so this stores an
/// owned clone the SAME way `EpicPristineNavDelegateIvars { event_label: String }` (main.rs)
/// stores its own owned, non-`Copy` state via `set_ivars`.
struct EpicEmbedNavDelegateIvars {
    app: AppHandle,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = EpicEmbedNavDelegateIvars]
    struct EpicEmbedNavDelegate;

    unsafe impl NSObjectProtocol for EpicEmbedNavDelegate {}

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
                    eprintln!(
                        "[shell] macos_epic_embed: blocked an unparsable navigation URL"
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
                        // Scheme only, never the full URL -- matches
                        // `open_external_scheme_check`'s (main.rs) T-28-04 logging convention.
                        eprintln!(
                            "[shell] macos_epic_embed: blocked a navigation to the Epic Games \
                             Launcher scheme ('{EPIC_GAMES_LAUNCHER_SCHEME}') -- D-14"
                        );
                        if let Ok(mut guard) = surface().lock() {
                            guard.blocked_launcher_scheme_count =
                                guard.blocked_launcher_scheme_count.saturating_add(1);
                            let event = nav_state_json(webview);
                            guard.enqueue_nav_event(event);
                        } else {
                            eprintln!(
                                "[shell] WARN: macos_epic_embed surface registry poisoned -- \
                                 continuing"
                            );
                        }
                    }
                    WKNavigationActionPolicy::Cancel
                }
                // The Epic surface's top-level host is never a Valve host, so a `Handoff`
                // decision is unreachable in practice here -- logged and cancelled rather than
                // allowed, since there is no steam:// handoff path on this surface.
                crate::StoreEmbedNavigationDecision::Handoff => {
                    eprintln!(
                        "[shell] macos_epic_embed: Handoff decision reached on the Epic surface \
                         -- its top-level host is never a Valve host; cancelling rather than \
                         allowing"
                    );
                    WKNavigationActionPolicy::Cancel
                }
            };
            (*handler).call((policy,));
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
            let event = nav_state_json(webview);
            if let Ok(mut guard) = surface().lock() {
                guard.top_level_host = host;
                // A genuine finish is NOT a timeout (Phase 50 Plan 02): clear both the
                // in-flight clock and any flag a slow-but-eventually-successful load raised.
                guard.nav_started_at = None;
                guard.load_timed_out = false;
                guard.enqueue_nav_event(event);
            } else {
                eprintln!(
                    "[shell] WARN: macos_epic_embed surface registry poisoned -- continuing"
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
                guard.load_timed_out = false;
                // D-11: every load starts fresh. Clearing the challenge also un-hides the
                // subview the challenge hid, when nothing else keeps it hidden -- a challenge the
                // page clears by navigating itself away no longer strands a hidden surface with
                // no Try again (review finding 7).
                let hidden = guard.visibility.set_challenged(false);
                guard.enqueue_nav_event(event);
                drop(guard);
                apply_visibility(webview, hidden);
            } else {
                eprintln!(
                    "[shell] WARN: macos_epic_embed surface registry poisoned -- continuing"
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
                    eprintln!(
                        "[shell] macos_epic_embed: main-frame response flagged as challenged \
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
                        eprintln!(
                            "[shell] WARN: macos_epic_embed surface registry poisoned -- \
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
            _webview: &WKWebView,
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
            if crate::store_embed_handoff_admitted(&crate::STORE_EMBED_POPUP_THROTTLE) {
                eprintln!(
                    "[shell] macos_epic_embed: denied window.open request, routing to the system \
                     browser (D-12)"
                );
                if let Err(e) = crate::open_external(url_string, self.ivars().app.clone()) {
                    eprintln!(
                        "[shell] macos_epic_embed: popup hand-off to open_external failed: {e}"
                    );
                }
            } else {
                eprintln!(
                    "[shell] macos_epic_embed: denied window.open request, rate-limited -- not \
                     routed to the system browser"
                );
            }
            None
        }

        // D-13: calls the SAME shipped helper `EpicPristineNavDelegate` (main.rs) uses for its
        // own pristine WKWebView -- one code path serves both raw WKWebViews, no AppKit dialog
        // plumbing re-implemented here. Always calls the completion handler exactly once.
        #[unsafe(method(webView:runJavaScriptAlertPanelWithMessage:initiatedByFrame:completionHandler:))]
        fn run_js_alert(
            &self,
            _webview: &WKWebView,
            message: &NSString,
            _frame: &WKFrameInfo,
            completion_handler: &block2::Block<dyn Fn()>,
        ) {
            if let Some(mtm) = MainThreadMarker::new() {
                crate::present_native_js_alert(mtm, &message.to_string());
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
            let confirmed = MainThreadMarker::new()
                .map(|mtm| crate::present_native_js_confirm(mtm, &message.to_string()))
                .unwrap_or(false);
            (*completion_handler).call((Bool::from(confirmed),));
        }

        /// Same rationale as `run_js_alert` above, for JS `prompt()`. Always calls the completion
        /// handler exactly once: the shipped helper's entered text on OK, `nil` on Cancel or if
        /// no main-thread marker is available (never dropped either way) -- the dismiss answer,
        /// matching `WKUIDelegate`'s own documented completion-handler contract.
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
            let entered = MainThreadMarker::new().and_then(|mtm| {
                crate::present_native_js_prompt(mtm, &prompt.to_string(), &default_text_owned)
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

/// Shared body for the two navigation-failure hooks (Phase 50 Plan 02): a genuine failure is NOT
/// a timeout -- it clears `nav_started_at`/`load_timed_out` rather than setting either -- and the
/// user sees WebKit's own failure through the logged line, not a slow-load notice. Factored out
/// because `didFailNavigation`/`didFailProvisionalNavigation` differ only in which delegate
/// method called them, which `caller` names for the log line.
fn epic_embed_handle_navigation_failure(webview: &WKWebView, error: &NSError, caller: &str) {
    let description = error.localizedDescription().to_string();
    eprintln!("[shell] macos_epic_embed: {caller} -- {description}");
    let event = nav_state_json(webview);
    if let Ok(mut guard) = surface().lock() {
        guard.nav_started_at = None;
        guard.load_timed_out = false;
        guard.enqueue_nav_event(event);
    } else {
        eprintln!("[shell] WARN: macos_epic_embed surface registry poisoned -- continuing");
    }
}

impl EpicEmbedNavDelegate {
    fn new(mtm: MainThreadMarker, app: AppHandle) -> Retained<Self> {
        let delegate = mtm
            .alloc::<EpicEmbedNavDelegate>()
            .set_ivars(EpicEmbedNavDelegateIvars { app });
        unsafe { msg_send![super(delegate), init] }
    }
}
