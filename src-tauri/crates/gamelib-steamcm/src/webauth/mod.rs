//! Web API sign-in transport (`IAuthenticationService` over HTTPS, protobuf in
//! `input_protobuf_encoded`, result in the `x-eresult` header). Sign-in never opens a CM
//! connection (D-05, CF-08). The QR flow and the flow registry are added on top of `call`.
//!
//! D-08: no Steam Guard machine token or guard data is read or persisted anywhere in this module.
//!
//! Secret hygiene (T-28-04): error values never carry request or response bodies.

pub mod credentials;
#[cfg(test)]
pub(crate) mod mock;

use base64::Engine;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use steam_vent_proto::protobuf::{EnumOrUnknown, Message, MessageField};
use steam_vent_proto::steammessages_auth_steamclient::{
    CAuthentication_BeginAuthSessionViaQR_Request, CAuthentication_BeginAuthSessionViaQR_Response,
    CAuthentication_DeviceDetails, CAuthentication_PollAuthSessionStatus_Request,
    CAuthentication_PollAuthSessionStatus_Response, EAuthTokenPlatformType,
};
use tokio::time::Instant;

/// Production Web API base URL.
pub const STEAM_API_BASE: &str = "https://api.steampowered.com";

/// A QR flow ends with `timeout` after this long (userTypes.ts QR_LOGIN_TIMEOUT_MS).
const QR_LOGIN_TIMEOUT: Duration = Duration::from_secs(120);
const DEVICE_NAME: &str = "GameLib";
/// EOSType Win11, what steam-session sends for SteamClient logins.
const OS_TYPE_WIN11: i32 = 20;

/// Per-call timeout.
const CALL_TIMEOUT: Duration = Duration::from_secs(15);
/// Response body cap (T-79-16).
const MAX_BODY: usize = 64 * 1024;

