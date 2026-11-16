//! Credentials sign-in over the Web API: `GetPasswordRSAPublicKey` -> RSA PKCS#1 v1.5 encrypt ->
//! `BeginAuthSessionViaCredentials` -> optional `UpdateAuthSessionWithSteamGuardCode` -> the
//! shared poll loop from `webauth/mod.rs`. No CM logon (D-05).
//!
//! D-08: no machine token or guard data is read, sent or persisted; this module writes no files.
//! Secret hygiene (T-79-32): the password and guard code are never logged and no struct holding
//! them derives `Debug`.
//!
//! Live-only gaps (not provable against the mock): typed email and mobile-authenticator codes
//! against real Steam, and which confirmations a given account really offers. They are covered by
//! the UAT-A items in plan 79-25.

use super::{
    device_details, FlowErrorReason, FlowKind, FlowState, FlowStatus, Flows, HttpMethod, WebAuth,
    WebAuthError, DEVICE_NAME,
};
use rsa::rand_core::OsRng;
use rsa::{BigUint, Pkcs1v15Encrypt, RsaPublicKey};
use serde::Serialize;
use steam_vent_proto::enums::ESessionPersistence;
use steam_vent_proto::protobuf::{EnumOrUnknown, MessageField};
use steam_vent_proto::steammessages_auth_steamclient::{
    CAuthentication_BeginAuthSessionViaCredentials_Request,
    CAuthentication_BeginAuthSessionViaCredentials_Response,
    CAuthentication_GetPasswordRSAPublicKey_Request,
    CAuthentication_GetPasswordRSAPublicKey_Response,
    CAuthentication_UpdateAuthSessionWithSteamGuardCode_Request, EAuthSessionGuardType,
    EAuthTokenPlatformType,
};
use tokio::time::Instant;

/// `website_id` steam-session sends for SteamClient logins (AuthenticationClient._getPlatformData).
const WEBSITE_ID: &str = "Unknown";

/// Result of `credentials_start`. The password is gone by the time this exists.
#[derive(Clone, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum CredStarted {
    #[serde(rename_all = "camelCase")]
    GuardRequired { flow_id: String, guard_type: String },
    #[serde(rename_all = "camelCase")]
    Waiting { flow_id: String },
}

/// Result of `guard_submit`. A wrong code is `Err(WebAuthError::EResult(65))` and leaves the flow
/// alive for another attempt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GuardOutcome {
    Accepted,
    /// No such flow, or it is not waiting for a code.
    UnknownFlow,
}

impl GuardOutcome {
    /// Reason to report for the non-accepted outcome.
    pub fn error_reason(self) -> Option<FlowErrorReason> {
        match self {
            GuardOutcome::Accepted => None,
            GuardOutcome::UnknownFlow => Some(FlowErrorReason::UnknownFlow),
        }
    }
}

/// Encrypt `password` with Steam's RSA key (hex modulus and exponent), PKCS#1 v1.5. The password
/// buffer is overwritten before returning (best effort: no zeroize crate, and the compiler is
/// kept from eliding the write with `black_box`).
fn encrypt_password(
    password: String,
    modulus: &str,
    exponent: &str,
) -> Result<String, WebAuthError> {
    use base64::Engine;
    let mut bytes = password.into_bytes();
    let key = (|| {
        let n = BigUint::parse_bytes(modulus.trim().as_bytes(), 16)?;
        let e = BigUint::parse_bytes(exponent.trim().as_bytes(), 16)?;
        RsaPublicKey::new(n, e).ok()
    })();
    let out = match key {
        Some(k) => k
            .encrypt(&mut OsRng, Pkcs1v15Encrypt, &bytes)
            .map(|c| base64::engine::general_purpose::STANDARD.encode(c))
            .map_err(|_| WebAuthError::Protocol("rsa-encrypt")),
        None => Err(WebAuthError::Protocol("rsa-key")),
    };
    bytes.fill(0);
    std::hint::black_box(&bytes);
    out
}

