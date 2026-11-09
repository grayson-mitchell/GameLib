//! CDN chunk and manifest fetch with retry, host failover and on-demand CDN tokens.
//! Ports the network half of `depot/decompress.ts` `fetchChunk` and steam-user's manifest URL.
//!
//! Rules carried over from TS (each is an incident fix, see the TS doc comments):
//! - headers: the three `CHUNK_FETCH_HEADERS`, sent to every host, `Accept-Encoding` left alone
//!   (undici auto-decoded gzip; chunk bodies are `application/x-steam-chunk` with no content
//!   encoding, so reqwest's gzip feature stays off and nothing is lost);
//! - scheme `https://` only when `https_support == "mandatory"`, else `http://` (steam-user);
//! - token gate `use_token_auth || kind == "CDN"`; `SteamCache` hosts never ask for a token;
//! - 8 attempts, 15 s each, backoff `200 * 2^i` capped at 3 s, cancel never reaches host health;
//! - redirects are never followed (a hostile edge cannot steer a request off-host).
//!
//! Tokens and request codes come from Node through `JobHost`, which blocks on the sidecar pipe,
//! so every call goes through `spawn_blocking`. A token is never written into a `Failure`, a
//! warning or a log line: messages carry host and path only.

use crate::container::MAX_MANIFEST_BYTES;
use crate::host_health::{HostAttemptOutcome, HostHealthTracker};
use crate::inflight::InflightLimiter;
use crate::job::HostRef;
use crate::outcome::{ErrorKind, Failure};
use crate::stall::StallTracker;
use crate::{JobHost, TokenRequest};
use std::collections::HashMap;
use std::fmt;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tokio::time::Instant;
use tokio_util::sync::CancellationToken;

// TS origin: depot/decompress.ts CHUNK_FETCH_TIMEOUT_MS
/// Per-attempt bound; a hung edge fails fast and rotates.
pub const CHUNK_FETCH_TIMEOUT_MS: u64 = 15_000;

// TS origin: depot/download.ts CHUNK_FETCH_ATTEMPTS
pub const CHUNK_FETCH_ATTEMPTS: u32 = 8;

// TS origin: depot/decompress.ts CHUNK_FETCH_MAX_BACKOFF_MS
pub const CHUNK_FETCH_MAX_BACKOFF_MS: u64 = 3_000;

// TS origin: depot/decompress.ts fetchChunk `Math.min(200 * 2 ** i, ...)`
pub const CHUNK_FETCH_BACKOFF_BASE_MS: u64 = 200;

// TS origin: depot/decompress.ts CHUNK_FETCH_HEADERS
pub const CHUNK_FETCH_USER_AGENT: &str = "Valve/Steam HTTP Client 1.0";
/// Host reply meaning Steam refused the manifest request code with EResult 40 (Blocked). The Node
/// `depotManifestRequestCode` handler sends `{eresult: 40}`; the shell turns that into this `Err`.
pub const BLOCKED_REPLY: &str = "eresult:40";
/// EResult 40: the only refusal the TS plan builder skips a depot for.
pub const ERESULT_BLOCKED: i32 = 40;
const CHUNK_FETCH_ACCEPT: &str = "text/html,*/*;q=0.9";
const CHUNK_FETCH_ACCEPT_CHARSET: &str = "ISO-8859-1,utf-8,*;q=0.7";

// TS origin: depot/cdnAuth.ts CDN_AUTH_TOKEN_FAILURE_COOLDOWN_MS
const TOKEN_FAILURE_COOLDOWN: Duration = Duration::from_secs(60);

// TS origin: depot/cdnAuth.ts CDN_AUTH_NO_TOKEN_TTL_MS
const TOKEN_NO_TOKEN_TTL: Duration = Duration::from_secs(30 * 60);

/// A chunk is at most a few MiB on the wire; anything near this is a hostile or broken edge.
const MAX_CHUNK_BODY_BYTES: u64 = 64 * 1024 * 1024;

/// Why a fetch ended without bytes.
#[derive(Debug, Clone)]
pub enum FetchError {
    /// The job's cancel token fired. Never recorded against host health.
    Cancelled,
    Failed(Failure),
}

