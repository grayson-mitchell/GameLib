//! The `CmBackend` / `CmConn` seam between the session layer and steam-vent (RESEARCH Pattern 2).
//!
//! Every steam-vent import lives in `vent.rs`; everything else is generic over these traits and is
//! tested with `fake::FakeBackend`. Raw structs carry decoded protobuf fields only: PICS buffers
//! stay bytes (text VDF for apps, 4-byte id prefix + binary KV for packages) for `ops/pics.rs`.
//!
//! Secret hygiene: no struct here derives `Debug` over a secret. `RefreshTokenSecret` redacts, and
//! `DepotKeyRaw` redacts its key.

use std::fmt;
use std::future::Future;

use crate::error::CmError;

/// A refresh token. No `Clone`, no `Display`, no `Serialize`, and `Debug` prints `<redacted>`.
pub struct RefreshTokenSecret(String);

impl RefreshTokenSecret {
    pub fn new(token: String) -> Self {
        Self(token)
    }

    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for RefreshTokenSecret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("RefreshTokenSecret(<redacted>)")
    }
}

/// One row of the CM licence list.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LicenseEntry {
    pub package_id: u32,
    pub time_created: u32,
    pub owner_id: u32,
    pub access_token: u64,
    pub license_type: u32,
    pub flags: u32,
}

/// A logged-on connection plus what arrived with the logon.
pub struct Authed<C> {
    pub conn: C,
    /// From the refresh token's JWT `sub` (CF-03).
    pub steam_id: u64,
    pub licenses: Vec<LicenseEntry>,
    /// Every `CMsgClientLoggedOff` eresult for the connection's whole life (CF-04, D-07).
    pub logged_off: tokio::sync::mpsc::Receiver<i32>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AccessTokens {
    pub apps: Vec<(u32, u64)>,
    pub packages: Vec<(u32, u64)>,
    pub denied_apps: Vec<u32>,
    pub denied_packages: Vec<u32>,
}

/// An id plus the PICS access token it is requested with (0 for none).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct PicsId {
    pub id: u32,
    pub access_token: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PicsRequest {
    pub apps: Vec<PicsId>,
    pub packages: Vec<PicsId>,
    pub meta_data_only: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PicsAppRaw {
    pub app_id: u32,
    pub change_number: u32,
    pub missing_token: bool,
    /// Text VDF.
    pub buffer: Vec<u8>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PicsPackageRaw {
    pub package_id: u32,
    pub change_number: u32,
    pub missing_token: bool,
    /// 4-byte id prefix + binary KV.
    pub buffer: Vec<u8>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PicsRaw {
    pub apps: Vec<PicsAppRaw>,
    pub packages: Vec<PicsPackageRaw>,
    pub unknown_app_ids: Vec<u32>,
    pub unknown_package_ids: Vec<u32>,
}

#[derive(Clone, Default, PartialEq, Eq)]
pub struct DepotKeyRaw {
    pub eresult: i32,
    pub key: Vec<u8>,
}

impl fmt::Debug for DepotKeyRaw {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("DepotKeyRaw")
            .field("eresult", &self.eresult)
            .field("key", &"<redacted>")
            .finish()
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct CdnServerRaw {
    pub kind: String,
    pub host: String,
    pub vhost: String,
    pub https_support: String,
    pub cell_id: i32,
    pub load: i32,
    pub weighted_load: f32,
    pub use_as_proxy: bool,
    pub allowed_app_ids: Vec<u32>,
    pub priority_class: u32,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct OwnedOpts {
    pub include_appinfo: bool,
    pub include_played_free_games: bool,
    pub include_free_sub: bool,
    pub skip_unvetted_apps: bool,
}

/// `appid` and `playtime_forever` are `i32` in this proto (79-01).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct OwnedGameRaw {
    pub app_id: i32,
    pub name: String,
    pub playtime_forever: i32,
    pub rtime_last_played: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PurchaseRaw {
    pub eresult: i32,
    pub purchase_result_details: i32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PersonaRaw {
    pub steam_id: u64,
    pub persona_state: u32,
    pub name: String,
    pub avatar_hash: Vec<u8>,
}

pub trait CmConn: Send + Sync + 'static {
    fn pics_access_tokens(
        &self,
        apps: Vec<u32>,
        packages: Vec<u32>,
    ) -> impl Future<Output = Result<AccessTokens, CmError>> + Send;

    fn pics_product_info(
        &self,
        req: PicsRequest,
    ) -> impl Future<Output = Result<PicsRaw, CmError>> + Send;

    fn depot_key(
        &self,
        app_id: u32,
        depot_id: u32,
    ) -> impl Future<Output = Result<DepotKeyRaw, CmError>> + Send;

    fn manifest_request_code(
        &self,
        app_id: u32,
        depot_id: u32,
        manifest_id: u64,
        branch: String,
    ) -> impl Future<Output = Result<u64, CmError>> + Send;

    fn cdn_servers(
        &self,
        cell_id: u32,
        max: u32,
    ) -> impl Future<Output = Result<Vec<CdnServerRaw>, CmError>> + Send;

    fn owned_games(
        &self,
        steam_id: u64,
        opts: OwnedOpts,
    ) -> impl Future<Output = Result<Vec<OwnedGameRaw>, CmError>> + Send;

    fn register_key(
        &self,
        key: String,
    ) -> impl Future<Output = Result<PurchaseRaw, CmError>> + Send;

    fn personas(
        &self,
        steam_ids: Vec<u64>,
    ) -> impl Future<Output = Result<Vec<PersonaRaw>, CmError>> + Send;

    /// A PICS access-token job for app 480: the cheapest round trip that proves the link is alive.
    fn probe(&self) -> impl Future<Output = Result<(), CmError>> + Send;

    /// Drop the connection. Later calls fail with `CmError::Closed`.
    fn close(&self);
}

pub trait CmBackend: Send + Sync + 'static {
    type Conn: CmConn;

    fn connect_authed(
        &self,
        token: &RefreshTokenSecret,
        logon_id: u32,
    ) -> impl Future<Output = Result<Authed<Self::Conn>, CmError>> + Send;

    fn connect_anon(&self) -> impl Future<Output = Result<Self::Conn, CmError>> + Send;
}
