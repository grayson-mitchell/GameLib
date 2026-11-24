//! The Humble HTTP seam (Phase 94, D-19/D-20). All Humble and Steam-store traffic goes through [`Http`]:
//! [`ReqwestHttp`] in the app, `Replay` (feature `testing`) in the golden tests, which pins each request
//! to the one the TypeScript made on the wire (the 94-06 recorder's `exchanges.json`).
//!
//! This is `gamelib-info`'s `Http`, `Request`, `Response`, `HttpError`, `ReqwestHttp` and `Replay` with
//! three additions, each for a Humble-specific reason:
//!
//! 1. A per-request redirect switch. A Humble request carries the session cookie, and a 302 to
//!    `auth.humblebundle.com` means the session ended: the adapter must SEE it, never follow it
//!    (Pitfall 5, T-94-27). [`Request::follow_redirects`] is therefore `false` unless a caller opts in
//!    (the Steam store search does, as axios did: it carries no credential), and [`ReqwestHttp`] keeps
//!    one client per policy (`Policy::none()` and `Policy::limited(5)`).
//! 2. An ordered multipart body builder ([`Request::multipart`]): the library server action takes its
//!    fields in a fixed order, and a replay pins that order.
//! 3. Request pinning against the recorder's format (`exchanges.json`: method, target, the headers the
//!    TS sets, the body or the multipart fields), see `replay`.
//!
//! A URL can carry a gamekey or a key, and a request carries a cookie, so nothing here puts a URL, a
//! header, a cookie or a body into an error string, a `Debug` output or a log line (T-94-28).

use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::Duration;

#[cfg(feature = "testing")]
mod replay;
#[cfg(feature = "testing")]
pub use replay::{Replay, PINNED_HEADERS, TRANSPORT_HEADERS};

/// The response body cap when a caller names none. A caller passes a smaller one where TS had one.
pub const DEFAULT_MAX_BODY: usize = 16 * 1024 * 1024;

/// The most redirects a request that opted in to following them will follow (axios's default).
const MAX_REDIRECTS: usize = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Method {
    Get,
    Post,
    Put,
    Delete,
    Head,
}

impl Method {
    pub fn as_str(self) -> &'static str {
        match self {
            Method::Get => "GET",
            Method::Post => "POST",
            Method::Put => "PUT",
            Method::Delete => "DELETE",
            Method::Head => "HEAD",
        }
    }
}

/// One field of a multipart body.
#[derive(Clone, PartialEq, Eq)]
pub enum MultipartValue {
    /// A text field. Its newlines are written as CRLF, as a browser's `FormData` encodes them.
    Text(String),
    /// A file field.
    File {
        filename: String,
        content_type: String,
        bytes: Vec<u8>,
    },
}

impl std::fmt::Debug for MultipartValue {
    /// A value can be a gamekey or a key: only the shape is printed.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MultipartValue::Text(_) => f.write_str("Text(..)"),
            MultipartValue::File { .. } => f.write_str("File(..)"),
        }
    }
}

/// One request. Build the URL's query with [`axios_query`], never reqwest's `.query()`.
#[derive(Clone)]
pub struct Request {
    pub method: Method,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<Vec<u8>>,
    pub timeout: Duration,
    /// The most response bytes to read before answering [`HttpError::TooLarge`].
    pub max_body: usize,
    /// Whether a 3xx is followed (at most five hops). `false` for every Humble request: the 3xx comes
    /// back as the response, with its `Location` header, and the caller maps it (Pitfall 5).
    pub follow_redirects: bool,
}

impl Request {
    pub fn new(method: Method, url: impl Into<String>, timeout: Duration) -> Request {
        Request {
            method,
            url: url.into(),
            headers: Vec::new(),
            body: None,
            timeout,
            max_body: DEFAULT_MAX_BODY,
            follow_redirects: false,
        }
    }

    pub fn get(url: impl Into<String>, timeout: Duration) -> Request {
        Request::new(Method::Get, url, timeout)
    }

    pub fn post(url: impl Into<String>, timeout: Duration) -> Request {
        Request::new(Method::Post, url, timeout)
    }

    pub fn header(mut self, name: &str, value: &str) -> Request {
        self.headers.push((name.to_string(), value.to_string()));
        self
    }

    pub fn body(mut self, body: Vec<u8>) -> Request {
        self.body = Some(body);
        self
    }

    pub fn max_body(mut self, max_body: usize) -> Request {
        self.max_body = max_body;
        self
    }

