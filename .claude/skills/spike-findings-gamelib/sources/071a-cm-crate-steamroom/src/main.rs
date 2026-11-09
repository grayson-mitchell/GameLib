//! Spike 071a: can steamroom supply every CM-side input GameLib takes from steam-user?
//!
//!   anon <appid>...                         anonymous logon + PICS appinfo -> out/anon.json
//!   authed <vault.json> <appid> [depotid]   refresh-token logon, license list, owned-app
//!                                           count, depot key, request code, CDN hosts and
//!                                           auth token -> out/authed.json (redacted).
//!                                           With --emit-summarize, prints a gamelib-depot-cli
//!                                           `summarize` request on stdout for piping.
//!
//! Secrets (refresh token, depot key, request code, CDN auth token) are never written to the
//! report or stderr. The report carries only presence, lengths of non-secret ids, and a SHA-1
//! fingerprint of the depot key so two clients' keys can be compared without revealing them.

use base64::Engine;
use prost::Message;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::collections::{BTreeMap, BTreeSet};
use std::time::{Duration, Instant};
use steamroom::client::{LoggedIn, PROTOCOL_VERSION, SteamClient};
use steamroom::client::msg::ClientMsg;
use steamroom::connection::{CmServer, Protocol};
use steamroom::depot::{AppId, CellId, DepotId, ManifestId, PackageId};
use steamroom::generated::{CMsgClientLicenseList, CMsgClientLogon};
use steamroom::messages::EMsg;
use steamroom::transport::websocket::WebSocketTransport;
use steamroom::transport::recording::{Recorder, RecordingTransport};
use steamroom::types::key_value::{KeyValue, KvValue};

type R<T> = Result<T, Box<dyn std::error::Error>>;

fn log(t0: Instant, cat: &str, msg: impl AsRef<str>) {
    eprintln!("[{:>7.3}s] {cat:<8} {}", t0.elapsed().as_secs_f64(), msg.as_ref());
}

fn child<'a>(kv: &'a KeyValue, key: &str) -> Option<&'a KeyValue> {
    match &kv.value {
        KvValue::Children(m) => m
            .get(key)
            .or_else(|| m.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)).map(|(_, v)| v)),
        _ => None,
    }
}

fn path<'a>(kv: &'a KeyValue, p: &[&str]) -> Option<&'a KeyValue> {
    p.iter().try_fold(kv, |acc, k| child(acc, k))
}

fn scalar(kv: &KeyValue) -> Option<String> {
    match &kv.value {
        KvValue::String(s) => Some(s.clone()),
        KvValue::Int32(i) => Some(i.to_string()),
        KvValue::UInt64(i) => Some(i.to_string()),
        KvValue::Int64(i) => Some(i.to_string()),
        _ => None,
    }
}

fn children(kv: &KeyValue) -> Vec<(&String, &KeyValue)> {
    match &kv.value {
        KvValue::Children(m) => m.iter().collect(),
        _ => vec![],
    }
}

/// The appinfo root may be the app node itself or wrap it ("appinfo" / the appid).
fn app_root(kv: &KeyValue) -> &KeyValue {
    if child(kv, "depots").is_some() || child(kv, "common").is_some() {
        return kv;
    }
    for (_, c) in children(kv) {
        if child(c, "depots").is_some() || child(c, "common").is_some() {
            return c;
        }
    }
    kv
}

/// depot id -> public manifest gid, from both appinfo shapes (manifests/public/gid and the
/// older manifests/public = "<gid>").
fn public_manifests(app: &KeyValue) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    if let Some(depots) = child(app, "depots") {
        for (id, d) in children(depots) {
            if !id.chars().all(|c| c.is_ascii_digit()) {
                continue;
            }
            if let Some(p) = path(d, &["manifests", "public"]) {
                let gid = child(p, "gid").and_then(scalar).or_else(|| scalar(p));
                if let Some(g) = gid {
                    out.insert(id.clone(), g);
                }
            }
        }
    }
    out
}

async fn connect_ws() -> R<SteamClient<steamroom::client::Ready>> {
    Ok(connect_ws_rec().await?.0)
}

/// Same, with every received frame recorded so messages login() discards can be recovered.
async fn connect_ws_rec() -> R<(SteamClient<steamroom::client::Ready>, Recorder)> {
    let servers = CmServer::fetch().await.unwrap_or_else(|_| CmServer::defaults());
    let ws = servers
        .iter()
        .find(|s| s.protocol == Protocol::WebSocket)
        .ok_or("no websocket CM")?;
    let transport = RecordingTransport::new(WebSocketTransport::connect(ws).await?);
    let rec = transport.recorder();
    let (client, _rx) = SteamClient::connect_ws(transport).await?;
    Ok((client.prepare().await?, rec))
}

