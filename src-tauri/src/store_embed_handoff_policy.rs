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

/// Whether a navigation response is a download the raw Epic `WKWebView` must not keep (Phase 50
/// review): a MIME type the view cannot render (`WKNavigationResponse.canShowMIMEType == false`,
/// e.g. the launcher `.dmg`), or a `Content-Disposition` whose disposition type is `attachment`
/// (case-insensitive token before the first `;`, RFC 6266). The Tauri embed gets the same outcome
/// from wry's `on_download` hook; the raw view has no such hook, so its response-policy delegate
/// asks this and the caller cancels and hands the URL to the system browser (T-40-04-04 parity).
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub(crate) fn navigation_response_is_download(
    can_show_mime_type: bool,
    content_disposition: Option<&str>,
) -> bool {
    !can_show_mime_type
        || content_disposition.is_some_and(|value| {
            value
                .split(';')
                .next()
                .is_some_and(|disposition| disposition.trim().eq_ignore_ascii_case("attachment"))
        })
}

#[cfg(test)]
mod navigation_response_is_download_tests {
    use super::*;

    #[test]
    fn a_type_the_view_cannot_show_is_a_download() {
        assert!(navigation_response_is_download(false, None));
        assert!(navigation_response_is_download(false, Some("inline")));
    }

    #[test]
    fn an_attachment_disposition_is_a_download_even_for_a_showable_type() {
        assert!(navigation_response_is_download(true, Some("attachment")));
        assert!(navigation_response_is_download(
            true,
            Some("Attachment; filename=\"EpicInstaller.dmg\"")
        ));
        assert!(navigation_response_is_download(
            true,
            Some("  ATTACHMENT ;filename=x")
        ));
    }

    #[test]
    fn an_ordinary_page_is_not_a_download() {
        assert!(!navigation_response_is_download(true, None));
        assert!(!navigation_response_is_download(true, Some("inline")));
        assert!(!navigation_response_is_download(
            true,
            Some("inline; filename=x.pdf")
        ));
        // Token match, not a prefix match.
        assert!(!navigation_response_is_download(true, Some("attachments")));
        assert!(!navigation_response_is_download(true, Some("")));
    }

    /// Source-text check (the glue is macOS-only): the Epic surface classifies responses,
    /// cancels downloads and hands them off through the shared policy + throttle, and implements
    /// the WebContent-process-termination hook.
    #[test]
    fn the_epic_surface_routes_downloads_and_handles_content_process_termination() {
        let source = include_str!("macos_epic_embed.rs");
        let start = source
            .find("fn decide_policy_for_navigation_response(")
            .expect("response hook");
        let body = &source[start..(start + 1000).min(source.len())];
        let route = body
            .find("epic_embed_route_download(")
            .expect("response hook must route downloads first");
        let cancel = body
            .find("WKNavigationResponsePolicy::Cancel")
            .expect("response hook must cancel a download");
        assert!(route < cancel);
        let handoff = source
            .find("fn epic_embed_route_download(")
            .expect("download routing fn");
        let handoff_body = &source[handoff..(handoff + 2500).min(source.len())];
        for needle in [
            "canShowMIMEType()",
            "\"Content-Disposition\"",
            "navigation_response_is_download(",
            "crate::open_external(",
        ] {
            assert!(
                handoff_body.contains(needle),
                "download routing missing {needle}"
            );
        }
        let policy = handoff_body
            .find("store_embed_browser_handoff_policy(")
            .expect("download hand-off must use the shared scheme policy");
        let throttle = handoff_body
            .find("store_embed_handoff_admitted(")
            .expect("download hand-off must be throttled");
        assert!(policy < throttle);
        assert!(source.contains("webViewWebContentProcessDidTerminate:"));
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