impl FetchError {
    pub fn into_failure(self) -> Option<Failure> {
        match self {
            FetchError::Cancelled => None,
            FetchError::Failed(f) => Some(f),
        }
    }
}

/// What one HTTP attempt can report. Never holds a URL or any reqwest error text, because those
/// carry the token query.
#[derive(Debug, Clone)]
struct AttemptErr {
    status: Option<u16>,
    code: &'static str,
    timed_out: bool,
}

fn install_crypto_provider() {
    static ONCE: OnceLock<()> = OnceLock::new();
    ONCE.get_or_init(|| {
        // Err means another provider is already installed, which is fine.
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

/// One client per process: connection pooling is the point.
fn http_client() -> Option<&'static reqwest::Client> {
    static CLIENT: OnceLock<Option<reqwest::Client>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            install_crypto_provider();
            let mut h = reqwest::header::HeaderMap::new();
            h.insert(
                reqwest::header::USER_AGENT,
                reqwest::header::HeaderValue::from_static(CHUNK_FETCH_USER_AGENT),
            );
            h.insert(
                reqwest::header::ACCEPT,
                reqwest::header::HeaderValue::from_static(CHUNK_FETCH_ACCEPT),
            );
            h.insert(
                reqwest::header::ACCEPT_CHARSET,
                reqwest::header::HeaderValue::from_static(CHUNK_FETCH_ACCEPT_CHARSET),
            );
            reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .default_headers(h)
                .build()
                .ok()
        })
        .as_ref()
}

#[derive(Clone)]
enum TokenEntry {
    /// Verbatim query fragment including its own leading `?`.
    Token(String),
    /// eresult OK with an empty token: this depot+host needs none.
    NoToken(Instant),
    /// Failed or timed out; do not ask again until the cooldown elapses.
    Cooldown(Instant),
    /// A 401/403 proved the cached token stale; the next ask is a forced refresh.
    Invalidated,
}

/// Token cache keyed by (depot, host). Not `Debug` on purpose, so a token cannot reach a log.
#[derive(Default)]
struct TokenCache {
    map: Mutex<HashMap<(String, String), TokenEntry>>,
}

impl TokenCache {
    fn get(&self, key: &(String, String)) -> Option<TokenEntry> {
        self.map.lock().ok().and_then(|m| m.get(key).cloned())
    }
    fn set(&self, key: (String, String), e: TokenEntry) {
        if let Ok(mut m) = self.map.lock() {
            m.insert(key, e);
        }
    }
    /// Invalidate only if the cache still holds the token that was rejected, so many workers
    /// failing on the same stale token cause one refresh.
    fn invalidate_if_stale(&self, key: &(String, String), stale: &str) {
        if let Ok(mut m) = self.map.lock() {
            if let Some(TokenEntry::Token(t)) = m.get(key) {
                if t == stale {
                    m.insert(key.clone(), TokenEntry::Invalidated);
                }
            }
        }
    }
}

enum Target<'a> {
    Chunk {
        sha: &'a str,
    },
    Manifest {
        manifest_id: &'a str,
        request_code: Option<String>,
    },
}

pub struct Fetcher {
    host: Arc<dyn JobHost>,
    job_id: String,
    app_id: String,
    hosts: Vec<HostRef>,
    host_names: Vec<String>,
    health: Mutex<HostHealthTracker>,
    limiter: InflightLimiter,
    stall: Arc<StallTracker>,
    tokens: TokenCache,
    /// Serializes token fetches so concurrent workers coalesce onto one Node round trip.
    token_gate: tokio::sync::Mutex<()>,
    attempts: u32,
    attempt_timeout: Duration,
    /// (base, cap) in ms; defaults to the TS constants.
    backoff: (u64, u64),
}

fn wants_cdn_auth_token(h: &HostRef) -> bool {
    h.use_token_auth || h.kind.as_deref() == Some("CDN")
}

fn scheme_for(h: &HostRef) -> &'static str {
    if h.https_support.as_deref() == Some("mandatory") {
        "https://"
    } else {
        "http://"
    }
}