/// Escape the characters standard base64 can contain that are not URL-safe.
fn form_escape(b64: &str) -> String {
    b64.replace('+', "%2B")
        .replace('/', "%2F")
        .replace('=', "%3D")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpMethod {
    Get,
    Post,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WebAuthError {
    /// Steam answered with a non-1 `x-eresult`.
    EResult(i32),
    Timeout,
    Network,
    Protocol(&'static str),
}

/// Web API client. Build it AFTER `crate::install_crypto_provider()` (Pitfall 3: the reqwest
/// rustls build needs the process-wide provider).
#[derive(Clone)]
pub struct WebAuth {
    pub(crate) base_url: String,
    pub(crate) client: reqwest::Client,
    pub(crate) flows: Arc<Flows>,
    pub(crate) timing: Timing,
}

/// Poll pacing. Production values; tests shrink them because a paused tokio clock auto-advances
/// while a call is waiting on real socket IO and would fire the call timeout spuriously.
#[derive(Clone, Copy)]
pub(crate) struct Timing {
    pub min_interval: Duration,
    pub max_interval: Duration,
    pub flow_timeout: Duration,
}

impl Timing {
    const PRODUCTION: Timing = Timing {
        min_interval: Duration::from_secs(1),
        max_interval: Duration::from_secs(10),
        flow_timeout: QR_LOGIN_TIMEOUT,
    };

    fn clamp_interval(&self, secs: f32) -> Duration {
        Duration::from_secs_f32(secs.max(0.0)).clamp(self.min_interval, self.max_interval)
    }
}

impl WebAuth {
    pub fn new(base_url: impl Into<String>) -> Self {
        WebAuth {
            base_url: base_url.into(),
            client: reqwest::Client::new(),
            flows: Arc::new(Flows::default()),
            timing: Timing::PRODUCTION,
        }
    }

    #[cfg(test)]
    pub(crate) fn with_timing(mut self, timing: Timing) -> Self {
        self.timing = timing;
        self
    }

    /// One bounded `IAuthenticationService/<name>/v1` call.
    pub(crate) async fn call<Req: Message, Rsp: Message>(
        &self,
        method: HttpMethod,
        name: &str,
        req: &Req,
    ) -> Result<Rsp, WebAuthError> {
        match tokio::time::timeout(CALL_TIMEOUT, self.call_inner(method, name, req)).await {
            Ok(r) => r,
            Err(_) => Err(WebAuthError::Timeout),
        }
    }

    async fn call_inner<Req: Message, Rsp: Message>(
        &self,
        method: HttpMethod,
        name: &str,
        req: &Req,
    ) -> Result<Rsp, WebAuthError> {
        let bytes = req
            .write_to_bytes()
            .map_err(|_| WebAuthError::Protocol("encode"))?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        let url = format!("{}/IAuthenticationService/{name}/v1", self.base_url);
        // reqwest's `query`/`form` features are not enabled; standard base64 only needs three
        // characters escaped, so the form is built by hand.
        let field = format!("input_protobuf_encoded={}", form_escape(&encoded));
        let rb = match method {
            HttpMethod::Get => self.client.get(format!("{url}?{field}")),
            HttpMethod::Post => self
                .client
                .post(&url)
                .header("content-type", "application/x-www-form-urlencoded")
                .body(field),
        };
        let mut resp = rb.send().await.map_err(|e| {
            if e.is_timeout() {
                WebAuthError::Timeout
            } else {
                WebAuthError::Network
            }
        })?;
        let eresult = resp
            .headers()
            .get("x-eresult")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.trim().parse::<i32>().ok())
            .ok_or(WebAuthError::Protocol("missing-x-eresult"))?;
        if eresult != 1 {
            return Err(WebAuthError::EResult(eresult));
        }
        let mut body: Vec<u8> = Vec::new();
        while let Some(chunk) = resp.chunk().await.map_err(|_| WebAuthError::Network)? {
            if body.len() + chunk.len() > MAX_BODY {
                return Err(WebAuthError::Protocol("body-too-large"));
            }
            body.extend_from_slice(&chunk);
        }
        Rsp::parse_from_bytes(&body).map_err(|_| WebAuthError::Protocol("decode"))
    }
}

/// Why a flow ended without a token.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FlowErrorReason {
    Timeout,
    Eresult,
    Cancelled,
    UnknownFlow,
    Network,
}

/// What `status()` reports. Holds secrets in `Done`, so it deliberately has no `Debug`.
#[derive(Clone, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum FlowStatus {
    #[serde(rename_all = "camelCase")]
    Waiting { challenge_url: String },
    #[serde(rename_all = "camelCase")]
    GuardRequired { guard_type: String },
    /// Handed out exactly once. `steam_id` is a decimal string (a u64 does not fit a JS number).
    #[serde(rename_all = "camelCase")]
    Done {
        refresh_token: String,
        account_name: String,
        steam_id: String,
    },
    #[serde(rename_all = "camelCase")]
    Error {
        reason: FlowErrorReason,
        #[serde(skip_serializing_if = "Option::is_none")]
        eresult: Option<i32>,
    },
}

impl FlowStatus {
    fn error(reason: FlowErrorReason, eresult: Option<i32>) -> Self {
        FlowStatus::Error { reason, eresult }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum FlowKind {
    Qr,
    #[allow(dead_code)] // used by the credentials flow (plan 79-10)
    Credentials,
}

impl FlowKind {
    fn name(self) -> &'static str {
        match self {
            FlowKind::Qr => "qr",
            FlowKind::Credentials => "credentials",
        }
    }
}

pub(crate) struct FlowState {
    pub kind: FlowKind,
    pub status: FlowStatus,
    pub handle: Option<tokio::task::JoinHandle<()>>,
}

/// Flow registry keyed by flowId. Status reads are local; nothing here touches the network.
#[derive(Default)]
pub struct Flows {
    map: Mutex<HashMap<String, FlowState>>,
    counter: AtomicU64,
}

/// Result of `qr_start`.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QrStarted {
    pub flow_id: String,
    pub challenge_url: String,
}

