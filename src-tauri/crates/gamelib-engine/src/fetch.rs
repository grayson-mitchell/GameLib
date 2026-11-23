//! The one network seam of the engine and wine domain crates (D-08): JSON GETs and streamed
//! downloads to a file, with progress and cancel. [`ReqwestFetch`] is the real implementation,
//! `Replay` (feature `testing`) serves a recorded TypeScript run and pins every request to the one
//! the TS made (method, URL and the pinned headers, the GameLib `User-Agent` among them).
//!
//! A URL can carry a key in its query, so nothing here puts a URL into an error, a `Debug` output
//! or a log line: [`FetchError`] is a category and nothing else, and a `reqwest::Error` is only ever
//! looked at after `.without_url()`.
//!
//! The behaviour is the TS `downloadFile` (`src/backend/utils.ts`): a HEAD for the length first
//! (a failed one is `failed-to-get-headers`), then the body, progress at most once a second, a
//! cancel that stops the transfer. The TS used five connections; this uses one (research A8).

use std::fmt;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use futures_util::{Stream, StreamExt};
use gamelib_core::clock::{Clock, SystemClock};
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;

/// A boxed, sendable future that may borrow from its caller (a download borrows its destination
/// and its progress callback).
pub type FetchFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Every GameLib request carries this `User-Agent`. It is REQUIRED, not cosmetic: the TS axios
/// client sets it for the same reason (GitHub answers an anonymous agent with 403 on a busy day),
/// and `Replay` pins it, so a Rust request that forgets it fails its golden. The version is the
/// app's own (`EngineCtx::app_version`), the rest is fixed here, once.
pub const USER_AGENT_PREFIX: &str = "GameLib/";
/// The fixed tail of the GameLib `User-Agent` (see [`USER_AGENT_PREFIX`]).
pub const USER_AGENT_SUFFIX: &str = "(+https://github.com/grayson-mitchell/GameLib)";

/// The GameLib `User-Agent` for `app_version`: `GameLib/<version> (+https://github.com/...)`.
pub fn user_agent(app_version: &str) -> String {
    format!("{USER_AGENT_PREFIX}{app_version} {USER_AGENT_SUFFIX}")
}

/// The longest body a [`Fetch::get`] reads. A release feed is a few hundred KB; a download is not
/// held in memory at all.
pub const MAX_GET_BODY: usize = 16 * 1024 * 1024;
/// How long a [`Fetch::get`] with no timeout of its own may take, connect and body together.
pub const DEFAULT_GET_TIMEOUT: Duration = Duration::from_secs(60);
/// The longest a download waits for the next chunk before it gives up (`network`).
pub const DOWNLOAD_IDLE_LIMIT: Duration = Duration::from_secs(60);
/// The least time between two progress reports (the TS throttle, `1000` ms).
pub const PROGRESS_INTERVAL_MS: u64 = 1000;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Method {
    Get,
    Head,
}

impl Method {
    pub fn as_str(self) -> &'static str {
        match self {
            Method::Get => "GET",
            Method::Head => "HEAD",
        }
    }
}

/// One request. Build the URL whole (reqwest's `.query()` encodes differently from axios, so its
/// feature is off); the headers are the ones the TS client sends.
#[derive(Clone)]
pub struct FetchRequest {
    pub method: Method,
    pub url: String,
    pub headers: Vec<(String, String)>,
    /// `None`: a get uses [`DEFAULT_GET_TIMEOUT`], a download has no overall limit (it has the idle
    /// limit and the cancel token).
    pub timeout: Option<Duration>,
}

impl FetchRequest {
    pub fn new(method: Method, url: impl Into<String>) -> FetchRequest {
        FetchRequest {
            method,
            url: url.into(),
            headers: Vec::new(),
            timeout: None,
        }
    }

    pub fn get(url: impl Into<String>) -> FetchRequest {
        FetchRequest::new(Method::Get, url)
    }

    pub fn head(url: impl Into<String>) -> FetchRequest {
        FetchRequest::new(Method::Head, url)
    }

    pub fn header(mut self, name: &str, value: &str) -> FetchRequest {
        self.headers.push((name.to_string(), value.to_string()));
        self
    }

