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
use std::time::Duration;
use steam_vent_proto::protobuf::Message;

/// Production Web API base URL.
pub const STEAM_API_BASE: &str = "https://api.steampowered.com";

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
}

impl WebAuth {
    pub fn new(base_url: impl Into<String>) -> Self {
        WebAuth {
            base_url: base_url.into(),
            client: reqwest::Client::new(),
        }
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
}