/// Which allowed confirmation, if any, asks for a typed code.
fn code_guard_type(types: &[EAuthSessionGuardType]) -> Option<&'static str> {
    types.iter().find_map(|t| match t {
        EAuthSessionGuardType::k_EAuthSessionGuardType_EmailCode => Some("email"),
        EAuthSessionGuardType::k_EAuthSessionGuardType_DeviceCode => Some("device"),
        _ => None,
    })
}

impl WebAuth {
    /// Start a credentials sign-in. Takes the password by value and drops it after encryption.
    pub async fn credentials_start(
        &self,
        account_name: &str,
        password: String,
    ) -> Result<CredStarted, WebAuthError> {
        let key: CAuthentication_GetPasswordRSAPublicKey_Response = self
            .call(
                HttpMethod::Get,
                "GetPasswordRSAPublicKey",
                &CAuthentication_GetPasswordRSAPublicKey_Request {
                    account_name: Some(account_name.to_string()),
                    ..Default::default()
                },
            )
            .await?;
        let encrypted = encrypt_password(password, key.publickey_mod(), key.publickey_exp())?;

        let begin: CAuthentication_BeginAuthSessionViaCredentials_Response = self
            .call(
                HttpMethod::Post,
                "BeginAuthSessionViaCredentials",
                &CAuthentication_BeginAuthSessionViaCredentials_Request {
                    device_friendly_name: Some(DEVICE_NAME.into()),
                    account_name: Some(account_name.to_string()),
                    encrypted_password: Some(encrypted),
                    encryption_timestamp: Some(key.timestamp()),
                    remember_login: Some(true),
                    platform_type: Some(EnumOrUnknown::new(
                        EAuthTokenPlatformType::k_EAuthTokenPlatformType_SteamClient,
                    )),
                    persistence: Some(EnumOrUnknown::new(
                        ESessionPersistence::k_ESessionPersistence_Persistent,
                    )),
                    website_id: Some(WEBSITE_ID.into()),
                    device_details: MessageField::some(device_details()),
                    ..Default::default()
                },
            )
            .await?;

        let types: Vec<EAuthSessionGuardType> = begin
            .allowed_confirmations
            .iter()
            .map(|c| c.confirmation_type())
            .collect();
        for t in &types {
            use EAuthSessionGuardType as G;
            if !matches!(
                t,
                G::k_EAuthSessionGuardType_None
                    | G::k_EAuthSessionGuardType_EmailCode
                    | G::k_EAuthSessionGuardType_DeviceCode
                    | G::k_EAuthSessionGuardType_DeviceConfirmation
                    | G::k_EAuthSessionGuardType_EmailConfirmation
            ) {
                crate::error::diag(&format!(
                    "webauth credentials: unknown confirmation type {}",
                    *t as i32
                ));
            }
        }
        let guard = code_guard_type(&types);

        let client_id = begin.client_id();
        let request_id = begin.request_id().to_vec();
        let interval = self.timing.clamp_interval(begin.interval());
        let id = self.flows.new_id();
        let deadline = Instant::now() + self.timing.credentials_timeout;

        let mut m = self.flows.lock();
        // userSignIn.ts parity: a new credentials attempt replaces the previous one.
        Flows::replace_live(&mut m, FlowKind::Credentials);
        let me = self.clone();
        let task_id = id.clone();
        let handle = tokio::spawn(async move {
            let run = me.qr_poll_loop(&task_id, client_id, request_id, String::new(), interval);
            if tokio::time::timeout_at(deadline, run).await.is_err() {
                me.flows
                    .set_status(&task_id, FlowStatus::error(FlowErrorReason::Timeout, None));
            }
            me.flows
                .expire_after(&task_id, me.timing.terminal_ttl)
                .await;
        });
        let status = match guard {
            Some(g) => FlowStatus::GuardRequired {
                guard_type: g.to_string(),
            },
            None => FlowStatus::Waiting {
                challenge_url: String::new(),
            },
        };
        m.insert(
            id.clone(),
            FlowState {
                kind: FlowKind::Credentials,
                status,
                handle: Some(handle),
                guard_ctx: Some((client_id, begin.steamid())),
            },
        );
        crate::error::diag(if guard.is_some() {
            "webauth credentials flow -> guardRequired"
        } else {
            "webauth credentials flow -> waiting"
        });
        Ok(match guard {
            Some(g) => CredStarted::GuardRequired {
                flow_id: id,
                guard_type: g.to_string(),
            },
            None => CredStarted::Waiting { flow_id: id },
        })
    }

