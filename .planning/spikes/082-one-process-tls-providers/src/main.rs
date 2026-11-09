//! Spike 082: steam-vent (aws-lc-rs) and gamelib-depot (ring) in ONE process.
//!
//!   spike-082-tls <arm> <cache_dir>
//!
//! Arms (each its own process, because the rustls default provider is process-global):
//!   bare              no install anywhere; a reqwest client (rustls-no-provider, like tauri core /
//!                     the updater / gamelib-depot) does one HTTPS GET.  Runs in the control build too.
//!   vent-then-depot   anonymous CM logon first, then gamelib-depot manifest summaries, then bare GET
//!   depot-then-vent   gamelib-depot's client is created first (junk host), then CM, then summaries
//!   concurrent        CM session keeps doing PICS jobs on a tokio runtime WHILE gamelib-depot runs
//!                     summaries on the main thread; then one more CM job
//!   explicit-ring     ring installed at process start, then vent-then-depot
//!   explicit-aws      aws-lc installed at process start, then vent-then-depot
//!
//! Anonymous logon only (app 1007, depot 1004: anonymous key granted, 080). No secrets.
//! Every step runs under catch_unwind; one JSON report on stdout.

use serde_json::{Value, json};
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::Arc;
use std::time::Instant;

static T0: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();
fn log(cat: &str, msg: impl AsRef<str>) {
    let t = T0.get_or_init(Instant::now).elapsed().as_secs_f64();
    eprintln!("[{t:>7.3}s] {cat:<10} {}", msg.as_ref());
}

/// Which provider is the process default right now. aws-lc-rs's default provider offers the
/// post-quantum X25519MLKEM768 group; ring's does not.
fn provider() -> Value {
    match rustls::crypto::CryptoProvider::get_default() {
        None => json!("none"),
        Some(p) => {
            let kx: Vec<String> = p.kx_groups.iter().map(|g| format!("{:?}", g.name())).collect();
            let who = if kx.iter().any(|k| k.contains("MLKEM")) { "aws-lc-rs" } else { "ring" };
            json!({ "who": who, "kx": kx, "suites": p.cipher_suites.len() })
        }
    }
}

fn step<T>(report: &mut Value, name: &str, f: impl FnOnce() -> Result<T, String>) -> Option<T>
where
    T: Into<Value> + Clone,
{
    let r = catch_unwind(AssertUnwindSafe(f));
    let (out, val) = match r {
        Ok(Ok(v)) => (json!({ "ok": true, "value": v.clone().into() }), Some(v)),
        Ok(Err(e)) => (json!({ "ok": false, "error": e }), None),
        Err(p) => {
            let msg = p
                .downcast_ref::<String>()
                .cloned()
                .or_else(|| p.downcast_ref::<&str>().map(|s| s.to_string()))
                .unwrap_or_else(|| "non-string panic".into());
            (json!({ "ok": false, "panic": msg }), None)
        }
    };
    log("step", format!("{name}: {out}"));
    report["steps"].as_array_mut().unwrap().push(json!({ "step": name, "result": out, "provider_after": provider() }));
    val
}

/// One HTTPS GET with a fresh reqwest client and no explicit provider install.
fn bare_get() -> Result<String, String> {
    let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
    rt.block_on(async {
        let c = reqwest::Client::builder().build().map_err(|e| format!("build: {e}"))?;
        let r = c
            .get("https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/")
            .send()
            .await
            .map_err(|e| format!("send: {e:?}"))?;
        Ok(format!("HTTP {}", r.status().as_u16()))
    })
}