    /// Whether a 3xx is followed. Humble requests leave this `false`.
    pub fn follow_redirects(mut self, follow: bool) -> Request {
        self.follow_redirects = follow;
        self
    }

    /// A `multipart/form-data` body with the fields in the order given, and the `Content-Type` header
    /// that names its boundary (any earlier `Content-Type` is replaced). The boundary is chosen so it
    /// occurs in no field.
    pub fn multipart(self, fields: Vec<(String, MultipartValue)>) -> Request {
        let boundary = fresh_boundary(&fields);
        self.multipart_with_boundary(fields, &boundary)
    }

    /// [`Request::multipart`] with a caller-chosen boundary (a test pinning the exact bytes).
    pub fn multipart_with_boundary(
        mut self,
        fields: Vec<(String, MultipartValue)>,
        boundary: &str,
    ) -> Request {
        self.headers
            .retain(|(name, _)| !name.eq_ignore_ascii_case("content-type"));
        self.headers.push((
            "Content-Type".to_string(),
            format!("multipart/form-data; boundary={boundary}"),
        ));
        self.body = Some(encode_multipart(&fields, boundary));
        self
    }
}

impl std::fmt::Debug for Request {
    /// No query, no header values, no body: any of them can hold a key or a cookie.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let url = self.url.split(['?', '#']).next().unwrap_or_default();
        f.debug_struct("Request")
            .field("method", &self.method)
            .field("url", &url)
            .field("follow_redirects", &self.follow_redirects)
            .finish_non_exhaustive()
    }
}

/// A boundary that appears in no field. Uniqueness, not secrecy, is the point, so a clock reading and a
/// process counter are enough (no random source needed).
fn fresh_boundary(fields: &[(String, MultipartValue)]) -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    loop {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos());
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let boundary = format!("----GameLibFormBoundary{nanos:x}{n:x}");
        if !fields.iter().any(|(name, value)| {
            name.contains(&boundary)
                || match value {
                    MultipartValue::Text(text) => text.contains(&boundary),
                    MultipartValue::File {
                        filename, bytes, ..
                    } => {
                        filename.contains(&boundary)
                            || bytes
                                .windows(boundary.len())
                                .any(|w| w == boundary.as_bytes())
                    }
                }
        }) {
            return boundary;
        }
    }
}

/// `"` , CR and LF in a name or filename, as the HTML multipart encoding writes them.
fn escape_disposition(text: &str) -> String {
    text.replace('\n', "%0A")
        .replace('\r', "%0D")
        .replace('"', "%22")
}

/// A text field's value with every newline as CRLF (`FormData`'s "normalize newlines").
fn crlf(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\r' => {
                if chars.peek() == Some(&'\n') {
                    chars.next();
                }
                out.push_str("\r\n");
            }
            '\n' => out.push_str("\r\n"),
            other => out.push(other),
        }
    }
    out
}

fn encode_multipart(fields: &[(String, MultipartValue)], boundary: &str) -> Vec<u8> {
    let mut out: Vec<u8> = Vec::new();
    for (name, value) in fields {
        out.extend_from_slice(b"--");
        out.extend_from_slice(boundary.as_bytes());
        out.extend_from_slice(b"\r\n");
        match value {
            MultipartValue::Text(text) => {
                out.extend_from_slice(
                    format!(
                        "Content-Disposition: form-data; name=\"{}\"\r\n\r\n",
                        escape_disposition(&crlf(name))
                    )
                    .as_bytes(),
                );
                out.extend_from_slice(crlf(text).as_bytes());
            }
            MultipartValue::File {
                filename,
                content_type,
                bytes,
            } => {
                out.extend_from_slice(
                    format!(
                        "Content-Disposition: form-data; name=\"{}\"; filename=\"{}\"\r\nContent-Type: {content_type}\r\n\r\n",
                        escape_disposition(&crlf(name)),
                        escape_disposition(&crlf(filename)),
                    )
                    .as_bytes(),
                );
                out.extend_from_slice(bytes);
            }
        }
        out.extend_from_slice(b"\r\n");
    }
    out.extend_from_slice(b"--");
    out.extend_from_slice(boundary.as_bytes());
    out.extend_from_slice(b"--\r\n");
    out
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Response {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl Response {
    /// The first header named `name` (case-insensitive).
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
}

/// Why a request produced no response. Never carries a URL.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HttpError {
    Timeout,
    Network(String),
    TooLarge,
    Cancelled,
}

impl std::fmt::Display for HttpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HttpError::Timeout => f.write_str("timeout"),
            HttpError::Network(m) => write!(f, "network: {m}"),
            HttpError::TooLarge => f.write_str("response too large"),
            HttpError::Cancelled => f.write_str("cancelled"),
        }
    }
}

