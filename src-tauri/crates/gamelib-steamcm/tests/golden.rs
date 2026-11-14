//! Parity tier 1 (plan 79-21), Rust half. Every case in `fixtures/invocations.json` is driven
//! through the real op functions over a scripted `CmConn` (the in-crate `FakeConn` is
//! `#[cfg(test)]`-private, so this file carries its own). Two checks:
//!
//! 1. `recorded_results`: the wire result of every case must equal the committed
//!    `rust-results.json`, which the Jest replay (`steamcmGolden.test.ts`) feeds through
//!    `RustCmClient`. Rewrite it with `GAMELIB_WRITE_STEAMCM_RUST=1`.
//! 2. `matches_steam_user`: the comparable form of each result must equal `expected.json` (the
//!    steam-user oracle) after applying the case's `overrides/<case>.json`, if any. An override
//!    names a `class` and a `cause`, and strips only the keys it lists, so a difference is
//!    recorded, never loosened away (63 D-07).

use base64::Engine;
use gamelib_steamcm::backend::{
    AccessTokens, CdnServerRaw, CmConn, DepotKeyRaw, LicenseEntry, OwnedGameRaw, OwnedOpts,
    PersonaRaw, PicsAppRaw, PicsRaw, PicsRequest, PurchaseRaw,
};
use gamelib_steamcm::error::{eresult_of, CmError};
use gamelib_steamcm::ops::{account, depot, pics};
use serde_json::{json, Map, Value};
use std::path::Path;
use std::time::Duration;

const INVOCATIONS: &str = include_str!("fixtures/invocations.json");
const EXPECTED: &str = include_str!("fixtures/expected.json");
const RECORDED: &str = include_str!("fixtures/rust-results.json");
const FIXTURES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures");

/// A connection that answers each op from one canned value.
#[derive(Default)]
struct ScriptConn {
    pics: PicsRaw,
    depot: Option<DepotKeyRaw>,
    code: u64,
    servers: Vec<CdnServerRaw>,
    owned: Vec<OwnedGameRaw>,
    purchase: PurchaseRaw,
    personas: Vec<PersonaRaw>,
}

impl CmConn for ScriptConn {
    async fn pics_access_tokens(
        &self,
        _apps: Vec<u32>,
        _packages: Vec<u32>,
    ) -> Result<AccessTokens, CmError> {
        Ok(AccessTokens::default())
    }
    async fn pics_product_info(&self, _req: PicsRequest) -> Result<PicsRaw, CmError> {
        Ok(self.pics.clone())
    }
    async fn depot_key(&self, _app: u32, _depot: u32) -> Result<DepotKeyRaw, CmError> {
        self.depot.clone().ok_or(CmError::Unsupported)
    }
    async fn manifest_request_code(
        &self,
        _app: u32,
        _depot: u32,
        _manifest: u64,
        _branch: String,
    ) -> Result<u64, CmError> {
        Ok(self.code)
    }
    async fn cdn_servers(&self, _cell: u32, _max: u32) -> Result<Vec<CdnServerRaw>, CmError> {
        Ok(self.servers.clone())
    }
    async fn owned_games(&self, _id: u64, _o: OwnedOpts) -> Result<Vec<OwnedGameRaw>, CmError> {
        Ok(self.owned.clone())
    }
    async fn register_key(&self, _key: String) -> Result<PurchaseRaw, CmError> {
        Ok(self.purchase.clone())
    }
    async fn personas(&self, _ids: Vec<u64>) -> Result<Vec<PersonaRaw>, CmError> {
        Ok(self.personas.clone())
    }
    async fn probe(&self) -> Result<(), CmError> {
        Ok(())
    }
    fn close(&self) {}
}

fn b64(s: &str) -> Vec<u8> {
    base64::engine::general_purpose::STANDARD.decode(s).unwrap()
}

fn hex_to_bytes(s: &str) -> Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect()
}

fn u(v: &Value, k: &str) -> u32 {
    v[k].as_u64().unwrap_or(0) as u32
}

fn i(v: &Value, k: &str) -> i32 {
    v[k].as_i64().unwrap_or(0) as i32
}

fn rt() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_time()
        .build()
        .unwrap()
}

