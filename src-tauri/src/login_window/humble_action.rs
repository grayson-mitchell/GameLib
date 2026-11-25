//! Humble server-action session: in-page `fetch()` POSTs from one hidden webview (debug
//! `humble-library-cloudflare-403`, 2026-11-25). Child of `login_window`; sees its private items.
//!
//! WHY THIS EXISTS. Cloudflare in front of www.humblebundle.com blocks any POST that carries a
//! `Next-Action` header (a Next.js server-action call) when the client is not a real browser
//! network stack. Node undici, system curl and reqwest/rustls all receive the WAF block page
//! (403, "Sorry, you have been blocked") even with a full Chrome header set; Chrome and WKWebView
//! posting the same request from a humblebundle.com page pass. Humble's two server actions
//! (`filterUserLibrary` library pages and `redeemEntitlementAction` reveal) are therefore posted
//! from inside the app's own webview. GETs stay on the normal HTTP client.
//!
//! SHAPE. A SESSION, not a one-shot like `humble_reveal_post`. One hidden window is opened on a
//! Humble page (for example `/home/library`), the open call waits for the main frame's
//! page-load-finished event and then for the page to go quiet (an unauthenticated page finishes on
//! www and redirects to the auth host about 0.7 s later), and then any number of POSTs run from
//! that page's own JS context. A page that ends up on another origin fails the open with
//! `humble_action_open:redirected:<host>`: a sign-in redirect means the session is gone.
//! The window closes on an explicit close, after `ACTION_IDLE_TTL` without a post, or when GameLib
//! exits. Phase 94's Rust adapter calls `open_action_session` / `post_action` /
//! `close_action_session` directly; the three `humble_action_*` rustInvoke channels expose the same
//! three operations to TypeScript callers.
//!
//! RETURN CHANNEL. The in-page script reports through a `location.href` assignment to the
//! non-resolvable `gamelib.invalid` host, which `on_navigation` cancels and reads (the same
//! channel `humble_reveal_post` uses; see `REVEAL_EXFIL_HOST`). The result is JSON, UTF-8
//! encoded and base64url-encoded, so the URL grows by about a third, not the up-to-6x that
//! `encodeURIComponent(JSON.stringify(..))` costs on quote-dense JSON (Chromium caps a URL at
//! 2 MB). A response over `ACTION_MAX_RESPONSE_BYTES` is reported as `response-too-large` rather
//! than silently exceeding an engine limit and timing out.
//!
//! SHUTDOWN CONTRACT (`Skill("gamelib-conventions")`, the Rust shutdown contract). In-flight work
//! (the page-load wait and each post) holds a `gamelib_core::shutdown::global()` registrant for
//! exactly as long as it is in flight and watches the token, so exit never waits on a 30 s post.
//! Every wait is bounded. No child process is spawned here; the window is the engine's own. The
//! idle watcher is a short-lived thread that does no exit work and is not a registrant.
//!
//! PRIVACY. The session cookie never passes through this module: the webview's own jar sends it.
//! Nothing here logs a path, header, body, URL or response payload; log lines carry channel names,
//! status codes and byte counts only. The request and response types deliberately do not derive
//! the standard formatting trait, so a stray format call cannot print a revealed key.

use super::*;

use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::time::Instant;

/// Name this module registers with the shutdown registry while work is in flight.
pub(crate) const ACTION_REGISTRANT: &str = "humble_action";

/// Return-channel host: the same RFC 2606 `.invalid` host `humble_reveal_post` uses, so a late
/// cancellation can never resolve to a real resolver.
pub(crate) const ACTION_EXFIL_HOST: &str = REVEAL_EXFIL_HOST;

/// How long `open` waits for the page-load-finished event.
pub(crate) const ACTION_PAGE_TIMEOUT: Duration = Duration::from_secs(20);

/// After the first page-load-finished event the page must be quiet this long before `open` returns.
/// Measured live (WKWebView, 2026-11-25): an unauthenticated `/home/library` finishes on www and
/// then redirects to `auth.humblebundle.com/login`, whose own finished event arrives about 0.7 s
/// later (0.74, 0.76 and 0.72 s over three runs). Returning at the first event would report the
/// stale www page and hand back a session that is already on the wrong origin.
pub(crate) const ACTION_SETTLE_QUIET: Duration = Duration::from_millis(1500);

/// The most extra time the settle step may add, however many page loads keep arriving.
pub(crate) const ACTION_SETTLE_MAX: Duration = Duration::from_secs(4);

/// How long one post waits for its result. Humble's reveal took about 9 s live; a library page is
/// faster.
pub(crate) const ACTION_POST_TIMEOUT: Duration = Duration::from_secs(30);

/// A session with no post for this long is closed. Must exceed `ACTION_POST_TIMEOUT` so a running
/// post can never look idle (the timestamp is refreshed when a post starts and when it ends).
pub(crate) const ACTION_IDLE_TTL: Duration = Duration::from_secs(120);

/// How often the idle watcher looks at its session.
const ACTION_IDLE_POLL: Duration = Duration::from_secs(2);

/// How often a wait wakes to look at the shutdown token.
const ACTION_WAIT_SLICE: Duration = Duration::from_millis(100);

/// Open sessions allowed at once. One sync needs one; the cap stops a leaking caller from piling
/// up authenticated hidden windows.
pub(crate) const ACTION_MAX_SESSIONS: usize = 2;

const ACTION_MAX_HEADERS: usize = 16;
const ACTION_MAX_HEADER_VALUE_CHARS: usize = 16 * 1024;
const ACTION_MAX_PARTS: usize = 64;
const ACTION_MAX_PART_NAME_CHARS: usize = 512;
const ACTION_MAX_PATH_CHARS: usize = 2048;
const ACTION_MAX_USER_AGENT_CHARS: usize = 512;
/// Request body bound (all part names and values, or the text body), in bytes.
pub(crate) const ACTION_MAX_BODY_BYTES: usize = 1024 * 1024;
/// Largest result JSON (UTF-8 bytes) the page will send back. 1.2 MB becomes about 1.6 MB of
/// base64url, under Chromium's 2 MB URL cap.
pub(crate) const ACTION_MAX_RESPONSE_BYTES: usize = 1_200_000;

// base64url grows the result by 4/3; it must stay under Chromium's 2 MiB URL cap with room for the
// host, the path and the small too-large envelope.
const _: () = assert!(ACTION_MAX_RESPONSE_BYTES / 3 * 4 + 1024 < 2 * 1024 * 1024);

/// Headers a caller may set. The browser owns Cookie, Origin, Referer, User-Agent, Host and the
/// multipart boundary; letting a caller name them would be either ignored or a way to fight the
/// engine. Lowercase.
const ACTION_HEADER_ALLOWLIST: &[&str] = &[
    "accept",
    "content-type",
    "next-action",
    "next-router-state-tree",
    "next-url",
];

/// A validated `humble_action_open` request.
pub(crate) struct ActionOpenRequest {
    pub(crate) page_url: tauri::Url,
    pub(crate) user_agent: Option<String>,
}

/// What `open` returns.
pub(crate) struct ActionOpened {
    pub(crate) session_id: String,
    /// Where the page really landed, so a caller can tell a redirect to a login page from the
    /// requested page.
    pub(crate) landed_url: String,
}

pub(crate) enum ActionBody {
    /// Ordered `FormData` parts. The caller owns the order (Humble's server decodes an empty form
    /// when the root part `0` is not last).
    Multipart(Vec<(String, String)>),
    Text(String),
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum ActionRedirect {
    Follow,
    Manual,
}

/// A validated `humble_action_post` request.
pub(crate) struct ActionPostRequest {
    pub(crate) session_id: String,
    pub(crate) path: String,
    /// Lowercased names, allowlisted, no duplicates.
    pub(crate) headers: Vec<(String, String)>,
    pub(crate) body: ActionBody,
    pub(crate) referrer: Option<String>,
    pub(crate) redirect: ActionRedirect,
}

// ---- Validation (ASVS V5): everything a caller sends is re-validated here ----

/// True for `humblebundle.com` and its subdomains, anchored on a dot so `evilhumblebundle.com`
/// and `humblebundle.com.evil.example` do not match.
pub(crate) fn is_humble_host(host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    host == "humblebundle.com" || host.ends_with(".humblebundle.com")
}

/// The open URL: https, a Humble host, no userinfo, no explicit port.
pub(crate) fn parse_humble_page_url(raw: &str) -> Result<tauri::Url, String> {
    let url = login_window_parse_url(raw)?;
    let host_ok = url.host_str().is_some_and(is_humble_host);
    if !host_ok || !url.username().is_empty() || url.password().is_some() || url.port().is_some() {
        return Err("humble_action_open:bad-url".to_string());
    }
    Ok(url)
}

fn has_control_char(s: &str) -> bool {
    s.chars().any(char::is_control)
}

/// A same-origin request path (or referrer): starts with one `/`, no backslash or control
/// character, bounded, and resolves to the same origin when joined onto a Humble origin. The shape
/// checks alone already refuse `//host` and absolute URLs; the join is defence in depth against
/// anything the URL parser would normalise into another origin (`accepted_paths_stay_on_the_origin`
/// feeds it adversarial candidates and finds none, so a mutant removing the join is equivalent).
pub(crate) fn validate_same_origin_path(path: &str) -> Result<(), &'static str> {
    if path.is_empty() || path.chars().count() > ACTION_MAX_PATH_CHARS {
        return Err("length");
    }
    if !path.starts_with('/') || path.starts_with("//") {
        return Err("shape");
    }
    if path.contains('\\') || has_control_char(path) || path.contains(' ') {
        return Err("characters");
    }
    let Ok(base) = tauri::Url::parse("https://www.humblebundle.com/") else {
        return Err("base");
    };
    match base.join(path) {
        Ok(joined) if joined.origin() == base.origin() => Ok(()),
        _ => Err("origin"),
    }
}

