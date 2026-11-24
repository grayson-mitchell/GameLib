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
//! cancel that stops the transfer. The TS handed the transfer to EasyDl: a download whose HEAD
//! advertises byte ranges (`Accept-Ranges: bytes`) and a length arrives in EasyDl's ranges over at
//! most five connections ([`DOWNLOAD_CONNECTIONS`], [`plan_ranges`]); anything else is the single
//! stream (quick 261123-txk).

use std::fmt;
use std::future::Future;
use std::io::SeekFrom;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use futures_util::{stream, Stream, StreamExt};
use gamelib_core::clock::{Clock, SystemClock};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
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
/// The most ranged GETs one download has in flight at once (EasyDl's `connections`).
pub const DOWNLOAD_CONNECTIONS: usize = 5;
/// The cap in EasyDl's default chunk size, `min(size / 10, 10 MiB)`.
pub const RANGE_CHUNK_MAX: u64 = 10 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Method {
    Get,
    Head,
    Post,
}

impl Method {
    pub fn as_str(self) -> &'static str {
        match self {
            Method::Get => "GET",
            Method::Head => "HEAD",
            Method::Post => "POST",
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
    /// The request body of a [`Method::Post`]; `None` for a request that carries none. The caller sets
    /// the `Content-Type` header, the seam adds nothing.
    pub body: Option<Vec<u8>>,
    /// Whether a 3xx answer is followed (at most five hops, as axios does). `false` makes the 3xx
    /// come back as the response ([`FetchRequest::no_redirects`], axios `maxRedirects: 0`).
    pub follow_redirects: bool,
}

impl FetchRequest {
    pub fn new(method: Method, url: impl Into<String>) -> FetchRequest {
        FetchRequest {
            method,
            url: url.into(),
            headers: Vec::new(),
            timeout: None,
            body: None,
            follow_redirects: true,
        }
    }

    pub fn get(url: impl Into<String>) -> FetchRequest {
        FetchRequest::new(Method::Get, url)
    }

    pub fn head(url: impl Into<String>) -> FetchRequest {
        FetchRequest::new(Method::Head, url)
    }

    /// A POST of `body`. Set the `Content-Type` with [`FetchRequest::header`].
    pub fn post(url: impl Into<String>, body: impl Into<Vec<u8>>) -> FetchRequest {
        FetchRequest {
            body: Some(body.into()),
            ..FetchRequest::new(Method::Post, url)
        }
    }

