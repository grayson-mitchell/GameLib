//! Signed-in account ops: owned apps (Refresh), key redeem and persona names (sign-in, D-06).
//!
//! Secret hygiene (T-28-04, T-79-30, T-79-31): the product key, receipt and persona names are
//! never passed to `diag` or logged; they only travel in the returned JSON.
//!
//! Idempotency (Pitfall 5, D-02 retry-once): owned apps and personas are read-only and safe to
//! resend after a dead socket. `redeem_key` is NOT: a first send that reached the CM but lost its
//! reply would, when resent, answer "already owned" and read as a failure. The session layer
//! (79-11) reports `Ambiguous` for it instead of resending (T-79-29).
//!
//! Shapes follow steam-user 5.x (`apps.js` `redeemKey`, `friends.js` `getUserOwnedApps` and
//! `getPersonas`).

use std::time::Duration;

use gamelib_steamfiles::kv_bin::{self, BinLimits, BinNode};
use serde_json::{json, Map, Value};

use crate::backend::{CmConn, OwnedOpts};
use crate::error::CmError;

pub const OWNED_IDEMPOTENT: bool = true;
pub const REDEEM_IDEMPOTENT: bool = false;
pub const PERSONAS_IDEMPOTENT: bool = true;

const RECEIPT_MAX_BYTES: usize = 1024 * 1024;
const RECEIPT_MAX_DEPTH: usize = 16;

/// `{ app_count, apps: [{ appid, name, playtime_forever, rtime_last_played }] }`.
///
/// `opts` is passed to the CM unchanged. GameLib's Refresh uses `include_appinfo` and
/// `include_played_free_games` true, `include_free_sub` false and `skip_unvetted_apps` true.
/// `img_icon_url` is not carried by the raw row and so is absent (Refresh does not read it).
pub async fn owned_apps<C: CmConn>(
    conn: &C,
    steam_id: u64,
    opts: OwnedOpts,
) -> Result<Value, CmError> {
    let games = conn.owned_games(steam_id, opts).await?;
    let apps: Vec<Value> = games
        .iter()
        .map(|g| {
            json!({
                "appid": g.app_id,
                "name": g.name,
                "playtime_forever": g.playtime_forever,
                "rtime_last_played": g.rtime_last_played,
            })
        })
        .collect();
    Ok(json!({ "app_count": apps.len(), "apps": apps }))
}

fn key_eq(k: &[u8], name: &str) -> bool {
    k.eq_ignore_ascii_case(name.as_bytes())
}

fn node_id_string(n: &BinNode) -> Option<String> {
    match n {
        BinNode::Int32(v) => Some(v.to_string()),
        BinNode::Uint64(b) => Some(u64::from_le_bytes(*b).to_string()),
        BinNode::Int64(b) => Some(i64::from_le_bytes(*b).to_string()),
        BinNode::Str(s) => Some(String::from_utf8_lossy(s).into_owned()),
        _ => None,
    }
}

/// `MessageObject.lineitems[*]` to `{ [PackageID]: ItemDescription }`. A receipt that is empty or
/// does not parse gives an empty map: a failed redeem carries no usable receipt.
fn package_list(receipt: &[u8]) -> Map<String, Value> {
    let mut out = Map::new();
    let limits = BinLimits {
        max_bytes: RECEIPT_MAX_BYTES,
        max_depth: RECEIPT_MAX_DEPTH,
    };
    let Ok(doc) = kv_bin::parse_bin(receipt, &limits) else {
        return out;
    };
    let Some((_, BinNode::Map(msg))) = doc.root.iter().find(|(k, _)| k == b"MessageObject") else {
        return out;
    };
    let Some((_, BinNode::Map(items))) = msg.iter().find(|(k, _)| key_eq(k, "lineitems")) else {
        return out;
    };
    for (_, item) in items {
        let BinNode::Map(fields) = item else { continue };
        let id = ["PackageID", "packageID", "packageid"]
            .iter()
            .find_map(|n| {
                fields
                    .iter()
                    .find(|(k, _)| k.as_slice() == n.as_bytes())
                    .and_then(|(_, v)| node_id_string(v))
            });
        let desc = fields
            .iter()
            .find(|(k, _)| k.as_slice() == b"ItemDescription")
            .and_then(|(_, v)| node_id_string(v));
        if let (Some(id), Some(desc)) = (id, desc) {
            out.insert(id, Value::String(desc));
        }
    }
    out
}