#[cfg(test)]
fn backoff_ms(attempt: u32) -> u64 {
    backoff_with(
        attempt,
        CHUNK_FETCH_BACKOFF_BASE_MS,
        CHUNK_FETCH_MAX_BACKOFF_MS,
    )
}

fn backoff_with(attempt: u32, base: u64, cap: u64) -> u64 {
    base.saturating_mul(1u64 << attempt.min(20)).min(cap)
}

impl Fetcher {
    pub fn new(
        host: Arc<dyn JobHost>,
        job_id: &str,
        app_id: &str,
        hosts: Vec<HostRef>,
        limiter: InflightLimiter,
        stall: Arc<StallTracker>,
    ) -> Self {
        let weighted: HashMap<String, f64> = hosts
            .iter()
            .filter_map(|h| h.weighted_load.map(|w| (h.host.clone(), w)))
            .collect();
        let host_names = hosts.iter().map(|h| h.host.clone()).collect();
        Self {
            host,
            job_id: job_id.to_string(),
            app_id: app_id.to_string(),
            hosts,
            host_names,
            health: Mutex::new(HostHealthTracker::with_weighted_loads(weighted)),
            limiter,
            stall,
            tokens: TokenCache::default(),
            token_gate: tokio::sync::Mutex::new(()),
            attempts: CHUNK_FETCH_ATTEMPTS,
            attempt_timeout: Duration::from_millis(CHUNK_FETCH_TIMEOUT_MS),
            backoff: (CHUNK_FETCH_BACKOFF_BASE_MS, CHUNK_FETCH_MAX_BACKOFF_MS),
        }
    }

    pub fn stall(&self) -> &Arc<StallTracker> {
        &self.stall
    }

    pub fn hosts(&self) -> &[HostRef] {
        &self.hosts
    }

    /// Fetches the still-encrypted chunk body. Returns the bytes and the serving host. Decode and
    /// the size/SHA1 gate belong to the caller (`container::decode_chunk`).
    pub async fn fetch_chunk(
        &self,
        depot_id: &str,
        sha_hex: &str,
        seed: usize,
        worker_slot: usize,
        cancel: &CancellationToken,
    ) -> Result<(Vec<u8>, String), FetchError> {
        self.run(
            depot_id,
            Target::Chunk { sha: sha_hex },
            seed,
            worker_slot,
            cancel,
        )
        .await
    }

    /// Fetches the raw (wrapped) manifest. On 401/403/404 asks Node once for a fresh request code
    /// and retries (Pitfall 5: codes rotate). `request_code` of `None` asks Node up front.
    pub async fn fetch_manifest(
        &self,
        depot_id: &str,
        manifest_id: &str,
        request_code: Option<&str>,
        cancel: &CancellationToken,
    ) -> Result<Vec<u8>, FetchError> {
        let code = match request_code {
            Some(c) => c.to_string(),
            None => self
                .request_code_from_node(depot_id, manifest_id, cancel)
                .await?
                .ok_or_else(|| {
                    FetchError::Failed(plain_failure(
                        ErrorKind::ManifestUnavailable,
                        format!("no manifest request code for depot {depot_id}"),
                    ))
                })?,
        };
        let (bytes, _host) = self
            .run(
                depot_id,
                Target::Manifest {
                    manifest_id,
                    request_code: Some(code),
                },
                0,
                0,
                cancel,
            )
            .await?;
        Ok(bytes)
    }

    async fn request_code_from_node(
        &self,
        depot_id: &str,
        manifest_id: &str,
        cancel: &CancellationToken,
    ) -> Result<Option<String>, FetchError> {
        let host = Arc::clone(&self.host);
        let (a, d, m) = (
            self.app_id.clone(),
            depot_id.to_string(),
            manifest_id.to_string(),
        );
        let join = tokio::task::spawn_blocking(move || host.manifest_request_code(&a, &d, &m));
        let res = tokio::select! {
            _ = cancel.cancelled() => return Err(FetchError::Cancelled),
            r = join => r,
        };
        match res {
            Ok(Ok(code)) => Ok(code.filter(|c| !c.is_empty())),
            // Steam refused the request with EResult 40 (Blocked): carried so the job can skip
            // this depot, like `skipBlockedDepot` in plan.ts.
            Ok(Err(e)) if e == BLOCKED_REPLY => Err(FetchError::Failed(Failure {
                kind: ErrorKind::ManifestUnavailable,
                message: format!("Steam refused the manifest for depot {depot_id} (eresult=40)"),
                eresult: Some(ERESULT_BLOCKED),
                ..base_failure()
            })),
            // A failed Node call degrades to "no new code": the retry reports the HTTP error.
            Ok(Err(_)) | Err(_) => Ok(None),
        }
    }