fn validate_header(name: &str, value: &str) -> Result<String, &'static str> {
    let lower = name.to_ascii_lowercase();
    if !ACTION_HEADER_ALLOWLIST.contains(&lower.as_str()) {
        return Err("name");
    }
    if value.chars().count() > ACTION_MAX_HEADER_VALUE_CHARS
        || value.chars().any(|c| matches!(c, '\r' | '\n' | '\0'))
    {
        return Err("value");
    }
    Ok(lower)
}

fn validate_user_agent(ua: &str) -> bool {
    !ua.trim().is_empty()
        && ua.chars().count() <= ACTION_MAX_USER_AGENT_CHARS
        && !has_control_char(ua)
}

/// `humble_action_open` args to a validated request. `userAgent` is optional: absent, the engine's
/// own default UA is used, which is the most browser-faithful fingerprint. Pass the login
/// window's UA when the jar's Cloudflare cookies were minted under it.
pub(crate) fn action_open_args(args: &[Value]) -> Result<ActionOpenRequest, String> {
    let a = HumbleActionOpenArgs::from_args(args)?;
    let page_url = parse_humble_page_url(&a.page_url)
        .map_err(|_| "humble_action_open:bad-args:pageUrl".to_string())?;
    let user_agent = match a.user_agent {
        None => None,
        Some(ua) if validate_user_agent(&ua) => Some(ua),
        Some(_) => return Err("humble_action_open:bad-args:userAgent".to_string()),
    };
    Ok(ActionOpenRequest {
        page_url,
        user_agent,
    })
}

/// `humble_action_post` args to a validated request.
pub(crate) fn action_post_args(args: &[Value]) -> Result<ActionPostRequest, String> {
    let bad = |field: &str| format!("humble_action_post:bad-args:{field}");
    let a = HumbleActionPostArgs::from_args(args)?;
    if a.session_id.is_empty() {
        return Err(bad("sessionId"));
    }
    validate_same_origin_path(&a.path).map_err(|_| bad("path"))?;
    let referrer = match a.referrer {
        None => None,
        Some(r) => {
            validate_same_origin_path(&r).map_err(|_| bad("referrer"))?;
            Some(r)
        }
    };
    if a.headers.len() > ACTION_MAX_HEADERS {
        return Err(bad("headers"));
    }
    let mut headers: Vec<(String, String)> = Vec::with_capacity(a.headers.len());
    for h in &a.headers {
        let lower = validate_header(&h.name, &h.value).map_err(|_| bad("headers"))?;
        if headers.iter().any(|(n, _)| *n == lower) {
            return Err(bad("headers"));
        }
        headers.push((lower, h.value.clone()));
    }
    let has_content_type = headers.iter().any(|(n, _)| n == "content-type");
    let body = match a.body_kind {
        HumbleActionPostArgsBodyKind::Multipart => {
            // The engine writes the multipart Content-Type with its boundary; a caller-set one
            // would have no boundary and break the body.
            let parts = a.parts.unwrap_or_default();
            if has_content_type
                || a.text.is_some()
                || parts.is_empty()
                || parts.len() > ACTION_MAX_PARTS
            {
                return Err(bad("body"));
            }
            let mut total = 0usize;
            let mut out: Vec<(String, String)> = Vec::with_capacity(parts.len());
            for p in parts {
                if p.name.is_empty() || p.name.chars().count() > ACTION_MAX_PART_NAME_CHARS {
                    return Err(bad("body"));
                }
                total = total
                    .saturating_add(p.name.len())
                    .saturating_add(p.value.len());
                out.push((p.name, p.value));
            }
            if total > ACTION_MAX_BODY_BYTES {
                return Err(bad("body"));
            }
            ActionBody::Multipart(out)
        }
        HumbleActionPostArgsBodyKind::Text => {
            let parts_given = a.parts.as_ref().is_some_and(|p| !p.is_empty());
            match a.text {
                Some(text) if !parts_given && text.len() <= ACTION_MAX_BODY_BYTES => {
                    ActionBody::Text(text)
                }
                _ => return Err(bad("body")),
            }
        }
    };
    let redirect = match a.redirect {
        Some(HumbleActionPostArgsRedirect::Manual) => ActionRedirect::Manual,
        _ => ActionRedirect::Follow,
    };
    Ok(ActionPostRequest {
        session_id: a.session_id,
        path: a.path,
        headers,
        body,
        referrer,
        redirect,
    })
}

// ---- The in-page script ----

/// Everything before the request JSON. The whole script is `HEAD + <one JSON value> + TAIL`: the
/// request reaches the page as a single `serde_json` value passed as the IIFE's argument, never
/// spliced into code, so no value a caller sends can change the script's structure. There is no
/// placeholder substitution to re-scan. Single quotes only (no double quote anywhere in the JS),
/// one source line per piece, for `longRunningChannels.test.ts`'s per-line quote-balance guard.
///
/// It runs the POST from the page's own JS context (a genuine browser network stack), guards that
/// the page is still on the origin it expected, and reports `{id, status, body, contentType, url,
/// redirected, type}` or `{id, status: 0, error}` through the navigation-intercept return channel.
/// Content-Type is never set on a multipart body: the engine writes it with the boundary.
const ACTION_SCRIPT_HEAD: &str = concat!(
    "(function(cfg) { ",
    "function b64url(bytes) { var bin = ''; for (var i = 0; i < bytes.length; i += 8192) { bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); } return btoa(bin).split('+').join('-').split('/').join('_').split('=').join(''); } ",
    "function exfil(result) { result.id = cfg.id; var bytes = new TextEncoder().encode(JSON.stringify(result)); if (bytes.length > cfg.maxBytes) { bytes = new TextEncoder().encode(JSON.stringify({ id: cfg.id, status: result.status, error: 'response-too-large', bodyBytes: bytes.length })); } location.href = 'https://' + cfg.exfilHost + '/action?d=' + b64url(bytes); } ",
    "try { ",
    "if (location.origin !== cfg.origin) { exfil({ status: 0, error: 'origin-mismatch' }); return; } ",
    "var headers = {}; for (var h = 0; h < cfg.headers.length; h++) { headers[cfg.headers[h][0]] = cfg.headers[h][1]; } ",
    "var init = { method: 'POST', credentials: 'include', redirect: cfg.redirect, headers: headers }; ",
    "if (cfg.referrer !== null) { init.referrer = cfg.referrer; } ",
    "if (cfg.kind === 'multipart') { var fd = new FormData(); for (var p = 0; p < cfg.parts.length; p++) { fd.append(cfg.parts[p][0], cfg.parts[p][1]); } init.body = fd; } else { init.body = cfg.text; } ",
    "fetch(cfg.path, init)",
    ".then(function(response) { return response.text().then(function(text) { exfil({ status: response.status, body: text, contentType: response.headers.get('content-type'), url: response.url, redirected: response.redirected, type: response.type }); }); })",
    ".catch(function(error) { exfil({ status: 0, error: 'ERR:' + String(error) }); }); ",
    "} catch (error) { exfil({ status: 0, error: 'ERR:' + String(error) }); } ",
    "})("
);

const ACTION_SCRIPT_TAIL: &str = ");";

/// The request as the one JSON value the script receives.
pub(crate) fn action_script_config(
    request_id: &str,
    origin: &str,
    exfil_host: &str,
    req: &ActionPostRequest,
) -> Value {
    let pairs = |items: &[(String, String)]| -> Value {
        Value::Array(
            items
                .iter()
                .map(|(n, v)| Value::Array(vec![Value::from(n.as_str()), Value::from(v.as_str())]))
                .collect(),
        )
    };
    let (kind, parts, text) = match &req.body {
        ActionBody::Multipart(p) => ("multipart", pairs(p), Value::Null),
        ActionBody::Text(t) => ("text", Value::Array(Vec::new()), Value::from(t.as_str())),
    };
    serde_json::json!({
        "id": request_id,
        "origin": origin,
        "exfilHost": exfil_host,
        "maxBytes": ACTION_MAX_RESPONSE_BYTES,
        "path": req.path,
        "headers": pairs(&req.headers),
        "kind": kind,
        "parts": parts,
        "text": text,
        "referrer": req.referrer,
        "redirect": match req.redirect {
            ActionRedirect::Follow => "follow",
            ActionRedirect::Manual => "manual",
        },
    })
}

/// The full script for one post. U+2028 and U+2029 are escaped even though modern engines accept
/// them in string literals, so an old engine cannot read them as line terminators.
pub(crate) fn action_post_script(
    request_id: &str,
    origin: &str,
    exfil_host: &str,
    req: &ActionPostRequest,
) -> String {
    let cfg = action_script_config(request_id, origin, exfil_host, req);
    let json = serde_json::to_string(&cfg)
        .unwrap_or_else(|_| "null".to_string())
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029");
    let mut script = String::with_capacity(ACTION_SCRIPT_HEAD.len() + json.len() + 8);
    script.push_str(ACTION_SCRIPT_HEAD);
    script.push_str(&json);
    script.push_str(ACTION_SCRIPT_TAIL);
    script
}

// ---- The return channel ----

