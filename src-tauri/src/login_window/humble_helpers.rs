//! Pure, AppHandle-free helpers shared by the Humble login-window handlers: label, URL and title shaping, cookie-domain filters, event queue, chrome CSS (Phase 71 D-12). Child of `login_window`; sees its private items.

use super::*;

/// Generates a login-window label that can NEVER equal `main`/`about` and is NEVER
/// derived from any caller-supplied argument (T-34.1-27, REQ-34.4.1-09) -- the Rust-side
/// port of `tauriChildWindows.ts`'s `nextExternalWindowLabel()` discipline. The fixed
/// `loginwin-` prefix (neither reserved label starts with it) plus a process-lifetime
/// monotonic counter plus a nanosecond timestamp guarantee uniqueness; the trailing hex
/// entropy (sourced from `RandomState`'s OS-seeded random keys -- std, no new dependency)
/// means the label is not predictable from the counter/timestamp alone. Child labels
/// never join `capabilities/default.json`'s `windows: ["main"]` array, so a label that is
/// never `main`/`about` and never url-derived matches NO capability and gets zero Tauri
/// command access.
pub(crate) fn next_login_window_label() -> String {
    let n = LOGIN_WINDOW_LABEL_COUNTER.fetch_add(1, Ordering::SeqCst);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut hasher = std::collections::hash_map::RandomState::new().build_hasher();
    (n, nanos).hash(&mut hasher);
    let entropy = (hasher.finish() & 0xffff_ffff) as u32;
    format!("loginwin-{n:x}-{nanos:x}-{entropy:08x}")
}

/// The semantic half of `humble_login_open`'s ASVS V5 input validation (threat T-34.4.1-08):
/// the generated `HumbleLoginOpenArgs::from_args` has already proved `args[0]` is a string
/// (`humble_login_open:bad-args` otherwise); this proves it parses as an absolute URL whose
/// scheme is exactly `https`. `http://`, `file://` and `javascript:` are all rejected HERE,
/// before any real OS window is constructed -- this is the arm's only gate.
pub(crate) fn login_window_parse_url(raw: &str) -> Result<tauri::Url, String> {
    let url = tauri::Url::parse(raw).map_err(|_| "humble_login_open:bad-url".to_string())?;
    if url.scheme() != "https" {
        return Err("humble_login_open:bad-url".to_string());
    }
    Ok(url)
}

/// Composes the login window's OS title with the SHELL-RESOLVED origin FIRST, always
/// (Phase 34.5 Plan 27, F-34.5-G6-04, T-34.5-G6-22/T-34.5-G6-23). `AppHandle`-free and
/// `#[cfg(test)]`-covered, mirroring `clipboard_text_arg`/`login_window_parse_url`'s own
/// pure-helper convention.
///
/// `origin` MUST come from the URL the shell itself validated (`login_window_parse_url`'s
/// return value, via `tauri::Url::origin().ascii_serialization()`) -- NEVER from page
/// content. `document_title` is the page's own `document.title`, which is fully
/// attacker-controlled: the loaded page can set it to anything, including a string
/// crafted to look like a URL or an origin (T-34.5-G6-23). That is exactly why the
/// document title can never be trusted as an origin indicator on its own, and exactly why
/// this helper places `origin` first, unconditionally, with the document title (if any)
/// appended only AFTER it -- a truncated title bar still shows the trustworthy part first,
/// and the page's text can never precede or replace it.
pub(crate) fn login_window_title(origin: &str, document_title: Option<&str>) -> String {
    match document_title {
        Some(title) if !title.is_empty() => format!("{origin} — {title}"),
        _ => origin.to_string(),
    }
}

/// The ONLY domain comparison in this file -- the wry cookies-for-url API (the plausible
/// but WRONG shortcut this function replaces) MUST NOT appear anywhere in `main.rs` (see
/// the cookie arms below). Proper suffix match: `host ==
/// domain` OR `host` ends with `.{domain}`, never wry's `==`-only comparison, which
/// silently drops `_simpleauth_sess` for `www.humblebundle.com` because Humble stores it
/// against the apex domain `humblebundle.com` (spike 014a /
/// `.claude/skills/spike-findings-gamelib/references/tauri-login-webview-cookies.md`).
pub(crate) fn cookie_domain_matches(host: &str, domain: Option<&str>) -> bool {
    match domain {
        // Normalize a leading-dot `domain` (RFC 6265's wildcard-subdomain marker) before
        // comparing (F-34.4.2-19). Without this, `format!(".{d}")` on an already-dotted `d`
        // produces an impossible ".."-prefixed suffix requirement no real hostname can ever
        // satisfy, making this comparator categorically blind to any leading-dot cookie
        // domain regardless of `host` -- exactly the shape `_simpleauth_sess`'s real,
        // live-measured domain (".humblebundle.com") takes, which silently broke
        // `humble_login_cookies`' poll arm. RFC 6265 defines a `.example.com` cookie as
        // applying to `example.com` itself, not only to its subdomains, so stripping the
        // leading dot here is the spec-correct fix, not a special case. Argument order at
        // every call site is DELIBERATELY left untouched (Plan 22, F-6 Defect A) -- this
        // normalizes the value being compared, not which position it is compared from.
        Some(d) => {
            let d = d.strip_prefix('.').unwrap_or(d);
            host == d || host.ends_with(&format!(".{d}"))
        }
        None => false,
    }
}