    pub fn timeout(mut self, timeout: Duration) -> FetchRequest {
        self.timeout = Some(timeout);
        self
    }

    /// Adds the GameLib `User-Agent` for `app_version` ([`user_agent`]).
    pub fn gamelib_agent(self, app_version: &str) -> FetchRequest {
        self.header("User-Agent", &user_agent(app_version))
    }
}

impl fmt::Debug for FetchRequest {
    /// No query, no header values: any of them can hold a key.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let url = self.url.split(['?', '#']).next().unwrap_or_default();
        f.debug_struct("FetchRequest")
            .field("method", &self.method)
            .field("url", &url)
            .finish_non_exhaustive()
    }
}

/// A response to [`Fetch::get`]. Any HTTP status is a response; [`FetchResponse::error_for_status`]
/// is the axios behaviour (a non-2xx throws) for the callers that want it.
#[derive(Clone, PartialEq, Eq)]
pub struct FetchResponse {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl FetchResponse {
    /// `Ok(self)` for a 2xx, otherwise `status(<n>)`.
    pub fn error_for_status(self) -> Result<FetchResponse, FetchError> {
        if (200..300).contains(&self.status) {
            Ok(self)
        } else {
            Err(FetchError::Status(self.status))
        }
    }
}

impl fmt::Debug for FetchResponse {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("FetchResponse")
            .field("status", &self.status)
            .field("body_len", &self.body.len())
            .finish_non_exhaustive()
    }
}

/// Why a fetch produced nothing. A category and nothing else: never a URL, a query, a header or a
/// transport message (T-87-09). The `Display` text is the stable, loggable name.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FetchError {
    /// The request did not complete: DNS, connect, TLS, a reset, a timeout, a body cut short.
    Network,
    /// The server answered with this HTTP status (a download or [`FetchResponse::error_for_status`]).
    Status(u16),
    /// The HEAD before a download failed (the TS `'Failed to get headers'`).
    FailedToGetHeaders,
    /// The cancel token fired (the TS `'Download stopped or paused'`).
    Aborted,
    /// A get's body passed [`MAX_GET_BODY`].
    TooLarge,
    /// The destination file could not be written.
    Io,
}

impl fmt::Display for FetchError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FetchError::Network => f.write_str("network"),
            FetchError::Status(n) => write!(f, "status({n})"),
            FetchError::FailedToGetHeaders => f.write_str("failed-to-get-headers"),
            FetchError::Aborted => f.write_str("aborted"),
            FetchError::TooLarge => f.write_str("too-large"),
            FetchError::Io => f.write_str("io"),
        }
    }
}

impl std::error::Error for FetchError {}

/// One progress report: bytes so far, the total (`0` when the server gave no length) and the
/// percentage (`0.0` when there is no total, `100.0` on the final report).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Progress {
    pub bytes: u64,
    pub total: u64,
    pub percentage: f64,
}

/// A finished download: the bytes written and the SHA-256 (lowercase hex) of them, hashed while
/// they streamed to disk.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DownloadOutcome {
    pub bytes: u64,
    pub sha256: String,
}

/// The network seam. `ctx.fetch` is a [`ReqwestFetch`] in the app and a `Replay` in the golden tests.
pub trait Fetch: Send + Sync + 'static {
    /// One request, its whole body read (at most [`MAX_GET_BODY`]).
    fn get(&self, req: FetchRequest) -> FetchFuture<'_, Result<FetchResponse, FetchError>>;

    /// `req` streamed to `dest`. The body goes to `<dest>.part` and is renamed over `dest` once
    /// complete, so `dest` is never half written; on any failure, and on cancel, the partial file is
    /// removed. `progress` is called at most once a second (by the injected clock) and once more with
    /// 100% at the end. A failed HEAD is `failed-to-get-headers`, a cancel is `aborted`.
    fn download<'a>(
        &'a self,
        req: FetchRequest,
        dest: &'a Path,
        progress: &'a (dyn Fn(Progress) + Send + Sync),
        cancel: CancellationToken,
    ) -> FetchFuture<'a, Result<DownloadOutcome, FetchError>>;
}

/// Installs the process-wide rustls provider (ring), as `gamelib-info` and `gamelib-steamcm` do.
/// Idempotent: an already installed provider is not an error.
pub fn install_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

