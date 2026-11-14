//! Permanent API-shape regression test for steam-vent rev bumps (CF-02).
//!
//! The async fns below are never run (`#[allow(dead_code)]`); they only have to COMPILE. Each one
//! references the steam-vent / steam-vent-proto items Phase 79 uses, so a rev bump that renames or
//! reshapes one fails here with a precise error instead of deep inside a later plan.
//!
//! `anon_logon_live` is `#[ignore]`d (needs the network): it proves the anonymous-logon fix that
//! rev 767481ad carries. Run it with `-- --ignored anon_logon_live`.

use futures_util::StreamExt;
use std::time::Duration;
use steam_vent::auth::{RefreshToken, RefreshTokenError};
use steam_vent::connection::UnAuthenticatedConnection;
use steam_vent::{
    Connection, ConnectionError, ConnectionTrait, LoginError, NetworkError, ReadonlyConnection,
    ServerList,
};
use steam_vent_proto::steammessages_auth_steamclient::{
    CAuthentication_BeginAuthSessionViaCredentials_Request,
    CAuthentication_BeginAuthSessionViaCredentials_Response,
    CAuthentication_BeginAuthSessionViaQR_Request, CAuthentication_BeginAuthSessionViaQR_Response,
    CAuthentication_GetPasswordRSAPublicKey_Request,
    CAuthentication_GetPasswordRSAPublicKey_Response,
    CAuthentication_PollAuthSessionStatus_Request, CAuthentication_PollAuthSessionStatus_Response,
    CAuthentication_UpdateAuthSessionWithSteamGuardCode_Request, EAuthTokenPlatformType,
};
use steam_vent_proto::steammessages_clientserver::CMsgClientLicenseList;
use steam_vent_proto::steammessages_clientserver_2::{
    CMsgClientGetDepotDecryptionKey, CMsgClientGetDepotDecryptionKeyResponse,
    CMsgClientPurchaseResponse, CMsgClientRegisterKey,
};
use steam_vent_proto::steammessages_clientserver_appinfo::{
    CMsgClientPICSAccessTokenRequest, CMsgClientPICSAccessTokenResponse,
    CMsgClientPICSProductInfoRequest, CMsgClientPICSProductInfoResponse,
};
use steam_vent_proto::steammessages_clientserver_friends::{
    CMsgClientPersonaState, CMsgClientRequestFriendData,
};
use steam_vent_proto::steammessages_clientserver_login::CMsgClientLoggedOff;
use steam_vent_proto::steammessages_contentsystem_steamclient::{
    CContentServerDirectory_GetManifestRequestCode_Request,
    CContentServerDirectory_GetServersForSteamPipe_Request,
};
use steam_vent_proto::steammessages_player_steamclient::CPlayer_GetOwnedGames_Request;

type R<T> = Result<T, Box<dyn std::error::Error>>;

/// Discover, connect, subscribe BEFORE logon (CF-04), then refresh-token logon with no account
/// name (CF-03) and a logon id.
#[allow(dead_code)]
async fn logon_shapes(raw_token: String) -> R<Connection> {
    let token = RefreshToken::new(raw_token)?;
    let _steam_id = token.subject;
    let servers = ServerList::discover().await?;
    let unauth = UnAuthenticatedConnection::connect(&servers).await?;
    let mut licenses = Box::pin(unauth.on::<CMsgClientLicenseList>());
    let mut logged_off = Box::pin(unauth.on::<CMsgClientLoggedOff>());
    let conn = unauth
        .login_with_refresh_token_and_logon_id(&token, 0)
        .await?;
    let _: Option<Result<CMsgClientLicenseList, NetworkError>> = licenses.next().await;
    let _: Option<Result<CMsgClientLoggedOff, NetworkError>> = logged_off.next().await;
    Ok(conn)
}

#[allow(dead_code)]
async fn anonymous_shape() -> R<Connection> {
    let servers = ServerList::discover().await?;
    let unauth = UnAuthenticatedConnection::connect(&servers).await?;
    Ok(unauth.anonymous().await?)
}

/// PICS access tokens before product info (CF-05), `job_multi` for the multi-part reply, the depot
/// key job, and the redeem job.
#[allow(dead_code)]
async fn job_shapes(conn: &Connection) -> R<()> {
    let _: CMsgClientPICSAccessTokenResponse = conn
        .job(CMsgClientPICSAccessTokenRequest {
            appids: vec![480],
            packageids: vec![1],
            ..Default::default()
        })
        .await?;
    let mut parts = std::pin::pin!(conn.job_multi::<_, CMsgClientPICSProductInfoResponse>(
        CMsgClientPICSProductInfoRequest::default()
    ));
    while let Some(part) = parts.next().await {
        let _: CMsgClientPICSProductInfoResponse = part?;
    }
    let key: CMsgClientGetDepotDecryptionKeyResponse = conn
        .job(CMsgClientGetDepotDecryptionKey {
            depot_id: Some(1),
            app_id: Some(1),
            ..Default::default()
        })
        .await?;
    let _: i32 = key.eresult();
    let _: &[u8] = key.depot_encryption_key();
    let _: CMsgClientPurchaseResponse = conn
        .job(CMsgClientRegisterKey {
            key: Some("AAAAA-BBBBB-CCCCC".into()),
            ..Default::default()
        })
        .await?;
    Ok(())
}