impl Flows {
    fn new_id(&self) -> String {
        use std::hash::{Hash, Hasher};
        let n = self.counter.fetch_add(1, Ordering::Relaxed);
        let t = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let mut h = std::collections::hash_map::DefaultHasher::new();
        (t, n, std::process::id()).hash(&mut h);
        format!("{:016x}", h.finish())
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, FlowState>> {
        self.map.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Set a live flow's status. A flow that was cancelled or removed is left alone.
    fn set_status(&self, id: &str, status: FlowStatus) {
        let mut m = self.lock();
        if let Some(f) = m.get_mut(id) {
            if matches!(
                f.status,
                FlowStatus::Waiting { .. } | FlowStatus::GuardRequired { .. }
            ) {
                crate::error::diag(&format!(
                    "webauth {} flow -> {}",
                    f.kind.name(),
                    status_name(&status)
                ));
                f.status = status;
            }
        }
    }
}

fn status_name(s: &FlowStatus) -> &'static str {
    match s {
        FlowStatus::Waiting { .. } => "waiting",
        FlowStatus::GuardRequired { .. } => "guardRequired",
        FlowStatus::Done { .. } => "done",
        FlowStatus::Error { .. } => "error",
    }
}

/// `sub` claim of a JWT, by decoding the middle segment only. Never logged.
fn jwt_sub(token: &str) -> Option<String> {
    let seg = token.split('.').nth(1)?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(seg.trim_end_matches('='))
        .ok()?;
    let v: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    v.get("sub")?.as_str().map(str::to_string)
}

fn device_details() -> CAuthentication_DeviceDetails {
    CAuthentication_DeviceDetails {
        device_friendly_name: Some(DEVICE_NAME.into()),
        platform_type: Some(EnumOrUnknown::new(
            EAuthTokenPlatformType::k_EAuthTokenPlatformType_SteamClient,
        )),
        os_type: Some(OS_TYPE_WIN11),
        gaming_device_type: Some(1),
        ..Default::default()
    }
}

impl WebAuth {
    /// Start a QR sign-in. Cancels any live QR flow first, then polls inside the crate runtime.
    ///
    /// D-08: no guard data or machine token is read or written.
    pub async fn qr_start(&self) -> Result<QrStarted, WebAuthError> {
        let begin: CAuthentication_BeginAuthSessionViaQR_Response = self
            .call(
                HttpMethod::Post,
                "BeginAuthSessionViaQR",
                &CAuthentication_BeginAuthSessionViaQR_Request {
                    device_friendly_name: Some(DEVICE_NAME.into()),
                    platform_type: Some(EnumOrUnknown::new(
                        EAuthTokenPlatformType::k_EAuthTokenPlatformType_SteamClient,
                    )),
                    device_details: MessageField::some(device_details()),
                    ..Default::default()
                },
            )
            .await?;
        let challenge_url = begin.challenge_url().to_string();
        let client_id = begin.client_id();
        let request_id = begin.request_id().to_vec();
        let interval = self.timing.clamp_interval(begin.interval());

        let id = self.flows.new_id();
        let deadline = Instant::now() + self.timing.flow_timeout;
        let mut m = self.flows.lock();
        // userSignIn.ts parity: a new QR flow replaces the previous one.
        let stale: Vec<String> = m
            .iter()
            .filter(|(_, f)| f.kind == FlowKind::Qr)
            .map(|(k, _)| k.clone())
            .collect();
        for k in stale {
            if let Some(f) = m.remove(&k) {
                if let Some(h) = f.handle {
                    h.abort();
                }
            }
        }
        let me = self.clone();
        let task_id = id.clone();
        let url = challenge_url.clone();
        let handle = tokio::spawn(async move {
            let run = me.qr_poll_loop(&task_id, client_id, request_id, url, interval);
            if tokio::time::timeout_at(deadline, run).await.is_err() {
                me.flows
                    .set_status(&task_id, FlowStatus::error(FlowErrorReason::Timeout, None));
            }
        });
        m.insert(
            id.clone(),
            FlowState {
                kind: FlowKind::Qr,
                status: FlowStatus::Waiting {
                    challenge_url: challenge_url.clone(),
                },
                handle: Some(handle),
            },
        );
        crate::error::diag("webauth qr flow -> waiting");
        Ok(QrStarted {
            flow_id: id,
            challenge_url,
        })
    }

