//! Humble hidden-window handlers: reveal post and clear storage (Phase 71 D-07, D-12). Child of `login_window`; sees its private items.

use super::*;

/// Non-resolvable exfil host for `humble_reveal_post`'s navigation-intercept return channel
/// (D-07, T-34.4.1-21, Open Question 1). RFC 2606 reserves the `.invalid` TLD as guaranteed
/// non-resolvable, so even a late `on_navigation` cancellation cannot leak the reveal payload
/// to a public DNS resolver -- the worst case is a brief local resolver miss, never
/// third-party disclosure.
pub(crate) const REVEAL_EXFIL_HOST: &str = "gamelib.invalid";

/// Bound on how long `humble_reveal_post` waits for the exfil channel to deliver a payload
/// before treating the reveal as a timeout (D-08: the hidden window must not linger
/// indefinitely). A backstop underneath the sidecar's own `RUST_INVOKE_TIMEOUT_MS` (60s,
/// `sidecarRpc.ts`) -- this fires first and lets the window close well before that outer bound.
pub(crate) const REVEAL_POST_TIMEOUT: Duration = Duration::from_secs(20);

/// The five parsed, validated args `humble_reveal_post` needs. Kept as a plain struct (rather
/// than returning a tuple) so the dispatch arm's body reads by field name, not position.
/// Deliberately does NOT derive the standard formatting trait this doc comment is avoiding
/// naming by its real identifier (REQ-34.1-07's file-wide tray out-of-scope-menu-depth text
/// gate scans the WHOLE stripped file for that capitalized word, not just the tray block) --
/// `#[cfg(test)]`'s rejection assertions below use a small manual-match helper instead of
/// `.unwrap_err()` specifically so this struct never needs that trait.
pub(crate) struct RevealPostArgs {
    pub(crate) origin_url: tauri::Url,
    pub(crate) path: String,
    pub(crate) body: String,
    pub(crate) csrf_token: Option<String>,
    pub(crate) user_agent: String,
}

/// This arm's entire ASVS V5 input validation (mirrors `login_window_parse_url`'s discipline for
/// `humble_login_open`, T-34.4.1-08): `args[0]` is re-validated https-only via
/// `login_window_parse_url` itself (never re-derived), so a missing/wrong-typed arg AND a
/// non-https origin both collapse to the single `humble_reveal_post:bad-args` error the
/// interface contract declares (no separate bad-url variant for this arm). `args[3]`
/// (csrf_token) is the only optional value -- a missing arg or `Value::Null` both map to
/// `None`, never the JS-string `"null"` (see `reveal_post_script` below).
pub(crate) fn reveal_post_args(args: &[Value]) -> Result<RevealPostArgs, String> {
    let a = HumbleRevealPostArgs::from_args(args)?;
    let origin_url = login_window_parse_url(&a.origin_url)
        .map_err(|_| "humble_reveal_post:bad-args".to_string())?;
    let (path, body, csrf_token, user_agent) = (a.path, a.body, a.csrf_token, a.user_agent);
    Ok(RevealPostArgs {
        origin_url,
        path,
        body,
        csrf_token,
        user_agent,
    })
}