fn wire(r: Result<Value, CmError>) -> Value {
    match r {
        Ok(v) => json!({"ok": true, "result": v}),
        Err(e) => {
            let mut m = Map::new();
            m.insert("ok".into(), json!(false));
            if let Some(n) = eresult_of(&e) {
                m.insert("eresult".into(), json!(n));
            }
            let kind = match e {
                CmError::EResult(_) => "eresult",
                CmError::Timeout => "timeout",
                CmError::Closed | CmError::Io(_) | CmError::Discovery => "network",
                CmError::Replaced => "replaced",
                CmError::Protocol(_) => "protocol",
                CmError::Unsupported => "unsupported",
            };
            m.insert("kind".into(), json!(kind));
            Value::Object(m)
        }
    }
}

fn run_case(case: &Value) -> Value {
    let kind = case["kind"].as_str().unwrap();
    let mut conn = ScriptConn::default();
    let rt = rt();
    let result: Result<Value, CmError> = rt.block_on(async {
        match kind {
            "anon_pics" => {
                let path = Path::new(FIXTURES).join(case["raw"].as_str().unwrap());
                let raw: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
                let app_id = u(&raw, "appId");
                conn.pics = PicsRaw {
                    apps: vec![PicsAppRaw {
                        app_id,
                        change_number: u(&raw, "changeNumber"),
                        missing_token: raw["missingToken"].as_bool().unwrap_or(false),
                        buffer: b64(raw["bufferBase64"].as_str().unwrap()),
                    }],
                    ..Default::default()
                };
                pics::product_info(&conn, &[app_id], &[], false).await
            }
            "licenses" => {
                let entries: Vec<LicenseEntry> = case["entries"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|e| LicenseEntry {
                        package_id: u(e, "package_id"),
                        time_created: u(e, "time_created"),
                        owner_id: u(e, "owner_id"),
                        access_token: e["access_token"].as_str().unwrap().parse().unwrap(),
                        license_type: u(e, "license_type"),
                        flags: u(e, "flags"),
                    })
                    .collect();
                Ok(pics::licenses_json(&entries))
            }
            "owned_apps" => {
                conn.owned = case["games"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|g| OwnedGameRaw {
                        app_id: i(g, "app_id"),
                        name: g["name"].as_str().unwrap().to_string(),
                        playtime_forever: i(g, "playtime_forever"),
                        rtime_last_played: u(g, "rtime_last_played"),
                    })
                    .collect();
                let o = &case["opts"];
                let opts = OwnedOpts {
                    include_appinfo: o["include_appinfo"].as_bool().unwrap(),
                    include_played_free_games: o["include_played_free_games"].as_bool().unwrap(),
                    include_free_sub: o["include_free_sub"].as_bool().unwrap(),
                    skip_unvetted_apps: o["skip_unvetted_apps"].as_bool().unwrap(),
                };
                account::owned_apps(
                    &conn,
                    case["steamId"].as_str().unwrap().parse().unwrap(),
                    opts,
                )
                .await
            }
            "depot_key" => {
                conn.depot = Some(DepotKeyRaw {
                    eresult: i(case, "eresult"),
                    key: hex_to_bytes(case["keyHex"].as_str().unwrap()),
                });
                depot::depot_key(&conn, u(case, "appId"), u(case, "depotId")).await
            }
            "request_code" => {
                conn.code = case["code"].as_str().unwrap().parse().unwrap();
                depot::manifest_request_code(
                    &conn,
                    u(case, "appId"),
                    u(case, "depotId"),
                    case["manifestId"].as_str().unwrap(),
                    case["branch"].as_str().unwrap(),
                )
                .await
            }
            "content_servers" => {
                conn.servers = case["servers"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|s| CdnServerRaw {
                        kind: s["kind"].as_str().unwrap().to_string(),
                        host: s["host"].as_str().unwrap().to_string(),
                        vhost: s["vhost"].as_str().unwrap().to_string(),
                        https_support: s["https_support"].as_str().unwrap().to_string(),
                        cell_id: i(s, "cell_id"),
                        load: i(s, "load"),
                        weighted_load: s["weighted_load"].as_f64().unwrap() as f32,
                        allowed_app_ids: s["allowed_app_ids"]
                            .as_array()
                            .map(|a| a.iter().map(|x| x.as_u64().unwrap() as u32).collect())
                            .unwrap_or_default(),
                        ..Default::default()
                    })
                    .collect();
                depot::content_servers(&conn, case["appId"].as_u64().map(|a| a as u32)).await
            }
            "redeem" => {
                conn.purchase = PurchaseRaw {
                    eresult: i(case, "eresult"),
                    purchase_result_details: i(case, "purchaseResultDetails"),
                    receipt: b64(case["receiptBase64"].as_str().unwrap()),
                };
                account::redeem_key(&conn, "SYNTH-KEY").await
            }
            "personas" => {
                conn.personas = case["personas"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|p| PersonaRaw {
                        steam_id: p["steam_id"].as_str().unwrap().parse().unwrap(),
                        persona_state: u(p, "persona_state"),
                        name: p["name"].as_str().unwrap().to_string(),
                        avatar_hash: hex_to_bytes(p["avatar_hash_hex"].as_str().unwrap()),
                    })
                    .collect();
                let ids: Vec<u64> = case["steamIds"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|s| s.as_str().unwrap().parse().unwrap())
                    .collect();
                account::personas(&conn, &ids, Duration::from_secs(5)).await
            }
            other => panic!("unknown case kind {other}"),
        }
    });
    wire(result)
}

