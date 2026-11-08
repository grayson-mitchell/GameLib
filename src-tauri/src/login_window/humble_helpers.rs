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