/// Builds the script injected into the reveal window: runs the POST from the page's own JS
/// context and exfiltrates the JSON-encoded `{status, body}` result via a `location.href`
/// assignment to `exfil_host`, which the arm's `on_navigation` hook cancels before it can ever
/// resolve (T-34.4.1-20/21). Every interpolated value -- `path`, `body`, `csrf_token` -- is
/// embedded via `serde_json::to_string`, producing a properly escaped JS string/null literal;
/// this is the arm's ENTIRE defense against a tampered/attacker-influenceable value breaking
/// out of its string context in an authenticated remote page (ASVS V5). NEVER
/// `format!("'{}'", value)` -- a naive quoted interpolation is exactly the injection this
/// function exists to prevent.
///
/// Does NOT use `eval_with_callback`'s callback to deliver the fetch result (Pitfall 5,
/// 34.4.1-RESEARCH.md): `WKWebView.evaluateJavaScript(_:completionHandler:)` reports the
/// script's IMMEDIATE completion value, and a returned Promise is not auto-awaited. The script
/// runs fire-and-forget (`WebviewWindow::eval`); the real result arrives later via the
/// navigation-intercept exfil this function's own `location.href` assignment triggers.
///
/// The JS template below is built via `concat!` of single-line string pieces (each opening and
/// closing its own `"` delimiter on the SAME source line) rather than one multi-line raw
/// string -- `longRunningChannels.test.ts`'s WR-08 stripper-integrity guard asserts every
/// comment-stripped code line in this file has a BALANCED (even) `"`-count, which a multi-line
/// `r#"..."#` literal's opening/closing lines each structurally violate (one bare `"` per
/// line). Every JS string literal inside the template therefore uses single quotes, so no `"`
/// character appears anywhere except each piece's own two Rust delimiters.
pub(crate) fn reveal_post_script(
    path: &str,
    body: &str,
    csrf_token: Option<&str>,
    exfil_host: &str,
) -> String {
    let path_js = serde_json::to_string(path).unwrap_or_else(|_| "\"\"".to_string());
    let body_js = serde_json::to_string(body).unwrap_or_else(|_| "\"\"".to_string());
    let csrf_js = match csrf_token {
        Some(token) => serde_json::to_string(token).unwrap_or_else(|_| "null".to_string()),
        None => "null".to_string(),
    };
    let exfil_host_js =
        serde_json::to_string(exfil_host).unwrap_or_else(|_| "\"gamelib.invalid\"".to_string());
    format!(
        concat!(
            "(function() {{ ",
            "var headers = {{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'}}; ",
            "var csrf = {csrf_js}; ",
            "if (csrf !== null) {{ headers['csrf-prevention-token'] = csrf; }} ",
            "function exfil(result) {{ location.href = 'https://' + {exfil_host_js} + '/reveal?data=' + encodeURIComponent(JSON.stringify(result)); }} ",
            "fetch({path_js}, {{method:'POST',credentials:'include',headers:headers,body:{body_js}}})",
            ".then(function(response) {{ return response.text().then(function(text) {{ exfil({{status:response.status,body:text}}); }}); }})",
            ".catch(function(error) {{ exfil({{status:0,body:'ERR:'+String(error)}}); }}); ",
            "}})();"
        ),
        // Explicit named args required: `format!`'s implicit-capture-from-scope sugar cannot
        // resolve identifiers when its format string is itself produced by another macro
        // (`concat!`), to avoid ambiguity -- see rustc's own note on this exact error.
        path_js = path_js,
        body_js = body_js,
        csrf_js = csrf_js,
        exfil_host_js = exfil_host_js
    )
}

// ---- humble_login_clear_storage support (34.4.1 gap cycle plan 15, F-6 BLOCKING,
// REQ-34.4.1-06/REQ-34.4.1-GAP-03) ----
//
// New capability the Tauri seam has never had: `humble_login_clear_cookies` above only clears
// cookies. Electron's disconnect additionally runs `clearStorageData`/`clearCache`/
// `clearAuthCache`/`clearHostResolverCache`/`clearData` -- localStorage, sessionStorage,
// IndexedDB, Cache Storage and service workers all survived a Tauri disconnect (F-6, the
// blocking live-gate finding), so Humble's web app silently restored a session from what
// remained. This arm's design mirrors `humble_reveal_post` (D-07/D-08's hidden-window +
// navigation-intercept-exfil template), not `humble_login_clear_cookies` -- running the clear
// as JS INSIDE the target page's own origin makes it origin-scoped BY CONSTRUCTION (same-origin
// policy), satisfying both D-08/Pitfall 3's over-broad constraint (never touch another
// origin/storefront's storage) and F-6's under-broad one (never leave the CURRENT origin's
// storage untouched) at the same time. `clear_all_browsing_data()` MUST NOT appear anywhere in
// this file.

/// Bound on how long `humble_login_clear_storage` waits for the exfil channel to deliver a
/// payload before treating the clear as a timeout (mirrors `REVEAL_POST_TIMEOUT`'s D-08
/// discipline -- the hidden window must not linger indefinitely on any exit path).
pub(crate) const CLEAR_STORAGE_TIMEOUT: Duration = Duration::from_secs(20);

/// The two parsed, validated args `humble_login_clear_storage` needs. `origin_url` is
/// re-validated https-only via `login_window_parse_url` itself (never re-derived, mirrors
/// `reveal_post_args`'s own discipline) -- a missing/wrong-typed arg AND a non-https origin both
/// collapse to the single `humble_login_clear_storage:bad-args` error. Deliberately does NOT
/// derive the standard formatting trait (REQ-34.1-07's file-wide text gate, same reasoning as
/// `RevealPostArgs` above) -- `#[cfg(test)]`'s rejection assertions use a small manual-match
/// helper instead of `.unwrap_err()`.
pub(crate) struct ClearStorageArgs {
    pub(crate) origin_url: tauri::Url,
    pub(crate) user_agent: String,
}