/// A `reqwest::Error` as a category. `.without_url()` first: the error's own text names the URL,
/// and a URL can hold a key. Nothing of it is kept.
fn classify(error: reqwest::Error) -> FetchError {
    let error = error.without_url();
    match error.status() {
        Some(status) => FetchError::Status(status.as_u16()),
        None => FetchError::Network,
    }
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

/// `<dest>.part`: where a download streams to before it is renamed over `dest`.
fn part_path(dest: &Path) -> PathBuf {
    let mut name = dest.file_name().unwrap_or_default().to_os_string();
    name.push(".part");
    dest.with_file_name(name)
}

fn percentage(bytes: u64, total: u64) -> f64 {
    if total == 0 {
        0.0
    } else {
        (bytes as f64) * 100.0 / (total as f64)
    }
}

/// Streams `body` into `dest`: the shared half of every [`Fetch::download`]. A body that ends short
/// of `total` (when the server gave one) is `network`, as a cut connection is.
async fn write_body<S, B>(
    mut body: S,
    total: u64,
    dest: &Path,
    progress: &(dyn Fn(Progress) + Send + Sync),
    cancel: &CancellationToken,
    clock: &dyn Clock,
) -> Result<DownloadOutcome, FetchError>
where
    S: Stream<Item = Result<B, FetchError>> + Unpin,
    B: AsRef<[u8]>,
{
    if cancel.is_cancelled() {
        return Err(FetchError::Aborted);
    }
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|_| FetchError::Io)?;
    }
    let part = part_path(dest);
    let streamed = stream_into(&mut body, total, &part, progress, cancel, clock).await;
    let outcome = match streamed {
        Ok(outcome) => outcome,
        Err(error) => {
            let _ = tokio::fs::remove_file(&part).await;
            return Err(error);
        }
    };
    if tokio::fs::rename(&part, dest).await.is_err() {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(FetchError::Io);
    }
    Ok(outcome)
}

async fn stream_into<S, B>(
    body: &mut S,
    total: u64,
    part: &Path,
    progress: &(dyn Fn(Progress) + Send + Sync),
    cancel: &CancellationToken,
    clock: &dyn Clock,
) -> Result<DownloadOutcome, FetchError>
where
    S: Stream<Item = Result<B, FetchError>> + Unpin,
    B: AsRef<[u8]>,
{
    let mut file = tokio::fs::File::create(part)
        .await
        .map_err(|_| FetchError::Io)?;
    let mut hasher = Sha256::new();
    let mut bytes = 0u64;
    let mut last_report = clock.now_ms();
    loop {
        let next = tokio::select! {
            biased;
            _ = cancel.cancelled() => return Err(FetchError::Aborted),
            next = tokio::time::timeout(DOWNLOAD_IDLE_LIMIT, body.next()) => next,
        };
        let Ok(next) = next else {
            return Err(FetchError::Network);
        };
        let Some(chunk) = next else {
            break;
        };
        let chunk = chunk?;
        let chunk = chunk.as_ref();
        file.write_all(chunk).await.map_err(|_| FetchError::Io)?;
        hasher.update(chunk);
        bytes += chunk.len() as u64;
        let now = clock.now_ms();
        if now.saturating_sub(last_report) >= PROGRESS_INTERVAL_MS {
            last_report = now;
            progress(Progress {
                bytes,
                total,
                percentage: percentage(bytes, total),
            });
        }
    }
    file.flush().await.map_err(|_| FetchError::Io)?;
    drop(file);
    if total > 0 && bytes != total {
        return Err(FetchError::Network);
    }
    progress(Progress {
        bytes,
        total,
        percentage: 100.0,
    });
    Ok(DownloadOutcome {
        bytes,
        sha256: hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect(),
    })
}

