//! The steam-vent backed `CmBackend`. Every `steam_vent` import in the crate lives here.
//!
//! Errors are mapped to a numeric EResult first (`map_err`), carrying variant names only, never
//! message bodies (T-79-11). The refresh token is only ever read through
//! `RefreshTokenSecret::expose`.

use std::pin::pin;
use std::sync::{Mutex, Once};
use std::time::Duration;

use futures_util::StreamExt;
use steam_vent::auth::{RefreshToken, RefreshTokenError};
use steam_vent::connection::UnAuthenticatedConnection;
use steam_vent::{
    Connection, ConnectionError, ConnectionTrait, LoginError, NetworkError, ReadonlyConnection,
    ServerList,
};
use steam_vent_proto::steammessages_clientserver::CMsgClientLicenseList;
use steam_vent_proto::steammessages_clientserver_2::{
    CMsgClientGetDepotDecryptionKey, CMsgClientGetDepotDecryptionKeyResponse,
    CMsgClientPurchaseResponse, CMsgClientRegisterKey,
};
use steam_vent_proto::steammessages_clientserver_appinfo::{
    cmsg_client_picsproduct_info_request, CMsgClientPICSAccessTokenRequest,
    CMsgClientPICSAccessTokenResponse, CMsgClientPICSProductInfoRequest,
    CMsgClientPICSProductInfoResponse,
};
use steam_vent_proto::steammessages_clientserver_friends::CMsgClientPersonaState;
use steam_vent_proto::steammessages_clientserver_login::CMsgClientLoggedOff;
use steam_vent_proto::steammessages_contentsystem_steamclient::{
    CContentServerDirectory_GetManifestRequestCode_Request,
    CContentServerDirectory_GetServersForSteamPipe_Request,
};
use steam_vent_proto::steammessages_player_steamclient::{
    CPlayer_GetOwnedGames_Request, CPlayer_GetPlayerLinkDetails_Request,
};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use crate::backend::*;
use crate::error::{diag, CmError, ERESULT_EXPIRED, ERESULT_LOGON_SESSION_REPLACED};

const LICENSE_LIST_TIMEOUT: Duration = Duration::from_secs(10);
const PROBE_APP: u32 = 480;

#[derive(Debug, Default, Clone, Copy)]
pub struct SteamVentBackend;

pub struct VentConn {
    conn: Mutex<Option<Connection>>,
    forwarder: Mutex<Vec<JoinHandle<()>>>,
    /// Persona state pushed since this logon; dies with the connection.
    personas: PersonaCache,
}

impl VentConn {
    fn new(conn: Connection, forwarder: Vec<JoinHandle<()>>, personas: PersonaCache) -> Self {
        Self {
            conn: Mutex::new(Some(conn)),
            forwarder: Mutex::new(forwarder),
            personas,
        }
    }

    fn conn(&self) -> Result<Connection, CmError> {
        self.conn
            .lock()
            .map_err(|_| CmError::Protocol("poisoned".into()))?
            .clone()
            .ok_or(CmError::Closed)
    }
}

impl Drop for VentConn {
    fn drop(&mut self) {
        self.close();
    }
}

fn guard_env() -> Result<(), CmError> {
    if std::env::var_os("SSLKEYLOGFILE").is_some() {
        return Err(CmError::Protocol("sslkeylogfile-set".into()));
    }
    Ok(())
}