#[cfg(feature = "vent")]
mod cm {
    use super::log;
    use futures_util::StreamExt;
    use serde_json::{Value, json};
    use steam_vent::{Connection, ConnectionTrait, ServerList};
    use steam_vent_proto::steammessages_clientserver_2::{
        CMsgClientGetDepotDecryptionKey, CMsgClientGetDepotDecryptionKeyResponse,
    };
    use steam_vent_proto::steammessages_clientserver_appinfo::{
        CMsgClientPICSProductInfoRequest, CMsgClientPICSProductInfoResponse, cmsg_client_picsproduct_info_request,
    };
    use steam_vent_proto::steammessages_contentsystem_steamclient::{
        CContentServerDirectory_GetManifestRequestCode_Request, CContentServerDirectory_GetServersForSteamPipe_Request,
    };

    pub const APP: u32 = 1007;
    pub const DEPOT: u32 = 1004;

    pub async fn connect() -> Result<Connection, String> {
        let servers = ServerList::discover().await.map_err(|e| format!("discover: {e}"))?;
        let c = Connection::anonymous(&servers).await.map_err(|e| format!("anon logon: {e}"))?;
        log("cm", "anonymous logon ok");
        Ok(c)
    }

    pub async fn pics(c: &Connection) -> Result<Vec<u8>, String> {
        let req = CMsgClientPICSProductInfoRequest {
            apps: vec![cmsg_client_picsproduct_info_request::AppInfo { appid: Some(APP), ..Default::default() }],
            meta_data_only: Some(false),
            ..Default::default()
        };
        let mut s = std::pin::pin!(c.job_multi::<_, CMsgClientPICSProductInfoResponse>(req));
        while let Some(part) = s.next().await {
            for a in part.map_err(|e| format!("pics: {e}"))?.apps {
                if a.appid() == APP {
                    return Ok(a.buffer().to_vec());
                }
            }
        }
        Err("app missing".into())
    }

    fn public_gid(buf: &[u8]) -> Option<String> {
        let text = String::from_utf8_lossy(buf);
        let vdf = keyvalues_parser::Vdf::parse(text.trim().trim_end_matches('\0')).ok()?;
        let root = vdf.value.get_obj()?;
        let dep = root.get("depots")?.first()?.get_obj()?.get(DEPOT.to_string().as_str())?.first()?.get_obj()?;
        match dep.get("manifests")?.first()?.get_obj()?.get("public")?.first()? {
            keyvalues_parser::Value::Str(s) => Some(s.to_string()),
            keyvalues_parser::Value::Obj(o) => o.get("gid")?.first()?.get_str().map(str::to_string),
        }
    }