    /// Returns the query-fragment token for (depot, host), asking Node when needed. `stale` is
    /// the token a 401/403 just rejected, if any. A failed Node call yields an empty token
    /// (the request goes out token-less and the attempt loop decides), with a 60 s cooldown.
    async fn token_for(
        &self,
        depot_id: &str,
        host: &str,
        cancel: &CancellationToken,
    ) -> Result<String, FetchError> {
        let key = (depot_id.to_string(), host.to_string());
        let usable = |e: Option<TokenEntry>| match e {
            Some(TokenEntry::Token(t)) => Some(t),
            Some(TokenEntry::NoToken(until)) | Some(TokenEntry::Cooldown(until))
                if Instant::now() < until =>
            {
                Some(String::new())
            }
            _ => None,
        };
        if let Some(t) = usable(self.tokens.get(&key)) {
            return Ok(t);
        }
        let _gate = tokio::select! {
            _ = cancel.cancelled() => return Err(FetchError::Cancelled),
            g = self.token_gate.lock() => g,
        };
        // Another worker may have refreshed while this one waited on the gate.
        let prior = self.tokens.get(&key);
        if let Some(t) = usable(prior.clone()) {
            return Ok(t);
        }
        let force = matches!(prior, Some(TokenEntry::Invalidated));
        let req = TokenRequest {
            job_id: self.job_id.clone(),
            app_id: self.app_id.clone(),
            depot_id: depot_id.to_string(),
            host: host.to_string(),
            force,
        };
        let jh = Arc::clone(&self.host);
        let join = tokio::task::spawn_blocking(move || jh.cdn_token(req));
        let res = tokio::select! {
            _ = cancel.cancelled() => return Err(FetchError::Cancelled),
            r = join => r,
        };
        match res {
            Ok(Ok(Some(t))) if !t.is_empty() => {
                self.tokens.set(key, TokenEntry::Token(t.clone()));
                Ok(t)
            }
            Ok(Ok(_)) => {
                self.tokens.set(
                    key,
                    TokenEntry::NoToken(Instant::now() + TOKEN_NO_TOKEN_TTL),
                );
                Ok(String::new())
            }
            Ok(Err(_)) | Err(_) => {
                self.tokens.set(
                    key,
                    TokenEntry::Cooldown(Instant::now() + TOKEN_FAILURE_COOLDOWN),
                );
                Ok(String::new())
            }
        }
    }