fn map_net(e: NetworkError) -> CmError {
    use std::io::ErrorKind::*;
    match e {
        NetworkError::Timeout => CmError::Timeout,
        NetworkError::EOF | NetworkError::Ws(_) => CmError::Closed,
        NetworkError::IO(io) => match io.kind() {
            BrokenPipe | ConnectionReset | ConnectionAborted | UnexpectedEof | NotConnected => {
                CmError::Closed
            }
            k => CmError::Io(format!("{k:?}")),
        },
        NetworkError::ApiError(r) => from_eresult(r as i32),
        NetworkError::InvalidHeader => CmError::Protocol("InvalidHeader".into()),
        NetworkError::InvalidMessageKind(_) => CmError::Protocol("InvalidMessageKind".into()),
        NetworkError::CryptoHandshakeFailed => CmError::Protocol("CryptoHandshakeFailed".into()),
        NetworkError::DifferentMessage(..) => CmError::Protocol("DifferentMessage".into()),
        NetworkError::DifferentServiceMethod(..) => {
            CmError::Protocol("DifferentServiceMethod".into())
        }
        NetworkError::MalformedBody(_) => CmError::Protocol("MalformedBody".into()),
        NetworkError::CryptoError(_) => CmError::Protocol("CryptoError".into()),
        _ => CmError::Protocol("NetworkError".into()),
    }
}

fn from_eresult(n: i32) -> CmError {
    if n == ERESULT_LOGON_SESSION_REPLACED {
        CmError::Replaced
    } else {
        CmError::EResult(n)
    }
}

fn map_err(e: ConnectionError) -> CmError {
    match e {
        ConnectionError::Network(n) => map_net(n),
        ConnectionError::LoginError(l) => match l {
            LoginError::InvalidCredentials => CmError::EResult(5),
            LoginError::Unknown(r) => from_eresult(r as i32),
            LoginError::AccessToken(RefreshTokenError::Expired) => {
                CmError::EResult(ERESULT_EXPIRED)
            }
            LoginError::AccessToken(_) => CmError::Protocol("AccessToken".into()),
            LoginError::SteamGuardRequired => CmError::Protocol("SteamGuardRequired".into()),
            LoginError::RateLimited => CmError::Protocol("RateLimited".into()),
            LoginError::UnavailableAccount => CmError::Protocol("UnavailableAccount".into()),
            LoginError::InvalidSteamId => CmError::Protocol("InvalidSteamId".into()),
            _ => CmError::Protocol("LoginError".into()),
        },
        ConnectionError::Aborted => CmError::Protocol("Aborted".into()),
        _ => CmError::Protocol("ConnectionError".into()),
    }
}

async fn discover_and_connect() -> Result<UnAuthenticatedConnection, CmError> {
    // A fresh pick each time (a stale server is the usual reason to reconnect).
    let servers = ServerList::discover()
        .await
        .map_err(|_| CmError::Discovery)?;
    UnAuthenticatedConnection::connect(&servers)
        .await
        .map_err(map_err)
}

impl CmBackend for SteamVentBackend {
    type Conn = VentConn;

    async fn connect_authed(
        &self,
        token: &RefreshTokenSecret,
        logon_id: u32,
    ) -> Result<Authed<VentConn>, CmError> {
        guard_env()?;
        let refresh = RefreshToken::new(token.expose().to_string()).map_err(|e| match e {
            RefreshTokenError::Expired => CmError::EResult(ERESULT_EXPIRED),
            _ => CmError::Protocol("AccessToken".into()),
        })?;
        let steam_id = u64::from(refresh.subject);
        let unauth = discover_and_connect().await?;
        // Subscribe BEFORE logon: the licence list and a LoggedOff can arrive the instant logon
        // completes (CF-04).
        let mut licenses = Box::pin(unauth.on::<CMsgClientLicenseList>());
        let mut logged_off = Box::pin(unauth.on::<CMsgClientLoggedOff>());
        let mut persona_pushes = Box::pin(unauth.on::<CMsgClientPersonaState>());
        let conn = unauth
            .login_with_refresh_token_and_logon_id(&refresh, logon_id)
            .await
            .map_err(map_err)?;
        let list = match tokio::time::timeout(LICENSE_LIST_TIMEOUT, licenses.next()).await {
            Ok(Some(Ok(l))) => l,
            _ => return Err(CmError::Protocol("no-license-list".into())),
        };
        let (tx, rx) = mpsc::channel(4);
        let forwarder = tokio::spawn(async move {
            while let Some(Ok(off)) = logged_off.next().await {
                if tx.send(off.eresult()).await.is_err() {
                    break;
                }
            }
        });
        let cache = PersonaCache::default();
        let sink = cache.clone();
        let collector = tokio::spawn(async move {
            while let Some(Ok(state)) = persona_pushes.next().await {
                sink.absorb(state.friends.iter().map(|f| PersonaRaw {
                    steam_id: f.friendid(),
                    persona_state: f.persona_state(),
                    name: f.player_name().to_string(),
                    avatar_hash: f.avatar_hash().to_vec(),
                }));
            }
        });
        Ok(Authed {
            conn: VentConn::new(conn, vec![forwarder, collector], cache),
            steam_id,
            licenses: list
                .licenses
                .iter()
                .map(|l| LicenseEntry {
                    package_id: l.package_id(),
                    time_created: l.time_created(),
                    owner_id: l.owner_id(),
                    access_token: l.access_token(),
                    license_type: l.license_type(),
                    flags: l.flags(),
                })
                .collect(),
            logged_off: rx,
        })
    }