    /// A 3xx answer is returned as it is, not followed.
    pub fn no_redirects(mut self) -> FetchRequest {
        self.follow_redirects = false;
        self
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
    /// 100% at the end. A failed HEAD is `failed-to-get-headers`, a cancel is `aborted`. The sha256
    /// is over the whole joined file whether it arrived on one stream or in ranges.
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

/// EasyDl's `_calcRanges` with its default chunk size: inclusive `(start, end)` byte ranges that
/// cover `0..size`, at least [`DOWNLOAD_CONNECTIONS`] of them. The chunk is `min(size / 10,
/// RANGE_CHUNK_MAX)`; the last range is the remainder, and when it is under half a chunk, half of
/// the shortfall moves into it from the range before. `None` for a file under 10 bytes, where the
/// chunk is 0 (EasyDl divides by zero there).
pub fn plan_ranges(size: u64) -> Option<Vec<(u64, u64)>> {
    let chunk = (size / 10).min(RANGE_CHUNK_MAX);
    if chunk == 0 {
        return None;
    }
    let count = size.div_ceil(chunk);
    let mut lengths: Vec<u64> = (0..count)
        .map(|i| {
            if i + 1 < count {
                chunk
            } else {
                size - chunk * (count - 1)
            }
        })
        .collect();
    let last = lengths[lengths.len() - 1];
    if count > 1 && 2 * last < chunk {
        let shift = (chunk - 2 * last) / 2;
        let before = lengths.len() - 2;
        lengths[before] -= shift;
        let end = lengths.len() - 1;
        lengths[end] += shift;
    }
    let mut start = 0u64;
    Some(
        lengths
            .into_iter()
            .map(|length| {
                let range = (start, start + length - 1);
                start += length;
                range
            })
            .collect(),
    )
}

/// Whether a HEAD's `Accept-Ranges` value is `bytes` (EasyDl's own condition, case-insensitive and
/// trimmed here because a header value is not).
fn accepts_ranges(value: Option<&str>) -> bool {
    value.is_some_and(|v| v.trim().eq_ignore_ascii_case("bytes"))
}

/// The range plan a download takes, or `None` for the single stream: the HEAD must advertise
/// `Accept-Ranges: bytes` and a non-zero length that [`plan_ranges`] can split.
fn ranged_plan(head_length: u64, accept_ranges: Option<&str>) -> Option<Vec<(u64, u64)>> {
    if head_length > 0 && accepts_ranges(accept_ranges) {
        plan_ranges(head_length)
    } else {
        None
    }
}

/// A response body as owned chunks (`Vec<u8>`: `bytes` is not a direct dependency).
type ChunkStream = Pin<Box<dyn Stream<Item = Result<Vec<u8>, FetchError>> + Send>>;

/// An opened GET: its status line and the headers the ranged download reads, and its body.
struct Opened {
    status: u16,
    /// `Content-Length`, `0` when absent.
    length: u64,
    content_range: Option<String>,
    body: ChunkStream,
}

/// Opens one GET. [`ReqwestFetch`] and `Replay` both implement it, so the ranged download below is
/// the one engine the goldens exercise and the app runs.
trait OpenGet: Send + Sync {
    fn open(&self, req: FetchRequest) -> FetchFuture<'_, Result<Opened, FetchError>>;
}

/// What opening a range found.
enum Opening {
    /// A 206 whose `Content-Range` is the range asked for.
    Range(Opened),
    /// A 200: the server ignored `Range`.
    Whole(Opened),
}

/// Why a range stopped the transfer. Crate-private on purpose: [`FetchError`] is matched by every
/// caller and gains no variant for this.
enum RangeStop {
    Fail(FetchError),
    /// A later range was answered 200: drop the ranges and stream the file once.
    Whole,
}

impl From<FetchError> for RangeStop {
    fn from(error: FetchError) -> RangeStop {
        RangeStop::Fail(error)
    }
}

/// Whether `text` is the `Content-Range` `bytes <start>-<end>/<total>`.
fn content_range_is(text: &str, start: u64, end: u64, total: u64) -> bool {
    let Some((unit, spec)) = text.trim().split_once(char::is_whitespace) else {
        return false;
    };
    let Some((span, size)) = spec.trim().split_once('/') else {
        return false;
    };
    let Some((first, last)) = span.split_once('-') else {
        return false;
    };
    let number = |s: &str| s.trim().parse::<u64>().ok();
    unit.eq_ignore_ascii_case("bytes")
        && number(first) == Some(start)
        && number(last) == Some(end)
        && number(size) == Some(total)
}

/// Opens `req`, cancel first and bounded by [`DOWNLOAD_IDLE_LIMIT`].
async fn open_bounded(
    opener: &dyn OpenGet,
    req: FetchRequest,
    cancel: &CancellationToken,
) -> Result<Opened, FetchError> {
    let opened = tokio::select! {
        biased;
        _ = cancel.cancelled() => return Err(FetchError::Aborted),
        opened = tokio::time::timeout(DOWNLOAD_IDLE_LIMIT, opener.open(req)) => opened,
    };
    opened.map_err(|_| FetchError::Network)?
}

/// Opens `req` for `range` (to the request's own URL, so each range follows any redirect itself:
/// a signed redirect target can expire) and checks the answer against it and the HEAD length.
async fn open_range(
    opener: &dyn OpenGet,
    req: &FetchRequest,
    (start, end): (u64, u64),
    head_length: u64,
    cancel: &CancellationToken,
) -> Result<Opening, FetchError> {
    let mut ranged = FetchRequest {
        method: Method::Get,
        ..req.clone()
    };
    ranged
        .headers
        .push(("Range".to_string(), format!("bytes={start}-{end}")));
    let opened = open_bounded(opener, ranged, cancel).await?;
    match opened.status {
        206 => {
            let matches = opened
                .content_range
                .as_deref()
                .is_some_and(|c| content_range_is(c, start, end, head_length));
            if matches {
                Ok(Opening::Range(opened))
            } else {
                // The wrong range, or a file that changed since the HEAD.
                Err(FetchError::Network)
            }
        }
        200 => Ok(Opening::Whole(opened)),
        status if !is_success(status) => Err(FetchError::Status(status)),
        _ => Err(FetchError::Network),
    }
}

/// The progress state the ranges share.
struct Shared {
    bytes: u64,
    last_report: u64,
}

/// What every range of one download needs. All borrows, so it is `Copy`: a range is a future the
/// download's own future polls (never a spawned task), and so it cannot outlive the download.
#[derive(Clone, Copy)]
struct RangeJob<'a> {
    opener: &'a dyn OpenGet,
    req: &'a FetchRequest,
    head_length: u64,
    part: &'a Path,
    shared: &'a Mutex<Shared>,
    progress: &'a (dyn Fn(Progress) + Send + Sync),
    cancel: &'a CancellationToken,
    clock: &'a dyn Clock,
}

impl RangeJob<'_> {
    /// One range: its body (`pre`, the already open probe, or a fresh GET) written at its offset.
    async fn run(self, range: (u64, u64), pre: Option<Opened>) -> Result<(), RangeStop> {
        let opened = match pre {
            Some(opened) => opened,
            None => {
                match open_range(self.opener, self.req, range, self.head_length, self.cancel)
                    .await?
                {
                    Opening::Range(opened) => opened,
                    Opening::Whole(_) => return Err(RangeStop::Whole),
                }
            }
        };
        self.write(opened.body, range)
            .await
            .map_err(RangeStop::Fail)
    }

