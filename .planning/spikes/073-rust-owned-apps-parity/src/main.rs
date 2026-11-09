//! Spike 073: owned-apps parity, steam-vent vs steam-user, on the same refresh token.
//!
//!   owned <vault.json> [--redeem-bogus]  -> out/rust-owned.json, out/rust-license-appids.json
//!
//! Mirrors GameLib's two sources:
//!   library/refresh.ts   getUserOwnedApps(steamID, { includePlayedFreeGames: true })
//!                        = Player.GetOwnedGames#1 with steam-user's defaults for the rest
//!   licensedDemos.ts     client.licenses -> PICS package info (with access tokens) -> appids
//! --redeem-bogus sends one ClientRegisterKey with a malformed key, to prove the redeem message
//! round-trips without redeeming anything. Run inside the go-offline wrap on macOS.

use futures_util::StreamExt;
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
use std::time::{Duration, Instant};
use steam_vent::auth::RefreshToken;
use steam_vent::connection::UnAuthenticatedConnection;
use steam_vent::{ConnectionTrait, ReadonlyConnection, ServerList};
use steam_vent_proto::steammessages_clientserver::CMsgClientLicenseList;
use steam_vent_proto::steammessages_clientserver_2::{CMsgClientPurchaseResponse, CMsgClientRegisterKey};
use steam_vent_proto::steammessages_clientserver_appinfo::{
    CMsgClientPICSAccessTokenRequest, CMsgClientPICSAccessTokenResponse, CMsgClientPICSProductInfoRequest,
    CMsgClientPICSProductInfoResponse, cmsg_client_picsproduct_info_request,
};
use steam_vent_proto::steammessages_player_steamclient::CPlayer_GetOwnedGames_Request;

type R<T> = Result<T, Box<dyn std::error::Error>>;

fn log(t0: Instant, cat: &str, msg: impl AsRef<str>) {
    eprintln!("[{:>7.3}s] {cat:<8} {}", t0.elapsed().as_secs_f64(), msg.as_ref());
}

/// Minimal binary KeyValues reader: enough to pull `appids` out of a PICS package buffer.
fn bkv(b: &[u8], i: &mut usize) -> Option<BTreeMap<String, Value>> {
    let mut m = BTreeMap::new();
    loop {
        let t = *b.get(*i)?;
        *i += 1;
        if t == 8 || t == 11 {
            return Some(m);
        }
        let start = *i;
        while *b.get(*i)? != 0 {
            *i += 1;
        }
        let k = String::from_utf8_lossy(&b[start..*i]).into_owned();
        *i += 1;
        let v = match t {
            0 => Value::Object(bkv(b, i)?.into_iter().collect()),
            1 => {
                let s = *i;
                while *b.get(*i)? != 0 {
                    *i += 1;
                }
                let v = String::from_utf8_lossy(&b[s..*i]).into_owned();
                *i += 1;
                Value::String(v)
            }
            2 | 4 | 6 => {
                let v = i32::from_le_bytes(b.get(*i..*i + 4)?.try_into().ok()?);
                *i += 4;
                json!(v)
            }
            3 => {
                let v = f32::from_le_bytes(b.get(*i..*i + 4)?.try_into().ok()?);
                *i += 4;
                json!(v)
            }
            7 | 10 => {
                let v = u64::from_le_bytes(b.get(*i..*i + 8)?.try_into().ok()?);
                *i += 8;
                json!(v.to_string())
            }
            _ => return None,
        };
        m.insert(k, v);
    }
}