    async fn connect_anon(&self) -> Result<VentConn, CmError> {
        guard_env()?;
        let conn = discover_and_connect()
            .await?
            .anonymous()
            .await
            .map_err(map_err)?;
        Ok(VentConn::new(conn, Vec::new(), PersonaCache::default()))
    }
}

impl CmConn for VentConn {
    async fn pics_access_tokens(
        &self,
        apps: Vec<u32>,
        packages: Vec<u32>,
    ) -> Result<AccessTokens, CmError> {
        let c = self.conn()?;
        let r: CMsgClientPICSAccessTokenResponse = c
            .job(CMsgClientPICSAccessTokenRequest {
                appids: apps,
                packageids: packages,
                ..Default::default()
            })
            .await
            .map_err(map_net)?;
        Ok(AccessTokens {
            apps: r
                .app_access_tokens
                .iter()
                .map(|t| (t.appid(), t.access_token()))
                .collect(),
            packages: r
                .package_access_tokens
                .iter()
                .map(|t| (t.packageid(), t.access_token()))
                .collect(),
            denied_apps: r.app_denied_tokens.clone(),
            denied_packages: r.package_denied_tokens.clone(),
        })
    }

    async fn pics_product_info(&self, req: PicsRequest) -> Result<PicsRaw, CmError> {
        let c = self.conn()?;
        let msg = CMsgClientPICSProductInfoRequest {
            apps: req
                .apps
                .iter()
                .map(|a| cmsg_client_picsproduct_info_request::AppInfo {
                    appid: Some(a.id),
                    access_token: Some(a.access_token),
                    ..Default::default()
                })
                .collect(),
            packages: req
                .packages
                .iter()
                .map(|p| cmsg_client_picsproduct_info_request::PackageInfo {
                    packageid: Some(p.id),
                    access_token: Some(p.access_token),
                    ..Default::default()
                })
                .collect(),
            meta_data_only: Some(req.meta_data_only),
            ..Default::default()
        };
        let mut out = PicsRaw::default();
        let mut parts = pin!(c.job_multi::<_, CMsgClientPICSProductInfoResponse>(msg));
        while let Some(part) = parts.next().await {
            let part = part.map_err(map_net)?;
            out.apps.extend(part.apps.iter().map(|a| PicsAppRaw {
                app_id: a.appid(),
                change_number: a.change_number(),
                missing_token: a.missing_token(),
                buffer: a.buffer().to_vec(),
            }));
            out.packages
                .extend(part.packages.iter().map(|p| PicsPackageRaw {
                    package_id: p.packageid(),
                    change_number: p.change_number(),
                    missing_token: p.missing_token(),
                    buffer: p.buffer().to_vec(),
                }));
            out.unknown_app_ids.extend(part.unknown_appids.iter());
            out.unknown_package_ids
                .extend(part.unknown_packageids.iter());
        }
        Ok(out)
    }

