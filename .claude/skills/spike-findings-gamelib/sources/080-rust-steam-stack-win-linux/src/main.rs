//! Spike 080: does the Rust Steam stack (steam-vent CM client + Phase 73's gamelib-depot) build
//! and run off macOS? One binary: refresh-token logon -> license list -> PICS public manifest gid
//! -> depot key -> manifest request code -> CDN hosts -> gamelib-depot `depot_manifest_summary`
//! (production fetch + decrypt + parse). Prints one JSON report; no secrets.
//!
//!   spike-080-stack <vault.json|anon> <appid> <depotid|any> <cache_dir>
//!
//! `anon` logs on anonymously (CI: no token leaves the operator's machine); `any` tries every depot
//! with a public manifest and keeps the first whose key the account is granted.

use futures_util::StreamExt;
use serde_json::{Value, json};
use std::sync::Arc;
use std::time::{Duration, Instant};
use steam_vent::auth::RefreshToken;
use steam_vent::connection::UnAuthenticatedConnection;
use steam_vent::{Connection, ConnectionTrait, ReadonlyConnection, ServerList};
use steam_vent_proto::steammessages_clientserver::CMsgClientLicenseList;
use steam_vent_proto::steammessages_clientserver_2::{CMsgClientGetDepotDecryptionKey, CMsgClientGetDepotDecryptionKeyResponse};
use steam_vent_proto::steammessages_clientserver_appinfo::{
    CMsgClientPICSAccessTokenRequest, CMsgClientPICSAccessTokenResponse, CMsgClientPICSProductInfoRequest,
    CMsgClientPICSProductInfoResponse, cmsg_client_picsproduct_info_request,
};
use steam_vent_proto::steammessages_contentsystem_steamclient::{
    CContentServerDirectory_GetManifestRequestCode_Request, CContentServerDirectory_GetServersForSteamPipe_Request,
};

type R<T> = Result<T, Box<dyn std::error::Error>>;

fn log(t0: Instant, cat: &str, msg: impl AsRef<str>) {
    eprintln!("[{:>7.3}s] {cat:<8} {}", t0.elapsed().as_secs_f64(), msg.as_ref());
}

fn public_gid(buf: &[u8], depot: u32) -> Option<String> {
    let text = String::from_utf8_lossy(buf);
    let vdf = keyvalues_parser::Vdf::parse(text.trim().trim_end_matches('\0')).ok()?;
    let root = vdf.value.get_obj()?;
    let dep = root.get("depots")?.first()?.get_obj()?.get(depot.to_string().as_str())?.first()?.get_obj()?;
    let public = dep.get("manifests")?.first()?.get_obj()?.get("public")?.first()?;
    match public {
        keyvalues_parser::Value::Str(s) => Some(s.to_string()),
        keyvalues_parser::Value::Obj(o) => o.get("gid")?.first()?.get_str().map(str::to_string),
    }
}

fn public_gids(buf: &[u8]) -> Vec<(u32, String)> {
    let text = String::from_utf8_lossy(buf);
    let Ok(vdf) = keyvalues_parser::Vdf::parse(text.trim().trim_end_matches('\0')) else { return vec![] };
    let Some(root) = vdf.value.get_obj() else { return vec![] };
    let Some(deps) = root.get("depots").and_then(|d| d.first()).and_then(|d| d.get_obj()) else { return vec![] };
    let mut out = vec![];
    for (id, _) in deps.iter() {
        if let Ok(d) = id.parse::<u32>() {
            if let Some(g) = public_gid(buf, d) {
                out.push((d, g));
            }
        }
    }
    out
}