/// The value compared with steam-user's: the unwrapped result, with a failure or a rejected redeem
/// in steam-user's rejection shape `{error: {...}}`.
fn comparable(case: &Value, w: &Value) -> Value {
    let kind = case["kind"].as_str().unwrap();
    if w["ok"] == json!(false) {
        return match w.get("eresult") {
            Some(e) => json!({"error": {"eresult": e}}),
            None => json!({"error": {"kind": w["kind"]}}),
        };
    }
    let r = &w["result"];
    match kind {
        "anon_pics" => r["apps"][case["appId"].as_u64().unwrap().to_string()].clone(),
        "depot_key" => json!({"keyHex": r["keyHex"]}),
        "redeem" if r["eresult"] != json!(1) => json!({"error": r}),
        "redeem" => {
            json!({"purchaseResultDetails": r["purchaseResultDetails"], "packageList": r["packageList"]})
        }
        _ => r.clone(),
    }
}

fn strip(v: &mut Value, keys: &[String]) {
    match v {
        Value::Object(m) => {
            for k in keys {
                m.remove(k);
            }
            m.values_mut().for_each(|x| strip(x, keys));
        }
        Value::Array(a) => a.iter_mut().for_each(|x| strip(x, keys)),
        _ => {}
    }
}

fn override_for(case: &str) -> Option<Value> {
    let path = Path::new(FIXTURES)
        .join("overrides")
        .join(format!("{}.json", case.replace(':', "_")));
    let o: Value = serde_json::from_slice(&std::fs::read(path).ok()?).unwrap();
    assert!(
        o["class"].is_string() && o["cause"].is_string(),
        "{case}: an override names a class and a cause"
    );
    Some(o)
}

fn keys(o: &Value, field: &str) -> Vec<String> {
    o[field]
        .as_array()
        .map(|a| a.iter().map(|k| k.as_str().unwrap().to_string()).collect())
        .unwrap_or_default()
}

fn cases() -> Map<String, Value> {
    serde_json::from_str::<Value>(INVOCATIONS)
        .unwrap()
        .as_object()
        .unwrap()
        .clone()
}

#[test]
fn recorded_results() {
    let mut out = Map::new();
    for (name, case) in &cases() {
        out.insert(name.clone(), run_case(case));
    }
    let actual = Value::Object(out);
    if std::env::var("GAMELIB_WRITE_STEAMCM_RUST").as_deref() == Ok("1") {
        let path = Path::new(FIXTURES).join("rust-results.json");
        std::fs::write(path, serde_json::to_string_pretty(&actual).unwrap() + "\n").unwrap();
        return;
    }
    let recorded: Value = serde_json::from_str(RECORDED).unwrap();
    assert_eq!(
        actual, recorded,
        "rust-results.json is stale; rewrite with GAMELIB_WRITE_STEAMCM_RUST=1"
    );
}

#[test]
fn matches_steam_user() {
    let expected: Value = serde_json::from_str(EXPECTED).unwrap();
    let mut failures = Vec::new();
    for (name, case) in &cases() {
        let w = run_case(case);
        let mut got = comparable(case, &w);
        let mut want = expected[name].clone();
        assert!(!want.is_null(), "{name}: no expected value");
        if let Some(o) = override_for(name) {
            strip(&mut want, &keys(&o, "stripExpected"));
            strip(&mut got, &keys(&o, "stripRust"));
        }
        if got != want {
            failures.push(format!("{name}\n  rust: {got}\n  want: {want}"));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
