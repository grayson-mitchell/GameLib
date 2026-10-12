//! Pure, platform-neutral decisions for the store embeds' frame-context-less hand-off hooks.
//!
//! Both store surfaces -- the Tauri-managed child webview (`store_embed_open`'s `on_new_window`,
//! main.rs) and the macOS raw Epic `WKWebView` (`macos_epic_embed`'s `WKUIDelegate` popup hook)
//! -- hand a page-chosen URL to the OS. Neither hook can tell which frame asked or whether a user
//! gesture was involved, so the decision is made here, once, with no `AppHandle` and no webview,
//! and unit-tested on Linux even though half its callers only compile on macOS. Deliberately NOT
//! `#[cfg(target_os = "macos")]`-gated: `macos_epic_embed.rs` is, so anything it needs tested has
//! to live outside it.

/// What a `window.open` popup (or an undisplayable download response) may do.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum StoreEmbedBrowserHandoffDecision {
    /// Hand the URL to the system browser via `open_external` -- subject to the caller's
    /// `STORE_EMBED_POPUP_THROTTLE` admission, which is consulted ONLY for this variant.
    HandToSystemBrowser,
    /// Drop it. No hand-off, and no throttle slot consumed.
    Reject,
    /// Drop it AND count it as a D-14 Epic Games Launcher attempt (Phase 50), exactly as a
    /// navigation to that scheme is counted. No throttle slot consumed.
    RejectLauncherScheme,
}

/// Epic Games Launcher's own custom URL scheme (Phase 50 D-14). `macos_epic_embed`'s navigation
/// hook counts blocks of it; this module's popup policy counts popups to it the same way.
pub(crate) const EPIC_GAMES_LAUNCHER_SCHEME: &str = "com.epicgames.launcher";

/// Decides a `window.open` popup (or an undisplayable download response) hand-off, for both
/// store surfaces.
///
/// Only `http`/`https` with a real host ever leave the app -- to the system browser, which is
/// what D-12 / D-28 promise. In particular `steam:` is NEVER handed off from here: the navigation
/// policy (`store_embed_navigation_policy`, main.rs) only hands `steam:` off while the embed's
/// top-level page is a Valve host, and a popup carries no frame context to apply that gate to
/// (any ad iframe could `window.open('steam://uninstall/<appid>')`), so the safe answer is never.
/// `open_external`'s own allowlist (`steam`, `mailto`, ...) is the renderer-command allowlist and
/// is deliberately NOT what decides this. `about:blank` and unparsable URLs are rejected here,
/// before the caller's throttle, so a junk popup can never use up the one hand-off slot a real
/// one needs. Scheme matching is case-insensitive (`tauri::Url` lowercases the scheme).
pub(crate) fn store_embed_browser_handoff_policy(url: &str) -> StoreEmbedBrowserHandoffDecision {
    let Ok(parsed) = tauri::Url::parse(url) else {
        return StoreEmbedBrowserHandoffDecision::Reject;
    };
    match parsed.scheme() {
        "http" | "https" if parsed.host_str().is_some_and(|h| !h.is_empty()) => {
            StoreEmbedBrowserHandoffDecision::HandToSystemBrowser
        }
        EPIC_GAMES_LAUNCHER_SCHEME => StoreEmbedBrowserHandoffDecision::RejectLauncherScheme,
        _ => StoreEmbedBrowserHandoffDecision::Reject,
    }
}

#[cfg(test)]
mod store_embed_browser_handoff_policy_tests {
    use super::*;
    use StoreEmbedBrowserHandoffDecision::*;

    #[test]
    fn https_and_http_popups_go_to_the_system_browser() {
        assert_eq!(
            store_embed_browser_handoff_policy("https://store.epicgames.com/p/x"),
            HandToSystemBrowser
        );
        assert_eq!(
            store_embed_browser_handoff_policy("http://example.com/"),
            HandToSystemBrowser
        );
    }

    #[test]
    fn steam_popups_are_never_handed_off_from_any_page() {
        // A popup has no frame context, so the navigation policy's Valve-top-level-host gate
        // cannot be applied -- the safe answer is never.
        assert_eq!(
            store_embed_browser_handoff_policy("steam://uninstall/440"),
            Reject
        );
        assert_eq!(
            store_embed_browser_handoff_policy("STEAM://rungameid/440"),
            Reject
        );
    }

    #[test]
    fn every_other_non_http_scheme_is_rejected() {
        for url in [
            "mailto:a@b.c",
            "gamelib://anything",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html,hi",
            "blob:https://store.epicgames.com/uuid",
            "smb://host/share",
        ] {
            assert_eq!(store_embed_browser_handoff_policy(url), Reject, "{url}");
        }
    }

    #[test]
    fn blank_and_unparsable_popups_are_rejected() {
        for url in ["", "about:blank", "about:srcdoc", "not a url", "https://"] {
            assert_eq!(store_embed_browser_handoff_policy(url), Reject, "{url:?}");
        }
    }

    #[test]
    fn the_epic_launcher_scheme_is_rejected_and_counted() {
        assert_eq!(
            store_embed_browser_handoff_policy("com.epicgames.launcher://store/p/x"),
            RejectLauncherScheme
        );
        assert_eq!(
            store_embed_browser_handoff_policy("COM.EpicGames.Launcher://apps/x?action=install"),
            RejectLauncherScheme
        );
    }

    /// Source-text check (the macOS half cannot be compiled on Linux): both popup hooks consult
    /// the policy BEFORE taking a throttle slot, and the Epic hook counts launcher-scheme popups
    /// for D-14.
    #[test]
    fn both_popup_hooks_decide_policy_before_taking_a_throttle_slot() {
        fn body_after<'a>(source: &'a str, marker: &str) -> &'a str {
            let start = source
                .find(marker)
                .unwrap_or_else(|| panic!("missing {marker}"));
            &source[start..(start + 3000).min(source.len())]
        }
        let main_rs = body_after(include_str!("main.rs"), ".on_new_window({");
        let epic_rs = body_after(
            include_str!("macos_epic_embed.rs"),
            "fn create_web_view_for_navigation_action(",
        );
        for (name, body) in [
            ("main.rs on_new_window", main_rs),
            ("Epic popup hook", epic_rs),
        ] {
            let policy = body
                .find("store_embed_browser_handoff_policy(")
                .unwrap_or_else(|| panic!("{name}: policy not consulted"));
            let throttle = body
                .find("store_embed_handoff_admitted(")
                .unwrap_or_else(|| panic!("{name}: throttle not consulted"));
            assert!(policy < throttle, "{name}: throttle taken before policy");
        }
        assert!(
            epic_rs.contains("RejectLauncherScheme")
                && epic_rs.contains("epic_embed_record_launcher_scheme_block("),
            "Epic popup hook must count launcher-scheme popups (D-14)"
        );
    }
}