async fn appinfo(c: &Connection, app: u32) -> R<Vec<u8>> {
    let tok: CMsgClientPICSAccessTokenResponse =
        c.job(CMsgClientPICSAccessTokenRequest { appids: vec![app], ..Default::default() }).await?;
    let at = tok.app_access_tokens.iter().find(|t| t.appid() == app).map(|t| t.access_token()).unwrap_or(0);
    let req = CMsgClientPICSProductInfoRequest {
        apps: vec![cmsg_client_picsproduct_info_request::AppInfo { appid: Some(app), access_token: Some(at), ..Default::default() }],
        meta_data_only: Some(false),
        ..Default::default()
    };
    let mut stream = std::pin::pin!(c.job_multi::<_, CMsgClientPICSProductInfoResponse>(req));
    while let Some(part) = stream.next().await {
        for a in part?.apps {
            if a.appid() == app {
                return Ok(a.buffer().to_vec());
            }
        }
    }
    Err("app missing from PICS".into())
}

struct CmOut {
    depot: u32,
    licenses: Option<usize>,
    gid: String,
    key_hex: String,
    code: String,
    hosts: Vec<Value>,
}

async fn cm(t0: Instant, vault: &str, app: u32, depot: Option<u32>) -> R<CmOut> {
    let servers = ServerList::discover().await?;
    log(t0, "discover", "CM server list ok");
    let (c, licenses) = if vault == "anon" {
        let c = Connection::anonymous(&servers).await?;
        log(t0, "logon", format!("anonymous logon ok ({})", u64::from(c.steam_id())));
        (c, None)
    } else {
        let v: Value = serde_json::from_str(&std::fs::read_to_string(vault)?)?;
        let token = RefreshToken::new(v["steam-refresh-token"].as_str().ok_or("no token slot")?.to_string())?;
        let unauth = UnAuthenticatedConnection::connect(&servers).await?;
        log(t0, "connect", "websocket (TLS) connected");
        let mut lic = Box::pin(unauth.on::<CMsgClientLicenseList>());
        let c = unauth.login_with_refresh_token(&token).await?;
        log(t0, "logon", "refresh-token logon ok");
        let licenses = match tokio::time::timeout(Duration::from_secs(10), lic.next()).await {
            Ok(Some(Ok(l))) => Some(l.licenses.len()),
            _ => None,
        };
        log(t0, "license", format!("{licenses:?}"));
        (c, licenses)
    };
    let buf = appinfo(&c, app).await?;
    let candidates: Vec<(u32, String)> = match depot {
        Some(d) => vec![(d, public_gid(&buf, d).ok_or("no public manifest for depot")?)],
        None => public_gids(&buf),
    };
    log(t0, "pics", format!("{} candidate depot(s) with a public manifest", candidates.len()));
    let mut chosen = None;
    for (d, g) in candidates {
        let key: CMsgClientGetDepotDecryptionKeyResponse =
            c.job(CMsgClientGetDepotDecryptionKey { depot_id: Some(d), app_id: Some(app), ..Default::default() }).await?;
        log(t0, "depotkey", format!("depot {d}: eresult {}", key.eresult()));
        if key.eresult() == 1 {
            chosen = Some((d, g, key));
            break;
        }
    }
    let (depot, gid, key) = chosen.ok_or("no depot key granted")?;
    log(t0, "pics", format!("depot {depot} public gid {gid}"));
    let code = c
        .service_method(CContentServerDirectory_GetManifestRequestCode_Request {
            app_id: Some(app),
            depot_id: Some(depot),
            manifest_id: Some(gid.parse()?),
            app_branch: Some("public".into()),
            ..Default::default()
        })
        .await?
        .manifest_request_code();
    log(t0, "reqcode", if code != 0 { "ok" } else { "ZERO" });
    let cdn = c
        .service_method(CContentServerDirectory_GetServersForSteamPipe_Request { cell_id: Some(0), max_servers: Some(20), ..Default::default() })
        .await?;
    let hosts: Vec<Value> = cdn
        .servers
        .iter()
        .filter(|s| s.type_() == "CDN" || s.type_() == "SteamCache")
        .map(|s| {
            json!({ "host": s.host(), "vhost": s.vhost(), "kind": s.type_(), "httpsSupport": s.https_support(),
                    "useTokenAuth": false, "weightedLoad": s.weighted_load() })
        })
        .collect();
    log(t0, "cdn", format!("{} servers, {} usable", cdn.servers.len(), hosts.len()));
    Ok(CmOut { depot, licenses, gid, key_hex: hex::encode(key.depot_encryption_key()), code: code.to_string(), hosts })
}