    async fn depot_key(&self, app_id: u32, depot_id: u32) -> Result<DepotKeyRaw, CmError> {
        let c = self.conn()?;
        let r: CMsgClientGetDepotDecryptionKeyResponse = c
            .job(CMsgClientGetDepotDecryptionKey {
                depot_id: Some(depot_id),
                app_id: Some(app_id),
                ..Default::default()
            })
            .await
            .map_err(map_net)?;
        Ok(DepotKeyRaw {
            eresult: r.eresult(),
            key: r.depot_encryption_key().to_vec(),
        })
    }

    async fn manifest_request_code(
        &self,
        app_id: u32,
        depot_id: u32,
        manifest_id: u64,
        branch: String,
    ) -> Result<u64, CmError> {
        let c = self.conn()?;
        let r = c
            .service_method(CContentServerDirectory_GetManifestRequestCode_Request {
                app_id: Some(app_id),
                depot_id: Some(depot_id),
                manifest_id: Some(manifest_id),
                app_branch: Some(branch),
                ..Default::default()
            })
            .await
            .map_err(map_net)?;
        Ok(r.manifest_request_code())
    }

    async fn cdn_servers(&self, cell_id: u32, max: u32) -> Result<Vec<CdnServerRaw>, CmError> {
        let c = self.conn()?;
        let r = c
            .service_method(CContentServerDirectory_GetServersForSteamPipe_Request {
                cell_id: Some(cell_id),
                max_servers: Some(max),
                ..Default::default()
            })
            .await
            .map_err(map_net)?;
        Ok(r.servers
            .iter()
            .map(|s| CdnServerRaw {
                kind: s.type_().to_string(),
                host: s.host().to_string(),
                vhost: s.vhost().to_string(),
                https_support: s.https_support().to_string(),
                cell_id: s.cell_id(),
                load: s.load(),
                weighted_load: s.weighted_load(),
                use_as_proxy: s.use_as_proxy(),
                allowed_app_ids: s.allowed_app_ids.clone(),
                priority_class: s.priority_class(),
            })
            .collect())
    }

    fn cell_id(&self) -> u32 {
        // Set from the logon response's `cell_id` (steam-vent `Session::cell_id`).
        self.conn().map(|c| c.cell_id()).unwrap_or(0)
    }

    async fn owned_games(
        &self,
        steam_id: u64,
        opts: OwnedOpts,
    ) -> Result<Vec<OwnedGameRaw>, CmError> {
        let c = self.conn()?;
        let r = c
            .service_method(CPlayer_GetOwnedGames_Request {
                steamid: Some(steam_id),
                include_appinfo: Some(opts.include_appinfo),
                include_played_free_games: Some(opts.include_played_free_games),
                include_free_sub: Some(opts.include_free_sub),
                skip_unvetted_apps: Some(opts.skip_unvetted_apps),
                ..Default::default()
            })
            .await
            .map_err(map_net)?;
        Ok(r.games
            .iter()
            .map(|g| OwnedGameRaw {
                app_id: g.appid(),
                name: g.name().to_string(),
                playtime_forever: g.playtime_forever(),
                rtime_last_played: g.rtime_last_played(),
            })
            .collect())
    }

    async fn register_key(&self, key: String) -> Result<PurchaseRaw, CmError> {
        let c = self.conn()?;
        let r: CMsgClientPurchaseResponse = c
            .job(CMsgClientRegisterKey {
                key: Some(key),
                ..Default::default()
            })
            .await
            .map_err(map_net)?;
        Ok(PurchaseRaw {
            eresult: r.eresult(),
            purchase_result_details: r.purchase_result_details(),
            receipt: r.purchase_receipt_info().to_vec(),
        })
    }