    /// Writes `body` at `start` in `.part`: cancel first, [`DOWNLOAD_IDLE_LIMIT`] per chunk. A body
    /// longer or shorter than its range is `network`.
    async fn write(
        &self,
        mut body: ChunkStream,
        (start, end): (u64, u64),
    ) -> Result<(), FetchError> {
        let expected = end - start + 1;
        let mut file = tokio::fs::OpenOptions::new()
            .write(true)
            .open(self.part)
            .await
            .map_err(|_| FetchError::Io)?;
        file.seek(SeekFrom::Start(start))
            .await
            .map_err(|_| FetchError::Io)?;
        let mut written = 0u64;
        loop {
            let next = tokio::select! {
                biased;
                _ = self.cancel.cancelled() => return Err(FetchError::Aborted),
                next = tokio::time::timeout(DOWNLOAD_IDLE_LIMIT, body.next()) => next,
            };
            let Ok(next) = next else {
                return Err(FetchError::Network);
            };
            let Some(chunk) = next else {
                break;
            };
            let chunk = chunk?;
            written += chunk.len() as u64;
            if written > expected {
                return Err(FetchError::Network);
            }
            file.write_all(&chunk).await.map_err(|_| FetchError::Io)?;
            self.report(chunk.len() as u64);
        }
        file.flush().await.map_err(|_| FetchError::Io)?;
        if written != expected {
            return Err(FetchError::Network);
        }
        Ok(())
    }