struct Host {
    code: String,
}
impl gamelib_depot::JobHost for Host {
    fn emit(&self, _ev: gamelib_depot::JobEvent) {}
    fn cdn_token(&self, _r: gamelib_depot::TokenRequest) -> Result<Option<String>, String> {
        Ok(None)
    }
    fn manifest_request_code(&self, _a: &str, _d: &str, _m: &str) -> Result<Option<String>, String> {
        Ok(Some(self.code.clone()))
    }
}

fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    if a.len() < 4 {
        eprintln!("usage: <vault.json|anon> <appid> <depotid|any> <cache_dir>");
        std::process::exit(64);
    }
    let t0 = Instant::now();
    let (app, depot): (u32, Option<u32>) = (a[1].parse().unwrap(), a[2].parse().ok());
    let platform = format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);
    log(t0, "start", format!("{platform}, {}, app {app} depot {depot:?}", if a[0] == "anon" { "anonymous" } else { "refresh token" }));
    // CM half on its own runtime, dropped before gamelib-depot's dispatch starts its own.
    let rt = tokio::runtime::Runtime::new().unwrap();
    let cm = rt.block_on(cm(t0, &a[0], app, depot));
    drop(rt);
    let mut report = json!({ "platform": platform, "client": "steam-vent@a9e8164 + gamelib-depot (path)" });
    let cm = match cm {
        Ok(c) => c,
        Err(e) => {
            log(t0, "CM-FAIL", e.to_string());
            report["cm"] = json!(format!("failed: {e}"));
            println!("{report}");
            std::process::exit(2);
        }
    };
    let depot = cm.depot;
    report["cm"] = json!({ "mode": if a[0] == "anon" { "anonymous" } else { "refresh-token" }, "depot": depot, "licenses": cm.licenses, "public_gid": cm.gid, "depot_key": "ok", "request_code": "ok", "cdn_hosts": cm.hosts.len() });
    let args = json!({
        "appId": app.to_string(),
        "depots": [{ "depotId": depot.to_string(), "manifestId": cm.gid, "requestCode": cm.code, "key": cm.key_hex, "ownerAppId": app.to_string() }],
        "hosts": cm.hosts,
        "patterns": ["*.exe", "*.dll"],
    });
    let ctx = gamelib_depot::JobContext { cache_dir: std::path::PathBuf::from(&a[3]) };
    let t = Instant::now();
    let r = gamelib_depot::dispatch("depot_manifest_summary", &args, &ctx, Arc::new(Host { code: cm.code.clone() }));
    log(t0, "summary", format!("gamelib-depot dispatch in {:?}", t.elapsed()));
    let ok = matches!(&r, Ok(v) if v.get("error").is_none());
    report["depot_summary"] = match r {
        Ok(mut v) => {
            if let Some(ds) = v.get_mut("depots").and_then(|d| d.as_array_mut()) {
                for d in ds {
                    if let Some(m) = d.get_mut("matches").and_then(|m| m.as_array_mut()) {
                        m.truncate(5);
                    }
                }
            }
            v
        }
        Err(e) => json!(format!("dispatch error: {e}")),
    };
    report["verdict"] = json!(if ok { "PASS" } else { "FAIL" });
    report["elapsed_s"] = json!(t0.elapsed().as_secs_f64());
    println!("{}", serde_json::to_string_pretty(&report).unwrap());
    std::process::exit(if ok { 0 } else { 1 });
}
