//! Humble login cookie handlers: read, census read and clear (Phase 71 D-07, D-12). Child of `login_window`; sees its private items.

use super::*;

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
pub(crate) fn rpc_humble_login_cookies(args: &[Value], app: &AppHandle) -> Result<Value, String> {
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
pub(crate) fn rpc_humble_login_cookies_for_domain(args: &[Value], app: &AppHandle) -> Result<Value, String> {
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
pub(crate) fn rpc_humble_login_clear_cookies(args: &[Value], app: &AppHandle) -> Result<Value, String> {
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
    // Delegates to `count_window_cookies_matching_macos` (below the handler); the F-34.4.2-12
    // rationale lives on that fn.
    #[cfg(target_os = "macos")]
    let count_matching = |w: &tauri::WebviewWindow| -> Result<usize, String> {
        count_window_cookies_matching_macos(w, domain)
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
        remove_window_cookies_macos(&window, domain, before_matching, &count_matching)
    }

    #[cfg(windows)]
    {
        remove_window_cookies_windows(&window, domain, before_matching, &count_matching)
    }

    #[cfg(all(not(target_os = "macos"), not(windows)))]
    {
        // ---- Linux: UNVERIFIED on the existing wry `delete_cookie()` path (D-09,
        // REQ-34.4.1-13). Both measured platforms have now shown wry's
        // `delete_cookie` round trip losing a property (macOS: the NSHTTPCookie
        // rebuild; Windows: cookie-0.18's `domain()` dropping the leading dot, see
        // `remove_window_cookies_windows`). wry's `webkitgtk` `delete_cookie`
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
// Fixed the SAME way `remove_window_cookies_macos` (below) and
// `clear_default_data_store_cookies_for_domain` (above) already read/removed
// cookies safely: `with_webview()` -> `WKHTTPCookieStore.getAllCookies()` via an
// async completion handler, with the wait on a plain `mpsc_channel` done on the
// CALLING (worker) thread, never nested inside the main-thread closure itself --
// that closure only registers the completion block and returns immediately, so it
// never blocks main-thread control flow and never needs (or triggers) a reentrant
// run-loop pump. Root-cause fix, not a timing mitigation.
#[cfg(target_os = "macos")]
fn count_window_cookies_matching_macos(
    w: &tauri::WebviewWindow,
    domain: &str,
) -> Result<usize, String> {
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
            // SAFETY: mirrors `remove_window_cookies_macos`'s cast, below --
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
}

#[cfg(target_os = "macos")]
fn remove_window_cookies_macos(
    window: &tauri::WebviewWindow,
    domain: &str,
    before_matching: usize,
    count_matching: &dyn Fn(&tauri::WebviewWindow) -> Result<usize, String>,
) -> Result<Value, String> {
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

    let after_matching = count_matching(window)?;
    Ok(Value::Number(
        verified_delete_count(before_matching, after_matching).into(),
    ))
}

#[cfg(windows)]
fn remove_window_cookies_windows(
    window: &tauri::WebviewWindow,
    domain: &str,
    before_matching: usize,
    count_matching: &dyn Fn(&tauri::WebviewWindow) -> Result<usize, String>,
) -> Result<Value, String> {
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
    // This single `DeleteCookie` pass is only reliable while NOTHING IS WRITING TO
    // THE JAR. Humble on Windows 11 (2026-11-11, debug `webview2-humble-deletecookie`)
    // caught it failing -- `before=31 after=23`, with the CDP pass then doing most
    // of the clearing (`issued=25 partitioned=2` on the first run) -- and the
    // failure was not `DeleteCookie`'s:
    //   - the 23 survivors shared no attribute (survival ~0.74 for every value of
    //     every dimension: leading dot vs host-only, subdomain depth, Secure,
    //     SameSite, lifetime) and were scattered across the enumeration order, so
    //     neither a cookie shape nor a per-batch quota is involved (a later pass
    //     issued 27 calls and landed all of them);
    //   - the jar GREW (24 -> 27) over an idle 1.3s while nothing of ours ran, and
    //     13 of the 23 survivors held a different value than at the pre-delete
    //     read: something live was re-writing the cookies being deleted;
    //   - once that went quiet, a second `DeleteCookie` pass on fresh `GetCookies`
    //     objects removed 26 of 27, the one left being the partitioned cookie.
    // The writer is inferred (cookie names and domains are never logged) to be the
    // clear window's own page: the caller had opened it on the live
    // `www.humblebundle.com`, a window built on an https URL IS a navigation
    // (`rpc_humble_login_open` returns at `.build()`, mid-load), and Humble's
    // loading page kept setting its cookies into the shared jar. Epic's clear has
    // always used a non-resolving host (`COOKIE_HANDLE_ORIGIN`, legendary/user.ts),
    // which is why its 2026-09-26 measurement above was clean (`before=9 after=1`,
    // the 1 partitioned). Humble's non-macOS clear now does the same
    // (`HUMBLE_COOKIE_CLEAR_HANDLE_ORIGIN`, humble/constants.ts). So: a caller must
    // never point this arm's window at the real site and lean on the CDP pass to
    // mop up -- that is exactly what the live measurement caught. Not separable
    // from that run: whether `DeleteCookie` on the `GetCookies` handler's own
    // objects is also racy against a live writer (the fresh-object pass only ran
    // after the writer had gone quiet).
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
    let mut after_matching = count_matching(window)?;
    let mut settle_rereads = 0u32;
    while after_matching > 0 && std::time::Instant::now() < settle_deadline {
        thread::sleep(Duration::from_millis(100));
        after_matching = count_matching(window)?;
        settle_rereads += 1;
    }
    // Counts only, never a cookie name or value. Tells the live gate whether the
    // removal landed synchronously (0 re-reads) or needed the settle window.
    shell_eprintln!(
        "[shell] humble_login_clear_cookies: before={before_matching} after={after_matching} settle_rereads={settle_rereads}"
    );
    if after_matching > 0 {
        // Survivors of `DeleteCookie`: partitioned (CHIPS) cookies, which that API
        // cannot address (measured twice: Epic 2026-09-26, and Humble 2026-11-11,
        // where the one cookie left after repeated `DeleteCookie` passes on a quiet
        // jar was the partitioned one -- see this arm's header for why a live page
        // in the clear window can strand far more than that). CDP
        // `Network.deleteCookies` takes the partition key. A CDP failure is logged,
        // not returned -- the re-read below still measures whatever actually
        // happened, and the TS guard fails closed on a residual. Cost: a domain
        // holding a partitioned cookie waits out the first settle window (2s)
        // before this pass runs.
        match webview2_cdp_delete_matching_cookies(window, domain) {
            Ok((issued, partitioned)) => shell_eprintln!(
                "[shell] humble_login_clear_cookies: CDP cleanup issued={issued} partitioned={partitioned}"
            ),
            Err(e) => shell_eprintln!(
                "[shell] humble_login_clear_cookies: CDP cleanup failed: {e}"
            ),
        }
        let cdp_deadline = std::time::Instant::now() + CLEAR_COOKIES_SETTLE;
        after_matching = count_matching(window)?;
        while after_matching > 0 && std::time::Instant::now() < cdp_deadline {
            thread::sleep(Duration::from_millis(100));
            after_matching = count_matching(window)?;
        }
        shell_eprintln!(
            "[shell] humble_login_clear_cookies: after CDP cleanup after={after_matching}"
        );
    }
    Ok(Value::Number(
        verified_delete_count(before_matching, after_matching).into(),
    ))
}
