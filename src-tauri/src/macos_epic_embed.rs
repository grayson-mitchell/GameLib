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
use objc2::runtime::{AnyObject, Bool, NSObject, ProtocolObject};
use objc2::{define_class, msg_send, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{NSAutoresizingMaskOptions, NSView};
use objc2_foundation::{
    NSError, NSHTTPURLResponse, NSKeyValueObservingOptions, NSNumber,
    NSObjectNSKeyValueObserverRegistration, NSObjectProtocol, NSPoint, NSRect, NSSize, NSString,
    NSURLRequest, NSURL,
};
use objc2_web_kit::{
    WKFrameInfo, WKNavigation, WKNavigationAction, WKNavigationActionPolicy, WKNavigationDelegate,
    WKNavigationResponse, WKNavigationResponsePolicy, WKUIDelegate, WKWebView,
    WKWebViewConfiguration, WKWebsiteDataStore, WKWindowFeatures,
};
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::epic_embed_state::{
    epic_embed_clears_load_timeout, epic_embed_reload_action, epic_kvo_event_is_new,
    epic_nav_state_with_flags, EpicEmbedNavFlags, EpicEmbedNavLifecycle, EpicEmbedReloadAction,
    EpicEmbedVisibility,
};

/// The `storeKey` value `store_embed_open_args` (main.rs) parses that routes to THIS module
/// instead of the existing `tauri::WebviewBuilder` embed path -- `store_embed_open`'s own routing
/// (D-02) compares the parsed key against this constant.
pub(crate) const EPIC_EMBED_STORE_KEY: &str = "epic";

/// Epic Games Launcher's own custom URL scheme (D-14). A navigation to it is blocked like any
/// other scheme `store_embed_navigation_policy` (main.rs) does not recognize -- this module's
/// only addition is bumping `EpicEmbedSurface::blocked_launcher_scheme_count` specifically for
/// this scheme, so the renderer can show the one-shot "Install from your Library instead" toast
/// D-14 specifies rather than the generic blocked-navigation log line every other foreign scheme
/// gets. Defined once in `store_embed_handoff_policy`, whose popup policy counts it too.
const EPIC_GAMES_LAUNCHER_SCHEME: &str =
    crate::store_embed_handoff_policy::EPIC_GAMES_LAUNCHER_SCHEME;

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

mod surface;
pub(crate) use surface::*;

mod nav_delegate;
pub(crate) use nav_delegate::*;
