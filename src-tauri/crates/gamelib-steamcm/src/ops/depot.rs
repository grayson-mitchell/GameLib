//! Depot key, manifest request code and CDN host ops, reproducing steam-user's shapes
//! (`components/cdn.js`) for the depot pipeline and today's TS callers.
//!
//! No CDN auth token is requested here (CF-06, 071a). The depot pipeline runs without tokens.
//!
//! Secret hygiene (T-28-04, T-79-30): depot keys and request codes are never passed to `diag`
//! or any log; they only travel in the returned JSON.
//!
//! Every op here is idempotent (Pitfall 5, D-02 retry-once): a repeat after a dead socket asks the
//! same read-only question.

use serde_json::{json, Map, Value};

use crate::backend::{CdnServerRaw, CmConn};
use crate::error::CmError;

pub const DEPOT_KEY_IDEMPOTENT: bool = true;
pub const REQUEST_CODE_IDEMPOTENT: bool = true;
pub const CONTENT_SERVERS_IDEMPOTENT: bool = true;

/// Servers asked for; the Steam client itself asks for 20.
const CDN_MAX_SERVERS: u32 = 20;
/// `eresult` 1 = OK.
const ERESULT_OK: i32 = 1;

fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes.iter().fold(String::new(), |mut s, b| {
        let _ = write!(s, "{b:02x}");
        s
    })
}

/// `{ eresult, keyHex }`. A non-OK eresult is `CmError::EResult(n)`.
pub async fn depot_key<C: CmConn>(conn: &C, app_id: u32, depot_id: u32) -> Result<Value, CmError> {
    let raw = conn.depot_key(app_id, depot_id).await?;
    if raw.eresult != ERESULT_OK {
        return Err(CmError::EResult(raw.eresult));
    }
    Ok(json!({ "eresult": raw.eresult, "keyHex": hex(&raw.key) }))
}

/// `{ requestCode: "<decimal>" }`. The manifest id is a decimal string (it can exceed 2^53).
pub async fn manifest_request_code<C: CmConn>(
    conn: &C,
    app_id: u32,
    depot_id: u32,
    manifest_id: &str,
    branch: &str,
) -> Result<Value, CmError> {
    let mid: u64 = manifest_id
        .parse()
        .map_err(|_| CmError::Protocol("bad-manifest-id".into()))?;
    let code = conn
        .manifest_request_code(app_id, depot_id, mid, branch.to_string())
        .await?;
    Ok(json!({ "requestCode": code.to_string() }))
}

fn server_json(s: &CdnServerRaw) -> Value {
    let mut m = Map::new();
    m.insert("type".into(), json!(s.kind));
    m.insert("cell".into(), json!(s.cell_id));
    // The directory returns load / weightedload as strings (planModel.ts cycle-8 note).
    m.insert("load".into(), json!(s.load.to_string()));
    m.insert("weightedload".into(), json!(s.weighted_load.to_string()));
    m.insert("Host".into(), json!(s.host));
    m.insert("vhost".into(), json!(s.vhost));
    m.insert("https_support".into(), json!(s.https_support));
    if !s.allowed_app_ids.is_empty() {
        m.insert("allowed_app_ids".into(), json!(s.allowed_app_ids));
    }
    Value::Object(m)
}

/// Host list in steam-user's `getContentServers` shape: only `CDN` / `SteamCache` servers, and
/// when `app_id` is given, servers whose `allowed_app_ids` (if any) include it. Empty is
/// `CmError::Protocol("no-content-servers")`, matching steam-user's rejection.
pub async fn content_servers<C: CmConn>(conn: &C, app_id: Option<u32>) -> Result<Value, CmError> {
    let raw = conn.cdn_servers(0, CDN_MAX_SERVERS).await?;
    let servers: Vec<Value> = raw
        .iter()
        .filter(|s| s.kind == "CDN" || s.kind == "SteamCache")
        .filter(|s| match app_id {
            Some(a) if !s.allowed_app_ids.is_empty() => s.allowed_app_ids.contains(&a),
            _ => true,
        })
        .map(server_json)
        .collect();
    if servers.is_empty() {
        return Err(CmError::Protocol("no-content-servers".into()));
    }
    Ok(Value::Array(servers))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::{CmBackend, DepotKeyRaw, RefreshTokenSecret};
    use crate::fake::FakeBackend;

    async fn conn(b: &FakeBackend) -> crate::fake::FakeConn {
        b.connect_authed(&RefreshTokenSecret::new("t".into()), 0)
            .await
            .ok()
            .unwrap()
            .conn
    }

    #[tokio::test]
    async fn depot_key_hex_and_eresult() {
        let b = FakeBackend::new();
        b.script(|s| {
            s.depot_key.queue.push_back(Ok(DepotKeyRaw {
                eresult: 1,
                key: vec![0x00, 0xab, 0xff],
            }));
            s.depot_key.queue.push_back(Ok(DepotKeyRaw {
                eresult: 5,
                key: vec![],
            }));
        });
        let c = conn(&b).await;
        let v = depot_key(&c, 480, 481).await.unwrap();
        assert_eq!(v["keyHex"], "00abff");
        assert_eq!(v["eresult"], 1);
        assert_eq!(depot_key(&c, 480, 481).await, Err(CmError::EResult(5)));
    }

    #[tokio::test]
    async fn request_code_is_decimal_string_and_exact() {
        let b = FakeBackend::new();
        let big = (1u64 << 60) + 7;
        b.script(|s| s.request_code.queue.push_back(Ok(big)));
        let c = conn(&b).await;
        let v = manifest_request_code(&c, 1, 2, "123", "public")
            .await
            .unwrap();
        assert_eq!(v["requestCode"], "1152921504606846983");
        assert_eq!(
            manifest_request_code(&c, 1, 2, "12x", "public").await,
            Err(CmError::Protocol("bad-manifest-id".into()))
        );
    }

    fn srv(kind: &str, host: &str, allowed: Vec<u32>) -> CdnServerRaw {
        CdnServerRaw {
            kind: kind.into(),
            host: host.into(),
            vhost: format!("v-{host}"),
            https_support: "mandatory".into(),
            cell_id: 3,
            load: 12,
            weighted_load: 130.0,
            allowed_app_ids: allowed,
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn content_servers_shape_and_filtering() {
        let b = FakeBackend::new();
        b.script(|s| {
            s.cdn.queue.push_back(Ok(vec![
                srv("CDN", "a.example", vec![]),
                srv("OpenCache", "b.example", vec![]),
                srv("SteamCache", "c.example", vec![10]),
            ]));
            s.cdn
                .queue
                .push_back(Ok(vec![srv("CDN", "a.example", vec![])]));
            s.cdn
                .queue
                .push_back(Ok(vec![srv("OpenCache", "b.example", vec![])]));
        });
        let c = conn(&b).await;
        let v = content_servers(&c, Some(480)).await.unwrap();
        let arr = v.as_array().unwrap();
        // SteamCache is restricted to app 10; OpenCache dropped.
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["Host"], "a.example");
        assert_eq!(arr[0]["vhost"], "v-a.example");
        assert_eq!(arr[0]["load"], "12");
        assert_eq!(arr[0]["weightedload"], "130");
        assert_eq!(arr[0]["https_support"], "mandatory");
        assert_eq!(arr[0]["cell"], 3);
        assert!(arr[0].get("allowed_app_ids").is_none());
        let v2 = content_servers(&c, None).await.unwrap();
        assert_eq!(v2.as_array().unwrap().len(), 1);
        assert_eq!(
            content_servers(&c, None).await,
            Err(CmError::Protocol("no-content-servers".into()))
        );
    }
}
