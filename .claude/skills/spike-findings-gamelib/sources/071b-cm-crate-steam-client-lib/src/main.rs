//! Spike 071b: the same questions as 071a, on steam-client-lib (SteamHelper-rs), a spawned-task
//! client with events. PICS, depot key and content-server calls are not built in, so they are
//! added as marker types (JobMessage / ServiceMethod), which is the crate's extension point.
//!
//!   anon <appid>...                         -> out/anon.json
//!   authed <vault.json> <appid> <depotid>   -> out/authed.json (redacted)
//!
//! Secrets are never printed; the depot key is compared by SHA-1 fingerprint.

use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::collections::BTreeMap;
use std::time::{Duration, Instant};
use steam_client::auth::RefreshToken;
use steam_client::client::SteamClient;
use steam_client::events::Event;
use steam_client::job::JobMessage;
use steam_client::service::ServiceMethod;
use steam_language_gen::generated::enums::EMsg;
use steam_protobuf::protobufs::steammessages_clientserver::CMsgClientLicenseList;
use steam_protobuf::protobufs::steammessages_clientserver_2::{
    CMsgClientGetDepotDecryptionKey, CMsgClientGetDepotDecryptionKeyResponse,
};
use steam_protobuf::protobufs::steammessages_clientserver_appinfo::{
    cmsg_client_picsproduct_info_request, CMsgClientPICSAccessTokenRequest, CMsgClientPICSAccessTokenResponse,
    CMsgClientPICSProductInfoRequest, CMsgClientPICSProductInfoResponse,
};
use steam_protobuf::protobufs::steammessages_contentsystem_steamclient::{
    CContentServerDirectory_GetManifestRequestCode_Request, CContentServerDirectory_GetManifestRequestCode_Response,
    CContentServerDirectory_GetServersForSteamPipe_Request, CContentServerDirectory_GetServersForSteamPipe_Response,
};

type R<T> = Result<T, Box<dyn std::error::Error>>;

enum PicsAccessToken {}
impl JobMessage for PicsAccessToken {
    const REQUEST: EMsg = EMsg::ClientPICSAccessTokenRequest;
    const RESPONSE: EMsg = EMsg::ClientPICSAccessTokenResponse;
    type Request = CMsgClientPICSAccessTokenRequest;
    type Response = CMsgClientPICSAccessTokenResponse;
}

/// Single-response only: the crate's job model can't take PICS answers split over several
/// messages (`response_pending`). One app per request keeps them single.
enum PicsProductInfo {}
impl JobMessage for PicsProductInfo {
    const REQUEST: EMsg = EMsg::ClientPICSProductInfoRequest;
    const RESPONSE: EMsg = EMsg::ClientPICSProductInfoResponse;
    type Request = CMsgClientPICSProductInfoRequest;
    type Response = CMsgClientPICSProductInfoResponse;
}

enum DepotKey {}
impl JobMessage for DepotKey {
    const REQUEST: EMsg = EMsg::ClientGetDepotDecryptionKey;
    const RESPONSE: EMsg = EMsg::ClientGetDepotDecryptionKeyResponse;
    type Request = CMsgClientGetDepotDecryptionKey;
    type Response = CMsgClientGetDepotDecryptionKeyResponse;
    fn result(r: &Self::Response) -> Option<i32> {
        Some(r.eresult())
    }
}

enum ManifestRequestCode {}
impl ServiceMethod for ManifestRequestCode {
    const METHOD: &'static str = "ContentServerDirectory.GetManifestRequestCode#1";
    type Request = CContentServerDirectory_GetManifestRequestCode_Request;
    type Response = CContentServerDirectory_GetManifestRequestCode_Response;
}

enum ServersForSteamPipe {}
impl ServiceMethod for ServersForSteamPipe {
    const METHOD: &'static str = "ContentServerDirectory.GetServersForSteamPipe#1";
    type Request = CContentServerDirectory_GetServersForSteamPipe_Request;
    type Response = CContentServerDirectory_GetServersForSteamPipe_Response;
}