/// The `Content-Length` of a response's headers, `0` when absent or not a number.
fn header_length(headers: &reqwest::header::HeaderMap) -> u64 {
    headers
        .get(reqwest::header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or(0)
}

/// The reqwest-backed [`Fetch`]: one client, built on first use after the rustls provider is
/// installed (a client built earlier would have no provider), at most five redirects as axios does,
/// a single connection per download.
pub struct ReqwestFetch {
    client: OnceLock<Result<reqwest::Client, FetchError>>,
    clock: Arc<dyn Clock>,
}

impl ReqwestFetch {
    pub fn new() -> ReqwestFetch {
        ReqwestFetch::with_clock(Arc::new(SystemClock))
    }

    /// The clock the progress throttle reads.
    pub fn with_clock(clock: Arc<dyn Clock>) -> ReqwestFetch {
        ReqwestFetch {
            client: OnceLock::new(),
            clock,
        }
    }

    fn client(&self) -> Result<&reqwest::Client, FetchError> {
        self.client
            .get_or_init(|| {
                install_crypto_provider();
                reqwest::Client::builder()
                    .redirect(reqwest::redirect::Policy::limited(5))
                    .connect_timeout(CONNECT_TIMEOUT)
                    .build()
                    .map_err(classify)
            })
            .as_ref()
            .map_err(|e| *e)
    }

    fn builder(&self, req: &FetchRequest) -> Result<reqwest::RequestBuilder, FetchError> {
        let method = match req.method {
            Method::Get => reqwest::Method::GET,
            Method::Head => reqwest::Method::HEAD,
        };
        let mut builder = self.client()?.request(method, req.url.as_str());
        for (name, value) in &req.headers {
            builder = builder.header(name.as_str(), value.as_str());
        }
        Ok(builder)
    }
}

impl Default for ReqwestFetch {
    fn default() -> Self {
        ReqwestFetch::new()
    }
}

impl Fetch for ReqwestFetch {
    fn get(&self, req: FetchRequest) -> FetchFuture<'_, Result<FetchResponse, FetchError>> {
        Box::pin(async move {
            let limit = req.timeout.unwrap_or(DEFAULT_GET_TIMEOUT);
            let builder = self.builder(&req)?.timeout(limit);
            let mut response = builder.send().await.map_err(classify)?;
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
            if req.method == Method::Get && header_length(response.headers()) > MAX_GET_BODY as u64
            {
                return Err(FetchError::TooLarge);
            }
            let mut body: Vec<u8> = Vec::new();
            while let Some(chunk) = response.chunk().await.map_err(classify)? {
                if body.len().saturating_add(chunk.len()) > MAX_GET_BODY {
                    return Err(FetchError::TooLarge);
                }
                body.extend_from_slice(&chunk);
            }
            Ok(FetchResponse {
                status,
                headers,
                body,
            })
        })
    }

    fn download<'a>(
        &'a self,
        req: FetchRequest,
        dest: &'a Path,
        progress: &'a (dyn Fn(Progress) + Send + Sync),
        cancel: CancellationToken,
    ) -> FetchFuture<'a, Result<DownloadOutcome, FetchError>> {
        Box::pin(async move {
            if cancel.is_cancelled() {
                return Err(FetchError::Aborted);
            }
            // The HEAD first, for the length: any failure of it, a 404 included, is the TS's
            // 'Failed to get headers'.
            let head = FetchRequest {
                method: Method::Head,
                ..req.clone()
            };
            let head_response = tokio::select! {
                biased;
                _ = cancel.cancelled() => return Err(FetchError::Aborted),
                sent = self
                    .builder(&head)?
                    .timeout(head.timeout.unwrap_or(DEFAULT_GET_TIMEOUT))
                    .send() => sent,
            };
            let head_length = match head_response {
                Ok(r) if is_success(r.status().as_u16()) => header_length(r.headers()),
                _ => return Err(FetchError::FailedToGetHeaders),
            };
            let get = FetchRequest {
                method: Method::Get,
                ..req
            };
            let response = tokio::select! {
                biased;
                _ = cancel.cancelled() => return Err(FetchError::Aborted),
                sent = self.builder(&get)?.send() => sent.map_err(classify)?,
            };
            let status = response.status().as_u16();
            if !is_success(status) {
                return Err(FetchError::Status(status));
            }
            let total = match header_length(response.headers()) {
                0 => head_length,
                n => n,
            };
            let body = Box::pin(response.bytes_stream().map(|r| r.map_err(classify)));
            write_body(body, total, dest, progress, &cancel, &*self.clock).await
        })
    }
}

#[cfg(feature = "testing")]
pub use replay::Replay;