    /// Everything gamelib-depot's summary needs. Returns (args json, request code).
    pub async fn job_inputs(c: &Connection) -> Result<(Value, String), String> {
        let buf = pics(c).await?;
        let gid = public_gid(&buf).ok_or("no public gid")?;
        let key: CMsgClientGetDepotDecryptionKeyResponse = c
            .job(CMsgClientGetDepotDecryptionKey { depot_id: Some(DEPOT), app_id: Some(APP), ..Default::default() })
            .await
            .map_err(|e| format!("depot key: {e}"))?;
        if key.eresult() != 1 {
            return Err(format!("depot key eresult {}", key.eresult()));
        }
        let code = c
            .service_method(CContentServerDirectory_GetManifestRequestCode_Request {
                app_id: Some(APP),
                depot_id: Some(DEPOT),
                manifest_id: Some(gid.parse().unwrap()),
                app_branch: Some("public".into()),
                ..Default::default()
            })
            .await
            .map_err(|e| format!("reqcode: {e}"))?
            .manifest_request_code();
        let cdn = c
            .service_method(CContentServerDirectory_GetServersForSteamPipe_Request {
                cell_id: Some(0),
                max_servers: Some(20),
                ..Default::default()
            })
            .await
            .map_err(|e| format!("cdn: {e}"))?;
        let hosts: Vec<Value> = cdn
            .servers
            .iter()
            .filter(|s| s.type_() == "CDN" || s.type_() == "SteamCache")
            .map(|s| json!({ "host": s.host(), "vhost": s.vhost(), "kind": s.type_(), "httpsSupport": s.https_support(),
                             "useTokenAuth": false, "weightedLoad": s.weighted_load() }))
            .collect();
        let args = json!({
            "appId": APP.to_string(),
            "depots": [{ "depotId": DEPOT.to_string(), "manifestId": gid, "requestCode": code.to_string(),
                         "key": hex::encode(key.depot_encryption_key()), "ownerAppId": APP.to_string() }],
            "hosts": hosts,
            "patterns": ["*.exe", "*.dll"],
        });
        Ok((args, code.to_string()))
    }
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

/// Real gamelib-depot `depot_manifest_summary`. `force_https` rewrites every host to
/// httpsSupport=mandatory so the fetch must go through TLS.
fn summary(args: &Value, code: &str, cache: &str, force_https: bool) -> Result<String, String> {
    let mut a = args.clone();
    let schemes: Vec<String> = a["hosts"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .map(|h| {
            if force_https {
                h["httpsSupport"] = json!("mandatory");
            }
            h["httpsSupport"].as_str().unwrap_or("?").to_string()
        })
        .collect();
    let ctx = gamelib_depot::JobContext { cache_dir: std::path::PathBuf::from(cache).join(if force_https { "https" } else { "plain" }) };
    let _ = std::fs::remove_dir_all(&ctx.cache_dir); // never satisfy from the manifest cache
    let r = gamelib_depot::dispatch("depot_manifest_summary", &a, &ctx, Arc::new(Host { code: code.to_string() }))
        .map_err(|e| format!("dispatch: {e}"))?;
    if let Some(e) = r.get("error") {
        return Err(format!("summary error {e} (host httpsSupport {schemes:?})"));
    }
    let n = r["depots"][0]["fileCount"].clone();
    Ok(format!("fileCount {n}, host httpsSupport {schemes:?}"))
}

/// gamelib-depot creates its one reqwest client (and its ring install) on its first fetch. A
/// summary against a dead https host gets that done without needing any CM input.
fn prime_depot_client(cache: &str) -> Result<String, String> {
    let args = json!({
        "appId": "1007",
        "depots": [{ "depotId": "1004", "manifestId": "1", "requestCode": "1", "key": "00".repeat(32), "ownerAppId": "1007" }],
        "hosts": [{ "host": "127.0.0.1:9", "vhost": "127.0.0.1", "kind": "CDN", "httpsSupport": "mandatory", "useTokenAuth": false }],
        "patterns": ["*.exe"],
    });
    let ctx = gamelib_depot::JobContext { cache_dir: std::path::PathBuf::from(cache).join("prime") };
    let r = gamelib_depot::dispatch("depot_manifest_summary", &args, &ctx, Arc::new(Host { code: "1".into() }));
    Ok(format!("dead-host summary returned (expected error): {}", match r {
        Ok(v) => v.get("error").map(|e| e.to_string()).unwrap_or("no error?!".into()),
        Err(e) => e.to_string(),
    }))
}

fn main() {
    T0.get_or_init(Instant::now);
    std::panic::set_hook(Box::new(|i| log("PANIC", i.to_string())));
    let a: Vec<String> = std::env::args().skip(1).collect();
    let (arm, cache) = (a.first().cloned().unwrap_or_default(), a.get(1).cloned().unwrap_or("out/cache".into()));
    let build = if cfg!(feature = "vent") { "with steam-vent (rustls: ring + aws_lc_rs)" } else { "control (rustls: ring only)" };
    let mut report = json!({ "arm": arm, "build": build, "provider_at_start": provider(), "steps": [] });
    log("start", format!("arm {arm}, {build}"));

    match arm.as_str() {
        "bare" => {
            step(&mut report, "bare reqwest GET (no install)", bare_get);
        }
        #[cfg(feature = "vent")]
        "vent-then-depot" | "explicit-ring" | "explicit-aws" | "depot-then-vent" | "concurrent" => {
            if arm == "explicit-ring" {
                step(&mut report, "install ring", || {
                    rustls::crypto::ring::default_provider().install_default().map(|_| "ok".to_string()).map_err(|_| "already".into())
                });
            }
            if arm == "explicit-aws" {
                step(&mut report, "install aws-lc", || {
                    rustls::crypto::aws_lc_rs::default_provider().install_default().map(|_| "ok".to_string()).map_err(|_| "already".into())
                });
            }
            if arm == "depot-then-vent" {
                step(&mut report, "prime gamelib-depot client first", || prime_depot_client(&cache));
            }
            let rt = tokio::runtime::Runtime::new().unwrap();
            let conn = step(&mut report, "CM anonymous connect + job inputs", || {
                rt.block_on(async {
                    let c = cm::connect().await?;
                    let (args, code) = cm::job_inputs(&c).await?;
                    Ok::<_, String>((c, args, code))
                })
                .map(|t| {
                    CONN.with(|cell| *cell.borrow_mut() = Some(t));
                    "ok".to_string()
                })
            });
            let Some(_) = conn else {
                println!("{}", serde_json::to_string_pretty(&report).unwrap());
                std::process::exit(2);
            };
            let (c, args, code) = CONN.with(|cell| cell.borrow_mut().take().unwrap());
            let c = Arc::new(c);

            if arm == "concurrent" {
                // CM keeps working on the runtime's worker threads while the depot runs here.
                let c2 = Arc::clone(&c);
                let pumping = rt.spawn(async move {
                    let mut ok = 0u32;
                    let mut errs = vec![];
                    for _ in 0..40 {
                        match cm::pics(&c2).await {
                            Ok(_) => ok += 1,
                            Err(e) => errs.push(e),
                        }
                        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
                    }
                    (ok, errs)
                });
                step(&mut report, "depot summary plain (CM busy)", || summary(&args, &code, &cache, false));
                step(&mut report, "depot summary https (CM busy)", || summary(&args, &code, &cache, true));
                // Keep the depot side busy for as long as the CM loop runs (~25 s), not ~50 ms.
                step(&mut report, "depot summary https x N while CM busy", || {
                    let (mut ok, mut errs, t) = (0u32, vec![], Instant::now());
                    while !pumping.is_finished() {
                        match summary(&args, &code, &cache, true) {
                            Ok(_) => ok += 1,
                            Err(e) => errs.push(e),
                        }
                    }
                    let s = format!("{ok} summaries in {:.1}s while CM looped", t.elapsed().as_secs_f64());
                    if errs.is_empty() { Ok(s) } else { Err(format!("{s}; errors {errs:?}")) }
                });
                step(&mut report, "CM PICS loop during depot", || {
                    let (ok, errs) = rt.block_on(pumping).map_err(|e| e.to_string())?;
                    if errs.is_empty() { Ok(format!("{ok}/40 PICS jobs ok")) } else { Err(format!("{ok}/40 ok, errors {errs:?}")) }
                });
            } else {
                step(&mut report, "depot summary plain", || summary(&args, &code, &cache, false));
                step(&mut report, "depot summary https", || summary(&args, &code, &cache, true));
            }
            step(&mut report, "CM job after depot", || rt.block_on(cm::pics(&c)).map(|b| format!("{} B appinfo", b.len())));
            step(&mut report, "fresh CM connect after depot", || {
                rt.block_on(async { cm::connect().await.map(|_| "ok".to_string()) })
            });
            step(&mut report, "bare reqwest GET at end", bare_get);
        }
        other => {
            eprintln!("unknown arm {other}");
            std::process::exit(64);
        }
    }
    report["provider_at_end"] = provider();
    println!("{}", serde_json::to_string_pretty(&report).unwrap());
}

#[cfg(feature = "vent")]
thread_local! {
    static CONN: std::cell::RefCell<Option<(steam_vent::Connection, Value, String)>> = const { std::cell::RefCell::new(None) };
}