    async fn personas(&self, steam_ids: Vec<u64>) -> Result<Vec<PersonaRaw>, CmError> {
        if let Some(hit) = self.personas.lookup(&steam_ids) {
            return Ok(hit);
        }
        let c = self.conn()?;
        // Player.GetPlayerLinkDetails, never ClientRequestFriendData: a friend-data request from
        // this session signed Mac Steam out of Friends & Chat at every sign-in (79-44 UAT item 24,
        // bisected live 2026-11-16). The link-details read is the profile service the Steam web UI
        // uses and does not touch the friends system.
        let r = c
            .service_method(CPlayer_GetPlayerLinkDetails_Request {
                steamids: steam_ids.clone(),
                ..Default::default()
            })
            .await
            .map_err(map_net)?;
        Ok(r.accounts
            .iter()
            .filter_map(|a| {
                let public = a.public_data.as_ref()?;
                let id = public.steamid();
                if !steam_ids.contains(&id) {
                    return None;
                }
                Some(PersonaRaw {
                    steam_id: id,
                    persona_state: a
                        .private_data
                        .as_ref()
                        .map(|p| p.persona_state() as u32)
                        .unwrap_or(0),
                    name: public.persona_name().to_string(),
                    avatar_hash: public.sha_digest_avatar().to_vec(),
                })
            })
            .collect())
    }

    async fn probe(&self) -> Result<(), CmError> {
        self.pics_access_tokens(vec![PROBE_APP], vec![])
            .await
            .map(|_| ())
    }

    fn close(&self) {
        if let Ok(mut c) = self.conn.lock() {
            c.take();
        }
        if let Ok(mut f) = self.forwarder.lock() {
            for h in f.drain(..) {
                h.abort();
            }
        }
    }
}

/// Forwards steam-vent's WARN+ tracing events to the crate diagnostic sink. steam-vent's heartbeat
/// and read-loop failures surface only through tracing (spike 085), so without this they are
/// invisible. Hand-written on `tracing` 0.1: no `tracing-subscriber` crate.
struct VentLogForwarder;

struct MessageVisitor(String);

impl tracing::field::Visit for MessageVisitor {
    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        if field.name() == "message" {
            self.0 = format!("{value:?}");
        }
    }
}

impl tracing::Subscriber for VentLogForwarder {
    fn enabled(&self, m: &tracing::Metadata<'_>) -> bool {
        m.target().starts_with("steam_vent") && *m.level() <= tracing::Level::WARN
    }

    fn max_level_hint(&self) -> Option<tracing::level_filters::LevelFilter> {
        Some(tracing::level_filters::LevelFilter::WARN)
    }

    fn new_span(&self, _: &tracing::span::Attributes<'_>) -> tracing::span::Id {
        tracing::span::Id::from_u64(1)
    }

    fn record(&self, _: &tracing::span::Id, _: &tracing::span::Record<'_>) {}

    fn record_follows_from(&self, _: &tracing::span::Id, _: &tracing::span::Id) {}

    fn event(&self, event: &tracing::Event<'_>) {
        let mut v = MessageVisitor(String::new());
        event.record(&mut v);
        let m = event.metadata();
        diag(&format!("{} {}: {}", m.target(), m.level(), v.0));
    }

    fn enter(&self, _: &tracing::span::Id) {}

    fn exit(&self, _: &tracing::span::Id) {}
}

/// Idempotent. If another global subscriber is already set, this is a no-op.
pub fn install_vent_log_forwarder() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let _ = tracing::subscriber::set_global_default(VentLogForwarder);
    });
}