fn log(t0: Instant, cat: &str, msg: impl AsRef<str>) {
    eprintln!("[{:>7.3}s] {cat:<8} {}", t0.elapsed().as_secs_f64(), msg.as_ref());
}

/// keyvalues-parser tree -> serde_json (first value per key), so it can be navigated by path.
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

/// Text-VDF appinfo -> (name, public buildid, depot -> public manifest gid).
fn summarize_appinfo(buf: &[u8]) -> R<Value> {
    let text = String::from_utf8_lossy(buf);
    let vdf = keyvalues_parser::Vdf::parse(text.trim_end_matches('\0'))?;
    let root = to_json(&vdf.value);
    let mut manifests = BTreeMap::new();
    if let Some(d) = root["depots"].as_object() {
        for (id, dep) in d {
            if !id.chars().all(|c| c.is_ascii_digit()) {
                continue;
            }
            let p = &dep["manifests"]["public"];
            let gid = p.as_str().map(str::to_string).or_else(|| p["gid"].as_str().map(str::to_string));
            if let Some(g) = gid {
                manifests.insert(id.clone(), g);
            }
        }
    }
    Ok(json!({ "name": root["common"]["name"], "buildid": root["depots"]["branches"]["public"]["buildid"], "manifests": manifests }))
}

async fn appinfo<A: steam_client::client::Account>(
    client: &mut SteamClient<steam_client::client::LoggedOn<A>>,
    app: u32,
) -> R<Vec<u8>> {
    let mut tr = CMsgClientPICSAccessTokenRequest::new();
    tr.appids.push(app);
    let tokens = client.call_job::<PicsAccessToken>(tr).await?;
    let token = tokens.app_access_tokens.iter().find(|t| t.appid() == app).map(|t| t.access_token()).unwrap_or(0);
    let mut req = CMsgClientPICSProductInfoRequest::new();
    let mut a = cmsg_client_picsproduct_info_request::AppInfo::new();
    a.set_appid(app);
    a.set_access_token(token);
    req.apps.push(a);
    req.set_meta_data_only(false);
    let resp = client.call_job::<PicsProductInfo>(req).await?;
    if resp.response_pending() {
        return Err("PICS answer split over several messages: unsupported by the job model".into());
    }
    let ai = resp.apps.into_iter().next().ok_or("no app in PICS response")?;
    Ok(ai.buffer().to_vec())
}

async fn anon(apps: &[u32]) -> R<Value> {
    let t0 = Instant::now();
    let mut client = SteamClient::connect().await?.login_anonymous().await?;
    log(t0, "logon", "anonymous ok");
    let mut out = serde_json::Map::new();
    for &a in apps {
        let t = Instant::now();
        let buf = appinfo(&mut client, a).await?;
        let s = summarize_appinfo(&buf)?;
        log(t0, "pics", format!("{a} {} build {} {} manifests in {:?}", s["name"], s["buildid"], s["manifests"].as_object().map(|m| m.len()).unwrap_or(0), t.elapsed()));
        out.insert(a.to_string(), s);
    }
    let _ = client.log_off().await;
    Ok(json!({ "client": "steam-client-lib@f77c946", "mode": "anonymous", "apps": out, "elapsed_s": t0.elapsed().as_secs_f64() }))
}