impl std::error::Error for HttpError {}

pub type HttpFuture<'a> = Pin<Box<dyn Future<Output = Result<Response, HttpError>> + Send + 'a>>;

/// The HTTP seam.
pub trait Http: Send + Sync {
    fn send(&self, request: Request) -> HttpFuture<'_>;
}

/// An [`Http`] for a context that must never reach the network (a headless run, a unit test of an op
/// that makes no request): every request answers a transport error.
#[cfg(any(test, feature = "testing"))]
#[derive(Debug, Default, Clone, Copy)]
pub struct NoHttp;

#[cfg(any(test, feature = "testing"))]
impl Http for NoHttp {
    fn send(&self, _request: Request) -> HttpFuture<'_> {
        Box::pin(async { Err(HttpError::Network("no network in this context".to_string())) })
    }
}

/// Installs the process-wide rustls provider (ring), as `gamelib-steamcm` does. Idempotent: an
/// already installed provider is not an error.
pub fn install_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

/// Query text as axios 1.x writes it: `encodeURIComponent`, then `:`, `$` and `,` put back and a
/// space as `+`. So `! ' ( ) * ~` stay literal (`encodeURIComponent` leaves them) and `[` and `]`
/// are `%5B` and `%5D`. reqwest's `.query()` encodes differently, so its feature stays off.
pub fn axios_query(pairs: &[(&str, &str)]) -> String {
    let mut out = String::new();
    for (i, (key, value)) in pairs.iter().enumerate() {
        if i > 0 {
            out.push('&');
        }
        encode_component(key, &mut out);
        out.push('=');
        encode_component(value, &mut out);
    }
    out
}

fn encode_component(text: &str, out: &mut String) {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    for byte in text.bytes() {
        match byte {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'!'
            | b'~'
            | b'*'
            | b'\''
            | b'('
            | b')'
            | b':'
            | b'$'
            | b',' => out.push(char::from(byte)),
            b' ' => out.push('+'),
            _ => {
                out.push('%');
                out.push(char::from(HEX[usize::from(byte >> 4)]));
                out.push(char::from(HEX[usize::from(byte & 0x0F)]));
            }
        }
    }
}

/// The reqwest-backed [`Http`]. Two clients, one per redirect policy, each built on first use after
/// the rustls provider is installed (a client built earlier would have no provider): `Policy::none()`
/// for every Humble request and `Policy::limited(5)` for one that opted in. Each request applies its
/// own timeout, the response body is capped, and every error goes through `.without_url()` so a
/// gamekey or a `key=` query never reaches a log or an error string.
pub struct ReqwestHttp {
    no_redirect: OnceLock<Result<reqwest::Client, String>>,
    follow_redirect: OnceLock<Result<reqwest::Client, String>>,
}

impl ReqwestHttp {
    pub fn new() -> ReqwestHttp {
        ReqwestHttp {
            no_redirect: OnceLock::new(),
            follow_redirect: OnceLock::new(),
        }
    }

    fn client(&self, follow: bool) -> Result<&reqwest::Client, HttpError> {
        let (slot, policy) = if follow {
            (
                &self.follow_redirect,
                reqwest::redirect::Policy::limited(MAX_REDIRECTS),
            )
        } else {
            (&self.no_redirect, reqwest::redirect::Policy::none())
        };
        slot.get_or_init(|| {
            install_crypto_provider();
            reqwest::Client::builder()
                .redirect(policy)
                .build()
                .map_err(|e| e.without_url().to_string())
        })
        .as_ref()
        .map_err(|message| HttpError::Network(message.clone()))
    }
}

impl Default for ReqwestHttp {
    fn default() -> Self {
        ReqwestHttp::new()
    }
}

/// The error without the URL, and with any copy of the URL or its query the message still holds
/// replaced (belt and braces: `.without_url()` removes the URL field, this removes a stray copy).
fn map_error(error: reqwest::Error, url: &str) -> HttpError {
    if error.is_timeout() {
        return HttpError::Timeout;
    }
    let mut message = error.without_url().to_string();
    message = message.replace(url, "<url>");
    if let Some((_, query)) = url.split_once('?') {
        let query = query.split('#').next().unwrap_or_default();
        if !query.is_empty() {
            message = message.replace(query, "<query>");
        }
    }
    HttpError::Network(message)
}