async fn logon(
    client: SteamClient<steamroom::client::Ready>,
    logon: CMsgClientLogon,
    steam_id: u64,
) -> R<SteamClient<LoggedIn>> {
    let body = logon.encode_to_vec();
    let mut msg = ClientMsg::with_body(EMsg::CLIENT_LOGON, &body);
    msg.header.steamid = Some(steam_id);
    msg.header.client_sessionid = Some(0);
    let (client, _resp) = client.login(msg).await?;
    Ok(client)
}

/// Parse a protobuf CM message frame: u32 emsg (proto bit set), u32 header len, header, body.
fn split_frame(b: &[u8]) -> Option<(u32, &[u8])> {
    if b.len() < 8 {
        return None;
    }
    let raw = u32::from_le_bytes(b[0..4].try_into().ok()?);
    if raw & 0x8000_0000 == 0 {
        return None;
    }
    let hlen = u32::from_le_bytes(b[4..8].try_into().ok()?) as usize;
    let body = b.get(8 + hlen..)?;
    Some((raw & !0x8000_0000, body))
}

/// Scan frames recorded during login() for messages it read past and dropped.
async fn scan_recorded(rec: &Recorder, t0: Instant) -> R<(Option<CMsgClientLicenseList>, BTreeMap<u32, u32>)> {
    let cap = rec.flush().await;
    let mut seen = BTreeMap::new();
    let mut lic = None;
    for p in cap.packets {
        let raw = base64::engine::general_purpose::STANDARD.decode(&p.payload_b64)?;
        let Some((e, body)) = split_frame(&raw) else { continue };
        let mut frames: Vec<(u32, Vec<u8>)> = vec![];
        if e == EMsg::MULTI.0 {
            for sub in steamroom::client::multi::unpack_multi(body)? {
                if let Some((se, sb)) = split_frame(&sub) { frames.push((se, sb.to_vec())); }
            }
        } else {
            frames.push((e, body.to_vec()));
        }
        for (e, b) in frames {
            *seen.entry(e).or_default() += 1;
            if e == EMsg::CLIENT_LICENSE_LIST.0 {
                let l = CMsgClientLicenseList::decode(&*b)?;
                log(t0, "license", format!("recovered from login() reads: {} licenses", l.licenses.len()));
                lic = Some(l);
            }
        }
    }
    Ok((lic, seen))
}

/// Drain unsolicited messages for `window`, collecting the license list. steamroom has no
/// message pump: anything not read here would be silently discarded by the next call.
async fn collect_licenses(
    client: &SteamClient<LoggedIn>,
    window: Duration,
    t0: Instant,
) -> R<(Option<CMsgClientLicenseList>, BTreeMap<u32, u32>)> {
    let deadline = Instant::now() + window;
    let mut seen: BTreeMap<u32, u32> = BTreeMap::new();
    let mut licenses = None;
    while Instant::now() < deadline {
        let left = deadline.saturating_duration_since(Instant::now());
        let Ok(res) = tokio::time::timeout(left, client.recv_msg()).await else { break };
        let msg = res?;
        let mut frames: Vec<(u32, bytes::Bytes)> = vec![];
        if msg.emsg == EMsg::MULTI {
            for sub in steamroom::client::multi::unpack_multi(&msg.body)? {
                if let Some((e, body)) = split_frame(&sub) {
                    frames.push((e, bytes::Bytes::copy_from_slice(body)));
                }
            }
        } else {
            frames.push((msg.emsg.0, msg.body.clone()));
        }
        for (e, body) in frames {
            *seen.entry(e).or_default() += 1;
            if e == EMsg::CLIENT_LICENSE_LIST.0 {
                let l = CMsgClientLicenseList::decode(&*body)?;
                log(t0, "license", format!("{} licenses, eresult {:?}", l.licenses.len(), l.eresult));
                licenses = Some(l);
            }
        }
        if licenses.is_some() {
            break;
        }
    }
    Ok((licenses, seen))
}

fn jwt_sub(token: &str) -> R<u64> {
    let payload = token.split('.').nth(1).ok_or("refresh token is not a JWT")?;
    let raw = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(payload.trim_end_matches('='))?;
    let v: Value = serde_json::from_slice(&raw)?;
    Ok(v["sub"].as_str().ok_or("no sub")?.parse()?)
}

