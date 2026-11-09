//! Spike 071c: the 071a/071b questions on steam-vent (codeberg git a9e8164, unreleased 0.6.0),
//! the crate spike 010 rejected at 0.5.0 as auth-only.
//!
//!   anon <appid>...                         -> out/anon.json
//!   authed <vault.json> <appid> <depotid>   -> out/authed.json (redacted)
//!
//! Secrets are never printed; the depot key is compared by SHA-1 fingerprint.

use futures_util::StreamExt;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::collections::BTreeMap;
use std::time::{Duration, Instant};
use steam_vent::auth::RefreshToken;
use steam_vent::connection::UnAuthenticatedConnection;
use steam_vent::{Connection, ConnectionTrait, ReadonlyConnection, ServerList};
use steam_vent_proto::steammessages_clientserver::CMsgClientLicenseList;
use steam_vent_proto::steammessages_clientserver_2::{
    CMsgClientGetDepotDecryptionKey, CMsgClientGetDepotDecryptionKeyResponse,
};
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

fn to_json(v: &keyvalues_parser::Value) -> Value {
    match v {
        keyvalues_parser::Value::Str(s) => Value::String(s.to_string()),
        keyvalues_parser::Value::Obj(o) => {
            let mut m = serde_json::Map::new();
            for (k, vs) in o.iter() {
                if let Some(first) = vs.first() {
                    m.insert(k.to_string(), to_json(first));
                }
            }
            Value::Object(m)
        }
    }
}

fn summarize_appinfo(buf: &[u8]) -> R<Value> {
    let text = String::from_utf8_lossy(buf);
    let vdf = keyvalues_parser::Vdf::parse(text.trim().trim_end_matches('\0'))?;
    let root = to_json(&vdf.value);
    let mut manifests = BTreeMap::new();
    if let Some(d) = root["depots"].as_object() {
        for (id, dep) in d {
            if !id.chars().all(|c| c.is_ascii_digit()) {
                continue;
            }
            let p = &dep["manifests"]["public"];
            if let Some(g) = p.as_str().map(str::to_string).or_else(|| p["gid"].as_str().map(str::to_string)) {
                manifests.insert(id.clone(), g);
            }
        }
    }
    Ok(json!({ "name": root["common"]["name"], "buildid": root["depots"]["branches"]["public"]["buildid"], "manifests": manifests }))
}

/// Access token, then product info via job_multi (handles `response_pending` splits).
async fn appinfo(c: &Connection, apps: &[u32]) -> R<BTreeMap<u32, Vec<u8>>> {
    let tok: CMsgClientPICSAccessTokenResponse = c
        .job(CMsgClientPICSAccessTokenRequest { appids: apps.to_vec(), ..Default::default() })
        .await?;
    let tokens: BTreeMap<u32, u64> = tok.app_access_tokens.iter().map(|t| (t.appid(), t.access_token())).collect();
    let req = CMsgClientPICSProductInfoRequest {
        apps: apps
            .iter()
            .map(|a| cmsg_client_picsproduct_info_request::AppInfo {
                appid: Some(*a),
                access_token: Some(*tokens.get(a).unwrap_or(&0)),
                ..Default::default()
            })
            .collect(),
        meta_data_only: Some(false),
        ..Default::default()
    };
    let mut out = BTreeMap::new();
    let mut parts = 0;
    let mut stream = std::pin::pin!(c.job_multi::<_, CMsgClientPICSProductInfoResponse>(req));
    while let Some(part) = stream.next().await {
        parts += 1;
        for a in part?.apps {
            out.insert(a.appid(), a.buffer().to_vec());
        }
    }
    eprintln!("          (PICS answer in {parts} message(s) for {} app(s))", apps.len());
    Ok(out)
}

async fn anon(apps: &[u32]) -> R<Value> {
    let t0 = Instant::now();
    let servers = ServerList::discover().await?;
    let c = Connection::anonymous(&servers).await?;
    log(t0, "logon", "anonymous ok");
    let mut out = serde_json::Map::new();
    for &a in apps {
        let t = Instant::now();
        let bufs = appinfo(&c, &[a]).await?;
        let s = summarize_appinfo(bufs.get(&a).ok_or("app missing")?)?;
        log(t0, "pics", format!("{a} {} build {} {} manifests in {:?}", s["name"], s["buildid"], s["manifests"].as_object().map(|m| m.len()).unwrap_or(0), t.elapsed()));
        out.insert(a.to_string(), s);
    }
    // One batched request, to exercise job_multi with several apps at once.
    let t = Instant::now();
    let batch = appinfo(&c, apps).await?;
    log(t0, "pics", format!("batched {} apps in {:?}", batch.len(), t.elapsed()));
    Ok(json!({ "client": "steam-vent@a9e8164", "mode": "anonymous", "apps": out, "elapsed_s": t0.elapsed().as_secs_f64() }))
}