/// Domain-suffix match for a `WKWebsiteDataRecord`'s `displayName()` (Phase 34.4.1 Plan 23,
/// F-6 Defect B, REQ-34.4.1-06). `displayName` and a cookie's `domain()` share the exact same
/// shape -- a bare host string, grouped by the public suffix list -- so this delegates to
/// `cookie_domain_matches` above (the ONLY domain comparison this file uses, per its own
/// comment) rather than reimplementing suffix discipline a second, subtly different way. A
/// second ad hoc comparator in this file is exactly how Defect A happened (Plan 22): do not
/// repeat that mistake here just because the input is a record instead of a cookie. The
/// `display_name.is_empty()` guard is explicit rather than left implicit in
/// `cookie_domain_matches`'s own logic, so an empty display name can never accidentally match
/// (`cookie_domain_matches("", Some(d))` is already `false` for any non-empty `d`, but this
/// states the guarantee in-source rather than relying on that as an unstated side effect).
pub(crate) fn website_data_record_matches_domain(display_name: &str, target: &str) -> bool {
    if display_name.is_empty() {
        return false;
    }
    cookie_domain_matches(display_name, Some(target))
}

/// The measured-delete-count contract this plan establishes (Phase 34.4.1 Plan 23, F-6
/// Defect B): `before - after`, saturating at zero rather than wrapping, so a jar that GREW
/// between the two reads (a concurrent login racing the clear) can never produce a negative
/// or wrapped count. This is deliberately NEVER the pre-removal size of the matched set,
/// computed before any removal ran -- that attempted-count shape is the exact bug this plan
/// closes. Both `before` and
/// `after` must be counted with the SAME filter (the clear direction), or the subtraction is
/// meaningless; callers are responsible for that symmetry.
pub(crate) fn verified_delete_count(before: usize, after: usize) -> usize {
    before.saturating_sub(after)
}

/// Shapes one `LOGIN_WINDOW_EVENTS` queue entry -- the exact `{"event", "url"}` shape
/// `humble_login_take_events`'s interface contract promises the sidecar.
pub(crate) fn login_event_value(kind: &str, url: &str) -> Value {
    serde_json::json!({ "event": kind, "url": url })
}

/// Pushes one navigation event onto `label`'s queue, capping it at
/// `LOGIN_WINDOW_EVENTS_CAP` with oldest-dropped (T-34.4.1-09). Called from the
/// `on_page_load` hook below, which may run off the calling thread -- hence the `Mutex`.
/// A poisoned lock (only reachable after a prior panic elsewhere) fails this single push
/// silently rather than panicking a webview navigation callback.
pub(crate) fn push_login_window_event(label: &str, event: Value) {
    let Ok(mut guard) = LOGIN_WINDOW_EVENTS.lock() else {
        return;
    };
    let map = guard.get_or_insert_with(HashMap::new);
    let queue = map.entry(label.to_string()).or_insert_with(Vec::new);
    queue.push(event);
    if queue.len() > LOGIN_WINDOW_EVENTS_CAP {
        queue.remove(0);
    }
}

// ---- humble_reveal_post support (Phase 34.4.1 Plan 04, D-07/D-08, REQ-34.4.1-05) ----
//
// `humblePostRequest` (`backend/humble/adapter.ts`) routes its ONE write-style Humble call
// (the reveal-key POST) through this arm under Tauri instead of Electron's `net.request`.
// Design: open a HIDDEN, on-demand child window on the real Humble origin, run the POST from
// the page's OWN JS `fetch()` (a genuine WKWebView network stack -- the one structurally-new
// transport with its own real browser TLS/HTTP fingerprint), and read the result back via a
// navigation-intercept exfil the arm itself cancels before it can resolve anywhere (Open
// Question 1, RESEARCH.md -- discharged below).