async fn anon(apps: &[u32]) -> R<Value> {
    let t0 = Instant::now();
    let client = connect_ws().await?;
    log(t0, "connect", "ws ready");
    let logon_msg = CMsgClientLogon {
        protocol_version: Some(PROTOCOL_VERSION),
        cell_id: Some(0),
        client_os_type: Some(20),
        ..Default::default()
    };
    let anon_id = steamroom::types::steam_id::SteamId::from_parts(1, 10, 0, 0).raw();
    let client = logon(client, logon_msg, anon_id).await?;
    log(t0, "logon", "anonymous ok");
    let mut out = serde_json::Map::new();
    for &a in apps {
        let t = Instant::now();
        let kv = client.app_key_values(AppId(a)).await?;
        let app = app_root(&kv);
        let name = path(app, &["common", "name"]).and_then(scalar);
        let buildid = path(app, &["depots", "branches", "public", "buildid"]).and_then(scalar);
        let m = public_manifests(app);
        log(t0, "pics", format!("{a} {:?} build {:?} {} public manifests in {:?}", name, buildid, m.len(), t.elapsed()));
        out.insert(a.to_string(), json!({ "name": name, "buildid": buildid, "manifests": m }));
    }
    Ok(json!({ "client": "steamroom@e892bdf", "mode": "anonymous", "apps": out, "elapsed_s": t0.elapsed().as_secs_f64() }))
}