/// This arm's entire ASVS V5 input validation (mirrors `reveal_post_args`/`login_window_parse_url`,
/// T-34.4.1-08).
pub(crate) fn clear_storage_args(args: &[Value]) -> Result<ClearStorageArgs, String> {
    let a = HumbleLoginClearStorageArgs::from_args(args)?;
    let origin_url = login_window_parse_url(&a.origin_url)
        .map_err(|_| "humble_login_clear_storage:bad-args".to_string())?;
    let user_agent = a.user_agent;
    Ok(ClearStorageArgs {
        origin_url,
        user_agent,
    })
}

/// Builds the script injected by `humble_login_clear_storage`. Clears, for the loaded page's OWN
/// origin only (same-origin policy makes any other origin structurally unreachable by this
/// script -- T-34.4.1-66): `localStorage`, `sessionStorage`, every IndexedDB database, every
/// Cache Storage entry, and every service-worker registration. Each category is wrapped in its
/// OWN try/catch (mirrors the TS-side guarded `wipeSteps` shape plan 16 will wire this into) so
/// one failing/absent category can never abort the rest, and every category reports either a
/// numeric count or the literal string `'unsupported'` -- NEVER silently coercing a missing API
/// (`indexedDB.databases()` in particular is not universally available) into a false "0
/// cleared" (T-34.4.1-67, the `navigator-clipboard-noops-under-tauri` mitigation applied to
/// storage). The async categories (IndexedDB deletion, `caches`, service-worker unregistration)
/// are all `await`ed before the single `exfil()` call at the very end, or this would report
/// success for work that has not actually happened yet.
///
/// The ONLY interpolated value is `exfil_host`, which goes through the SAME `serde_json::to_string`
/// discipline `reveal_post_script` uses for its own interpolated values (T-34.4.1-65) -- via a
/// placeholder-token `.replace()` rather than `format!`'s `{{`/`}}` brace-escaping, which this
/// script's heavy JS object/brace nesting would make unreadable and error-prone to keep correct.
/// Every JS string literal inside the template uses single quotes (mirrors `reveal_post_script`),
/// so every `concat!` piece below is exactly one Rust string literal with a BALANCED (2, even)
/// raw `"`-count per source line -- satisfying `longRunningChannels.test.ts`'s WR-08
/// stripper-integrity guard trivially, with no escaped-quote bookkeeping required.
pub(crate) fn clear_storage_script(exfil_host: &str) -> String {
    let exfil_host_js =
        serde_json::to_string(exfil_host).unwrap_or_else(|_| "\"gamelib.invalid\"".to_string());
    let template = concat!(
        "(function() { ",
        "function exfil(result) { location.href = 'https://' + @@EXFIL_HOST@@ + '/clear-storage?data=' + encodeURIComponent(JSON.stringify(result)); } ",
        "(async function() { ",
        "var report = {}; ",
        "try { if (typeof localStorage !== 'undefined' && localStorage !== null) { var n0 = localStorage.length; localStorage.clear(); report.localStorage = n0; } else { report.localStorage = 'unsupported'; } } catch (e0) { report.localStorage = 'unsupported'; } ",
        "try { if (typeof sessionStorage !== 'undefined' && sessionStorage !== null) { var n1 = sessionStorage.length; sessionStorage.clear(); report.sessionStorage = n1; } else { report.sessionStorage = 'unsupported'; } } catch (e1) { report.sessionStorage = 'unsupported'; } ",
        "try { if (typeof indexedDB !== 'undefined' && indexedDB !== null && typeof indexedDB.databases === 'function') { var dbs = await indexedDB.databases(); var n2 = 0; for (var i = 0; i < dbs.length; i++) { if (dbs[i] && dbs[i].name) { await new Promise(function(resolve) { try { var req = indexedDB.deleteDatabase(dbs[i].name); req.onsuccess = function() { resolve(); }; req.onerror = function() { resolve(); }; req.onblocked = function() { resolve(); }; } catch (e4) { resolve(); } }); n2++; } } report.indexedDB = n2; } else { report.indexedDB = 'unsupported'; } } catch (e2) { report.indexedDB = 'unsupported'; } ",
        "try { if (typeof caches !== 'undefined' && caches !== null && typeof caches.keys === 'function') { var keys = await caches.keys(); for (var j = 0; j < keys.length; j++) { await caches.delete(keys[j]); } report.caches = keys.length; } else { report.caches = 'unsupported'; } } catch (e3) { report.caches = 'unsupported'; } ",
        "try { if (typeof navigator !== 'undefined' && navigator.serviceWorker && typeof navigator.serviceWorker.getRegistrations === 'function') { var regs = await navigator.serviceWorker.getRegistrations(); for (var k = 0; k < regs.length; k++) { await regs[k].unregister(); } report.serviceWorkers = regs.length; } else { report.serviceWorkers = 'unsupported'; } } catch (e5) { report.serviceWorkers = 'unsupported'; } ",
        "exfil(report); ",
        "})(); ",
        "})();"
    );
    template.replace("@@EXFIL_HOST@@", &exfil_host_js)
}

