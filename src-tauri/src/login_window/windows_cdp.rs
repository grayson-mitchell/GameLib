//! WebView2 CDP cookie deletion (Windows) and the clear-cookies bounds shared with macOS (Phase 71 D-12). Each item keeps its own cfg. Child of `login_window`; sees its private items.

#[cfg(any(target_os = "macos", windows))]
use super::*;

/// Bound on how long `humble_login_clear_cookies` waits, on macOS, for
/// `removeDataOfTypes_forDataRecords_completionHandler`'s completion block to fire before
/// falling through to the post-removal re-read anyway (Phase 34.4.1 Plan 23, F-6 Defect B,
/// D-08: must not linger). Mirrors `REVEAL_POST_TIMEOUT`'s reasoning -- a backstop underneath
/// the sidecar's own 60s `RUST_INVOKE_TIMEOUT_MS`. A timeout here does NOT short-circuit to an
/// error: the verified count always comes from re-reading the jar, never from whether this
/// signal arrived, so a missed signal still yields an honest (possibly zero) count rather than
/// a false failure. Windows uses the same bound for `GetCookies`' completion handler
/// (debug webview2-delete-cookie-noop).
#[cfg(any(target_os = "macos", windows))]
pub(crate) const CLEAR_COOKIES_TIMEOUT: Duration = Duration::from_secs(10);

/// Windows only: how long `humble_login_clear_cookies` keeps re-reading the jar after issuing
/// `DeleteCookie`, which returns before the browser process applies the removal. Re-reads stop
/// as soon as the matched set is empty, so a working clear costs one re-read; only a clear that
/// genuinely leaves cookies behind waits the full bound. Small against the sidecar's 60s
/// `RUST_INVOKE_TIMEOUT_MS` even stacked on `CLEAR_COOKIES_TIMEOUT`.
#[cfg(windows)]
pub(crate) const CLEAR_COOKIES_SETTLE: Duration = Duration::from_secs(2);

/// Windows only: one Chrome DevTools Protocol call on `window`'s WebView2, returning the parsed
/// JSON result. Blocks the calling (worker) thread on a channel while the main thread's message
/// loop services the completion, the same shape as `humble_login_clear_cookies`' Windows arm.
#[cfg(windows)]
fn webview2_cdp_call(
    window: &tauri::WebviewWindow,
    method: &'static str,
    params: Value,
) -> Result<Value, String> {
    use windows::core::HSTRING;
    let (tx, rx) = mpsc_channel::<Result<String, String>>();
    let params_json = params.to_string();
    window
        .with_webview(move |webview| {
            let tx_done = tx.clone();
            let outcome = (|| -> windows::core::Result<()> {
                // SAFETY: `controller()` is tauri's live controller for this window, valid for
                // the closure's duration on the main thread.
                let core = unsafe { webview.controller().CoreWebView2()? };
                let handler = webview2_com::CallDevToolsProtocolMethodCompletedHandler::create(
                    Box::new(move |error_code, result_json| {
                        let _ = tx_done.send(
                            error_code
                                .map(|()| result_json)
                                .map_err(|e| format!("{method}:{e}")),
                        );
                        Ok(())
                    }),
                );
                unsafe {
                    core.CallDevToolsProtocolMethod(
                        &HSTRING::from(method),
                        &HSTRING::from(params_json.as_str()),
                        &handler,
                    )?
                };
                Ok(())
            })();
            if let Err(e) = outcome {
                let _ = tx.send(Err(format!("{method}:setup:{e}")));
            }
        })
        .map_err(|e| format!("{method}:dispatch:{e}"))?;
    let raw = rx
        .recv_timeout(CLEAR_COOKIES_TIMEOUT)
        .map_err(|_| format!("{method}:timeout"))??;
    serde_json::from_str(&raw).map_err(|e| format!("{method}:parse:{e}"))
}

/// Windows only: deletes every cookie matching `domain` through CDP `Network.deleteCookies`,
/// which -- unlike `ICoreWebView2CookieManager::DeleteCookie` -- accepts a `partitionKey`.
/// Measured live (debug webview2-delete-cookie-noop): Cloudflare's `cf_clearance` on
/// `.www.epicgames.com` survived `DeleteCookie` with `S_OK` and an unchanged value, while
/// `__cf_bm` with the identical domain/path/flags was removed. Returns how many deletes were
/// ISSUED -- an attempted count, used only for logging; the caller's verified count still comes
/// from a re-read.
#[cfg(windows)]
pub(crate) fn webview2_cdp_delete_matching_cookies(
    window: &tauri::WebviewWindow,
    domain: &str,
) -> Result<(usize, usize), String> {
    let listed = webview2_cdp_call(window, "Storage.getCookies", serde_json::json!({}))?;
    let cookies = listed
        .get("cookies")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let (mut issued, mut partitioned) = (0usize, 0usize);
    for cookie in cookies {
        let raw_domain = cookie.get("domain").and_then(Value::as_str).unwrap_or("");
        let host = raw_domain.strip_prefix('.').unwrap_or(raw_domain);
        if !cookie_domain_matches(host, Some(domain)) {
            continue;
        }
        let mut params = serde_json::json!({
            "name": cookie.get("name").cloned().unwrap_or(Value::Null),
            "domain": raw_domain,
            "path": cookie.get("path").cloned().unwrap_or(Value::Null),
        });
        if let Some(key) = cookie.get("partitionKey") {
            params["partitionKey"] = key.clone();
            partitioned += 1;
        }
        webview2_cdp_call(window, "Network.deleteCookies", params)?;
        issued += 1;
    }
    Ok((issued, partitioned))
}