    async fn run(
        &self,
        depot_id: &str,
        mut target: Target<'_>,
        seed: usize,
        worker_slot: usize,
        cancel: &CancellationToken,
    ) -> Result<(Vec<u8>, String), FetchError> {
        let mut previous_host: Option<String> = None;
        let mut last: Option<AttemptErr> = None;
        let mut last_host = String::new();
        let mut code_refreshed = false;
        let max_body = match target {
            Target::Chunk { .. } => MAX_CHUNK_BODY_BYTES,
            Target::Manifest { .. } => MAX_MANIFEST_BYTES,
        };
        let what = match &target {
            Target::Chunk { sha } => format!("chunk {sha}"),
            Target::Manifest { manifest_id, .. } => format!("manifest {manifest_id}"),
        };

        for i in 0..self.attempts {
            if cancel.is_cancelled() {
                return Err(FetchError::Cancelled);
            }
            let picked = {
                let mut h = self
                    .health
                    .lock()
                    .map_err(|_| FetchError::Failed(plain_failure(ErrorKind::Io, "health lock")))?;
                h.pick_host(
                    &self.host_names,
                    seed,
                    i as usize,
                    worker_slot,
                    previous_host.as_deref(),
                )
            };
            let host_name = picked.map_err(|_| {
                FetchError::Failed(plain_failure(
                    ErrorKind::NoContentServers,
                    "no content servers available".to_string(),
                ))
            })?;
            previous_host = Some(host_name.clone());
            last_host = host_name.clone();
            let Some(meta) = self.hosts.iter().find(|h| h.host == host_name) else {
                continue;
            };

            let token = if wants_cdn_auth_token(meta) {
                self.token_for(depot_id, &host_name, cancel).await?
            } else {
                String::new()
            };
            let path = match &target {
                Target::Chunk { sha } => format!("/depot/{depot_id}/chunk/{sha}"),
                Target::Manifest {
                    manifest_id,
                    request_code,
                } => format!(
                    "/depot/{depot_id}/manifest/{manifest_id}/5/{}",
                    request_code.as_deref().unwrap_or("")
                ),
            };
            let url = format!("{}{}{}{}", scheme_for(meta), host_name, path, token);

            let permit = tokio::select! {
                _ = cancel.cancelled() => return Err(FetchError::Cancelled),
                p = self.limiter.acquire() => p,
            };
            let started = Instant::now();
            let outcome = tokio::select! {
                _ = cancel.cancelled() => return Err(FetchError::Cancelled),
                r = tokio::time::timeout(self.attempt_timeout, http_get(&url, max_body)) => {
                    r.unwrap_or(Err(AttemptErr { status: None, code: "timeout", timed_out: true }))
                }
            };
            drop(permit);
            let ms = started.elapsed().as_millis() as u64;

            match outcome {
                Ok(body) => {
                    if let Ok(mut h) = self.health.lock() {
                        h.record(&host_name, HostAttemptOutcome::Success, ms);
                    }
                    return Ok((body, host_name));
                }
                Err(e) => {
                    if let Ok(mut h) = self.health.lock() {
                        let o = if e.timed_out {
                            HostAttemptOutcome::Timeout
                        } else {
                            HostAttemptOutcome::Error
                        };
                        h.record(&host_name, o, ms);
                    }
                    let auth_rejected = matches!(e.status, Some(401) | Some(403));
                    if auth_rejected && wants_cdn_auth_token(meta) {
                        self.tokens.invalidate_if_stale(
                            &(depot_id.to_string(), host_name.clone()),
                            &token,
                        );
                    }
                    if !code_refreshed && matches!(e.status, Some(401) | Some(403) | Some(404)) {
                        if let Target::Manifest { manifest_id, .. } = target {
                            code_refreshed = true;
                            let fresh = self
                                .request_code_from_node(depot_id, manifest_id, cancel)
                                .await?;
                            if let Some(f) = fresh {
                                target = Target::Manifest {
                                    manifest_id,
                                    request_code: Some(f),
                                };
                            }
                        }
                    }
                    last = Some(e);
                }
            }

            if i + 1 < self.attempts {
                tokio::select! {
                    _ = cancel.cancelled() => return Err(FetchError::Cancelled),
                    _ = tokio::time::sleep(Duration::from_millis(backoff_with(i, self.backoff.0, self.backoff.1))) => {}
                }
            }
        }

        let last = last.unwrap_or(AttemptErr {
            status: None,
            code: "unknown",
            timed_out: false,
        });
        Err(FetchError::Failed(match last.status {
            Some(s) => Failure {
                kind: ErrorKind::CdnHttp,
                http_status: Some(s),
                message: format!(
                    "{what} failed after {} attempts: HTTP {s} from {last_host}",
                    self.attempts
                ),
                ..base_failure()
            },
            None => Failure {
                kind: ErrorKind::Network,
                code: Some(last.code.to_string()),
                message: format!(
                    "{what} failed after {} attempts: {} from {last_host}",
                    self.attempts, last.code
                ),
                ..base_failure()
            },
        }))
    }
}

fn base_failure() -> Failure {
    Failure {
        file: None,
        kind: ErrorKind::Io,
        message: String::new(),
        code: None,
        eresult: None,
        http_status: None,
        scope: None,
        ms_since_progress: None,
    }
}