    /// Submit a typed Steam Guard code for a flow in `guardRequired`.
    ///
    /// Normalisation matches `submitSteamGuardCode` in userSignIn.ts (line 386, trim + upper-case);
    /// the upper-casing is applied to email codes only, as it is a no-op for numeric device codes.
    /// An EResult error (65 = wrong code) leaves the flow in `guardRequired`.
    pub async fn guard_submit(
        &self,
        flow_id: &str,
        code: &str,
    ) -> Result<GuardOutcome, WebAuthError> {
        let (client_id, steam_id, email) = {
            let m = self.flows.lock();
            match m.get(flow_id) {
                Some(FlowState {
                    status: FlowStatus::GuardRequired { guard_type },
                    guard_ctx: Some((c, s)),
                    ..
                }) => (*c, *s, guard_type == "email"),
                _ => return Ok(GuardOutcome::UnknownFlow),
            }
        };
        let trimmed = code.trim();
        let (code, code_type) = if email {
            (
                trimmed.to_uppercase(),
                EAuthSessionGuardType::k_EAuthSessionGuardType_EmailCode,
            )
        } else {
            (
                trimmed.to_string(),
                EAuthSessionGuardType::k_EAuthSessionGuardType_DeviceCode,
            )
        };
        let _: steam_vent_proto::steammessages_auth_steamclient::CAuthentication_UpdateAuthSessionWithSteamGuardCode_Response =
            self.call(
                HttpMethod::Post,
                "UpdateAuthSessionWithSteamGuardCode",
                &CAuthentication_UpdateAuthSessionWithSteamGuardCode_Request {
                    client_id: Some(client_id),
                    steamid: Some(steam_id),
                    code: Some(code),
                    code_type: Some(EnumOrUnknown::new(code_type)),
                    ..Default::default()
                },
            )
            .await?;
        Ok(GuardOutcome::Accepted)
    }
}

#[cfg(test)]
mod tests {
    use super::super::mock::{Mock, Reply};
    use super::super::{Timing, WebAuth};
    use super::*;
    use rsa::traits::PublicKeyParts;
    use rsa::RsaPrivateKey;
    use std::time::Duration;
    use steam_vent_proto::protobuf::Message;
    use steam_vent_proto::steammessages_auth_steamclient::{
        CAuthentication_AllowedConfirmation, CAuthentication_PollAuthSessionStatus_Response,
    };

    const RSA: &str = "/IAuthenticationService/GetPasswordRSAPublicKey/v1";
    const BEGIN: &str = "/IAuthenticationService/BeginAuthSessionViaCredentials/v1";
    const POLL: &str = "/IAuthenticationService/PollAuthSessionStatus/v1";
    const GUARD: &str = "/IAuthenticationService/UpdateAuthSessionWithSteamGuardCode/v1";
    const PASSWORD: &str = "hunter2-very-secret";

    fn fast(base: String) -> WebAuth {
        WebAuth::new(base).with_timing(Timing {
            min_interval: Duration::from_millis(20),
            max_interval: Duration::from_millis(20),
            flow_timeout: Duration::from_secs(1),
            credentials_timeout: Duration::from_secs(1),
            terminal_ttl: Duration::from_secs(30),
        })
    }

    fn priv_key() -> RsaPrivateKey {
        RsaPrivateKey::new(&mut OsRng, 1024).unwrap()
    }

    fn rsa_reply(k: &RsaPrivateKey) -> Reply {
        Reply::ok(
            CAuthentication_GetPasswordRSAPublicKey_Response {
                publickey_mod: Some(format!("{:x}", k.n())),
                publickey_exp: Some(format!("{:x}", k.e())),
                timestamp: Some(4242),
                ..Default::default()
            }
            .write_to_bytes()
            .unwrap(),
        )
    }