/// Strict base64url (RFC 4648 section 5) without padding, the alphabet `btoa` plus the script's
/// `+` to `-`, `/` to `_`, `=` removal produces. Anything outside the alphabet, and a length that
/// leaves a single dangling character, is rejected.
pub(crate) fn decode_base64url(input: &str) -> Option<Vec<u8>> {
    let bytes = input.as_bytes();
    if bytes.len() % 4 == 1 {
        return None;
    }
    let mut out = Vec::with_capacity(bytes.len() * 3 / 4);
    let mut acc: u32 = 0;
    let mut bits: u32 = 0;
    for &c in bytes {
        let v: u32 = match c {
            b'A'..=b'Z' => u32::from(c - b'A'),
            b'a'..=b'z' => u32::from(c - b'a') + 26,
            b'0'..=b'9' => u32::from(c - b'0') + 52,
            b'-' => 62,
            b'_' => 63,
            _ => return None,
        };
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(((acc >> bits) & 0xff) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Some(out)
}

/// What a received return-channel message means for the request being waited on.
pub(crate) enum PayloadVerdict {
    /// Not this request's reply (a late reply from a timed-out request, an undecodable message, or
    /// a page script's forgery without the per-request id). Keep waiting.
    NotMine,
    Done(Result<Value, String>),
}

/// Decodes one return-channel message and judges it against `expected_id`. A matching reply with an
/// `error` becomes a declared rejection; otherwise the result is exactly the six documented
/// fields (the id and any extra keys never leave this function).
pub(crate) fn judge_payload(raw: &str, expected_id: &str) -> PayloadVerdict {
    let Some(bytes) = decode_base64url(raw) else {
        return PayloadVerdict::NotMine;
    };
    let Ok(payload) = serde_json::from_slice::<Value>(&bytes) else {
        return PayloadVerdict::NotMine;
    };
    if payload.get("id").and_then(Value::as_str) != Some(expected_id) {
        return PayloadVerdict::NotMine;
    }
    if let Some(error) = payload.get("error").and_then(Value::as_str) {
        let rejection = match error {
            "origin-mismatch" => "humble_action_post:origin-mismatch".to_string(),
            "response-too-large" => "humble_action_post:response-too-large".to_string(),
            other => {
                // A fetch failure text, for example a TypeError from a cross-origin redirect. Capped
                // and never carries a response body (the script reports none on failure).
                let text: String = other.trim_start_matches("ERR:").chars().take(200).collect();
                format!("humble_action_post:fetch-failed:{text}")
            }
        };
        return PayloadVerdict::Done(Err(rejection));
    }
    let (Some(status), Some(body)) = (
        payload.get("status").and_then(Value::as_u64),
        payload.get("body").and_then(Value::as_str),
    ) else {
        return PayloadVerdict::Done(Err("humble_action_post:bad-payload".to_string()));
    };
    PayloadVerdict::Done(Ok(serde_json::json!({
        "status": status,
        "body": body,
        "contentType": payload.get("contentType").and_then(Value::as_str),
        "url": payload.get("url").and_then(Value::as_str),
        "redirected": payload.get("redirected").and_then(Value::as_bool).unwrap_or(false),
        "type": payload.get("type").and_then(Value::as_str),
    })))
}

/// Request ids are unguessable by page scripts: a process-random hash of a counter and the clock.
pub(crate) fn next_action_request_id() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, Ordering::SeqCst);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let hashed = std::collections::hash_map::RandomState::new().hash_one((n, nanos));
    format!("{hashed:016x}")
}

// ---- A bounded, cancellable wait ----

pub(crate) enum WaitOutcome<R> {
    Done(R),
    TimedOut,
    Cancelled,
    /// The sending side is gone: the window was destroyed.
    Closed,
}

/// Waits on `rx` until `accept` returns a value, `timeout` passes, `cancelled` turns true or the
/// sender goes away. Wakes every `slice` to look at `cancelled`, so a shutdown is noticed within
/// one slice rather than at the end of a 30 s timeout.
pub(crate) fn wait_for<T, R>(
    rx: &Receiver<T>,
    timeout: Duration,
    slice: Duration,
    cancelled: &dyn Fn() -> bool,
    mut accept: impl FnMut(T) -> Option<R>,
) -> WaitOutcome<R> {
    let deadline = Instant::now() + timeout;
    loop {
        if cancelled() {
            return WaitOutcome::Cancelled;
        }
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            return WaitOutcome::TimedOut;
        }
        match rx.recv_timeout(left.min(slice)) {
            Ok(item) => {
                if let Some(done) = accept(item) {
                    return WaitOutcome::Done(done);
                }
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return WaitOutcome::Closed,
        }
    }
}

// ---- The session table ----

pub(crate) enum IdleState {
    Gone,
    Live,
    Idle,
}

struct SessionEntry<T> {
    value: T,
    last_used: Instant,
}

/// Open sessions by id, each with its last-use time. Generic over the stored handle so the
/// bookkeeping is testable without a live window.
pub(crate) struct SessionTable<T> {
    entries: HashMap<String, SessionEntry<T>>,
}

impl<T: Clone> SessionTable<T> {
    pub(crate) fn new() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }

    pub(crate) fn len(&self) -> usize {
        self.entries.len()
    }

    pub(crate) fn insert(
        &mut self,
        id: String,
        value: T,
        now: Instant,
        max: usize,
    ) -> Result<(), String> {
        if self.entries.len() >= max {
            return Err("humble_action_open:too-many-sessions".to_string());
        }
        self.entries.insert(
            id,
            SessionEntry {
                value,
                last_used: now,
            },
        );
        Ok(())
    }

    /// The session's handle, with its last-use time refreshed.
    pub(crate) fn touch(&mut self, id: &str, now: Instant) -> Option<T> {
        let entry = self.entries.get_mut(id)?;
        entry.last_used = now;
        Some(entry.value.clone())
    }

    pub(crate) fn remove(&mut self, id: &str) -> Option<T> {
        self.entries.remove(id).map(|e| e.value)
    }

    pub(crate) fn idle_state(&self, id: &str, now: Instant, ttl: Duration) -> IdleState {
        match self.entries.get(id) {
            None => IdleState::Gone,
            Some(e) if now.saturating_duration_since(e.last_used) >= ttl => IdleState::Idle,
            Some(_) => IdleState::Live,
        }
    }

    pub(crate) fn expired(&self, now: Instant, ttl: Duration) -> Vec<String> {
        self.entries
            .iter()
            .filter(|(_, e)| now.saturating_duration_since(e.last_used) >= ttl)
            .map(|(id, _)| id.clone())
            .collect()
    }
}

// ---- Live sessions (a real window per entry; proven by the live gate, not by unit tests) ----

struct ActionSession {
    window: tauri::WebviewWindow,
    /// Return-channel messages. Locked for the whole of a post, which serialises posts.
    results: Mutex<Receiver<String>>,
    /// The origin the page was opened on; the script refuses to post from any other origin.
    origin: String,
}

fn action_sessions() -> &'static Mutex<SessionTable<Arc<ActionSession>>> {
    static SESSIONS: OnceLock<Mutex<SessionTable<Arc<ActionSession>>>> = OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(SessionTable::new()))
}

/// Poison-tolerant: a panic elsewhere must not wedge the exit path or the next sync.
fn lock_action_sessions() -> std::sync::MutexGuard<'static, SessionTable<Arc<ActionSession>>> {
    action_sessions().lock().unwrap_or_else(|e| e.into_inner())
}

fn close_action_window(window: &tauri::WebviewWindow) {
    if window.close().is_err() {
        let _ = window.destroy();
    }
}

/// Closes a session. `true` when it existed; a missing id is a healthy already-closed state.
pub(crate) fn close_action_session(session_id: &str) -> bool {
    let removed = lock_action_sessions().remove(session_id);
    match removed {
        Some(session) => {
            close_action_window(&session.window);
            true
        }
        None => false,
    }
}

fn reap_expired_action_sessions() {
    let expired = lock_action_sessions().expired(Instant::now(), ACTION_IDLE_TTL);
    for id in expired {
        close_action_session(&id);
    }
}

/// One short-lived thread per session that closes it after `ACTION_IDLE_TTL` without a post (a
/// caller that crashed mid-sync must not leave an authenticated hidden window). It does no exit
/// work and holds no registrant; at shutdown it closes its session and ends.
fn spawn_action_idle_watch(session_id: String) {
    let spawned = thread::Builder::new()
        .name("humble-action-idle".to_string())
        .spawn(move || {
            let token = gamelib_core::shutdown::global().token();
            loop {
                thread::sleep(ACTION_IDLE_POLL);
                if token.is_cancelled() {
                    close_action_session(&session_id);
                    return;
                }
                let state =
                    lock_action_sessions().idle_state(&session_id, Instant::now(), ACTION_IDLE_TTL);
                match state {
                    IdleState::Gone => return,
                    IdleState::Live => {}
                    IdleState::Idle => {
                        close_action_session(&session_id);
                        shell_eprintln!("[shell] humble_action: closed an idle session");
                        return;
                    }
                }
            }
        });
    if spawned.is_err() {
        // Not fatal: the session still ends on an explicit close, on the next open's reap, or at exit.
        shell_eprintln!("[shell] humble_action: idle watcher did not start");
    }
}

/// A main-frame load that finished on a Humble host; its URL, or `None` for anything else (an
/// `about:blank` first load, a non-Humble page).
fn accept_loaded_url(raw: &str) -> Option<String> {
    let url = tauri::Url::parse(raw).ok()?;
    if url.scheme() == "https" && url.host_str().is_some_and(is_humble_host) {
        Some(url.to_string())
    } else {
        None
    }
}

pub(crate) enum Settled {
    /// The last accepted page-load-finished URL once the page went quiet (or the cap was hit).
    Landed(String),
    Cancelled,
    Closed,
}

/// Starting from the first accepted load, keeps taking further accepted loads until the page has
/// been quiet for `quiet`, or `max_total` has passed since the first. Returns the last one.
pub(crate) fn settle_landed_url(
    rx: &Receiver<String>,
    first: String,
    quiet: Duration,
    max_total: Duration,
    slice: Duration,
    cancelled: &dyn Fn() -> bool,
) -> Settled {
    let started = Instant::now();
    let mut landed = first;
    loop {
        let left = max_total.saturating_sub(started.elapsed());
        if left.is_zero() {
            return Settled::Landed(landed);
        }
        match wait_for(rx, quiet.min(left), slice, cancelled, |raw: String| {
            accept_loaded_url(&raw)
        }) {
            WaitOutcome::Done(url) => landed = url,
            WaitOutcome::TimedOut => return Settled::Landed(landed),
            WaitOutcome::Cancelled => return Settled::Cancelled,
            WaitOutcome::Closed => return Settled::Closed,
        }
    }
}

/// A session is usable only when the page ended up on the origin that was asked for. A sign-in
/// redirect (`auth.humblebundle.com`) is reported by host alone: a host is public, a path or query
/// can carry a token.
pub(crate) fn check_landed_origin(requested_origin: &str, landed_url: &str) -> Result<(), String> {
    let landed = tauri::Url::parse(landed_url)
        .map_err(|_| "humble_action_open:redirected:unknown".to_string())?;
    if landed.origin().ascii_serialization() == requested_origin {
        return Ok(());
    }
    Err(format!(
        "humble_action_open:redirected:{}",
        landed.host_str().unwrap_or("unknown")
    ))
}

