//! All HTTP goes through [`Http`] (D-20): [`ReqwestHttp`] in the app, `Replay` (feature `testing`) in
//! the golden tests, which pins each request to the one a recorded TS run made (D-10).
//!
//! A URL can carry an API key in its query (the ITAD `key=`), so nothing here puts a URL into an
//! error string or a `Debug` output.

use std::future::Future;
use std::pin::Pin;
use std::sync::OnceLock;
use std::time::Duration;

/// The response body cap when a caller names none. A caller passes a smaller one where TS had one
/// (the CrossOver index's 5 MB).
pub const DEFAULT_MAX_BODY: usize = 16 * 1024 * 1024;

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
        }
    }

    pub fn get(url: impl Into<String>, timeout: Duration) -> Request {
        Request::new(Method::Get, url, timeout)
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
}

impl std::fmt::Debug for Request {
    /// No query, no header values, no body: any of them can hold a key.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let url = self.url.split(['?', '#']).next().unwrap_or_default();
        f.debug_struct("Request")
            .field("method", &self.method)
            .field("url", &url)
            .finish_non_exhaustive()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Response {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
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

/// The reqwest-backed [`Http`]: the client is built on first use, after the rustls provider is
/// installed (a client built earlier would have no provider), follows at most five redirects as
/// axios does, applies each request's own timeout, caps the response body, and maps every error
/// through `.without_url()` so a `key=` query never reaches a log or an error string.
pub struct ReqwestHttp {
    client: OnceLock<Result<reqwest::Client, String>>,
}

impl ReqwestHttp {
    pub fn new() -> ReqwestHttp {
        ReqwestHttp {
            client: OnceLock::new(),
        }
    }

    fn client(&self) -> Result<&reqwest::Client, HttpError> {
        self.client
            .get_or_init(|| {
                install_crypto_provider();
                reqwest::Client::builder()
                    .redirect(reqwest::redirect::Policy::limited(5))
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
            let client = self.client()?;
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

#[cfg(feature = "testing")]
pub use replay::Replay;

/// A recorded case served as an [`Http`], for the golden tests and the CLI's `--replay`.
#[cfg(feature = "testing")]
mod replay {
    use std::path::{Component, Path};
    use std::sync::{Mutex, MutexGuard};

    use serde_json::Value;
    use url::Url;

    use super::{Http, HttpError, HttpFuture, Request, Response};

    /// The request headers a recorded request pins (D-10). Transport headers (`Accept-Encoding`,
    /// `Connection`, `Host`, `Content-Length`) are left out: axios and reqwest add them
    /// differently and servers decode them the same.
    const PINNED_HEADERS: [&str; 9] = [
        "user-agent",
        "authorization",
        "referer",
        "content-type",
        "x-auth-token",
        "x-hp-key",
        "x-hp-val",
        "accept-language",
        "x-gog-library-cert",
    ];

    /// Header values a message must never print.
    const HIDDEN_HEADERS: [&str; 4] = ["authorization", "x-auth-token", "x-hp-key", "x-hp-val"];

    /// What the oracle recorder writes in place of a secret header's value.
    const REDACTED: &str = "REDACTED";

    /// Query parameter names whose values a message must never print.
    const HIDDEN_PARAMS: [&str; 7] = [
        "key",
        "apikey",
        "api_key",
        "token",
        "access_token",
        "secret",
        "password",
    ];

    struct Exchange {
        id: String,
        method: String,
        url: Url,
        headers: Vec<(String, String)>,
        body: Option<Vec<u8>>,
        status: u16,
        response_headers: Vec<(String, String)>,
        response_body: Vec<u8>,
        ts_only: bool,
        /// The recorded call produced no response (a synthetic `networkError` exchange, status 0):
        /// the request is matched and consumed like any other, then fails as a transport error.
        network_error: bool,
        consumed: bool,
    }

    #[derive(Default)]
    struct State {
        exchanges: Vec<Exchange>,
        ts_only_ids: Vec<String>,
        failures: Vec<String>,
    }

    /// Serves recorded exchanges and pins each request to its recorded twin: method, scheme, host
    /// and path, the decoded query pairs in order, the body and the pinned headers, in both
    /// directions (a pinned header the recording lacks is drift too). A request with no twin, or
    /// one that differs, fails naming the request (the query values of key-like parameters and the
    /// secret headers are never printed). The first failure is sticky: [`Replay::finish`] reports
    /// it even if the caller swallowed the error. An exchange a request matched is consumed;
    /// [`Replay::finish`] also fails on any exchange left over unless it is `tsOnly` (D-23: TS makes
    /// the request and Rust will not). A `tsOnly` exchange is still served if Rust does request it.
    pub struct Replay {
        state: Mutex<State>,
    }

    fn lock(state: &Mutex<State>) -> MutexGuard<'_, State> {
        state.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn headers_of(value: &Value) -> Result<Vec<(String, String)>, String> {
        let text = |v: &Value| match v {
            Value::String(s) => Ok(s.clone()),
            Value::Number(n) => Ok(n.to_string()),
            Value::Bool(b) => Ok(b.to_string()),
            Value::Array(items) => Ok(items
                .iter()
                .map(|i| {
                    i.as_str()
                        .map(str::to_string)
                        .unwrap_or_else(|| i.to_string())
                })
                .collect::<Vec<_>>()
                .join(", ")),
            _ => Err("a header value must be a string, number, bool or array".to_string()),
        };
        match value {
            Value::Null => Ok(Vec::new()),
            Value::Object(map) => map.iter().map(|(k, v)| Ok((k.clone(), text(v)?))).collect(),
            Value::Array(pairs) => pairs
                .iter()
                .map(|pair| match pair.as_array().map(Vec::as_slice) {
                    Some([k, v]) => Ok((
                        k.as_str()
                            .ok_or("a header name must be a string")?
                            .to_string(),
                        text(v)?,
                    )),
                    _ => Err("a header pair must be [name, value]".to_string()),
                })
                .collect(),
            _ => Err("headers must be an object or a list of pairs".to_string()),
        }
    }

    fn field<'a>(value: &'a Value, name: &str, id: &str) -> Result<&'a Value, String> {
        value
            .get(name)
            .ok_or_else(|| format!("exchange {id}: missing {name}"))
    }

    impl Replay {
        /// Reads `<dir>/exchanges.json`: an ordered list of `{id, request: {method, url, headers,
        /// body?}, response: {status, headers, bodyFile?}, tsOnly?, rustOnly?, networkError?}`, with
        /// each response body in the named file beside it. `networkError: true` makes the exchange a
        /// transport failure: it matches and is consumed like any other, then answers
        /// [`HttpError::Network`] instead of a response.
        pub fn from_case(dir: &Path) -> Result<Replay, String> {
            let text = std::fs::read_to_string(dir.join("exchanges.json"))
                .map_err(|e| format!("cannot read exchanges.json: {}", e.kind()))?;
            let list: Value = serde_json::from_str(&text)
                .map_err(|_| "exchanges.json is not valid JSON".to_string())?;
            let Some(items) = list.as_array() else {
                return Err("exchanges.json must be a list".to_string());
            };
            let mut exchanges = Vec::with_capacity(items.len());
            for (n, item) in items.iter().enumerate() {
                let id = item
                    .get("id")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .unwrap_or_else(|| format!("#{n}"));
                let request = field(item, "request", &id)?;
                let response = field(item, "response", &id)?;
                let method = field(request, "method", &id)?
                    .as_str()
                    .ok_or_else(|| format!("exchange {id}: method must be a string"))?
                    .to_ascii_uppercase();
                let url_text = field(request, "url", &id)?
                    .as_str()
                    .ok_or_else(|| format!("exchange {id}: url must be a string"))?;
                let url = Url::parse(url_text)
                    .map_err(|_| format!("exchange {id}: the request url is not absolute"))?;
                let body = match request.get("body") {
                    None | Some(Value::Null) => None,
                    Some(Value::String(s)) => Some(s.clone().into_bytes()),
                    Some(other) => Some(other.to_string().into_bytes()),
                };
                let status = field(response, "status", &id)?
                    .as_u64()
                    .and_then(|s| u16::try_from(s).ok())
                    .ok_or_else(|| format!("exchange {id}: status must be a number"))?;
                let response_body = match response.get("bodyFile").and_then(Value::as_str) {
                    None => Vec::new(),
                    Some(file) => {
                        let relative = Path::new(file);
                        if !relative
                            .components()
                            .all(|c| matches!(c, Component::Normal(_)))
                        {
                            return Err(format!(
                                "exchange {id}: bodyFile must stay inside the case directory"
                            ));
                        }
                        std::fs::read(dir.join(relative)).map_err(|e| {
                            format!("exchange {id}: cannot read bodyFile: {}", e.kind())
                        })?
                    }
                };
                exchanges.push(Exchange {
                    method,
                    url,
                    headers: request
                        .get("headers")
                        .map(headers_of)
                        .transpose()
                        .map_err(|e| format!("exchange {id}: {e}"))?
                        .unwrap_or_default(),
                    body,
                    status,
                    response_headers: response
                        .get("headers")
                        .map(headers_of)
                        .transpose()
                        .map_err(|e| format!("exchange {id}: {e}"))?
                        .unwrap_or_default(),
                    response_body,
                    ts_only: item.get("tsOnly").and_then(Value::as_bool).unwrap_or(false),
                    network_error: item
                        .get("networkError")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                    consumed: false,
                    id,
                });
            }
            Ok(Replay {
                state: Mutex::new(State {
                    exchanges,
                    ..State::default()
                }),
            })
        }

        /// Lists exchanges (by id) that TS makes and Rust will not, besides any flagged `tsOnly` in
        /// the case file.
        pub fn with_ts_only(self, ids: &[&str]) -> Replay {
            lock(&self.state)
                .ts_only_ids
                .extend(ids.iter().map(|i| (*i).to_string()));
            self
        }

        /// Fails on any request that did not match its recorded twin, and on any recorded exchange
        /// that was never requested unless it is TS-only.
        pub fn finish(&self) -> Result<(), String> {
            let st = lock(&self.state);
            let mut problems = st.failures.clone();
            let left: Vec<&str> = st
                .exchanges
                .iter()
                .filter(|e| !e.consumed && !e.ts_only && !st.ts_only_ids.contains(&e.id))
                .map(|e| e.id.as_str())
                .collect();
            if !left.is_empty() {
                problems.push(format!(
                    "unconsumed recorded exchange(s): {}",
                    left.join(", ")
                ));
            }
            if problems.is_empty() {
                Ok(())
            } else {
                Err(problems.join("\n"))
            }
        }

        fn serve(&self, request: &Request) -> Result<Response, HttpError> {
            let mut st = lock(&self.state);
            let fail = |st: &mut State, message: String| {
                st.failures.push(message.clone());
                Err(HttpError::Network(message))
            };
            let Ok(url) = Url::parse(&request.url) else {
                return fail(
                    &mut st,
                    "replay: the request url is not absolute".to_string(),
                );
            };
            let method = request.method.as_str();
            let name = request_name(method, &url);
            let wanted = pairs(&url);
            let free = |e: &Exchange| !e.consumed && e.method == method && same_path(&e.url, &url);
            let index = st
                .exchanges
                .iter()
                .position(|e| free(e) && query_matches(&pairs(&e.url), &wanted))
                .or_else(|| st.exchanges.iter().position(free));
            let Some(index) = index else {
                return fail(&mut st, format!("replay: unmatched request: {name}"));
            };
            let diffs = differences(&st.exchanges[index], request, &wanted);
            if !diffs.is_empty() {
                let message = format!(
                    "replay: request {name} differs from exchange {}: {}",
                    st.exchanges[index].id,
                    diffs.join("; ")
                );
                return fail(&mut st, message);
            }
            let exchange = &mut st.exchanges[index];
            if exchange.response_body.len() > request.max_body {
                return Err(HttpError::TooLarge);
            }
            exchange.consumed = true;
            if exchange.network_error {
                return Err(HttpError::Network("Network Error".to_string()));
            }
            Ok(Response {
                status: exchange.status,
                headers: exchange.response_headers.clone(),
                body: exchange.response_body.clone(),
            })
        }
    }

    impl Http for Replay {
        fn send(&self, request: Request) -> HttpFuture<'_> {
            Box::pin(async move { self.serve(&request) })
        }
    }

    fn request_name(method: &str, url: &Url) -> String {
        let host = url.host_str().unwrap_or_default();
        match url.port() {
            Some(port) => format!("{method} {}://{host}:{port}{}", url.scheme(), url.path()),
            None => format!("{method} {}://{host}{}", url.scheme(), url.path()),
        }
    }

    fn same_path(a: &Url, b: &Url) -> bool {
        a.scheme() == b.scheme()
            && a.host_str().map(str::to_ascii_lowercase)
                == b.host_str().map(str::to_ascii_lowercase)
            && a.port_or_known_default() == b.port_or_known_default()
            && a.path() == b.path()
    }

    fn pairs(url: &Url) -> Vec<(String, String)> {
        url.query_pairs()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect()
    }

    /// Whether a request's decoded query pairs are the recorded ones. A key-like parameter
    /// (`key`, `token`, ...) the recorder stored as the bare word `REDACTED` matches any non-empty
    /// value, as a pinned secret header does: the real value is never written to a fixture.
    fn query_matches(recorded: &[(String, String)], wanted: &[(String, String)]) -> bool {
        recorded.len() == wanted.len()
            && recorded.iter().zip(wanted).all(|(r, w)| pair_matches(r, w))
    }

    fn pair_matches(recorded: &(String, String), wanted: &(String, String)) -> bool {
        recorded == wanted
            || (recorded.0 == wanted.0
                && recorded.1 == REDACTED
                && !wanted.1.is_empty()
                && HIDDEN_PARAMS
                    .iter()
                    .any(|h| recorded.0.eq_ignore_ascii_case(h)))
    }

    fn header<'a>(headers: &'a [(String, String)], name: &str) -> Option<&'a str> {
        headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }

    fn shown_param(key: &str, value: &str) -> String {
        if HIDDEN_PARAMS.iter().any(|h| key.eq_ignore_ascii_case(h)) {
            format!("{key}=<hidden>")
        } else {
            format!("{key}={value}")
        }
    }

    fn differences(
        exchange: &Exchange,
        request: &Request,
        wanted: &[(String, String)],
    ) -> Vec<String> {
        let mut diffs = Vec::new();
        let recorded = pairs(&exchange.url);
        if !query_matches(&recorded, wanted) {
            if recorded.len() != wanted.len() {
                diffs.push(format!(
                    "query has {} pair(s), recorded {}",
                    wanted.len(),
                    recorded.len()
                ));
            } else if let Some(i) =
                (0..recorded.len()).find(|i| !pair_matches(&recorded[*i], &wanted[*i]))
            {
                diffs.push(format!(
                    "query pair {i}: recorded {}, got {}",
                    shown_param(&recorded[i].0, &recorded[i].1),
                    shown_param(&wanted[i].0, &wanted[i].1)
                ));
            }
        }
        for name in PINNED_HEADERS {
            let (recorded, got) = (
                header(&exchange.headers, name),
                header(&request.headers, name),
            );
            // The recorder stores a secret header as the bare word `REDACTED` (the real value is
            // never written to a fixture), so a request carrying any value in that header is the
            // recorded twin; a request without it, or with it empty, is still drift.
            let redacted_twin = HIDDEN_HEADERS.contains(&name)
                && recorded == Some(REDACTED)
                && got.is_some_and(|v| !v.is_empty());
            if recorded != got && !redacted_twin {
                if HIDDEN_HEADERS.contains(&name) {
                    diffs.push(format!("header {name} differs"));
                } else {
                    diffs.push(format!(
                        "header {name}: recorded {:?}, got {:?}",
                        recorded.unwrap_or("<absent>"),
                        got.unwrap_or("<absent>")
                    ));
                }
            }
        }
        let nonempty = |b: &Option<Vec<u8>>| b.clone().filter(|b| !b.is_empty());
        let (recorded, got) = (nonempty(&exchange.body), nonempty(&request.body));
        if recorded != got {
            diffs.push(format!(
                "body differs (recorded {} byte(s), got {})",
                recorded.map_or(0, |b| b.len()),
                got.map_or(0, |b| b.len())
            ));
        }
        diffs
    }
}