#[tokio::main]
async fn main() -> R<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (Some("owned"), Some(vault)) = (args.first().map(String::as_str), args.get(1)) else {
        eprintln!("usage: owned <vault.json> [--redeem-bogus]");
        std::process::exit(64);
    };
    let redeem = args.iter().any(|a| a == "--redeem-bogus");
    std::fs::create_dir_all("out")?;
    let t0 = Instant::now();
    let v: Value = serde_json::from_str(&std::fs::read_to_string(vault)?)?;
    let token = RefreshToken::new(v["steam-refresh-token"].as_str().ok_or("no token slot")?.to_string())?;
    let steam_id = token.subject;
    let servers = ServerList::discover().await?;
    let unauth = UnAuthenticatedConnection::connect(&servers).await?;
    let mut lic = Box::pin(unauth.on::<CMsgClientLicenseList>());
    let c = unauth.login_with_refresh_token(&token).await?;
    log(t0, "logon", "ok (no account name)");
    let licenses = tokio::time::timeout(Duration::from_secs(10), lic.next()).await?.ok_or("no license list")??;
    log(t0, "license", format!("{} licenses", licenses.licenses.len()));

    // 1. Player.GetOwnedGames#1 with GameLib's options (steam-user defaults otherwise).
    let t = Instant::now();
    let owned = c
        .service_method(CPlayer_GetOwnedGames_Request {
            steamid: Some(u64::from(steam_id)),
            include_appinfo: Some(true),
            include_played_free_games: Some(true),
            include_free_sub: Some(false),
            skip_unvetted_apps: Some(true),
            ..Default::default()
        })
        .await?;
    let games: Vec<Value> = owned
        .games
        .iter()
        .map(|g| json!({ "appid": g.appid(), "name": g.name(), "playtime_forever": g.playtime_forever(), "rtime_last_played": g.rtime_last_played() }))
        .collect();
    log(t0, "owned", format!("GetOwnedGames: game_count {} ({} rows) in {:?}", owned.game_count(), games.len(), t.elapsed()));
    std::fs::write("out/rust-owned.json", serde_json::to_string_pretty(&json!({ "game_count": owned.game_count(), "games": games }))?)?;

    // 2. licenses -> package info (tokens fetched like steam-user's inclTokens) -> appids.
    let pkg_ids: Vec<u32> = licenses.licenses.iter().map(|l| l.package_id()).collect::<BTreeSet<_>>().into_iter().collect();
    let t = Instant::now();
    let tok: CMsgClientPICSAccessTokenResponse = c.job(CMsgClientPICSAccessTokenRequest { packageids: pkg_ids.clone(), ..Default::default() }).await?;
    let ptok: BTreeMap<u32, u64> = tok.package_access_tokens.iter().map(|t| (t.packageid(), t.access_token())).collect();
    let req = CMsgClientPICSProductInfoRequest {
        packages: pkg_ids
            .iter()
            .map(|p| cmsg_client_picsproduct_info_request::PackageInfo { packageid: Some(*p), access_token: Some(*ptok.get(p).unwrap_or(&0)), ..Default::default() })
            .collect(),
        meta_data_only: Some(false),
        ..Default::default()
    };
    let mut parts = 0;
    let mut appids: BTreeSet<u32> = BTreeSet::new();
    let mut pkgs_seen = 0;
    let mut stream = std::pin::pin!(c.job_multi::<_, CMsgClientPICSProductInfoResponse>(req));
    while let Some(part) = stream.next().await {
        let part = part?;
        parts += 1;
        for p in part.packages {
            pkgs_seen += 1;
            let buf = p.buffer();
            let mut i = 4; // u32 package id prefix
            if let Some(root) = bkv(buf, &mut i) {
                let node = root.values().next().cloned().unwrap_or(Value::Null);
                if let Some(a) = node["appids"].as_object() {
                    for v in a.values() {
                        if let Some(n) = v.as_i64() {
                            appids.insert(n as u32);
                        }
                    }
                }
            }
        }
    }
    log(t0, "pics", format!("{} packages ({} with tokens) in {parts} PICS message(s) -> {} appids in {:?}", pkgs_seen, ptok.len(), appids.len(), t.elapsed()));
    std::fs::write("out/rust-license-appids.json", serde_json::to_string(&appids)?)?;

    let mut report = json!({ "client": "steam-vent@a9e8164", "licenses": licenses.licenses.len(), "owned_game_count": owned.game_count(),
        "license_packages": pkgs_seen, "license_pics_messages": parts, "license_appids": appids.len(), "elapsed_s": t0.elapsed().as_secs_f64() });

    if redeem {
        let r: Result<CMsgClientPurchaseResponse, _> = c.job(CMsgClientRegisterKey { key: Some("AAAAA-BBBBB-CCCCC".into()), ..Default::default() }).await;
        let out = match &r {
            Ok(p) => json!({ "eresult": p.eresult(), "purchase_result_details": p.purchase_result_details() }),
            Err(e) => json!({ "error": e.to_string() }),
        };
        log(t0, "redeem", format!("bogus key -> {out}"));
        report["redeem_bogus"] = out;
    }
    std::fs::write("out/rust-report.json", serde_json::to_string_pretty(&report)?)?;
    eprintln!("{report}");
    Ok(())
}