/// Opens the hidden window on `req.page_url`, waits for its main frame's page-load-finished event
/// and registers the session. The window is closed on every failure path.
pub(crate) fn open_action_session(
    app: &AppHandle,
    req: &ActionOpenRequest,
) -> Result<ActionOpened, String> {
    let shutdown = gamelib_core::shutdown::global();
    let _in_flight = shutdown.register(ACTION_REGISTRANT);
    reap_expired_action_sessions();
    if lock_action_sessions().len() >= ACTION_MAX_SESSIONS {
        return Err("humble_action_open:too-many-sessions".to_string());
    }
    let origin = req.page_url.origin().ascii_serialization();
    let label = next_login_window_label();
    let (result_tx, result_rx) = mpsc_channel::<String>();
    let (load_tx, load_rx) = mpsc_channel::<String>();
    let mut builder = tauri::WebviewWindowBuilder::new(
        app,
        &label,
        tauri::WebviewUrl::External(req.page_url.clone()),
    )
    .visible(false)
    .on_navigation(move |url| {
        if url.host_str() == Some(ACTION_EXFIL_HOST) {
            if let Some((_, payload)) = url.query_pairs().find(|(k, _)| k == "d") {
                let _ = result_tx.send(payload.into_owned());
            }
            // Cancel: the host is RFC 2606 reserved and never resolves, but this is the real guard.
            return false;
        }
        true
    })
    .on_page_load(move |_window, payload| {
        if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
            let _ = load_tx.send(payload.url().to_string());
        }
    });
    if let Some(ua) = req.user_agent.as_deref() {
        builder = builder.user_agent(ua);
    }
    let window = builder.build().map_err(|e| {
        shell_eprintln!("[shell] humble_action_open: window build failed: {e}");
        format!("humble_action_open:window:{e}")
    })?;

    let token = shutdown.token();
    let outcome = wait_for(
        &load_rx,
        ACTION_PAGE_TIMEOUT,
        ACTION_WAIT_SLICE,
        &|| token.is_cancelled(),
        |raw: String| accept_loaded_url(&raw),
    );
    let first_url = match outcome {
        WaitOutcome::Done(url) => url,
        WaitOutcome::TimedOut => {
            close_action_window(&window);
            return Err("humble_action_open:page-timeout".to_string());
        }
        WaitOutcome::Cancelled => {
            close_action_window(&window);
            return Err("humble_action_open:shutdown".to_string());
        }
        WaitOutcome::Closed => return Err("humble_action_open:window-closed".to_string()),
    };
    let landed_url = match settle_landed_url(
        &load_rx,
        first_url,
        ACTION_SETTLE_QUIET,
        ACTION_SETTLE_MAX,
        ACTION_WAIT_SLICE,
        &|| token.is_cancelled(),
    ) {
        Settled::Landed(url) => url,
        Settled::Cancelled => {
            close_action_window(&window);
            return Err("humble_action_open:shutdown".to_string());
        }
        Settled::Closed => return Err("humble_action_open:window-closed".to_string()),
    };
    if let Err(e) = check_landed_origin(&origin, &landed_url) {
        close_action_window(&window);
        shell_eprintln!("[shell] humble_action_open: the page redirected off its origin");
        return Err(e);
    }

    let session = Arc::new(ActionSession {
        window: window.clone(),
        results: Mutex::new(result_rx),
        origin,
    });
    let inserted =
        lock_action_sessions().insert(label.clone(), session, Instant::now(), ACTION_MAX_SESSIONS);
    if let Err(e) = inserted {
        close_action_window(&window);
        return Err(e);
    }
    spawn_action_idle_watch(label.clone());
    shell_eprintln!("[shell] humble_action_open: page loaded, session open");
    Ok(ActionOpened {
        session_id: label,
        landed_url,
    })
}

/// Runs one POST in the session's page and waits for the result. A non-2xx status, Cloudflare's
/// 403 included, is a normal `Ok` result; only a structural failure is an `Err`.
pub(crate) fn post_action(req: &ActionPostRequest) -> Result<Value, String> {
    let shutdown = gamelib_core::shutdown::global();
    let _in_flight = shutdown.register(ACTION_REGISTRANT);
    let session = lock_action_sessions()
        .touch(&req.session_id, Instant::now())
        .ok_or_else(|| "humble_action_post:no-session".to_string())?;
    let results = session.results.lock().unwrap_or_else(|e| e.into_inner());
    // A late reply from a timed-out earlier post must not be taken for this one.
    while results.try_recv().is_ok() {}
    let request_id = next_action_request_id();
    let script = action_post_script(&request_id, &session.origin, ACTION_EXFIL_HOST, req);
    if let Err(e) = session.window.eval(&script) {
        shell_eprintln!("[shell] humble_action_post: script injection failed: {e}");
        return Err(format!("humble_action_post:script:{e}"));
    }
    let token = shutdown.token();
    let outcome = wait_for(
        &results,
        ACTION_POST_TIMEOUT,
        ACTION_WAIT_SLICE,
        &|| token.is_cancelled(),
        |raw: String| match judge_payload(&raw, &request_id) {
            PayloadVerdict::NotMine => None,
            PayloadVerdict::Done(result) => Some(result),
        },
    );
    drop(results);
    // The post is over: the idle clock restarts from here, not from when it began.
    let _ = lock_action_sessions().touch(&req.session_id, Instant::now());
    match outcome {
        WaitOutcome::Done(result) => {
            if let Ok(v) = &result {
                let status = v.get("status").and_then(Value::as_u64).unwrap_or(0);
                let bytes = v.get("body").and_then(Value::as_str).map_or(0, str::len);
                shell_eprintln!("[shell] humble_action_post: status={status} bytes={bytes}");
            }
            result
        }
        WaitOutcome::TimedOut => Err("humble_action_post:timeout".to_string()),
        WaitOutcome::Cancelled => {
            close_action_session(&req.session_id);
            Err("humble_action_post:shutdown".to_string())
        }
        WaitOutcome::Closed => {
            close_action_session(&req.session_id);
            Err("humble_action_post:session-closed".to_string())
        }
    }
}

// ---- rustInvoke arms ----

/// `humble_action_open`: `[{ pageUrl, userAgent? }]` to `{ sessionId, landedUrl }`.
pub(crate) fn rpc_humble_action_open(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    let parsed = action_open_args(args)?;
    let opened = open_action_session(app, &parsed)?;
    Ok(serde_json::json!({
        "sessionId": opened.session_id,
        "landedUrl": opened.landed_url,
    }))
}

/// `humble_action_post`: one in-page POST to `{ status, body, contentType, url, redirected, type }`.
pub(crate) fn rpc_humble_action_post(args: &[Value]) -> Result<Value, String> {
    let parsed = action_post_args(args)?;
    post_action(&parsed)
}