/// `{ eresult, purchaseResultDetails, packageList }`.
///
/// steam-user rejects a non-OK eresult with an error that carries `purchaseResultDetails` and
/// `packageList` as extra properties. This op returns `Ok` for every reply the CM sent, with
/// `eresult` so the adapter can reproduce that rejection; only transport failures are `Err`.
/// NOT idempotent (`REDEEM_IDEMPOTENT`).
pub async fn redeem_key<C: CmConn>(conn: &C, key: &str) -> Result<Value, CmError> {
    let raw = conn.register_key(key.to_string()).await?;
    Ok(json!({
        "eresult": raw.eresult,
        "purchaseResultDetails": raw.purchase_result_details,
        "packageList": Value::Object(package_list(&raw.receipt)),
    }))
}

fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes.iter().fold(String::new(), |mut s, b| {
        let _ = write!(s, "{b:02x}");
        s
    })
}

/// `{ personas: { [steamid64]: { player_name, persona_state, avatar_hash } } }`.
///
/// Bounded by `timeout`: when nothing (or only part) answers in time the map holds what arrived,
/// possibly nothing, and that is not an error (the caller falls back to the account name, D-06).
/// `CmError::Unsupported` from the connection surfaces unchanged.
pub async fn personas<C: CmConn>(
    conn: &C,
    steam_ids: &[u64],
    timeout: Duration,
) -> Result<Value, CmError> {
    let found = match tokio::time::timeout(timeout, conn.personas(steam_ids.to_vec())).await {
        Ok(r) => r?,
        Err(_) => Vec::new(),
    };
    let mut map = Map::new();
    for p in &found {
        map.insert(
            p.steam_id.to_string(),
            json!({
                "player_name": p.name,
                "persona_state": p.persona_state,
                "avatar_hash": hex(&p.avatar_hash),
            }),
        );
    }
    Ok(json!({ "personas": Value::Object(map) }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::{CmBackend, OwnedGameRaw, PersonaRaw, PurchaseRaw, RefreshTokenSecret};
    use crate::fake::FakeBackend;

    async fn conn(b: &FakeBackend) -> crate::fake::FakeConn {
        b.connect_authed(&RefreshTokenSecret::new("t".into()), 0)
            .await
            .ok()
            .unwrap()
            .conn
    }

    const _: () = {
        assert!(OWNED_IDEMPOTENT);
        assert!(!REDEEM_IDEMPOTENT);
        assert!(PERSONAS_IDEMPOTENT);
    };

    #[tokio::test]
    async fn owned_apps_shape() {
        let b = FakeBackend::new();
        b.script(|s| {
            s.owned.queue.push_back(Ok(vec![
                OwnedGameRaw {
                    app_id: 480,
                    name: "Spacewar".into(),
                    playtime_forever: 12,
                    rtime_last_played: 1_700_000_000,
                },
                OwnedGameRaw {
                    app_id: 10,
                    name: "CS".into(),
                    ..Default::default()
                },
            ]))
        });
        let c = conn(&b).await;
        let opts = OwnedOpts {
            include_appinfo: true,
            include_played_free_games: true,
            include_free_sub: false,
            skip_unvetted_apps: true,
        };
        let v = owned_apps(&c, 7, opts).await.unwrap();
        assert_eq!(v["app_count"], 2);
        assert_eq!(v["apps"][0]["appid"], 480);
        assert_eq!(v["apps"][0]["name"], "Spacewar");
        assert_eq!(v["apps"][0]["playtime_forever"], 12);
        assert_eq!(v["apps"][0]["rtime_last_played"], 1_700_000_000u32);
    }

    fn receipt(items: &[(i32, &str)]) -> Vec<u8> {
        let lineitems: Vec<(Vec<u8>, BinNode)> = items
            .iter()
            .enumerate()
            .map(|(i, (id, d))| {
                (
                    i.to_string().into_bytes(),
                    BinNode::Map(vec![
                        (b"PackageID".to_vec(), BinNode::Int32(*id)),
                        (
                            b"ItemDescription".to_vec(),
                            BinNode::Str(d.as_bytes().to_vec()),
                        ),
                    ]),
                )
            })
            .collect();
        let doc = kv_bin::BinDoc {
            root: vec![(
                b"MessageObject".to_vec(),
                BinNode::Map(vec![
                    (
                        b"LineItemCount".to_vec(),
                        BinNode::Int32(items.len() as i32),
                    ),
                    (b"lineitems".to_vec(), BinNode::Map(lineitems)),
                ]),
            )],
            trailing: vec![],
        };
        kv_bin::serialize_bin(&doc)
    }

    #[tokio::test]
    async fn redeem_maps_receipt_and_details() {
        let b = FakeBackend::new();
        b.script(|s| {
            s.register.queue.push_back(Ok(PurchaseRaw {
                eresult: 1,
                purchase_result_details: 0,
                receipt: receipt(&[(1234, "Game A"), (99, "Game B")]),
            }));
            s.register.queue.push_back(Ok(PurchaseRaw {
                eresult: 9,
                purchase_result_details: 9,
                receipt: vec![],
            }));
            s.register.queue.push_back(Err(CmError::Closed));
        });
        let c = conn(&b).await;
        let v = redeem_key(&c, "AAAAA-BBBBB-CCCCC").await.unwrap();
        assert_eq!(v["purchaseResultDetails"], 0);
        assert_eq!(v["packageList"]["1234"], "Game A");
        assert_eq!(v["packageList"]["99"], "Game B");
        let bad = redeem_key(&c, "k").await.unwrap();
        assert_eq!(bad["eresult"], 9);
        assert_eq!(bad["purchaseResultDetails"], 9);
        assert_eq!(bad["packageList"], json!({}));
        assert_eq!(redeem_key(&c, "k").await, Err(CmError::Closed));
    }

    #[tokio::test]
    async fn personas_answers_and_empty_on_silence() {
        let b = FakeBackend::new();
        b.script(|s| {
            s.personas.queue.push_back(Ok(vec![PersonaRaw {
                steam_id: 76561198000000001,
                persona_state: 1,
                name: "Someone".into(),
                avatar_hash: vec![0xde, 0xad],
            }]));
        });
        let c = conn(&b).await;
        let v = personas(&c, &[76561198000000001], Duration::from_secs(5))
            .await
            .unwrap();
        assert_eq!(v["personas"]["76561198000000001"]["player_name"], "Someone");
        assert_eq!(v["personas"]["76561198000000001"]["avatar_hash"], "dead");
        // Nothing answers before the timeout: empty map, not an error.
        b.set_delay("personas", Duration::from_secs(60));
        let v = personas(&c, &[1], Duration::from_millis(20)).await.unwrap();
        assert_eq!(v["personas"], json!({}));
    }

    #[tokio::test]
    async fn unsupported_surfaces() {
        let b = FakeBackend::new();
        b.script(|s| s.personas.queue.push_back(Err(CmError::Unsupported)));
        let c = conn(&b).await;
        assert_eq!(
            personas(&c, &[1], Duration::from_secs(1)).await,
            Err(CmError::Unsupported)
        );
    }

    /// Live persona proof (plan 79-09). Reads the dev vault, skips without a token, and prints
    /// presence only, never the name (T-79-31).
    #[tokio::test]
    #[ignore = "needs network and a dev vault token"]
    async fn personas_live() {
        crate::install_crypto_provider();
        let path = std::env::temp_dir().join("gamelib-dev-secret-vault.json");
        let Ok(text) = std::fs::read_to_string(&path) else {
            eprintln!("skip: no dev vault");
            return;
        };
        let v: Value = serde_json::from_str(&text).unwrap_or_default();
        let Some(tok) = v["steam-refresh-token"].as_str() else {
            eprintln!("skip: no steam-refresh-token in dev vault");
            return;
        };
        let a = crate::vent::SteamVentBackend
            .connect_authed(&RefreshTokenSecret::new(tok.to_string()), 0)
            .await
            .expect("authed");
        match personas(&a.conn, &[a.steam_id], Duration::from_secs(5)).await {
            Ok(r) => {
                let name = r["personas"][a.steam_id.to_string()]["player_name"]
                    .as_str()
                    .unwrap_or("");
                eprintln!("player_name present: {}", !name.is_empty());
            }
            Err(CmError::Unsupported) => eprintln!("personas: unsupported"),
            Err(e) => eprintln!("personas: error {e:?}"),
        }
        a.conn.close();
    }
}
