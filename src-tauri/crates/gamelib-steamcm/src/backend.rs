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
    /// Binary KV `purchase_receipt_info`; empty when the CM sent none.
    pub receipt: Vec<u8>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PersonaRaw {
    pub steam_id: u64,
    pub persona_state: u32,
    pub name: String,
    pub avatar_hash: Vec<u8>,
}

/// Persona state Steam pushes at and after logon, keyed by SteamID. One cache lives per
/// connection, so it is scoped to the current logon: a logout, rebuild or replacement drops the
/// connection and the cache with it. Entries without a name are ignored (a flag-limited push
/// carries no name and would shadow a useful one). Persona names are never logged.
#[derive(Debug, Clone, Default)]
pub struct PersonaCache(
    std::sync::Arc<std::sync::Mutex<std::collections::HashMap<u64, PersonaRaw>>>,
);

impl PersonaCache {
    pub fn absorb(&self, personas: impl IntoIterator<Item = PersonaRaw>) {
        if let Ok(mut m) = self.0.lock() {
            for p in personas {
                if !p.name.is_empty() {
                    m.insert(p.steam_id, p);
                }
            }
        }
    }

    /// The cached personas for every requested id, or `None` unless all of them are cached (a
    /// partial hit falls through to the CM request).
    pub fn lookup(&self, steam_ids: &[u64]) -> Option<Vec<PersonaRaw>> {
        if steam_ids.is_empty() {
            return None;
        }
        let m = self.0.lock().ok()?;
        let mut out = Vec::new();
        for id in steam_ids {
            if out.iter().any(|p: &PersonaRaw| p.steam_id == *id) {
                continue;
            }
            out.push(m.get(id)?.clone());
        }
        Some(out)
    }
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

    /// The cell id the CM assigned at logon (steam-user's `this.cellID`, from the logon
    /// response), or 0 when unknown. steam-user requests CDN servers for this cell.
    fn cell_id(&self) -> u32 {
        0
    }

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

#[cfg(test)]
mod persona_cache_tests {
    use super::*;

    fn p(id: u64, name: &str) -> PersonaRaw {
        PersonaRaw {
            steam_id: id,
            persona_state: 1,
            name: name.into(),
            avatar_hash: vec![1],
        }
    }

    #[test]
    fn hit_needs_every_id_and_a_name() {
        let c = PersonaCache::default();
        assert!(c.lookup(&[1]).is_none());
        c.absorb([p(1, "a"), p(2, "")]);
        assert_eq!(c.lookup(&[1]).unwrap().len(), 1);
        assert!(c.lookup(&[1, 2]).is_none());
        assert!(c.lookup(&[]).is_none());
        c.absorb([p(2, "b"), p(1, "a2")]);
        let got = c.lookup(&[1, 2, 1]).unwrap();
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].name, "a2");
    }

    #[test]
    fn clones_share_and_fresh_cache_is_empty() {
        let c = PersonaCache::default();
        let c2 = c.clone();
        c.absorb([p(7, "x")]);
        assert!(c2.lookup(&[7]).is_some());
        // A new logon builds a new cache: nothing carries over.
        assert!(PersonaCache::default().lookup(&[7]).is_none());
    }
}