async fn authed(vault: &str, app: u32, depot: u32) -> R<Value> {
    let t0 = Instant::now();
    let v: Value = serde_json::from_str(&std::fs::read_to_string(vault)?)?;
    let token = RefreshToken::new(v["steam-refresh-token"].as_str().ok_or("no token slot")?.to_string())?;
    log(t0, "token", "refresh token loaded (value not shown)");
    // SPIKE_ACCOUNT: the account name from Mac Steam's loginusers.vdf (see account-name.sh).
    let account = std::env::var("SPIKE_ACCOUNT").unwrap_or_default();
    let mut client = match SteamClient::connect().await?.login_with_refresh_token(&account, token).await {
        Ok(c) => c,
        Err(e) => {
            log(t0, "logon", format!("FAILED (account name sent: {}): {e}", !account.is_empty()));
            return Ok(json!({ "logon": "failed", "account_name_sent": !account.is_empty(), "error": e.to_string() }));
        }
    };
    log(t0, "logon", format!("refresh-token logon ok (account name sent: {})", !account.is_empty()));

    // Licenses arrive as an event; nothing should have been dropped.
    let mut seen: BTreeMap<String, u32> = BTreeMap::new();
    let mut licenses = None;
    let deadline = Instant::now() + Duration::from_secs(10);
    while licenses.is_none() && Instant::now() < deadline {
        let left = deadline.saturating_duration_since(Instant::now());
        let Ok(ev) = tokio::time::timeout(left, client.next_event()).await else { break };
        match ev? {
            Event::Message(m) => {
                *seen.entry(format!("{:?}", m.emsg())).or_default() += 1;
                if m.emsg() == EMsg::ClientLicenseList {
                    let l: CMsgClientLicenseList = m.parse_proto()?;
                    log(t0, "license", format!("{} licenses (as an event)", l.licenses.len()));
                    licenses = Some(l.licenses.len());
                }
            }
            other => {
                *seen.entry(format!("{other:?}")).or_default() += 1;
            }
        }
    }

    let pics = appinfo(&mut client, app).await.and_then(|b| summarize_appinfo(&b));
    let gid: Option<u64> = pics.as_ref().ok().and_then(|p| p["manifests"][depot.to_string()].as_str().and_then(|s| s.parse().ok()));
    log(t0, "pics", format!("app {app}: {}", if gid.is_some() { "public manifest found" } else { "no manifest" }));

    let mut kr = CMsgClientGetDepotDecryptionKey::new();
    kr.set_depot_id(depot);
    kr.set_app_id(app);
    let key = client.call_job::<DepotKey>(kr).await;
    let key_fpr = key.as_ref().ok().map(|k| hex::encode(Sha1::digest(k.depot_encryption_key())));
    log(t0, "depotkey", if key.is_ok() { "ok" } else { "FAILED" });

    let code = match gid {
        Some(g) => {
            let mut r = CContentServerDirectory_GetManifestRequestCode_Request::new();
            r.set_app_id(app);
            r.set_depot_id(depot);
            r.set_manifest_id(g);
            r.set_app_branch("public".into());
            client.call::<ManifestRequestCode>(r).await.map(|x| x.manifest_request_code())
        }
        None => Err(steam_client::errors::ClientError::Dropped),
    };
    log(t0, "reqcode", match &code { Ok(c) if *c != 0 => "ok", Ok(_) => "zero", Err(_) => "FAILED" });

    let mut sr = CContentServerDirectory_GetServersForSteamPipe_Request::new();
    sr.set_cell_id(0);
    sr.set_max_servers(20);
    let servers = client.call::<ServersForSteamPipe>(sr).await;
    log(t0, "cdn", match &servers { Ok(s) => format!("{} servers", s.servers.len()), Err(e) => format!("FAILED {e}") });

    let _ = client.log_off().await;
    Ok(json!({
        "client": "steam-client-lib@f77c946", "mode": "refresh-token", "logon": "ok", "account_name_sent": !account.is_empty(),
        "licenses": licenses, "events_seen": seen,
        "app": app, "depot": depot, "public_manifest_gid": gid.map(|g| g.to_string()),
        "pics_error": pics.as_ref().err().map(|e| e.to_string()),
        "depot_key": key.as_ref().map(|_| "ok").unwrap_or("failed"), "depot_key_sha1": key_fpr,
        "request_code": match &code { Ok(c) if *c != 0 => json!("ok"), Ok(_) => json!("zero"), Err(e) => json!(format!("failed: {e}")) },
        "cdn_servers": servers.as_ref().map(|s| s.servers.len()).ok(),
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