    async fn qr_poll_loop(
        &self,
        id: &str,
        mut client_id: u64,
        request_id: Vec<u8>,
        mut challenge_url: String,
        interval: Duration,
    ) {
        loop {
            tokio::time::sleep(interval).await;
            let polled: Result<CAuthentication_PollAuthSessionStatus_Response, _> = self
                .call(
                    HttpMethod::Post,
                    "PollAuthSessionStatus",
                    &CAuthentication_PollAuthSessionStatus_Request {
                        client_id: Some(client_id),
                        request_id: Some(request_id.clone()),
                        ..Default::default()
                    },
                )
                .await;
            let p = match polled {
                Ok(p) => p,
                // Transient: keep polling until the flow deadline.
                Err(WebAuthError::Network | WebAuthError::Timeout) => continue,
                Err(WebAuthError::EResult(n)) => {
                    self.flows
                        .set_status(id, FlowStatus::error(FlowErrorReason::Eresult, Some(n)));
                    return;
                }
                Err(WebAuthError::Protocol(_)) => {
                    self.flows
                        .set_status(id, FlowStatus::error(FlowErrorReason::Network, None));
                    return;
                }
            };
            if p.has_new_client_id() {
                client_id = p.new_client_id();
                if p.has_new_challenge_url() {
                    challenge_url = p.new_challenge_url().to_string();
                }
                self.flows.update_challenge(id, &challenge_url);
            }
            if p.has_refresh_token() {
                let token = p.refresh_token().to_string();
                let steam_id = jwt_sub(&token).unwrap_or_default();
                self.flows.set_status(
                    id,
                    FlowStatus::Done {
                        refresh_token: token,
                        account_name: p.account_name().to_string(),
                        steam_id,
                    },
                );
                return;
            }
        }
    }

    /// Local read of a flow's status. `Done` and `Error` are read-once: the flow is removed.
    pub fn status(&self, flow_id: &str) -> FlowStatus {
        let mut m = self.flows.lock();
        let Some(f) = m.get(flow_id) else {
            return FlowStatus::error(FlowErrorReason::UnknownFlow, None);
        };
        match &f.status {
            FlowStatus::Done { .. } | FlowStatus::Error { .. } => m
                .remove(flow_id)
                .map(|f| f.status)
                .unwrap_or_else(|| FlowStatus::error(FlowErrorReason::UnknownFlow, None)),
            s => s.clone(),
        }
    }

    /// Stop a flow. A later `status()` reports `error cancelled` once, then `unknownFlow`.
    pub fn cancel(&self, flow_id: &str) {
        let mut m = self.flows.lock();
        if let Some(f) = m.get_mut(flow_id) {
            if let Some(h) = f.handle.take() {
                h.abort();
            }
            if matches!(
                f.status,
                FlowStatus::Waiting { .. } | FlowStatus::GuardRequired { .. }
            ) {
                f.status = FlowStatus::error(FlowErrorReason::Cancelled, None);
                crate::error::diag(&format!("webauth {} flow -> cancelled", f.kind.name()));
            }
        }
    }

