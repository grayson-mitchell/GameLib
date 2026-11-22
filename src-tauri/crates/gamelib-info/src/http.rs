//! All HTTP goes through [`Http`] (D-20): [`ReqwestHttp`] in the app, `Replay` (feature `testing`) in
//! the golden tests, which pins each request to the one a recorded TS run made (D-10).
//!
//! A URL can carry an API key in its query (the ITAD `key=`), so nothing here puts a URL into an
//! error string or a `Debug` output.

use std::future::Future;
#[cfg(feature = "testing")]
use std::path::Path;
use std::pin::Pin;
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
pub fn axios_query(_pairs: &[(&str, &str)]) -> String {
    String::new()
}

/// The reqwest-backed [`Http`].
pub struct ReqwestHttp {
    _private: (),
}

impl ReqwestHttp {
    pub fn new() -> ReqwestHttp {
        ReqwestHttp { _private: () }
    }
}

impl Default for ReqwestHttp {
    fn default() -> Self {
        ReqwestHttp::new()
    }
}

impl Http for ReqwestHttp {
    fn send(&self, _request: Request) -> HttpFuture<'_> {
        Box::pin(async { Err(HttpError::Network("unimplemented".to_string())) })
    }
}

/// A recorded case served as an [`Http`].
#[cfg(feature = "testing")]
pub struct Replay {
    _private: (),
}

#[cfg(feature = "testing")]
impl Replay {
    pub fn from_case(_dir: &Path) -> Result<Replay, String> {
        Err("unimplemented".to_string())
    }

    pub fn with_ts_only(self, _ids: &[&str]) -> Replay {
        self
    }

    pub fn finish(&self) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(feature = "testing")]
impl Http for Replay {
    fn send(&self, _request: Request) -> HttpFuture<'_> {
        Box::pin(async { Err(HttpError::Network("unimplemented".to_string())) })
    }
}