    /// Adds `added` bytes and reports at most once per [`PROGRESS_INTERVAL_MS`]. The report is made
    /// under the lock, so reports never go backwards, and none fires once the token is cancelled.
    fn report(&self, added: u64) {
        let mut shared = self.shared.lock().unwrap_or_else(|e| e.into_inner());
        shared.bytes += added;
        let now = self.clock.now_ms();
        if now.saturating_sub(shared.last_report) >= PROGRESS_INTERVAL_MS
            && !self.cancel.is_cancelled()
        {
            shared.last_report = now;
            (self.progress)(Progress {
                bytes: shared.bytes,
                total: self.head_length,
                percentage: percentage(shared.bytes, self.head_length),
            });
        }
    }
}

/// The SHA-256 (lowercase hex) of the file at `path`, read in blocks with the token checked between.
async fn hash_file(path: &Path, cancel: &CancellationToken) -> Result<String, FetchError> {
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|_| FetchError::Io)?;
    let mut hasher = Sha256::new();
    let mut block = vec![0u8; 1024 * 1024];
    loop {
        if cancel.is_cancelled() {
            return Err(FetchError::Aborted);
        }
        let read = file.read(&mut block).await.map_err(|_| FetchError::Io)?;
        if read == 0 {
            break;
        }
        hasher.update(&block[..read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

/// The ranged transfer proper: size `.part`, fetch every range over at most
/// [`DOWNLOAD_CONNECTIONS`] connections, hash the joined file, report 100% and rename. Any error
/// leaves `.part` for the caller to remove.
async fn transfer(
    job: RangeJob<'_>,
    probe: Opened,
    plan: &[(u64, u64)],
    dest: &Path,
) -> Result<DownloadOutcome, RangeStop> {
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|_| FetchError::Io)?;
    }
    {
        let file = tokio::fs::File::create(job.part)
            .await
            .map_err(|_| FetchError::Io)?;
        file.set_len(job.head_length)
            .await
            .map_err(|_| FetchError::Io)?;
    }
    let mut probe = Some(probe);
    let mut ranges = Box::pin(
        stream::iter(plan.iter().copied().enumerate())
            .map(|(index, range)| job.run(range, if index == 0 { probe.take() } else { None }))
            .buffer_unordered(DOWNLOAD_CONNECTIONS),
    );
    let mut stop = None;
    while let Some(done) = ranges.next().await {
        if let Err(error) = done {
            stop = Some(error);
            break;
        }
    }
    // Dropping the stream drops every range still in flight, closing its handle and connection.
    drop(ranges);
    if let Some(stop) = stop {
        return Err(stop);
    }
    let sha256 = hash_file(job.part, job.cancel).await?;
    if job.cancel.is_cancelled() {
        return Err(FetchError::Aborted.into());
    }
    (job.progress)(Progress {
        bytes: job.head_length,
        total: job.head_length,
        percentage: 100.0,
    });
    tokio::fs::rename(job.part, dest)
        .await
        .map_err(|_| FetchError::Io)?;
    Ok(DownloadOutcome {
        bytes: job.head_length,
        sha256,
    })
}

/// A response streamed as the whole file (a server that answered a ranged GET with 200).
async fn stream_whole(
    opened: Opened,
    head_length: u64,
    dest: &Path,
    progress: &(dyn Fn(Progress) + Send + Sync),
    cancel: &CancellationToken,
    clock: &dyn Clock,
) -> Result<DownloadOutcome, FetchError> {
    let total = match opened.length {
        0 => head_length,
        n => n,
    };
    write_body(opened.body, total, dest, progress, cancel, clock).await
}

/// The ranged download (quick 261123-txk), shared by [`ReqwestFetch`] and `Replay`: EasyDl's ranges
/// over at most [`DOWNLOAD_CONNECTIONS`] GETs written at their offsets into `<dest>.part`, renamed
/// over `dest` once every range is in. The first range is opened alone as a probe: a 200 there is
/// the whole file, streamed as it is with no further request; a 200 to a later range drops every
/// range and streams one GET without a `Range` header. `req` is the GET (its URL and headers).
#[allow(clippy::too_many_arguments)]
async fn download_ranged(
    opener: &dyn OpenGet,
    req: FetchRequest,
    head_length: u64,
    plan: Vec<(u64, u64)>,
    dest: &Path,
    progress: &(dyn Fn(Progress) + Send + Sync),
    cancel: &CancellationToken,
    clock: &dyn Clock,
) -> Result<DownloadOutcome, FetchError> {
    let Some(first) = plan.first().copied() else {
        return Err(FetchError::Network);
    };
    let probe = match open_range(opener, &req, first, head_length, cancel).await? {
        Opening::Whole(opened) => {
            return stream_whole(opened, head_length, dest, progress, cancel, clock).await;
        }
        Opening::Range(opened) => opened,
    };
    let part = part_path(dest);
    let shared = Mutex::new(Shared {
        bytes: 0,
        last_report: clock.now_ms(),
    });
    let job = RangeJob {
        opener,
        req: &req,
        head_length,
        part: &part,
        shared: &shared,
        progress,
        cancel,
        clock,
    };
    let stop = match transfer(job, probe, &plan, dest).await {
        Ok(outcome) => return Ok(outcome),
        Err(stop) => stop,
    };
    let _ = tokio::fs::remove_file(&part).await;
    match stop {
        RangeStop::Fail(error) => Err(error),
        RangeStop::Whole => {
            let plain = FetchRequest {
                method: Method::Get,
                ..req
            };
            let opened = open_bounded(opener, plain, cancel).await?;
            if !is_success(opened.status) {
                return Err(FetchError::Status(opened.status));
            }
            stream_whole(opened, head_length, dest, progress, cancel, clock).await
        }
    }
}

/// The reqwest-backed [`Fetch`]: one client, built on first use after the rustls provider is
/// installed (a client built earlier would have no provider), at most five redirects as axios does.
/// A download whose HEAD advertises byte ranges and a length arrives in EasyDl's ranges over at most
/// five connections; anything else is the single stream (quick 261123-txk).
pub struct ReqwestFetch {
    client: OnceLock<Result<reqwest::Client, FetchError>>,
    /// The same client with redirects off, for a request that asks for [`FetchRequest::no_redirects`]
    /// (reqwest sets the redirect policy per client, not per request).
    plain_client: OnceLock<Result<reqwest::Client, FetchError>>,
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
            plain_client: OnceLock::new(),
            clock,
        }
    }