    fn begin_reply(types: &[EAuthSessionGuardType]) -> Reply {
        Reply::ok(
            CAuthentication_BeginAuthSessionViaCredentials_Response {
                client_id: Some(555),
                request_id: Some(vec![7]),
                interval: Some(0.0),
                steamid: Some(76561198000000001),
                allowed_confirmations: types
                    .iter()
                    .map(|t| CAuthentication_AllowedConfirmation {
                        confirmation_type: Some(EnumOrUnknown::new(*t)),
                        ..Default::default()
                    })
                    .collect(),
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

    fn done(sub: &str) -> Reply {
        use base64::Engine;
        let e = |s: &str| base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(s);
        let jwt = format!("{}.{}.sig", e("{}"), e(&format!("{{\"sub\":\"{sub}\"}}")));
        Reply::ok(
            CAuthentication_PollAuthSessionStatus_Response {
                refresh_token: Some(jwt),
                account_name: Some("acct".into()),
                ..Default::default()
            }
            .write_to_bytes()
            .unwrap(),
        )
    }

    async fn sleep_ms(n: u64) {
        tokio::time::sleep(Duration::from_millis(n)).await;
    }

    use EAuthSessionGuardType as G;

    async fn start(types: &[G]) -> (Mock, WebAuth, Result<CredStarted, WebAuthError>) {
        crate::install_crypto_provider();
        let mock = Mock::start().await;
        let k = priv_key();
        mock.push(RSA, rsa_reply(&k));
        mock.push(BEGIN, begin_reply(types));
        mock.set_default(POLL, pending());
        let wa = fast(mock.base_url());
        let r = wa.credentials_start("acct", PASSWORD.to_string()).await;
        (mock, wa, r)
    }

    #[tokio::test]
    async fn encrypts_with_pkcs1v15_and_never_posts_plaintext() {
        crate::install_crypto_provider();
        let mock = Mock::start().await;
        let k = priv_key();
        mock.push(RSA, rsa_reply(&k));
        mock.push(BEGIN, begin_reply(&[G::k_EAuthSessionGuardType_None]));
        mock.set_default(POLL, pending());
        let wa = fast(mock.base_url());
        wa.credentials_start("acct", PASSWORD.to_string())
            .await
            .unwrap();
        let reqs = mock.requests();
        assert_eq!(reqs[0].method, "GET");
        let rsa_req =
            CAuthentication_GetPasswordRSAPublicKey_Request::parse_from_bytes(&reqs[0].input)
                .unwrap();
        assert_eq!(rsa_req.account_name(), "acct");
        let begin = reqs.iter().find(|r| r.path == BEGIN).unwrap();
        assert_eq!(begin.method, "POST");
        assert!(!begin
            .input
            .windows(PASSWORD.len())
            .any(|w| w == PASSWORD.as_bytes()));
        let msg =
            CAuthentication_BeginAuthSessionViaCredentials_Request::parse_from_bytes(&begin.input)
                .unwrap();
        assert_eq!(msg.encryption_timestamp(), 4242);
        assert_eq!(msg.account_name(), "acct");
        assert_eq!(
            msg.platform_type.unwrap().enum_value_or_default(),
            EAuthTokenPlatformType::k_EAuthTokenPlatformType_SteamClient
        );
        assert_eq!(
            msg.persistence.unwrap().enum_value_or_default(),
            ESessionPersistence::k_ESessionPersistence_Persistent
        );
        assert!(msg.remember_login());
        assert!(!msg.has_guard_data());
        // The ciphertext decrypts (PKCS#1 v1.5) to the password.
        use base64::Engine;
        let ct = base64::engine::general_purpose::STANDARD
            .decode(msg.encrypted_password())
            .unwrap();
        let pt = k.decrypt(Pkcs1v15Encrypt, &ct).unwrap();
        assert_eq!(pt, PASSWORD.as_bytes());
    }

    #[test]
    fn password_buffer_is_consumed_and_bad_key_is_protocol_error() {
        let r = encrypt_password("pw".into(), "zz", "03");
        assert_eq!(r.err(), Some(WebAuthError::Protocol("rsa-key")));
    }

    #[tokio::test]
    async fn email_code_maps_to_guard_required_email() {
        let (_m, _wa, r) = start(&[G::k_EAuthSessionGuardType_EmailCode]).await;
        match r.unwrap() {
            CredStarted::GuardRequired { guard_type, .. } => assert_eq!(guard_type, "email"),
            _ => panic!("expected guard"),
        }
    }

    #[tokio::test]
    async fn device_code_maps_to_guard_required_device() {
        let (_m, _wa, r) = start(&[G::k_EAuthSessionGuardType_DeviceCode]).await;
        match r.unwrap() {
            CredStarted::GuardRequired { guard_type, .. } => assert_eq!(guard_type, "device"),
            _ => panic!("expected guard"),
        }
    }

    #[tokio::test]
    async fn confirmations_and_none_map_to_waiting() {
        for t in [
            G::k_EAuthSessionGuardType_DeviceConfirmation,
            G::k_EAuthSessionGuardType_EmailConfirmation,
            G::k_EAuthSessionGuardType_None,
            G::k_EAuthSessionGuardType_Unknown,
        ] {
            let (_m, _wa, r) = start(&[t]).await;
            assert!(matches!(r.unwrap(), CredStarted::Waiting { .. }), "{t:?}");
        }
    }

    #[tokio::test]
    async fn none_polls_to_done() {
        let (mock, wa, r) = start(&[G::k_EAuthSessionGuardType_None]).await;
        let CredStarted::Waiting { flow_id } = r.unwrap() else {
            panic!("waiting")
        };
        mock.push(POLL, done("76561198000000001"));
        sleep_ms(150).await;
        match wa.status(&flow_id) {
            FlowStatus::Done {
                steam_id,
                account_name,
                ..
            } => {
                assert_eq!(steam_id, "76561198000000001");
                assert_eq!(account_name, "acct");
            }
            _ => panic!("expected done"),
        }
    }

    #[tokio::test]
    async fn code_plus_confirmation_is_guard_and_app_approval_still_completes() {
        let (mock, wa, r) = start(&[
            G::k_EAuthSessionGuardType_DeviceCode,
            G::k_EAuthSessionGuardType_DeviceConfirmation,
        ])
        .await;
        let CredStarted::GuardRequired {
            flow_id,
            guard_type,
        } = r.unwrap()
        else {
            panic!("guard")
        };
        assert_eq!(guard_type, "device");
        assert!(matches!(
            wa.status(&flow_id),
            FlowStatus::GuardRequired { .. }
        ));
        mock.push(POLL, done("1"));
        sleep_ms(150).await;
        assert!(matches!(wa.status(&flow_id), FlowStatus::Done { .. }));
    }

    #[tokio::test]
    async fn begin_eresult_5_is_error_and_leaves_no_flow() {
        crate::install_crypto_provider();
        let mock = Mock::start().await;
        let k = priv_key();
        mock.push(RSA, rsa_reply(&k));
        mock.push(BEGIN, Reply::eresult(5));
        let wa = fast(mock.base_url());
        let r = wa.credentials_start("acct", PASSWORD.to_string()).await;
        assert!(matches!(r, Err(WebAuthError::EResult(5))));
        assert!(wa.flows.lock().is_empty());
    }

    #[tokio::test]
    async fn rsa_key_failure_is_reported() {
        crate::install_crypto_provider();
        let mock = Mock::start().await;
        mock.push(RSA, Reply::eresult(2));
        let wa = fast(mock.base_url());
        let r = wa.credentials_start("acct", PASSWORD.to_string()).await;
        assert!(matches!(r, Err(WebAuthError::EResult(2))));
        assert_eq!(mock.count(BEGIN), 0);
    }

    fn guard_req(mock: &Mock) -> CAuthentication_UpdateAuthSessionWithSteamGuardCode_Request {
        let r = mock.requests().into_iter().rev().find(|r| r.path == GUARD);
        CAuthentication_UpdateAuthSessionWithSteamGuardCode_Request::parse_from_bytes(
            &r.unwrap().input,
        )
        .unwrap()
    }

    #[tokio::test]
    async fn email_code_is_uppercased_and_typed_email() {
        let (mock, wa, r) = start(&[G::k_EAuthSessionGuardType_EmailCode]).await;
        let CredStarted::GuardRequired { flow_id, .. } = r.unwrap() else {
            panic!()
        };
        mock.push(GUARD, Reply::ok(Vec::new()));
        let out = wa.guard_submit(&flow_id, " kqm4f ").await.unwrap();
        assert_eq!(out, GuardOutcome::Accepted);
        let g = guard_req(&mock);
        assert_eq!(g.code(), "KQM4F");
        assert_eq!(g.client_id(), 555);
        assert_eq!(g.steamid(), 76561198000000001);
        assert_eq!(
            g.code_type.unwrap().enum_value_or_default(),
            G::k_EAuthSessionGuardType_EmailCode
        );
    }

    #[tokio::test]
    async fn device_code_is_only_trimmed() {
        let (mock, wa, r) = start(&[G::k_EAuthSessionGuardType_DeviceCode]).await;
        let CredStarted::GuardRequired { flow_id, .. } = r.unwrap() else {
            panic!()
        };
        mock.push(GUARD, Reply::ok(Vec::new()));
        wa.guard_submit(&flow_id, " 1a2b3 ").await.unwrap();
        let g = guard_req(&mock);
        assert_eq!(g.code(), "1a2b3");
        assert_eq!(
            g.code_type.unwrap().enum_value_or_default(),
            G::k_EAuthSessionGuardType_DeviceCode
        );
    }

    #[tokio::test]
    async fn wrong_code_keeps_flow_alive_then_second_submit_completes() {
        let (mock, wa, r) = start(&[G::k_EAuthSessionGuardType_EmailCode]).await;
        let CredStarted::GuardRequired { flow_id, .. } = r.unwrap() else {
            panic!()
        };
        mock.push(GUARD, Reply::eresult(65));
        mock.push(GUARD, Reply::ok(Vec::new()));
        let first = wa.guard_submit(&flow_id, "AAAAA").await;
        assert!(matches!(first, Err(WebAuthError::EResult(65))));
        assert!(matches!(
            wa.status(&flow_id),
            FlowStatus::GuardRequired { .. }
        ));
        assert_eq!(
            wa.guard_submit(&flow_id, "BBBBB").await.unwrap(),
            GuardOutcome::Accepted
        );
        mock.push(POLL, done("9"));
        sleep_ms(150).await;
        match wa.status(&flow_id) {
            FlowStatus::Done { refresh_token, .. } => assert!(!refresh_token.is_empty()),
            _ => panic!("expected done"),
        }
        assert_eq!(mock.count(GUARD), 2);
    }

    #[tokio::test]
    async fn unknown_flow_is_reported_without_a_request() {
        crate::install_crypto_provider();
        let mock = Mock::start().await;
        let wa = fast(mock.base_url());
        let out = wa.guard_submit("nope", "12345").await.unwrap();
        assert_eq!(out, GuardOutcome::UnknownFlow);
        assert_eq!(out.error_reason(), Some(FlowErrorReason::UnknownFlow));
        assert_eq!(mock.count(GUARD), 0);
    }

    #[tokio::test]
    async fn flow_not_awaiting_a_code_is_unknown() {
        let (mock, wa, r) = start(&[G::k_EAuthSessionGuardType_DeviceConfirmation]).await;
        let CredStarted::Waiting { flow_id } = r.unwrap() else {
            panic!()
        };
        let out = wa.guard_submit(&flow_id, "12345").await.unwrap();
        assert_eq!(out, GuardOutcome::UnknownFlow);
        assert_eq!(mock.count(GUARD), 0);
    }
}