/// Builds the JS injected as an `initialization_script()` into the Tauri-managed login
/// surface's VISIBLE builder ONLY (`humble_login_open`'s `if visible` block), deliberately
/// WITHOUT a `#[cfg(target_os = "macos")]` gate (D-2, quick task 260822-di1). (The macOS sheet
/// chrome -- cancel strip, origin banner, scrollbar inset -- was once injected alongside it;
/// quick-261029-osq replaced all three with the native bar, `install_native_login_bar`.) This
/// script substitutes for nothing platform-specific: Humble's
/// marketing footer and navbar are visual noise on the login page on Windows and Linux too, so
/// it is injected on every platform, unconditionally, inside the `if visible` block.
///
/// Purpose: CSS hiding is chosen over DOM surgery because it is fail-safe -- if Humble re-skins
/// and either selector stops matching, the page renders unchanged instead of breaking, and the
/// two rules fail independently of each other (260822-eib D-1: two separate declaration
/// blocks, not one comma-joined selector list, so a syntax error in one never drops the
/// other). Reversal is a one-line edit to a single shared constant
/// (`src/common/humble/loginChromeCss.ts`'s `HUMBLE_LOGIN_CHROME_CSS`, this function's
/// drift-pinned counterpart). The optional wrapper-padding tighten from the originating task
/// brief was declined (D-1, `loginChromeCss.ts`'s own doc comment) -- there is no measured
/// baseline for that padding, so any override would be an unverifiable guess. This now covers
/// two full-width page-chrome selectors (`footer.site-footer`, `.simple-navbar`), not one
/// (260822-eib).
///
/// Takes no arguments and interpolates nothing -- there is no `serde_json::to_string`
/// placeholder-token step here, because there is no untrusted or caller-supplied value
/// anywhere in this script's body.
///
/// Contract this script implements (T-di1-01..06, quick task 260822-di1's threat register):
/// - **Top-frame only.** The FIRST statement inside the try is `if (window.top !== window) {
///   return; }`, the house discipline (spike 013 measured 5 of 8
///   navigation events on Humble's real login page as third-party iframes).
/// - **Host gate runs BEFORE the idempotence flag (D-3).** This is a deliberate divergence
///   from the flag-then-work order the retired chrome scripts used: on `accounts.google.com` (or
///   any other host this runner-agnostic window opens -- `humble_login_open` takes no
///   `runner` argument) the script returns immediately after the host check and touches
///   NOTHING, not even a `window` property -- the same "a non-participating document leaves
///   no state behind" discipline the top-frame guard above already encodes for subframes.
///   Anchored via `host.slice(-SUFFIX.length) !== SUFFIX`, never `indexOf` -- a substring test
///   would also match the look-alike host `humblebundle.com.evil.example` (T-di1-02).
/// - Idempotent via `window.__GAMELIB_LOGIN_CHROME_CSS__`, set before any further DOM work.
/// - Sets exactly ONE `<style>` element's `.textContent` -- never an HTML-fragment-write API
///   of any kind. The CSS text below is byte-identical to `HUMBLE_LOGIN_CHROME_CSS`
///   (`src/common/humble/loginChromeCss.ts`); `loginChromeCssInjection.test.ts` pins this with
///   a byte-equality drift check, proven RED against a synthetic mismatched literal (T-di1-06).
/// - **Retry for document-start root absence (D-4), not for a hostile page.** An
///   `initialization_script` runs at document-start, when `document.head` may not exist yet,
///   so a bare `build()` would silently no-op and the CSS would never apply for that document.
///   The `document.readyState === 'loading'` -> `document.onreadystatechange` arm (a PROPERTY
///   ASSIGNMENT, never `addEventListener`) closes that gap the same way
///   the retired chrome scripts did, and the debounced `MutationObserver` closes the
///   re-append case for free.
/// - Registers NO listener of any kind, of ANY type -- `document.onreadystatechange` is a
///   property assignment, not a registration -- so REQ-34.4.2-06 (Cmd+V into the password
///   field must keep working) holds by construction here, not merely by omission of the
///   specific key names (T-di1-01).
/// - Never reads any input's `value`, transmits nothing anywhere, creates no iframe
///   (T-di1-01).
/// - Whole body in exactly ONE top-level `try { } catch (e) { }` (T-di1-03) -- a throwing
///   script must never break a live, credential-bearing login page.
/// - Pure: calling this twice yields byte-identical output.
///
/// Uses this file's `concat!`-of-single-line-pieces discipline (matching this file's other injected scripts'
/// own convention) -- every JS string literal below is single-quoted, so every piece keeps an
/// EVEN raw `"`-count on its own source line (`longRunningChannels.test.ts`'s WR-08
/// stripper-integrity guard).
pub(crate) fn login_chrome_css_script() -> String {
    concat!(
        "(function() { ",
        "try { ",
        "if (window.top !== window) { return; } ",
        "var SUFFIX = '.humblebundle.com'; ",
        "var host = location.hostname || ''; ",
        "if (host !== 'humblebundle.com' && host.slice(-SUFFIX.length) !== SUFFIX) { return; } ",
        "if (window.__GAMELIB_LOGIN_CHROME_CSS__) { return; } ",
        "window.__GAMELIB_LOGIN_CHROME_CSS__ = true; ",
        "var ID = '__gamelib_login_chrome_css__'; ",
        "function build() { ",
        "var buildRoot = document.head || document.documentElement; ",
        "if (!buildRoot) { return; } ",
        "var style = document.createElement('style'); ",
        "style.id = ID; ",
        "style.textContent = 'footer.site-footer { display: none !important; } .simple-navbar { display: none !important; }'; ",
        "buildRoot.appendChild(style); ",
        "} ",
        "function ensure() { ",
        "if (!document.getElementById(ID)) { build(); } ",
        "} ",
        "if (document.readyState === 'loading') { ",
        "document.onreadystatechange = function() { ensure(); }; ",
        "} ",
        "var debounceTimer = null; ",
        "function scheduleEnsure() { ",
        "if (debounceTimer) { return; } ",
        "debounceTimer = setTimeout(function() { debounceTimer = null; ensure(); }, 200); ",
        "} ",
        "var observer = new MutationObserver(function() { scheduleEnsure(); }); ",
        "observer.observe(document.documentElement, { childList: true, subtree: true }); ",
        "ensure(); ",
        "} catch (e) { } ",
        "})();"
    )
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ---- next_login_window_label (Phase 34.4.1 Plan 01, REQ-34.4.1-09, T-34.1-27) ----
    //
    // RED direction: a hard-coded or url-derived label would flip
    // `login_window_label_is_never_reserved` / `_never_derived_from_url` to failing.

    #[test]
    fn humble_login_window_label_is_never_reserved() {
        let label = next_login_window_label();
        assert_ne!(label, "main");
        assert_ne!(label, "about");
        assert!(label.starts_with("loginwin-"));
    }

    #[test]
    fn humble_login_window_labels_differ_across_calls() {
        let first = next_login_window_label();
        let second = next_login_window_label();
        assert_ne!(first, second);
    }

    #[test]
    fn humble_login_window_label_is_never_derived_from_url() {
        // A URL containing "humblebundle" is in scope while the label is generated, but
        // `next_login_window_label()` takes no arguments at all — the label can
        // structurally never be a function of any URL.
        let _url_in_scope = "https://www.humblebundle.com/login";
        let label = next_login_window_label();
        assert!(!label.contains("humblebundle"));
        assert!(!label.contains("www"));
    }

    #[test]
    fn humble_login_window_parse_url_rejects_non_https() {
        assert_eq!(
            login_window_parse_url("http://www.humblebundle.com/login").unwrap_err(),
            "humble_login_open:bad-url"
        );
        assert_eq!(
            login_window_parse_url("file:///etc/passwd").unwrap_err(),
            "humble_login_open:bad-url"
        );
        assert_eq!(
            login_window_parse_url("javascript:alert(1)").unwrap_err(),
            "humble_login_open:bad-url"
        );
        let ok = login_window_parse_url("https://www.humblebundle.com/login");
        assert!(ok.is_ok());
        assert_eq!(ok.unwrap().scheme(), "https");
    }

    // ---- login_window_title (Phase 34.5 Plan 27, F-34.5-G6-04, T-34.5-G6-22/23) ----
    //
    // RED direction: an implementation that puts the document title first, or that
    // returns the document title alone when it looks URL-shaped, would flip these to
    // failing.

    #[test]
    fn humble_login_window_title_puts_origin_before_document_title() {
        let title = login_window_title("https://www.humblebundle.com", Some("Sign In"));
        assert!(title.starts_with("https://www.humblebundle.com"));
        assert!(title.contains("Sign In"));
        // The origin's END must come before the document title's START -- not merely
        // "both substrings present somewhere" -- so a naive implementation that
        // concatenates in the wrong order cannot pass on a substring check alone.
        let origin_end = title.find("https://www.humblebundle.com").unwrap()
            + "https://www.humblebundle.com".len();
        let title_start = title.find("Sign In").unwrap();
        assert!(origin_end <= title_start);
    }

    #[test]
    fn humble_login_window_title_no_document_title_returns_the_origin_alone() {
        assert_eq!(
            login_window_title("https://www.humblebundle.com", None),
            "https://www.humblebundle.com"
        );
    }

    #[test]
    fn humble_login_window_title_empty_document_title_is_treated_as_absent() {
        // An empty string is not a meaningful document title (e.g. before the page's
        // first title event) -- must not produce a title with a trailing empty suffix.
        assert_eq!(
            login_window_title("https://www.humblebundle.com", Some("")),
            "https://www.humblebundle.com"
        );
    }

    #[test]
    fn humble_login_window_open_seeds_the_shared_origin_from_the_validated_url_before_any_page_load(
    ) {
        // Mirrors the EXACT expression the humble_login_open arm uses to seed
        // `current_origin` (its `Arc<Mutex<String>>`) before the window is built and
        // before any `on_page_load` event can possibly fire --
        // `url.origin().ascii_serialization()`, fed through `login_window_title` with no
        // document title, is precisely what the arm's initial `window.set_title()` call
        // (right after `.build()`) composes. Proves the origin is present from the seed
        // alone, with no page-load event required.
        let url = login_window_parse_url("https://www.humblebundle.com/login?x=1").unwrap();
        let seeded_origin = url.origin().ascii_serialization();
        assert_eq!(seeded_origin, "https://www.humblebundle.com");
        assert_eq!(
            login_window_title(&seeded_origin, None),
            "https://www.humblebundle.com"
        );
    }

    // ---- cookie_domain_matches (Phase 34.4.1 Plan 01, REQ-34.4.1-01, spike 014a) ----

    #[test]
    fn humble_login_cookie_domain_matches_the_www_regression_case() {
        // THE single most consequential assertion in this file. wry's own
        // cookies-for-url shortcut computes `cookie.domain() == url.domain()`, which for
        // host "www.humblebundle.com" against a cookie domain of "humblebundle.com"
        // evaluates to `"humblebundle.com" == "www.humblebundle.com"` -> false, silently
        // dropping `_simpleauth_sess`. This function must get it right: a suffix match,
        // not equality.
        assert!(cookie_domain_matches(
            "www.humblebundle.com",
            Some("humblebundle.com")
        ));
    }

    #[test]
    fn humble_login_cookie_domain_matches_rejects_suffix_lookalikes() {
        assert!(!cookie_domain_matches(
            "www.humblebundle.com",
            Some("evilhumblebundle.com")
        ));
        assert!(!cookie_domain_matches("www.humblebundle.com", None));
    }

    // ---- humble_login_cookies_for_domain's direction (Phase 34.4.1 Plan 22, F-6 Defect A,
    // REQ-34.4.1-GAP-07). `humble_login_cookies_for_domain`'s filter calls
    // `cookie_domain_matches(d, Some(domain))` -- the cookie's OWN domain first, the caller's
    // fixed target second -- mirroring `humble_login_clear_cookies`'s (unchanged) filter
    // exactly. These cases assert that call shape directly against `cookie_domain_matches`,
    // the same "test the pure comparison, not a window-backed arm" convention the two cases
    // above already use. ----

    #[test]
    fn humble_login_cookies_for_domain_matches_bare_apex_cookie() {
        // A cookie whose domain attribute is the bare apex matches a query for that apex.
        assert!(cookie_domain_matches(
            "humblebundle.com",
            Some("humblebundle.com")
        ));
    }

    #[test]
    fn humble_login_cookies_for_domain_matches_leading_dot_cookie() {
        // A cookie whose domain attribute carries the leading-dot form (RFC 6265's
        // wildcard-subdomain marker) still matches a query for the bare apex -- this is
        // Defect A's headline case: `humble_login_cookies`' direction cannot ever match this
        // shape against a FIXED target (see the asymmetry test below).
        assert!(cookie_domain_matches(
            ".humblebundle.com",
            Some("humblebundle.com")
        ));
    }

    #[test]
    fn humble_login_cookies_for_domain_matches_subdomain_cookie() {
        // A cookie scoped to a subdomain matches a query for the parent apex.
        assert!(cookie_domain_matches(
            "www.humblebundle.com",
            Some("humblebundle.com")
        ));
    }

    #[test]
    fn humble_login_cookies_for_domain_rejects_suffix_lookalikes() {
        // Same lookalike guard as the existing poll-direction case above, proven in this
        // arm's own direction: a literal `.` separator is required, so a domain that merely
        // ENDS WITH the target string as a substring (no separator) must not match.
        assert!(!cookie_domain_matches(
            "nothumblebundle.com",
            Some("humblebundle.com")
        ));
    }

    #[test]
    fn humble_login_cookies_for_domain_direction_is_the_defect_a_fix() {
        // F-34.4.2-19 (fixed) -- REWRITTEN. Before this fix, this test's first assertion
        // pinned `cookie_domain_matches`'s POLL-direction argument order
        // (`cookie_domain_matches(fixed_host, Some(cookie_domain))`, exactly what
        // `humble_login_cookies`' poll arm calls at main.rs:3878-3885) as UNCONDITIONALLY
        // blind to any leading-dot cookie domain -- and asserted that blindness as CORRECT,
        // intended behavior ("the suffix branch can never fire for a leading-dot cookie
        // domain, so it silently fails to match"). It was not correct: that assertion
        // pinned F-34.4.2-19's own root cause in place. `_simpleauth_sess`'s real,
        // live-measured domain is `.humblebundle.com` (leading dot); with the old
        // comparator, the poll arm could never match it, so Humble's login watcher polled
        // forever without ever finding its own session cookie -- silently, with zero log
        // output, because the early-return this produced (user.ts:494-498) sits upstream of
        // every logging path in that function. `34.4.1-SPIKE-016-FINDINGS.md`'s live
        // measurement (total=33, poll direction=29 -- 4 cookies silently dropped) was this
        // SAME undercounting, and was filed there as an acceptable, documented asymmetry
        // rather than as the defect it actually was. Do not read that document, or this
        // test's prior form, as evidence the old behavior was ever intentional.
        //
        // `cookie_domain_matches` now strips a leading dot from its `domain` argument before
        // comparing (RFC 6265: a `.example.com` cookie is defined to apply to `example.com`
        // itself, not only to its subdomains), so BOTH directions now correctly match a
        // leading-dot cookie domain against its own bare apex host:
        assert!(cookie_domain_matches(
            "humblebundle.com",
            Some(".humblebundle.com")
        ));
        assert!(cookie_domain_matches(
            ".humblebundle.com",
            Some("humblebundle.com")
        ));
    }

    #[test]
    fn cookie_domain_matches_normalizes_leading_dot_domain_against_apex_host() {
        // F-34.4.2-19 fix-verification test. Pre-fix: `format!(".{d}")` on an
        // already-dotted `d` (".humblebundle.com") produces an impossible
        // ".."-prefixed suffix requirement no real hostname can satisfy, so this returned
        // false -- RED against the pre-fix comparator. Post-fix, the leading dot is
        // stripped from `domain` before comparing, so this is GREEN.
        assert!(cookie_domain_matches(
            "humblebundle.com",
            Some(".humblebundle.com")
        ));
    }

    #[test]
    fn cookie_domain_matches_normalizes_leading_dot_domain_against_subdomain_host() {
        // F-34.4.2-19 fix-verification test -- the ACTUAL production shape of the defect.
        // `humble_login_cookies`' poll arm (main.rs:3878-3885) calls
        // `cookie_domain_matches(host_for_filter, Some(c.domain()))` with `host_for_filter`
        // fixed at "www.humblebundle.com" and `_simpleauth_sess`'s real, live-measured
        // domain being ".humblebundle.com" (leading dot). This is that exact call,
        // reproduced directly. RED against the pre-fix comparator, GREEN post-fix.
        assert!(cookie_domain_matches(
            "www.humblebundle.com",
            Some(".humblebundle.com")
        ));
    }

    #[test]
    fn cookie_domain_matches_direction_still_discriminates_for_host_vs_subdomain_pairs() {
        // Normalizing the leading dot makes the comparator order-INsensitive for the
        // apex-host/leading-dot-domain pair specifically -- that pair (the one the rewritten
        // test above now asserts symmetrically) stops being a canary for Plan 22's Defect A
        // argument-order regression. Direction still matters for other shapes, and the fix
        // deliberately leaves argument order untouched at both call sites, so that
        // protection must not be silently retired: an apex HOST can never match a cookie
        // scoped to a SUBDOMAIN, but a subdomain host correctly matches a cookie scoped to
        // its own parent apex. Pinned here with a non-Humble pair so it stays independent of
        // the now-symmetric leading-dot case above.
        assert!(!cookie_domain_matches(
            "epicgames.com",
            Some("www.epicgames.com")
        ));
        assert!(cookie_domain_matches(
            "www.epicgames.com",
            Some("epicgames.com")
        ));
    }

    #[test]
    fn humble_login_cookies_for_domain_does_not_disturb_the_poll_direction() {
        // Regression pin (binding constraint 1): the existing `humble_login_cookies` arm's
        // OWN call site (`cookie_domain_matches(host, c.domain())`, unedited by this plan)
        // must still match the www-page-host-vs-apex-cookie case it was proven correct
        // against by spike 014a. This is the SAME assertion as
        // `humble_login_cookie_domain_matches_the_www_regression_case` above, re-stated here
        // in this arm's own test group so a reviewer looking only at the new arm's tests can
        // see the poll's direction was checked, not merely assumed unaffected.
        assert!(cookie_domain_matches(
            "www.humblebundle.com",
            Some("humblebundle.com")
        ));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn epic_cookie_domain_matches_accepts_subdomains_of_each_apex() {
        // The set is APEX domains and `cookie_domain_matches` does the suffix work -- the
        // measured survivors were scoped to `.www.epicgames.com` and `.ecosec.on.epicgames.com`,
        // never to the bare apex, so a guard that only matched apexes exactly would be blind to
        // every cookie it exists to reach.
        for domain in [
            "www.epicgames.com",
            "ecosec.on.epicgames.com",
            "www.fortnite.com",
            "www.unrealengine.com",
            "www.twinmotion.com",
            "www.metahuman.com",
        ] {
            assert!(
                epic_cookie_domain_matches(domain),
                "expected the Epic-owned subdomain `{domain}` to reach the macOS clear path"
            );
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn epic_cookie_domain_matches_rejects_suffix_lookalikes() {
        // `notepicgames.com` ends with `epicgames.com` as a raw substring but is a DIFFERENT
        // registrable domain. This is `cookie_domain_matches`'s own discipline (it requires
        // `host == d` or `host` ending with `.{d}`), re-asserted through the Epic wrapper so a
        // future hand-rolled suffix test here -- the second-comparator mistake Plan 22's Defect
        // A already paid for -- fails loudly instead of silently widening the clear.
        for domain in [
            "notepicgames.com",
            "myfortnite.com",
            "fakeunrealengine.com",
            "epicgames.com.evil.example",
        ] {
            assert!(
                !epic_cookie_domain_matches(domain),
                "suffix lookalike `{domain}` must NOT reach Epic's clear path"
            );
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn store_logout_cookie_domain_matches_accepts_subdomains_of_each_apex() {
        // The set is APEX domains and `cookie_domain_matches` does the suffix work -- GOG's own
        // login flow runs on `login.gog.com`, and Amazon's on `www.amazon.com`, neither of
        // which is the bare apex.
        for domain in ["login.gog.com", "www.gog.com", "www.amazon.com"] {
            assert!(
                store_logout_cookie_domain_matches(domain),
                "expected the store-logout subdomain `{domain}` to reach the macOS clear path"
            );
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn store_logout_cookie_domain_matches_rejects_suffix_lookalikes() {
        // `notgog.com`/`notamazon.com` end with the apex as a raw substring but are DIFFERENT
        // registrable domains -- `cookie_domain_matches`'s own discipline (`host == d` or `host`
        // ending with `.{d}`), re-asserted through this wrapper.
        for domain in ["notgog.com", "gog.com.evil.example", "notamazon.com"] {
            assert!(
                !store_logout_cookie_domain_matches(domain),
                "suffix lookalike `{domain}` must NOT reach the store-logout clear path"
            );
        }
    }

    // ---- website_data_record_matches_domain / verified_delete_count (Phase 34.4.1 Plan 23,
    // F-6 Defect B, REQ-34.4.1-06). The half of the WKWebsiteDataStore rewrite that can be
    // proven without a live WebKit -- see 34.4.1-23-SUMMARY.md for the platform half, which
    // by construction cannot be unit-tested here (only plan 29's live gate proves it). ----

    #[test]
    fn website_data_record_matches_domain_matches_bare_apex() {
        assert!(website_data_record_matches_domain(
            "humblebundle.com",
            "humblebundle.com"
        ));
    }

    #[test]
    fn website_data_record_matches_domain_matches_subdomain() {
        assert!(website_data_record_matches_domain(
            "www.humblebundle.com",
            "humblebundle.com"
        ));
    }

    #[test]
    fn website_data_record_matches_domain_matches_leading_dot() {
        assert!(website_data_record_matches_domain(
            ".humblebundle.com",
            "humblebundle.com"
        ));
    }

    #[test]
    fn website_data_record_matches_domain_rejects_suffix_lookalike() {
        // D-08 in the opposite direction from a blanket wipe: a displayName-driven filter
        // that matched `nothumblebundle.com` would delete a third party's website data.
        assert!(!website_data_record_matches_domain(
            "nothumblebundle.com",
            "humblebundle.com"
        ));
    }

    #[test]
    fn website_data_record_matches_domain_rejects_empty_display_name() {
        assert!(!website_data_record_matches_domain("", "humblebundle.com"));
    }

    #[test]
    fn verified_delete_count_is_the_measured_delta() {
        assert_eq!(verified_delete_count(5, 2), 3);
        assert_eq!(verified_delete_count(0, 0), 0);
    }

    #[test]
    fn verified_delete_count_saturates_at_zero_when_the_jar_grew() {
        // A jar that GREW between the two reads (a concurrent login racing the clear) must
        // never produce a negative or wrapped count -- `before=3, after=5` would panic on a
        // plain `before - after` in debug builds and silently wrap in release.
        assert_eq!(verified_delete_count(3, 5), 0);
    }

    #[test]
    fn verified_delete_count_is_zero_when_removal_changed_nothing() {
        assert_eq!(verified_delete_count(7, 7), 0);
    }

    // ---- login_event_value (Phase 34.4.1 Plan 01, REQ-34.4.1-03) ----

    #[test]
    fn humble_login_event_value_shape() {
        assert_eq!(
            login_event_value("finished", "https://www.humblebundle.com/login"),
            json!({ "event": "finished", "url": "https://www.humblebundle.com/login" })
        );
    }

    // Quick task 260803-eee Task 5: the shape `humble_login_open`'s new
    // `on_window_event(WindowEvent::Destroyed)` hook pushes -- an empty url is deliberate (a
    // close is not a navigation), never a stale/partial one that could be mistaken for one.
    #[test]
    fn humble_login_event_value_closed_shape_has_an_empty_url() {
        assert_eq!(
            login_event_value("closed", ""),
            json!({ "event": "closed", "url": "" })
        );
    }

    // ---- login_chrome_css_script (quick task 260822-di1, T-di1-01..06; extended by
    // 260822-eib, T-eib-01..05) ----
    //
    // RED direction (mirrors this file's own convention, established above): (a) swapping
    // `style.textContent` for an HTML-fragment-write API in `build()` would fail
    // `login_chrome_css_script_never_uses_innerhtml`; (b) reordering the host gate after the
    // idempotence flag would fail
    // `login_chrome_css_script_top_frame_guard_precedes_the_host_gate_and_the_idempotence_flag`;
    // (c) swapping the anchored `.slice(-SUFFIX.length)` comparison for `.indexOf(` would fail
    // `login_chrome_css_script_is_scoped_to_humblebundle_by_suffix_not_substring`; (d) dropping
    // either CSS rule from the `concat!` literal below (or letting it diverge from the
    // TypeScript constant) would fail the byte-equality drift pin on the jest side
    // (`loginChromeCssInjection.test.ts`'s `DRIFT PIN (T-di1-06)` describe) -- 260822-eib's
    // Task 1 OBSERVED this LIVE: landing the two-rule CSS with the gates below still unflipped
    // produced exactly the three real failures this task's SUMMARY records verbatim, not a
    // reasoned prediction.

    #[test]
    fn login_chrome_css_script_hides_the_footer_and_navbar_leaving_the_four_protected_selectors_untouched(
    ) {
        let script = login_chrome_css_script();
        assert!(script.contains("footer.site-footer { display: none !important; }"));
        assert!(script.contains(".simple-navbar { display: none !important; }"));
        for forbidden in ["#flash", "page-top-messages", "grayout", "zdconsent"] {
            assert!(!script.contains(forbidden));
        }
    }

    #[test]
    fn login_chrome_css_script_is_scoped_to_humblebundle_by_suffix_not_substring() {
        let script = login_chrome_css_script();
        assert!(script.contains(".humblebundle.com"));
        assert!(script.contains("slice("));
        assert!(!script.contains("indexOf("));
    }

    #[test]
    fn login_chrome_css_script_binds_no_keyboard_listener() {
        let script = login_chrome_css_script();
        assert!(!script.contains("keydown"));
        assert!(!script.contains("keyup"));
        assert!(!script.contains("keypress"));
        assert!(!script.contains("addEventListener"));
    }

    #[test]
    fn login_chrome_css_script_never_uses_innerhtml() {
        let script = login_chrome_css_script();
        assert!(!script.contains("innerHTML"));
        assert!(!script.contains("outerHTML"));
        assert!(!script.contains("insertAdjacentHTML"));
        assert!(!script.contains("document.write"));
    }

    #[test]
    fn login_chrome_css_script_never_reads_field_value() {
        let script = login_chrome_css_script();
        assert!(!script.contains(".value"));
    }

    #[test]
    fn login_chrome_css_script_top_frame_guard_precedes_the_host_gate_and_the_idempotence_flag() {
        let script = login_chrome_css_script();
        let guard_idx = script.find("window.top !== window");
        let host_idx = script.find(".humblebundle.com");
        let flag_idx = script.find("__GAMELIB_LOGIN_CHROME_CSS__");
        assert!(guard_idx.is_some());
        assert!(host_idx.is_some());
        assert!(flag_idx.is_some());
        assert!(guard_idx.unwrap() < host_idx.unwrap());
        assert!(host_idx.unwrap() < flag_idx.unwrap());
    }

    #[test]
    fn login_chrome_css_script_is_wrapped_in_a_single_top_level_try_catch() {
        assert_eq!(login_chrome_css_script().matches("try {").count(), 1);
    }

    #[test]
    fn login_chrome_css_script_is_pure_same_output_every_call() {
        let a = login_chrome_css_script();
        let b = login_chrome_css_script();
        assert_eq!(a, b);
    }
}