#[allow(dead_code)]
fn _assert_send_sync() {
    fn is<T: Send + Sync>() {}
    is::<VentConn>();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn network_failures_are_transient_never_refusals() {
        for e in [
            map_net(NetworkError::Timeout),
            map_net(NetworkError::EOF),
            map_net(NetworkError::IO(std::io::ErrorKind::BrokenPipe.into())),
            map_net(NetworkError::IO(std::io::ErrorKind::Other.into())),
        ] {
            assert!(crate::error::is_transient(&e), "{e:?}");
            assert!(!crate::error::is_credential_refusal(&e));
        }
        assert_eq!(map_net(NetworkError::Timeout), CmError::Timeout);
        assert_eq!(map_net(NetworkError::EOF), CmError::Closed);
    }

    #[test]
    fn login_errors_map_to_eresults() {
        assert_eq!(
            map_err(ConnectionError::LoginError(LoginError::InvalidCredentials)),
            CmError::EResult(5)
        );
        assert_eq!(
            map_err(ConnectionError::LoginError(LoginError::AccessToken(
                RefreshTokenError::Expired
            ))),
            CmError::EResult(27)
        );
        assert_eq!(
            map_err(ConnectionError::Network(NetworkError::Timeout)),
            CmError::Timeout
        );
        assert_eq!(from_eresult(34), CmError::Replaced);
        assert_eq!(from_eresult(15), CmError::EResult(15));
    }

    #[tokio::test]
    async fn sslkeylogfile_makes_connect_fail_closed() {
        std::env::set_var("SSLKEYLOGFILE", "/dev/null");
        let r = SteamVentBackend
            .connect_authed(&RefreshTokenSecret::new("x".into()), 0)
            .await;
        let a = SteamVentBackend.connect_anon().await;
        std::env::remove_var("SSLKEYLOGFILE");
        assert_eq!(r.err(), Some(CmError::Protocol("sslkeylogfile-set".into())));
        assert_eq!(a.err(), Some(CmError::Protocol("sslkeylogfile-set".into())));
    }

    #[test]
    fn forwarder_install_is_idempotent() {
        install_vent_log_forwarder();
        install_vent_log_forwarder();
    }

    /// Spike 073 shape: anonymous PICS product info for app 480.
    #[tokio::test]
    #[ignore = "needs network"]
    async fn vent_anon_pics_live() {
        crate::install_crypto_provider();
        let c = SteamVentBackend.connect_anon().await.expect("anon");
        let tokens = c
            .pics_access_tokens(vec![480], vec![])
            .await
            .expect("tokens");
        let at = tokens.apps.first().map(|t| t.1).unwrap_or(0);
        let raw = c
            .pics_product_info(PicsRequest {
                apps: vec![PicsId {
                    id: 480,
                    access_token: at,
                }],
                packages: vec![],
                meta_data_only: false,
            })
            .await
            .expect("pics");
        assert_eq!(raw.apps.len(), 1);
        assert!(!raw.apps[0].buffer.is_empty());
        c.probe().await.expect("probe");
        c.close();
        assert_eq!(c.probe().await, Err(CmError::Closed));
    }

    /// Reads the dev vault; skips when it holds no token. Prints counts only.
    #[tokio::test]
    #[ignore = "needs network and a dev vault token"]
    async fn vent_authed_live() {
        crate::install_crypto_provider();
        let path = std::env::temp_dir().join("gamelib-dev-secret-vault.json");
        let Ok(text) = std::fs::read_to_string(&path) else {
            eprintln!("skip: no dev vault");
            return;
        };
        let v: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
        let Some(tok) = v["steam-refresh-token"].as_str() else {
            eprintln!("skip: no steam-refresh-token in dev vault");
            return;
        };
        let a = SteamVentBackend
            .connect_authed(&RefreshTokenSecret::new(tok.to_string()), 0)
            .await
            .expect("authed");
        assert_ne!(a.steam_id, 0);
        assert!(!a.licenses.is_empty());
        let owned = a
            .conn
            .owned_games(
                a.steam_id,
                OwnedOpts {
                    include_appinfo: true,
                    include_played_free_games: true,
                    include_free_sub: false,
                    skip_unvetted_apps: true,
                },
            )
            .await
            .expect("owned");
        assert!(!owned.is_empty());
        eprintln!("licenses={} owned={}", a.licenses.len(), owned.len());
    }
}