impl Http for ReqwestHttp {
    fn send(&self, request: Request) -> HttpFuture<'_> {
        Box::pin(async move {
            let client = self.client(request.follow_redirects)?;
            let method = match request.method {
                Method::Get => reqwest::Method::GET,
                Method::Post => reqwest::Method::POST,
                Method::Put => reqwest::Method::PUT,
                Method::Delete => reqwest::Method::DELETE,
                Method::Head => reqwest::Method::HEAD,
            };
            let mut builder = client
                .request(method, request.url.as_str())
                .timeout(request.timeout);
            for (name, value) in &request.headers {
                builder = builder.header(name.as_str(), value.as_str());
            }
            if let Some(body) = &request.body {
                builder = builder.body(body.clone());
            }
            let mut response = builder
                .send()
                .await
                .map_err(|e| map_error(e, &request.url))?;
            let status = response.status().as_u16();
            let headers = response
                .headers()
                .iter()
                .filter_map(|(name, value)| {
                    value
                        .to_str()
                        .ok()
                        .map(|v| (name.as_str().to_string(), v.to_string()))
                })
                .collect();
            // A declared length over the cap is refused before a byte of the body is read.
            if request.method != Method::Head
                && response
                    .content_length()
                    .is_some_and(|n| n > request.max_body as u64)
            {
                return Err(HttpError::TooLarge);
            }
            let mut body: Vec<u8> = Vec::new();
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|e| map_error(e, &request.url))?
            {
                if body.len().saturating_add(chunk.len()) > request.max_body {
                    return Err(HttpError::TooLarge);
                }
                body.extend_from_slice(&chunk);
            }
            Ok(Response {
                status,
                headers,
                body,
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::{SocketAddr, TcpListener};
    use std::sync::atomic::AtomicUsize;
    use std::sync::{Arc, Mutex};

    // ---------------------------------------------------------------- the redirect switch

    /// A one-thread HTTP/1.1 server on 127.0.0.1 that answers by path, counting every request it
    /// served and recording the request lines. It stops at its deadline, so a failing test leaves no
    /// thread waiting forever.
    struct LocalServer {
        addr: SocketAddr,
        served: Arc<AtomicUsize>,
        lines: Arc<Mutex<Vec<String>>>,
    }

    fn serve(routes: &'static [(&'static str, &'static str)]) -> LocalServer {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind a loopback port");
        listener.set_nonblocking(true).unwrap();
        let addr = listener.local_addr().unwrap();
        let served = Arc::new(AtomicUsize::new(0));
        let lines = Arc::new(Mutex::new(Vec::new()));
        let (served_in, lines_in) = (served.clone(), lines.clone());
        std::thread::spawn(move || {
            let deadline = std::time::Instant::now() + Duration::from_secs(20);
            while std::time::Instant::now() < deadline {
                let Ok((mut stream, _)) = listener.accept() else {
                    std::thread::sleep(Duration::from_millis(5));
                    continue;
                };
                stream.set_nonblocking(false).unwrap();
                let mut seen = Vec::new();
                let mut buf = [0u8; 1024];
                while !seen.windows(4).any(|w| w == b"\r\n\r\n") {
                    match stream.read(&mut buf) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => seen.extend_from_slice(&buf[..n]),
                    }
                }
                let head = String::from_utf8_lossy(&seen).into_owned();
                let line = head.lines().next().unwrap_or_default().to_string();
                let path = line.split(' ').nth(1).unwrap_or_default().to_string();
                lines_in.lock().unwrap().push(line);
                served_in.fetch_add(1, Ordering::SeqCst);
                let response = routes.iter().find(|(p, _)| *p == path).map_or(
                    "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                    |(_, r)| r,
                );
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.flush();
                drop(stream);
            }
        });
        LocalServer {
            addr,
            served,
            lines,
        }
    }

    const REDIRECT_TO_AUTH: &str = "HTTP/1.1 302 Found\r\nLocation: https://auth.humblebundle.com/login?next=%2Fhome\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
    const REDIRECT_TO_FINAL: &str =
        "HTTP/1.1 302 Found\r\nLocation: /final\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
    const FINAL_OK: &str = "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok";

    /// T-94-27, Pitfall 5: a 302 to the Humble auth host comes back as a 302 response with its
    /// `Location`, and exactly one request is made. Following it would send the session cookie to a
    /// second host and hide the signed-out state from the adapter.
    #[tokio::test]
    async fn a_302_to_the_auth_host_is_a_response_and_one_request_is_made() {
        let server = serve(&[("/home/library", REDIRECT_TO_AUTH)]);
        let http = ReqwestHttp::new();
        let request = Request::get(
            format!("http://{}/home/library", server.addr),
            Duration::from_secs(5),
        )
        .header("Cookie", "_simpleauth_sess=SECRET-COOKIE");
        assert!(
            !request.follow_redirects,
            "a request does not follow by default"
        );
        let response = http.send(request).await.expect("the 302 is a response");
        assert_eq!(response.status, 302);
        assert_eq!(
            response.header("location"),
            Some("https://auth.humblebundle.com/login?next=%2Fhome")
        );
        assert_eq!(server.served.load(Ordering::SeqCst), 1);
        assert_eq!(server.lines.lock().unwrap().len(), 1);
    }

    /// The switch is real in both directions: a request that opts in follows a redirect (here to a
    /// second path on the same loopback server), so the no-follow result above is the policy, not a
    /// client that never follows.
    #[tokio::test]
    async fn a_request_that_opts_in_follows_a_redirect() {
        let server = serve(&[("/start", REDIRECT_TO_FINAL), ("/final", FINAL_OK)]);
        let http = ReqwestHttp::new();
        let url = format!("http://{}/start", server.addr);
        let followed = http
            .send(Request::get(url.clone(), Duration::from_secs(5)).follow_redirects(true))
            .await
            .expect("a followed redirect answers the final response");
        assert_eq!(followed.status, 200);
        assert_eq!(followed.body, b"ok");
        assert_eq!(server.served.load(Ordering::SeqCst), 2);

        let not_followed = http
            .send(Request::get(url, Duration::from_secs(5)))
            .await
            .expect("an unfollowed redirect is a response");
        assert_eq!(not_followed.status, 302);
        assert_eq!(server.served.load(Ordering::SeqCst), 3);
    }

    // ---------------------------------------------------------------- error text (T-94-28)

    /// An `HttpError`'s `Display` and `Debug` hold no URL, query, path or host, whatever the failure.
    #[tokio::test]
    async fn an_http_error_holds_no_url_query_or_path() {
        // A loopback port nothing listens on: bind, note the port, drop the listener.
        let port = {
            let probe = TcpListener::bind("127.0.0.1:0").unwrap();
            probe.local_addr().unwrap().port()
        };
        let url = format!("http://127.0.0.1:{port}/api/v1/order/GKSECRET?key=SECRET-KEY-VALUE");
        let error = ReqwestHttp::new()
            .send(Request::get(url.clone(), Duration::from_secs(5)))
            .await
            .expect_err("nothing listens on the port");
        for text in [error.to_string(), format!("{error:?}")] {
            for secret in ["GKSECRET", "SECRET-KEY-VALUE", "/api/v1/order", "key="] {
                assert!(!text.contains(secret), "{text} carries {secret}");
            }
            assert!(!text.contains(&url));
        }
        // The request's own Debug drops the query and the cookie.
        let request = Request::get(url, Duration::from_secs(1)).header("Cookie", "COOKIE-VALUE");
        let shown = format!("{request:?}");
        assert!(!shown.contains("SECRET-KEY-VALUE") && !shown.contains("COOKIE-VALUE"));
    }

    #[test]
    fn the_error_variants_are_fixed_text() {
        assert_eq!(HttpError::Timeout.to_string(), "timeout");
        assert_eq!(HttpError::TooLarge.to_string(), "response too large");
        assert_eq!(HttpError::Cancelled.to_string(), "cancelled");
        assert_eq!(
            HttpError::Network("tcp connect error".to_string()).to_string(),
            "network: tcp connect error"
        );
    }

    // ---------------------------------------------------------------- multipart

    fn text(name: &str, value: &str) -> (String, MultipartValue) {
        (name.to_string(), MultipartValue::Text(value.to_string()))
    }

    #[test]
    fn a_multipart_body_has_the_fields_in_the_given_order_and_names_its_boundary() {
        let request = Request::post("https://example.test/", Duration::from_secs(1))
            .header("content-type", "text/plain")
            .multipart_with_boundary(
                vec![
                    text("_1_requestId", "1"),
                    text("_1_query", ""),
                    text("0", "a\nb"),
                ],
                "XB",
            );
        assert_eq!(
            request
                .headers
                .iter()
                .filter(|(n, _)| n.eq_ignore_ascii_case("content-type"))
                .collect::<Vec<_>>(),
            [&(
                "Content-Type".to_string(),
                "multipart/form-data; boundary=XB".to_string()
            )],
            "the earlier content type is replaced"
        );
        let body = String::from_utf8(request.body.clone().unwrap()).unwrap();
        assert_eq!(
            body,
            "--XB\r\nContent-Disposition: form-data; name=\"_1_requestId\"\r\n\r\n1\r\n\
             --XB\r\nContent-Disposition: form-data; name=\"_1_query\"\r\n\r\n\r\n\
             --XB\r\nContent-Disposition: form-data; name=\"0\"\r\n\r\na\r\nb\r\n\
             --XB--\r\n"
        );
    }

    #[test]
    fn a_file_part_carries_its_filename_and_type_and_a_name_with_a_quote_is_escaped() {
        let request = Request::post("https://example.test/", Duration::from_secs(1))
            .multipart_with_boundary(
                vec![(
                    "a\"b".to_string(),
                    MultipartValue::File {
                        filename: "f.bin".to_string(),
                        content_type: "application/octet-stream".to_string(),
                        bytes: vec![0, 1, 2],
                    },
                )],
                "XB",
            );
        assert_eq!(
            request.body.unwrap(),
            b"--XB\r\nContent-Disposition: form-data; name=\"a%22b\"; filename=\"f.bin\"\r\nContent-Type: application/octet-stream\r\n\r\n\x00\x01\x02\r\n--XB--\r\n"
        );
    }

    #[test]
    fn a_generated_boundary_occurs_in_no_field_and_two_requests_differ() {
        let fields = vec![text("a", "value")];
        let one = Request::post("https://example.test/", Duration::from_secs(1))
            .multipart(fields.clone());
        let two = Request::post("https://example.test/", Duration::from_secs(1)).multipart(fields);
        assert_ne!(one.headers, two.headers);
        let (_, content_type) = &one.headers[0];
        let boundary = content_type.split("boundary=").nth(1).unwrap();
        assert!(boundary.starts_with("----GameLibFormBoundary"));
        let body = String::from_utf8(one.body.unwrap()).unwrap();
        assert!(body.ends_with(&format!("--{boundary}--\r\n")));
        assert_eq!(body.matches(boundary).count(), 2);
    }

    #[test]
    fn a_multipart_value_debug_prints_no_value() {
        let shown = format!("{:?}", MultipartValue::Text("GKSECRET".to_string()));
        assert!(!shown.contains("GKSECRET"));
    }

    // ---------------------------------------------------------------- the query encoding

    /// What reaches the wire is the `url` crate's spelling of the query, not axios's: it percent-encodes
    /// an apostrophe (`%27`) where axios sent it literally. A server decodes both the same, which is
    /// why `Replay` compares the query as decoded pairs; this pins the difference so a change in either
    /// library shows up here and not as a mystery in a live request.
    #[test]
    fn the_url_crate_spells_an_apostrophe_in_the_query_differently_from_axios() {
        let query = axios_query(&[("term", "Baldur's Gate")]);
        assert_eq!(query, "term=Baldur's+Gate");
        let url = url::Url::parse(&format!("https://x.test/?{query}")).unwrap();
        assert_eq!(url.query(), Some("term=Baldur%27s+Gate"));
        let decoded: Vec<(String, String)> = url
            .query_pairs()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();
        assert_eq!(decoded, [("term".to_string(), "Baldur's Gate".to_string())]);
    }

    #[test]
    fn axios_query_encodes_as_axios_does() {
        assert_eq!(
            axios_query(&[("term", "Portal 2"), ("l", "english"), ("cc", "US")]),
            "term=Portal+2&l=english&cc=US"
        );
        // encodeURIComponent leaves ! ' ( ) * ~ literal; axios puts : $ , back; [ ] are escaped.
        assert_eq!(
            axios_query(&[("term", "Baldur's Gate (3)! *~ a:b$c,d [x] é&=")]),
            "term=Baldur's+Gate+(3)!+*~+a:b$c,d+%5Bx%5D+%C3%A9%26%3D"
        );
    }
}