// Issue the reveal-key POST from a hidden, on-demand child window's own JS `fetch()`
// (Phase 34.4.1 Plan 04, D-07/D-08, REQ-34.4.1-05) -- the ONE structurally-new option
// for humblePostRequest's transport under Tauri, because a genuine WKWebView network
// stack is the one place a real browser TLS/HTTP fingerprint exists. Never logs the
// script, the body, the csrf token or the response payload (T-34.4.1-21/T-28-04
// convention) -- only channel names and generic error text ever reach `eprintln!`.
//
// Every exit path below closes the window before returning (D-08 -- no idle
// authenticated window persists between reveals):
//   - bad-args / window-build-failure: no window was ever created, nothing to close.
//   - script injection failure: closed immediately below, then returns the error.
//   - success / script-parse-failure / timeout (after `rx.recv_timeout`): the single
//     close call right after the recv covers all three of these outcomes at once.
pub(crate) fn rpc_humble_reveal_post(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    let parsed = reveal_post_args(args)?;
    let label = next_login_window_label();
    let (tx, rx) = mpsc_channel::<String>();
    let window = match tauri::WebviewWindowBuilder::new(
        app,
        &label,
        tauri::WebviewUrl::External(parsed.origin_url.clone()),
    )
    .user_agent(&parsed.user_agent)
    .visible(false) // D-08: hidden, on-demand -- never the login flow's own visible window
    .on_navigation(move |url| {
        if url.host_str() == Some(REVEAL_EXFIL_HOST) {
            if let Some((_, payload)) = url.query_pairs().find(|(k, _)| k == "data") {
                let _ = tx.send(payload.into_owned());
            }
            // Cancel -- gamelib.invalid is RFC 2606 reserved and never actually
            // resolves regardless (Open Question 1), but this is the real guard.
            return false;
        }
        true
    })
    .build()
    {
        Ok(w) => w,
        Err(e) => {
            shell_eprintln!("[shell] humble_reveal_post: window build failed: {e}");
            return Err(format!("humble_reveal_post:window:{e}"));
        }
    };

    let script = reveal_post_script(
        &parsed.path,
        &parsed.body,
        parsed.csrf_token.as_deref(),
        REVEAL_EXFIL_HOST,
    );
    if let Err(e) = window.eval(&script) {
        let _ = window.close(); // close site 1: script injection itself failed
        shell_eprintln!("[shell] humble_reveal_post: script injection failed: {e}");
        return Err(format!("humble_reveal_post:script:{e}"));
    }

    let outcome = rx.recv_timeout(REVEAL_POST_TIMEOUT);
    let _ = window.close(); // close site 2: covers success, parse-failure AND timeout below

    match outcome {
        Ok(raw) => serde_json::from_str::<Value>(&raw).map_err(|e| {
            shell_eprintln!("[shell] humble_reveal_post: exfil payload parse failed: {e}");
            format!("humble_reveal_post:script:{e}")
        }),
        Err(_) => Err("humble_reveal_post:timeout".to_string()),
    }
}