/// `humble_action_close`: `[{ sessionId }]` to `Bool(existed)`.
pub(crate) fn rpc_humble_action_close(args: &[Value]) -> Result<Value, String> {
    let parsed = HumbleActionCloseArgs::from_args(args)?;
    Ok(Value::Bool(close_action_session(&parsed.session_id)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ---- helpers ----

    /// Stands in for `.unwrap_err()`: the request and response types derive no formatting trait.
    fn err_of<T>(result: Result<T, String>) -> String {
        match result {
            Err(e) => e,
            Ok(_) => panic!("expected this input to be rejected"),
        }
    }

    fn ok_of<T>(result: Result<T, String>) -> T {
        match result {
            Ok(v) => v,
            Err(e) => panic!("expected this input to be accepted, got: {e}"),
        }
    }

    fn pair(name: &str, value: &str) -> Value {
        json!({ "name": name, "value": value })
    }

    fn multipart_args() -> Vec<Value> {
        vec![json!({
            "sessionId": "loginwin-1",
            "path": "/home/library?page=2",
            "headers": [
                pair("Accept", "text/x-component"),
                pair("Next-Action", "40abc"),
                pair("Next-Router-State-Tree", "%5B%22%22%5D"),
            ],
            "bodyKind": "multipart",
            "parts": [
                pair("_1_requestId", "2"),
                pair("_1_page", "2"),
                pair("0", "[{},\"$K1\"]"),
            ],
            "referrer": "/home/library?page=2",
        })]
    }

    fn text_args() -> Vec<Value> {
        vec![json!({
            "sessionId": "loginwin-1",
            "path": "/home/library/abc123",
            "headers": [
                pair("Accept", "text/x-component"),
                pair("Content-Type", "text/plain;charset=UTF-8"),
                pair("Next-Action", "60def"),
            ],
            "bodyKind": "text",
            "text": "[\"k\",\"i\",\"$undefined\"]",
        })]
    }

    fn with_field(mut args: Vec<Value>, key: &str, value: Value) -> Vec<Value> {
        args[0][key] = value;
        args
    }

    /// Test-side base64url encoder, mirroring the script's `btoa` plus character swaps.
    fn encode_base64url(bytes: &[u8]) -> String {
        const ALPHABET: &[u8; 64] =
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        let mut out = String::new();
        for chunk in bytes.chunks(3) {
            let b = [
                chunk[0],
                *chunk.get(1).unwrap_or(&0),
                *chunk.get(2).unwrap_or(&0),
            ];
            let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
            let emit = chunk.len() + 1;
            for i in 0..emit {
                out.push(ALPHABET[((n >> (18 - 6 * i)) & 63) as usize] as char);
            }
        }
        out
    }

    fn reply(payload: Value) -> String {
        encode_base64url(payload.to_string().as_bytes())
    }

    // ---- hosts and the open URL ----

    #[test]
    fn humble_hosts_match_the_apex_and_subdomains_only() {
        assert!(is_humble_host("humblebundle.com"));
        assert!(is_humble_host("www.humblebundle.com"));
        assert!(is_humble_host("auth.humblebundle.com"));
        assert!(is_humble_host("WWW.HumbleBundle.com"));
        assert!(!is_humble_host("evilhumblebundle.com"));
        assert!(!is_humble_host("humblebundle.com.evil.example"));
        assert!(!is_humble_host("example.com"));
        assert!(!is_humble_host(""));
    }

    #[test]
    fn open_args_accept_a_humble_page_with_and_without_a_user_agent() {
        let with_ua = ok_of(action_open_args(&[json!({
            "pageUrl": "https://www.humblebundle.com/home/library",
            "userAgent": "Mozilla/5.0 (Macintosh) Safari/605.1.15",
        })]));
        assert_eq!(
            with_ua.page_url.as_str(),
            "https://www.humblebundle.com/home/library"
        );
        assert_eq!(
            with_ua.user_agent.as_deref(),
            Some("Mozilla/5.0 (Macintosh) Safari/605.1.15")
        );
        let null_ua = ok_of(action_open_args(&[json!({
            "pageUrl": "https://www.humblebundle.com/home/library",
            "userAgent": null,
        })]));
        assert!(null_ua.user_agent.is_none());
        let absent_ua = ok_of(action_open_args(&[json!({
            "pageUrl": "https://www.humblebundle.com/home/library",
        })]));
        assert!(absent_ua.user_agent.is_none());
    }

    #[test]
    fn open_args_reject_everything_that_is_not_an_https_humble_page() {
        for bad in [
            "http://www.humblebundle.com/home/library",
            "https://example.com/home/library",
            "https://humblebundle.com.evil.example/home/library",
            "https://user:pw@www.humblebundle.com/home/library",
            "https://www.humblebundle.com:8443/home/library",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "not a url",
            "",
        ] {
            assert_eq!(
                err_of(action_open_args(&[json!({ "pageUrl": bad })])),
                "humble_action_open:bad-args:pageUrl",
                "{bad}"
            );
        }
    }

    #[test]
    fn open_args_reject_missing_wrong_typed_and_unusable_user_agents() {
        assert_eq!(err_of(action_open_args(&[])), "humble_action_open:bad-args");
        assert_eq!(
            err_of(action_open_args(&[json!({ "pageUrl": 7 })])),
            "humble_action_open:bad-args:pageUrl"
        );
        for ua in [
            json!(""),
            json!("   "),
            json!("a\r\nb"),
            json!("x".repeat(513)),
        ] {
            assert_eq!(
                err_of(action_open_args(&[json!({
                    "pageUrl": "https://www.humblebundle.com/home/library",
                    "userAgent": ua,
                })])),
                "humble_action_open:bad-args:userAgent"
            );
        }
    }

    // ---- paths and referrers ----

    #[test]
    fn same_origin_paths_accept_a_path_with_a_query() {
        assert!(validate_same_origin_path("/home/library").is_ok());
        assert!(validate_same_origin_path("/home/library?page=2").is_ok());
        assert!(validate_same_origin_path("/home/library/9f8e7d").is_ok());
    }

    #[test]
    fn accepted_paths_stay_on_the_origin() {
        let base = tauri::Url::parse("https://www.humblebundle.com/").unwrap();
        let candidates = [
            "/.//evil.example/x",
            "/..//evil.example/x",
            "/%2F%2Fevil.example/x",
            "/%5Cevil.example/x",
            "/?//evil.example",
            "/#//evil.example",
            "/@evil.example",
            "/:@evil.example/",
            "/\u{2215}evil.example",
            "/home/library/..%2f..%2fevil",
            "/home/library?next=https://evil.example",
        ];
        for c in candidates {
            if validate_same_origin_path(c).is_ok() {
                let joined = base.join(c).expect("an accepted path joins");
                assert_eq!(joined.origin(), base.origin(), "{c}");
            }
        }
    }

    #[test]
    fn same_origin_paths_reject_anything_that_could_leave_the_origin() {
        for bad in [
            "",
            "home/library",
            "//evil.example/x",
            "/\\evil.example/x",
            "https://evil.example/x",
            "/a b",
            "/a\nb",
            "/a\u{0}b",
        ] {
            assert!(validate_same_origin_path(bad).is_err(), "{bad:?}");
        }
        let long = format!("/{}", "a".repeat(ACTION_MAX_PATH_CHARS));
        assert!(validate_same_origin_path(&long).is_err());
    }

    // ---- post args ----

    #[test]
    fn post_args_accept_a_library_page_post_and_keep_the_part_order() {
        let req = ok_of(action_post_args(&multipart_args()));
        assert_eq!(req.session_id, "loginwin-1");
        assert_eq!(req.path, "/home/library?page=2");
        assert_eq!(req.referrer.as_deref(), Some("/home/library?page=2"));
        assert!(req.redirect == ActionRedirect::Follow);
        let names: Vec<&str> = req.headers.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(names, ["accept", "next-action", "next-router-state-tree"]);
        match req.body {
            ActionBody::Multipart(parts) => {
                let order: Vec<&str> = parts.iter().map(|(n, _)| n.as_str()).collect();
                // The root part `0` is last, exactly as the caller sent it.
                assert_eq!(order, ["_1_requestId", "_1_page", "0"]);
            }
            ActionBody::Text(_) => panic!("expected a multipart body"),
        }
    }

    #[test]
    fn post_args_accept_a_text_body_with_a_content_type() {
        let req = ok_of(action_post_args(&text_args()));
        assert!(req.referrer.is_none());
        match req.body {
            ActionBody::Text(t) => assert_eq!(t, "[\"k\",\"i\",\"$undefined\"]"),
            ActionBody::Multipart(_) => panic!("expected a text body"),
        }
        assert!(req.headers.iter().any(|(n, _)| n == "content-type"));
    }

    #[test]
    fn post_args_map_redirect_manual_and_default_to_follow() {
        let manual = ok_of(action_post_args(&with_field(
            text_args(),
            "redirect",
            json!("manual"),
        )));
        assert!(manual.redirect == ActionRedirect::Manual);
        let follow = ok_of(action_post_args(&with_field(
            text_args(),
            "redirect",
            json!("follow"),
        )));
        assert!(follow.redirect == ActionRedirect::Follow);
        assert_eq!(
            err_of(action_post_args(&with_field(
                text_args(),
                "redirect",
                json!("error")
            ))),
            "humble_action_post:bad-args"
        );
    }

    #[test]
    fn post_args_reject_missing_wrong_typed_and_empty_identity_fields() {
        assert_eq!(err_of(action_post_args(&[])), "humble_action_post:bad-args");
        assert_eq!(
            err_of(action_post_args(&[json!({ "sessionId": "x" })])),
            "humble_action_post:bad-args"
        );
        assert_eq!(
            err_of(action_post_args(&with_field(
                text_args(),
                "sessionId",
                json!("")
            ))),
            "humble_action_post:bad-args:sessionId"
        );
        assert_eq!(
            err_of(action_post_args(&with_field(
                text_args(),
                "bodyKind",
                json!("json")
            ))),
            "humble_action_post:bad-args"
        );
    }

    #[test]
    fn post_args_reject_a_path_or_referrer_off_the_origin() {
        for bad in ["//evil.example/x", "https://evil.example/x", "x", ""] {
            assert_eq!(
                err_of(action_post_args(&with_field(
                    text_args(),
                    "path",
                    json!(bad)
                ))),
                "humble_action_post:bad-args:path",
                "{bad}"
            );
            assert_eq!(
                err_of(action_post_args(&with_field(
                    text_args(),
                    "referrer",
                    json!(bad)
                ))),
                "humble_action_post:bad-args:referrer",
                "{bad}"
            );
        }
    }

    #[test]
    fn post_args_reject_headers_outside_the_allowlist() {
        for name in [
            "Cookie",
            "Origin",
            "Referer",
            "User-Agent",
            "Host",
            "Content-Length",
            "Sec-Fetch-Mode",
            "X-Anything",
        ] {
            let args = with_field(text_args(), "headers", json!([pair(name, "v")]));
            assert_eq!(
                err_of(action_post_args(&args)),
                "humble_action_post:bad-args:headers",
                "{name}"
            );
        }
    }

    #[test]
    fn post_args_reject_duplicate_header_names_in_any_case() {
        let args = with_field(
            text_args(),
            "headers",
            json!([pair("Next-Action", "a"), pair("next-action", "b")]),
        );
        assert_eq!(
            err_of(action_post_args(&args)),
            "humble_action_post:bad-args:headers"
        );
    }

    #[test]
    fn post_args_reject_header_values_that_could_split_a_header() {
        for value in ["a\r\nX: y", "a\nb", "a\u{0}b"] {
            let args = with_field(text_args(), "headers", json!([pair("Next-Action", value)]));
            assert_eq!(
                err_of(action_post_args(&args)),
                "humble_action_post:bad-args:headers"
            );
        }
        let too_long = "v".repeat(ACTION_MAX_HEADER_VALUE_CHARS + 1);
        let args = with_field(
            text_args(),
            "headers",
            json!([pair("Next-Action", &too_long)]),
        );
        assert_eq!(
            err_of(action_post_args(&args)),
            "humble_action_post:bad-args:headers"
        );
    }

    #[test]
    fn post_args_reject_too_many_headers() {
        let many: Vec<Value> = (0..=ACTION_MAX_HEADERS)
            .map(|_| pair("accept", "x"))
            .collect();
        let args = with_field(text_args(), "headers", Value::Array(many));
        assert_eq!(
            err_of(action_post_args(&args)),
            "humble_action_post:bad-args:headers"
        );
    }

    #[test]
    fn post_args_reject_a_multipart_body_that_sets_content_type_or_has_no_parts() {
        let with_ct = with_field(
            multipart_args(),
            "headers",
            json!([pair("Content-Type", "multipart/form-data")]),
        );
        assert_eq!(
            err_of(action_post_args(&with_ct)),
            "humble_action_post:bad-args:body"
        );
        for parts in [json!([]), Value::Null] {
            assert_eq!(
                err_of(action_post_args(&with_field(
                    multipart_args(),
                    "parts",
                    parts
                ))),
                "humble_action_post:bad-args:body"
            );
        }
        assert_eq!(
            err_of(action_post_args(&with_field(
                multipart_args(),
                "text",
                json!("also text")
            ))),
            "humble_action_post:bad-args:body"
        );
    }

    #[test]
    fn post_args_reject_multipart_parts_that_are_unnamed_or_too_big_or_too_many() {
        let unnamed = with_field(multipart_args(), "parts", json!([pair("", "v")]));
        assert_eq!(
            err_of(action_post_args(&unnamed)),
            "humble_action_post:bad-args:body"
        );
        let many: Vec<Value> = (0..=ACTION_MAX_PARTS)
            .map(|i| pair(&format!("p{i}"), "v"))
            .collect();
        assert_eq!(
            err_of(action_post_args(&with_field(
                multipart_args(),
                "parts",
                Value::Array(many)
            ))),
            "humble_action_post:bad-args:body"
        );
        let big = "v".repeat(ACTION_MAX_BODY_BYTES + 1);
        let args = with_field(multipart_args(), "parts", json!([pair("0", &big)]));
        assert_eq!(
            err_of(action_post_args(&args)),
            "humble_action_post:bad-args:body"
        );
    }

    #[test]
    fn post_args_reject_a_text_body_that_is_missing_oversized_or_mixed_with_parts() {
        let missing = with_field(text_args(), "text", Value::Null);
        assert_eq!(
            err_of(action_post_args(&missing)),
            "humble_action_post:bad-args:body"
        );
        let big = with_field(
            text_args(),
            "text",
            json!("t".repeat(ACTION_MAX_BODY_BYTES + 1)),
        );
        assert_eq!(
            err_of(action_post_args(&big)),
            "humble_action_post:bad-args:body"
        );
        let mixed = with_field(text_args(), "parts", json!([pair("0", "v")]));
        assert_eq!(
            err_of(action_post_args(&mixed)),
            "humble_action_post:bad-args:body"
        );
    }

    // ---- the script ----

    fn script_for(args: &[Value], id: &str) -> (String, ActionPostRequest) {
        let req = ok_of(action_post_args(args));
        let script =
            action_post_script(id, "https://www.humblebundle.com", ACTION_EXFIL_HOST, &req);
        (script, req)
    }

    /// The request JSON a script carries: everything between the fixed head and the fixed tail.
    fn embedded_config(script: &str) -> Value {
        let body = script
            .strip_prefix(ACTION_SCRIPT_HEAD)
            .and_then(|s| s.strip_suffix(ACTION_SCRIPT_TAIL))
            .expect("script is exactly HEAD + one JSON value + TAIL");
        serde_json::from_str(body).expect("the part between head and tail is one JSON value")
    }

    #[test]
    fn script_is_the_fixed_head_one_json_value_and_the_fixed_tail() {
        let (script, _) = script_for(&multipart_args(), "req-1");
        let cfg = embedded_config(&script);
        assert_eq!(cfg["id"], "req-1");
        assert_eq!(cfg["origin"], "https://www.humblebundle.com");
        assert_eq!(cfg["exfilHost"], ACTION_EXFIL_HOST);
        assert_eq!(cfg["maxBytes"], ACTION_MAX_RESPONSE_BYTES);
        assert_eq!(cfg["path"], "/home/library?page=2");
        assert_eq!(cfg["kind"], "multipart");
        assert_eq!(cfg["redirect"], "follow");
        assert_eq!(cfg["referrer"], "/home/library?page=2");
    }

    #[test]
    fn script_keeps_caller_values_out_of_code_whatever_they_contain() {
        // Quotes, backslashes, a closing script tag, the IIFE's own tail, and the old
        // placeholder token: all must arrive verbatim inside the JSON value and nowhere else.
        let nasty =
            "a\"b\"c'd\\e</script>});location.href='x';(function(){@@REQ@@ \u{2028}\u{2029}";
        let args = with_field(
            multipart_args(),
            "parts",
            json!([pair(nasty, nasty), pair("0", nasty)]),
        );
        let (script, _) = script_for(&args, "req-2");
        assert!(script.starts_with(ACTION_SCRIPT_HEAD));
        assert!(script.ends_with(ACTION_SCRIPT_TAIL));
        let cfg = embedded_config(&script);
        assert_eq!(cfg["parts"][0][0], nasty);
        assert_eq!(cfg["parts"][0][1], nasty);
        assert_eq!(cfg["parts"][1][1], nasty);
        // The head is a compile-time constant and appears exactly once.
        assert_eq!(script.matches(ACTION_SCRIPT_HEAD).count(), 1);
        // The raw line separators never reach the engine unescaped.
        assert!(!script.contains('\u{2028}'));
        assert!(!script.contains('\u{2029}'));
    }

    #[test]
    fn script_carries_the_multipart_parts_in_the_callers_order_with_root_last() {
        let (script, _) = script_for(&multipart_args(), "req-3");
        let cfg = embedded_config(&script);
        let names: Vec<&str> = cfg["parts"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| p[0].as_str().unwrap())
            .collect();
        assert_eq!(names, ["_1_requestId", "_1_page", "0"]);
        assert_eq!(cfg["text"], Value::Null);
    }

    #[test]
    fn script_carries_a_text_body_and_its_content_type_header() {
        let (script, _) = script_for(&text_args(), "req-4");
        let cfg = embedded_config(&script);
        assert_eq!(cfg["kind"], "text");
        assert_eq!(cfg["text"], "[\"k\",\"i\",\"$undefined\"]");
        let header_names: Vec<&str> = cfg["headers"]
            .as_array()
            .unwrap()
            .iter()
            .map(|h| h[0].as_str().unwrap())
            .collect();
        assert!(header_names.contains(&"content-type"));
        assert_eq!(cfg["referrer"], Value::Null);
    }

    #[test]
    fn script_never_sets_a_content_type_for_a_multipart_body() {
        // Validation rejects a caller-set one, and the fixed head has no header of its own.
        let (script, _) = script_for(&multipart_args(), "req-5");
        let cfg = embedded_config(&script);
        let has_ct = cfg["headers"]
            .as_array()
            .unwrap()
            .iter()
            .any(|h| h[0] == "content-type");
        assert!(!has_ct);
        // The only mention of content-type in the head is READING the response's.
        let lower = ACTION_SCRIPT_HEAD.to_ascii_lowercase();
        assert_eq!(lower.matches("content-type").count(), 1);
        assert!(lower.contains("response.headers.get('content-type')"));
    }

    #[test]
    fn script_head_has_no_double_quote_and_posts_with_the_pages_own_fetch() {
        assert!(!ACTION_SCRIPT_HEAD.contains('\u{22}'));
        assert!(ACTION_SCRIPT_HEAD.contains("fetch(cfg.path, init)"));
        assert!(ACTION_SCRIPT_HEAD.contains("method: 'POST'"));
        assert!(ACTION_SCRIPT_HEAD.contains("credentials: 'include'"));
        assert!(ACTION_SCRIPT_HEAD.contains("new FormData()"));
        // The origin guard runs before the fetch.
        let guard = ACTION_SCRIPT_HEAD
            .find("location.origin !== cfg.origin")
            .unwrap();
        let fetch = ACTION_SCRIPT_HEAD.find("fetch(cfg.path, init)").unwrap();
        assert!(guard < fetch);
        // The result goes out through the navigation-intercept host, not a network call.
        assert!(ACTION_SCRIPT_HEAD.contains("location.href = 'https://' + cfg.exfilHost"));
    }

    #[test]
    fn script_reports_an_oversized_response_instead_of_exceeding_the_url_limit() {
        assert!(ACTION_SCRIPT_HEAD.contains("bytes.length > cfg.maxBytes"));
        assert!(ACTION_SCRIPT_HEAD.contains("error: 'response-too-large'"));
    }

    #[test]
    fn script_origin_is_the_sessions_not_a_page_value() {
        let req = ok_of(action_post_args(&text_args()));
        let script =
            action_post_script("r", "https://www.humblebundle.com", "gamelib.invalid", &req);
        assert_eq!(
            embedded_config(&script)["origin"],
            "https://www.humblebundle.com"
        );
        assert_eq!(embedded_config(&script)["exfilHost"], "gamelib.invalid");
    }

    // ---- the return channel ----

    #[test]
    fn base64url_decodes_the_rfc_4648_vectors() {
        for (encoded, plain) in [
            ("", ""),
            ("Zg", "f"),
            ("Zm8", "fo"),
            ("Zm9v", "foo"),
            ("Zm9vYg", "foob"),
            ("Zm9vYmE", "fooba"),
            ("Zm9vYmFy", "foobar"),
        ] {
            assert_eq!(
                decode_base64url(encoded).as_deref(),
                Some(plain.as_bytes()),
                "{encoded}"
            );
        }
    }

    #[test]
    fn base64url_uses_dash_and_underscore_for_62_and_63() {
        assert_eq!(decode_base64url("-_8").as_deref(), Some(&[0xfb, 0xff][..]));
        assert_eq!(
            decode_base64url("-_-_").as_deref(),
            Some(&[0xfb, 0xff, 0xbf][..])
        );
    }

    #[test]
    fn base64url_rejects_the_standard_alphabet_padding_whitespace_and_a_dangling_char() {
        for bad in ["+/8=", "Zg==", "Zm 9v", "Zm9v\n", "Z", "Zm9vY", "é"] {
            assert!(decode_base64url(bad).is_none(), "{bad:?}");
        }
    }

    #[test]
    fn base64url_round_trips_multibyte_text_the_way_the_script_encodes_it() {
        let text = "{\"body\":\"Ünïcödé 日本語 \u{1f3ae}\"}";
        let encoded = encode_base64url(text.as_bytes());
        assert!(!encoded.contains('+') && !encoded.contains('/') && !encoded.contains('='));
        let decoded = decode_base64url(&encoded).unwrap();
        assert_eq!(String::from_utf8(decoded).unwrap(), text);
    }

    #[test]
    fn a_matching_reply_yields_exactly_the_six_documented_fields() {
        let raw = reply(json!({
            "id": "req-1",
            "status": 200,
            "body": "0:[\"$\",\"div\"]\n",
            "contentType": "text/x-component",
            "url": "https://www.humblebundle.com/home/library?page=2",
            "redirected": false,
            "type": "basic",
            "somethingElse": "dropped",
        }));
        match judge_payload(&raw, "req-1") {
            PayloadVerdict::Done(Ok(v)) => {
                let keys: std::collections::BTreeSet<&str> =
                    v.as_object().unwrap().keys().map(String::as_str).collect();
                assert_eq!(
                    keys.into_iter().collect::<Vec<_>>(),
                    ["body", "contentType", "redirected", "status", "type", "url"]
                );
                assert_eq!(v["status"], 200);
                assert_eq!(v["contentType"], "text/x-component");
                assert_eq!(v["redirected"], false);
            }
            _ => panic!("expected a result"),
        }
    }

    #[test]
    fn a_cloudflare_403_is_a_normal_result_not_a_rejection() {
        let raw = reply(json!({
            "id": "r", "status": 403, "body": "<title>Attention Required! | Cloudflare</title>",
            "contentType": "text/html; charset=UTF-8", "url": "https://www.humblebundle.com/home/library",
            "redirected": false, "type": "basic",
        }));
        match judge_payload(&raw, "r") {
            PayloadVerdict::Done(Ok(v)) => assert_eq!(v["status"], 403),
            _ => panic!("a 403 must come back as a result"),
        }
    }

    #[test]
    fn an_empty_body_is_a_valid_result() {
        let raw = reply(json!({ "id": "r", "status": 204, "body": "" }));
        match judge_payload(&raw, "r") {
            PayloadVerdict::Done(Ok(v)) => {
                assert_eq!(v["body"], "");
                assert_eq!(v["contentType"], Value::Null);
            }
            _ => panic!("expected a result"),
        }
    }

    #[test]
    fn a_reply_for_another_request_or_garbage_is_not_this_requests() {
        let other = reply(json!({ "id": "someone-else", "status": 200, "body": "x" }));
        assert!(matches!(
            judge_payload(&other, "r"),
            PayloadVerdict::NotMine
        ));
        let no_id = reply(json!({ "status": 200, "body": "x" }));
        assert!(matches!(
            judge_payload(&no_id, "r"),
            PayloadVerdict::NotMine
        ));
        assert!(matches!(
            judge_payload("!!not-base64!!", "r"),
            PayloadVerdict::NotMine
        ));
        let not_json = encode_base64url(b"just text");
        assert!(matches!(
            judge_payload(&not_json, "r"),
            PayloadVerdict::NotMine
        ));
    }

    #[test]
    fn declared_script_errors_become_declared_rejections() {
        for (error, expected) in [
            ("origin-mismatch", "humble_action_post:origin-mismatch"),
            (
                "response-too-large",
                "humble_action_post:response-too-large",
            ),
        ] {
            let raw = reply(json!({ "id": "r", "status": 0, "error": error }));
            match judge_payload(&raw, "r") {
                PayloadVerdict::Done(Err(e)) => assert_eq!(e, expected),
                _ => panic!("expected a rejection for {error}"),
            }
        }
    }

    #[test]
    fn a_fetch_failure_is_capped_and_carries_no_body() {
        let long = format!("ERR:TypeError: {}", "x".repeat(500));
        let raw = reply(json!({ "id": "r", "status": 0, "error": long, "body": "secret" }));
        match judge_payload(&raw, "r") {
            PayloadVerdict::Done(Err(e)) => {
                assert!(e.starts_with("humble_action_post:fetch-failed:TypeError: "));
                assert!(e.chars().count() <= "humble_action_post:fetch-failed:".len() + 200);
                assert!(!e.contains("secret"));
            }
            _ => panic!("expected a rejection"),
        }
    }

    #[test]
    fn a_matching_reply_without_a_status_or_body_is_a_bad_payload() {
        for payload in [
            json!({ "id": "r", "body": "x" }),
            json!({ "id": "r", "status": 200 }),
            json!({ "id": "r", "status": "200", "body": "x" }),
        ] {
            match judge_payload(&reply(payload), "r") {
                PayloadVerdict::Done(Err(e)) => assert_eq!(e, "humble_action_post:bad-payload"),
                _ => panic!("expected bad-payload"),
            }
        }
    }

    #[test]
    fn request_ids_are_distinct_and_sixteen_hex_digits() {
        let ids: Vec<String> = (0..50).map(|_| next_action_request_id()).collect();
        for id in &ids {
            assert_eq!(id.len(), 16);
            assert!(id.chars().all(|c| c.is_ascii_hexdigit()));
        }
        let unique: std::collections::HashSet<&String> = ids.iter().collect();
        assert_eq!(unique.len(), ids.len());
    }

    #[test]
    fn loaded_urls_are_accepted_only_on_a_humble_https_host() {
        assert_eq!(
            accept_loaded_url("https://www.humblebundle.com/home/library").as_deref(),
            Some("https://www.humblebundle.com/home/library")
        );
        assert!(accept_loaded_url("https://auth.humblebundle.com/login").is_some());
        assert!(accept_loaded_url("about:blank").is_none());
        assert!(accept_loaded_url("https://example.com/").is_none());
        assert!(accept_loaded_url("http://www.humblebundle.com/").is_none());
        assert!(accept_loaded_url("garbage").is_none());
    }

    // ---- the bounded, cancellable wait ----

    const FAST: Duration = Duration::from_millis(5);

    #[test]
    fn wait_returns_the_first_accepted_item_and_skips_the_rest() {
        let (tx, rx) = mpsc_channel::<u32>();
        for n in [1, 2, 3, 4] {
            tx.send(n).unwrap();
        }
        let outcome = wait_for(&rx, Duration::from_secs(5), FAST, &|| false, |n| {
            if n >= 3 {
                Some(n * 10)
            } else {
                None
            }
        });
        assert!(matches!(outcome, WaitOutcome::Done(30)));
    }

    #[test]
    fn wait_times_out_when_nothing_acceptable_arrives() {
        let (tx, rx) = mpsc_channel::<u32>();
        tx.send(1).unwrap();
        let started = Instant::now();
        let outcome = wait_for(&rx, Duration::from_millis(60), FAST, &|| false, |_| {
            None::<u32>
        });
        assert!(matches!(outcome, WaitOutcome::TimedOut));
        assert!(started.elapsed() >= Duration::from_millis(60));
        drop(tx);
    }

    #[test]
    fn wait_stops_at_once_when_cancelled_and_never_reads_the_channel() {
        let (tx, rx) = mpsc_channel::<u32>();
        tx.send(1).unwrap();
        let seen = AtomicBool::new(false);
        let outcome = wait_for(&rx, Duration::from_secs(30), FAST, &|| true, |_| {
            seen.store(true, Ordering::SeqCst);
            Some(())
        });
        assert!(matches!(outcome, WaitOutcome::Cancelled));
        assert!(!seen.load(Ordering::SeqCst));
    }

    #[test]
    fn wait_reports_a_dropped_sender_as_the_window_closing() {
        let (tx, rx) = mpsc_channel::<u32>();
        drop(tx);
        let outcome = wait_for(&rx, Duration::from_secs(30), FAST, &|| false, |_| Some(()));
        assert!(matches!(outcome, WaitOutcome::Closed));
    }

    #[test]
    fn a_shutdown_token_ends_a_long_wait_within_a_slice_and_frees_the_registrant() {
        let shutdown = gamelib_core::shutdown::Shutdown::new();
        let (tx, rx) = mpsc_channel::<u32>();
        let worker_shutdown = shutdown.clone();
        let started = Instant::now();
        let worker = thread::spawn(move || {
            let _in_flight = worker_shutdown.register(ACTION_REGISTRANT);
            let token = worker_shutdown.token();
            let outcome = wait_for(
                &rx,
                Duration::from_secs(30),
                ACTION_WAIT_SLICE,
                &|| token.is_cancelled(),
                |_| None::<u32>,
            );
            matches!(outcome, WaitOutcome::Cancelled)
        });
        thread::sleep(Duration::from_millis(150));
        // `drain` cancels the token, then waits for every registrant to drop: if the wait did not
        // watch the token this would report `humble_action` still held at the deadline.
        let still_held = shutdown.drain(Duration::from_secs(2));
        assert!(still_held.is_empty(), "still held: {still_held:?}");
        assert!(worker.join().unwrap(), "the wait must end as Cancelled");
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "exit must not wait out the 30 s timeout"
        );
        drop(tx);
    }

    #[test]
    fn the_registrant_name_is_held_while_work_is_in_flight_and_released_after() {
        let shutdown = gamelib_core::shutdown::Shutdown::new();
        let held = shutdown.register(ACTION_REGISTRANT);
        assert_eq!(shutdown.drain(Duration::ZERO), vec![ACTION_REGISTRANT]);
        drop(held);
        assert!(shutdown.drain(Duration::ZERO).is_empty());
    }

    // ---- settling on the page that really loaded ----

    #[test]
    fn settle_returns_the_first_load_when_the_page_goes_quiet() {
        let (tx, rx) = mpsc_channel::<String>();
        let first = "https://www.humblebundle.com/home/library".to_string();
        let started = Instant::now();
        let outcome = settle_landed_url(
            &rx,
            first.clone(),
            Duration::from_millis(60),
            Duration::from_secs(5),
            FAST,
            &|| false,
        );
        assert!(matches!(outcome, Settled::Landed(ref u) if *u == first));
        assert!(started.elapsed() >= Duration::from_millis(60));
        drop(tx);
    }

    #[test]
    fn settle_follows_a_redirect_to_the_last_load() {
        let (tx, rx) = mpsc_channel::<String>();
        tx.send("https://auth.humblebundle.com/login".to_string())
            .unwrap();
        let outcome = settle_landed_url(
            &rx,
            "https://www.humblebundle.com/home/library".to_string(),
            Duration::from_millis(60),
            Duration::from_secs(5),
            FAST,
            &|| false,
        );
        assert!(
            matches!(outcome, Settled::Landed(ref u) if u == "https://auth.humblebundle.com/login")
        );
        drop(tx);
    }

    #[test]
    fn settle_ignores_loads_that_are_not_on_a_humble_host() {
        let (tx, rx) = mpsc_channel::<String>();
        tx.send("about:blank".to_string()).unwrap();
        tx.send("https://tracker.example/pixel".to_string())
            .unwrap();
        let first = "https://www.humblebundle.com/home/library".to_string();
        let outcome = settle_landed_url(
            &rx,
            first.clone(),
            Duration::from_millis(60),
            Duration::from_secs(5),
            FAST,
            &|| false,
        );
        assert!(matches!(outcome, Settled::Landed(ref u) if *u == first));
        drop(tx);
    }

    #[test]
    fn settle_is_capped_however_many_loads_keep_arriving() {
        let (tx, rx) = mpsc_channel::<String>();
        let feeder = thread::spawn(move || {
            // A page that reloads forever: one finished event every 20 ms.
            for _ in 0..400 {
                if tx
                    .send("https://www.humblebundle.com/x".to_string())
                    .is_err()
                {
                    return;
                }
                thread::sleep(Duration::from_millis(20));
            }
        });
        let started = Instant::now();
        let outcome = settle_landed_url(
            &rx,
            "https://www.humblebundle.com/x".to_string(),
            Duration::from_millis(100),
            Duration::from_millis(300),
            FAST,
            &|| false,
        );
        assert!(matches!(outcome, Settled::Landed(_)));
        assert!(
            started.elapsed() < Duration::from_secs(2),
            "the cap must end the settle"
        );
        drop(rx);
        feeder.join().unwrap();
    }

    #[test]
    fn settle_stops_at_once_when_cancelled_or_when_the_window_goes() {
        let (tx, rx) = mpsc_channel::<String>();
        let cancelled = settle_landed_url(
            &rx,
            "https://www.humblebundle.com/".to_string(),
            Duration::from_secs(30),
            Duration::from_secs(30),
            FAST,
            &|| true,
        );
        assert!(matches!(cancelled, Settled::Cancelled));
        drop(tx);
        let closed = settle_landed_url(
            &rx,
            "https://www.humblebundle.com/".to_string(),
            Duration::from_secs(30),
            Duration::from_secs(30),
            FAST,
            &|| false,
        );
        assert!(matches!(closed, Settled::Closed));
    }

    #[test]
    fn a_page_that_stays_on_its_origin_is_usable_whatever_its_path() {
        let origin = "https://www.humblebundle.com";
        assert!(check_landed_origin(origin, "https://www.humblebundle.com/home/library").is_ok());
        assert!(
            check_landed_origin(origin, "https://www.humblebundle.com/home/library?page=2").is_ok()
        );
    }

    #[test]
    fn a_sign_in_redirect_is_reported_by_host_only() {
        let origin = "https://www.humblebundle.com";
        let landed = "https://auth.humblebundle.com/login?return_to=%2Fhome%2Flibrary&flow=abc123";
        let e = err_of(check_landed_origin(origin, landed));
        assert_eq!(e, "humble_action_open:redirected:auth.humblebundle.com");
        // No path, query or flow id leaks into the error text.
        assert!(!e.contains("login") && !e.contains("abc123") && !e.contains("return_to"));
        assert_eq!(
            err_of(check_landed_origin(origin, "not a url")),
            "humble_action_open:redirected:unknown"
        );
    }

    #[test]
    fn the_settle_window_covers_the_measured_redirect_gap_and_fits_the_open_budget() {
        // Measured: the redirect's own finished event arrives about 0.72 to 0.76 s after the first.
        assert!(ACTION_SETTLE_QUIET >= Duration::from_millis(1400));
        assert!(ACTION_SETTLE_QUIET < ACTION_SETTLE_MAX);
        assert!(ACTION_SETTLE_MAX <= Duration::from_secs(5));
        // The idle clock cannot start counting before open is even done.
        assert!(ACTION_IDLE_TTL > ACTION_PAGE_TIMEOUT + ACTION_SETTLE_MAX);
    }

    // ---- a real engine's output ----

    /// What the real script (`ACTION_SCRIPT_HEAD` plus one JSON value) emitted in a live WKWebView,
    /// 2026-11-25: an anonymous, non-persistent store, a page on www.humblebundle.com, the library
    /// action posted as multipart with `0` last, the navigation to `gamelib.invalid` cancelled in
    /// the navigation delegate (what `on_navigation` does) and its `d` value kept verbatim. The
    /// reply is Humble's own flight text for an unauthenticated session: public, no cookie, no key.
    /// Cloudflare answered 200 here; the same request from Node, curl and reqwest got its 403 page.
    const REAL_WKWEBVIEW_REPLY: &str = "eyJzdGF0dXMiOjIwMCwiYm9keSI6IjA6e1wiYVwiOlwiJEAxXCIsXCJxXCI6XCJcIixcImlcIjpmYWxzZSxcImJcIjpcIkxkU3Z5eGRmODFaYXV5NWU0SnQ4dVwifVxuMTp7XCJyZXN1bHRzXCI6W10sXCJidW5kbGVzQ291bnRcIjowLFwicGFnaW5hdGlvblwiOntcInBhZ2VcIjoxLFwidG90YWxQYWdlc1wiOjEsXCJ0b3RhbERvY3NcIjowfSxcInJlcXVlc3RJZFwiOlwiMVwiLFwic3VjY2Vzc1wiOmZhbHNlLFwiZXJyb3JcIjpcIm5vdF9hdXRoZW50aWNhdGVkXCIsXCJyZXRyeWFibGVcIjpmYWxzZX1cbiIsImNvbnRlbnRUeXBlIjoidGV4dC94LWNvbXBvbmVudCIsInVybCI6Imh0dHBzOi8vd3d3Lmh1bWJsZWJ1bmRsZS5jb20vaG9tZS9saWJyYXJ5IiwicmVkaXJlY3RlZCI6ZmFsc2UsInR5cGUiOiJiYXNpYyIsImlkIjoicHJvYmUtcmVxdWVzdC0wMDAxIn0";

    #[test]
    fn a_reply_emitted_by_a_real_wkwebview_decodes_into_the_documented_result() {
        let bytes =
            decode_base64url(REAL_WKWEBVIEW_REPLY).expect("the engine's output is base64url");
        let payload: Value = serde_json::from_slice(&bytes).expect("the engine's output is JSON");
        assert_eq!(payload["id"], "probe-request-0001");
        match judge_payload(REAL_WKWEBVIEW_REPLY, "probe-request-0001") {
            PayloadVerdict::Done(Ok(v)) => {
                assert_eq!(v["status"], 200);
                assert_eq!(v["contentType"], "text/x-component");
                assert_eq!(v["url"], "https://www.humblebundle.com/home/library");
                assert_eq!(v["redirected"], false);
                assert_eq!(v["type"], "basic");
                let body = v["body"].as_str().unwrap();
                assert!(body.starts_with("0:{"));
                assert!(body.contains("\"error\":\"not_authenticated\""));
            }
            _ => panic!("the real reply must decode into a result"),
        }
        // The same bytes are not an answer to a different request.
        assert!(matches!(
            judge_payload(REAL_WKWEBVIEW_REPLY, "another-request"),
            PayloadVerdict::NotMine
        ));
    }

    // ---- the session table ----

    #[test]
    fn the_idle_ttl_outlasts_a_post_and_the_page_load() {
        assert!(ACTION_IDLE_TTL > ACTION_POST_TIMEOUT);
        assert!(ACTION_IDLE_TTL > ACTION_PAGE_TIMEOUT);
        assert!(ACTION_IDLE_POLL < ACTION_IDLE_TTL);
    }

    #[test]
    fn the_table_caps_open_sessions() {
        let now = Instant::now();
        let mut table = SessionTable::<u32>::new();
        assert!(table.insert("a".into(), 1, now, 2).is_ok());
        assert!(table.insert("b".into(), 2, now, 2).is_ok());
        assert_eq!(
            err_of(table.insert("c".into(), 3, now, 2)),
            "humble_action_open:too-many-sessions"
        );
        assert_eq!(table.len(), 2);
    }

    #[test]
    fn touch_returns_the_handle_and_remove_forgets_it() {
        let now = Instant::now();
        let mut table = SessionTable::<u32>::new();
        table.insert("a".into(), 7, now, 4).unwrap();
        assert_eq!(table.touch("a", now), Some(7));
        assert_eq!(table.touch("missing", now), None);
        assert_eq!(table.remove("a"), Some(7));
        assert_eq!(table.remove("a"), None);
        assert_eq!(table.touch("a", now), None);
    }

    #[test]
    fn a_session_goes_idle_after_the_ttl_and_a_touch_restarts_the_clock() {
        let t0 = Instant::now();
        let ttl = Duration::from_secs(120);
        let mut table = SessionTable::<u32>::new();
        table.insert("a".into(), 1, t0, 4).unwrap();
        assert!(matches!(
            table.idle_state("a", t0 + Duration::from_secs(119), ttl),
            IdleState::Live
        ));
        assert!(matches!(
            table.idle_state("a", t0 + ttl, ttl),
            IdleState::Idle
        ));
        table.touch("a", t0 + Duration::from_secs(100));
        assert!(matches!(
            table.idle_state("a", t0 + Duration::from_secs(200), ttl),
            IdleState::Live
        ));
        assert!(matches!(
            table.idle_state("a", t0 + Duration::from_secs(221), ttl),
            IdleState::Idle
        ));
        assert!(matches!(table.idle_state("b", t0, ttl), IdleState::Gone));
    }

    #[test]
    fn expired_lists_only_the_idle_sessions() {
        let t0 = Instant::now();
        let ttl = Duration::from_secs(120);
        let mut table = SessionTable::<u32>::new();
        table.insert("old".into(), 1, t0, 4).unwrap();
        table
            .insert("fresh".into(), 2, t0 + Duration::from_secs(100), 4)
            .unwrap();
        let expired = table.expired(t0 + Duration::from_secs(130), ttl);
        assert_eq!(expired, vec!["old".to_string()]);
    }

    #[test]
    fn a_full_table_frees_a_slot_once_a_session_is_removed() {
        let now = Instant::now();
        let mut table = SessionTable::<u32>::new();
        table.insert("a".into(), 1, now, 1).unwrap();
        assert!(table.insert("b".into(), 2, now, 1).is_err());
        table.remove("a");
        assert!(table.insert("b".into(), 2, now, 1).is_ok());
    }
}