async fn authed(vault: &str, app: u32, depot: Option<u32>, emit: bool) -> R<Value> {
    let t0 = Instant::now();
    let v: Value = serde_json::from_str(&std::fs::read_to_string(vault)?)?;
    let token = v["steam-refresh-token"].as_str().ok_or("no steam-refresh-token slot")?.to_string();
    let steam_id = jwt_sub(&token)?;
    log(t0, "token", "refresh token loaded (value not shown)");

    let (client, rec) = connect_ws_rec().await?;
    log(t0, "connect", "ws ready (recording)");
    let logon_msg = CMsgClientLogon {
        protocol_version: Some(PROTOCOL_VERSION),
        cell_id: Some(0),
        client_os_type: Some(20),
        access_token: Some(token),
        should_remember_password: Some(true),
        ..Default::default()
    };
    let client = match logon(client, logon_msg, steam_id).await {
        Ok(c) => c,
        Err(e) => {
            log(t0, "logon", format!("FAILED: {e}"));
            return Ok(json!({ "logon": "failed", "error": e.to_string() }));
        }
    };
    log(t0, "logon", "refresh-token logon ok, no account name sent");

    let (mut lic, seen_login) = scan_recorded(&rec, t0).await?;
    log(t0, "login-rx", format!("frames read by login(): {seen_login:?}"));
    let mut seen = BTreeMap::new();
    if lic.is_none() {
        let (l, s) = collect_licenses(&client, Duration::from_secs(10), t0).await?;
        lic = l; seen = s;
    }
    let _ = rec.flush().await; // stop the buffer from growing
    let pkg_ids: Vec<u32> = lic.as_ref().map(|l| l.licenses.iter().filter_map(|x| x.package_id).collect()).unwrap_or_default();
    let family_owned = lic.as_ref().map(|l| l.licenses.iter().filter(|x| x.owner_id.map(|o| o as u64 != (steam_id & 0xffff_ffff)).unwrap_or(false)).count()).unwrap_or(0);

    // Owned apps: package info for every licensed package -> appids.
    let mut owned_apps: BTreeSet<u32> = BTreeSet::new();
    let t = Instant::now();
    for chunk in pkg_ids.chunks(500) {
        let ids: Vec<PackageId> = chunk.iter().map(|p| PackageId(*p)).collect();
        for p in client.pics_get_package_info(&ids).await? {
            if let Ok(kv) = p.key_values() {
                let root = if child(&kv, "appids").is_some() { &kv } else { children(&kv).first().map(|(_, c)| *c).unwrap_or(&kv) };
                if let Some(appids) = child(root, "appids") {
                    for (_, a) in children(appids) {
                        if let Some(s) = scalar(a) { if let Ok(n) = s.parse() { owned_apps.insert(n); } }
                    }
                }
            }
        }
    }
    log(t0, "owned", format!("{} packages -> {} distinct appids in {:?}", pkg_ids.len(), owned_apps.len(), t.elapsed()));
    let owned_path = "out/owned-appids.json";
    std::fs::write(owned_path, serde_json::to_string(&owned_apps)?)?;

    let kv = client.app_key_values(AppId(app)).await?;
    let root = app_root(&kv);
    let manifests = public_manifests(root);
    let depot_id = depot.or_else(|| manifests.keys().next().and_then(|d| d.parse().ok())).ok_or("no depot with a public manifest")?;
    let gid: u64 = manifests.get(&depot_id.to_string()).ok_or("depot has no public manifest")?.parse()?;
    log(t0, "pics", format!("app {app} depot {depot_id}: public manifest found"));

    let key = client.get_depot_decryption_key(DepotId(depot_id), AppId(app)).await;
    let key_fpr = key.as_ref().ok().map(|k| hex::encode(Sha1::digest(k.0)));
    log(t0, "depotkey", format!("{}", if key.is_ok() { "ok" } else { "FAILED" }));
    let code = client.get_manifest_request_code(AppId(app), DepotId(depot_id), ManifestId(gid), None, None).await;
    log(t0, "reqcode", format!("{}", match &code { Ok(Some(_)) => "ok", Ok(None) => "none", Err(_) => "FAILED" }));
    let cdn = client.get_cdn_servers(CellId(0), Some(20)).await?;
    log(t0, "cdn", format!("{} servers", cdn.len()));
    let first = cdn.iter().find(|s| s.https).or(cdn.first()).ok_or("no cdn servers")?;
    let auth = client.get_cdn_auth_token(AppId(app), DepotId(depot_id), &first.vhost).await;
    log(t0, "cdnauth", format!("{}", match &auth { Ok(t) if t.token.is_some() => "token issued", Ok(_) => "ok, no token", Err(_) => "FAILED" }));

    if emit {
        if let (Ok(k), Ok(c)) = (&key, &code) {
            let hosts: Vec<Value> = cdn.iter().take(8).map(|s| json!({
                "host": s.host, "vhost": s.vhost, "kind": "SteamCache",
                "httpsSupport": if s.https { "mandatory" } else { "unavailable" },
                "useTokenAuth": false, "weightedLoad": null })).collect();
            let req = json!({ "request": { "appId": app.to_string(), "depots": [{
                "depotId": depot_id.to_string(), "manifestId": gid.to_string(),
                "requestCode": c.map(|v| v.to_string()), "key": hex::encode(k.0),
                "ownerAppId": app.to_string() }], "hosts": hosts, "patterns": [] }, "tokens": {} });
            println!("{req}");
        }
    }

    Ok(json!({
        "client": "steamroom@e892bdf", "mode": "refresh-token",
        "logon": "ok", "account_name_sent": false,
        "licenses": pkg_ids.len(), "licenses_with_other_owner": family_owned,
        "owned_appids": owned_apps.len(), "owned_appids_file": owned_path,
        "emsgs_read_by_login": seen_login, "unsolicited_emsgs_after_login": seen,
        "app": app, "depot": depot_id, "public_manifest_gid": gid.to_string(),
        "depot_key": key.as_ref().map(|_| "ok").unwrap_or("failed"), "depot_key_sha1": key_fpr,
        "depot_key_error": key.as_ref().err().map(|e| e.to_string()),
        "request_code": match &code { Ok(Some(_)) => json!("ok"), Ok(None) => json!("none"), Err(e) => json!(format!("failed: {e}")) },
        "cdn_servers": cdn.len(), "cdn_https": cdn.iter().filter(|s| s.https).count(),
        "cdn_auth_token": match &auth { Ok(t) if t.token.is_some() => json!("issued"), Ok(_) => json!("not issued"), Err(e) => json!(format!("failed: {e}")) },
        "elapsed_s": t0.elapsed().as_secs_f64(),
    }))
}

#[tokio::main]
async fn main() -> R<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    std::fs::create_dir_all("out")?;
    let (file, report) = match args.first().map(String::as_str) {
        Some("anon") => ("out/anon.json", anon(&args[1..].iter().map(|a| a.parse().unwrap()).collect::<Vec<u32>>()).await?),
        Some("authed") => {
            let emit = args.iter().any(|a| a == "--emit-summarize");
            let pos: Vec<&String> = args.iter().filter(|a| !a.starts_with("--")).collect();
            ("out/authed.json", authed(pos[1], pos[2].parse()?, pos.get(3).map(|d| d.parse()).transpose()?, emit).await?)
        }
        _ => {
            eprintln!("usage: anon <appid>... | authed <vault.json> <appid> [depotid] [--emit-summarize]");
            std::process::exit(64);
        }
    };
    std::fs::write(file, serde_json::to_string_pretty(&report)?)?;
    eprintln!("report -> {file}");
    Ok(())
}