async fn authed(vault: &str, app: u32, depot: u32) -> R<Value> {
    let t0 = Instant::now();
    let v: Value = serde_json::from_str(&std::fs::read_to_string(vault)?)?;
    let token = RefreshToken::new(v["steam-refresh-token"].as_str().ok_or("no token slot")?.to_string())?;
    log(t0, "token", "refresh token loaded (value not shown)");
    let servers = ServerList::discover().await?;
    let unauth = UnAuthenticatedConnection::connect(&servers).await?;
    // Subscribe before logon so the license list can't be missed.
    let mut lic_stream = Box::pin(unauth.on::<CMsgClientLicenseList>());
    let c = match unauth.login_with_refresh_token(&token).await {
        Ok(c) => c,
        Err(e) => {
            log(t0, "logon", format!("FAILED: {e}"));
            return Ok(json!({ "logon": "failed", "error": e.to_string() }));
        }
    };
    log(t0, "logon", "refresh-token logon ok, no account name");
    let licenses = match tokio::time::timeout(Duration::from_secs(10), lic_stream.next()).await {
        Ok(Some(Ok(l))) => Some(l.licenses.len()),
        _ => None,
    };
    log(t0, "license", format!("{licenses:?} licenses via on::<CMsgClientLicenseList>()"));
    let unprocessed: Vec<String> = c.take_unprocessed().iter().map(|m| format!("{:?}", m.kind)).collect();

    let bufs = appinfo(&c, &[app]).await?;
    let pics = summarize_appinfo(bufs.get(&app).ok_or("app missing")?)?;
    let gid: Option<u64> = pics["manifests"][depot.to_string()].as_str().and_then(|s| s.parse().ok());
    log(t0, "pics", format!("app {app}: {}", if gid.is_some() { "public manifest found" } else { "no manifest" }));

    let key: Result<CMsgClientGetDepotDecryptionKeyResponse, _> = c
        .job(CMsgClientGetDepotDecryptionKey { depot_id: Some(depot), app_id: Some(app), ..Default::default() })
        .await;
    let key_ok = key.as_ref().map(|k| k.eresult() == 1).unwrap_or(false);
    let key_fpr = key.as_ref().ok().filter(|_| key_ok).map(|k| hex::encode(Sha1::digest(k.depot_encryption_key())));
    log(t0, "depotkey", if key_ok { "ok" } else { "FAILED" });

    let code = c
        .service_method(CContentServerDirectory_GetManifestRequestCode_Request {
            app_id: Some(app),
            depot_id: Some(depot),
            manifest_id: gid,
            app_branch: Some("public".into()),
            ..Default::default()
        })
        .await;
    log(t0, "reqcode", match &code { Ok(r) if r.manifest_request_code() != 0 => "ok".to_string(), Ok(_) => "zero".into(), Err(e) => format!("FAILED {e}") });
    let cdn = c
        .service_method(CContentServerDirectory_GetServersForSteamPipe_Request { cell_id: Some(0), max_servers: Some(20), ..Default::default() })
        .await;
    log(t0, "cdn", match &cdn { Ok(s) => format!("{} servers", s.servers.len()), Err(e) => format!("FAILED {e}") });

    Ok(json!({
        "client": "steam-vent@a9e8164", "mode": "refresh-token", "logon": "ok", "account_name_sent": false,
        "licenses": licenses, "unprocessed_after_logon": unprocessed,
        "app": app, "depot": depot, "public_manifest_gid": gid.map(|g| g.to_string()),
        "depot_key": if key_ok { "ok" } else { "failed" }, "depot_key_sha1": key_fpr,
        "request_code": match &code { Ok(r) if r.manifest_request_code() != 0 => json!("ok"), Ok(_) => json!("zero"), Err(e) => json!(format!("failed: {e}")) },
        "cdn_servers": cdn.as_ref().map(|s| s.servers.len()).ok(),
        "elapsed_s": t0.elapsed().as_secs_f64(),
    }))
}

#[tokio::main]
async fn main() -> R<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    std::fs::create_dir_all("out")?;
    let (file, report) = match args.first().map(String::as_str) {
        Some("anon") => ("out/anon.json", anon(&args[1..].iter().map(|a| a.parse().unwrap()).collect::<Vec<u32>>()).await?),
        Some("authed") => ("out/authed.json", authed(&args[1], args[2].parse()?, args[3].parse()?).await?),
        _ => {
            eprintln!("usage: anon <appid>... | authed <vault.json> <appid> <depotid>");
            std::process::exit(64);
        }
    };
    std::fs::write(file, serde_json::to_string_pretty(&report)?)?;
    eprintln!("report -> {file}");
    Ok(())
}
