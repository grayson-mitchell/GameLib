use super::*;

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
pub(crate) fn store_embed_open_link_popup(
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
pub(crate) static STORE_EMBED_STEAM_THROTTLE: Mutex<HandoffThrottle> =
    Mutex::new(HandoffThrottle { last: None });

#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub(crate) static STORE_EMBED_POPUP_THROTTLE: Mutex<HandoffThrottle> =
    Mutex::new(HandoffThrottle { last: None });

/// The embed's current top-level host, recorded from `on_page_load` (main frame only) and read
/// by the `on_navigation` closure for `store_embed_navigation_policy`'s `steam:` gate.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub(crate) static STORE_EMBED_TOP_LEVEL_HOST: Mutex<Option<String>> = Mutex::new(None);

/// Take one admission from `throttle`, failing CLOSED on a poisoned lock: a refused hand-off is
/// the safe direction for a gate whose job is to stop unrequested ones.
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub(crate) fn store_embed_handoff_admitted(throttle: &Mutex<HandoffThrottle>) -> bool {
    match throttle.lock() {
        Ok(mut guard) => guard.admit(std::time::Instant::now(), STORE_EMBED_HANDOFF_MIN_GAP),
        Err(_) => false,
    }
}