    /// Abort every poll task (crate shutdown).
    pub fn cancel_all(&self) {
        let mut m = self.flows.lock();
        for f in m.values_mut() {
            if let Some(h) = f.handle.take() {
                h.abort();
            }
        }
        m.clear();
    }
}

impl Flows {
    fn update_challenge(&self, id: &str, url: &str) {
        if let Some(f) = self.lock().get_mut(id) {
            if let FlowStatus::Waiting { challenge_url } = &mut f.status {
                *challenge_url = url.to_string();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::mock::{Mock, Reply};
    use super::*;
    use steam_vent_proto::steammessages_auth_steamclient::{
        CAuthentication_GetPasswordRSAPublicKey_Request,
        CAuthentication_GetPasswordRSAPublicKey_Response,
        CAuthentication_PollAuthSessionStatus_Request,
        CAuthentication_PollAuthSessionStatus_Response,
    };

    const POLL: &str = "/IAuthenticationService/PollAuthSessionStatus/v1";

    fn poll_req() -> CAuthentication_PollAuthSessionStatus_Request {
        CAuthentication_PollAuthSessionStatus_Request {
            client_id: Some(77),
            request_id: Some(vec![1, 2, 3]),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn post_sends_form_input_and_parses_body() {
        crate::install_crypto_provider();
        let mock = Mock::start().await;
        let rsp = CAuthentication_PollAuthSessionStatus_Response {
            new_client_id: Some(99),
            ..Default::default()
        };
        mock.push(POLL, Reply::ok(rsp.write_to_bytes().unwrap()));
        let wa = WebAuth::new(mock.base_url());
        let got: CAuthentication_PollAuthSessionStatus_Response = wa
            .call(HttpMethod::Post, "PollAuthSessionStatus", &poll_req())
            .await
            .unwrap();
        assert_eq!(got.new_client_id(), 99);
        let reqs = mock.requests();
        assert_eq!(reqs.len(), 1);
        assert_eq!(reqs[0].method, "POST");
        assert_eq!(reqs[0].path, POLL);
        let echoed =
            CAuthentication_PollAuthSessionStatus_Request::parse_from_bytes(&reqs[0].input)
                .unwrap();
        assert_eq!(echoed.client_id(), 77);
    }

    #[tokio::test]
    async fn get_sends_query_input() {
        crate::install_crypto_provider();
        let mock = Mock::start().await;
        let path = "/IAuthenticationService/GetPasswordRSAPublicKey/v1";
        mock.push(path, Reply::ok(Vec::new()));
        let wa = WebAuth::new(mock.base_url());
        let req = CAuthentication_GetPasswordRSAPublicKey_Request {
            account_name: Some("abc".into()),
            ..Default::default()
        };
        let _: CAuthentication_GetPasswordRSAPublicKey_Response = wa
            .call(HttpMethod::Get, "GetPasswordRSAPublicKey", &req)
            .await
            .unwrap();
        let reqs = mock.requests();
        assert_eq!(reqs[0].method, "GET");
        let echoed =
            CAuthentication_GetPasswordRSAPublicKey_Request::parse_from_bytes(&reqs[0].input)
                .unwrap();
        assert_eq!(echoed.account_name(), "abc");
    }

    #[tokio::test]
    async fn non_one_eresult_is_error_and_missing_header_is_protocol() {
        crate::install_crypto_provider();
        let mock = Mock::start().await;
        mock.push(POLL, Reply::eresult(5));
        mock.push(
            POLL,
            Reply {
                status: 200,
                x_eresult: None,
                body: Vec::new(),
            },
        );
        let wa = WebAuth::new(mock.base_url());
        let r1: Result<CAuthentication_PollAuthSessionStatus_Response, _> = wa
            .call(HttpMethod::Post, "PollAuthSessionStatus", &poll_req())
            .await;
        assert_eq!(r1.err(), Some(WebAuthError::EResult(5)));
        let r2: Result<CAuthentication_PollAuthSessionStatus_Response, _> = wa
            .call(HttpMethod::Post, "PollAuthSessionStatus", &poll_req())
            .await;
        assert_eq!(r2.err(), Some(WebAuthError::Protocol("missing-x-eresult")));
    }

    #[tokio::test]
    async fn oversize_body_is_error() {
        crate::install_crypto_provider();
        let mock = Mock::start().await;
        mock.push(POLL, Reply::ok(vec![0u8; MAX_BODY + 1]));
        let wa = WebAuth::new(mock.base_url());
        let r: Result<CAuthentication_PollAuthSessionStatus_Response, _> = wa
            .call(HttpMethod::Post, "PollAuthSessionStatus", &poll_req())
            .await;
        assert_eq!(r.err(), Some(WebAuthError::Protocol("body-too-large")));
    }

    #[tokio::test(start_paused = true)]
    async fn stalled_call_times_out() {
        crate::install_crypto_provider();
        // A listener that accepts and never answers.
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", l.local_addr().unwrap());
        let _hold = tokio::spawn(async move {
            let _keep = l.accept().await;
            std::future::pending::<()>().await;
        });
        let wa = WebAuth::new(base);
        let r: Result<CAuthentication_PollAuthSessionStatus_Response, _> = wa
            .call(HttpMethod::Post, "PollAuthSessionStatus", &poll_req())
            .await;
        assert_eq!(r.err(), Some(WebAuthError::Timeout));
    }

    // ---- QR flow ----

    use steam_vent_proto::steammessages_auth_steamclient::{
        CAuthentication_BeginAuthSessionViaQR_Request,
        CAuthentication_BeginAuthSessionViaQR_Response,
    };

    const BEGIN: &str = "/IAuthenticationService/BeginAuthSessionViaQR/v1";

    fn begin_reply(url: &str, interval: f32) -> Reply {
        Reply::ok(
            CAuthentication_BeginAuthSessionViaQR_Response {
                client_id: Some(1000),
                challenge_url: Some(url.into()),
                request_id: Some(vec![9, 9]),
                interval: Some(interval),
                ..Default::default()
            }
            .write_to_bytes()
            .unwrap(),
        )
    }

    fn pending() -> Reply {
        Reply::ok(
            CAuthentication_PollAuthSessionStatus_Response::default()
                .write_to_bytes()
                .unwrap(),
        )
    }

    fn jwt(sub: &str) -> String {
        let e = |s: &str| base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(s);
        format!("{}.{}.sig", e("{}"), e(&format!("{{\"sub\":\"{sub}\"}}")))
    }

    fn waiting_url(s: FlowStatus) -> String {
        match s {
            FlowStatus::Waiting { challenge_url } => challenge_url,
            _ => panic!("not waiting"),
        }
    }

    /// Fast pacing for real-time tests: 20 ms polls, 1 s flow deadline.
    fn fast(base: String) -> WebAuth {
        WebAuth::new(base).with_timing(Timing {
            min_interval: Duration::from_millis(20),
            max_interval: Duration::from_millis(20),
            flow_timeout: Duration::from_secs(1),
        })
    }

    async fn sleep_ms(n: u64) {
        tokio::time::sleep(Duration::from_millis(n)).await;
    }

    #[test]
    fn interval_is_clamped_to_1_10_seconds() {
        let t = Timing::PRODUCTION;
        assert_eq!(t.clamp_interval(0.1), Duration::from_secs(1));
        assert_eq!(t.clamp_interval(5.0), Duration::from_secs(5));
        assert_eq!(t.clamp_interval(99.0), Duration::from_secs(10));
        assert_eq!(t.flow_timeout, Duration::from_secs(120));
    }

    #[tokio::test]
    async fn qr_begin_uses_steam_client_platform() {
        crate::install_crypto_provider();
        let mock = Mock::start().await;
        mock.push(BEGIN, begin_reply("https://s.team/q/1", 5.0));
        mock.set_default(POLL, pending());
        let wa = fast(mock.base_url());
        let st = wa.qr_start().await.unwrap();
        assert_eq!(st.challenge_url, "https://s.team/q/1");
        let req = CAuthentication_BeginAuthSessionViaQR_Request::parse_from_bytes(
            &mock.requests()[0].input,
        )
        .unwrap();
        assert_eq!(
            req.platform_type.unwrap().enum_value_or_default(),
            EAuthTokenPlatformType::k_EAuthTokenPlatformType_SteamClient
        );
        wa.flows.set_status(
            &st.flow_id,
            FlowStatus::error(FlowErrorReason::Cancelled, None),
        );
        wa.cancel_all();
    }

    #[tokio::test]
    async fn qr_rotation_swaps_client_id_and_url() {
        crate::install_crypto_provider();
        let mock = Mock::start().await;
        mock.push(BEGIN, begin_reply("https://s.team/q/1", 5.0));
        mock.push(
            POLL,
            Reply::ok(
                CAuthentication_PollAuthSessionStatus_Response {
                    new_client_id: Some(2000),
                    new_challenge_url: Some("https://s.team/q/2".into()),
                    ..Default::default()
                }
                .write_to_bytes()
                .unwrap(),
            ),
        );
        mock.set_default(POLL, pending());
        let wa = fast(mock.base_url());
        let st = wa.qr_start().await.unwrap();
        sleep_ms(120).await;
        assert_eq!(waiting_url(wa.status(&st.flow_id)), "https://s.team/q/2");
        sleep_ms(100).await;
        let polls: Vec<_> = mock
            .requests()
            .into_iter()
            .filter(|r| r.path == POLL)
            .collect();
        assert!(polls.len() >= 2);
        let first =
            CAuthentication_PollAuthSessionStatus_Request::parse_from_bytes(&polls[0].input)
                .unwrap();
        let second =
            CAuthentication_PollAuthSessionStatus_Request::parse_from_bytes(&polls[1].input)
                .unwrap();
        assert_eq!(first.client_id(), 1000);
        assert_eq!(second.client_id(), 2000);
        wa.cancel_all();
    }

    #[tokio::test]
    async fn qr_done_hands_token_out_once() {
        crate::install_crypto_provider();
        let mock = Mock::start().await;
        mock.push(BEGIN, begin_reply("https://s.team/q/1", 2.0));
        let token = jwt("76561198000000001");
        mock.push(
            POLL,
            Reply::ok(
                CAuthentication_PollAuthSessionStatus_Response {
                    refresh_token: Some(token.clone()),
                    account_name: Some("someone".into()),
                    ..Default::default()
                }
                .write_to_bytes()
                .unwrap(),
            ),
        );
        let wa = fast(mock.base_url());
        let st = wa.qr_start().await.unwrap();
        sleep_ms(150).await;
        match wa.status(&st.flow_id) {
            FlowStatus::Done {
                refresh_token,
                account_name,
                steam_id,
            } => {
                assert_eq!(refresh_token, token);
                assert_eq!(account_name, "someone");
                assert_eq!(steam_id, "76561198000000001");
            }
            _ => panic!("not done"),
        }
        assert!(matches!(
            wa.status(&st.flow_id),
            FlowStatus::Error {
                reason: FlowErrorReason::UnknownFlow,
                ..
            }
        ));
    }

    #[tokio::test]
    async fn qr_times_out_after_120s() {
        crate::install_crypto_provider();
        let mock = Mock::start().await;
        mock.push(BEGIN, begin_reply("https://s.team/q/1", 5.0));
        mock.set_default(POLL, pending());
        let wa = fast(mock.base_url());
        let st = wa.qr_start().await.unwrap();
        sleep_ms(500).await;
        assert!(matches!(wa.status(&st.flow_id), FlowStatus::Waiting { .. }));
        sleep_ms(700).await;
        assert!(matches!(
            wa.status(&st.flow_id),
            FlowStatus::Error {
                reason: FlowErrorReason::Timeout,
                ..
            }
        ));
    }

    #[tokio::test]
    async fn cancel_stops_polling() {
        crate::install_crypto_provider();
        let mock = Mock::start().await;
        mock.push(BEGIN, begin_reply("https://s.team/q/1", 5.0));
        mock.set_default(POLL, pending());
        let wa = fast(mock.base_url());
        let st = wa.qr_start().await.unwrap();
        sleep_ms(120).await;
        wa.cancel(&st.flow_id);
        let n = mock.count(POLL);
        sleep_ms(300).await;
        assert_eq!(mock.count(POLL), n);
        assert!(matches!(
            wa.status(&st.flow_id),
            FlowStatus::Error {
                reason: FlowErrorReason::Cancelled,
                ..
            }
        ));
        assert!(matches!(
            wa.status(&st.flow_id),
            FlowStatus::Error {
                reason: FlowErrorReason::UnknownFlow,
                ..
            }
        ));
    }

    #[tokio::test]
    async fn second_qr_start_cancels_first() {
        crate::install_crypto_provider();
        let mock = Mock::start().await;
        mock.push(BEGIN, begin_reply("https://s.team/q/1", 5.0));
        mock.push(BEGIN, begin_reply("https://s.team/q/2", 5.0));
        mock.set_default(POLL, pending());
        let wa = fast(mock.base_url());
        let a = wa.qr_start().await.unwrap();
        let b = wa.qr_start().await.unwrap();
        assert_ne!(a.flow_id, b.flow_id);
        assert!(matches!(
            wa.status(&a.flow_id),
            FlowStatus::Error {
                reason: FlowErrorReason::UnknownFlow,
                ..
            }
        ));
        assert!(matches!(wa.status(&b.flow_id), FlowStatus::Waiting { .. }));
        wa.cancel_all();
    }

    #[tokio::test]
    async fn poll_eresult_ends_flow() {
        crate::install_crypto_provider();
        let mock = Mock::start().await;
        mock.push(BEGIN, begin_reply("https://s.team/q/1", 2.0));
        mock.push(POLL, Reply::eresult(27));
        let wa = fast(mock.base_url());
        let st = wa.qr_start().await.unwrap();
        sleep_ms(150).await;
        assert!(matches!(
            wa.status(&st.flow_id),
            FlowStatus::Error {
                reason: FlowErrorReason::Eresult,
                eresult: Some(27)
            }
        ));
    }

    #[test]
    fn status_serializes_camel_case() {
        let v = serde_json::to_value(FlowStatus::Waiting {
            challenge_url: "u".into(),
        })
        .unwrap();
        assert_eq!(
            v,
            serde_json::json!({"status":"waiting","challengeUrl":"u"})
        );
        let v =
            serde_json::to_value(FlowStatus::error(FlowErrorReason::UnknownFlow, None)).unwrap();
        assert_eq!(
            v,
            serde_json::json!({"status":"error","reason":"unknownFlow"})
        );
    }
}