#[allow(dead_code)]
async fn service_method_shapes(conn: &Connection) -> R<()> {
    let code = conn
        .service_method(CContentServerDirectory_GetManifestRequestCode_Request {
            app_id: Some(1),
            depot_id: Some(1),
            manifest_id: Some(1),
            app_branch: Some("public".into()),
            ..Default::default()
        })
        .await?;
    let _: u64 = code.manifest_request_code();
    let servers = conn
        .service_method(CContentServerDirectory_GetServersForSteamPipe_Request {
            cell_id: Some(0),
            max_servers: Some(20),
            ..Default::default()
        })
        .await?;
    for s in &servers.servers {
        let _: (&str, &str, &str, bool, u32) = (
            s.host(),
            s.vhost(),
            s.type_(),
            s.https_support() == "mandatory",
            s.weighted_load() as u32,
        );
    }
    let owned = conn
        .service_method(CPlayer_GetOwnedGames_Request {
            steamid: Some(1),
            include_appinfo: Some(true),
            include_played_free_games: Some(true),
            include_free_sub: Some(false),
            skip_unvetted_apps: Some(true),
            ..Default::default()
        })
        .await?;
    for g in &owned.games {
        let _: (i32, &str, i32, u32) = (
            g.appid(),
            g.name(),
            g.playtime_forever(),
            g.rtime_last_played(),
        );
    }
    Ok(())
}

/// getPersonas (D-06): ask for friend data, listen for the persona state.
#[allow(dead_code)]
async fn persona_shapes(conn: &Connection) -> R<()> {
    let mut personas = Box::pin(conn.on::<CMsgClientPersonaState>());
    conn.send(CMsgClientRequestFriendData {
        persona_state_requested: Some(4),
        friends: vec![1],
        ..Default::default()
    })
    .await?;
    let _: Option<Result<CMsgClientPersonaState, NetworkError>> = personas.next().await;
    Ok(())
}

/// The Web API auth message pairs the credentials and QR sign-in paths (CF-08) build and parse.
#[allow(dead_code)]
fn auth_message_shapes() {
    let _ = CAuthentication_GetPasswordRSAPublicKey_Request::default();
    let _ = CAuthentication_GetPasswordRSAPublicKey_Response::default();
    let _ = CAuthentication_BeginAuthSessionViaCredentials_Request::default();
    let _ = CAuthentication_BeginAuthSessionViaCredentials_Response::default();
    let _ = CAuthentication_BeginAuthSessionViaQR_Request::default();
    let _ = CAuthentication_BeginAuthSessionViaQR_Response::default();
    let _ = CAuthentication_PollAuthSessionStatus_Request::default();
    let _ = CAuthentication_PollAuthSessionStatus_Response::default();
    let _ = CAuthentication_UpdateAuthSessionWithSteamGuardCode_Request::default();
    let _ = EAuthTokenPlatformType::k_EAuthTokenPlatformType_SteamClient;
}

/// The error taxonomy the session layer maps to typed results.
#[allow(dead_code)]
fn error_shapes(e: ConnectionError) -> &'static str {
    match e {
        ConnectionError::LoginError(LoginError::InvalidCredentials) => "invalid-credentials",
        ConnectionError::LoginError(LoginError::Unknown(_)) => "unknown",
        ConnectionError::LoginError(LoginError::AccessToken(RefreshTokenError::Expired)) => {
            "expired"
        }
        _ => "other",
    }
}

#[test]
fn shapes_compile() {}

/// Proves the anonymous logon works on the pinned rev (the upstream fix 767481ad carries).
#[tokio::test]
#[ignore = "needs network"]
async fn anon_logon_live() {
    gamelib_steamcm::install_crypto_provider();
    let servers = ServerList::discover().await.expect("discover");
    let unauth = UnAuthenticatedConnection::connect(&servers)
        .await
        .expect("connect");
    let conn = unauth.anonymous().await.expect("anonymous logon");
    let resp: CMsgClientPICSAccessTokenResponse = tokio::time::timeout(
        Duration::from_secs(15),
        conn.job(CMsgClientPICSAccessTokenRequest {
            appids: vec![480],
            ..Default::default()
        }),
    )
    .await
    .expect("PICS timed out")
    .expect("PICS job");
    // App 480 (Spacewar) answers with an access-token entry or a denied-apps entry: one app either way.
    assert_eq!(
        resp.app_access_tokens.len() + resp.app_denied_tokens.len(),
        1
    );
}