/// A recorded case served as a [`Fetch`], for the golden tests and the CLI's `--replay`.
#[cfg(feature = "testing")]
mod replay {
    use std::path::{Component, Path};
    use std::sync::{Arc, Mutex, MutexGuard};

    use futures_util::stream;
    use gamelib_core::clock::{Clock, SystemClock};
    use serde_json::Value;
    use tokio_util::sync::CancellationToken;
    use url::Url;

    use super::{
        is_success, write_body, DownloadOutcome, Fetch, FetchError, FetchFuture, FetchRequest,
        FetchResponse, Method, Progress,
    };

    /// The request headers a recorded request pins (D-10), as `gamelib-info`'s `Replay` pins them.
    /// Transport headers (`Accept-Encoding`, `Connection`, `Host`, `Content-Length`) are left out:
    /// axios and reqwest add them differently and servers decode them the same.
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

    /// The chunk size a replayed download body is delivered in unless a test sets one.
    const DEFAULT_CHUNK: usize = 64 * 1024;

    struct Exchange {
        id: String,
        method: String,
        url: Url,
        headers: Vec<(String, String)>,
        status: u16,
        response_headers: Vec<(String, String)>,
        response_body: Vec<u8>,
        ts_only: bool,
        /// A request only Rust makes (D-23): a request that matches it and an older twin is served
        /// by this one first, so the exchange the TS also made stays left over as `tsOnly`.
        rust_only: bool,
        /// The recorded call produced no response: matched and consumed like any other, then it
        /// fails as a transport error.
        network_error: bool,
        consumed: bool,
    }

    #[derive(Default)]
    struct State {
        exchanges: Vec<Exchange>,
        ts_only_ids: Vec<String>,
        failures: Vec<String>,
    }

    /// What a matched exchange answers.
    struct Served {
        status: u16,
        headers: Vec<(String, String)>,
        body: Vec<u8>,
    }

    /// Serves recorded exchanges and pins each request to its recorded twin: method, scheme, host and
    /// path, the decoded query pairs in order and the pinned headers, in both directions (a pinned
    /// header the recording lacks is drift too). A request with no twin, or one that differs, fails
    /// naming the request (key-like query values and secret headers are never printed). The first
    /// failure is sticky: [`Replay::finish`] reports it even if the caller swallowed the error. An
    /// exchange a request matched is consumed; [`Replay::finish`] also fails on any exchange left over
    /// unless it is `tsOnly` (the TS makes the request and Rust will not).
    ///
    /// A download makes a HEAD only when the case recorded one for that URL (the TS recordings of a
    /// download are a GET), then the GET, whose body is delivered in chunks of
    /// [`Replay::with_chunk_size`] through the same writer [`super::ReqwestFetch`] uses.
    pub struct Replay {
        state: Mutex<State>,
        clock: Arc<dyn Clock>,
        chunk: usize,
    }

    fn lock(state: &Mutex<State>) -> MutexGuard<'_, State> {
        state.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn headers_of(value: &Value) -> Result<Vec<(String, String)>, String> {
        let text = |v: &Value| match v {
            Value::String(s) => Ok(s.clone()),
            Value::Number(n) => Ok(n.to_string()),
            Value::Bool(b) => Ok(b.to_string()),
            _ => Err("a header value must be a string, number or bool".to_string()),
        };
        match value {
            Value::Null => Ok(Vec::new()),
            Value::Object(map) => map.iter().map(|(k, v)| Ok((k.clone(), text(v)?))).collect(),
            _ => Err("headers must be an object".to_string()),
        }
    }

