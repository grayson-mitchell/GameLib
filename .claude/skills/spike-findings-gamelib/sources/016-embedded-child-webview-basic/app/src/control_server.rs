//! The POSITIVE CONTROL.
//!
//! The whole point of spikes 014a/014b is that a cookie read returning `[]` is
//! ambiguous: it means either "the jar is genuinely empty" or "this API does
//! nothing on this platform". `watchForLogin()` (src/backend/humble/user.ts:300)
//! cannot tell those apart — it treats `cookies.length === 0` as "not logged in
//! yet, keep polling", so an unsupported API spins silently until the deadline.
//!
//! This tiny loopback server removes the ambiguity. It serves an origin whose
//! cookie state WE control exactly, with five cookies chosen to isolate each
//! attribute that the wry macOS implementation treats specially:
//!
//!   spike_plain     no flags                 — baseline
//!   spike_httponly  HttpOnly                 — invisible to document.cookie (014b)
//!   spike_secure    Secure                   — wry's cookies_for_url has a special
//!                                              secure+loopback branch (wkwebview/mod.rs:1191)
//!   spike_both      HttpOnly; Secure         — the shape a real session cookie has
//!   spike_domain    Domain=localhost         — H1: WebKit stores this with a LEADING DOT,
//!                                              and cookies_for_url compares domains with
//!                                              `==` (wkwebview/mod.rs:1184)
//!
//! `/probe` is a THIRD, independent oracle: it echoes back the `Cookie:` header
//! the webview actually attached to the request. If `/probe` shows a cookie that
//! the Rust API cannot see, the API is broken — not the jar. No Rust cookie API
//! is involved in that path at all.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;

pub const PORT: u16 = 17913;
/// Deliberately `localhost`, not `127.0.0.1`: `Domain=localhost` only applies to
/// a request whose host is `localhost`, and that cookie is the H1 probe.
pub const ORIGIN: &str = "http://localhost:17913";

pub type LogFn = Arc<dyn Fn(&str, &str, serde_json::Value) + Send + Sync>;

/// The exact cookies `/set` installs. Kept public so the probe commands can ask
/// "did this read see any control cookie?" without hardcoding names twice.
pub const CONTROL_COOKIES: &[(&str, &str)] = &[
    ("spike_plain", "alpha1"),
    ("spike_httponly", "bravo2"),
    ("spike_secure", "charlie3"),
    ("spike_both", "delta4"),
    ("spike_domain", "echo5"),
];

pub fn start(log: LogFn) -> std::io::Result<()> {
    let listener = TcpListener::bind(("127.0.0.1", PORT))?;
    log(
        "control-server",
        "listening",
        serde_json::json!({ "origin": ORIGIN }),
    );
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            match stream {
                Ok(s) => {
                    let log = log.clone();
                    std::thread::spawn(move || handle(s, log));
                }
                Err(e) => eprintln!("[control-server] accept failed: {e}"),
            }
        }
    });
    Ok(())
}

fn handle(mut stream: TcpStream, log: LogFn) {
    let mut reader = BufReader::new(match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    });

    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() {
        return;
    }
    let path = request_line.split_whitespace().nth(1).unwrap_or("/").to_string();

    // Collect headers — we care about `Cookie:` (the independent oracle) and
    // `User-Agent:` (proves the child window's UA override actually applies to
    // real network requests, not just navigator.userAgent).
    let mut cookie_header = String::new();
    let mut user_agent = String::new();
    loop {
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) => break,
            Ok(_) => {
                let trimmed = line.trim_end();
                if trimmed.is_empty() {
                    break;
                }
                let lower = trimmed.to_ascii_lowercase();
                if let Some(rest) = lower.strip_prefix("cookie:") {
                    cookie_header = trimmed[trimmed.len() - rest.len()..].trim().to_string();
                } else if let Some(rest) = lower.strip_prefix("user-agent:") {
                    user_agent = trimmed[trimmed.len() - rest.len()..].trim().to_string();
                }
            }
            Err(_) => break,
        }
    }

    log(
        "control-server",
        "request",
        serde_json::json!({
            "path": path,
            "cookieHeader": cookie_header,
            "cookieHeaderNames": cookie_names(&cookie_header),
            "userAgent": user_agent,
        }),
    );

    let response = match path.as_str() {
        // Round 2's replacement for the failed document.title side-channel: the
        // page navigates HERE with its document.cookie in the query string, so
        // the value crosses the JS→Rust boundary through a real HTTP request
        // that we control both ends of. Immune to CORS (top-level navigation)
        // and independent of whether Tauri grants the remote origin IPC.
        p if p.starts_with("/report") => report_response(p, &log),
        p if p.starts_with("/set") => set_response(),
        p if p.starts_with("/probe") => probe_response(&cookie_header, &user_agent),
        p if p.starts_with("/clear") => clear_response(),
        _ => index_response(&cookie_header),
    };

    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn cookie_names(header: &str) -> Vec<String> {
    header
        .split(';')
        .filter_map(|kv| kv.split('=').next())
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty())
        .collect()
}

