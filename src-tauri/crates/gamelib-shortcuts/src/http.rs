//! The HTTP seam of the shortcut services (D-20): [`ReqwestHttp`] in the app, [`Replay`] (feature
//! `testing`) in the golden tests, which answers by URL and records every URL asked.
//!
//! A copy of `gamelib-info`'s seam, cut to what an icon download needs (a GET with a size cap): this crate
//! depends on no other service crate, so the shape is repeated rather than shared. A URL can carry a
//! signed query, so nothing here puts a URL into an error string or a `Debug` output.

use std::future::Future;
use std::pin::Pin;
use std::sync::OnceLock;
use std::time::Duration;

/// The response body cap when a caller names none.
pub const DEFAULT_MAX_BODY: usize = 16 * 1024 * 1024;

/// One GET request.
#[derive(Clone)]
pub struct Request {
    pub url: String,
    pub timeout: Duration,
    /// The most response bytes to read before answering [`HttpError::TooLarge`].
    pub max_body: usize,
}

impl Request {
    pub fn get(url: impl Into<String>, timeout: Duration) -> Request {
        Request {
            url: url.into(),
            timeout,
            max_body: DEFAULT_MAX_BODY,
        }
    }

    pub fn max_body(mut self, max_body: usize) -> Request {
        self.max_body = max_body;
        self
    }
}

impl std::fmt::Debug for Request {
    /// No query: it can hold a signature.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let url = self.url.split(['?', '#']).next().unwrap_or_default();
        f.debug_struct("Request")
            .field("url", &url)
            .finish_non_exhaustive()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Response {
    pub status: u16,
    pub body: Vec<u8>,
}

/// Why a request produced no response. Never carries a URL.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HttpError {
    Timeout,
    Network(String),
    TooLarge,
}

impl std::fmt::Display for HttpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HttpError::Timeout => f.write_str("timeout"),
            HttpError::Network(m) => write!(f, "network: {m}"),
            HttpError::TooLarge => f.write_str("response too large"),
        }
    }
}

impl std::error::Error for HttpError {}

pub type HttpFuture<'a> = Pin<Box<dyn Future<Output = Result<Response, HttpError>> + Send + 'a>>;

/// The HTTP seam.
pub trait Http: Send + Sync {
    fn send(&self, request: Request) -> HttpFuture<'_>;
}

/// The seam a context has until the shell installs the real one: every request fails, so a headless run
/// can never reach the network by accident.
pub struct NoHttp;

impl Http for NoHttp {
    fn send(&self, _request: Request) -> HttpFuture<'_> {
        Box::pin(async { Err(HttpError::Network("no http seam installed".to_string())) })
    }
}

/// Installs the process-wide rustls provider (ring), as `gamelib-info` does. Idempotent: an already
/// installed provider is not an error.
pub fn install_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

/// The reqwest-backed [`Http`]: the client is built on first use, after the rustls provider is installed
/// (a client built earlier would have no provider), follows at most five redirects as axios does, applies
/// each request's own timeout, caps the response body, and maps every error through `.without_url()` so a
/// signed query never reaches a log or an error string.
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

/// The error without the URL, and with any copy of the URL or its query the message still holds replaced
/// (belt and braces: `.without_url()` removes the URL field, this removes a stray copy).
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
            let mut response = client
                .get(request.url.as_str())
                .timeout(request.timeout)
                .send()
                .await
                .map_err(|e| map_error(e, &request.url))?;
            let status = response.status().as_u16();
            // A declared length over the cap is refused before a byte of the body is read.
            if response
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
            Ok(Response { status, body })
        })
    }
}

#[cfg(any(test, feature = "testing"))]
pub use replay::Replay;

/// A URL-keyed answer table served as an [`Http`], for the golden tests.
#[cfg(any(test, feature = "testing"))]
mod replay {
    use std::collections::HashMap;
    use std::sync::{Mutex, MutexGuard};

    use super::{Http, HttpError, HttpFuture, Request, Response};

    /// Answers each URL with the recorded outcome, an unknown URL with a network error, and remembers every
    /// URL asked, in order (a golden pins the URLs a case requested).
    #[derive(Default)]
    pub struct Replay {
        answers: Mutex<HashMap<String, Result<Response, HttpError>>>,
        asked: Mutex<Vec<String>>,
    }

    fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
        m.lock().unwrap_or_else(|e| e.into_inner())
    }

    impl Replay {
        pub fn new() -> Replay {
            Replay::default()
        }

        /// Answers `url` with `answer`.
        pub fn answer(self, url: &str, answer: Result<Response, HttpError>) -> Replay {
            lock(&self.answers).insert(url.to_string(), answer);
            self
        }

        /// Every URL requested so far, in order.
        pub fn asked(&self) -> Vec<String> {
            lock(&self.asked).clone()
        }
    }

    impl Http for Replay {
        fn send(&self, request: Request) -> HttpFuture<'_> {
            lock(&self.asked).push(request.url.clone());
            let answer = lock(&self.answers)
                .get(&request.url)
                .cloned()
                .unwrap_or_else(|| Err(HttpError::Network("no recorded answer".to_string())));
            Box::pin(async move { answer })
        }
    }
}
