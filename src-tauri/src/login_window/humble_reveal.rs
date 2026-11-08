//! Humble hidden-window handlers: reveal post and clear storage (Phase 71 D-07, D-12). Child of `login_window`; sees its private items.

use super::*;

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