    fn client(&self, follow_redirects: bool) -> Result<&reqwest::Client, FetchError> {
        let (slot, policy) = if follow_redirects {
            (&self.client, reqwest::redirect::Policy::limited(5))
        } else {
            (&self.plain_client, reqwest::redirect::Policy::none())
        };
        slot.get_or_init(|| {
            install_crypto_provider();
            reqwest::Client::builder()
                .redirect(policy)
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
            Method::Post => reqwest::Method::POST,
        };
        let mut builder = self
            .client(req.follow_redirects)?
            .request(method, req.url.as_str());
        for (name, value) in &req.headers {
            builder = builder.header(name.as_str(), value.as_str());
        }
        if let Some(body) = &req.body {
            builder = builder.body(body.clone());
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
            if req.method != Method::Head && header_length(response.headers()) > MAX_GET_BODY as u64
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
            let (head_length, plan) = match head_response {
                Ok(r) if is_success(r.status().as_u16()) => {
                    let length = header_length(r.headers());
                    let accept = r
                        .headers()
                        .get(reqwest::header::ACCEPT_RANGES)
                        .and_then(|v| v.to_str().ok());
                    (length, ranged_plan(length, accept))
                }
                _ => return Err(FetchError::FailedToGetHeaders),
            };
            let get = FetchRequest {
                method: Method::Get,
                ..req
            };
            if let Some(plan) = plan {
                return download_ranged(
                    self,
                    get,
                    head_length,
                    plan,
                    dest,
                    progress,
                    &cancel,
                    &*self.clock,
                )
                .await;
            }
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

impl OpenGet for ReqwestFetch {
    fn open(&self, req: FetchRequest) -> FetchFuture<'_, Result<Opened, FetchError>> {
        Box::pin(async move {
            let response = self.builder(&req)?.send().await.map_err(classify)?;
            let status = response.status().as_u16();
            let length = header_length(response.headers());
            let content_range = response
                .headers()
                .get(reqwest::header::CONTENT_RANGE)
                .and_then(|v| v.to_str().ok())
                .map(str::to_string);
            let body: ChunkStream = Box::pin(
                response
                    .bytes_stream()
                    .map(|r| r.map(|b| b.to_vec()).map_err(classify)),
            );
            Ok(Opened {
                status,
                length,
                content_range,
                body,
            })
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
        accepts_ranges, download_ranged, is_success, plan_ranges, write_body, ChunkStream,
        DownloadOutcome, Fetch, FetchError, FetchFuture, FetchRequest, FetchResponse, Method,
        OpenGet, Opened, Progress,
    };

    /// The request headers a recorded request pins (D-10), as `gamelib-info`'s `Replay` pins them.
    /// Transport headers (`Accept-Encoding`, `Connection`, `Host`, `Content-Length`) are left out:
    /// axios and reqwest add them differently and servers decode them the same.
    const PINNED_HEADERS: [&str; 10] = [
        "user-agent",
        "authorization",
        "referer",
        "content-type",
        "x-auth-token",
        "x-hp-key",
        "x-hp-val",
        "accept-language",
        "x-gog-library-cert",
        "range",
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
        /// The recorded request body (a POST's), `None` for a request that carried none.
        body: Option<Vec<u8>>,
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
    /// [`Replay::with_chunk_size`] through the same writer [`super::ReqwestFetch`] uses. When the
    /// recorded HEAD advertises `accept-ranges: bytes` and a `content-length`, the download takes the
    /// ranged arm, the same engine the app runs (quick 261123-txk): each ranged GET is matched to the
    /// exchange recording the same `range` header, whatever order the parallel GETs arrive in, and
    /// `range` is one of the pinned headers, so drift in a range is reported like any other.
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

    /// The request body a recorded exchange holds: the text the oracle recorded (a JSON body is the text
    /// that was sent), or another JSON value in its compact form. Absent or `null` is no body.
    fn body_of(request: &Value) -> Option<Vec<u8>> {
        match request.get("body")? {
            Value::Null => None,
            Value::String(text) => Some(text.as_bytes().to_vec()),
            other => Some(other.to_string().into_bytes()),
        }
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
                    body: body_of(request),
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
            let wanted_range = header(&request.headers, "range");
            let twin = |e: &Exchange| {
                free(e)
                    && query_matches(&pairs(&e.url), &wanted)
                    && header(&e.headers, "range") == wanted_range
                    && e.body == request.body
            };
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
                let mut ranged = None;
                if self.has_free(Method::Head, &req.url) {
                    let head = FetchRequest {
                        method: Method::Head,
                        ..req.clone()
                    };
                    match self.serve(&head) {
                        Ok(served) if is_success(served.status) => {
                            let length = header(&served.headers, "content-length")
                                .and_then(|v| v.trim().parse::<u64>().ok())
                                .unwrap_or(0);
                            if length > 0
                                && accepts_ranges(header(&served.headers, "accept-ranges"))
                            {
                                ranged = plan_ranges(length).map(|plan| (length, plan));
                            }
                        }
                        _ => return Err(FetchError::FailedToGetHeaders),
                    }
                }
                let get = FetchRequest {
                    method: Method::Get,
                    ..req
                };
                if let Some((length, plan)) = ranged {
                    return download_ranged(
                        self,
                        get,
                        length,
                        plan,
                        dest,
                        progress,
                        &cancel,
                        &*self.clock,
                    )
                    .await;
                }
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

    impl OpenGet for Replay {
        fn open(&self, req: FetchRequest) -> FetchFuture<'_, Result<Opened, FetchError>> {
            Box::pin(async move {
                let served = self.serve(&req)?;
                let content_range = header(&served.headers, "content-range").map(str::to_string);
                let length = served.body.len() as u64;
                let chunks: Vec<Vec<u8>> =
                    served.body.chunks(self.chunk).map(<[u8]>::to_vec).collect();
                let body: ChunkStream =
                    Box::pin(stream::iter(chunks.into_iter().map(Ok::<_, FetchError>)));
                Ok(Opened {
                    status: served.status,
                    length,
                    content_range,
                    body,
                })
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
        // A body is pinned byte for byte, and never printed: it can hold an id or a key.
        if exchange.body != request.body {
            diffs.push(format!(
                "body differs (recorded {} byte(s), got {})",
                exchange.body.as_ref().map_or(0, Vec::len),
                request.body.as_ref().map_or(0, Vec::len)
            ));
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

#[cfg(test)]
mod tests {
    use super::*;

    fn lengths(plan: &[(u64, u64)]) -> Vec<u64> {
        plan.iter().map(|(a, b)| b - a + 1).collect()
    }

    #[test]
    fn two_hundred_bytes_is_ten_twenty_byte_ranges() {
        let plan = plan_ranges(200).expect("a plan");
        assert_eq!(plan.len(), 10);
        assert_eq!(plan[0], (0, 19));
        assert_eq!(plan[9], (180, 199));
        assert!(lengths(&plan).iter().all(|l| *l == 20));
    }

    #[test]
    fn five_thousand_bytes_is_ten_five_hundred_byte_ranges() {
        let plan = plan_ranges(5000).expect("a plan");
        assert_eq!(plan.len(), 10);
        assert!(lengths(&plan).iter().all(|l| *l == 500));
        assert_eq!(plan[9], (4500, 4999));
    }

    #[test]
    fn a_short_last_range_takes_half_the_shortfall_from_the_one_before() {
        let plan = plan_ranges(104_857_601).expect("a plan");
        assert_eq!(plan.len(), 11);
        assert_eq!(plan[9].0, 94_371_840);
        assert_eq!(plan[9].1 - plan[9].0 + 1, 5_242_881);
        assert_eq!(plan[10].1 - plan[10].0 + 1, 5_242_880);
        assert_eq!(plan[10].1, 104_857_600);
    }

    #[test]
    fn under_ten_bytes_has_no_plan() {
        assert_eq!(plan_ranges(9), None);
        assert_eq!(plan_ranges(0), None);
    }

    #[test]
    fn every_plan_is_contiguous_and_at_least_five_ranges() {
        let sizes = (10..=3000u64).chain([239_861_234]);
        for size in sizes {
            let plan = plan_ranges(size).expect("a plan");
            assert_eq!(plan[0].0, 0, "size {size}");
            assert_eq!(plan[plan.len() - 1].1, size - 1, "size {size}");
            for pair in plan.windows(2) {
                assert_eq!(pair[1].0, pair[0].1 + 1, "size {size}");
            }
            assert!(
                plan.iter().all(|(a, b)| b >= a),
                "size {size}: an empty range"
            );
            assert!(plan.len() >= DOWNLOAD_CONNECTIONS, "size {size}");
        }
    }

    #[test]
    fn accept_ranges_must_be_bytes() {
        assert!(accepts_ranges(Some("bytes")));
        assert!(accepts_ranges(Some(" Bytes ")));
        assert!(!accepts_ranges(Some("none")));
        assert!(!accepts_ranges(None));
    }

    #[test]
    fn a_range_plan_needs_a_length_and_accept_ranges() {
        assert!(ranged_plan(200, Some("bytes")).is_some());
        assert!(ranged_plan(0, Some("bytes")).is_none());
        assert!(ranged_plan(9, Some("bytes")).is_none());
        assert!(ranged_plan(200, None).is_none());
        assert!(ranged_plan(200, Some("none")).is_none());
    }

    // ---- POST and no-redirect (88-11) ----

    use std::net::SocketAddr;
    use tokio::net::TcpListener;

    /// One request a local server saw: the request line, the lower-cased headers and the body.
    #[derive(Debug, Clone)]
    struct Seen {
        line: String,
        headers: Vec<(String, String)>,
        body: Vec<u8>,
    }

    impl Seen {
        fn header(&self, name: &str) -> Option<&str> {
            self.headers
                .iter()
                .find(|(k, _)| k == name)
                .map(|(_, v)| v.as_str())
        }
    }

    /// A tiny HTTP/1.1 server on loopback: `/redirect` answers 302 to `/final`, `/final` answers 200
    /// `final`, anything else 200 `ok`. It records every request, bodies included.
    async fn local_server() -> (SocketAddr, Arc<Mutex<Vec<Seen>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let seen: Arc<Mutex<Vec<Seen>>> = Arc::default();
        let log = seen.clone();
        tokio::spawn(async move {
            loop {
                let Ok((mut stream, _)) = listener.accept().await else {
                    return;
                };
                let log = log.clone();
                tokio::spawn(async move {
                    let mut raw = Vec::new();
                    let mut buf = [0u8; 1024];
                    let head_end = loop {
                        if let Some(at) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
                            break at + 4;
                        }
                        match stream.read(&mut buf).await {
                            Ok(0) | Err(_) => return,
                            Ok(n) => raw.extend_from_slice(&buf[..n]),
                        }
                    };
                    let head = String::from_utf8_lossy(&raw[..head_end]).to_string();
                    let mut lines = head.lines();
                    let line = lines.next().unwrap_or_default().to_string();
                    let headers: Vec<(String, String)> = lines
                        .filter_map(|l| l.split_once(": "))
                        .map(|(k, v)| (k.to_ascii_lowercase(), v.to_string()))
                        .collect();
                    let length = headers
                        .iter()
                        .find(|(k, _)| k == "content-length")
                        .and_then(|(_, v)| v.parse::<usize>().ok())
                        .unwrap_or(0);
                    while raw.len() < head_end + length {
                        match stream.read(&mut buf).await {
                            Ok(0) | Err(_) => break,
                            Ok(n) => raw.extend_from_slice(&buf[..n]),
                        }
                    }
                    let body = raw[head_end..].to_vec();
                    let path = line.split(' ').nth(1).unwrap_or_default().to_string();
                    log.lock().unwrap().push(Seen {
                        line,
                        headers,
                        body,
                    });
                    let answer = match path.as_str() {
                        "/redirect" => "HTTP/1.1 302 Found\r\nLocation: /final\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string(),
                        "/final" => "HTTP/1.1 200 OK\r\nContent-Length: 5\r\nConnection: close\r\n\r\nfinal".to_string(),
                        _ => "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok".to_string(),
                    };
                    let _ = stream.write_all(answer.as_bytes()).await;
                    let _ = stream.shutdown().await;
                });
            }
        });
        (addr, seen)
    }

    #[test]
    fn a_new_request_has_no_body_and_follows_redirects() {
        let get = FetchRequest::get("https://a.test/x");
        assert!(get.body.is_none() && get.follow_redirects);
        let post = FetchRequest::post("https://a.test/x", "{}");
        assert_eq!(post.method, Method::Post);
        assert_eq!(post.method.as_str(), "POST");
        assert_eq!(post.body.as_deref(), Some(&b"{}"[..]));
        assert!(post.follow_redirects);
        assert!(!post.no_redirects().follow_redirects);
    }

    #[tokio::test]
    async fn a_post_sends_its_body_and_the_content_type_the_caller_set() {
        let (addr, seen) = local_server().await;
        let fetch = ReqwestFetch::new();
        let request = FetchRequest::post(format!("http://{addr}/echo"), r#"{"v":1}"#)
            .header("Content-Type", "application/json")
            .header("User-Agent", "GameLib/9.9.9");
        let response = fetch.get(request).await.unwrap();
        assert_eq!(
            (response.status, response.body.as_slice()),
            (200, &b"ok"[..])
        );
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].line, "POST /echo HTTP/1.1");
        assert_eq!(seen[0].body, br#"{"v":1}"#);
        assert_eq!(seen[0].header("content-type"), Some("application/json"));
        assert_eq!(seen[0].header("user-agent"), Some("GameLib/9.9.9"));
    }

    #[tokio::test]
    async fn a_redirect_is_followed_by_default_and_returned_as_the_3xx_with_no_redirects() {
        let (addr, seen) = local_server().await;
        let fetch = ReqwestFetch::new();
        let url = format!("http://{addr}/redirect");

        let followed = fetch.get(FetchRequest::get(&url)).await.unwrap();
        assert_eq!(
            (followed.status, followed.body.as_slice()),
            (200, &b"final"[..])
        );
        assert_eq!(seen.lock().unwrap().len(), 2);

        seen.lock().unwrap().clear();
        let stopped = fetch
            .get(FetchRequest::post(&url, "{}").no_redirects())
            .await
            .unwrap();
        assert_eq!(stopped.status, 302);
        assert!(stopped
            .headers
            .iter()
            .any(|(k, v)| k == "location" && v == "/final"));
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 1, "the 3xx was not followed");
        assert_eq!(seen[0].line, "POST /redirect HTTP/1.1");
    }

    #[cfg(feature = "testing")]
    mod replay_post {
        use super::*;

        const URL: &str = "https://relay.test/v1/reports";
        const BODY: &str = r#"{"v":1,"appId":"220"}"#;

        /// A case directory holding one recorded POST answered 201.
        fn case(dir: &std::path::Path, recorded_body: Option<&str>) {
            let mut request = serde_json::json!({
                "method": "POST",
                "url": URL,
                "headers": {"content-type": "application/json"},
            });
            if let Some(text) = recorded_body {
                request["body"] = serde_json::json!(text);
            }
            let exchanges = serde_json::json!([{
                "id": "ex-1",
                "request": request,
                "response": {"status": 201, "headers": {}},
            }]);
            std::fs::write(dir.join("exchanges.json"), exchanges.to_string()).unwrap();
        }

        fn post(body: Option<&str>) -> FetchRequest {
            let request =
                FetchRequest::new(Method::Post, URL).header("Content-Type", "application/json");
            FetchRequest {
                body: body.map(|b| b.as_bytes().to_vec()),
                ..request
            }
        }

        #[tokio::test]
        async fn a_recorded_post_is_served_when_method_url_and_body_match() {
            let dir = tempfile::tempdir().unwrap();
            case(dir.path(), Some(BODY));
            let replay = Replay::from_case(dir.path()).unwrap();
            let response = replay.get(post(Some(BODY))).await.unwrap();
            assert_eq!(response.status, 201);
            replay.finish().unwrap();
        }

        #[tokio::test]
        async fn a_post_whose_body_differs_fails_loudly_without_printing_either_body() {
            let dir = tempfile::tempdir().unwrap();
            case(dir.path(), Some(BODY));
            let replay = Replay::from_case(dir.path()).unwrap();
            let sent = r#"{"v":1,"appId":"SECRET-APP-ID"}"#;
            assert_eq!(
                replay.get(post(Some(sent))).await.unwrap_err(),
                FetchError::Network
            );
            let report = replay.finish().unwrap_err();
            assert!(
                report.contains("POST https://relay.test/v1/reports"),
                "{report}"
            );
            assert!(report.contains("body differs"), "{report}");
            assert!(
                !report.contains("SECRET-APP-ID") && !report.contains("220"),
                "{report}"
            );
        }

        #[tokio::test]
        async fn a_post_with_no_body_does_not_match_a_recorded_body_and_the_reverse() {
            let dir = tempfile::tempdir().unwrap();
            case(dir.path(), Some(BODY));
            let replay = Replay::from_case(dir.path()).unwrap();
            assert!(replay.get(post(None)).await.is_err());
            assert!(replay.finish().unwrap_err().contains("body differs"));

            let dir = tempfile::tempdir().unwrap();
            case(dir.path(), None);
            let replay = Replay::from_case(dir.path()).unwrap();
            assert!(replay.get(post(Some(BODY))).await.is_err());
            assert!(replay.finish().unwrap_err().contains("body differs"));
        }

        #[tokio::test]
        async fn a_recorded_get_still_matches_a_plain_get() {
            let dir = tempfile::tempdir().unwrap();
            let exchanges = serde_json::json!([{
                "id": "ex-1",
                "request": {"method": "GET", "url": "https://a.test/x", "headers": {}},
                "response": {"status": 200, "headers": {}},
            }]);
            std::fs::write(dir.path().join("exchanges.json"), exchanges.to_string()).unwrap();
            let replay = Replay::from_case(dir.path()).unwrap();
            assert_eq!(
                replay
                    .get(FetchRequest::get("https://a.test/x"))
                    .await
                    .unwrap()
                    .status,
                200
            );
            replay.finish().unwrap();
        }
    }

    #[test]
    fn content_range_must_name_the_range_and_the_total() {
        assert!(content_range_is("bytes 0-19/200", 0, 19, 200));
        assert!(!content_range_is("bytes 0-19/201", 0, 19, 200));
        assert!(!content_range_is("bytes 1-19/200", 0, 19, 200));
        assert!(!content_range_is("bytes 0-19/*", 0, 19, 200));
        assert!(!content_range_is("items 0-19/200", 0, 19, 200));
        assert!(!content_range_is("", 0, 19, 200));
    }
}