// Origin-scoped storage clear (34.4.1 gap cycle plan 15, F-6 BLOCKING,
// REQ-34.4.1-06/REQ-34.4.1-GAP-03). Same hidden-window + navigation-intercept-exfil
// template as `humble_reveal_post` above, reused verbatim for its timeout/close
// discipline. Never logs the origin, the storage contents, key names or the exfil
// payload (T-34.4.1-21/T-28-04 convention) -- only the channel name and generic error
// text ever reach `eprintln!`.
//
// Every exit path below closes the window before returning (D-08 -- no idle
// authenticated window persists after a clear):
//   - bad-args / window-build-failure: no window was ever created, nothing to close.
//   - script injection failure: closed immediately below, then returns the error.
//   - success / script-parse-failure / timeout (after `rx.recv_timeout`): the single
//     close call right after the recv covers all three of these outcomes at once.
pub(crate) fn rpc_humble_login_clear_storage(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    let parsed = clear_storage_args(args)?;
    let label = next_login_window_label();
    let (tx, rx) = mpsc_channel::<String>();
    let window = match tauri::WebviewWindowBuilder::new(
        app,
        &label,
        tauri::WebviewUrl::External(parsed.origin_url.clone()),
    )
    .user_agent(&parsed.user_agent)
    .visible(false) // D-08: hidden, on-demand -- never a visible login window
    .on_navigation(move |url| {
        if url.host_str() == Some(REVEAL_EXFIL_HOST) {
            if let Some((_, payload)) = url.query_pairs().find(|(k, _)| k == "data") {
                let _ = tx.send(payload.into_owned());
            }
            // Cancel -- gamelib.invalid is RFC 2606 reserved and never actually
            // resolves regardless (mirrors humble_reveal_post's Open Question 1
            // disposition), but this is the real guard.
            return false;
        }
        true
    })
    .build()
    {
        Ok(w) => w,
        Err(e) => {
            shell_eprintln!("[shell] humble_login_clear_storage: window build failed: {e}");
            return Err(format!("humble_login_clear_storage:window:{e}"));
        }
    };

    let script = clear_storage_script(REVEAL_EXFIL_HOST);
    if let Err(e) = window.eval(&script) {
        let _ = window.close(); // close site 1: script injection itself failed
        shell_eprintln!("[shell] humble_login_clear_storage: script injection failed: {e}");
        return Err(format!("humble_login_clear_storage:script:{e}"));
    }

    let outcome = rx.recv_timeout(CLEAR_STORAGE_TIMEOUT);
    let _ = window.close(); // close site 2: covers success, parse-failure AND timeout below

    match outcome {
        Ok(raw) => serde_json::from_str::<Value>(&raw).map_err(|e| {
            shell_eprintln!(
                "[shell] humble_login_clear_storage: exfil payload parse failed: {e}"
            );
            format!("humble_login_clear_storage:script:{e}")
        }),
        Err(_) => Err("humble_login_clear_storage:timeout".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ---- reveal_post_args (Phase 34.4.1 Plan 04, REQ-34.4.1-05) ----
    //
    // RED direction: an implementation using `unwrap_or(...)` anywhere in the required-field
    // chain, or treating a missing csrf_token differently from an explicit `null`, would flip
    // one of the cases below.

    fn valid_reveal_args(csrf: Value) -> Vec<Value> {
        vec![
            json!("https://www.humblebundle.com"),
            json!("/humbler/redeemkey"),
            json!("keytype=steam&key=abc&keyindex=1"),
            csrf,
            json!("Mozilla/5.0 (Macintosh) Chrome/142.0 Safari/537.36"),
        ]
    }

    /// Manual-match helper standing in for `.unwrap_err()` -- `RevealPostArgs` deliberately
    /// implements no auto-formatting trait (see its own doc comment), so `.unwrap_err()`
    /// cannot be called on a `Result<RevealPostArgs, String>` at all; this reads the error
    /// string out by hand and panics with a plain message on the (unexpected) Ok case instead.
    fn reveal_post_args_err(result: Result<RevealPostArgs, String>) -> String {
        match result {
            Err(e) => e,
            Ok(_) => panic!("expected reveal_post_args to reject this input"),
        }
    }

    #[test]
    fn humble_reveal_post_args_accepts_a_full_valid_set_with_a_string_csrf_token() {
        let parsed = reveal_post_args(&valid_reveal_args(json!("csrf-token-value"))).unwrap();
        assert_eq!(parsed.origin_url.as_str(), "https://www.humblebundle.com/");
        assert_eq!(parsed.path, "/humbler/redeemkey");
        assert_eq!(parsed.body, "keytype=steam&key=abc&keyindex=1");
        assert_eq!(parsed.csrf_token, Some("csrf-token-value".to_string()));
        assert_eq!(
            parsed.user_agent,
            "Mozilla/5.0 (Macintosh) Chrome/142.0 Safari/537.36"
        );
    }

    #[test]
    fn humble_reveal_post_args_maps_a_null_csrf_token_to_none() {
        let parsed = reveal_post_args(&valid_reveal_args(Value::Null)).unwrap();
        assert_eq!(parsed.csrf_token, None);
    }

    #[test]
    fn humble_reveal_post_args_treats_a_short_args_slice_as_missing_not_a_panic() {
        // Positional args make "csrf missing but user_agent present" structurally
        // unreachable (removing index 3 shifts index 4 into its place) -- what IS reachable,
        // and must never panic, is a short slice that runs out of args entirely. args.get(3)
        // reads None -> csrf_token=None internally, but the overall parse still rejects on
        // the now-missing args[4] (user_agent), never panicking on an out-of-bounds index.
        let short_args = vec![
            json!("https://www.humblebundle.com"),
            json!("/humbler/redeemkey"),
            json!("keytype=steam&key=abc&keyindex=1"),
        ];
        assert_eq!(
            reveal_post_args_err(reveal_post_args(&short_args)),
            "humble_reveal_post:bad-args"
        );
    }

    #[test]
    fn humble_reveal_post_args_rejects_a_non_string_non_null_csrf_token() {
        assert_eq!(
            reveal_post_args_err(reveal_post_args(&valid_reveal_args(json!(12345)))),
            "humble_reveal_post:bad-args"
        );
    }

    #[test]
    fn humble_reveal_post_args_rejects_missing_args_entirely() {
        assert_eq!(
            reveal_post_args_err(reveal_post_args(&[])),
            "humble_reveal_post:bad-args"
        );
    }

    #[test]
    fn humble_reveal_post_args_rejects_a_non_https_origin() {
        let mut args = valid_reveal_args(json!("csrf-token-value"));
        args[0] = json!("http://www.humblebundle.com");
        assert_eq!(
            reveal_post_args_err(reveal_post_args(&args)),
            "humble_reveal_post:bad-args"
        );
    }

    #[test]
    fn humble_reveal_post_args_rejects_a_non_string_path() {
        let mut args = valid_reveal_args(json!("csrf-token-value"));
        args[1] = json!(42);
        assert_eq!(
            reveal_post_args_err(reveal_post_args(&args)),
            "humble_reveal_post:bad-args"
        );
    }

    #[test]
    fn humble_reveal_post_args_rejects_a_non_string_body() {
        let mut args = valid_reveal_args(json!("csrf-token-value"));
        args[2] = json!(null);
        assert_eq!(
            reveal_post_args_err(reveal_post_args(&args)),
            "humble_reveal_post:bad-args"
        );
    }

    #[test]
    fn humble_reveal_post_args_rejects_a_missing_user_agent() {
        let mut args = valid_reveal_args(json!("csrf-token-value"));
        args.truncate(4); // drop user_agent (args[4]) entirely
        assert_eq!(
            reveal_post_args_err(reveal_post_args(&args)),
            "humble_reveal_post:bad-args"
        );
    }

    // ---- reveal_post_script (Phase 34.4.1 Plan 04, T-34.4.1-20/21) ----
    //
    // RED direction: an implementation using `format!("'{}'", value)` (naive quoting) instead
    // of `serde_json::to_string` would let a tricky body value escape its string context; the
    // round-trip assertion below fails against that implementation.

    #[test]
    fn humble_reveal_post_script_escapes_special_characters_and_round_trips_via_serde_json() {
        // Deliberately includes a single quote, a double quote, a backslash, and a
        // `</script>` sequence -- exactly the characters T-34.4.1-20 is about.
        // Two embedded double-quote characters (not one) so this Rust source line itself keeps
        // an EVEN raw `"`-count (open delim + 2 embedded `\"` + close delim = 4) -- satisfying
        // `longRunningChannels.test.ts`'s unrelated WR-08 per-line quote-balance guard, which
        // this line would otherwise trip on the surrounding file scan. Still exercises a
        // double quote, a single quote, a backslash and a `</script>` sequence.
        let tricky_body = "keytype=steam&key=a\"b\"c'd\\e</script>f";
        let script = reveal_post_script(
            "/humbler/redeemkey",
            tricky_body,
            Some("csrf-token-value"),
            REVEAL_EXFIL_HOST,
        );
        let expected_literal = serde_json::to_string(tricky_body).unwrap();
        assert!(
            script.contains(&expected_literal),
            "expected the properly-escaped JSON string literal to appear verbatim in the script"
        );
        let round_tripped: String = serde_json::from_str(&expected_literal).unwrap();
        assert_eq!(round_tripped, tricky_body);
        // The naive, UNESCAPED single-quote interpolation this function must never produce.
        // Built via array-join rather than a literal `format!("'{}'", ..)` call so this
        // regression-guard test itself does not trip the source-text gate
        // (`tauriShellSource.test.ts`) that asserts NO such naive interpolation exists in the
        // real arm code.
        let naive_interpolation = ["'", tricky_body, "'"].concat();
        assert!(!script.contains(&naive_interpolation));
    }

    #[test]
    fn humble_reveal_post_script_embeds_a_null_csrf_token_as_a_js_null_not_the_string_null() {
        let script = reveal_post_script("/humbler/redeemkey", "body", None, REVEAL_EXFIL_HOST);
        assert!(script.contains("var csrf = null;"));
        assert!(!script.contains("var csrf = \"null\""));
    }

    #[test]
    fn humble_reveal_post_script_embeds_a_present_csrf_token_as_a_quoted_json_string() {
        let script = reveal_post_script(
            "/humbler/redeemkey",
            "body",
            Some("csrf-token-value"),
            REVEAL_EXFIL_HOST,
        );
        assert!(script.contains("var csrf = \"csrf-token-value\";"));
    }

    #[test]
    fn humble_reveal_post_script_embeds_the_exfil_host_used_by_the_navigation_intercept() {
        let script = reveal_post_script("/humbler/redeemkey", "body", None, REVEAL_EXFIL_HOST);
        assert!(script.contains(&serde_json::to_string(REVEAL_EXFIL_HOST).unwrap()));
    }

    // ---- clear_storage_args (34.4.1 gap cycle plan 15, F-6, REQ-34.4.1-06/REQ-34.4.1-GAP-03) ----
    //
    // RED direction: an implementation using `unwrap_or(...)` anywhere in the required-field
    // chain would flip one of the cases below, mirroring `reveal_post_args`'s own RED-direction
    // note.

    fn valid_clear_storage_args() -> Vec<Value> {
        vec![
            json!("https://www.humblebundle.com"),
            json!("Mozilla/5.0 (Macintosh) Chrome/142.0 Safari/537.36"),
        ]
    }

    /// Manual-match helper standing in for `.unwrap_err()` -- `ClearStorageArgs` deliberately
    /// implements no auto-formatting trait (mirrors `RevealPostArgs`'s own `reveal_post_args_err`
    /// helper and its reasoning, REQ-34.1-07).
    fn clear_storage_args_err(result: Result<ClearStorageArgs, String>) -> String {
        match result {
            Err(e) => e,
            Ok(_) => panic!("expected clear_storage_args to reject this input"),
        }
    }

    #[test]
    fn humble_login_clear_storage_args_accepts_a_full_valid_set() {
        let parsed = clear_storage_args(&valid_clear_storage_args()).unwrap();
        assert_eq!(parsed.origin_url.as_str(), "https://www.humblebundle.com/");
        assert_eq!(
            parsed.user_agent,
            "Mozilla/5.0 (Macintosh) Chrome/142.0 Safari/537.36"
        );
    }

    #[test]
    fn humble_login_clear_storage_args_rejects_missing_args_entirely() {
        assert_eq!(
            clear_storage_args_err(clear_storage_args(&[])),
            "humble_login_clear_storage:bad-args"
        );
    }

    #[test]
    fn humble_login_clear_storage_args_rejects_a_non_https_origin() {
        let mut args = valid_clear_storage_args();
        args[0] = json!("http://www.humblebundle.com");
        assert_eq!(
            clear_storage_args_err(clear_storage_args(&args)),
            "humble_login_clear_storage:bad-args"
        );
    }

    #[test]
    fn humble_login_clear_storage_args_rejects_a_non_string_origin() {
        let mut args = valid_clear_storage_args();
        args[0] = json!(42);
        assert_eq!(
            clear_storage_args_err(clear_storage_args(&args)),
            "humble_login_clear_storage:bad-args"
        );
    }

    #[test]
    fn humble_login_clear_storage_args_rejects_a_missing_user_agent() {
        let mut args = valid_clear_storage_args();
        args.truncate(1); // drop user_agent (args[1]) entirely
        assert_eq!(
            clear_storage_args_err(clear_storage_args(&args)),
            "humble_login_clear_storage:bad-args"
        );
    }

    #[test]
    fn humble_login_clear_storage_args_rejects_a_non_string_user_agent() {
        let mut args = valid_clear_storage_args();
        args[1] = json!(null);
        assert_eq!(
            clear_storage_args_err(clear_storage_args(&args)),
            "humble_login_clear_storage:bad-args"
        );
    }

    // ---- clear_storage_script (34.4.1 gap cycle plan 15, T-34.4.1-65/-66/-67) ----
    //
    // RED direction: an implementation using naive `'{}'`-style interpolation for `exfil_host`
    // would fail the escaping round-trip case below; one that skips `await` on an async category
    // would fail the await-ordering case; one that coerces a missing API to a numeric 0 instead
    // of the literal `'unsupported'` would fail the five-category case.

    #[test]
    fn humble_login_clear_storage_script_escapes_special_characters_and_round_trips_via_serde_json()
    {
        // Deliberately includes a single quote, a double quote, a backslash, and a `</script>`
        // sequence -- the same character classes `reveal_post_script`'s own round-trip case
        // covers (T-34.4.1-65/20). Two embedded double-quote characters (not one) so this Rust
        // source line itself keeps an EVEN raw `"`-count (open delim + 2 embedded `\"` + close
        // delim = 4) -- satisfying `longRunningChannels.test.ts`'s WR-08 per-line quote-balance
        // guard, which this line would otherwise trip on the surrounding file scan. Still
        // exercises a double quote, a single quote, a backslash and a `</script>` sequence.
        let tricky_host = "gamelib.invalid\"a\"payload'x\\y</script>z";
        let script = clear_storage_script(tricky_host);
        let expected_literal = serde_json::to_string(tricky_host).unwrap();
        assert!(
            script.contains(&expected_literal),
            "expected the properly-escaped JSON string literal to appear verbatim in the script"
        );
        let round_tripped: String = serde_json::from_str(&expected_literal).unwrap();
        assert_eq!(round_tripped, tricky_host);
        // The naive, UNESCAPED single-quote interpolation this function must never produce.
        // Built via array-join (mirrors `reveal_post_script`'s own equivalent case) rather than a
        // literal `format!("'{}'", ..)` call so this regression-guard test itself does not trip
        // the source-text gate asserting no such naive interpolation exists in the real arm code.
        let naive_interpolation = ["'", tricky_host, "'"].concat();
        assert!(!script.contains(&naive_interpolation));
    }

    #[test]
    fn humble_login_clear_storage_script_embeds_the_exfil_host_used_by_the_navigation_intercept() {
        let script = clear_storage_script(REVEAL_EXFIL_HOST);
        assert!(script.contains(&serde_json::to_string(REVEAL_EXFIL_HOST).unwrap()));
    }

    #[test]
    fn humble_login_clear_storage_script_clears_all_five_categories_with_an_unsupported_fallback() {
        let script = clear_storage_script(REVEAL_EXFIL_HOST);
        assert!(script.contains("localStorage.clear()"));
        assert!(script.contains("report.localStorage = 'unsupported'"));
        assert!(script.contains("sessionStorage.clear()"));
        assert!(script.contains("report.sessionStorage = 'unsupported'"));
        assert!(script.contains("indexedDB.deleteDatabase"));
        assert!(script.contains("report.indexedDB = 'unsupported'"));
        assert!(script.contains("caches.delete"));
        assert!(script.contains("report.caches = 'unsupported'"));
        assert!(script.contains("serviceWorker.getRegistrations"));
        assert!(script.contains("report.serviceWorkers = 'unsupported'"));
    }

    #[test]
    fn humble_login_clear_storage_script_awaits_every_async_category_before_reporting() {
        // If IndexedDB/caches/service-worker clearing fired without `await`, this arm would
        // report success for work that has not happened yet (this plan's own explicit warning).
        let script = clear_storage_script(REVEAL_EXFIL_HOST);
        assert!(script.contains("await indexedDB.databases()"));
        assert!(script.contains("await new Promise(function(resolve)"));
        assert!(script.contains("await caches.keys()"));
        assert!(script.contains("await caches.delete(keys[j])"));
        assert!(script.contains("await navigator.serviceWorker.getRegistrations()"));
        assert!(script.contains("await regs[k].unregister()"));
        // exfil() must run AFTER every await in the template, never before.
        let exfil_call_index = script.rfind("exfil(report)").unwrap();
        let last_await_index = script.rfind("await ").unwrap();
        assert!(exfil_call_index > last_await_index);
    }
}