fn html(body: &str, extra_headers: &str) -> String {
    let page = format!(
        "<!doctype html><meta charset=utf-8><title>spike control origin</title>\
         <style>body{{font:14px ui-monospace,monospace;background:#111;color:#eee;padding:24px;line-height:1.6}}\
         a{{color:#6cf}} b{{color:#8f8}}</style>{body}"
    );
    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\n{}Connection: close\r\n\r\n{}",
        page.len(),
        extra_headers,
        page
    )
}

fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                match u8::from_str_radix(hex, 16) {
                    Ok(b) => {
                        out.push(b);
                        i += 3;
                    }
                    Err(_) => {
                        out.push(bytes[i]);
                        i += 1;
                    }
                }
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn report_response(path: &str, log: &LogFn) -> String {
    let query = path.split_once('?').map(|(_, q)| q).unwrap_or("");
    let mut fields = serde_json::Map::new();
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            fields.insert(url_decode(k), serde_json::Value::String(url_decode(v)));
        }
    }
    let dc = fields
        .get("dc")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let names: Vec<String> = cookie_names(&dc);
    log(
        "js-channel",
        "document.cookie exfiltrated via navigation",
        serde_json::json!({
            "tag": fields.get("tag").and_then(|v| v.as_str()).unwrap_or(""),
            "origin": fields.get("origin").and_then(|v| v.as_str()).unwrap_or(""),
            "documentCookieNames": names,
            "documentCookieCount": names.len(),
            // Only control cookies are echoed verbatim; a live session value never
            // reaches the log.
            "raw": if dc.contains("spike_") || dc.is_empty() {
                dc.clone()
            } else {
                format!("<redacted {} chars>", dc.len())
            },
            "remoteIpcStatus": fields.get("ipc").and_then(|v| v.as_str()).unwrap_or("unset"),
            "tauriGlobalPresent": fields.get("tauri").and_then(|v| v.as_str()).unwrap_or("unset"),
            "navigatorUserAgent": fields.get("ua").and_then(|v| v.as_str()).unwrap_or(""),
        }),
    );
    html(
        &format!(
            "<h2>/report received</h2><p>document.cookie names: <b>{}</b></p>",
            if names.is_empty() {
                "(none)".to_string()
            } else {
                names.join(", ")
            }
        ),
        "",
    )
}

fn set_response() -> String {
    // NOTE: `Secure` cookies ARE accepted over http://localhost — WebKit treats
    // loopback as a trustworthy origin. That is what makes an offline positive
    // control for Secure/HttpOnly cookies possible at all.
    let extra = "Set-Cookie: spike_plain=alpha1; Path=/\r\n\
                 Set-Cookie: spike_httponly=bravo2; Path=/; HttpOnly\r\n\
                 Set-Cookie: spike_secure=charlie3; Path=/; Secure\r\n\
                 Set-Cookie: spike_both=delta4; Path=/; HttpOnly; Secure\r\n\
                 Set-Cookie: spike_domain=echo5; Path=/; Domain=localhost\r\n";
    html(
        "<h2>control origin — 5 cookies set</h2>\
         <p><b>spike_plain</b>=alpha1<br><b>spike_httponly</b>=bravo2 (HttpOnly)<br>\
         <b>spike_secure</b>=charlie3 (Secure)<br><b>spike_both</b>=delta4 (HttpOnly+Secure)<br>\
         <b>spike_domain</b>=echo5 (Domain=localhost &rarr; stored as <i>.localhost</i>)</p>\
         <p>document.cookie right now:</p><pre id=dc></pre>\
         <p><a href=/probe>/probe</a> — echoes the Cookie header this webview sends</p>\
         <script>document.getElementById('dc').textContent=document.cookie||'(empty)'</script>",
        extra,
    )
}

fn clear_response() -> String {
    let extra = "Set-Cookie: spike_plain=; Path=/; Max-Age=0\r\n\
                 Set-Cookie: spike_httponly=; Path=/; Max-Age=0; HttpOnly\r\n\
                 Set-Cookie: spike_secure=; Path=/; Max-Age=0; Secure\r\n\
                 Set-Cookie: spike_both=; Path=/; Max-Age=0; HttpOnly; Secure\r\n\
                 Set-Cookie: spike_domain=; Path=/; Max-Age=0; Domain=localhost\r\n";
    html("<h2>control cookies cleared</h2>", extra)
}

fn probe_response(cookie_header: &str, user_agent: &str) -> String {
    let names = cookie_names(cookie_header);
    let body = format!(
        "<h2>/probe — independent oracle</h2>\
         <p>This is the raw <code>Cookie:</code> header the webview attached. No Rust \
         cookie API touched it.</p>\
         <p>names: <b>{}</b></p><pre>{}</pre><p>UA: {}</p>",
        if names.is_empty() {
            "(none)".to_string()
        } else {
            names.join(", ")
        },
        if cookie_header.is_empty() {
            "(no Cookie header)"
        } else {
            cookie_header
        },
        user_agent
    );
    html(&body, "")
}

fn index_response(cookie_header: &str) -> String {
    let body = format!(
        "<h2>spike control origin</h2><p>Cookie header on this request: <b>{}</b></p>\
         <p><a href=/set>/set</a> · <a href=/probe>/probe</a> · <a href=/clear>/clear</a></p>",
        if cookie_header.is_empty() {
            "(none)"
        } else {
            cookie_header
        }
    );
    html(&body, "")
}