    fn field<'a>(value: &'a Value, name: &str, id: &str) -> Result<&'a Value, String> {
        value
            .get(name)
            .ok_or_else(|| format!("exchange {id}: missing {name}"))
    }

    fn flag(item: &Value, name: &str) -> bool {
        item.get(name).and_then(Value::as_bool).unwrap_or(false)
    }

    impl Replay {
        /// Reads `<dir>/exchanges.json`: an ordered list of `{id, request: {method, url, headers},
        /// response: {status, headers, bodyFile?}, tsOnly?, rustOnly?, networkError?}`, with each
        /// response body in the named file beside it.
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
                    status,
                    response_headers: response
                        .get("headers")
                        .map(headers_of)
                        .transpose()
                        .map_err(|e| format!("exchange {id}: {e}"))?
                        .unwrap_or_default(),
                    response_body,
                    ts_only: flag(item, "tsOnly"),
                    rust_only: flag(item, "rustOnly"),
                    network_error: flag(item, "networkError"),
                    consumed: false,
                    id,
                });
            }
            Ok(Replay {
                state: Mutex::new(State {
                    exchanges,
                    ..State::default()
                }),
                clock: Arc::new(SystemClock),
                chunk: DEFAULT_CHUNK,
            })
        }

        /// The clock the progress throttle reads (a test's stepping clock).
        pub fn with_clock(mut self, clock: Arc<dyn Clock>) -> Replay {
            self.clock = clock;
            self
        }

        /// The size a replayed download body is delivered in (at least one byte).
        pub fn with_chunk_size(mut self, bytes: usize) -> Replay {
            self.chunk = bytes.max(1);
            self
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

        /// Whether the case holds an unconsumed exchange for `method` and the URL's path.
        fn has_free(&self, method: Method, url: &str) -> bool {
            let Ok(url) = Url::parse(url) else {
                return false;
            };
            lock(&self.state)
                .exchanges
                .iter()
                .any(|e| !e.consumed && e.method == method.as_str() && same_path(&e.url, &url))
        }

        fn serve(&self, request: &FetchRequest) -> Result<Served, FetchError> {
            let mut st = lock(&self.state);
            let fail = |st: &mut State, message: String| {
                st.failures.push(message);
                Err(FetchError::Network)
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
            let twin = |e: &Exchange| free(e) && query_matches(&pairs(&e.url), &wanted);
            let index = st
                .exchanges
                .iter()
                .position(|e| e.rust_only && twin(e))
                .or_else(|| st.exchanges.iter().position(twin))
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
            // The request was made and matched, so it is consumed whether or not its answer fits.
            exchange.consumed = true;
            if exchange.network_error {
                return Err(FetchError::Network);
            }
            Ok(Served {
                status: exchange.status,
                headers: exchange.response_headers.clone(),
                body: exchange.response_body.clone(),
            })
        }
    }

    impl Fetch for Replay {
        fn get(&self, req: FetchRequest) -> FetchFuture<'_, Result<FetchResponse, FetchError>> {
            Box::pin(async move {
                let served = self.serve(&req)?;
                Ok(FetchResponse {
                    status: served.status,
                    headers: served.headers,
                    body: served.body,
                })
            })
        }

        fn download<'a>(
            &'a self,
            req: FetchRequest,
            dest: &'a Path,
            progress: &'a (dyn Fn(Progress) + Send + Sync),
            cancel: CancellationToken,
        ) -> FetchFuture<'a, Result<DownloadOutcome, FetchError>> {
            Box::pin(async move {
                if cancel.is_cancelled() {
                    return Err(FetchError::Aborted);
                }
                if self.has_free(Method::Head, &req.url) {
                    let head = FetchRequest {
                        method: Method::Head,
                        ..req.clone()
                    };
                    match self.serve(&head) {
                        Ok(served) if is_success(served.status) => {}
                        _ => return Err(FetchError::FailedToGetHeaders),
                    }
                }
                let get = FetchRequest {
                    method: Method::Get,
                    ..req
                };
                let served = self.serve(&get)?;
                if !is_success(served.status) {
                    return Err(FetchError::Status(served.status));
                }
                let total = served.body.len() as u64;
                let chunks: Vec<Vec<u8>> =
                    served.body.chunks(self.chunk).map(<[u8]>::to_vec).collect();
                let body = stream::iter(chunks.into_iter().map(Ok::<_, FetchError>));
                write_body(body, total, dest, progress, &cancel, &*self.clock).await
            })
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

    /// Whether a request's decoded query pairs are the recorded ones. A key-like parameter the
    /// recorder stored as the bare word `REDACTED` matches any non-empty value, as a pinned secret
    /// header does: the real value is never written to a fixture.
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
        request: &FetchRequest,
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
            // The recorder stores a secret header as the bare word `REDACTED`, so a request carrying
            // any value in that header is the recorded twin; one without it, or with it empty, is
            // still drift.
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
        diffs
    }
}