fn plain_failure(kind: ErrorKind, message: impl Into<String>) -> Failure {
    Failure {
        kind,
        message: message.into(),
        ..base_failure()
    }
}

/// One GET. Redirects are not followed, so a 3xx is just a non-success status.
async fn http_get(url: &str, max_body: u64) -> Result<Vec<u8>, AttemptErr> {
    let client = http_client().ok_or(AttemptErr {
        status: None,
        code: "client",
        timed_out: false,
    })?;
    let mut resp = client.get(url).send().await.map_err(classify)?;
    let status = resp.status();
    if !status.is_success() {
        return Err(AttemptErr {
            status: Some(status.as_u16()),
            code: "http",
            timed_out: false,
        });
    }
    if resp.content_length().is_some_and(|n| n > max_body) {
        return Err(AttemptErr {
            status: None,
            code: "too_large",
            timed_out: false,
        });
    }
    let mut body: Vec<u8> = Vec::new();
    while let Some(part) = resp.chunk().await.map_err(classify)? {
        if (body.len() as u64).saturating_add(part.len() as u64) > max_body {
            return Err(AttemptErr {
                status: None,
                code: "too_large",
                timed_out: false,
            });
        }
        body.extend_from_slice(&part);
    }
    Ok(body)
}

/// Maps a reqwest error to a code without ever formatting it (its Display includes the URL).
fn classify(e: reqwest::Error) -> AttemptErr {
    let (code, timed_out) = if e.is_timeout() {
        ("timeout", true)
    } else if e.is_connect() {
        ("connect", false)
    } else if e.is_body() || e.is_decode() {
        ("body", false)
    } else {
        ("request", false)
    };
    AttemptErr {
        status: None,
        code,
        timed_out,
    }
}

impl fmt::Debug for Fetcher {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Fetcher")
            .field("job_id", &self.job_id)
            .field("hosts", &self.host_names)
            .finish_non_exhaustive()
    }
}

impl Fetcher {
    /// Overrides the attempt budget and per-attempt timeout (tests, and a future settings knob).
    pub fn with_budget(mut self, attempts: u32, timeout: Duration) -> Self {
        self.attempts = attempts;
        self.attempt_timeout = timeout;
        self
    }

    /// Overrides the backoff base and cap in ms (tests keep real-socket runs fast).
    pub fn with_backoff(mut self, base_ms: u64, cap_ms: u64) -> Self {
        self.backoff = (base_ms, cap_ms);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_is_200_doubling_capped_at_3000() {
        let v: Vec<u64> = (0..8).map(backoff_ms).collect();
        assert_eq!(v, vec![200, 400, 800, 1600, 3000, 3000, 3000, 3000]);
    }

    fn hr(kind: Option<&str>, https: Option<&str>, tok: bool) -> HostRef {
        HostRef {
            host: "h".into(),
            vhost: None,
            kind: kind.map(String::from),
            https_support: https.map(String::from),
            use_token_auth: tok,
            weighted_load: None,
        }
    }

    #[test]
    fn https_only_when_mandatory() {
        assert_eq!(scheme_for(&hr(None, Some("mandatory"), false)), "https://");
        assert_eq!(scheme_for(&hr(None, Some("optional"), false)), "http://");
        assert_eq!(scheme_for(&hr(None, None, false)), "http://");
    }

    #[test]
    fn token_gate_is_usetokenauth_or_cdn_kind() {
        assert!(wants_cdn_auth_token(&hr(Some("CDN"), None, false)));
        assert!(wants_cdn_auth_token(&hr(Some("SteamCache"), None, true)));
        assert!(!wants_cdn_auth_token(&hr(Some("SteamCache"), None, false)));
        assert!(!wants_cdn_auth_token(&hr(None, None, false)));
    }

    #[test]
    fn constants_match_the_ts_origin() {
        assert_eq!(CHUNK_FETCH_TIMEOUT_MS, 15_000);
        assert_eq!(CHUNK_FETCH_ATTEMPTS, 8);
    }
}
